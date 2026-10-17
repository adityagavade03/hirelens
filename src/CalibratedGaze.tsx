import { useEffect, useRef, useState } from "react";
import type { ServiceStatus } from "../shared/types";
import {
  fitGaze,
  predictGaze,
  validateGaze,
  sampleMatchesGazeTarget,
  gazeTargets,
  gazeValidationTargets,
  type GazeCalibration,
  type GazeSample,
} from "../shared/gaze-calibration";
import "./gaze.css";

/** Local calibration preview only. It deliberately has no monitoring/score API. */
export function CalibratedGaze({
  video,
  services,
  active = false,
}: {
  video: HTMLVideoElement | null;
  services: ServiceStatus | null;
  active?: boolean;
}) {
  const [enabled, setEnabled] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Optional gaze calibration is off");
  const [step, setStep] = useState<number | null>(null),
    [estimate, setEstimate] = useState<string>("");
  const [validation, setValidation] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const collection = useRef<{
    step: number;
    started: number;
    train: GazeSample[];
    validation: GazeSample[];
    count: number;
  } | null>(null);
  const calibration = useRef<GazeCalibration | null>(null);
  const generation = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const invalidate = (message: string) => {
    generation.current++;
    collection.current = null;
    calibration.current = null;
    setStep(null);
    setValidation(null);
    setEstimate("");
    setStatus(message);
  };
  useEffect(() => {
    if (step == null) {
      dialog.current?.close();
      return;
    }
    if (!dialog.current?.open) dialog.current?.showModal();
  }, [step]);
  useEffect(() => {
    setLoaded(false);
    invalidate(
      enabled
        ? "Waiting for a working camera preview"
        : "Optional gaze calibration is off",
    );
    if (!enabled || !video) return;
    if (
      !services?.faceLandmarkModelUrl ||
      !services.mediapipeWasmUrl ||
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap === "undefined"
    ) {
      setStatus(
        "Local eye-image model or browser support is unavailable. The interview can continue.",
      );
      return;
    }
    let worker: Worker | undefined,
      disposed = false,
      ready = false,
      busy = false,
      failed = false;
    let requestAt = 0,
      lastTime = -1,
      cameraId = "";
    const started = Date.now();
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      worker?.terminate();
      setLoaded(false);
      invalidate(
        "Gaze preview unavailable. Leave it off or toggle it to retry; no observation was saved.",
      );
    };
    const pause = () =>
      invalidate(
        "Calibration expired after the page, camera or layout changed. Calibrate again before previewing.",
      );
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("resize", pause);
    document.addEventListener("visibilitychange", visibility);
    try {
      worker = new Worker(new URL("./gaze.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onerror = fail;
      worker.onmessage = ({ data }) => {
        if (disposed || failed) return;
        if (data.kind === "error") return fail();
        if (data.kind === "ready") {
          ready = true;
          setLoaded(true);
          setStatus(
            "Eye-image model loaded. Start calibration before using the preview.",
          );
          return;
        }
        if (data.kind !== "sample") return;
        busy = false;
        const track = (
          video.srcObject as MediaStream | null
        )?.getVideoTracks()[0];
        if (
          document.hidden ||
          !track?.enabled ||
          track.muted ||
          track.readyState !== "live" ||
          track.id !== data.cameraId ||
          data.generation !== generation.current
        )
          return;
        const features = data.features as number[] | null,
          c = collection.current;
        if (c) {
          if (activeRef.current) {
            invalidate(
              "The interview started; calibration stopped. You can leave this optional preview off.",
            );
            return;
          }
          if (Date.now() - c.started > 12000) {
            invalidate(
              "Not enough clear eye images. Improve lighting, keep both eyes visible and retry calibration.",
            );
            return;
          }
          // Associate a result with the target present at CAPTURE time, never arrival time.
          if (
            !features ||
            !sampleMatchesGazeTarget(
              data,
              {
                generation: generation.current,
                step: c.step,
                started: c.started,
                cameraId: track.id,
              },
              activeRef.current,
            )
          )
            return;
          const training = c.step < gazeTargets.length;
          const target = training
            ? gazeTargets[c.step]
            : gazeValidationTargets[c.step - gazeTargets.length];
          (training ? c.train : c.validation).push({ features, ...target });
          if (++c.count < 8) return;
          c.count = 0;
          c.started = Date.now();
          c.step++;
          try {
            if (c.step === gazeTargets.length)
              calibration.current = fitGaze(c.train);
            if (c.step === gazeTargets.length + gazeValidationTargets.length) {
              const checked = validateGaze(calibration.current!, c.validation);
              collection.current = null;
              setStep(null);
              if (!checked.accepted) {
                invalidate(
                  "Calibration did not pass the independent check. No gaze estimates will be shown. Try better lighting or leave this optional feature off.",
                );
                return;
              }
              setValidation(checked.medianError);
              setStatus(
                "Calibration passed for this position and lighting. Local preview only; no monitoring events or scores are generated.",
              );
            } else setStep(c.step);
          } catch (error) {
            invalidate((error as Error).message);
          }
          return;
        }
        if (!calibration.current) return;
        const predicted = features
          ? predictGaze(calibration.current, features)
          : null;
        // Do not extrapolate off-screen gaze from a calibration containing only screen targets.
        if (
          !predicted ||
          predicted.x < 0 ||
          predicted.x > 1 ||
          predicted.y < 0 ||
          predicted.y > 1
        ) {
          setEstimate("Estimate unavailable / outside calibrated area");
          return;
        }
        const horizontal =
          predicted.x < 1 / 3
            ? "left"
            : predicted.x > 2 / 3
              ? "right"
              : "center";
        const vertical =
          predicted.y < 1 / 3
            ? "upper"
            : predicted.y > 2 / 3
              ? "lower"
              : "middle";
        setEstimate(`Estimated screen region: ${vertical} ${horizontal}`);
      };
      worker.postMessage({
        kind: "init",
        model: new URL(services.faceLandmarkModelUrl, location.href).href,
        wasm: new URL(services.mediapipeWasmUrl, location.href).href,
      });
      setStatus("Loading the local eye-image model…");
    } catch {
      fail();
    }
    const timer = setInterval(async () => {
      if (disposed || failed) return;
      if (
        (!ready && Date.now() - started > 30000) ||
        (busy && Date.now() - requestAt > 10000)
      )
        return fail();
      const track = (
        video.srcObject as MediaStream | null
      )?.getVideoTracks()[0];
      if (
        !track?.enabled ||
        track.muted ||
        track.readyState !== "live" ||
        document.hidden ||
        video.readyState < 2 ||
        video.paused
      ) {
        if (calibration.current || collection.current) pause();
        return;
      }
      if (cameraId && cameraId !== track.id) pause();
      cameraId = track.id;
      if (activeRef.current && collection.current) {
        invalidate(
          "The interview started; calibration stopped. You can leave this optional preview off.",
        );
        return;
      }
      if (!ready || busy || lastTime === video.currentTime) return;
      lastTime = video.currentTime;
      busy = true;
      requestAt = Date.now();
      const metadata = {
        generation: generation.current,
        step: collection.current?.step ?? null,
        capturedAt: Date.now(),
        cameraId: track.id,
      };
      try {
        const frame = await createImageBitmap(video, {
          resizeWidth: 640,
          resizeHeight: Math.max(
            1,
            Math.round((640 * video.videoHeight) / video.videoWidth),
          ),
        });
        if (disposed || failed) {
          frame.close();
          return;
        }
        try {
          worker!.postMessage(
            { kind: "frame", frame, timestamp: performance.now(), ...metadata },
            [frame],
          );
        } catch (error) {
          frame.close();
          throw error;
        }
      } catch {
        fail();
      }
    }, 250);
    return () => {
      disposed = true;
      clearInterval(timer);
      worker?.terminate();
      window.removeEventListener("resize", pause);
      document.removeEventListener("visibilitychange", visibility);
      collection.current = null;
      calibration.current = null;
    };
  }, [
    enabled,
    video,
    services?.faceLandmarkModelUrl,
    services?.mediapipeWasmUrl,
  ]);
  const target =
    step == null ? null : [...gazeTargets, ...gazeValidationTargets][step];
  return (
    <section
      className="gaze-preview"
      aria-label="Optional calibrated gaze preview"
    >
      <h3>Optional gaze calibration · experimental</h3>
      <p>
        Estimate a broad screen region using your eye images and targets you
        look at. This is not attention, cheating or a hiring assessment. Frames
        and calibration stay in this tab and are discarded when stopped or
        refreshed.
      </p>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        I consent to this local eye-image calibration and preview
      </label>
      <p role="status">{status}</p>
      {enabled && (
        <button
          type="button"
          className="btn secondary"
          disabled={!loaded || active || step != null}
          onClick={() => {
            invalidate(
              "Look at each highlighted target while keeping your head comfortable and still.",
            );
            collection.current = {
              step: 0,
              started: Date.now(),
              train: [],
              validation: [],
              count: 0,
            };
            setStep(0);
          }}
        >
          Calibrate before interview
        </button>
      )}
      {validation != null && (
        <p>
          Independent check median error: {(validation * 100).toFixed(1)}% of
          the normalized screen diagonal. This measures this check only and can
          drift.
        </p>
      )}
      {estimate && <p>{estimate}</p>}
      <dialog
        ref={dialog}
        className="gaze-calibration-dialog"
        aria-labelledby="gaze-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          invalidate("Calibration cancelled. No gaze estimate is active.");
        }}
      >
        <div className="gaze-calibration-help">
          <h2 id="gaze-dialog-title">
            {step != null && step >= 9
              ? "Independent validation"
              : "Look at the highlighted target"}
          </h2>
          <p>
            Target {(step ?? 0) + 1} of 14 · keep looking until it moves. About
            40 seconds total.
          </p>
          <button
            type="button"
            className="btn secondary"
            autoFocus
            onClick={() =>
              invalidate("Calibration cancelled. No gaze estimate is active.")
            }
          >
            Cancel calibration
          </button>
        </div>
        {target && (
          <div
            className="gaze-target"
            aria-label="Gaze calibration target"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
          />
        )}
      </dialog>
    </section>
  );
}
