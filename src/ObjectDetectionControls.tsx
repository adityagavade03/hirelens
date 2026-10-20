import { useEffect, useRef, useState } from "react";
import { api, send } from "./api";
import { ErrorBox } from "./ui";
import type { CameraObject } from "../shared/object-detection";
import "./object-detection.css";

/** Every mounted room starts off. A previous server grant never starts a camera check. */
export function useObjectConsent(id: string, localOnly = false) {
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const operation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    ++generation.current;
    setEnabled(false);
    setSaved(undefined);
    setBusy(false);
    pending.current = false;
    setError("");
    return () => {
      ++generation.current;
    };
  }, [id, localOnly]);

  useEffect(() => {
    if (localOnly) return;
    const withdrawn = (event: Event) => {
      if ((event as CustomEvent<{ id: string }>).detail?.id !== id) return;
      ++operation.current;
      pending.current = false;
      setBusy(false);
      setEnabled(false);
      setSaved(false);
      setError(
        "Object consent was withdrawn or no longer covers this check. Object detection is off.",
      );
    };
    window.addEventListener("hirelens:object-consent-withdrawn", withdrawn);
    return () =>
      window.removeEventListener(
        "hirelens:object-consent-withdrawn",
        withdrawn,
      );
  }, [id, localOnly]);

  useEffect(() => {
    if (!enabled || localOnly) return;
    let disposed = false,
      checking = false;
    let controller: AbortController | undefined;
    const check = async () => {
      if (checking || pending.current) return;
      checking = true;
      const version = operation.current;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const current = await api<{ objectConsent?: boolean }>(
          `/interviews/${id}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (disposed || version !== operation.current || pending.current)
          return;
        if (current.objectConsent === false) {
          setEnabled(false);
          setSaved(false);
          setError(
            "Object consent was withdrawn in another session. Object detection is off.",
          );
        }
      } catch (error) {
        if (disposed || version !== operation.current || pending.current)
          return;
        if (
          [401, 403, 404].includes((error as { status?: number }).status || 0)
        ) {
          setEnabled(false);
          setError(
            "Interview access could not be confirmed. Object detection is off.",
          );
        }
      } finally {
        window.clearTimeout(timeout);
        checking = false;
      }
    };
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [id, localOnly, enabled]);

  async function change(accepted: boolean) {
    if (pending.current) return;
    pending.current = true;
    const version = generation.current;
    const action = ++operation.current;
    // Revocation stops local inference before waiting for the server.
    if (!accepted) setEnabled(false);
    setBusy(true);
    setError("");
    try {
      if (!localOnly)
        await send(`/interviews/${id}/object-consent`, { accepted });
      if (version !== generation.current || action !== operation.current)
        return;
      setSaved(accepted);
      setEnabled(accepted);
    } catch {
      if (version !== generation.current || action !== operation.current)
        return;
      setError(
        accepted
          ? "Consent could not be saved. Object detection remains off."
          : "Object detection stopped on this device. Retry saving your withdrawal when the connection returns.",
      );
    } finally {
      if (version === generation.current && action === operation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return { enabled, saved, busy, error, change };
}

export function ObjectDetectionControls({
  consent,
  configured,
  savedConsent = false,
  status,
  ready,
  detections,
  retry,
  localOnly = false,
}: {
  consent: ReturnType<typeof useObjectConsent>;
  configured: boolean;
  savedConsent?: boolean;
  status: string;
  ready: boolean;
  detections: CameraObject[];
  retry: () => void;
  localOnly?: boolean;
}) {
  return (
    <section className="object-check" aria-label="Optional object detection">
      <h3>Phones, books & objects</h3>
      <p>
        Experimental estimates: show supported objects clearly to the camera to
        see labels and boxes. Small, covered or poorly lit objects may be missed
        or mislabelled. Camera accuracy has not been validated; this model
        cannot recognize every object.
      </p>
      <p>
        Images are processed on this device and are not uploaded by this check.{" "}
        {localOnly
          ? "In practice, all object results stay in this preview."
          : "Once the interview starts (after admission in a human-led room), sustained phone or book observations are shared for interviewer review as event metadata. Other labels stay in your preview."}{" "}
        These estimates do not determine cheating or change a score.
      </p>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={consent.enabled}
          disabled={consent.busy || (!configured && !consent.enabled)}
          onChange={(event) => void consent.change(event.target.checked)}
        />
        {localOnly
          ? "Enable optional object preview on this device"
          : "I consent to optional object detection and the described event sharing"}
      </label>
      <p role="status">{status}</p>
      {!configured && (
        <p>
          Object detection is unavailable on this server. You can continue
          without it.
        </p>
      )}
      <ErrorBox message={consent.error} />
      {consent.enabled && (
        <>
          {ready && <ObjectDetectionLabels detections={detections} />}
          <button className="btn secondary" type="button" onClick={retry}>
            Restart object detection
          </button>
        </>
      )}
      {!localOnly && !consent.enabled && (consent.saved ?? savedConsent) && (
        <button
          className="btn secondary"
          type="button"
          disabled={consent.busy}
          onClick={() => void consent.change(false)}
        >
          Withdraw saved object consent
        </button>
      )}
      <small>
        You can leave this optional check off. Refreshing the page turns it off
        on this device.
      </small>
    </section>
  );
}

export function ObjectDetectionLabels({
  detections,
}: {
  detections: CameraObject[];
}) {
  const strongest = new Map<string, number>();
  for (const item of detections)
    strongest.set(
      item.label,
      Math.max(strongest.get(item.label) || 0, item.score),
    );
  return (
    <div className="object-labels" aria-label="Current object estimates">
      {strongest.size ? (
        [...strongest].map(([label, score]) => (
          <span key={label}>
            {label} · model score {Math.round(score * 100)}%
          </span>
        ))
      ) : (
        <span>No supported object estimated in the current camera frame.</span>
      )}
    </div>
  );
}

/** Matches the existing camera tiles' object-fit:cover; legacy previews are mirrored. */
export function ObjectDetectionOverlay({
  video,
  detections,
  frameAspect,
  mirrored = false,
}: {
  video: HTMLVideoElement | null;
  detections: CameraObject[];
  frameAspect: number | null;
  mirrored?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!video) return;
    const measure = () =>
      setSize({ width: video.clientWidth, height: video.clientHeight });
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(video);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [video]);
  if (!frameAspect || !size.width || !size.height || !detections.length)
    return null;
  const width = Math.max(size.width, size.height * frameAspect);
  const height = width / frameAspect;
  const offsetX = (size.width - width) / 2;
  const offsetY = (size.height - height) / 2;
  return (
    <svg
      className="object-overlay"
      viewBox={`0 0 ${size.width} ${size.height}`}
      aria-hidden="true"
    >
      {detections.map((item, index) => {
        const x =
          offsetX +
          (mirrored ? 1 - item.box.x - item.box.width : item.box.x) * width;
        const y = offsetY + item.box.y * height;
        const boxWidth = item.box.width * width;
        const boxHeight = item.box.height * height;
        if (
          x + boxWidth < 0 ||
          y + boxHeight < 0 ||
          x > size.width ||
          y > size.height
        )
          return null;
        const label = `${item.label} ${Math.round(item.score * 100)}%`;
        const labelWidth = Math.min(size.width, label.length * 7 + 12);
        const labelX = Math.max(0, Math.min(x, size.width - labelWidth));
        const labelY = Math.max(0, Math.min(y, size.height - 22));
        return (
          <g key={`${item.label}-${index}`}>
            <rect
              className="object-box"
              x={x}
              y={y}
              width={boxWidth}
              height={boxHeight}
              rx={3}
            />
            <rect
              className="object-label-bg"
              x={labelX}
              y={labelY}
              width={labelWidth}
              height={22}
              rx={3}
            />
            <text x={labelX + 6} y={labelY + 15}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
