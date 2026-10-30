import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Maximize2,
} from "lucide-react";
import type {
  Interview,
  Problem,
  Report,
  ServiceStatus,
  Submission,
  MonitoringEvent,
} from "../shared/types";
import type { RoomState } from "../shared/room";
import { freshCameraSnapshot } from "../shared/camera-status";
import { codingLanguages, codingLanguageKeys } from "../shared/languages";
import { useAuth } from "./auth-context";
import { api, send, useResource } from "./api";
import { ErrorBox, Loading, Modal } from "./ui";
import { ThemeToggle } from "./theme";
import { useInterviewDevices } from "./interview-devices";
import { useLiveCall } from "./live-call";
import { useMonitoring } from "./monitoring";
import { useFacePresence } from "./face-presence";
import { useObjectDetection } from "./object-detection";
import {
  useObjectConsent,
  ObjectDetectionControls,
  ObjectDetectionLabels,
  ObjectDetectionOverlay,
} from "./ObjectDetectionControls";
import { useDraftSync } from "./draft-sync";
import { useRoomUpdates } from "./room-updates";
import { MediaVideo, MicrophoneLevel, MonitoringSummary } from "./RoomMedia";
import { InterviewCapture } from "./InterviewMedia";
import { CodeExecutionNotice } from "./CodeExecutionNotice";
import {
  ExecutionResults,
  isCustomRun,
  submissionVerdict,
} from "./ExecutionResults";
import { RoomConversation } from "./RoomConversation";
import { RoomDiagnostics } from "./RoomDiagnostics";
import { CalibratedGaze } from "./CalibratedGaze";
import { EventReviewControls } from "./MonitoringReview";
import {
  CandidateCameraReview,
  useCandidateCameraStatus,
} from "./CandidateCameraStatus";
import "./meeting.css";
const Editor = lazy(() => import("./CodingEditor"));
const ResumeViewer = lazy(() => import("./RoomResume"));
const noop = () => {};
const labels: Record<string, string> = {
  hidden: "Interview page hidden",
  visible: "Returned to interview page",
  blur: "Window lost focus",
  focus: "Window focus restored",
  "fullscreen-exit": "Fullscreen exited",
  "camera-off": "Camera unavailable",
  "camera-on": "Camera available",
  "screen-share-stopped": "Screen sharing stopped",
  "screen-share-started": "Screen sharing started",
  paste: "Paste in interview editor",
  copy: "Copy in interview editor",
  "connection-interrupted": "Connection interrupted",
  "connection-restored": "Connection restored",
  "no-face": "No face detected for a sustained interval",
  "multiple-faces": "Multiple faces detected for a sustained interval",
  "object-detected": "Phone or book estimated · review the context",
};

export default function HumanRoom({ id }: { id: string }) {
  const { user } = useAuth(),
    navigate = useNavigate(),
    candidate = user.role === "candidate";
  const interview = useResource<Interview | null>(`/interviews/${id}`, null);
  const state = useResource<RoomState | null>(`/interviews/${id}/room`, null);
  const services = useResource<ServiceStatus | null>("/services", null);
  const problem = useResource<Problem | null>(
    `/interviews/${id}/problem`,
    null,
  );
  const history = useResource<Submission[]>(
    `/interviews/${id}/submissions`,
    [],
  );
  const [joined, setJoined] = useState(false),
    [waiting, setWaiting] = useState(false),
    [consent, setConsent] = useState(false);
  const [tab, setTab] = useState("interview"),
    [expanded, setExpanded] = useState(false),
    [width, setWidth] = useState(38);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [settings, setSettings] = useState(false),
    [monitoringSettings, setMonitoringSettings] = useState(false),
    [leave, setLeave] = useState(false);
  const [devicesList, setDevicesList] = useState<MediaDeviceInfo[]>([]),
    [cameraId, setCameraId] = useState(""),
    [micId, setMicId] = useState("");
  const [now, setNow] = useState(Date.now()),
    [notes, setNotes] = useState(""),
    [noteStatus, setNoteStatus] = useState("");
  const [language, setLanguage] = useState("java"),
    [code, setCode] = useState(""),
    [stdin, setStdin] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState("");
  const [events, setEvents] = useState<MonitoringEvent[]>([]),
    [eventError, setEventError] = useState("");
  const [instruction, setInstruction] = useState(""),
    [codingPrompt, setCodingPrompt] = useState(""),
    [selectedProblem, setSelectedProblem] = useState("");
  const [library, setLibrary] = useState<Problem[]>([]),
    [recording, setRecording] = useState(false);
  const [spokenRecording, setSpokenRecording] = useState(false);
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceVideo, setFaceVideo] = useState<HTMLVideoElement | null>(null);
  const [remoteVideo, setRemoteVideo] = useState<HTMLVideoElement | null>(null);
  const [faceConsentError, setFaceConsentError] = useState("");
  const [languages, setLanguages] = useState<string[]>([]),
    [languageError, setLanguageError] = useState("");
  const stopCapture = useRef<(() => Promise<void>) | null>(null),
    drafts = useRef<Record<string, string>>({});
  const saving = useRef(Promise.resolve()),
    readyDraft = useRef(false),
    joining = useRef(false);
  const i = interview.data,
    room = state.data;
  const ended = i?.status === "completed" || i?.status === "cancelled";
  const active = joined && i?.status === "live" && !ended;
  // Browser activity and optional face processing have independent consent.
  const monitoring = useMonitoring(
    id,
    !!active && candidate && consent,
    null,
    services.data,
    noop,
  );
  const devices = useInterviewDevices(monitoring.record);
  const face = useFacePresence({
    enabled: candidate && faceEnabled && !ended,
    active: !!active && consent,
    video: faceVideo,
    services: services.data,
    record: monitoring.record,
  });
  const objectConsent = useObjectConsent(id);
  const objects = useObjectDetection({
    enabled: candidate && objectConsent.enabled && !ended,
    active: !!active && consent,
    video: faceVideo,
    services: services.data,
    record: monitoring.record,
  });
  const cameraStatusError = useCandidateCameraStatus({
    id,
    enabled: candidate,
    active: !!active && consent,
    camera: devices.camera,
    face: { state: face.state, count: face.count },
    objects: {
      state: objects.state,
      detections: objects.detections,
      frameAspect: objects.frameAspect,
    },
  });
  const call = useLiveCall({
    id,
    active: !!active,
    candidate,
    stream: devices.stream,
    screen: candidate ? devices.screen : null,
    media: {
      camera: devices.camera,
      microphone: devices.mic,
      screen: candidate && !!devices.screen,
    },
    record: monitoring.record,
  });
  const refreshEvents = useCallback(async () => {
    if (candidate) return;
    try {
      setEvents(await api<MonitoringEvent[]>(`/interviews/${id}/events`));
      setEventError("");
    } catch (e) {
      setEventError((e as Error).message);
    }
  }, [id, candidate]);
  const updates = useRoomUpdates(id, (kind) => {
    if (
      [
        "refresh",
        "admitted",
        "ended",
        "code",
        "question",
        "conversation",
      ].includes(kind)
    )
      void interview.reload();
    if (kind !== "monitoring" && kind !== "output") void state.reload();
    if (["refresh", "output"].includes(kind)) void history.reload();
    if (["refresh", "question"].includes(kind)) void problem.reload();
    if (["refresh", "monitoring", "monitoring-review"].includes(kind))
      void refreshEvents();
  });
  monitoring.setConnection(updates);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (ended) {
      devices.stop();
      setWaiting(false);
      setJoined(false);
    }
  }, [ended]);
  useEffect(() => {
    if (i && !candidate && !joined) setNotes(i.notes || "");
  }, [i?._id]);
  useEffect(() => {
    if (candidate) return;
    void api<Problem[]>("/problems")
      .then(setLibrary)
      .catch((e) => setError(e.message));
  }, [candidate]);
  useEffect(() => {
    if (!selectedProblem && problem.data) setSelectedProblem(problem.data.id);
  }, [problem.data?.id]);
  useEffect(() => {
    if (!services.data?.code) {
      setLanguages([]);
      return;
    }
    let live = true;
    void api<{ key: string }[]>("/languages")
      .then((rows) => {
        if (live) {
          setLanguages(rows.map((row) => row.key));
          setLanguageError("");
        }
      })
      .catch((e) => {
        if (live) setLanguageError(e.message);
      });
    return () => {
      live = false;
    };
  }, [services.data?.code]);
  useEffect(() => {
    const enumerate = async () => {
      try {
        if (navigator.mediaDevices?.enumerateDevices)
          setDevicesList(await navigator.mediaDevices.enumerateDevices());
      } catch {
        /* Capture reports permission errors. */
      }
    };
    void enumerate();
    navigator.mediaDevices?.addEventListener("devicechange", enumerate);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", enumerate);
  }, [devices.stream]);
  useEffect(() => {
    if (!i || !problem.data || !candidate || readyDraft.current) return;
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(`hirelens.room.code.${id}`) || "{}",
      );
      for (const key of codingLanguageKeys)
        if (typeof stored[key] === "string") drafts.current[key] = stored[key];
    } catch {
      /* Server draft remains available when browser storage is disabled. */
    }
    drafts.current = { ...i.drafts, ...drafts.current };
    const savedLanguage =
      codingLanguageKeys.find((key) => key === i.activeLanguage) ||
      codingLanguageKeys.find((key) => key === room?.activeLanguage) ||
      "java";
    readyDraft.current = true;
    setLanguage(savedLanguage);
    setCode(
      drafts.current[savedLanguage] ??
        problem.data.starter[savedLanguage] ??
        "",
    );
    // Enable autosave only after the saved language and its code have rendered together.
    setDraftReady(true);
  }, [i, problem.data, candidate, id, room?.activeLanguage]);
  const editorLanguage = candidate ? language : room?.activeLanguage || "java";
  const editorCode = candidate
    ? code
    : (i?.drafts?.[editorLanguage] ??
      problem.data?.starter[editorLanguage] ??
      "");
  function changeCode(value: string) {
    setCode(value);
    drafts.current[language] = value;
    try {
      sessionStorage.setItem(
        `hirelens.room.code.${id}`,
        JSON.stringify(drafts.current),
      );
    } catch {
      /* Autosave still works. */
    }
  }
  function changeLanguage(value: string) {
    drafts.current[language] = code;
    setLanguage(value);
    setCode(
      drafts.current[value] ??
        i?.drafts?.[value] ??
        problem.data?.starter[value] ??
        "",
    );
  }
  function saveDraft(source: string, lang: string) {
    const next = saving.current
      .catch(() => {})
      .then(async () => {
        await api(`/interviews/${id}/draft`, {
          method: "PATCH",
          body: JSON.stringify({ code: source, language: lang }),
          signal: AbortSignal.timeout(10000),
        });
      });
    saving.current = next;
    return next;
  }
  const draftStatus = useDraftSync(
    !!active && candidate && draftReady,
    code,
    language,
    updates,
    saveDraft,
  );
  useEffect(() => {
    if (!waiting || !room?.admittedAt || joined || joining.current || ended)
      return;
    if (!room.cameraAccommodation && !devices.camera) return;
    joining.current = true;
    void send<Interview>(`/interviews/${id}/start`)
      .then((value) => {
        interview.setData(value);
        setJoined(true);
        setWaiting(false);
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        joining.current = false;
      });
  }, [waiting, room?.admittedAt, devices.camera, joined, ended]);
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
  async function checkDevices(audioOnly = false) {
    await action("devices", async () => {
      await stopCapture.current?.();
      await monitoring.permissionDialog(() =>
        devices.check(audioOnly, { camera: cameraId, microphone: micId }),
      );
    });
  }
  async function join() {
    await action("join", async () => {
      if (candidate) {
        if (!consent)
          throw new Error("Review and accept the monitoring notice.");
        if (!devices.camera && !room?.cameraAccommodation)
          throw new Error(
            "Enable your camera before entering the waiting room.",
          );
        await send(`/interviews/${id}/consent`, { accepted: true });
        await send(`/interviews/${id}/room/wait`, {
          cameraReady: devices.camera,
        });
        await state.reload();
        setWaiting(true);
      } else {
        interview.setData(await send<Interview>(`/interviews/${id}/start`));
        setJoined(true);
      }
    });
  }
  async function leaveRoom(endForAll: boolean) {
    await action("leave", async () => {
      await stopCapture.current?.();
      if (candidate && active) await saveDraft(code, language);
      if (!candidate && notes !== i?.notes)
        await send(`/interviews/${id}/notes`, { notes }, "PATCH");
      await monitoring.flush();
      if (endForAll) {
        const report = await send<Report>(`/interviews/${id}/end`);
        devices.stop();
        setJoined(false);
        navigate(`/reports/${report._id}`);
      } else {
        devices.stop();
        setJoined(false);
        navigate("/interviews");
      }
    });
  }
  async function execute(
    mode: "run" | "submit",
    runMode: "custom" | "examples" = "custom",
  ) {
    if (
      !candidate ||
      !active ||
      !!busy ||
      !code.trim() ||
      !services.data?.code ||
      services.data?.codePublicDemo ||
      !languages.includes(language)
    )
      return;
    await action(mode === "submit" ? "submit" : runMode, async () => {
      await saveDraft(code, language);
      const result = await send<Submission>(`/interviews/${id}/code`, {
        code,
        language,
        stdin,
        mode,
        ...(mode === "run" ? { runMode } : {}),
      });
      await history.reload();
      setSelectedExecution(result._id);
    });
  }
  async function changeFaceConsent(accepted: boolean) {
    // Stop processing immediately, even if the revocation request needs retrying.
    if (!accepted) setFaceEnabled(false);
    setFaceConsentError("");
    await action("face-consent", async () => {
      try {
        await send(`/interviews/${id}/room/face-consent`, { accepted });
        setFaceEnabled(accepted);
        await state.reload();
      } catch (e) {
        setFaceConsentError(
          accepted
            ? "Consent could not be saved. Face processing remains off."
            : "Face processing stopped on this device. Retry saving your withdrawal when the connection returns.",
        );
        throw e;
      }
    });
  }
  const faceControls = candidate && (
    <section
      className="meeting-notice"
      aria-label="Optional face presence check"
    >
      <h3>Optional face presence check</h3>
      <p>
        With your separate consent, the camera checks face presence locally. No
        images are uploaded by this check. Sustained no-face or multiple-face
        observations are shared for human review after admission. This does not
        identify people, assess attention, or determine cheating.
      </p>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={faceEnabled}
          disabled={!!busy || (!services.data?.face && !faceEnabled)}
          onChange={(e) => void changeFaceConsent(e.target.checked)}
        />
        I consent to this optional check on this device
      </label>
      <p role="status">{face.status}</p>
      {!services.data?.face && <p>The local face model needs setup.</p>}
      <ErrorBox message={faceConsentError} />
      {faceEnabled && (
        <button className="btn secondary" onClick={face.retry}>
          Restart camera check
        </button>
      )}
      {!faceEnabled && room?.faceConsent && (
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() => void changeFaceConsent(false)}
        >
          Withdraw saved face consent
        </button>
      )}
      <p className="muted">
        You can leave this check off and continue the interview. It must be
        enabled again after a refresh.
      </p>
    </section>
  );
  const deviceControls = (
    <div className="meeting-device-form">
      <label className="field">
        Camera
        <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
          <option value="">Default camera</option>
          {devicesList
            .filter((d) => d.kind === "videoinput")
            .map((d, n) => (
              <option key={d.deviceId || n} value={d.deviceId}>
                {d.label || `Camera ${n + 1}`}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Microphone
        <select value={micId} onChange={(e) => setMicId(e.target.value)}>
          <option value="">Default microphone</option>
          {devicesList
            .filter((d) => d.kind === "audioinput")
            .map((d, n) => (
              <option key={d.deviceId || n} value={d.deviceId}>
                {d.label || `Microphone ${n + 1}`}
              </option>
            ))}
        </select>
      </label>
      <button
        className="btn secondary"
        disabled={!!busy}
        onClick={() => void checkDevices()}
      >
        Check selected devices
      </button>
      {(!candidate || room?.cameraAccommodation) && (
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() => void checkDevices(true)}
        >
          Use microphone only
        </button>
      )}
      <p role="status">{devices.message}</p>
      {busy === "devices" && (
        <button className="btn secondary" onClick={devices.cancelRequest}>
          Cancel device request
        </button>
      )}
      <MicrophoneLevel stream={devices.stream} muted={!devices.mic} />
    </div>
  );
  const monitoringControls = candidate && (
    <section
      className="meeting-candidate-monitoring"
      aria-label="Your camera monitoring settings"
    >
      <h2>Your camera checks</h2>
      <p>
        These checks apply to your camera only. After admission, enabled
        observations are visible to your assigned interviewer.
      </p>
      {faceControls}
      <ObjectDetectionControls
        profile={objects.profile}
        onProfileChange={objects.setProfile}
        accuracyAvailable={objects.accuracyAvailable}
        consent={objectConsent}
        configured={!!services.data?.objects}
        savedConsent={room?.objectConsent}
        status={objects.status}
        ready={objects.ready}
        detections={objects.detections}
        retry={objects.retry}
      />
      <details className="meeting-optional-check">
        <summary>Experimental gaze check · optional</summary>
        <p>
          Calibration is required. This check is experimental and does not
          determine attention or misconduct.
        </p>
        <CalibratedGaze
          video={faceVideo}
          services={services.data}
          active={!!active}
        />
      </details>
    </section>
  );
  if (interview.loading || state.loading) return <Loading />;
  if (!i || !room)
    return (
      <div className="meeting-setup">
        <Link to="/interviews">Back to interviews</Link>
        <ErrorBox
          message={state.error || interview.error || "Room unavailable."}
        />
      </div>
    );
  if (ended)
    return (
      <div className="meeting-setup">
        <h1>Interview {i.status}</h1>
        <p>
          Your camera, microphone, screen sharing, and room connection have
          stopped.
        </p>
        <Link className="btn primary" to="/interviews">
          Back to interviews
        </Link>
      </div>
    );
  if (!joined)
    return (
      <main className="meeting-setup">
        <div className="meeting-toolbar">
          <Link to="/interviews">← Interviews</Link>
          <ThemeToggle />
        </div>
        <p className="eyebrow">
          HIRELENS · {candidate ? "CANDIDATE SETUP" : "INTERVIEWER SETUP"}
        </p>
        <h1>
          {waiting
            ? "You’re in the waiting room"
            : candidate
              ? "Prepare for your interview"
              : "Prepare to interview your candidate"}
        </h1>
        <p>
          {i.jobTitle} · {i.companyName} · {i.duration} minutes
        </p>
        <p>
          Candidate: <strong>{i.candidateName}</strong> · Interviewer:{" "}
          <strong>{room.interviewerName}</strong>
        </p>
        <div className="meeting-preflight-grid">
          <section>
            <div className="meeting-tile">
              <MediaVideo
                stream={devices.stream}
                label="Your camera preview"
                muted
                onVideo={candidate ? setFaceVideo : undefined}
              />
              {candidate && objectConsent.enabled && devices.camera && (
                <ObjectDetectionOverlay
                  video={faceVideo}
                  detections={objects.detections}
                  frameAspect={objects.frameAspect}
                />
              )}
              {!devices.camera && (
                <div className="meeting-video-empty">Camera off</div>
              )}
              <span className="meeting-video-label">{user.name} · You</span>
            </div>
            {deviceControls}
            {monitoringControls}
            <details className="meeting-optional-check">
              <summary>Connection help</summary>
              <RoomDiagnostics
                id={id}
                services={services.data}
                stats={call.stats}
                connection={call.connection}
              />
            </details>
          </section>
          <section className="meeting-setup-card">
            <ErrorBox message={error || state.error || interview.error} />
            {candidate ? (
              <>
                {!waiting && <RoleGuide candidate />}
                {waiting ? (
                  <div className="meeting-wait" role="status">
                    <h2>Waiting for the interviewer to admit you.</h2>
                    <p>{updates}. Your preview stays local until you join.</p>
                    {room.admittedAt &&
                      !devices.camera &&
                      !room.cameraAccommodation && (
                        <p>
                          HR has admitted you. Restore your camera to enter.
                        </p>
                      )}
                    <button
                      className="btn secondary"
                      onClick={() => void state.reload()}
                    >
                      Check admission
                    </button>
                  </div>
                ) : (
                  <ResumeSetup
                    id={id}
                    room={room}
                    reload={state.reload}
                    action={action}
                    busy={!!busy}
                  />
                )}
                <div className="meeting-notice">
                  <h2>Before you join</h2>
                  <p>
                    {room.cameraAccommodation
                      ? "Your interviewer has approved joining without a camera."
                      : "A working camera is required. Ask your interviewer if you need an accommodation."}{" "}
                    Stay on this interview page; switching between its
                    Interview, Resume, and Coding panels is allowed.
                  </p>
                  <p>
                    {room.screenRequired
                      ? "Screen sharing is required after admission."
                      : "Your interviewer may request screen sharing."}{" "}
                    {room.entireScreen
                      ? "Select Entire Screen in the browser dialog. This browser must support verifying that selection."
                      : "Choose the screen, window, or tab requested by your interviewer."}{" "}
                    Only the content you choose is shared.
                  </p>
                  <p>
                    Browser activity, device availability, and editor copy/paste
                    events are saved for human review. Clipboard content and
                    other application identities are not collected. Events do
                    not automatically prove cheating or decide hiring.
                  </p>
                  <p>
                    Tab departures, returns, and time away are recorded after
                    admission. A reminder appears on return;{" "}
                    {monitoring.warningThreshold} departures trigger a
                    repeated-activity review notice. Explain technical issues or
                    accommodations to your interviewer.
                  </p>
                  <p>
                    Face presence is optional and has a separate consent control
                    below your camera preview. Recording is off unless you
                    separately consent and start it.
                  </p>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={waiting}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I understand and consent to the described interview
                  monitoring.
                </label>
              </>
            ) : (
              <>
                <h2>Prepare your interview</h2>
                <p>
                  Open the room, then admit {i.candidateName} when they finish
                  setup. Only you and the assigned candidate can enter.
                </p>
                <RoleGuide candidate={false} />
                <p className="meeting-role-note">
                  Your camera and microphone are for the call. Camera detection
                  and browser monitoring apply to the candidate only.
                </p>
                {i.applicationId && (
                  <Link
                    className="btn secondary"
                    to={`/applications?applicationId=${i.applicationId}`}
                  >
                    Review assigned application
                  </Link>
                )}
                <RoomPolicy
                  id={id}
                  room={room}
                  action={action}
                  reload={state.reload}
                  busy={!!busy}
                />
              </>
            )}
            {!waiting && (
              <button
                className="btn primary"
                disabled={
                  !!busy ||
                  (candidate &&
                    (!consent ||
                      !room.resumeId ||
                      (!devices.camera && !room.cameraAccommodation)))
                }
                onClick={() => void join()}
              >
                {busy === "join"
                  ? "Connecting…"
                  : candidate
                    ? "Enter waiting room"
                    : "Open interview room"}
              </button>
            )}
          </section>
        </div>
      </main>
    );
  const elapsed = Math.max(
    0,
    Math.floor((now - +new Date(i.startedAt || i.scheduledAt)) / 1000),
  );
  const clock = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;
  const latest =
    history.data.find((s) => s._id === selectedExecution) || history.data[0];
  const staleOutput =
    latest &&
    (latest.code !== editorCode ||
      latest.language !== editorLanguage ||
      (latest.problemId && latest.problemId !== problem.data?.id));
  const screen = candidate
    ? devices.screen
    : call.remoteMedia?.screen
      ? call.remoteScreen
      : null;
  const hrControls = !candidate && (
    <div className="meeting-hr-actions">
      <button
        className="btn secondary"
        disabled={!!busy}
        onClick={() =>
          void action("request", () =>
            send(`/interviews/${id}/room/instruction`, {
              kind: "screen-request",
              text: `Please share ${room.entireScreen ? "your entire screen" : "your interview workspace"} using Share screen.`,
            }),
          )
        }
      >
        Request screen share
      </button>
      <label className="field">
        Send candidate an instruction
        <input
          maxLength={1000}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="For example: explain your approach first"
        />
      </label>
      <button
        className="btn secondary"
        disabled={!instruction.trim() || !!busy}
        onClick={() =>
          void action("instruction", async () => {
            await send(`/interviews/${id}/room/instruction`, {
              text: instruction,
            });
            setInstruction("");
          })
        }
      >
        Send instruction
      </button>
    </div>
  );
  return (
    <main
      className={`meeting-shell ${candidate ? "meeting-candidate" : "meeting-interviewer"} ${expanded ? "meeting-expanded" : ""}`}
    >
      <header className="meeting-header">
        <div>
          <span className="eyebrow">
            HIRELENS ·{" "}
            {candidate ? "CANDIDATE WORKSPACE" : "INTERVIEWER WORKSPACE"}
          </span>
          <h1>{i.jobTitle}</h1>
          <p>
            {i.companyName} ·{" "}
            {candidate
              ? `Interview with ${room.interviewerName}`
              : `Candidate: ${i.candidateName}`}{" "}
            · {clock} elapsed
          </p>
        </div>
        <div className="meeting-status">
          <span
            className={call.connection === "connected" ? "meeting-good" : ""}
          >
            {call.connection}
          </span>
          <small>{updates}</small>
          <small>
            {candidate
              ? `Monitoring active · ${monitoring.delivery}`
              : "Candidate activity · human review"}
          </small>
          {candidate && faceEnabled && <small>{face.status}</small>}
          {candidate && objectConsent.enabled && (
            <small>{objects.status}</small>
          )}
          {(recording || spokenRecording) && (
            <strong className="meeting-recording">
              ●{" "}
              {recording ? "Recording your device" : "Recording spoken answer"}
            </strong>
          )}
          <ThemeToggle />
        </div>
      </header>
      <div className="meeting-banners" aria-live="polite">
        {busy === "share" && (
          <button className="btn secondary" onClick={devices.cancelRequest}>
            Cancel screen request
          </button>
        )}
        <ErrorBox
          message={error || call.issue || state.error || interview.error}
        />
        {candidate && <ErrorBox message={cameraStatusError} />}
        {candidate && monitoring.warning && (
          <div className="meeting-warning" role="alert">
            {monitoring.warning}
            <button onClick={monitoring.dismissWarning}>Dismiss</button>
          </div>
        )}
        {candidate && active && (
          <p className="muted small" role="status">
            {monitoring.tabDepartures} tab departures this visit · review
            threshold {monitoring.warningThreshold}
          </p>
        )}
        {candidate && !devices.camera && !room.cameraAccommodation && (
          <div className="meeting-warning">
            Your camera is unavailable. Restore it in Device settings or tell
            your interviewer about the issue; the meeting remains open.
          </div>
        )}
        {candidate && !devices.screen && room.screenRequired && (
          <div className="meeting-warning">
            Screen sharing is required. Use Share screen below and select the
            requested content.
          </div>
        )}
        {candidate && room.instruction && (
          <div className="meeting-notice">
            <strong>{room.interviewerName}:</strong> {room.instruction.text}{" "}
            <small>{new Date(room.instruction.at).toLocaleTimeString()}</small>
          </div>
        )}
        {!candidate && !room.admittedAt && (
          <div className="meeting-admit">
            <span>
              {room.waitingAt
                ? `${i.candidateName} is waiting for admission.`
                : "Waiting for the candidate to finish setup."}
            </span>
            <button
              className="btn primary"
              disabled={!!busy || !room.waitingAt}
              onClick={() =>
                void action("admit", async () => {
                  await send(`/interviews/${id}/room/admit`);
                  await state.reload();
                  await interview.reload();
                })
              }
            >
              Admit candidate
            </button>
          </div>
        )}
        {!candidate &&
          events[0] &&
          [
            "hidden",
            "blur",
            "camera-off",
            "screen-share-stopped",
            "fullscreen-exit",
            "no-face",
            "multiple-faces",
            "head-turned",
            "object-detected",
            "monitoring-unavailable",
          ].includes(events[0].kind) && (
            <div className="meeting-warning">
              <strong>{labels[events[0].kind]}</strong> ·{" "}
              {new Date(events[0].occurredAt).toLocaleTimeString()}{" "}
              <button onClick={() => setTab("activity")}>
                Review activity
              </button>
            </div>
          )}
        {candidate && room.codingSentAt && (
          <div className="meeting-notice">
            A coding question is available ·{" "}
            {new Date(room.codingSentAt).toLocaleTimeString()}{" "}
            <button className="btn secondary" onClick={() => setTab("code")}>
              Open coding question
            </button>
          </div>
        )}
        {devices.screen && (
          <div className="meeting-sharing" role="status">
            You are sharing{" "}
            {devices.screen.getVideoTracks()[0]?.getSettings().displaySurface ||
              "your selected content"}
            . <button onClick={devices.stopScreen}>Stop sharing</button>
          </div>
        )}
      </div>
      <div
        className="meeting-main"
        style={{ "--meeting-video-width": `${width}%` } as CSSProperties}
      >
        <section className="meeting-stage" aria-label="Interview participants">
          <div className="meeting-participants">
            <div className="meeting-tile">
              <MediaVideo
                stream={call.remote}
                label={candidate ? room.interviewerName : i.candidateName}
                onVideo={!candidate ? setRemoteVideo : undefined}
              />
              {!candidate &&
                call.remote &&
                call.remoteMedia?.camera &&
                room.objectConsent &&
                room.candidateCameraStatus?.camera &&
                room.candidateCameraStatus.objects.state === "ready" &&
                freshCameraSnapshot(room.candidateCameraStatus, now) && (
                  <ObjectDetectionOverlay
                    video={remoteVideo}
                    detections={room.candidateCameraStatus.objects.items}
                    frameAspect={room.candidateCameraStatus.frameAspect}
                  />
                )}
              {!call.remoteMedia?.camera && (
                <div className="meeting-video-empty">
                  {candidate ? room.interviewerName : i.candidateName}
                  <small>
                    {call.remote ? "Camera off" : "Waiting for video"}
                  </small>
                </div>
              )}
              <span className="meeting-video-label">
                {candidate ? room.interviewerName : i.candidateName} ·{" "}
                {candidate ? "Interviewer" : "Candidate"}
                {call.remoteMedia?.microphone === false ? " · Muted" : ""}
              </span>
            </div>
            <div className="meeting-tile">
              <MediaVideo
                stream={devices.stream}
                label={`${user.name}, your video`}
                muted
                onVideo={candidate ? setFaceVideo : undefined}
              />
              {candidate && objectConsent.enabled && devices.camera && (
                <ObjectDetectionOverlay
                  video={faceVideo}
                  detections={objects.detections}
                  frameAspect={objects.frameAspect}
                />
              )}
              {!devices.camera && (
                <div className="meeting-video-empty">Camera off</div>
              )}
              <span className="meeting-video-label">
                {user.name} · You · {candidate ? "Candidate" : "Interviewer"}
                {!devices.mic ? " · Muted" : ""}
              </span>
            </div>
          </div>
          {!candidate && (
            <CandidateCameraReview
              snapshot={room.candidateCameraStatus}
              faceConsent={room.faceConsent}
              objectConsent={room.objectConsent}
            />
          )}
          {candidate && objectConsent.enabled && objects.ready && (
            <ObjectDetectionLabels detections={objects.detections} />
          )}
          {(!candidate || screen) && (
            <div className="meeting-screen">
              <div className="meeting-section-title">
                <h2>
                  {candidate
                    ? "Your shared screen"
                    : "Candidate’s shared screen"}
                </h2>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setTab("screen");
                    setExpanded(true);
                  }}
                >
                  Expand screen
                </button>
              </div>
              {screen ? (
                <MediaVideo
                  stream={screen}
                  label="Candidate shared screen"
                  muted
                />
              ) : (
                <p>
                  {call.remoteMedia?.screen
                    ? "Connecting shared screen…"
                    : "No screen is being shared."}
                </p>
              )}
            </div>
          )}
          {hrControls}
        </section>
        <div className="meeting-resizer">
          <label>
            Panel width
            <input
              aria-label="Video panel width"
              type="range"
              min="24"
              max="60"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
        </div>
        <section className="meeting-workspace" aria-label="Interview workspace">
          <nav className="meeting-tabs" aria-label="Interview panels">
            {[
              [
                "interview",
                candidate ? "Your interview" : "Questions & instructions",
              ],
              ["resume", candidate ? "Your resume" : "Candidate resume"],
              ["code", candidate ? "Coding task" : "Review candidate code"],
              ...(!candidate || screen
                ? [["screen", candidate ? "Your screen" : "Candidate screen"]]
                : []),
              ...(!candidate
                ? [
                    ["activity", `Candidate monitoring (${events.length})`],
                    ["notes", "Private notes"],
                  ]
                : []),
              ["recording", "Recording"],
              ["connection", "Connection"],
            ].map(([key, title]) => (
              <button
                key={key}
                className={tab === key ? "selected" : ""}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {title}
              </button>
            ))}
            <button
              className="meeting-expand"
              aria-label={expanded ? "Restore panel size" : "Expand workspace"}
              onClick={() => setExpanded((v) => !v)}
            >
              <Maximize2 size={16} />
            </button>
          </nav>
          <div className="meeting-panel" hidden={tab !== "interview"}>
            <div className="meeting-mobile-actions">{hrControls}</div>
            <div className="meeting-workspace-intro">
              <h2>
                {candidate ? "Answer your interviewer" : "Lead the interview"}
              </h2>
              <p>
                {candidate
                  ? "Listen to the question and explain your approach. Use Coding task when your interviewer sends a problem; your work saves automatically."
                  : "Ask questions, review the candidate’s answers and send clear instructions. Candidate monitoring and your private notes are available in their own panels."}
              </p>
              {!candidate && (
                <p className="meeting-context-line">
                  {i.type} · {i.difficulty} ·{" "}
                  {i.roundName ||
                    `Round ${i.roundIndex ? i.roundIndex + 1 : 1}`}{" "}
                  · Topics:{" "}
                  {i.topics?.join(", ") ||
                    "Discuss the assigned job requirements"}
                </p>
              )}
            </div>
            <RoomConversation
              interview={i}
              candidate={candidate}
              active={!!active}
              services={services.data}
              reload={interview.reload}
              permissionDialog={monitoring.permissionDialog}
              onRecordingChange={setSpokenRecording}
            />
            {!candidate && !room.admittedAt && (
              <RoomPolicy
                id={id}
                room={room}
                action={action}
                reload={state.reload}
                busy={!!busy}
              />
            )}
          </div>
          <div className="meeting-panel" hidden={tab !== "resume"}>
            <div className="meeting-section-title">
              <h2>{room.resumeName || "Candidate resume"}</h2>
              <span>
                {room.resumeSharedAt
                  ? "Shared with interviewer"
                  : "Resume not shared"}
              </span>
            </div>
            {candidate && !room.resumeSharedAt && (
              <button
                className="btn primary"
                disabled={!!busy || !room.resumeId}
                onClick={() =>
                  void action("resume", async () => {
                    await send(`/interviews/${id}/room/resume/share`);
                    await state.reload();
                  })
                }
              >
                Share Resume with Interviewer
              </button>
            )}
            {room.resumeId ? (
              <Suspense fallback={<Loading />}>
                <ResumeViewer id={id} resumeId={room.resumeId} />
              </Suspense>
            ) : (
              <p>The candidate has not shared a resume yet.</p>
            )}
          </div>
          <div className="meeting-panel meeting-code" hidden={tab !== "code"}>
            {!candidate && (
              <details className="meeting-question-compose">
                <summary>Send a coding question</summary>
                <label className="field">
                  Assessment question
                  <select
                    value={selectedProblem}
                    onChange={(e) => setSelectedProblem(e.target.value)}
                  >
                    {library.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Your instructions or follow-up question
                  <textarea
                    value={codingPrompt}
                    maxLength={5000}
                    onChange={(e) => setCodingPrompt(e.target.value)}
                    placeholder="Add the question or constraints you want the candidate to discuss. Automated tests use the selected assessment."
                  />
                </label>
                <button
                  className="btn primary"
                  disabled={!!busy || !room.admittedAt || !selectedProblem}
                  onClick={() =>
                    void action("question", async () => {
                      await send(`/interviews/${id}/room/question`, {
                        problemId: selectedProblem,
                        prompt: codingPrompt,
                      });
                      await problem.reload();
                      await state.reload();
                    })
                  }
                >
                  Send question to candidate
                </button>
              </details>
            )}
            {room.codingPrompt && (
              <div className="meeting-notice">
                <strong>Interviewer’s question</strong>
                <p>{room.codingPrompt}</p>
              </div>
            )}
            <h2>{problem.data?.title || "Coding assessment"}</h2>
            <p>{problem.data?.description}</p>
            <details>
              <summary>Constraints and examples</summary>
              <p>{problem.data?.constraints}</p>
              {problem.data?.examples.map((e, n) => (
                <pre key={n}>
                  Input: {e.input}
                  {"\n"}Output: {e.output}
                </pre>
              ))}
            </details>
            <div className="meeting-toolbar">
              <label>
                Language{" "}
                <select
                  value={editorLanguage}
                  disabled={!candidate || !!busy}
                  onChange={(e) => changeLanguage(e.target.value)}
                >
                  {codingLanguages.map(({ key, label }) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <small role="status">
                {candidate ? draftStatus : "Live candidate code · read only"}
              </small>
            </div>
            <div data-interview-editor className="meeting-editor">
              <Suspense fallback={<Loading />}>
                <Editor
                  height="360px"
                  language={editorLanguage}
                  value={editorCode}
                  path={`interview-${id}-${editorLanguage}`}
                  keepCurrentModel
                  onChange={(value) => {
                    if (candidate) changeCode(value || "");
                  }}
                  options={{
                    readOnly: !candidate || !active,
                    minimap: { enabled: false },
                    fontSize: 14,
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    tabSize: 4,
                  }}
                />
              </Suspense>
            </div>
            {candidate && (
              <label className="field">
                Custom input
                <textarea
                  rows={2}
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  disabled={!candidate}
                  maxLength={10000}
                  placeholder="Input passed to your program when you choose Run custom input"
                />
              </label>
            )}
            <CodeExecutionNotice
              publicDemo={services.data?.codePublicDemo}
              practice={false}
              available={services.data?.code}
            />
            {!services.data?.code && !services.data?.codePublicDemo && (
              <div className="meeting-warning">
                Code execution is unavailable until the administrator connects
                and tests Judge0.{" "}
                {candidate
                  ? "You can still write and discuss code"
                  : "The candidate can still write code while you review it"}
                ; no results are simulated.
              </div>
            )}
            {candidate && (
              <>
                <div className="meeting-toolbar">
                  <button
                    className="btn secondary"
                    disabled={
                      !!busy ||
                      !code.trim() ||
                      !services.data?.code ||
                      !!services.data?.codePublicDemo ||
                      !languages.includes(language) ||
                      !active
                    }
                    onClick={() => void execute("run", "examples")}
                  >
                    {busy === "examples"
                      ? "Checking examples…"
                      : "Run examples"}
                  </button>
                  <button
                    className="btn secondary"
                    disabled={
                      !!busy ||
                      !code.trim() ||
                      !services.data?.code ||
                      !!services.data?.codePublicDemo ||
                      !languages.includes(language) ||
                      !active
                    }
                    onClick={() => void execute("run", "custom")}
                  >
                    {busy === "custom"
                      ? "Running custom input…"
                      : "Run custom input"}
                  </button>
                  <button
                    className="btn primary"
                    disabled={
                      !!busy ||
                      !code.trim() ||
                      !services.data?.code ||
                      !!services.data?.codePublicDemo ||
                      !languages.includes(language) ||
                      !active
                    }
                    onClick={() => void execute("submit")}
                  >
                    {busy === "submit"
                      ? "Checking all cases…"
                      : "Submit solution"}
                  </button>
                </div>
                <p>
                  Run examples checks the visible cases. Submit solution checks
                  all public and hidden cases. Custom input runs without
                  grading.
                </p>
                {["custom", "examples", "submit"].includes(busy) && (
                  <p role="status">
                    Waiting for the private execution service. Results appear
                    when this attempt finishes.
                  </p>
                )}
              </>
            )}
            <ErrorBox message={languageError} />
            {services.data?.code &&
              !services.data?.codePublicDemo &&
              !languageError &&
              !languages.includes(editorLanguage) && (
                <p role="status">
                  Execution for {editorLanguage} is not available from the
                  connected runner. Choose an available language or ask the
                  administrator to enable it.
                </p>
              )}
            <section className="meeting-console" aria-label="Execution output">
              <h3>Console</h3>
              {history.error && <ErrorBox message={history.error} />}
              {history.data.length > 1 && (
                <label className="field">
                  Execution attempt
                  <select
                    value={latest?._id || ""}
                    onChange={(e) => setSelectedExecution(e.target.value)}
                  >
                    {history.data.map((s) => (
                      <option key={s._id} value={s._id}>
                        {new Date(s.createdAt).toLocaleTimeString()} ·{" "}
                        {s.language} ·{" "}
                        {isCustomRun(s)
                          ? "Custom input"
                          : s.mode === "submit"
                            ? "Submit"
                            : "Examples"}{" "}
                        · {submissionVerdict(s)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!latest ? (
                <p>No execution results yet.</p>
              ) : (
                <>
                  <p>
                    {latest.language} · {latest.mode} ·{" "}
                    {new Date(latest.createdAt).toLocaleTimeString()} · Code
                    version{" "}
                    {latest.codeHash?.slice(0, 12) || "saved with submission"}
                  </p>
                  {staleOutput && (
                    <div className="meeting-warning">
                      This output belongs to an earlier code version or
                      question.{" "}
                      {candidate
                        ? "Run the current code to update it."
                        : "Ask the candidate to run the current code to update it."}
                    </div>
                  )}
                  <ExecutionResults submission={latest} />
                  <details>
                    <summary>Code used for this execution</summary>
                    <pre>{latest.code}</pre>
                  </details>
                </>
              )}
            </section>
          </div>
          <div
            className="meeting-panel meeting-screen-large"
            hidden={tab !== "screen"}
          >
            <h2>Candidate’s shared screen</h2>
            {screen ? (
              <MediaVideo
                stream={screen}
                label="Expanded candidate screen"
                muted
              />
            ) : (
              <p>No screen is being shared.</p>
            )}
          </div>
          {!candidate && (
            <div className="meeting-panel" hidden={tab !== "activity"}>
              <h2>Activity timeline</h2>
              <p>
                Observations for human review. A browser event does not prove
                misconduct. Connectivity and duration provide context.
              </p>
              <ErrorBox message={eventError} />
              <MonitoringSummary
                events={events}
                threshold={services.data?.tabSwitchWarningThreshold}
              />
              {!events.length && (
                <p>
                  No activity received yet. This does not confirm monitoring
                  coverage.
                </p>
              )}
              {events.slice(0, 100).map((event) => (
                <article className="meeting-event" key={event._id}>
                  <strong>
                    {labels[event.kind] || event.kind.replaceAll("-", " ")}
                  </strong>
                  <time>
                    {new Date(event.occurredAt).toLocaleTimeString()}
                    {event.durationMs
                      ? ` · ${(event.durationMs / 1000).toFixed(1)}s`
                      : ""}
                  </time>
                  <p>{event.detail}</p>
                  <EventReviewControls
                    interviewId={id}
                    event={event}
                    onSaved={refreshEvents}
                  />
                </article>
              ))}
            </div>
          )}
          {!candidate && (
            <div className="meeting-panel" hidden={tab !== "notes"}>
              <h2>Private interviewer notes</h2>
              <p>The candidate cannot access these notes.</p>
              <textarea
                aria-label="Private interviewer notes"
                rows={14}
                maxLength={20000}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNoteStatus("Unsaved");
                }}
              />
              <button
                className="btn primary"
                disabled={!!busy}
                onClick={() =>
                  void action("notes", async () => {
                    await send(`/interviews/${id}/notes`, { notes }, "PATCH");
                    setNoteStatus("Notes saved");
                  })
                }
              >
                Save notes
              </button>
              <p role="status">{noteStatus}</p>
            </div>
          )}
          <div className="meeting-panel" hidden={tab !== "recording"}>
            <h2>Optional recording</h2>
            <InterviewCapture
              interview={i}
              stream={devices.stream}
              active={!!active}
              services={services.data}
              stopRef={stopCapture}
              onRecordingChange={setRecording}
            />
          </div>
          <div className="meeting-panel" hidden={tab !== "connection"}>
            <RoomDiagnostics
              id={id}
              services={services.data}
              stats={call.stats}
              connection={call.connection}
            />
          </div>
        </section>
      </div>
      <footer className="meeting-controls" aria-label="Meeting controls">
        <button
          className="btn secondary"
          aria-pressed={!devices.mic}
          onClick={() => devices.toggle("audio")}
        >
          {devices.mic ? <Mic size={18} /> : <MicOff size={18} />}
          {devices.mic ? "Mute" : "Unmute"}
        </button>
        <button
          className="btn secondary"
          aria-pressed={!devices.camera}
          onClick={() => devices.toggle("video")}
        >
          {devices.camera ? <Video size={18} /> : <VideoOff size={18} />}
          {devices.camera ? "Camera off" : "Camera on"}
        </button>
        <button className="btn secondary" onClick={() => setSettings(true)}>
          <Settings size={18} />
          Devices
        </button>
        {candidate && (
          <button
            className="btn secondary"
            disabled={!!busy}
            onClick={() =>
              devices.screen
                ? devices.stopScreen()
                : void action("share", () =>
                    monitoring.permissionDialog(() =>
                      devices.shareScreen(room.entireScreen),
                    ),
                  )
            }
          >
            <MonitorUp size={18} />
            {devices.screen ? "Stop sharing" : "Share screen"}
          </button>
        )}
        {candidate && (
          <button
            className="btn secondary"
            onClick={() => setMonitoringSettings(true)}
          >
            Camera checks
          </button>
        )}
        {candidate && (
          <button
            className="btn secondary"
            onClick={() =>
              void action("fullscreen", async () => {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (document.documentElement.requestFullscreen)
                  await document.documentElement.requestFullscreen();
                else
                  throw new Error("Fullscreen is unavailable in this browser.");
              })
            }
          >
            Fullscreen
          </button>
        )}
        <button className="btn secondary" onClick={call.reconnect}>
          Reconnect video
        </button>
        <button className="btn danger" onClick={() => setLeave(true)}>
          <PhoneOff size={18} />
          {candidate ? "Leave" : "End / leave"}
        </button>
      </footer>
      {settings && (
        <Modal title="Device settings" onClose={() => setSettings(false)}>
          {deviceControls}
        </Modal>
      )}
      {candidate && monitoringSettings && (
        <Modal
          title="Your camera checks"
          onClose={() => setMonitoringSettings(false)}
        >
          {monitoringControls}
        </Modal>
      )}
      {leave && (
        <Modal
          title={
            candidate ? "Leave the interview?" : "End or leave the interview?"
          }
          onClose={() => setLeave(false)}
        >
          <p>
            {candidate
              ? "Your saved work stays available. You can rejoin while the interview is open."
              : "End for everyone stops the candidate’s meeting and prepares the report. Leaving keeps the room available."}
          </p>
          <ErrorBox message={error} />
          <div className="meeting-toolbar">
            <button
              className="btn secondary"
              disabled={!!busy}
              onClick={() => void leaveRoom(false)}
            >
              Leave room
            </button>
            {!candidate && (
              <button
                className="btn danger"
                disabled={!!busy}
                onClick={() => void leaveRoom(true)}
              >
                End for everyone
              </button>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}

function RoleGuide({ candidate }: { candidate: boolean }) {
  return (
    <section
      className="meeting-role-guide"
      aria-label={candidate ? "Candidate steps" : "Interviewer steps"}
    >
      <h2>{candidate ? "What you will do" : "Your interview workflow"}</h2>
      <ol>
        {candidate ? (
          <>
            <li>
              Check your devices, review your resume and choose your optional
              camera checks.
            </li>
            <li>
              Accept the monitoring notice and wait for your interviewer to
              admit you.
            </li>
            <li>
              Answer questions, complete the coding task and share your screen
              when requested.
            </li>
          </>
        ) : (
          <>
            <li>
              Review the assigned candidate and job, then open the room and
              admit the candidate.
            </li>
            <li>
              Ask questions, send coding tasks and review the candidate’s video,
              screen and monitoring observations.
            </li>
            <li>
              Save your private notes, end the interview and review the
              assessment report.
            </li>
          </>
        )}
      </ol>
    </section>
  );
}

function ResumeSetup({
  id,
  room,
  reload,
  action,
  busy,
}: {
  id: string;
  room: RoomState;
  reload: () => Promise<void>;
  action: (name: string, work: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const result = useResource<{
    resumes: { _id: string; name: string }[];
    recommendedId?: string;
  }>(`/interviews/${id}/room/resumes`, { resumes: [] });
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!selected)
      setSelected(
        room.resumeId ||
          result.data.recommendedId ||
          result.data.resumes[0]?._id ||
          "",
      );
  }, [result.data, room.resumeId]);
  useEffect(() => {
    if (room.resumeId) setSelected(room.resumeId);
  }, [room.resumeId]);
  return (
    <div>
      <h2>Prepare your resume</h2>
      <ErrorBox message={result.error} />
      {result.data.recommendedId && (
        <div className="meeting-notice">
          <p>
            Your application already includes a resume for this job. Use that
            document so your interviewer reviews the same application evidence.
          </p>
          <button
            className="btn primary"
            disabled={busy || !!room.admittedAt}
            onClick={() =>
              void action("resume", async () => {
                await send(`/interviews/${id}/room/resume`, {
                  resumeId: result.data.recommendedId,
                });
                setSelected(result.data.recommendedId!);
                await reload();
              })
            }
          >
            Use resume submitted for this job
          </button>
        </div>
      )}
      <p className="muted">
        The resume and details saved with your original application stay
        unchanged. Any alternate resume is used only for this interview room.
      </p>
      <details className="meeting-optional-check">
        <summary>Use another resume (optional)</summary>
        <label className="field">
          Existing resume
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a resume</option>
            {result.data.resumes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn secondary"
          disabled={busy || !selected || !!room.admittedAt}
          onClick={() =>
            void action("resume", async () => {
              await send(`/interviews/${id}/room/resume`, {
                resumeId: selected,
              });
              await reload();
            })
          }
        >
          Use selected resume
        </button>
        <label className="field">
          Or upload a PDF (up to 5 MB)
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy || !!room.admittedAt}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              void action("upload", async () => {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error("Choose a PDF up to 5 MB.");
                const body = new FormData();
                body.append("resume", file);
                await api(`/interviews/${id}/room/resume/upload`, {
                  method: "POST",
                  body,
                });
                await result.reload();
                await reload();
              });
            }}
          />
        </label>
      </details>
      <p role="status">
        {room.resumeId
          ? `${room.resumeName} is ready. Share it with the interviewer after admission.`
          : "Select or upload your resume before entering."}
      </p>
    </div>
  );
}
function RoomPolicy({
  id,
  room,
  action,
  reload,
  busy,
}: {
  id: string;
  room: RoomState;
  action: (name: string, work: () => Promise<unknown>) => Promise<void>;
  reload: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <fieldset className="meeting-policy" disabled={busy || !!room.admittedAt}>
      <legend>Interview policy</legend>
      {[
        ["cameraAccommodation", "Approve camera accommodation"],
        ["screenRequired", "Require candidate screen sharing"],
        ["entireScreen", "Require entire screen (supported browsers only)"],
      ].map(([key, label]) => (
        <label className="checkbox-field" key={key}>
          <input
            type="checkbox"
            checked={!!room[key as keyof RoomState]}
            onChange={(e) =>
              void action("policy", async () => {
                await send(
                  `/interviews/${id}/room/policy`,
                  {
                    cameraAccommodation: room.cameraAccommodation,
                    screenRequired: room.screenRequired,
                    entireScreen: room.entireScreen,
                    [key]: e.target.checked,
                  },
                  "PATCH",
                );
                await reload();
              })
            }
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
