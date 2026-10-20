import { useEffect, useRef, useState } from "react";
import { useResource, dateLabel } from "./api";
import { ErrorBox } from "./ui";
import type { MonitoringEvent } from "../shared/types";
import { EventReviewControls } from "./MonitoringReview";
import { summarizeMonitoring, tabSwitchThreshold } from "../shared/monitoring";

export function MonitoringSummary({
  events,
  threshold,
}: {
  events: { kind: string; durationMs: number }[];
  threshold?: number;
}) {
  const summary = summarizeMonitoring(events);
  const limit = tabSwitchThreshold(threshold);
  return (
    <section className="panel-form" aria-label="Monitoring event summary">
      <p>
        <strong>{summary.tabDepartures} tab departures</strong> ·{" "}
        {summary.tabReturns} returns ·{" "}
        {(summary.hiddenDurationMs / 1000).toFixed(1)} seconds away in completed
        intervals
      </p>
      <p>
        {summary.focusLosses} window focus losses · {summary.noFace} sustained
        no-face observations · {summary.multipleFaces} multiple-face
        observations · {summary.objectObservations} phone/book observations ·{" "}
        {summary.cameraInterruptions} camera interruptions ·{" "}
        {summary.unavailable} monitoring gaps
      </p>
      <p role="status">
        {summary.tabDepartures >= limit
          ? `Tab departure review threshold reached (${limit}). Review the timeline with the candidate before drawing conclusions.`
          : `Review threshold: ${limit} tab departures. Each departure is logged and the candidate receives a reminder on return.`}
      </p>
      <small>
        Visibility and focus may describe the same departure; they are not added
        together. Counts cover received metadata. Missing returns, offline
        intervals and camera issues need context. No automatic rejection or
        technical-score penalty is applied.
      </small>
    </section>
  );
}

export function MediaVideo({
  stream,
  label,
  muted = false,
  controls = false,
  onVideo,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  controls?: boolean;
  onVideo?: (video: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    onVideo?.(ref.current);
    return () => onVideo?.(null);
  }, [onVideo]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let current = true;
    video.srcObject = stream;
    if (stream)
      void video
        .play()
        .then(() => {
          if (current) setBlocked(false);
        })
        .catch(() => {
          if (current) setBlocked(true);
        });
    return () => {
      current = false;
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        controls={controls}
        aria-label={label}
      />
      {blocked && (
        <button
          className="btn secondary media-play"
          onClick={() => {
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true));
          }}
        >
          Play {label.toLowerCase()}
        </button>
      )}
    </>
  );
}

export function MicrophoneLevel({
  stream,
  muted,
}: {
  stream: MediaStream | null;
  muted: boolean;
}) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    setLevel(0);
    if (
      !stream?.getAudioTracks().length ||
      muted ||
      typeof AudioContext === "undefined"
    )
      return;
    let context: AudioContext | undefined,
      timer: ReturnType<typeof setInterval> | undefined;
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      void context.resume().catch(() => {});
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) /
            samples.length,
        );
        setLevel(Math.min(100, Math.round(rms * 400)));
      }, 150);
    } catch {
      /* The input meter is optional; a call must continue without Web Audio. */
    }
    return () => {
      clearInterval(timer);
      void context?.close().catch(() => {});
    };
  }, [stream, muted]);
  return (
    <label className="microphone-level">
      Microphone input{" "}
      <meter
        min={0}
        max={100}
        value={level}
        aria-label="Microphone input level"
      />
      <small>{muted ? "Off" : "Speak to check your microphone"}</small>
    </label>
  );
}

export function LiveMonitoring({
  id,
  active,
  threshold,
}: {
  id: string;
  active: boolean;
  threshold?: number;
}) {
  const result = useResource<MonitoringEvent[]>(`/interviews/${id}/events`, []);
  useEffect(() => {
    if (!active) {
      void result.reload();
      return;
    }
    const timer = setInterval(() => void result.reload(), 5000);
    return () => clearInterval(timer);
  }, [active, result.reload]);
  return (
    <section className="panel live-monitoring">
      <h2>Interview monitoring</h2>
      <p>
        Consented candidate event metadata. Updates every five seconds while
        this panel is open. These observations require context and do not prove
        misconduct or change technical scores.
      </p>
      <ErrorBox message={result.error} />
      <MonitoringSummary events={result.data} threshold={threshold} />
      <button className="btn secondary" onClick={() => void result.reload()}>
        Refresh events
      </button>
      {!result.data.length && (
        <p>
          No event metadata received yet. This does not confirm that monitoring
          is working; ask the candidate to check their monitoring status.
        </p>
      )}
      {result.data.slice(0, 30).map((event) => (
        <div className="timeline-row" key={event._id}>
          <span className="timeline-dot" />
          <div>
            <strong>{event.kind.replaceAll("-", " ")}</strong>
            <small>
              {dateLabel(event.occurredAt)}
              {event.durationMs
                ? ` · ${(event.durationMs / 1000).toFixed(1)}s`
                : ""}
              {event.detail ? ` · ${event.detail}` : ""}
            </small>
            <EventReviewControls
              interviewId={id}
              event={event}
              onSaved={result.reload}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
