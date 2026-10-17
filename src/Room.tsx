import { ThemeToggle } from "./theme";
import { codingLanguages } from "../shared/languages";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveCall } from "./live-call";
import { useInterviewDevices } from "./interview-devices";
import { MediaVideo, MicrophoneLevel, LiveMonitoring } from "./RoomMedia";
import {
  ArrowLeft,
  ArrowRight,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Code2,
  MessageSquare,
  FileText,
  Play,
  Send,
  Check,
  Clock,
  Sparkles,
  ShieldCheck,
  Maximize2,
  RefreshCw,
  Volume2,
  Square,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import type {
  Interview,
  Problem,
  Submission,
  ServiceStatus,
  Feedback,
  Report,
} from "../shared/types";
import { useAuth } from "./auth-context";
import { api, send, useResource, dateLabel } from "./api";
import {
  Badge,
  Status,
  ErrorBox,
  Loading,
  Notice,
  Field,
  Avatar,
  Modal,
} from "./ui";
import { useMonitoring } from "./monitoring";
import { InterviewCapture } from "./InterviewMedia";
import { CodeExecutionNotice } from "./CodeExecutionNotice";
const Editor = lazy(() => import("./CodingEditor"));
const HumanRoom = lazy(() => import("./HumanRoom"));
const InPersonRoom = lazy(() => import("./InPersonRoom"));
export default function Room() {
  const { id } = useParams();
  const interview = useResource<Interview | null>(`/interviews/${id}`, null);
  if (interview.loading) return <Loading />;
  if (!interview.data)
    return <ErrorBox message={interview.error || "Interview unavailable."} />;
  if (interview.data.mode === "in_person")
    return (
      <Suspense fallback={<Loading />}>
        <InPersonRoom key={id} />
      </Suspense>
    );
  if (interview.data.type !== "practice" && interview.data.facilitator !== "ai")
    return (
      <Suspense fallback={<Loading />}>
        <HumanRoom key={id} id={id!} />
      </Suspense>
    );
  return <LegacyRoom />;
}
function LegacyRoom() {
  const { id } = useParams();
  const interviewId = id!;
  const { user } = useAuth();
  const navigate = useNavigate();
  const record = useResource<Interview | null>(`/interviews/${id}`, null);
  const service = useResource<ServiceStatus | null>("/services", null);
  const problemData = useResource<Problem | null>(
    `/interviews/${id}/problem`,
    null,
  );
  const history = useResource<Submission[]>(
    `/interviews/${id}/submissions`,
    [],
  );
  const [joined, setJoined] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("questions");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<"typed" | "spoken">("typed");
  const [reviewed, setReviewed] = useState(false);
  const [language, setLanguage] = useState("python");
  const [executionLanguages, setExecutionLanguages] = useState<string[]>([]);
  const [languageError, setLanguageError] = useState("");
  const [code, setCode] = useState("");
  const localDrafts = useRef<Record<string, string>>({});
  const [stdin, setStdin] = useState("4 7");
  const [draftStatus, setDraftStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [now, setNow] = useState(Date.now());
  const [ending, setEnding] = useState(false);
  const [recording, setRecording] = useState(false);
  const stopCapture = useRef<(() => Promise<void>) | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const recordingTimeout = useRef<number | undefined>(undefined);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const [faceState, setFaceState] = useState("");
  const interview = record.data;
  const practice = interview?.type === "practice";
  const publicDemoBlocked = !!service.data?.codePublicDemo && !practice;
  const manager = user.role === "hr" || practice;
  const aiLed = interview?.facilitator === "ai";
  const candidate = user.role === "candidate";
  const active = joined && interview?.status === "live";
  const activeRef = useRef(active);
  activeRef.current = active;
  const problem = problemData.data;
  const savedDraft = interview?.drafts?.[language];
  // Viewers follow each refreshed snapshot; candidate edits stay local until saved.
  const editorCode = candidate
    ? code
    : (savedDraft ?? problem?.starter[language] ?? "");
  const question = interview?.questions[questionIndex];
  const submitted = interview?.answers.find(
    (a) => a.questionId === question?.id,
  );
  const monitoring = useMonitoring(
    interviewId,
    !!(active && candidate && !practice && consent),
    videoElement,
    service.data,
    setFaceState,
  );
  const event = monitoring.record;
  const devices = useInterviewDevices(event);
  const { stream, screen, camera, mic, message: deviceMessage } = devices;
  const call = useLiveCall({
    id: interviewId,
    active: !!active && !practice,
    candidate,
    stream,
    screen,
    media: { camera, microphone: mic, screen: !!screen },
    record: event,
  });
  const { remote, remoteScreen, remoteMedia, connection } = call;
  monitoring.setConnection(connection);
  useEffect(() => {
    let live = true;
    setExecutionLanguages([]);
    setLanguageError("");
    if (service.data?.code)
      void api<{ key: string }[]>("/languages")
        .then((rows) => {
          if (live) setExecutionLanguages(rows.map((row) => row.key));
        })
        .catch((e) => {
          if (live) setLanguageError(e.message);
        });
    return () => {
      live = false;
    };
  }, [service.data?.code]);
  useEffect(() => {
    if (
      interview?.status === "completed" ||
      interview?.status === "cancelled"
    ) {
      devices.stop();
      audioStream.current?.getTracks().forEach((t) => t.stop());
      clearTimeout(recordingTimeout.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      setRecording(false);
    }
  }, [interview?.status]);

  useEffect(() => {
    if (interview && !joined) {
      setNotes(interview.notes || "");
    }
  }, [interview?._id]);
  useEffect(() => {
    if (videoElement) {
      videoElement.srcObject = stream;
      void videoElement.play().catch(() => {});
    }
  }, [videoElement, stream]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(() => {
      void record.reload();
      if (!candidate) void history.reload();
    }, 8000);
    return () => clearInterval(timer);
  }, [joined, candidate, record.reload, history.reload]);
  useEffect(() => {
    setAnswer("");
    setMode("typed");
    setReviewed(false);
  }, [question?.id]);
  useEffect(() => {
    if (candidate && problem && interview)
      setCode(
        localDrafts.current[language] ??
          interview.drafts?.[language] ??
          problem.starter[language] ??
          "",
      );
  }, [candidate, language, problem?.id, interview?._id]);
  useEffect(() => {
    if (!active || !candidate) return;
    setDraftStatus("Unsaved");
    const timer = setTimeout(() => {
      send(`/interviews/${id}/draft`, { language, code }, "PATCH")
        .then(() => setDraftStatus("Saved"))
        .catch(() => setDraftStatus("Could not save · keep this tab open"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, language, active, candidate, id]);
  useEffect(
    () => () => {
      activeRef.current = false;
      audioStream.current?.getTracks().forEach((t) => t.stop());
      clearTimeout(recordingTimeout.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );
  async function checkDevices(audioOnly = false) {
    await action("devices", async () => {
      await stopCapture.current?.();
      await monitoring.permissionDialog(() => devices.check(audioOnly));
    });
  }
  async function action(name: string, work: () => Promise<unknown>) {
    setBusy(name);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function join() {
    await action("join", async () => {
      if (candidate && !practice) {
        if (!consent)
          throw new Error("Accept the monitoring notice before joining.");
        await send(`/interviews/${id}/consent`, { accepted: true });
      }
      const data = await send<Interview>(`/interviews/${id}/start`);
      record.setData(data);
      setJoined(true);
    });
  }
  async function submitAnswer() {
    if (!question) return;
    await action("answer", async () => {
      await send(`/interviews/${id}/answers`, {
        questionId: question.id,
        text: answer,
        mode,
        transcriptionReviewed: mode === "typed" || reviewed,
      });
      await record.reload();
      if (aiLed) await nextAiQuestion();
    });
  }
  async function nextAiQuestion() {
    const result = await send<{
      question?: { id: string; text: string };
      complete: boolean;
    }>(`/interviews/${id}/ai/next`);
    const updated = await api<Interview>(`/interviews/${id}`);
    await record.reload();
    if (result.question)
      setQuestionIndex(
        Math.max(
          0,
          updated.questions.findIndex((q) => q.id === result.question!.id),
        ),
      );
  }
  async function transcribe() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      clearTimeout(recordingTimeout.current);
      return;
    }
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Audio recording is unavailable in this browser. Use typed answers or open the secure link in a supported browser.",
        );
      const capture = await monitoring.permissionDialog(() =>
        navigator.mediaDevices.getUserMedia({ audio: true }),
      );
      if (!activeRef.current) {
        capture.getTracks().forEach((t) => t.stop());
        return;
      }
      audioStream.current = capture;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const media = new MediaRecorder(capture, { mimeType: mime });
      recorder.current = media;
      const chunks: BlobPart[] = [];
      media.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      media.onstop = async () => {
        capture.getTracks().forEach((t) => t.stop());
        if (!activeRef.current) return;
        setRecording(false);
        clearTimeout(recordingTimeout.current);
        const form = new FormData();
        form.append(
          "audio",
          new Blob(chunks, { type: mime }),
          mime.includes("mp4") ? "answer.m4a" : "answer.webm",
        );
        await action("transcribe", async () => {
          const result = await api<{ text: string }>(
            `/interviews/${id}/transcribe`,
            { method: "POST", body: form },
          );
          setAnswer(result.text);
          setMode("spoken");
          setReviewed(false);
        });
      };
      media.start();
      setRecording(true);
      recordingTimeout.current = window.setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, 120000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function end() {
    await action("end", async () => {
      await stopCapture.current?.();
      await monitoring.flush();
      const report = await send<Report>(`/interviews/${id}/end`);
      setJoined(false);
      devices.stop();
      navigate(
        candidate && !practice ? "/interviews" : `/reports/${report._id}`,
      );
    });
  }
  if (record.loading || problemData.loading) return <Loading />;
  if (!interview)
    return (
      <div className="room-error">
        <Link to="/interviews" className="back-link">
          <ArrowLeft size={16} />
          Back to interviews
        </Link>
        <ErrorBox message={record.error} />
      </div>
    );
  const elapsed = interview.startedAt
    ? Math.max(
        0,
        Math.floor((now - new Date(interview.startedAt).getTime()) / 1000),
      )
    : 0;
  const remaining = Math.max(0, interview.duration * 60 - elapsed);
  const timer = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
  if (!joined && interview.status !== "completed")
    return (
      <div className="preflight-page">
        <div className="preflight-appearance">
          <ThemeToggle />
        </div>
        <Link to={practice ? "/practice" : "/interviews"} className="back-link">
          <ArrowLeft size={16} />
          Back to {practice ? "practice studio" : "interviews"}
        </Link>
        <div className="preflight-heading">
          <Badge tone="green">
            {practice ? "YOUR PERSONAL PRACTICE" : "YOUR INTERVIEW ROOM"}
          </Badge>
          <h1>A moment to get ready.</h1>
          <p>
            {interview.jobTitle} · {interview.duration} minutes ·{" "}
            {interview.difficulty}
          </p>
        </div>
        <div className="preflight-grid">
          <div>
            <div className="video-preview">
              <video ref={setVideoElement} muted autoPlay playsInline />
              {!stream && (
                <div className="video-placeholder">
                  <Avatar name={user.name} size="large" />
                  <span>Your camera preview</span>
                </div>
              )}
              <Badge>{stream ? "Camera preview" : "Camera off"}</Badge>
            </div>
            <div className="device-check">
              <p>{deviceMessage}</p>
              <MicrophoneLevel stream={stream} muted={!mic} />
              <button
                className="btn secondary"
                disabled={!!busy}
                onClick={() => void checkDevices()}
              >
                <Video size={16} />
                {busy === "devices" ? "Checking…" : "Check camera & microphone"}
              </button>
              <button
                className="btn secondary"
                disabled={!!busy}
                onClick={() => void checkDevices(true)}
              >
                Use microphone only
              </button>
            </div>
          </div>
          <div className="preflight-info">
            <h2>
              {practice
                ? "A space to try. Room to grow."
                : "Ready for a great conversation."}
            </h2>
            <p>
              {practice
                ? "Start with technical question templates and a coding exercise. You can generate tailored questions and feedback when an AI provider is connected."
                : "Use a stable internet connection and keep this tab open. Your submitted work is saved as you go."}
            </p>
            <div className="check-item">
              <MessageSquare size={20} />
              <div>
                <strong>Make your thinking visible</strong>
                <p>
                  Explain your approach with typed or reviewed spoken answers.
                </p>
              </div>
            </div>
            <div className="check-item">
              <Code2 size={20} />
              <div>
                <strong>Put your skills into practice</strong>
                <p>Write code in Python, JavaScript, Java, C, or C++.</p>
              </div>
            </div>
            {!practice && candidate && (
              <div className="consent-box">
                <h3>
                  <ShieldCheck size={18} />
                  Monitoring notice
                </h3>
                <p>
                  During this interview, HireLens records focus, visibility,
                  fullscreen, copy/paste, device availability, screen-sharing
                  status and connection events. Sharing starts only when you
                  select a screen and is visible to the interviewer. If face
                  detection is configured, sustained absence, multiple faces or
                  coarse head turns produces metadata events. Face detection
                  runs locally. The optional Recording tab stores your device
                  track only after you explicitly start recording and accept its
                  separate notice.
                </p>
                <p>
                  These events cannot identify external applications or prove
                  cheating. HR reviews them separately from your technical work.
                  Microphone recordings are sent for transcription only when you
                  explicitly record an answer or start the optional session
                  recording.
                </p>
                <p>
                  Tab departures are logged with return times and durations. You
                  receive a reminder on return; {monitoring.warningThreshold}{" "}
                  departures trigger a repeated-activity review notice. Tell HR
                  about technical issues or accommodations.
                </p>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I understand and consent to this monitoring.
                </label>
              </div>
            )}
            {practice && (
              <Notice>
                Practice results stay in your personal workspace. Browser and
                face monitoring are not enabled for practice sessions.
              </Notice>
            )}
            <ErrorBox message={error} />
            {!candidate && interview.interviewerId !== user._id && (
              <Notice>
                This session is assigned to another interviewer. Sign in as that
                interviewer, or update the assignment from Interviews before
                joining.
              </Notice>
            )}
            <button
              className="btn primary start-session"
              onClick={join}
              disabled={
                !!busy ||
                (!practice && candidate && !consent) ||
                (!candidate && interview.interviewerId !== user._id) ||
                interview.status === "cancelled"
              }
            >
              {busy === "join"
                ? "Opening session…"
                : practice
                  ? "Start my practice"
                  : "Join interview"}
              <ArrowRight size={18} />
            </button>
            <small className="muted">
              {!practice
                ? `Scheduled ${dateLabel(interview.scheduledAt)}`
                : "Camera is optional. Typed practice is always available."}
            </small>
          </div>
        </div>
      </div>
    );
  return (
    <div className="room-shell">
      <header className="room-topbar">
        <Link
          to={practice ? "/practice" : "/interviews"}
          className="room-back"
          aria-label="Leave room"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="room-title">
          <strong>{interview.jobTitle}</strong>
          <span>
            {practice
              ? "Personal practice studio"
              : `${interview.candidateName} · ${interview.companyName}`}
          </span>
        </div>
        <Badge tone={active ? "green" : "neutral"}>
          {interview.status === "completed"
            ? "Session completed"
            : practice
              ? "Practice session"
              : "Live interview"}
        </Badge>
        <ThemeToggle />
        <div className="room-timer">
          <Clock size={17} />
          {interview.status === "completed" ? "Ended" : timer}
        </div>
        {(manager || (candidate && aiLed)) &&
          interview.status !== "completed" && (
            <button
              className="btn danger-outline"
              onClick={() => setEnding(true)}
            >
              <PhoneOff size={16} />
              Finish session
            </button>
          )}
        {interview.status === "completed" && (
          <Link to="/reports" className="btn primary">
            View reports
            <ArrowUpRightIcon />
          </Link>
        )}
      </header>
      {candidate && active && !practice && monitoring.warning && (
        <div className="notice" role="alert">
          {monitoring.warning}
          <button className="btn secondary" onClick={monitoring.dismissWarning}>
            Dismiss
          </button>
        </div>
      )}
      <div className="room-body">
        <aside className="room-video-column">
          <div className="room-video">
            <video ref={setVideoElement} muted autoPlay playsInline />
            {(!stream || !camera) && (
              <div className="video-placeholder">
                <Avatar name={user.name} size="large" />
              </div>
            )}
            <span className="video-name">
              {user.name} <small>(you)</small>
            </span>
            <div className="video-controls">
              <button
                aria-label={mic ? "Mute microphone" : "Unmute microphone"}
                aria-pressed={mic}
                disabled={
                  !active ||
                  !stream?.getAudioTracks().some((t) => t.readyState === "live")
                }
                onClick={() => devices.toggle("audio")}
              >
                {mic ? <Mic size={17} /> : <MicOff size={17} />}
              </button>
              <button
                aria-label={camera ? "Turn camera off" : "Turn camera on"}
                aria-pressed={camera}
                disabled={
                  !active ||
                  !stream?.getVideoTracks().some((t) => t.readyState === "live")
                }
                onClick={() => devices.toggle("video")}
              >
                {camera ? <Video size={17} /> : <VideoOff size={17} />}
              </button>
            </div>
          </div>
          {!practice && (
            <div className="room-video remote">
              <MediaVideo stream={remote} label="Interview video and audio" />
              {(!remote || remoteMedia?.camera === false) && (
                <div className="video-placeholder">
                  <Video size={30} />
                  <span>
                    {remote
                      ? "Participant camera is off"
                      : "Waiting for the other participant"}
                  </span>
                </div>
              )}
              <span className="video-name">
                {candidate ? "Interviewer" : interview.candidateName}
              </span>
            </div>
          )}
          {remoteMedia?.screen && remoteScreen && (
            <div className="room-video shared-screen">
              <MediaVideo
                stream={remoteScreen}
                label="Shared screen"
                muted
                controls
              />
              <span className="video-name">Participant's shared screen</span>
            </div>
          )}
          {screen && (
            <div className="room-video shared-screen">
              <MediaVideo
                stream={screen}
                label="Your shared screen"
                muted
                controls
              />
              <span className="video-name">You are sharing this screen</span>
            </div>
          )}
          {active && (
            <div className="room-media-actions">
              <MicrophoneLevel stream={stream} muted={!mic} />
              <button
                className="btn secondary"
                disabled={!!busy}
                onClick={() => void checkDevices()}
              >
                {busy === "devices" ? "Checking…" : "Check devices"}
              </button>
              <button
                className="btn secondary"
                disabled={!!busy}
                onClick={() => void checkDevices(true)}
              >
                Microphone only
              </button>
              {!practice && (
                <>
                  <button
                    className="btn secondary"
                    disabled={!!busy}
                    onClick={() =>
                      screen
                        ? devices.stopScreen()
                        : void action("screen", () =>
                            monitoring.permissionDialog(() =>
                              devices.shareScreen(),
                            ),
                          )
                    }
                  >
                    {screen ? "Stop sharing" : "Share screen"}
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setError("");
                      call.reconnect();
                    }}
                  >
                    Reconnect video
                  </button>
                </>
              )}
              <p className="muted small" role="status">
                {deviceMessage}
              </p>
              {!!remoteMedia && (
                <p className="muted small">
                  Participant microphone:{" "}
                  {remoteMedia.microphone ? "on" : "muted"}
                </p>
              )}
            </div>
          )}
          {practice && (
            <div className="practice-room-card">
              <div className="practice-room-icon">
                <Sparkles size={25} />
              </div>
              <h3>
                Think out loud.
                <br />
                Find your own flow.
              </h3>
              <p>
                This is your space to work through an idea. It’s okay to pause
                and consider a different approach.
              </p>
            </div>
          )}
          <div className="room-connection">
            <span
              className={`connection-dot ${connection === "connected" ? "connected" : ""}`}
            />
            {interview.status === "completed"
              ? "Session ended"
              : practice
                ? "Personal session"
                : connection}
          </div>
          {!practice && candidate && (
            <small className="monitoring-status">
              <ShieldCheck size={14} />
              <span>
                {active
                  ? faceState || "Starting consented face monitoring…"
                  : "Monitoring stopped"}
                <br />
                {monitoring.delivery}
                <br />
                {monitoring.tabDepartures} tab departures this visit · review
                threshold {monitoring.warningThreshold}
              </span>
            </small>
          )}
          {!practice && candidate && active && (
            <button className="btn secondary" onClick={monitoring.retryFace}>
              Retry face monitoring
            </button>
          )}
          {!service.data?.turn && !practice && (
            <p className="muted small">
              Video may be blocked on some office or mobile networks until the
              administrator connects a relay service.
            </p>
          )}
          <div className="room-agenda">
            <div className="eyebrow">YOUR SESSION</div>
            <h3>A conversation in focus</h3>
            <p>{interview.topics.join(" · ")}</p>
            <div>
              <span>Questions answered</span>
              <strong>
                {interview.answers.length}/{interview.questions.length}
              </strong>
            </div>
            <div>
              <span>Code submissions</span>
              <strong>
                {history.data.filter((s) => s.mode === "submit").length}
              </strong>
            </div>
          </div>
          {active && (
            <button
              className="btn secondary fullscreen-btn"
              onClick={() =>
                document.documentElement.requestFullscreen
                  ? void document.documentElement
                      .requestFullscreen()
                      .catch(() =>
                        setError(
                          "Fullscreen was blocked. You can continue in this window or retry Focus mode.",
                        ),
                      )
                  : setError(
                      "Fullscreen is unavailable in this browser. You can continue in this window.",
                    )
              }
            >
              <Maximize2 size={15} />
              Focus mode
            </button>
          )}
        </aside>
        <main className="room-workspace">
          <ErrorBox message={error || record.error || call.issue} />
          <div className="room-tabs">
            {[
              { id: "questions", label: "Conversation", icon: MessageSquare },
              { id: "code", label: "Coding exercise", icon: Code2 },
              { id: "recordings", label: "Recording", icon: Video },
              ...(!candidate && !practice
                ? [{ id: "monitoring", label: "Monitoring", icon: ShieldCheck }]
                : []),
              ...(manager
                ? [{ id: "notes", label: "My notes", icon: FileText }]
                : []),
            ].map((t) => (
              <button
                className={tab === t.id ? "active" : ""}
                key={t.id}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            ))}
          </div>
          {tab === "monitoring" && !candidate && !practice && (
            <LiveMonitoring
              id={interviewId}
              active={!!active}
              threshold={service.data?.tabSwitchWarningThreshold}
            />
          )}
          <div hidden={tab !== "recordings"}>
            <InterviewCapture
              interview={interview}
              stream={stream}
              active={!!active}
              services={service.data}
              stopRef={stopCapture}
            />
          </div>
          {tab === "questions" && (
            <div className="question-workspace">
              {aiLed && (
                <div className="panel-form">
                  <Badge>AI-assisted interviewer</Badge>
                  {interview.questions.length >= 12 &&
                    interview.answers.length >= interview.questions.length && (
                      <Notice>
                        The question round is complete. Finish any coding work,
                        then use Finish session to create your report.
                      </Notice>
                    )}
                  <p>
                    Answer each question to receive an adaptive follow-up. Up to
                    12 questions; you can finish when ready.
                  </p>
                  {!!interview.aiPlan?.length && (
                    <details>
                      <summary>Interview plan</summary>
                      <ol>
                        {interview.aiPlan.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {active && (
                    <button
                      className="btn secondary"
                      disabled={
                        !!busy ||
                        !service.data?.ai ||
                        (interview.questions.length >= 12 && !!submitted)
                      }
                      onClick={() => action("ai-next", nextAiQuestion)}
                    >
                      {busy === "ai-next"
                        ? "Preparing question…"
                        : "Continue AI interview"}
                    </button>
                  )}
                  {question &&
                    typeof window.speechSynthesis !== "undefined" && (
                      <button
                        className="btn secondary"
                        onClick={() => {
                          window.speechSynthesis.cancel();
                          window.speechSynthesis.speak(
                            new SpeechSynthesisUtterance(question.text),
                          );
                        }}
                      >
                        Read question aloud
                      </button>
                    )}
                </div>
              )}
              <div className="question-toolbar">
                <div className="question-indicators">
                  {interview.questions.map((q, i) => (
                    <button
                      key={q.id}
                      className={
                        i === questionIndex
                          ? "active"
                          : interview.answers.some((a) => a.questionId === q.id)
                            ? "answered"
                            : ""
                      }
                      onClick={() => setQuestionIndex(i)}
                      aria-label={`Question ${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                {manager && !aiLed && interview.status !== "completed" && (
                  <button
                    className="btn secondary"
                    disabled={!!busy}
                    onClick={() =>
                      action("questions", async () => {
                        await send(`/interviews/${id}/questions`);
                        await record.reload();
                      })
                    }
                  >
                    <Sparkles size={15} />
                    {busy === "questions"
                      ? "Generating…"
                      : "Generate AI questions"}
                  </button>
                )}
              </div>
              {!service.data?.ai && (
                <div className="inline-service-note">
                  <Sparkles size={15} /> AI needs configuration. You can still
                  practice with question templates and save answers.
                </div>
              )}
              {question && (
                <>
                  <div className="question-heading">
                    <div className="eyebrow">
                      QUESTION {String(questionIndex + 1).padStart(2, "0")} OF{" "}
                      {String(interview.questions.length).padStart(2, "0")}
                    </div>
                    <Badge>
                      {question.source === "ai"
                        ? "AI generated"
                        : "Question template"}
                    </Badge>
                  </div>
                  <h1 className="interview-question">{question.text}</h1>
                  <div className="rubric-card">
                    <strong>What a thoughtful answer covers</strong>
                    {question.rubric.map((r) => (
                      <span key={r}>
                        <Check size={14} />
                        {r}
                      </span>
                    ))}
                  </div>
                  {submitted ? (
                    <>
                      <div className="submitted-answer">
                        <div>
                          <strong>Your submitted answer</strong>
                          <Badge tone="green">
                            <Check size={12} />
                            Saved · {submitted.mode}
                          </Badge>
                        </div>
                        <p>{submitted.text}</p>
                      </div>
                      {manager && (
                        <div className="form-actions">
                          <button
                            className="btn secondary"
                            disabled={!!busy}
                            onClick={() =>
                              action("assess", async () => {
                                await send(
                                  `/interviews/${id}/answers/${question.id}/assess`,
                                );
                                await record.reload();
                              })
                            }
                          >
                            <Sparkles size={16} />
                            {busy === "assess"
                              ? "Reviewing…"
                              : "Assess technical answer"}
                          </button>
                        </div>
                      )}
                      {submitted.feedback && (
                        <div className="feedback-card">
                          <strong>AI feedback · advisory</strong>
                          <p>{submitted.feedback.feedback}</p>
                          <div className="tag-list">
                            <Badge>
                              Correctness{" "}
                              {submitted.feedback.correctness ?? "Uncertain"}/5
                            </Badge>
                            <Badge>
                              Completeness{" "}
                              {submitted.feedback.completeness ?? "Uncertain"}/5
                            </Badge>
                          </div>
                          <p>
                            Evidence: {submitted.feedback.evidence.join(" · ")}
                          </p>
                          <p>
                            Missing concepts:{" "}
                            {submitted.feedback.missingConcepts.join(", ") ||
                              "None identified"}
                          </p>
                          <p>
                            Suggested follow-up: {submitted.feedback.followUp}
                          </p>
                          <small>
                            Uncertainty:{" "}
                            {submitted.feedback.uncertainty ||
                              "Human verification is required."}
                          </small>
                        </div>
                      )}
                      {user.role !== "candidate" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const override = String(
                              new FormData(e.currentTarget).get("override"),
                            );
                            void action("override", async () => {
                              await send(
                                `/interviews/${id}/answers/${question.id}/override`,
                                { override },
                                "PATCH",
                              );
                              await record.reload();
                            });
                          }}
                        >
                          <Field label="Interviewer correction or override">
                            <textarea
                              name="override"
                              defaultValue={submitted.override}
                              required
                              minLength={5}
                              rows={3}
                            />
                          </Field>
                          <button disabled={!!busy} className="btn secondary">
                            Save human review
                          </button>
                        </form>
                      )}
                    </>
                  ) : candidate && active ? (
                    <div className="answer-composer">
                      <div className="answer-label">
                        <strong>Your answer</strong>
                        <span>
                          {mode === "spoken"
                            ? "Spoken answer · editable transcript"
                            : "Typed answer"}
                        </span>
                      </div>
                      <textarea
                        aria-label="Your answer"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Start with your approach, share a concrete example, and explain your thinking…"
                        maxLength={20000}
                        rows={7}
                      />
                      {mode === "spoken" && (
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={reviewed}
                            onChange={(e) => setReviewed(e.target.checked)}
                          />
                          I reviewed and corrected the transcription.
                        </label>
                      )}
                      <div className="answer-actions">
                        <button
                          className={`btn secondary ${recording ? "recording" : ""}`}
                          disabled={!!busy || !service.data?.transcription}
                          onClick={transcribe}
                        >
                          {recording ? <Square size={15} /> : <Mic size={15} />}{" "}
                          {recording
                            ? "Stop & transcribe"
                            : busy === "transcribe"
                              ? "Transcribing…"
                              : "Record spoken answer"}
                        </button>
                        <button
                          className="btn primary"
                          disabled={
                            !!busy ||
                            recording ||
                            answer.trim().length < 5 ||
                            (mode === "spoken" && !reviewed)
                          }
                          onClick={submitAnswer}
                        >
                          {busy === "answer" ? "Saving…" : "Submit answer"}
                          <Send size={15} />
                        </button>
                      </div>
                      <small className="muted">
                        {service.data?.transcription
                          ? "Recording is limited to 2 minutes. Audio is sent to the speech provider for transcription."
                          : "Spoken mode needs a transcription service. Type your answer to continue."}
                      </small>
                    </div>
                  ) : (
                    <Notice>
                      {interview.status === "completed"
                        ? "No answer was submitted."
                        : "The candidate’s submitted answer will appear here."}
                    </Notice>
                  )}
                  <div className="question-bottom">
                    <span>{question.topic}</span>
                    <button
                      className="text-link"
                      disabled={questionIndex >= interview.questions.length - 1}
                      onClick={() => setQuestionIndex((i) => i + 1)}
                    >
                      Next question <ArrowRight size={17} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === "code" && (
            <div className="coding-workspace">
              {problem && (
                <div className="problem-description">
                  <Badge>{problem.difficulty}</Badge>
                  <h2>{problem.title}</h2>
                  <p>{problem.description}</p>
                  <small>{problem.constraints}</small>
                  <div className="examples">
                    {problem.examples.map((e, i) => (
                      <div key={i}>
                        <strong>Example {i + 1}</strong>
                        <pre>
                          Input: {e.input}
                          {"\n"}Output: {e.output}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="editor-toolbar">
                <div>
                  <Code2 size={16} />
                  <strong>{candidate ? "Solution" : "Candidate draft"}</strong>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    aria-label="Programming language"
                  >
                    {codingLanguages.map(({ key, label }) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <small>
                  {candidate
                    ? draftStatus
                    : record.error
                      ? "Refresh failed · showing last loaded code"
                      : savedDraft === undefined
                        ? "Starter code · no saved draft for this language"
                        : "Read-only · saved candidate code"}
                </small>
              </div>
              {!candidate && (
                <Notice>
                  Shows the candidate’s saved code for the selected language.
                  {joined && interview.status === "live"
                    ? " Refreshes every 8 seconds; unsaved edits are not visible."
                    : " Unsaved edits are not visible."}
                </Notice>
              )}
              <Suspense fallback={<p>Loading code editor…</p>}>
                <Editor
                  height="330px"
                  language={language}
                  value={editorCode}
                  onChange={(value) => {
                    if (!candidate || !active) return;
                    localDrafts.current[language] = value || "";
                    setCode(value || "");
                  }}
                  options={{
                    minimap: { enabled: false },
                    editContext: false,
                    ariaLabel: "Code editor",
                    fontSize: 14,
                    padding: { top: 18 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    readOnly: !candidate || !active,
                  }}
                />
              </Suspense>
              <CodeExecutionNotice
                publicDemo={service.data?.codePublicDemo}
                practice={practice}
                available={service.data?.code}
              />
              <div className="run-controls">
                <Field label="Custom standard input">
                  <textarea
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    rows={2}
                  />
                </Field>
                <div className="form-actions">
                  <button
                    disabled={
                      !candidate ||
                      !active ||
                      publicDemoBlocked ||
                      !!busy ||
                      !executionLanguages.includes(language)
                    }
                    className="btn secondary"
                    onClick={() =>
                      action("run", async () => {
                        await send(`/interviews/${id}/code`, {
                          language,
                          code,
                          stdin,
                          mode: "run",
                        });
                        await history.reload();
                      })
                    }
                  >
                    <Play size={15} />
                    {busy === "run" ? "Running…" : "Run code"}
                  </button>
                  <button
                    disabled={
                      !candidate ||
                      !active ||
                      publicDemoBlocked ||
                      !!busy ||
                      !executionLanguages.includes(language)
                    }
                    className="btn primary"
                    onClick={() =>
                      action("submit", async () => {
                        await send(`/interviews/${id}/code`, {
                          language,
                          code,
                          stdin,
                          mode: "submit",
                        });
                        await history.reload();
                      })
                    }
                  >
                    <Send size={15} />
                    {busy === "submit" ? "Testing…" : "Submit solution"}
                  </button>
                </div>
              </div>
              {!service.data?.code && !service.data?.codePublicDemo && (
                <Notice>
                  Judge0 is not configured. Your code can be saved, but it
                  cannot be executed until the service is connected.
                </Notice>
              )}
              <ErrorBox message={languageError} />
              {service.data?.code &&
                !publicDemoBlocked &&
                !languageError &&
                !executionLanguages.includes(language) && (
                  <Notice>
                    The connected runner has not made this language available.
                    You can still save your draft.
                  </Notice>
                )}
              <h3>Execution history</h3>
              <ErrorBox message={history.error} />
              {history.data.length ? (
                history.data.map((s) => (
                  <details
                    className="submission-detail"
                    key={s._id}
                    open={s === history.data[0]}
                  >
                    <summary>
                      {s.language} ·{" "}
                      {s.mode === "submit"
                        ? `${s.passed}/${s.total} tests passed`
                        : "Custom run"}{" "}
                      · {dateLabel(s.createdAt)}
                    </summary>
                    <pre>{s.code}</pre>
                    {s.results.map((r, i) => (
                      <div className="execution-line" key={i}>
                        <Status value={r.status} />
                        <span>
                          {r.hidden ? "Hidden test" : "Public / custom test"} ·{" "}
                          {r.time ?? "—"} seconds · {r.memory ?? "—"} KB
                        </span>
                        {!r.hidden && (
                          <pre>
                            {r.stdout ||
                              r.compileOutput ||
                              r.stderr ||
                              "(No output)"}
                          </pre>
                        )}
                      </div>
                    ))}
                  </details>
                ))
              ) : (
                <p className="muted">
                  No executions yet. Results appear only after the execution
                  service responds.
                </p>
              )}
            </div>
          )}
          {tab === "notes" && manager && (
            <div className="notes-workspace">
              <h2>Your perspective matters.</h2>
              <p>
                Record the technical evidence you noticed and questions you want
                to revisit.
              </p>
              <textarea
                aria-label="Private interview notes"
                rows={16}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your private notes here…"
              />
              <div className="form-actions">
                <button
                  className="btn primary"
                  disabled={!!busy}
                  onClick={() =>
                    action("notes", async () => {
                      await send(`/interviews/${id}/notes`, { notes }, "PATCH");
                      setDraftStatus("Notes saved");
                    })
                  }
                >
                  <Check size={16} />
                  {busy === "notes" ? "Saving…" : "Save notes"}
                </button>
                {draftStatus === "Notes saved" && (
                  <Badge tone="green">Notes saved</Badge>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      {ending && (
        <Modal title="Finish this session?" onClose={() => setEnding(false)}>
          <p>
            Your submitted answers and code results will be included in a
            report. Unsubmitted answer text will not be included.
          </p>
          <ErrorBox message={error} />
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setEnding(false)}>
              Keep going
            </button>
            <button className="btn primary" disabled={!!busy} onClick={end}>
              {busy === "end" ? "Finishing…" : "Finish & view report"}
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ChevronRight size={16} />;
}
