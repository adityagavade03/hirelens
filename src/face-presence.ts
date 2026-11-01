import { useEffect, useRef, useState } from "react";
import { SustainedObservation } from "../shared/monitoring";
import type { ServiceStatus } from "../shared/types";
export type CameraCheckState =
  "off" | "loading" | "ready" | "paused" | "error" | "not-configured";

export function useFacePresence({
  enabled,
  active,
  video,
  services,
  record,
}: {
  enabled: boolean;
  active: boolean;
  video: HTMLVideoElement | null;
  services: ServiceStatus | null;
  record: (kind: string, duration?: number, detail?: string) => void;
}) {
  const [status, setStatus] = useState("Face presence check is off");
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<CameraCheckState>("off");
  const [count, setCount] = useState<number | null>(null);
  const [model, setModel] = useState("BlazeFace");
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ enabled, active, record, activityEpoch: 0 });
  if (latest.current.active !== active) latest.current.activityEpoch++;
  latest.current.enabled = enabled;
  latest.current.active = active;
  latest.current.record = record;
  const controls = useRef<{
    activityEpoch: number;
    reset: (message: string) => void;
  } | null>(null);
  useEffect(() => {
    setReady(false);
    setCount(null);
    if (!enabled || !video) {
      setState(enabled ? "paused" : "off");
      setStatus(
        enabled ? "Waiting for camera preview" : "Face presence check is off",
      );
      return;
    }
    if (
      !services?.face ||
      !services.faceModelUrl ||
      !services.mediapipeWasmUrl
    ) {
      setState("not-configured");
      setStatus("Face model is not configured; browser monitoring still works");
      return;
    }
    if (
      typeof Worker === "undefined" ||
      typeof createImageBitmap === "undefined"
    ) {
      setState("error");
      setStatus(
        "Face check is unavailable in this browser; browser monitoring still works",
      );
      return;
    }
    let disposed = false,
      loaded = false,
      busy = false,
      failed = false;
    let lastFrame = -1,
      frameStarted = 0,
      lastFreshFrameAt = Date.now(),
      frameStalled = false;
    let requestId = 0,
      epoch = 0,
      frameEpoch = 0,
      frameActivityEpoch = 0;
    let frameTrack: MediaStreamTrack | undefined;
    let frameActive = false;
    let cameraReady: boolean | undefined;
    const started = Date.now();
    const observation = new SustainedObservation();
    const reset = (message: string) => {
      epoch++;
      observation.observe("unavailable", Date.now(), 0);
      setReady(false);
      setCount(null);
      setState("paused");
      setStatus(message);
      if (controls.current === control)
        control.activityEpoch = latest.current.activityEpoch;
    };
    const control = { activityEpoch: latest.current.activityEpoch, reset };
    controls.current = control;
    const trackNow = () =>
      (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    const usable = (track: MediaStreamTrack | undefined) =>
      !document.hidden &&
      !!track?.enabled &&
      !track.muted &&
      track.readyState === "live" &&
      video.readyState >= 2 &&
      !video.paused &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;
    const visibility = () => {
      if (!document.hidden || disposed || failed) return;
      cameraReady = false;
      reset("Face check paused · keep this page visible and camera on");
      if (latest.current.active)
        latest.current.record(
          "monitoring-unavailable",
          0,
          "Face check paused; camera/page unavailable, no inference made",
        );
    };
    let worker: Worker;
    const failure = () => {
      if (disposed || failed) return;
      failed = true;
      setReady(false);
      setCount(null);
      setState("error");
      setStatus(
        "Face check unavailable · retry or leave it off; the interview can continue",
      );
      if (latest.current.active)
        latest.current.record(
          "monitoring-unavailable",
          0,
          "Optional face presence check failed; no inference made",
        );
      worker?.terminate();
    };
    document.addEventListener("visibilitychange", visibility);
    try {
      worker = new Worker(
        new URL("./face-presence.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onerror = (event) => {
        console.warn("Optional face worker could not start:", event.message);
        failure();
      };
      worker.onmessage = ({ data }) => {
        if (disposed || failed || !latest.current.enabled) return;
        if (data.kind === "error") {
          console.warn("Optional face check:", data.message);
          return failure();
        }
        if (data.kind === "loading") {
          setState("loading");
          setStatus(
            "Loading Face Landmarker fallback · camera images stay on this device",
          );
          return;
        }
        if (data.kind === "ready") {
          loaded = true;
          setModel(
            data.model === "Face Landmarker fallback"
              ? data.model
              : "BlazeFace",
          );
          setStatus("Face model loaded · waiting for working camera frames");
          return;
        }
        if (data.kind !== "count") return;
        if (!busy || data.requestId !== requestId) return;
        busy = false;
        if (
          frameEpoch !== epoch ||
          frameActivityEpoch !== latest.current.activityEpoch
        )
          return;
        // A result from a hidden page, stopped camera or pre-interview frame is not evidence.
        const track = trackNow();
        if (
          !usable(track) ||
          track !== frameTrack ||
          Date.now() < frameStarted ||
          Date.now() - frameStarted > 5000
        ) {
          reset("Face check paused · waiting for fresh camera frames");
          return;
        }
        // Zero/multiple faces are valid model results too. Requiring a prior
        // one-face calibration silently disabled these checks indefinitely.
        if (!Number.isInteger(data.count) || data.count < 0 || data.count > 100)
          return failure();
        setReady(true);
        setCount(data.count);
        setState("ready");
        setStatus(
          latest.current.active
            ? data.count === 0
              ? "Face presence active · no face estimated in the current frame"
              : data.count > 1
                ? "Face presence active · multiple faces estimated in the current frame"
                : "Face presence active · local processing"
            : `Camera preview · ${data.count} face${data.count === 1 ? "" : "s"} estimated; observations start after admission`,
        );
        if (!latest.current.active || !frameActive) {
          observation.observe("unavailable", frameStarted, 0);
          return;
        }
        const result = observation.observe(
          data.count === 0
            ? "no-face"
            : data.count > 1
              ? "multiple-faces"
              : "one",
          frameStarted,
          Math.max(3, services.faceThresholdSeconds) * 1000,
        );
        if (result)
          latest.current.record(
            result.kind,
            result.durationMs,
            "Optional local face presence estimate; human review required",
          );
      };
      setStatus("Loading local face model…");
      setState("loading");
      worker.postMessage({
        kind: "init",
        model: new URL(services.faceModelUrl, location.href).href,
        wasm: new URL(services.mediapipeWasmUrl, location.href).href,
        fallbackModel: services.faceLandmarkModelUrl
          ? new URL(services.faceLandmarkModelUrl, location.href).href
          : undefined,
      });
    } catch {
      failure();
      document.removeEventListener("visibilitychange", visibility);
      if (controls.current === control) controls.current = null;
      return;
    }
    const timer = setInterval(async () => {
      if (disposed || failed || !latest.current.enabled) return;
      if (
        (!loaded && Date.now() - started > 60000) ||
        (busy && Date.now() - frameStarted > 10000)
      )
        return failure();
      if (control.activityEpoch !== latest.current.activityEpoch)
        reset(
          "Face check waiting for fresh images after the interview state changed",
        );
      const track = trackNow();
      const available = usable(track);
      if (!available) {
        lastFreshFrameAt = Date.now();
        if (cameraReady !== false) {
          reset("Face check paused · keep this page visible and camera on");
          if (latest.current.active)
            latest.current.record(
              "monitoring-unavailable",
              0,
              "Face check paused; camera/page unavailable, no inference made",
            );
        }
        cameraReady = false;
        return;
      }
      cameraReady = true;
      if (!loaded || busy) return;
      if (lastFrame === video.currentTime) {
        // A live track can stop producing frames without ending or muting.
        // A frozen preview must not continue to advertise active observation.
        if (!frameStalled && Date.now() - lastFreshFrameAt >= 3000) {
          frameStalled = true;
          reset("Face check paused · waiting for fresh camera frames");
          if (latest.current.active)
            latest.current.record(
              "monitoring-unavailable",
              0,
              "Camera frames stopped advancing; no face inference made",
            );
        }
        return;
      }
      lastFrame = video.currentTime;
      lastFreshFrameAt = Date.now();
      frameStalled = false;
      busy = true;
      frameStarted = Date.now();
      frameTrack = track;
      frameActive = latest.current.active;
      frameEpoch = epoch;
      frameActivityEpoch = latest.current.activityEpoch;
      requestId++;
      try {
        const frame = await createImageBitmap(video, {
          resizeWidth: Math.min(640, video.videoWidth),
          resizeHeight: Math.max(
            1,
            Math.round(
              (Math.min(640, video.videoWidth) * video.videoHeight) /
                video.videoWidth,
            ),
          ),
        });
        if (
          disposed ||
          failed ||
          !latest.current.enabled ||
          frameEpoch !== epoch ||
          frameActivityEpoch !== latest.current.activityEpoch ||
          !usable(trackNow()) ||
          trackNow() !== frameTrack
        ) {
          frame.close();
          busy = false;
          return;
        }
        try {
          worker.postMessage(
            { kind: "frame", frame, timestamp: performance.now(), requestId },
            [frame],
          );
        } catch (error) {
          frame.close();
          throw error;
        }
      } catch {
        failure();
      }
    }, 750);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      if (controls.current === control) controls.current = null;
      worker.terminate();
    };
  }, [
    enabled,
    video,
    services?.face,
    services?.faceModelUrl,
    services?.faceLandmarkModelUrl,
    services?.mediapipeWasmUrl,
    services?.faceThresholdSeconds,
    attempt,
  ]);
  useEffect(() => {
    if (
      controls.current &&
      controls.current.activityEpoch !== latest.current.activityEpoch
    )
      controls.current.reset(
        "Face check waiting for fresh images after the interview state changed",
      );
  }, [active]);
  return {
    status,
    state,
    ready,
    count,
    model,
    retry: () => setAttempt((n) => n + 1),
  };
}
