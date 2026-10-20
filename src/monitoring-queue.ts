import { monitoringKinds, type MonitoringEvent } from "../shared/monitoring";
import { ApiError } from "./api";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function eventId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues remains available on non-secure development origins where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Metadata only, scoped to one interview and browser tab. Requests are idempotent. */
export class MonitoringQueue {
  private events: MonitoringEvent[] = [];
  private running: Promise<void> | null = null;
  private key: string;
  constructor(
    id: string,
    private store: Store | null,
    private deliver: (
      events: MonitoringEvent[],
      keepalive: boolean,
    ) => Promise<unknown>,
    private changed: (count: number, error: boolean) => void,
  ) {
    this.key = `hirelens.monitoring.${id}`;
    try {
      const saved = JSON.parse(store?.getItem(this.key) || "[]");
      if (Array.isArray(saved))
        this.events = saved
          .filter(
            (e) =>
              monitoringKinds.includes(e?.kind) &&
              typeof e?.clientEventId === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                e.clientEventId,
              ) &&
              typeof e?.detail === "string" &&
              e.detail.length <= 200 &&
              Number.isFinite(e.durationMs) &&
              e.durationMs >= 0 &&
              e.durationMs <= 86400000 &&
              Math.abs(Date.now() - Date.parse(e.occurredAt)) < 86400000,
          )
          .slice(-200);
    } catch {
      /* A blocked or corrupted tab store must not break the interview. */
    }
  }
  get count() {
    return this.events.length;
  }
  private persist() {
    try {
      if (this.events.length)
        this.store?.setItem(this.key, JSON.stringify(this.events));
      else this.store?.removeItem(this.key);
    } catch {
      /* Remain usable with an in-memory queue. */
    }
  }
  add(kind: string, durationMs = 0, detail = "", occurredAt = Date.now()) {
    if (!monitoringKinds.includes(kind as MonitoringEvent["kind"])) return;
    if (
      !Number.isFinite(occurredAt) ||
      !Number.isFinite(new Date(occurredAt).getTime()) ||
      !Number.isFinite(durationMs)
    )
      return;
    this.events.push({
      clientEventId: eventId(),
      kind: kind as MonitoringEvent["kind"],
      occurredAt: new Date(occurredAt).toISOString(),
      durationMs: Math.min(86400000, Math.max(0, durationMs)),
      detail: detail.slice(0, 200),
    });
    if (this.events.length > 200) {
      this.events.splice(0, this.events.length - 199);
      this.events.unshift({
        clientEventId: eventId(),
        kind: "monitoring-unavailable",
        occurredAt: new Date().toISOString(),
        durationMs: 0,
        detail:
          "Some event metadata was dropped while uploads were unavailable.",
      });
    }
    this.persist();
    this.changed(this.events.length, false);
  }
  flush(keepalive = false): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      while (this.events.length) {
        // A revoked optional observation must not make unrelated browser metadata
        // fail in the same server transaction. Preserve order, isolate every object.
        const objectAt = this.events.findIndex(
          (event) => event.kind === "object-detected",
        );
        const batch = this.events.slice(
          0,
          objectAt === 0 ? 1 : objectAt > 0 ? Math.min(30, objectAt) : 30,
        );
        try {
          await this.deliver(batch, keepalive);
        } catch (error) {
          if (
            batch.length === 1 &&
            batch[0].kind === "object-detected" &&
            error instanceof ApiError &&
            error.status === 403 &&
            error.code === "OBJECT_CONSENT_REQUIRED"
          ) {
            const rejected = batch[0].clientEventId;
            const present = this.events.some(
              (event) => event.clientEventId === rejected,
            );
            this.events = this.events.filter(
              (event) => event.clientEventId !== rejected,
            );
            // Replacing one rejected event keeps the queue bounded without dropping
            // any ordinary event. Overflow may already have removed this old item.
            if (present)
              this.add(
                "monitoring-unavailable",
                0,
                "Optional object observation omitted because saved consent did not cover its observation interval.",
                // Describe the coverage gap at its original observation time, so
                // a permitted late upload cannot create a post-interview event.
                Date.parse(batch[0].occurredAt),
              );
            this.persist();
            this.changed(this.events.length, false);
            continue;
          }
          throw error;
        }
        const accepted = new Set(batch.map((e) => e.clientEventId));
        this.events = this.events.filter((e) => !accepted.has(e.clientEventId));
        this.persist();
        this.changed(this.events.length, false);
      }
    })()
      .catch(() => {
        this.changed(this.events.length, true);
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
}
