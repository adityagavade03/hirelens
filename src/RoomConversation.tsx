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
    alive = useRef(true),
    speechVersion = useRef(0);
  const current = useRef(active);
  current.current = active;
  const question = i.questions[index],
    answer = i.answers.find((a) => a.questionId === question?.id);
  const questionId = useRef(question?.id);
  questionId.current = question?.id;
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
      ++speechVersion.current;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!active) {
      ++speechVersion.current;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
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
      const version = ++speechVersion.current;
      const requestedQuestion = question?.id;
      const currentCapture = () =>
        alive.current &&
        current.current &&
        version === speechVersion.current &&
        questionId.current === requestedQuestion;
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("Audio recording is unavailable. Use a typed answer.");
      const audio = await permissionDialog(() =>
        navigator.mediaDevices.getUserMedia({ audio: true }),
      );
      if (!currentCapture()) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      let media: MediaRecorder | null = null;
      let captureTimer: ReturnType<typeof setTimeout> | undefined;
      const release = () => {
        audio.getTracks().forEach((t) => t.stop());
        if (stream.current === audio) stream.current = null;
        if (recorder.current === media) recorder.current = null;
        clearTimeout(captureTimer);
        if (timer.current === captureTimer) timer.current = undefined;
      };
      try {
        const mimeType = ["audio/webm", "audio/mp4"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        );
        if (!mimeType) {
          throw new Error(
            "This browser cannot record a supported audio format.",
          );
        }
        media = new MediaRecorder(audio, { mimeType });
        const capture = media;
        const chunks: BlobPart[] = [];
        let failed = false;
        recorder.current = media;
        media.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        media.onstop = () => {
          release();
          if (alive.current && version === speechVersion.current)
            setRecording(false);
          if (failed || !currentCapture()) return;
          if (!chunks.length) {
            setError(
              "No audio was captured. Check your microphone and try again, or use a typed answer.",
            );
            return;
          }
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
            if (currentCapture()) {
              setText(result.text);
              setMode("spoken");
              setReviewed(false);
            }
          });
        };
        media.onerror = () => {
          failed = true;
          release();
          if (capture.state !== "inactive") {
            try {
              capture.stop();
            } catch {
              /* The browser may already be stopping. */
            }
          }
          if (alive.current && version === speechVersion.current) {
            setRecording(false);
            setError("Audio capture stopped. Retry or use a typed answer.");
          }
        };
        media.start();
        setRecording(true);
        captureTimer = setTimeout(() => {
          if (capture.state === "recording") capture.stop();
        }, 120000);
        timer.current = captureTimer;
      } catch (error) {
        release();
        throw error;
      }
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
                  disabled={recording || busy}
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
