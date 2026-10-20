// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CalibratedGaze } from "../src/CalibratedGaze";
import type { ServiceStatus } from "../shared/types";
import type { GazeFrameQuality } from "../shared/gaze-calibration";
import { gazeTargets, gazeValidationTargets } from "../shared/gaze-calibration";

type WorkerMessage = Record<string, unknown>;
let worker: TestWorker;
class TestWorker {
  onmessage?: (event: { data: WorkerMessage }) => void;
  onerror?: () => void;
  messages: WorkerMessage[] = [];
  terminate = vi.fn();
  constructor() {
    worker = this;
  }
  postMessage(data: WorkerMessage) {
    this.messages.push(data);
  }
  emit(data: WorkerMessage) {
    this.onmessage?.({ data });
  }
}
let host: HTMLDivElement, root: Root, video: HTMLVideoElement;
const services = {
  faceLandmarkModelUrl: "/model.task",
  mediapipeWasmUrl: "/wasm",
} as ServiceStatus;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
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
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  video = document.createElement("video");
  Object.defineProperties(video, {
    readyState: { value: 4 },
    paused: { value: false },
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
    srcObject: {
      value: {
        getVideoTracks: () => [
          { id: "camera", enabled: true, muted: false, readyState: "live" },
        ],
      },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(CalibratedGaze, { video, services })),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function calibrationButton() {
  return host.querySelector("button")!;
}
async function enable() {
  await act(async () => host.querySelector("input")!.click());
  await act(async () => worker.emit({ kind: "ready" }));
}
async function frame(
  quality: GazeFrameQuality = "ready",
  features = Array(80).fill(0.1),
) {
  video.currentTime += 0.25;
  await act(async () => vi.advanceTimersByTimeAsync(250));
  const request = worker.messages
    .filter((message) => message.kind === "frame")
    .at(-1)!;
  await act(async () =>
    worker.emit({
      ...request,
      kind: "sample",
      quality,
      features: quality === "ready" ? features : null,
    }),
  );
}
it("requires fresh usable images before calibration and explains why images are rejected", async () => {
  await enable();
  expect(calibrationButton().disabled).toBe(true);
  await frame("eyes-too-small");
  expect(host.textContent).toContain("Move a little closer");
  expect(calibrationButton().disabled).toBe(true);
  await frame();
  await frame();
  expect(calibrationButton().disabled).toBe(true);
  await frame();
  expect(calibrationButton().disabled).toBe(false);
  expect(createImageBitmap).toHaveBeenCalledWith(video, {
    resizeWidth: 1280,
    resizeHeight: 720,
  });
  // A stalled video cannot reuse earlier readiness to start calibration.
  await act(async () => vi.advanceTimersByTimeAsync(1750));
  expect(calibrationButton().disabled).toBe(true);
  const stale = worker.messages
    .filter((message) => message.kind === "frame")
    .at(-1)!;
  await act(async () => {
    for (let i = 0; i < 3; i++)
      worker.emit({
        ...stale,
        kind: "sample",
        quality: "ready",
        features: Array(80).fill(0.1),
      });
  });
  expect(calibrationButton().disabled).toBe(true);
});
it("shows target progress, keeps instructions away from the top target and reports the observed timeout cause", async () => {
  await enable();
  await frame();
  await frame();
  await frame();
  await act(async () => calibrationButton().click());
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(host.querySelector(".gaze-help-bottom")).not.toBeNull();
  await frame();
  await frame();
  await frame();
  expect(host.textContent).toContain("1 of 8 usable images");
  for (let i = 0; i < 46; i++) await frame("low-contrast");
  expect(host.querySelector("dialog")?.open).toBe(false);
  expect(host.textContent).toContain("Calibration stopped: 1 of 8");
  expect(host.textContent).toContain("Add light in front of you");
  expect(host.textContent).not.toContain("Calibration passed");
});
it("stops processing on consent withdrawal and never starts during an active interview", async () => {
  await enable();
  await frame();
  await frame();
  await frame();
  await act(async () =>
    root.render(
      createElement(CalibratedGaze, { video, services, active: true }),
    ),
  );
  expect(calibrationButton().disabled).toBe(true);
  await act(async () => host.querySelector("input")!.click());
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Optional gaze calibration is off");
});

it("removes a previously validated estimate when the live camera stops delivering fresh images", async () => {
  await enable();
  await frame();
  await frame();
  await frame();
  await act(async () => calibrationButton().click());
  for (const target of [...gazeTargets, ...gazeValidationTargets]) {
    const features = [
      target.x,
      target.y,
      target.x + target.y,
      target.x - target.y,
    ];
    for (let i = 0; i < 10; i++) await frame("ready", features);
  }
  expect(host.textContent).toContain("Calibration passed for this position");
  await frame("ready", [0.25, 0.75, 1, -0.5]);
  expect(host.textContent).toContain("Estimated screen region:");
  // Track stays live and unmuted; only the actual video frames stop advancing.
  await act(async () => vi.advanceTimersByTimeAsync(1750));
  expect(host.textContent).toContain(
    "Calibration expired because camera images stopped updating",
  );
  expect(host.textContent).not.toContain("Estimated screen region:");
  expect(host.textContent).not.toContain(
    "Calibration passed for this position",
  );
  expect(host.textContent).not.toContain("Independent check median error:");
  expect(calibrationButton().disabled).toBe(true);
});
