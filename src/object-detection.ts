import { useEffect, useRef, useState } from "react";
import type { ServiceStatus } from "../shared/types";
import {
  objectDetectionSettings,
  objectFrameSize,
  objectThresholdMs,
  sanitizeCameraObjects,
  SustainedObjectObservations,
  type CameraObject,
} from "../shared/object-detection";

export type { CameraObject } from "../shared/object-detection";
type FrameRequest = {
  requestId: number;
  epoch: number;
  activityEpoch: number;
  cameraId: string;
  capturedAt: number;
  active: boolean;
  track: MediaStreamTrack;
  aspect: number;
};

/** Separate opt-in local preview; only sustained phone/book metadata may be recorded. */
export function useObjectDetection({
  enabled,
  active,
  localOnly = false,
  video,
  services,
  record,
}: {
  enabled: boolean;
  active: boolean;
  localOnly?: boolean;
  video: HTMLVideoElement | null;
  services: ServiceStatus | null;
  record: (
    kind: string,
    durationMs?: number,
    detail?: string,
    occurredAt?: number,
  ) => void;
}) {
  const [status, setStatus] = useState("Object detection is off");
  const [ready, setReady] = useState(false);
  const [detections, setDetections] = useState<CameraObject[]>([]);
  const [frameAspect, setFrameAspect] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const observationActive = active && !localOnly;
  const latest = useRef({
    enabled,
    active: observationActive,
    localOnly,
    record,
    activityEpoch: 0,
  });
  if (latest.current.active !== observationActive)
    latest.current.activityEpoch++;
  latest.current.active = observationActive;
  latest.current.localOnly = localOnly;
  latest.current.enabled = enabled;
  latest.current.record = record;
  const controls = useRef<{
    activityEpoch: number;
    reset: (message: string) => void;
  } | null>(null);

  useEffect(() => {
    setReady(false);
    setDetections([]);
    setFrameAspect(null);
    if (!enabled || !video) {
      setStatus(
        enabled
          ? "Object check waiting for camera preview"
          : "Object detection is off",
      );
      return;
    }
    if (
      !services?.objects ||
      !services.objectModelUrl ||
      !services.mediapipeWasmUrl
    ) {
      setStatus(
        "Object model is not configured; the camera and interview can continue.",
      );
      return;
    }
    if (
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap === "undefined"
    ) {
      setStatus(
        "Object detection is unavailable in this browser. The interview can continue.",
      );
      return;
    }
    let disposed = false,
      failed = false,
      loaded = false;
    let worker: Worker | undefined;
    let epoch = 0,
      nextRequestId = 0,
      lastVideoTime = -1,
      lastFreshAt = 0;
    let currentTrack: MediaStreamTrack | undefined;
    let pending: FrameRequest | null = null;
    let available: boolean | undefined;
    let stale = false;
    const started = Date.now();
    const observations = new SustainedObjectObservations();
    const reset = (message: string) => {
      epoch++;
      observations.reset();
      if (control === controls.current)
        control.activityEpoch = latest.current.activityEpoch;
      setReady(false);
      setDetections([]);
      setFrameAspect(null);
      setStatus(message);
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
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      worker?.terminate();
      reset(
        "Object check unavailable. Restart the check or leave it off; no object inference is active.",
      );
    };
    const visibility = () => {
      if (document.hidden && !disposed) {
        available = false;
        reset(
          "Object check paused · keep the interview page visible and camera on.",
        );
      }
    };
    document.addEventListener("visibilitychange", visibility);
    try {
      worker = new Worker(
        new URL("./object-detection.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onerror = fail;
      worker.onmessage = ({ data }) => {
        if (disposed || failed || !latest.current.enabled) return;
        if (data.kind === "error") return fail();
        if (data.kind === "ready") {
          loaded = true;
          setStatus("Object model loaded · waiting for fresh camera images.");
          return;
        }
        if (
          data.kind !== "detections" ||
          !pending ||
          pending.requestId !== data.requestId
        )
          return;
        const frame = pending;
        pending = null;
        const track = trackNow();
        if (
          frame.epoch !== epoch ||
          frame.activityEpoch !== latest.current.activityEpoch ||
          data.epoch !== frame.epoch ||
          data.activityEpoch !== frame.activityEpoch ||
          data.cameraId !== frame.cameraId ||
          data.capturedAt !== frame.capturedAt ||
          data.active !== frame.active
        )
          return;
        if (!usable(track) || track !== frame.track) {
          available = false;
          reset(
            "Object check paused · camera images are unavailable or the camera changed.",
          );
          return;
        }
        const age = Date.now() - frame.capturedAt;
        if (age < 0 || age > objectDetectionSettings.freshFrameMs) {
          stale = true;
          reset(
            "Object check paused · waiting for fresh camera results. Slow frames are not observations.",
          );
          return;
        }
        const objects = sanitizeCameraObjects(data.detections);
        stale = false;
        setDetections(objects);
        setFrameAspect(frame.aspect);
        setReady(true);
        setStatus(
          `${latest.current.active ? "Object check active" : "Object preview"} · ${objects.length ? `${objects.length} supported object(s) estimated` : "no supported objects estimated in this frame"}${latest.current.localOnly ? "; local preview only; no observations shared." : latest.current.active ? "." : "; observations start after admission."}`,
        );
        if (!frame.active || !latest.current.active) {
          observations.reset();
          return;
        }
        for (const event of observations.observe(
          objects,
          frame.capturedAt,
          objectThresholdMs(services.objectThresholdSeconds),
        )) {
          latest.current.record(
            "object-detected",
            event.durationMs,
            `Estimated ${event.label} in camera view; human review required`,
            frame.capturedAt,
          );
        }
      };
      worker.postMessage({
        kind: "init",
        model: new URL(services.objectModelUrl, location.href).href,
        wasm: new URL(services.mediapipeWasmUrl, location.href).href,
      });
      setStatus("Loading the local object model…");
    } catch {
      fail();
    }
    const timer = setInterval(async () => {
      if (disposed || failed || !latest.current.enabled) return;
      if (
        (!loaded && Date.now() - started > 30000) ||
        (pending && Date.now() - pending.capturedAt > 10000)
      )
        return fail();
      const track = trackNow();
      if (!usable(track)) {
        if (available !== false)
          reset(
            "Object check paused · keep the interview page visible and camera on.",
          );
        available = false;
        return;
      }
      if (control.activityEpoch !== latest.current.activityEpoch)
        reset(
          "Object check waiting for fresh images after the interview state changed.",
        );
      if (currentTrack && track !== currentTrack) {
        reset("Object camera changed · waiting for fresh images.");
        lastVideoTime = -1;
        lastFreshAt = 0;
      }
      currentTrack = track;
      available = true;
      if (
        lastFreshAt &&
        Date.now() - lastFreshAt > objectDetectionSettings.freshFrameMs &&
        !stale
      ) {
        stale = true;
        reset("Object check paused · waiting for fresh camera images.");
      }
      if (!loaded || pending || lastVideoTime === video.currentTime) return;
      const size = objectFrameSize(video.videoWidth, video.videoHeight);
      if (!size) return;
      lastVideoTime = video.currentTime;
      lastFreshAt = Date.now();
      const frame: FrameRequest = {
        requestId: ++nextRequestId,
        epoch,
        activityEpoch: latest.current.activityEpoch,
        cameraId: track!.id,
        capturedAt: lastFreshAt,
        active: latest.current.active,
        track: track!,
        aspect: video.videoWidth / video.videoHeight,
      };
      pending = frame;
      try {
        const bitmap = await createImageBitmap(video, {
          resizeWidth: size.width,
          resizeHeight: size.height,
        });
        if (
          disposed ||
          !latest.current.enabled ||
          failed ||
          frame.epoch !== epoch ||
          frame.activityEpoch !== latest.current.activityEpoch ||
          trackNow() !== frame.track ||
          !usable(frame.track)
        ) {
          bitmap.close();
          if (pending === frame) pending = null;
          return;
        }
        const { track: _track, aspect: _aspect, ...metadata } = frame;
        try {
          worker!.postMessage(
            {
              kind: "frame",
              frame: bitmap,
              timestamp: performance.now(),
              ...metadata,
            },
            [bitmap],
          );
        } catch (error) {
          bitmap.close();
          throw error;
        }
      } catch {
        if (!disposed) fail();
      }
    }, objectDetectionSettings.frameIntervalMs);
    return () => {
      disposed = true;
      observations.reset();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      worker?.terminate();
      if (controls.current === control) controls.current = null;
    };
  }, [
    enabled,
    video,
    services?.objects,
    services?.objectModelUrl,
    services?.mediapipeWasmUrl,
    services?.objectThresholdSeconds,
    attempt,
  ]);

  useEffect(() => {
    if (
      controls.current &&
      controls.current.activityEpoch !== latest.current.activityEpoch
    )
      controls.current.reset(
        "Object check waiting for fresh images after the interview state changed.",
      );
  }, [active, localOnly]);
  return {
    status,
    ready,
    detections,
    frameAspect,
    retry: () => setAttempt((n) => n + 1),
  };
}
