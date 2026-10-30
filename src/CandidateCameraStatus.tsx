import { useEffect, useRef, useState } from "react";
import { send } from "./api";
import type { CameraObject } from "../shared/object-detection";
import {
  freshCameraSnapshot,
  type CandidateCameraStatus,
  type CameraCheckState,
} from "../shared/camera-status";

export function useCandidateCameraStatus(input: {
  id: string;
  enabled: boolean;
  active: boolean;
  camera: boolean;
  face: { state: CameraCheckState; count: number | null };
  objects: {
    state: CameraCheckState;
    detections: CameraObject[];
    frameAspect: number | null;
  };
}) {
  const latest = useRef(input);
  latest.current = input;
  const [error, setError] = useState("");
  useEffect(() => {
    if (!input.enabled || !input.active) return;
    let disposed = false,
      busy = false;
    const report = async () => {
      if (busy || disposed) return;
      busy = true;
      const value = latest.current;
      const camera = value.camera && !document.hidden;
      try {
        await send(`/interviews/${value.id}/room/camera-status`, {
          camera,
          face: {
            state:
              !camera && value.face.state !== "off"
                ? "paused"
                : value.face.state,
            count: camera ? value.face.count : null,
          },
          objects: {
            state:
              !camera && value.objects.state !== "off"
                ? "paused"
                : value.objects.state,
            items: camera
              ? value.objects.detections
                  .filter((d) => d.label === "cell phone" || d.label === "book")
                  .slice(0, 8)
              : [],
          },
          frameAspect: value.objects.frameAspect,
        });
        if (!disposed) setError("");
      } catch {
        if (!disposed)
          setError(
            "Live check status could not reach the interviewer. Camera analysis may still be running locally; retry your connection.",
          );
      } finally {
        busy = false;
      }
    };
    void report();
    const timer = setInterval(() => void report(), 5000);
    const visibility = () => void report();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [input.id, input.enabled, input.active]);
  return error;
}

const labels: Record<CameraCheckState, string> = {
  off: "Off on candidate device",
  loading: "Loading model",
  ready: "Receiving estimates",
  paused: "Paused — camera or page unavailable",
  error: "Check unavailable — candidate can retry",
  "not-configured": "Model unavailable",
};
export function CandidateCameraReview({
  snapshot,
  faceConsent,
  objectConsent,
}: {
  snapshot?: CandidateCameraStatus;
  faceConsent?: boolean;
  objectConsent?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);
  const fresh = freshCameraSnapshot(snapshot, now);
  return (
    <section
      className="candidate-camera-review"
      aria-label="Candidate camera checks"
    >
      <h3>Candidate camera checks</h3>
      <p className="muted">
        Estimates from the candidate’s device. Your HR camera is used only for
        the video call.
      </p>
      {!fresh || !snapshot ? (
        <p role="status">
          {snapshot
            ? "Status is stale — waiting for the candidate device. Previous estimates are hidden."
            : "Waiting for candidate admission and device status."}
        </p>
      ) : (
        <>
          <p>
            Candidate camera:{" "}
            <strong>{snapshot.camera ? "On" : "Off or paused"}</strong> ·
            Updated{" "}
            {Math.max(0, Math.floor((now - Date.parse(snapshot.at)) / 1000))}{" "}
            seconds ago
          </p>
          <p>
            Face check:{" "}
            <strong>
              {faceConsent
                ? labels[snapshot.face.state]
                : "Not enabled by candidate"}
            </strong>
            {faceConsent &&
            snapshot.camera &&
            snapshot.face.state === "ready" &&
            snapshot.face.count !== null
              ? ` · ${snapshot.face.count} face(s) estimated`
              : ""}
          </p>
          <p>
            Phone / book check:{" "}
            <strong>
              {objectConsent
                ? labels[snapshot.objects.state]
                : "Not enabled by candidate"}
            </strong>
          </p>
          {objectConsent &&
            snapshot.camera &&
            snapshot.objects.state === "ready" && (
              <p>
                {snapshot.objects.items.length
                  ? snapshot.objects.items
                      .map(
                        (o) =>
                          `${o.label} (${Math.round(o.score * 100)}% model score)`,
                      )
                      .join(", ")
                  : "No phone or book estimated in the latest processed frame."}
              </p>
            )}
        </>
      )}
      <small>
        Use the event timeline and discuss observations with the candidate.
        These estimates do not establish misconduct or identify a person.
      </small>
    </section>
  );
}
