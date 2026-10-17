import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api, send, useResource, dateLabel } from "./api";
import { ErrorBox, Notice, Panel } from "./ui";
import type { Interview, ServiceStatus } from "../shared/types";
import { useAuth } from "./auth-context";
import { SpeakerReview } from "./SpeakerReview";

type Clip = {
  _id: string;
  ownerId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  offsetMs: number;
  durationMs: number;
  transcript: string;
  transcriptState: string;
  transcriptError?: string;
  reviewedAt?: string;
};
export function MediaReview({
  interviewId,
  version = 0,
  locked = false,
  onChange,
}: {
  interviewId: string;
  version?: number;
  locked?: boolean;
  onChange?: () => void;
}) {
  const { user } = useAuth();
  const clips = useResource<Clip[]>(`/interviews/${interviewId}/media`, []);
  const [selected, setSelected] = useState<string>(""),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const clip = clips.data.find((c) => c._id === selected);
  useEffect(() => {
    if (version) void clips.reload();
  }, [version]);
  useEffect(() => {
    setDraft(clip?.transcript || "");
  }, [clip?._id, clip?.transcript]);
  useEffect(() => setPlaybackError(""), [clip?._id]);
  async function update(transcribe: boolean) {
    if (!clip) return;
    setBusy(true);
    setError("");
    try {
      if (transcribe) await send(`/media/${clip._id}/transcribe`);
      else
        await send(
          `/media/${clip._id}/transcript`,
          {
            transcript: draft,
            reviewed: true,
            expectedUpdatedAt: clip.updatedAt,
          },
          "PATCH",
        );
      await clips.reload();
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
      // Failed recognition still changes the server revision. Keep any manual
      // draft while refreshing the version required for a reviewed save.
      if (transcribe) await clips.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Recording & transcript"
      description="Separate, consented device tracks. Each segment is independently playable."
    >
      <div className="panel-form">
        <ErrorBox message={error || clips.error} />
        <Notice>
          Speaker labels identify the signed-in participant's microphone, not a
          verified person. Background voices may be captured. Review
          transcription errors before using the text as evidence. Only reviewed
          candidate text enters AI assessment.
        </Notice>
        <button className="btn secondary" onClick={() => void clips.reload()}>
          Refresh recordings
        </button>
        {!clips.data.length && (
          <p>
            No recording segments saved. Recording is optional and starts only
            after explicit consent in the room.
          </p>
        )}
        {!!clips.data.length && (
          <label className="field">
            Recording segment
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a segment</option>
              {clips.data.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.role} · {dateLabel(c.createdAt)} ·{" "}
                  {Math.round(c.durationMs / 1000)}s ·{" "}
                  {c.reviewedAt ? "Reviewed" : c.transcriptState}
                </option>
              ))}
            </select>
          </label>
        )}
        {clip && (
          <div>
            <video
              key={clip._id}
              controls
              playsInline
              preload="metadata"
              src={`/api/media/${clip._id}/play`}
              onError={() =>
                setPlaybackError(
                  "This recording segment could not be played. Check your connection and refresh recordings, or try a browser that supports this recording format.",
                )
              }
              style={{
                width: "100%",
                maxHeight: 380,
                background: "var(--media-bg)",
                borderRadius: 12,
              }}
            />
            <ErrorBox message={playbackError} />
            <ErrorBox message={clip.transcriptError || ""} />
            <label className="field">
              Transcript
              <textarea
                rows={6}
                value={draft}
                disabled={locked || busy}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Transcribe the segment, or type and review what was said."
              />
            </label>
            <div className="form-actions">
              <button
                className="btn secondary"
                disabled={busy || locked || !!clip.reviewedAt}
                onClick={() => void update(true)}
              >
                {["ready", "failed"].includes(clip.transcriptState)
                  ? "Retry transcription"
                  : "Transcribe segment"}
              </button>
              <button
                className="btn primary"
                disabled={busy || locked}
                onClick={() => void update(false)}
              >
                Save reviewed transcript
              </button>
            </div>
            {locked && (
              <p>
                The report is finalized. Reopen it to edit transcript evidence.
              </p>
            )}
            {clip.role === "candidate" && (
              <SpeakerReview
                key={`speaker:${clip._id}`}
                clipId={clip._id}
                owner={user?.role === "candidate" && clip.ownerId === user._id}
                locked={locked}
              />
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function InterviewCapture({
  interview,
  stream,
  active,
  services,
  stopRef,
  onRecordingChange,
}: {
  interview: Interview;
  stream: MediaStream | null;
  active: boolean;
  services: ServiceStatus | null;
  stopRef: MutableRefObject<(() => Promise<void>) | null>;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [version, setVersion] = useState(0),
    [pending, setPending] = useState(0);
  const state = useRef<{
    captureId: string;
    start: number;
    sequence: number;
    running: boolean;
    recorder?: MediaRecorder;
    timer?: number;
    stopped?: Promise<void>;
  } | null>(null);
  const queue = useRef<{ form: FormData; captureId: string }[]>([]),
    pumping = useRef<Promise<void> | null>(null);
  const startVersion = useRef(0);
  const inputs = useRef({ active, stream, accepted });
  inputs.current = { active, stream, accepted };
  const stopping = useRef<Promise<void> | null>(null);
  const transcription = useRef(Promise.resolve());
  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);
  const mounted = useRef(true);
  async function drain() {
    if (pumping.current) return pumping.current;
    pumping.current = (async () => {
      while (queue.current.length) {
        const item = queue.current[0];
        const clip = await api<Clip>(`/captures/${item.captureId}/clips`, {
          method: "POST",
          body: item.form,
        });
        queue.current.shift();
        if (mounted.current) {
          setPending(queue.current.length);
          setVersion((v) => v + 1);
          setStatus("Recording segment saved.");
        }
        if (services?.transcription)
          transcription.current = transcription.current.then(async () => {
            try {
              await send(`/media/${clip._id}/transcribe`);
              if (mounted.current) setVersion((v) => v + 1);
            } catch {
              if (mounted.current)
                setStatus(
                  "Recording saved. A transcript needs retry or manual review.",
                );
            }
          });
      }
    })();
    try {
      await pumping.current;
    } finally {
      pumping.current = null;
    }
  }
  async function stop() {
    ++startVersion.current;
    if (stopping.current) return stopping.current;
    const work = (async () => {
      const s = state.current;
      if (s) {
        s.running = false;
        clearTimeout(s.timer);
        if (s.recorder && s.recorder.state !== "inactive") s.recorder.stop();
        if (mounted.current) setRecording(false);
        await s.stopped;
      }
      await drain();
      if (s) await send(`/captures/${s.captureId}/stop`);
      if (state.current === s) state.current = null;
    })();
    stopping.current = work;
    try {
      await work;
    } finally {
      if (stopping.current === work) stopping.current = null;
    }
  }
  stopRef.current = stop;
  useEffect(() => {
    if (!active || state.current)
      void stop().catch((e) => {
        if (mounted.current) setError(e.message);
      });
  }, [active, stream]);
  useEffect(() => {
    mounted.current = true;
    const warn = (e: BeforeUnloadEvent) => {
      if (state.current?.running || queue.current.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", warn);
      void stop().catch(() => {});
      stopRef.current = null;
    };
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      if (!accepted || !inputs.current.active || !mounted.current) return;
      if (
        !stream?.getTracks().some((t) => t.readyState === "live") ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Enable your camera and microphone in the device check first. This browser must support recording.",
        );
      if (queue.current.length || state.current) await stop();
      const hasVideo = stream
        .getVideoTracks()
        .some((t) => t.readyState === "live");
      const mime = (
        hasVideo
          ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
          : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      ).find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime)
        throw new Error("This browser does not support WebM or MP4 recording.");
      const version = ++startVersion.current;
      const capture = await send<{ _id: string }>(
        `/interviews/${interview._id}/captures`,
        { accepted },
      );
      if (
        !mounted.current ||
        !inputs.current.active ||
        !inputs.current.accepted ||
        inputs.current.stream !== stream ||
        version !== startVersion.current
      ) {
        await send(`/captures/${capture._id}/stop`);
        if (mounted.current)
          setStatus("Recording was cancelled before it started.");
        return;
      }
      const s = {
        captureId: capture._id,
        start: Date.now(),
        sequence: 0,
        running: true,
      } as NonNullable<typeof state.current>;
      state.current = s;
      const segment = () => {
        if (!s.running) return;
        if (!stream.getTracks().some((t) => t.readyState === "live")) {
          s.running = false;
          if (mounted.current) {
            setRecording(false);
            setStatus(
              "Device recording ended. Saved segments remain available.",
            );
          }
          void stop().catch((e) => {
            if (mounted.current) setError(e.message);
          });
          return;
        }
        if (s.sequence >= 360 || queue.current.length >= 3) {
          s.running = false;
          setRecording(false);
          setError(
            "Recording paused at its limit or because uploads are behind. Save pending segments before restarting.",
          );
          return;
        }
        const media = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 300000,
          audioBitsPerSecond: 32000,
        });
        const chunks: BlobPart[] = [],
          began = Date.now(),
          seq = s.sequence++;
        let resolveStop!: () => void;
        s.stopped = new Promise<void>((resolve) => {
          resolveStop = resolve;
        });
        s.recorder = media;
        media.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        media.onerror = () => {
          s.running = false;
          if (mounted.current) {
            setRecording(false);
            setError(
              "The browser stopped recording. Saved segments remain available.",
            );
          }
        };
        media.onstop = () => {
          clearTimeout(s.timer);
          const blob = new Blob(chunks, { type: mime.split(";")[0] }),
            duration = Date.now() - began;
          if (blob.size && duration > 0) {
            const form = new FormData();
            form.append(
              "clip",
              blob,
              mime.includes("mp4") ? "segment.mp4" : "segment.webm",
            );
            form.append("sequence", String(seq));
            form.append("offsetMs", String(began - s.start));
            form.append("durationMs", String(duration));
            queue.current.push({ form, captureId: s.captureId });
            if (mounted.current) setPending(queue.current.length);
            void drain().catch((e) => {
              s.running = false;
              if (s.recorder?.state === "recording") s.recorder.stop();
              if (mounted.current) {
                setRecording(false);
                setError(`${e.message} Keep this page open and retry saving.`);
              }
            });
          }
          resolveStop();
          if (s.running && mounted.current) {
            try {
              segment();
            } catch (e) {
              s.running = false;
              setRecording(false);
              setError((e as Error).message);
            }
          }
        };
        try {
          media.start();
        } catch (e) {
          s.running = false;
          resolveStop();
          throw e;
        }
        s.timer = window.setTimeout(() => {
          if (media.state === "recording") media.stop();
        }, 30000);
      };
      segment();
      if (s.running && mounted.current) {
        setRecording(true);
        setStatus(
          hasVideo
            ? "Recording your own camera and microphone. Saving about every 30 seconds."
            : "Recording your own microphone. Saving about every 30 seconds.",
        );
      }
    } catch (e) {
      if (state.current) await stop().catch(() => {});
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="panel-form">
      <Notice>
        Optional recording stores your camera and microphone on the HireLens
        server. The assigned interviewer and company can review hiring
        recordings; personal practice stays private. Each participant must start
        their own recording. Nothing captures the other participant's device
        automatically. Short gaps can occur between segments or during
        interruptions.
      </Notice>
      <ErrorBox message={error} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={accepted}
          disabled={recording}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        I consent to saving my device recording and processing it for
        transcription and interview review.
      </label>
      <div className="form-actions">
        <button
          className="btn primary"
          disabled={!active || !accepted || recording || busy}
          onClick={() => void start()}
        >
          Start my recording
        </button>
        <button
          className="btn secondary"
          disabled={busy || (!recording && !pending && !state.current)}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await stop();
              setStatus("Recording stopped. All captured segments saved.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Stop & save / retry
        </button>
      </div>
      <p role="status">
        {recording ? "● Recording · " : ""}
        {status} {pending ? `${pending} segment(s) waiting to save.` : ""}
      </p>
      {!services?.transcription && (
        <p>
          Automatic transcription needs a speech service. Saved recordings can
          be transcribed later or reviewed manually.
        </p>
      )}
      <MediaReview interviewId={interview._id} version={version} />
    </div>
  );
}

export function SimilarityPanel({ interviewId }: { interviewId: string }) {
  const result = useResource<{
    status: string;
    compared: number;
    matches: { score: number; sharedPatterns: number; interviewId?: string }[];
    limitation: string;
    scope?: string;
  } | null>(`/interviews/${interviewId}/similarity`, null);
  return (
    <Panel
      title="Code similarity review"
      description="Compare submitted code with other candidates for the same company and problem."
    >
      <div className="panel-form">
        <ErrorBox message={result.error} />
        {result.data && (
          <>
            <Notice>{result.data.limitation}</Notice>
            <p>
              {result.data.compared} comparable solutions · {result.data.status}
            </p>
            <p>{result.data.scope}</p>
            {result.data.matches.map((m, n) => (
              <p key={n}>
                Match {n + 1}: {m.score}% token-pattern overlap (
                {m.sharedPatterns} shared patterns).{" "}
                {m.interviewId && (
                  <a className="text-link" href={`/room/${m.interviewId}`}>
                    Review authorized interview
                  </a>
                )}
              </p>
            ))}
            {result.data.status === "checked" &&
              !result.data.matches.length && (
                <p>
                  No comparison met the 70% review threshold. This does not
                  establish originality.
                </p>
              )}
          </>
        )}
      </div>
    </Panel>
  );
}
