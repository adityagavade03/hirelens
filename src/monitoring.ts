import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServiceStatus } from "../shared/types";
import { api } from "./api";
import { headTurned } from "../shared/orientation";
import { MonitoringQueue } from "./monitoring-queue";
import { SustainedObservation, tabSwitchThreshold } from "../shared/monitoring";
export function useMonitoring(
  id: string,
  enabled: boolean,
  video: HTMLVideoElement | null,
  services: ServiceStatus | null,
  onState: (state: string) => void,
) {
  const [delivery, setDelivery] = useState("Waiting for monitoring consent");
  const [faceAttempt, setFaceAttempt] = useState(0);
  const [warning, setWarning] = useState("");
  const [tabDepartures, setTabDepartures] = useState(0);
  const departures = useRef(0);
  const warningThreshold = tabSwitchThreshold(
    services?.tabSwitchWarningThreshold,
  );
  const threshold = useRef(warningThreshold);
  threshold.current = warningThreshold;
  const expectedUntil = useRef(0);
  const context = useRef("Connection starting");
  const queue = useMemo(() => {
    let storage: Storage | null = null;
    try {
      storage = sessionStorage;
    } catch {
      /* Memory-only fallback. */
    }
    return new MonitoringQueue(
      id,
      storage,
      (events, keepalive) =>
        api(`/interviews/${id}/events`, {
          method: "POST",
          body: JSON.stringify({ events }),
          keepalive,
          signal: AbortSignal.timeout(10000),
        }),
      (count, failed) =>
        setDelivery(
          failed
            ? `${count} events waiting to sync · reconnect and keep this tab open`
            : count
              ? `${count} events waiting to sync`
              : "Event metadata saved",
        ),
    );
  }, [id]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const record = useCallback(
    (kind: string, durationMs = 0, detail = "") => {
      if (enabledRef.current) {
        const messages: Record<string, string> = {
          "no-face":
            "Your face was not detected for a sustained interval. Check your camera position and lighting, or tell your interviewer if you need an accommodation.",
          "multiple-faces":
            "More than one face was estimated in the camera view. Check your surroundings and explain any context to your interviewer.",
          "head-turned":
            "A sustained head turn was estimated. This is not a measure of attention; your interviewer can review the context.",
          "camera-off":
            "Your camera is unavailable. Restore it in device settings, or tell your interviewer about a technical issue or accommodation.",
          "monitoring-unavailable":
            "Part of monitoring is unavailable. Check the monitoring status or tell your interviewer. The interview can continue.",
        };
        if (messages[kind])
          setWarning(
            `${messages[kind]} Event metadata is queued for human review; this does not determine misconduct.`,
          );
        queue.add(
          kind,
          durationMs,
          `${detail}${detail ? " · " : ""}${context.current} · ${navigator.onLine ? "browser online" : "browser offline"}`.slice(
            0,
            200,
          ),
        );
        void queue.flush();
      }
    },
    [queue],
  );
  const flush = useCallback(() => queue.flush(), [queue]);
  useEffect(() => {
    if (!enabled) return;
    let hiddenAt: number | null = null;
    let blurAt: number | null = null;
    let offlineAt = 0;
    let away = false;
    const expected = () => Date.now() < expectedUntil.current;
    const returned = () => {
      // Some browsers emit focus before visibilitychange. Keep the pending
      // warning until the page is actually visible instead of losing it.
      if (document.hidden) return;
      if (away) {
        setWarning(
          departures.current >= threshold.current
            ? `The interview tab has been left ${departures.current} times, reaching the review threshold of ${threshold.current}. Please stay on this page and explain any technical issues or accommodations to your interviewer. These events do not determine misconduct.`
            : "Please stay on the interview page. An activity event has been recorded for the interviewer to review.",
        );
      }
      away = false;
    };
    queue.add("monitoring-started", 0, "Consented browser monitoring active");
    void queue.flush();
    const pagehide = () => {
      void queue.flush(true);
    };
    const visibility = () => {
      if (document.hidden) {
        if (hiddenAt !== null) return;
        away = true;
        hiddenAt = Date.now();
        departures.current += 1;
        setTabDepartures(departures.current);
        record(
          "hidden",
          0,
          `Tab departure ${departures.current}${expected() ? "; device permission request may provide context" : ""}`,
        );
        void queue.flush(true);
      } else {
        if (hiddenAt !== null)
          record(
            "visible",
            Date.now() - hiddenAt,
            `Returned after tab departure ${departures.current}`,
          );
        hiddenAt = null;
        returned();
      }
    };
    const blur = () => {
      if (expected() || blurAt !== null) return;
      away = true;
      blurAt = Date.now();
      record("blur");
    };
    const focus = () => {
      if (blurAt !== null) record("focus", Date.now() - blurAt);
      blurAt = null;
      returned();
    };
    const fullscreen = () => {
      if (!document.fullscreenElement && !expected()) record("fullscreen-exit");
    };
    const copy = (e: ClipboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("[data-interview-editor]")
      )
        record("copy", 0, "Interview editor; clipboard contents not collected");
    };
    const paste = (e: ClipboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("[data-interview-editor]")
      )
        record(
          "paste",
          0,
          "Interview editor; clipboard contents not collected",
        );
    };
    const offline = () => {
      offlineAt = Date.now();
      record("connection-interrupted");
    };
    const online = () => {
      record("connection-restored", offlineAt ? Date.now() - offlineAt : 0);
      offlineAt = 0;
      void flush();
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("copy", copy);
    document.addEventListener("paste", paste);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("pagehide", pagehide);
    if (document.hidden) visibility();
    const timer = window.setInterval(flush, 4000);
    return () => {
      queue.add(
        "monitoring-stopped",
        0,
        "Browser monitoring stopped or room closed",
      );
      void queue.flush(true);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("copy", copy);
      document.removeEventListener("paste", paste);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [queue, enabled, record, flush]);
  useEffect(() => {
    if (!enabled || !video || !services) return;
    if (!services.face) {
      onState("Face detection needs configuration");
      record("monitoring-unavailable", 0, "Face model is not configured");
      return;
    }
    let cancelled = false;
    let detector: import("@mediapipe/tasks-vision").FaceDetector | undefined;
    let landmarker:
      import("@mediapipe/tasks-vision").FaceLandmarker | undefined;
    let timer: number;
    const observation = new SustainedObservation();
    let cameraReady: boolean | undefined;
    let lastFrame = -1;
    let lastFreshFrameAt = Date.now();
    let frameStalled = false;
    const start = async () => {
      try {
        const { FilesetResolver, FaceDetector, FaceLandmarker } =
          await import("@mediapipe/tasks-vision");
        const files = await FilesetResolver.forVisionTasks(
          services.mediapipeWasmUrl,
        );
        if (services.faceLandmarkModelUrl) {
          try {
            landmarker = await FaceLandmarker.createFromOptions(files, {
              baseOptions: { modelAssetPath: services.faceLandmarkModelUrl },
              runningMode: "VIDEO",
              numFaces: 2,
              outputFaceBlendshapes: false,
              outputFacialTransformationMatrixes: false,
            });
          } catch {
            record(
              "monitoring-unavailable",
              0,
              "Head orientation model unavailable; trying face presence detection",
            );
          }
        }
        if (!landmarker)
          detector = await FaceDetector.createFromOptions(files, {
            baseOptions: { modelAssetPath: services.faceModelUrl },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.6,
          });
        if (cancelled) {
          detector?.close();
          landmarker?.close();
          return;
        }
        onState(
          landmarker
            ? "Face presence & coarse head orientation · local processing"
            : "Face detection active · frames stay local",
        );
        timer = window.setInterval(() => {
          if (cancelled || (!detector && !landmarker)) return;
          if (document.hidden) {
            observation.observe("unavailable", Date.now(), 0);
            lastFreshFrameAt = Date.now();
            return;
          }
          const track = (
            video.srcObject as MediaStream | null
          )?.getVideoTracks()[0];
          const ready = !!(
            track &&
            track.enabled &&
            !track.muted &&
            track.readyState === "live" &&
            video.readyState >= 2 &&
            !video.paused
          );
          if (ready !== cameraReady) {
            cameraReady = ready;
            onState(
              ready
                ? landmarker
                  ? "Face presence & coarse head orientation · local processing"
                  : "Face presence · local processing"
                : "Face monitoring paused · enable a working camera",
            );
            if (!ready)
              record(
                "monitoring-unavailable",
                0,
                "Camera is off, paused or unavailable; face presence cannot be checked",
              );
          }
          if (!ready) {
            observation.observe("unavailable", Date.now(), 0);
            lastFreshFrameAt = Date.now();
            return;
          }
          if (video.currentTime === lastFrame) {
            observation.observe("unavailable", Date.now(), 0);
            if (!frameStalled && Date.now() - lastFreshFrameAt >= 3000) {
              frameStalled = true;
              onState(
                "Face monitoring paused · waiting for fresh camera frames",
              );
              record(
                "monitoring-unavailable",
                0,
                "Camera frames stopped advancing; no face inference made",
              );
            }
            return;
          }
          if (frameStalled) onState("Face presence · local processing");
          frameStalled = false;
          lastFreshFrameAt = Date.now();
          lastFrame = video.currentTime;
          try {
            const landmarks = landmarker?.detectForVideo(
              video,
              performance.now(),
            ).faceLandmarks;
            const count = landmarks
              ? landmarks.length
              : detector!.detectForVideo(video, performance.now()).detections
                  .length;
            const next =
              count === 0
                ? "no-face"
                : count > 1
                  ? "multiple-faces"
                  : landmarks?.[0] && headTurned(landmarks[0])
                    ? "head-turned"
                    : "one";
            const observed = observation.observe(
              next,
              Date.now(),
              services.faceThresholdSeconds * 1000,
            );
            if (observed) {
              record(
                observed.kind,
                observed.durationMs,
                observed.kind === "head-turned"
                  ? "Coarse camera-relative orientation only; not gaze or attention."
                  : "",
              );
            }
          } catch {
            onState("Face detection unavailable");
            clearInterval(timer);
            record("monitoring-unavailable", 0, "Face detector failed");
          }
        }, 750);
      } catch {
        if (!cancelled) {
          onState("Face detection unavailable");
          record(
            "monitoring-unavailable",
            0,
            "Face detector model could not load",
          );
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      clearInterval(timer);
      detector?.close();
      landmarker?.close();
    };
  }, [
    id,
    enabled,
    video,
    services?.faceModelUrl,
    services?.faceLandmarkModelUrl,
    services?.mediapipeWasmUrl,
    services?.face,
    services?.faceThresholdSeconds,
    record,
    onState,
    faceAttempt,
  ]);
  return {
    warning,
    tabDepartures,
    warningThreshold,
    dismissWarning: () => setWarning(""),
    setConnection: (value: string) => {
      context.current = value;
    },
    permissionDialog: async <T>(work: () => Promise<T>): Promise<T> => {
      // Only suppress incidental focus/fullscreen changes for a bounded prompt.
      // Genuine page hiding is still recorded, with permission-request context.
      const deadline = Date.now() + 30000;
      expectedUntil.current = deadline;
      try {
        return await work();
      } finally {
        if (expectedUntil.current === deadline)
          expectedUntil.current = Math.min(deadline, Date.now() + 1200);
      }
    },
    record,
    flush,
    delivery,
    retryFace: () => setFaceAttempt((n) => n + 1),
  };
}
