import { useEffect, useRef, useState } from "react";
import type { Interview, ServiceStatus } from "../shared/types";
import { api, send } from "./api";
import { ErrorBox } from "./ui";
export function RoomConversation({
  interview: i,
  candidate,
  active,
  services,
  reload,
  permissionDialog,
  onRecordingChange,
}: {
  interview: Interview;
  candidate: boolean;
  active: boolean;
  services: ServiceStatus | null;
  reload: () => Promise<void>;
  permissionDialog: <T>(work: () => Promise<T>) => Promise<T>;
  onRecordingChange: (recording: boolean) => void;
}) {
  const [index, setIndex] = useState(0),
    [text, setText] = useState(""),
    [mode, setMode] = useState<"typed" | "spoken">("typed"),
    [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [override, setOverride] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    alive = useRef(true);
  const current = useRef(active);
  current.current = active;
  const question = i.questions[index],
    answer = i.answers.find((a) => a.questionId === question?.id);
  useEffect(() => {
    onRecordingChange(recording);
  }, [recording, onRecordingChange]);
  useEffect(() => {
    setText("");
    setMode("typed");
    setReviewed(false);
    setOverride("");
  }, [question?.id]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!active) {
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    }
  }, [active]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function speech() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    await action(async () => {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("Audio recording is unavailable. Use a typed answer.");
      const audio = await permissionDialog(() =>
        navigator.mediaDevices.getUserMedia({ audio: true }),
      );
      if (!alive.current || !current.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      const mimeType = ["audio/webm", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      if (!mimeType) {
        audio.getTracks().forEach((t) => t.stop());
        throw new Error("This browser cannot record a supported audio format.");
      }
      const media = new MediaRecorder(audio, { mimeType }),
        chunks: BlobPart[] = [];
      recorder.current = media;
      media.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      media.onstop = () => {
        audio.getTracks().forEach((t) => t.stop());
        clearTimeout(timer.current);
        if (!alive.current || !current.current) return;
        setRecording(false);
        void action(async () => {
          const body = new FormData();
          body.append(
            "audio",
            new Blob(chunks, { type: mimeType }),
            mimeType.includes("mp4") ? "answer.m4a" : "answer.webm",
          );
          const result = await api<{ text: string }>(
            `/interviews/${i._id}/transcribe`,
            { method: "POST", body },
          );
          if (alive.current) {
            setText(result.text);
            setMode("spoken");
            setReviewed(false);
          }
        });
      };
      media.onerror = () => {
        audio.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setError("Audio capture stopped. Retry or use a typed answer.");
      };
      media.start();
      setRecording(true);
      timer.current = setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, 120000);
    });
  }
  return (
    <section>
      <h2>Interview conversation</h2>
      <p>
        Keep your conversation, resume, and code together. Opening these panels
        does not count as leaving the interview page.
      </p>
      <ErrorBox message={error} />
      {!candidate && (
        <button
          className="btn secondary"
          disabled={busy || !services?.ai || !active}
          onClick={() =>
            void action(async () => {
              await send(`/interviews/${i._id}/questions`);
              await reload();
            })
          }
        >
          Generate follow-up questions
        </button>
      )}
      {!question ? (
        <p>No interview questions have been added yet.</p>
      ) : (
        <>
          <label className="field">
            Question
            <select
              value={index}
              disabled={recording || busy}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {i.questions.map((q, n) => (
                <option key={q.id} value={n}>
                  {n + 1}. {q.topic}
                </option>
              ))}
            </select>
          </label>
          <h3>{question.text}</h3>
          {!candidate && (
            <details>
              <summary>Evaluation rubric</summary>
              <ul>
                {question.rubric.map((r, n) => (
                  <li key={n}>{r}</li>
                ))}
              </ul>
            </details>
          )}
          {answer ? (
            <>
              <h3>Candidate’s answer</h3>
              <p className="meeting-answer">{answer.text}</p>
              {!candidate && (
                <>
                  <button
                    className="btn secondary"
                    disabled={busy || !services?.ai}
                    onClick={() =>
                      void action(async () => {
                        await send(
                          `/interviews/${i._id}/answers/${question.id}/assess`,
                        );
                        await reload();
                      })
                    }
                  >
                    Assess answer with AI
                  </button>
                  {answer.feedback && (
                    <div className="meeting-notice">
                      <p>{answer.feedback.feedback}</p>
                      <p>
                        Correctness:{" "}
                        {answer.feedback.correctness ?? "Not assessed"} ·
                        Completeness:{" "}
                        {answer.feedback.completeness ?? "Not assessed"}
                      </p>
                      <p>{answer.feedback.uncertainty}</p>
                    </div>
                  )}
                  <label className="field">
                    Human evaluation
                    <textarea
                      value={override || answer.override || ""}
                      onChange={(e) => setOverride(e.target.value)}
                      maxLength={6000}
                    />
                  </label>
                  <button
                    className="btn secondary"
                    disabled={busy || override.trim().length < 5}
                    onClick={() =>
                      void action(async () => {
                        await send(
                          `/interviews/${i._id}/answers/${question.id}/override`,
                          { override },
                          "PATCH",
                        );
                        await reload();
                      })
                    }
                  >
                    Save evaluation
                  </button>
                </>
              )}
            </>
          ) : candidate ? (
            <>
              <label className="field">
                Your answer
                <textarea
                  rows={6}
                  value={text}
                  maxLength={12000}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              {services?.transcription && (
                <button
                  className="btn secondary"
                  disabled={busy || !active}
                  onClick={() => void speech()}
                >
                  {recording
                    ? "Stop recording and transcribe"
                    : "Record a spoken answer"}
                </button>
              )}
              {recording && (
                <p role="status">
                  ● Recording your spoken answer (maximum two minutes)
                </p>
              )}
              {mode === "spoken" && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed the transcript for accuracy.
                </label>
              )}
              <button
                className="btn primary"
                disabled={
                  busy ||
                  recording ||
                  !active ||
                  !text.trim() ||
                  (mode === "spoken" && !reviewed)
                }
                onClick={() =>
                  void action(async () => {
                    await send(`/interviews/${i._id}/answers`, {
                      questionId: question.id,
                      text,
                      mode,
                      transcriptionReviewed: mode === "typed" || reviewed,
                    });
                    await reload();
                  })
                }
              >
                Submit answer
              </button>
            </>
          ) : (
            <p>Waiting for a candidate answer.</p>
          )}
        </>
      )}
    </section>
  );
}
