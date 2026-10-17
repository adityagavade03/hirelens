// @vitest-environment jsdom
// Lifecycle tests use browser mocks, not real camera/relay validation.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDraftSync } from "../src/draft-sync";
import { useFacePresence } from "../src/face-presence";
import { summarizeCallStats, testRelay } from "../src/rtc-diagnostics";
import type { ServiceStatus } from "../shared/types";
import { requestMedia } from "../src/media-request";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
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
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

it("retries a failed draft without further typing or a socket reconnect", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("temporary failure"))
    .mockResolvedValue(undefined);
  let status = "";
  function Harness({
    text,
    active = true,
  }: {
    text: string;
    active?: boolean;
  }) {
    status = useDraftSync(active, text, "java", "connected", save);
    return null;
  }
  await act(async () =>
    root.render(createElement(Harness, { text: "latest code" })),
  );
  await advance(500);
  expect(status).toContain("Waiting to sync");
  await advance(2000);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith("latest code", "java");
  expect(status).toContain("Saved");
  await act(async () =>
    root.render(createElement(Harness, { text: "closed", active: false })),
  );
  await advance(30000);
  expect(save).toHaveBeenCalledTimes(2);
});
it("cancels retries for an outdated draft and saves the replacement after reconnect", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  function Harness({ text }: { text: string }) {
    useDraftSync(true, text, "java", "connected", save);
    return null;
  }
  await act(async () => root.render(createElement(Harness, { text: "old" })));
  await advance(500);
  await act(async () => root.render(createElement(Harness, { text: "new" })));
  await act(async () => window.dispatchEvent(new Event("online")));
  await advance(20000);
  expect(save.mock.calls.map((c) => c[0])).toEqual(["old", "new"]);
});

class FaceWorker {
  static instances: FaceWorker[] = [];
  onmessage: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FaceWorker.instances.push(this);
  }
  respond(data: any) {
    this.onmessage?.({ data });
  }
}
function faceSetup() {
  FaceWorker.instances = [];
  vi.stubGlobal("Worker", FaceWorker);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  );
  const track = { enabled: true, muted: false, readyState: "live" };
  const video = {
    srcObject: { getVideoTracks: () => [track] },
    readyState: 4,
    paused: false,
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
  } as unknown as HTMLVideoElement;
  const services = {
    face: true,
    faceModelUrl: "/model",
    mediapipeWasmUrl: "/wasm",
    faceThresholdSeconds: 3,
  } as ServiceStatus;
  const record = vi.fn();
  let face!: ReturnType<typeof useFacePresence>;
  function Harness({
    enabled,
    active = false,
  }: {
    enabled: boolean;
    active?: boolean;
  }) {
    face = useFacePresence({ enabled, active, video, services, record });
    return null;
  }
  const render = (enabled: boolean, active = false) =>
    act(async () => root.render(createElement(Harness, { enabled, active })));
  const frame = async (count: number) => {
    video.currentTime += 0.75;
    await advance(750);
    await act(async () =>
      FaceWorker.instances.at(-1)!.respond({ kind: "count", count }),
    );
  };
  return { track, video, record, render, frame, face: () => face };
}
it("requires an opt-in and actual single-face frames, with no preflight event collection", async () => {
  const f = faceSetup();
  await f.render(false);
  await advance(10000);
  expect(FaceWorker.instances).toHaveLength(0);
  await f.render(true);
  const worker = FaceWorker.instances[0];
  await act(async () => worker.respond({ kind: "ready" }));
  for (let n = 0; n < 3; n++) await f.frame(1);
  expect(f.face().ready).toBe(true);
  for (let n = 0; n < 8; n++) await f.frame(0);
  expect(f.record).not.toHaveBeenCalled();
  await f.render(true, true);
  for (let n = 0; n < 6; n++) await f.frame(0);
  expect(f.record.mock.calls.filter((c) => c[0] === "no-face")).toHaveLength(1);
  await f.render(false, true);
  expect(worker.terminate).toHaveBeenCalled();
  const calls = f.record.mock.calls.length;
  await act(async () => worker.respond({ kind: "count", count: 2 }));
  await advance(30000);
  expect(f.record).toHaveBeenCalledTimes(calls);
});
it("does not treat a camera outage as missing-face evidence and handles detector failure", async () => {
  const f = faceSetup();
  await f.render(true, true);
  const worker = FaceWorker.instances[0];
  await act(async () => worker.respond({ kind: "ready" }));
  for (let n = 0; n < 3; n++) await f.frame(1);
  f.track.muted = true;
  for (let n = 0; n < 8; n++) await f.frame(0);
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  expect(
    f.record.mock.calls.filter((c) => c[0] === "monitoring-unavailable"),
  ).toHaveLength(1);
  f.track.muted = false;
  await f.frame(0);
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  await act(async () => worker.respond({ kind: "error" }));
  expect(f.face().status).toContain("unavailable");
  expect(f.face().ready).toBe(false);
  expect(worker.terminate).toHaveBeenCalled();
});
it("reports a frozen live camera as unavailable and resumes after a fresh frame", async () => {
  const f = faceSetup();
  await f.render(true, true);
  const worker = FaceWorker.instances[0];
  await act(async () => worker.respond({ kind: "ready" }));
  for (let n = 0; n < 3; n++) await f.frame(1);
  expect(f.face().ready).toBe(true);
  await advance(6000);
  expect(f.face().status).toContain("waiting for fresh camera frames");
  expect(f.face().ready).toBe(false);
  expect(
    f.record.mock.calls.filter((c) => c[0] === "monitoring-unavailable"),
  ).toHaveLength(1);
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  await f.frame(1);
  expect(f.face().ready).toBe(true);
  expect(f.face().status).toContain("Face presence active");
});
it("does not count a delayed pre-admission frame as live face evidence", async () => {
  const f = faceSetup();
  await f.render(true, false);
  const worker = FaceWorker.instances[0];
  await act(async () => worker.respond({ kind: "ready" }));
  for (let n = 0; n < 3; n++) await f.frame(1);
  f.video.currentTime += 0.75;
  await advance(750); // Capture a frame before admission but hold its result.
  await f.render(true, true);
  await advance(4000);
  await act(async () => worker.respond({ kind: "count", count: 0 }));
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  for (let n = 0; n < 4; n++) await f.frame(0);
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  await f.frame(0);
  expect(f.record.mock.calls.filter((c) => c[0] === "no-face")).toHaveLength(1);
});
it("rejects an in-flight result if the source camera track was replaced", async () => {
  const f = faceSetup();
  await f.render(true, true);
  const worker = FaceWorker.instances[0];
  await act(async () => worker.respond({ kind: "ready" }));
  for (let n = 0; n < 3; n++) await f.frame(1);
  f.video.currentTime += 0.75;
  await advance(750);
  const newTrack = { enabled: true, muted: false, readyState: "live" };
  Object.assign(f.video, { srcObject: { getVideoTracks: () => [newTrack] } });
  await act(async () => worker.respond({ kind: "count", count: 0 }));
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  for (let n = 0; n < 4; n++) await f.frame(0);
  expect(f.record.mock.calls.some((c) => c[0] === "no-face")).toBe(false);
  await f.frame(0);
  expect(f.record.mock.calls.filter((c) => c[0] === "no-face")).toHaveLength(1);
});
it("releases a pending frame when consent is withdrawn during capture", async () => {
  const f = faceSetup();
  let resolve!: (value: any) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  await f.render(true);
  const worker = FaceWorker.instances[0];
  await act(async () => worker.respond({ kind: "ready" }));
  await advance(750);
  await f.render(false);
  const bitmap = { close: vi.fn() };
  await act(async () => resolve(bitmap));
  expect(bitmap.close).toHaveBeenCalled();
  expect(worker.postMessage.mock.calls.some((c) => c[0].kind === "frame")).toBe(
    false,
  );
});
it("uses only the selected ICE pair and excludes addresses and credentials from live diagnostics", () => {
  const report = new Map<string, any>([
    ["transport", { type: "transport", selectedCandidatePairId: "pair" }],
    [
      "pair",
      {
        type: "candidate-pair",
        localCandidateId: "local",
        remoteCandidateId: "remote",
        currentRoundTripTime: 0.12,
      },
    ],
    ["local", { candidateType: "relay", address: "private-address" }],
    ["remote", { candidateType: "host", address: "remote-address" }],
    ["out", { type: "outbound-rtp", bytesSent: 8192 }],
    ["in", { type: "inbound-rtp", bytesReceived: 4096 }],
  ]) as unknown as RTCStatsReport;
  expect(summarizeCallStats(report)).toEqual({
    route: "relay",
    roundTripMs: 120,
    sentBytes: 8192,
    receivedBytes: 4096,
  });
  expect(summarizeCallStats(new Map() as RTCStatsReport).route).toBe("unknown");
});

class ProbePeer {
  static instances: ProbePeer[] = [];
  static connect = true;
  localDescription: any;
  remoteDescription: any;
  onicecandidate: any;
  ondatachannel: any;
  close = vi.fn();
  addIceCandidate = vi.fn();
  channel: any;
  constructor(public config: RTCConfiguration) {
    ProbePeer.instances.push(this);
  }
  createDataChannel() {
    this.channel = {
      close: vi.fn(),
      send: (data: string) => {
        if (ProbePeer.connect && data === "hirelens-check")
          this.channel.onmessage?.({ data: "hirelens-ok" });
      },
    };
    return this.channel;
  }
  async createOffer() {
    return { type: "offer", sdp: "fixture" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "fixture" };
  }
  async setLocalDescription(value: any) {
    this.localDescription = value;
  }
  async setRemoteDescription(value: any) {
    this.remoteDescription = value;
    if (value.type === "answer" && ProbePeer.connect) this.channel.onopen();
  }
}
it("times out an unanswered media prompt and stops a stream granted after the timeout", async () => {
  let grant!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>((resolve) => {
    grant = resolve;
  });
  const result = expect(
    requestMedia(pending, new AbortController().signal),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(30000);
  await result;
  const stop = vi.fn();
  grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await Promise.resolve();
  expect(stop).toHaveBeenCalledOnce();
});
it("cancels pending media requests immediately and keeps accepted streams alive", async () => {
  const controller = new AbortController();
  let grant!: (stream: MediaStream) => void;
  const result = expect(
    requestMedia(
      new Promise((resolve) => {
        grant = resolve;
      }),
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await result;
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  grant(stream);
  await Promise.resolve();
  expect(stop).toHaveBeenCalledOnce();
  stop.mockClear();
  await expect(
    requestMedia(Promise.resolve(stream), new AbortController().signal),
  ).resolves.toBe(stream);
  await vi.advanceTimersByTimeAsync(30000);
  expect(stop).not.toHaveBeenCalled();
});
const relay = {
  iceServers: [
    { urls: "turn:fixture.test", username: "fixture", credential: "fixture" },
  ],
};
it("probes a forced relay data exchange and closes both peers after success", async () => {
  ProbePeer.instances = [];
  ProbePeer.connect = true;
  vi.stubGlobal("RTCPeerConnection", ProbePeer);
  await testRelay(relay, new AbortController().signal);
  expect(ProbePeer.instances).toHaveLength(2);
  for (const peer of ProbePeer.instances) {
    expect(peer.config.iceTransportPolicy).toBe("relay");
    expect(peer.close).toHaveBeenCalled();
  }
});
it("fails an unresponsive relay test on timeout and releases both peers", async () => {
  ProbePeer.instances = [];
  ProbePeer.connect = false;
  vi.stubGlobal("RTCPeerConnection", ProbePeer);
  const result = expect(
    testRelay(relay, new AbortController().signal),
  ).rejects.toThrow("Relay check failed");
  await vi.advanceTimersByTimeAsync(15000);
  await result;
  expect(
    ProbePeer.instances.every((p) => p.close.mock.calls.length === 1),
  ).toBe(true);
});
it("cancels an in-progress relay test and rejects missing configuration", async () => {
  ProbePeer.instances = [];
  ProbePeer.connect = false;
  vi.stubGlobal("RTCPeerConnection", ProbePeer);
  const controller = new AbortController();
  const result = expect(testRelay(relay, controller.signal)).rejects.toThrow(
    "cancelled",
  );
  controller.abort();
  await result;
  expect(
    ProbePeer.instances.every((p) => p.close.mock.calls.length === 1),
  ).toBe(true);
  await expect(
    testRelay({ iceServers: [] }, new AbortController().signal),
  ).rejects.toThrow("not configured");
});
