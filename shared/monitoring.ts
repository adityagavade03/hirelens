export const monitoringKinds = [
  "hidden",
  "visible",
  "blur",
  "focus",
  "fullscreen-exit",
  "copy",
  "paste",
  "connection-interrupted",
  "connection-restored",
  "no-face",
  "multiple-faces",
  "head-turned",
  "object-detected",
  "monitoring-unavailable",
  "monitoring-started",
  "monitoring-stopped",
  "camera-on",
  "camera-off",
  "microphone-on",
  "microphone-off",
  "screen-share-started",
  "screen-share-stopped",
] as const;
export interface MonitoringEvent {
  clientEventId: string;
  kind: (typeof monitoringKinds)[number];
  occurredAt: string;
  durationMs: number;
  detail: string;
}

export function tabSwitchThreshold(value?: number) {
  return Number.isFinite(value)
    ? Math.min(20, Math.max(1, Math.floor(value!)))
    : 3;
}

/** Visibility and focus overlap, so their counts/durations must stay separate. */
export function summarizeMonitoring(
  events: { kind: string; durationMs: number }[],
) {
  const count = (kind: string) =>
    events.filter((event) => event.kind === kind).length;
  const duration = (kind: string) =>
    events.reduce(
      (total, event) =>
        total + (event.kind === kind ? Math.max(0, event.durationMs || 0) : 0),
      0,
    );
  return {
    tabDepartures: count("hidden"),
    tabReturns: count("visible"),
    hiddenDurationMs: duration("visible"),
    focusLosses: count("blur"),
    focusDurationMs: duration("focus"),
    noFace: count("no-face"),
    multipleFaces: count("multiple-faces"),
    objectObservations: count("object-detected"),
    cameraInterruptions: count("camera-off"),
    unavailable: count("monitoring-unavailable"),
  };
}

/** Only sustained observations produce an event; camera outages reset the detector. */
export class SustainedObservation {
  private kind = "one";
  private since = 0;
  private notified = false;
  observe(kind: string, now: number, threshold: number) {
    if (kind !== this.kind) {
      this.kind = kind;
      this.since = now;
      this.notified = false;
    }
    if (
      kind !== "one" &&
      kind !== "unavailable" &&
      !this.notified &&
      now - this.since >= threshold
    ) {
      this.notified = true;
      return { kind, durationMs: now - this.since };
    }
    return null;
  }
}
