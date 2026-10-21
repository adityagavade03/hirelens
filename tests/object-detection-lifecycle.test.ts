// @vitest-environment jsdom
// Synthetic worker responses test lifecycle logic, not physical model accuracy.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useObjectDetection } from "../src/object-detection";
import type { CameraObject } from "../shared/object-detection";
import type { ServiceStatus } from "../shared/types";

type Message = Record<string, any>;
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: Message }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
  respond(data: Message) {
    this.onmessage?.({ data });
  }
}
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  );
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  TestWorker.instances = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const advance = (ms: number) =>
  act(async () => vi.advanceTimersByTimeAsync(ms));
const phone: CameraObject = {
  label: "cell phone",
  score: 0.8,
  box: { x: 0.2, y: 0.3, width: 0.2, height: 0.2 },
};
function setup() {
  const track = {
    id: "camera-one",
    enabled: true,
    muted: false,
    readyState: "live",
  };
  const video = {
    srcObject: { getVideoTracks: () => [track] },
    readyState: 4,
    paused: false,
    currentTime: 0,
    videoWidth: 1280,
    videoHeight: 720,
  } as unknown as HTMLVideoElement;
  const services = {
    objects: true,
    objectModelUrl: "/object.tflite",
    mediapipeWasmUrl: "/wasm",
    objectThresholdSeconds: 3,
  } as ServiceStatus;
  const record = vi.fn();
  let result!: ReturnType<typeof useObjectDetection>;
  function Harness({
    enabled,
    active,
    localOnly,
  }: {
    enabled: boolean;
    active: boolean;
    localOnly: boolean;
  }) {
    result = useObjectDetection({
      enabled,
      active,
      localOnly,
      video,
      services,
      record,
    });
    return null;
  }
  const render = (enabled: boolean, active = false, localOnly = false) =>
    act(async () =>
      root.render(createElement(Harness, { enabled, active, localOnly })),
    );
  const worker = () => TestWorker.instances.at(-1)!;
  const load = () => act(async () => worker().respond({ kind: "ready" }));
  const capture = async () => {
    video.currentTime += 0.5;
    await advance(500);
    return worker()
      .postMessage.mock.calls.filter(([m]) => m.kind === "frame")
      .at(-1)?.[0] as Message;
  };
  const respond = (
    request: Message,
    objects: CameraObject[] = [phone],
    quality = {
      state: "usable",
      mean: 120,
      darkFraction: 0.1,
      brightFraction: 0.02,
    },
  ) =>
    act(async () =>
      worker().respond({
        ...request,
        kind: "detections",
        detections: objects,
        quality,
      }),
    );
  const frame = async (objects = [phone]) => respond(await capture(), objects);
  return {
    track,
    video,
    services,
    record,
    render,
    worker,
    load,
    capture,
    respond,
    frame,
    result: () => result,
  };
}

it("starts only after opt-in; preview boxes remain local and events start only after admission", async () => {
  const f = setup();
  await f.render(false);
  await advance(10000);
  expect(TestWorker.instances).toHaveLength(0);
  await f.render(true);
  await f.load();
  for (let n = 0; n < 8; n++) await f.frame();
  expect(f.result().ready).toBe(true);
  expect(f.result().detections[0].label).toBe("cell phone");
  expect(f.result().frameAspect).toBeCloseTo(1280 / 720);
  expect(f.record).not.toHaveBeenCalled();
  expect(createImageBitmap).toHaveBeenCalledWith(f.video, {
    resizeWidth: 640,
    resizeHeight: 360,
  });
  await f.render(true, true);
  expect(f.result().detections).toEqual([]);
  for (let n = 0; n < 7; n++) await f.frame();
  expect(f.record).toHaveBeenCalledExactlyOnceWith(
    "object-detected",
    3000,
    "Estimated cell phone in camera view; human review required",
    expect.any(Number),
  );
  for (let n = 0; n < 8; n++) await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
});

it("ignores pre-admission results even if they arrive after the interview starts", async () => {
  const f = setup();
  await f.render(true);
  await f.load();
  const request = await f.capture();
  await f.render(true, true);
  await f.respond(request);
  expect(f.result().detections).toEqual([]);
  for (let n = 0; n < 6; n++) await f.frame();
  expect(f.record).not.toHaveBeenCalled();
  await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
});

it("clears overlays and timers when a page is hidden, including a late result after returning", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  for (let n = 0; n < 5; n++) await f.frame();
  const old = await f.capture();
  await act(async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(f.result().detections).toEqual([]);
  expect(f.result().ready).toBe(false);
  await act(async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await f.respond(old);
  expect(f.result().detections).toEqual([]);
  for (let n = 0; n < 6; n++) await f.frame();
  expect(f.record).not.toHaveBeenCalled();
  await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
});

it("rejects replaced-camera results and clears both muted and frozen-camera overlays", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  await f.frame();
  const old = await f.capture();
  const replacement = { ...f.track, id: "camera-two" };
  Object.assign(f.video, {
    srcObject: { getVideoTracks: () => [replacement] },
  });
  await f.respond(old);
  expect(f.result().detections).toEqual([]);
  await f.frame();
  expect(f.result().ready).toBe(true);
  replacement.muted = true;
  await advance(500);
  expect(f.result().ready).toBe(false);
  expect(f.result().detections).toEqual([]);
  replacement.muted = false;
  await f.frame();
  expect(f.result().ready).toBe(true);
  await advance(2500);
  expect(f.result().ready).toBe(false);
  expect(f.result().detections).toEqual([]);
  expect(f.record).not.toHaveBeenCalled();
});

it("does not accept old results from a slow worker as fresh observations", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  const request = await f.capture();
  await advance(2500);
  await f.respond(request);
  expect(f.result().ready).toBe(false);
  expect(f.result().detections).toEqual([]);
  expect(f.record).not.toHaveBeenCalled();
  for (let n = 0; n < 7; n++) await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
});

it("stops immediately after withdrawal and disposes pending camera bitmaps", async () => {
  const f = setup();
  let release!: (value: { close: ReturnType<typeof vi.fn> }) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve as typeof release;
        }),
    ),
  );
  await f.render(true, true);
  await f.load();
  f.video.currentTime += 0.5;
  await advance(500);
  const worker = f.worker();
  await f.render(false, true);
  const bitmap = { close: vi.fn() };
  await act(async () => release(bitmap));
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.postMessage.mock.calls.some(([m]) => m.kind === "frame")).toBe(
    false,
  );
  await act(async () =>
    worker.respond({ kind: "detections", requestId: 1, detections: [phone] }),
  );
  expect(f.result().status).toBe("Object detection is off");
  expect(f.record).not.toHaveBeenCalled();
});

it("does not transfer a bitmap captured before admission after active state changes during capture", async () => {
  const f = setup();
  let release!: (value: { close: ReturnType<typeof vi.fn> }) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve as typeof release;
        }),
    ),
  );
  await f.render(true);
  await f.load();
  f.video.currentTime += 0.5;
  await advance(500);
  await f.render(true, true);
  const bitmap = { close: vi.fn() };
  await act(async () => release(bitmap));
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(
    f.worker().postMessage.mock.calls.some(([m]) => m.kind === "frame"),
  ).toBe(false);
  expect(f.record).not.toHaveBeenCalled();
});

it("reports model failure, clears prior results and retries without retaining observations", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  await f.frame();
  const old = f.worker();
  await act(async () => old.respond({ kind: "error" }));
  expect(f.result().status).toContain("unavailable");
  expect(f.result().ready).toBe(false);
  expect(f.result().detections).toEqual([]);
  expect(old.terminate).toHaveBeenCalledOnce();
  await act(async () => f.result().retry());
  await f.load();
  expect(TestWorker.instances).toHaveLength(2);
  for (let n = 0; n < 6; n++) await f.frame();
  expect(f.record).not.toHaveBeenCalled();
  await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
});

it("does not turn ordinary desk objects or low-score estimates into interview events", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  for (let n = 0; n < 10; n++)
    await f.frame([
      { ...phone, label: "keyboard" },
      { ...phone, label: "book", score: 0.4 },
    ]);
  expect(f.result().detections.map((o) => o.label)).toEqual(["keyboard"]);
  expect(f.record).not.toHaveBeenCalled();
});

it("rejects all pending active observations when the interview ends", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  for (let n = 0; n < 6; n++) await f.frame();
  const pending = await f.capture();
  await f.render(true, false);
  await f.respond(pending);
  expect(f.result().detections).toEqual([]);
  expect(f.record).not.toHaveBeenCalled();
  for (let n = 0; n < 10; n++) await f.frame();
  expect(f.record).not.toHaveBeenCalled();
});

it("records the final capture time rather than delayed worker delivery time", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  for (let n = 0; n < 6; n++) await f.frame();
  const pending = await f.capture();
  await advance(750);
  await f.respond(pending);
  expect(f.record).toHaveBeenCalledExactlyOnceWith(
    "object-detected",
    3000,
    "Estimated cell phone in camera view; human review required",
    pending.capturedAt,
  );
  expect(pending.capturedAt).toBeLessThan(Date.now());
});

it("keeps practice local-only even if an active flag is supplied", async () => {
  const f = setup();
  await f.render(true, true, true);
  await f.load();
  for (let n = 0; n < 10; n++) await f.frame();
  expect(f.result().status).toContain(
    "local preview only; no observations shared",
  );
  expect(f.result().status).not.toContain("admission");
  expect(f.result().ready).toBe(true);
  expect(f.record).not.toHaveBeenCalled();
});

it("pauses observations on dark/glare frames and requires a new sustained usable interval", async () => {
  const f = setup();
  await f.render(true, true);
  await f.load();
  for (let n = 0; n < 6; n++) await f.frame();
  await f.respond(await f.capture(), [phone], {
    state: "dark",
    mean: 15,
    darkFraction: 0.9,
    brightFraction: 0,
  });
  expect(f.result().status).toContain("too dark");
  expect(f.result().ready).toBe(false);
  expect(f.result().detections).toEqual([]);
  expect(f.record).not.toHaveBeenCalled();
  for (let n = 0; n < 6; n++) await f.frame();
  expect(f.record).not.toHaveBeenCalled();
  await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
  await f.respond(await f.capture(), [phone], {
    state: "glare",
    mean: 250,
    darkFraction: 0,
    brightFraction: 0.95,
  });
  expect(f.result().status).toContain("glare");
  expect(f.result().ready).toBe(false);
});

it("switches local model profile and discards the previous model's pending result", async () => {
  const f = setup();
  f.services.objectAccuracyModelUrl = "/detail.tflite";
  await f.render(true, true);
  await f.load();
  for (let n = 0; n < 6; n++) await f.frame();
  const old = f.worker(),
    request = await f.capture();
  await act(async () => f.result().setProfile("detail"));
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(f.result().detections).toEqual([]);
  expect(f.worker().postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      model: new URL("/detail.tflite", location.href).href,
    }),
  );
  await act(async () =>
    old.respond({
      ...request,
      kind: "detections",
      detections: [phone],
      quality: {
        state: "usable",
        mean: 120,
        darkFraction: 0,
        brightFraction: 0,
      },
    }),
  );
  expect(f.record).not.toHaveBeenCalled();
  await f.load();
  for (let n = 0; n < 6; n++) await f.frame();
  expect(f.record).not.toHaveBeenCalled();
  await f.frame();
  expect(f.record).toHaveBeenCalledTimes(1);
});

it("does not silently fall back to balanced when a selected detail model is unavailable", async () => {
  const f = setup();
  await f.render(true);
  await f.load();
  const old = f.worker();
  await act(async () => f.result().setProfile("detail"));
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(TestWorker.instances).toHaveLength(1);
  expect(f.result().ready).toBe(false);
  expect(f.result().status).toContain("not configured");
  expect(f.record).not.toHaveBeenCalled();
});
