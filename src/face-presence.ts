import { useEffect, useRef, useState } from "react";
import { SustainedObservation } from "../shared/monitoring";
import type { ServiceStatus } from "../shared/types";

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
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ active, record });
  latest.current = { active, record };
  useEffect(() => {
    setReady(false);
    if (!enabled || !video) {
      setStatus(
        enabled ? "Waiting for camera preview" : "Face presence check is off",
      );
      return;
    }
    if (!services?.face) {
      setStatus("Face model is not configured; browser monitoring still works");
      return;
    }
    if (
      typeof Worker === "undefined" ||
      typeof createImageBitmap === "undefined"
    ) {
      setStatus(
        "Face check is unavailable in this browser; browser monitoring still works",
      );
      return;
    }
    let disposed = false,
      loaded = false,
      busy = false,
      failed = false;
    let calibrated = false,
      singleFrames = 0,
      lastFrame = -1,
      frameStarted = 0,
      lastFreshFrameAt = Date.now(),
      frameStalled = false;
    let frameTrack: MediaStreamTrack | undefined;
    let frameActive = false;
    let cameraReady: boolean | undefined;
    let wasActive = latest.current.active;
    const started = Date.now();
    const observation = new SustainedObservation();
    let worker: Worker;
    const failure = () => {
      if (disposed || failed) return;
      failed = true;
      setReady(false);
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
        if (disposed || failed) return;
        if (data.kind === "error") {
          console.warn("Optional face check:", data.message);
          return failure();
        }
        if (data.kind === "ready") {
          loaded = true;
          setStatus("Face model loaded · waiting for working camera frames");
          return;
        }
        if (data.kind !== "count") return;
        busy = false;
        // A result from a hidden page, stopped camera or pre-interview frame is not evidence.
        const track = (
          video.srcObject as MediaStream | null
        )?.getVideoTracks()[0];
        if (
          document.hidden ||
          !track?.enabled ||
          track.muted ||
          track.readyState !== "live" ||
          track !== frameTrack
        ) {
          observation.observe("unavailable", Date.now(), 0);
          return;
        }
        if (!calibrated) {
          singleFrames = data.count === 1 ? singleFrames + 1 : 0;
          if (singleFrames < 3) {
            setStatus(
              data.count === 1
                ? "Checking camera frames…"
                : "Camera check: place one face in view with good lighting",
            );
            return;
          }
          calibrated = true;
        }
        setReady(true);
        setStatus(
          latest.current.active
            ? data.count === 0
              ? "Face presence active · no face estimated in the current frame"
              : data.count > 1
                ? "Face presence active · multiple faces estimated in the current frame"
                : "Face presence active · local processing"
            : "Camera check passed · observations start after admission",
        );
        if (!latest.current.active || !wasActive || !frameActive) {
          observation.observe("unavailable", Date.now(), 0);
          return;
        }
        const result = observation.observe(
          data.count === 0
            ? "no-face"
            : data.count > 1
              ? "multiple-faces"
              : "one",
          Date.now(),
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
      worker.postMessage({
        kind: "init",
        model: new URL(services.faceModelUrl, location.href).href,
        wasm: new URL(services.mediapipeWasmUrl, location.href).href,
      });
    } catch {
      failure();
      return;
    }
    const timer = setInterval(async () => {
      if (disposed || failed) return;
      if (
        (!loaded && Date.now() - started > 30000) ||
        (busy && Date.now() - frameStarted > 10000)
      )
        return failure();
      if (wasActive !== latest.current.active) {
        wasActive = latest.current.active;
        observation.observe("unavailable", Date.now(), 0);
      }
      const track = (
        video.srcObject as MediaStream | null
      )?.getVideoTracks()[0];
      const available =
        !document.hidden &&
        !!track?.enabled &&
        !track.muted &&
        track.readyState === "live" &&
        video.readyState >= 2 &&
        !video.paused;
      if (!available) {
        observation.observe("unavailable", Date.now(), 0);
        lastFreshFrameAt = Date.now();
        if (cameraReady !== false) {
          setStatus("Face check paused · keep this page visible and camera on");
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
        observation.observe("unavailable", Date.now(), 0);
        // A live track can stop producing frames without ending or muting.
        // A frozen preview must not continue to advertise active observation.
        if (!frameStalled && Date.now() - lastFreshFrameAt >= 3000) {
          frameStalled = true;
          setReady(false);
          setStatus("Face check paused · waiting for fresh camera frames");
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
      try {
        const frame = await createImageBitmap(video, {
          resizeWidth: 320,
          resizeHeight: Math.max(
            1,
            Math.round((320 * video.videoHeight) / video.videoWidth),
          ),
        });
        if (disposed || failed) {
          frame.close();
          return;
        }
        try {
          worker.postMessage(
            { kind: "frame", frame, timestamp: performance.now() },
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
      worker.terminate();
    };
  }, [
    enabled,
    video,
    services?.face,
    services?.faceModelUrl,
    services?.mediapipeWasmUrl,
    services?.faceThresholdSeconds,
    attempt,
  ]);
  return { status, ready, retry: () => setAttempt((n) => n + 1) };
}
