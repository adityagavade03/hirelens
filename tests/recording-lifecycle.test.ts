// @vitest-environment jsdom
// Recorder lifecycle coverage with test doubles; not proof of physical capture quality.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InterviewCapture } from "../src/InterviewMedia";
import { api, send } from "../src/api";
import type { Interview } from "../shared/types";

vi.mock("../src/api", () => ({
  api: vi.fn(async () => ({ _id: "saved-clip" })),
  send: vi.fn(async (path: string) =>
    path.endsWith("/captures") ? { _id: "capture-id" } : {},
  ),
  useResource: () => ({ data: [], error: "", reload: async () => {} }),
  dateLabel: () => "",
}));
vi.mock("../src/auth-context", () => ({
  useAuth: () => ({ user: { _id: "candidate-id", role: "candidate" } }),
}));

class Recorder {
  static instances: Recorder[] = [];
  static formats = ["video/webm;codecs=vp8,opus", "audio/mp4"];
  static failStart = false;
  static isTypeSupported(type: string) {
    return Recorder.formats.includes(type);
  }
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor(
    public stream: MediaStream,
    public options: MediaRecorderOptions,
  ) {
    Recorder.instances.push(this);
  }
  start() {
    if (Recorder.failStart) throw new Error("Device could not start recording");
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["recorded bytes"]) });
      this.onstop?.();
    });
  }
}
function makeStream(audioOnly = false) {
  const tracks = (audioOnly ? ["audio"] : ["video", "audio"]).map((kind) => ({
    kind,
    readyState: "live",
    enabled: true,
    muted: false,
    stop: vi.fn(),
  }));
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}
let root: Root, host: HTMLDivElement, unmounted: boolean, now: number;
let deviceStream: MediaStream;
const stopRef: { current: (() => Promise<void>) | null } = { current: null };
const interview = { _id: "interview-id" } as Interview;
const render = (active = true, stream = deviceStream) =>
  root.render(
    createElement(InterviewCapture, {
      interview,
      stream,
      active,
      services: null,
      stopRef,
    }),
  );
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;
}
async function start() {
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await act(async () => button("Start my recording").click());
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(send).mockImplementation(
    async (path) =>
      (path.endsWith("/captures") ? { _id: "capture-id" } : {}) as never,
  );
  vi.mocked(api).mockResolvedValue({ _id: "saved-clip" });
  Recorder.instances = [];
  Recorder.formats = ["video/webm;codecs=vp8,opus", "audio/mp4"];
  Recorder.failStart = false;
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  now = 100000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  deviceStream = makeStream();
  unmounted = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => render());
});
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("does not begin recording after the interview ends while capture creation is pending", async () => {
  let resolve!: (value: { _id: string }) => void;
  vi.mocked(send).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  await start();
  await act(async () => render(false));
  await act(async () => resolve({ _id: "late-capture" }));
  expect(Recorder.instances).toHaveLength(0);
  expect(send).toHaveBeenCalledWith("/captures/late-capture/stop");
});
it("closes a late capture instead of activating a recorder after unmount", async () => {
  let resolve!: (value: { _id: string }) => void;
  vi.mocked(send).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  await start();
  await act(async () => root.unmount());
  unmounted = true;
  await act(async () => resolve({ _id: "late-capture" }));
  expect(Recorder.instances).toHaveLength(0);
  expect(send).toHaveBeenCalledWith("/captures/late-capture/stop");
});
it("honours consent withdrawn while capture creation is pending", async () => {
  let resolve!: (value: { _id: string }) => void;
  vi.mocked(send).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  await start();
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await act(async () => resolve({ _id: "late-capture" }));
  expect(Recorder.instances).toHaveLength(0);
  expect(send).toHaveBeenCalledWith("/captures/late-capture/stop");
  expect(host.textContent).toContain(
    "Recording was cancelled before it started.",
  );
});
it("settles failed startup so saving and retrying do not hang", async () => {
  Recorder.failStart = true;
  await start();
  expect(host.textContent).toContain("Device could not start recording");
  expect(button("Start my recording").disabled).toBe(false);
  await act(async () => stopRef.current?.());
  expect(send).toHaveBeenCalledWith("/captures/capture-id/stop");
  Recorder.failStart = false;
  await act(async () => button("Start my recording").click());
  expect(Recorder.instances.at(-1)?.state).toBe("recording");
}, 3000);
it("records audio-only devices using an audio format and preserves stream ownership", async () => {
  deviceStream = makeStream(true);
  await act(async () => render());
  await start();
  const recorder = Recorder.instances[0];
  expect(recorder.options.mimeType).toBe("audio/mp4");
  expect(recorder.stream).toBe(deviceStream);
  expect(host.textContent).toContain("Recording your own microphone.");
  now += 5000;
  await act(async () =>
    Promise.all([stopRef.current?.(), stopRef.current?.()]),
  );
  expect(api).toHaveBeenCalledTimes(1);
  const form = vi.mocked(api).mock.calls[0][1]!.body as FormData;
  expect((form.get("clip") as File).type).toBe("audio/mp4");
  expect(form.get("durationMs")).toBe("5000");
  expect(
    vi.mocked(send).mock.calls.filter(([path]) => path.endsWith("/stop")),
  ).toHaveLength(1);
  for (const track of deviceStream.getTracks())
    expect(track.stop).not.toHaveBeenCalled();
});
it("saves the old device segment and does not automatically record a replacement stream", async () => {
  await start();
  now += 5000;
  await act(async () => render(true, makeStream()));
  expect(Recorder.instances).toHaveLength(1);
  expect(Recorder.instances[0].state).toBe("inactive");
  expect(api).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith("/captures/capture-id/stop");
});
it("saves a final segment and closes capture when all local device tracks end", async () => {
  await start();
  for (const track of deviceStream.getTracks())
    Object.assign(track, { readyState: "ended" });
  now += 5000;
  await act(async () => Recorder.instances[0].stop());
  expect(Recorder.instances).toHaveLength(1);
  expect(api).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith("/captures/capture-id/stop");
  expect(host.textContent).not.toContain("● Recording");
});
it("does not restart after a recorder error and still saves the final browser data", async () => {
  await start();
  now += 5000;
  await act(async () => {
    Recorder.instances[0].onerror?.();
    Recorder.instances[0].stop();
  });
  expect(host.textContent).toContain("The browser stopped recording.");
  expect(host.textContent).not.toContain("● Recording");
  expect(Recorder.instances).toHaveLength(1);
  expect(api).toHaveBeenCalledTimes(1);
  await act(async () => stopRef.current?.());
  expect(send).toHaveBeenCalledWith("/captures/capture-id/stop");
});
it("keeps failed uploads retryable before closing their capture", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("Upload interrupted"));
  await start();
  now += 5000;
  await act(async () => button("Stop & save / retry").click());
  expect(host.textContent).toContain("Upload interrupted");
  expect(host.textContent).toContain("1 segment(s) waiting to save.");
  expect(send).not.toHaveBeenCalledWith("/captures/capture-id/stop");
  await act(async () => button("Stop & save / retry").click());
  expect(api).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api).mock.calls[0][1]!.body).toBe(
    vi.mocked(api).mock.calls[1][1]!.body,
  );
  expect(send).toHaveBeenCalledWith("/captures/capture-id/stop");
  expect(host.textContent).toContain("All captured segments saved.");
});

it("requires a live unmuted microphone before creating a recording", async () => {
  Object.assign(deviceStream.getAudioTracks()[0], { enabled: false });
  await start();
  expect(Recorder.instances).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Your microphone is muted.");
  Object.assign(deviceStream.getAudioTracks()[0], {
    enabled: true,
    muted: true,
  });
  await act(async () => button("Start my recording").click());
  expect(Recorder.instances).toHaveLength(0);
  expect(host.textContent).toContain(
    "Your microphone is temporarily unavailable.",
  );
});

it("rejects a video-only stream instead of claiming to record speech", async () => {
  const cameraOnly = {
    getTracks: () => deviceStream.getVideoTracks(),
    getVideoTracks: () => deviceStream.getVideoTracks(),
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  await act(async () => render(true, cameraOnly));
  await start();
  expect(Recorder.instances).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain("No microphone track is available.");
});

it("closes a pending capture if the microphone is muted before recording begins", async () => {
  let resolve!: (value: { _id: string }) => void;
  vi.mocked(send).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  await start();
  Object.assign(deviceStream.getAudioTracks()[0], { enabled: false });
  await act(async () => resolve({ _id: "late-capture" }));
  expect(Recorder.instances).toHaveLength(0);
  expect(send).toHaveBeenCalledWith("/captures/late-capture/stop");
});

it("ends capture after microphone loss even when the camera remains live", async () => {
  await start();
  Object.assign(deviceStream.getAudioTracks()[0], { readyState: "ended" });
  now += 5000;
  await act(async () => Recorder.instances[0].stop());
  expect(deviceStream.getVideoTracks()[0].readyState).toBe("live");
  expect(Recorder.instances).toHaveLength(1);
  expect(api).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith("/captures/capture-id/stop");
  expect(host.textContent).not.toContain("● Recording");
});

it("preserves the participant's mute choice during an existing recording", async () => {
  await start();
  const microphone = deviceStream.getAudioTracks()[0];
  microphone.enabled = false;
  now += 5000;
  await act(async () => Recorder.instances[0].stop());
  expect(microphone.enabled).toBe(false);
  expect(Recorder.instances).toHaveLength(2);
  expect(Recorder.instances[1].state).toBe("recording");
  expect(send).not.toHaveBeenCalledWith("/captures/capture-id/stop");
});
