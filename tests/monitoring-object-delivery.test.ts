// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api";
import { MonitoringQueue } from "../src/monitoring-queue";
import { useMonitoring } from "../src/monitoring";
import type { MonitoringEvent } from "../shared/monitoring";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves the server's typed consent error for precise client recovery", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "OBJECT_CONSENT_REQUIRED",
              message: "Separate object consent is required.",
            },
          }),
          { status: 403 },
        ),
    ),
  );
  await expect(api("/interviews/i/events")).rejects.toMatchObject({
    status: 403,
    code: "OBJECT_CONSENT_REQUIRED",
    message: "Separate object consent is required.",
  });
});

it("keeps capture timestamps through persistence/reload and refuses invalid explicit timestamps", async () => {
  const captureAt = Date.now() - 750;
  const queue = new MonitoringQueue(
    "timestamp",
    sessionStorage,
    async () => {},
    vi.fn(),
  );
  queue.add("object-detected", 3000, "Estimated book", captureAt);
  queue.add("hidden", 0, "Tab changed");
  queue.add("object-detected", 3000, "invalid", NaN);
  queue.add("object-detected", 3000, "invalid", 1e100);
  const deliver = vi.fn(async (_events: MonitoringEvent[]) => {});
  const restored = new MonitoringQueue(
    "timestamp",
    sessionStorage,
    deliver,
    vi.fn(),
  );
  expect(restored.count).toBe(2);
  await restored.flush();
  expect(deliver.mock.calls[0][0][0].occurredAt).toBe(
    new Date(captureAt).toISOString(),
  );
  expect(deliver.mock.calls[1][0][0].occurredAt).toBe(new Date().toISOString());
});

it("isolates object batches and replaces only a rejected observation while browser metadata keeps flowing", async () => {
  const accepted: MonitoringEvent[] = [];
  const deliver = vi.fn(async (events: MonitoringEvent[]) => {
    if (events[0].kind === "object-detected")
      throw new ApiError(
        "Object consent expired",
        403,
        "OBJECT_CONSENT_REQUIRED",
      );
    accepted.push(...events);
  });
  const queue = new MonitoringQueue(
    "isolation",
    sessionStorage,
    deliver,
    vi.fn(),
  );
  queue.add("hidden");
  const originalAt = Date.now() - 60000;
  queue.add("object-detected", 3000, "Estimated book", originalAt);
  queue.add("visible", 2000);
  queue.add("blur");
  await queue.flush();
  expect(queue.count).toBe(0);
  expect(
    deliver.mock.calls.map(([events]) => events.map((event) => event.kind)),
  ).toEqual([
    ["hidden"],
    ["object-detected"],
    ["visible", "blur", "monitoring-unavailable"],
  ]);
  expect(accepted.map((event) => event.kind)).toEqual([
    "hidden",
    "visible",
    "blur",
    "monitoring-unavailable",
  ]);
  expect(accepted.at(-1)?.detail).toContain(
    "consent did not cover its observation interval",
  );
  expect(accepted.at(-1)?.occurredAt).toBe(new Date(originalAt).toISOString());
  expect(sessionStorage.getItem("hirelens.monitoring.isolation")).toBeNull();
});

it.each([
  new ApiError("Generic permission failure", 403),
  new ApiError("Other permission failure", 403, "FORBIDDEN"),
  new ApiError("Network failure", 0),
  new ApiError("Wrong status", 500, "OBJECT_CONSENT_REQUIRED"),
])(
  "retains object and ordinary events after retryable failure: $message",
  async (failure) => {
    const deliver = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const queue = new MonitoringQueue(
      "retry",
      sessionStorage,
      deliver,
      vi.fn(),
    );
    queue.add("object-detected", 3000, "Estimated book");
    queue.add("hidden");
    await queue.flush();
    expect(queue.count).toBe(2);
    const firstId = deliver.mock.calls[0][0][0].clientEventId;
    await queue.flush();
    expect(queue.count).toBe(0);
    expect(deliver.mock.calls[1][0][0].clientEventId).toBe(firstId);
    expect(deliver.mock.calls[2][0][0].kind).toBe("hidden");
  },
);

it("never drops an ordinary event even if an unexpected server response has the object-only code", async () => {
  const deliver = vi
    .fn()
    .mockRejectedValueOnce(
      new ApiError("Unexpected code", 403, "OBJECT_CONSENT_REQUIRED"),
    )
    .mockResolvedValue(undefined);
  const queue = new MonitoringQueue("ordinary", null, deliver, vi.fn());
  queue.add("hidden");
  await queue.flush();
  expect(queue.count).toBe(1);
  await queue.flush();
  expect(queue.count).toBe(0);
  expect(deliver.mock.calls[1][0][0].clientEventId).toBe(
    deliver.mock.calls[0][0][0].clientEventId,
  );
});

it("dispatches a scoped withdrawal signal only for the exact rejected object response, with the captured timestamp intact", async () => {
  const delivered: MonitoringEvent[] = [];
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
    const { events } = JSON.parse(String(init?.body)) as {
      events: MonitoringEvent[];
    };
    delivered.push(...events);
    return events[0].kind === "object-detected"
      ? new Response(
          JSON.stringify({
            error: {
              code: "OBJECT_CONSENT_REQUIRED",
              message: "No object consent",
            },
          }),
          { status: 403 },
        )
      : new Response(JSON.stringify({ ok: true }));
  });
  vi.stubGlobal("fetch", fetcher);
  const withdrawn = vi.fn();
  window.addEventListener("hirelens:object-consent-withdrawn", withdrawn);
  let monitoring!: ReturnType<typeof useMonitoring>;
  const noFace = () => {};
  function Harness() {
    monitoring = useMonitoring("room-a", true, null, null, noFace);
    return null;
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    const capturedAt = Date.now() - 750;
    await act(async () => {
      monitoring.record("object-detected", 3000, "Estimated book", capturedAt);
      monitoring.record("hidden");
      await monitoring.flush();
    });
    expect(withdrawn).toHaveBeenCalledOnce();
    expect((withdrawn.mock.calls[0][0] as CustomEvent).detail).toEqual({
      id: "room-a",
    });
    expect(
      delivered.find((event) => event.kind === "object-detected")?.occurredAt,
    ).toBe(new Date(capturedAt).toISOString());
    expect(delivered.some((event) => event.kind === "hidden")).toBe(true);
    expect(
      delivered.some((event) => event.kind === "monitoring-unavailable"),
    ).toBe(true);
    expect(monitoring.warning).toContain("Optional object detection stopped");
  } finally {
    window.removeEventListener("hirelens:object-consent-withdrawn", withdrawn);
  }
});

it("does not signal withdrawal or erase queued observations after a generic permission failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) => {
      const { events } = JSON.parse(String(init?.body)) as {
        events: MonitoringEvent[];
      };
      return events[0].kind === "object-detected"
        ? new Response(
            JSON.stringify({
              error: {
                code: "REQUEST_FAILED",
                message: "Monitoring consent required",
              },
            }),
            { status: 403 },
          )
        : new Response(JSON.stringify({ ok: true }));
    }),
  );
  const withdrawn = vi.fn();
  window.addEventListener("hirelens:object-consent-withdrawn", withdrawn);
  let monitoring!: ReturnType<typeof useMonitoring>;
  const noFace = () => {};
  function Harness() {
    monitoring = useMonitoring("generic-room", true, null, null, noFace);
    return null;
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      monitoring.record("object-detected", 3000, "Estimated book");
      await monitoring.flush();
    });
    expect(withdrawn).not.toHaveBeenCalled();
    expect(
      JSON.parse(sessionStorage.getItem("hirelens.monitoring.generic-room")!),
    ).toEqual([
      expect.objectContaining({ kind: "object-detected", durationMs: 3000 }),
    ]);
    expect(monitoring.delivery).toContain("waiting to sync");
  } finally {
    window.removeEventListener("hirelens:object-consent-withdrawn", withdrawn);
  }
});
