// @vitest-environment jsdom
// Synthetic recorder/track doubles; no physical microphone or provider calls.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomConversation } from "../src/RoomConversation";
import { api } from "../src/api";
import type { Interview, ServiceStatus } from "../shared/types";

vi.mock("../src/api", () => ({ api: vi.fn(), send: vi.fn() }));

class Recorder {
  static instances: Recorder[] = [];
  static failure: "" | "construct" | "start" = "";
  static formats = ["audio/webm"];
  static isTypeSupported(type: string) {
    return Recorder.formats.includes(type);
  }
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor(public stream: MediaStream) {
    if (Recorder.failure === "construct")
      throw new Error("Cannot construct recorder");
    Recorder.instances.push(this);
  }
  start() {
    if (Recorder.failure === "start") throw new Error("Cannot start recorder");
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["synthetic audio"]) });
      this.onstop?.();
    });
  }
}

let root: Root, host: HTMLDivElement;
let track: { stop: ReturnType<typeof vi.fn> };
let device: MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;
const changed = vi.fn();
const interview = {
  _id: "test-interview",
  questions: [{ id: "q1", text: "Explain database transactions.", rubric: [] }],
  answers: [],
} as unknown as Interview;
const render = (active = true) =>
  root.render(
    createElement(RoomConversation, {
      interview,
      candidate: true,
      active,
      services: { transcription: true } as ServiceStatus,
      reload: async () => {},
      permissionDialog: async (work) => work(),
      onRecordingChange: changed,
    }),
  );
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
}

beforeEach(async () => {
  vi.clearAllMocks();
  Recorder.instances = [];
  Recorder.failure = "";
  Recorder.formats = ["audio/webm"];
  track = { stop: vi.fn() };
  device = { getTracks: () => [track] } as unknown as MediaStream;
  getUserMedia = vi.fn(async () => device);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api).mockResolvedValue({
    text: "A transaction commits atomically.",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => render());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["construct", "start"] as const)(
  "releases the acquired microphone when recorder %s fails",
  async (failure) => {
    Recorder.failure = failure;
    await act(async () => button("Record a spoken answer").click());
    expect(track.stop).toHaveBeenCalled();
    expect(host.textContent).toContain(
      failure === "construct"
        ? "Cannot construct recorder"
        : "Cannot start recorder",
    );
    expect(host.textContent).not.toContain("● Recording");
    expect(api).not.toHaveBeenCalled();
    Recorder.failure = "";
    await act(async () => button("Record a spoken answer").click());
    expect(Recorder.instances.at(-1)?.state).toBe("recording");
  },
);

it("discards browser-error partial audio instead of transcribing it", async () => {
  await act(async () => button("Record a spoken answer").click());
  await act(async () => Recorder.instances[0].onerror?.());
  expect(track.stop).toHaveBeenCalled();
  expect(host.textContent).toContain("Audio capture stopped");
  expect(host.textContent).not.toContain("● Recording");
  expect(api).not.toHaveBeenCalled();
});

it("stops an active microphone when the interview ends without sending a transcript", async () => {
  await act(async () => button("Record a spoken answer").click());
  await act(async () => render(false));
  expect(track.stop).toHaveBeenCalled();
  expect(Recorder.instances[0].state).toBe("inactive");
  expect(host.textContent).not.toContain("● Recording");
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(api).not.toHaveBeenCalled();
});

it("ignores recognition arriving after the interview has ended", async () => {
  let resolve!: (value: { text: string }) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  await act(async () => button("Record a spoken answer").click());
  await act(async () => button("Stop recording and transcribe").click());
  expect(api).toHaveBeenCalledOnce();
  await act(async () => render(false));
  await act(async () =>
    resolve({ text: "Late text must not enter another answer." }),
  );
  expect(host.querySelector("textarea")!.value).toBe("");
  expect(host.textContent).not.toContain("I reviewed the transcript");
});

it("releases a permission result arriving after the interview has ended", async () => {
  let resolve!: (value: MediaStream) => void;
  getUserMedia.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(async () => button("Record a spoken answer").click());
  await act(async () => render(false));
  await act(async () => resolve(device));
  expect(track.stop).toHaveBeenCalled();
  expect(Recorder.instances).toHaveLength(0);
  expect(api).not.toHaveBeenCalled();
});

it("keeps a successful spoken answer unsubmitted until its transcript is reviewed", async () => {
  await act(async () => button("Record a spoken answer").click());
  expect(host.querySelector("textarea")!.disabled).toBe(true);
  await act(async () => button("Stop recording and transcribe").click());
  expect(track.stop).toHaveBeenCalled();
  expect(api).toHaveBeenCalledOnce();
  expect(host.querySelector("textarea")!.value).toBe(
    "A transaction commits atomically.",
  );
  expect(button("Submit answer").disabled).toBe(true);
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  expect(button("Submit answer").disabled).toBe(false);
});
