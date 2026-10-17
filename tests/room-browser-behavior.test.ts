// @vitest-environment jsdom
// DOM-level behavior tests, not proof of real camera capture or peer connectivity.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMonitoring } from "../src/monitoring";
import { useInterviewDevices } from "../src/interview-devices";
import type { ServiceStatus } from "../shared/types";
import { summarizeMonitoring, tabSwitchThreshold } from "../shared/monitoring";
let root: Root,
  host: HTMLDivElement,
  monitoring: ReturnType<typeof useMonitoring>,
  devices: ReturnType<typeof useInterviewDevices>;
let events: any[];
const noFace = () => {};
function Harness({
  enabled = true,
  threshold = 3,
}: {
  enabled?: boolean;
  threshold?: number;
}) {
  monitoring = useMonitoring(
    "dom-test-room",
    enabled,
    null,
    { tabSwitchWarningThreshold: threshold } as ServiceStatus,
    noFace,
  );
  devices = useInterviewDevices(monitoring.record);
  return createElement(
    "div",
    null,
    createElement("button", { id: "internal-panel" }, "Resume"),
    createElement("textarea", { id: "private-notes" }),
    createElement(
      "div",
      { "data-interview-editor": true },
      createElement("textarea", { id: "editor" }),
    ),
    createElement("p", { role: "status" }, monitoring.warning),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  events = [];
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      events.push(...JSON.parse(options.body).events);
      return new Response(JSON.stringify({ accepted: events.length }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("allows internal panel navigation and editor Tab without warnings, and scopes clipboard events to the editor", async () => {
  const key = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    document.getElementById("internal-panel")!.click();
    document.getElementById("editor")!.dispatchEvent(key);
    document
      .getElementById("private-notes")!
      .dispatchEvent(new Event("paste", { bubbles: true }));
  });
  expect(key.defaultPrevented).toBe(false);
  expect(monitoring.warning).toBe("");
  expect(events.some((e) => ["paste", "blur", "hidden"].includes(e.kind))).toBe(
    false,
  );
  await act(async () =>
    document
      .getElementById("editor")!
      .dispatchEvent(new Event("paste", { bubbles: true })),
  );
  expect(events.filter((e) => e.kind === "paste")).toHaveLength(1);
  expect(events.find((e) => e.kind === "paste").detail).toContain(
    "clipboard contents not collected",
  );
});
it("records distinct outside-page events with connection context and shows one return warning", async () => {
  monitoring.setConnection("Room updates interrupted · reconnecting");
  await act(async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(events.map((e) => e.kind)).toEqual(
    expect.arrayContaining(["hidden", "blur", "visible", "focus"]),
  );
  expect(events.find((e) => e.kind === "hidden").detail).toContain(
    "reconnecting",
  );
  expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(monitoring.warning).toBe(
    "Please stay on the interview page. An activity event has been recorded for the interviewer to review.",
  );
});
it("does not misclassify focus changes caused by an expected device permission dialog", async () => {
  let done!: () => void;
  const permission = new Promise<void>((resolve) => {
    done = resolve;
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = monitoring.permissionDialog(() => permission);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    done();
    await pending;
  });
  expect(
    events.some((e) => ["hidden", "blur", "focus", "visible"].includes(e.kind)),
  ).toBe(false);
  expect(monitoring.warning).toBe("");
});
function visibility(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
it("preserves the return warning when focus arrives before the page becomes visible", async () => {
  vi.useFakeTimers();
  await act(async () => {
    window.dispatchEvent(new Event("blur"));
    visibility(true);
    await vi.advanceTimersByTimeAsync(2400);
    window.dispatchEvent(new Event("focus"));
  });
  expect(monitoring.warning).toBe("");
  await act(async () => visibility(false));
  expect(monitoring.warning).toContain("stay on the interview page");
  expect(events.find((e) => e.kind === "visible").durationMs).toBe(2400);
  expect(monitoring.tabDepartures).toBe(1);
});
it("records real tab hiding during device prompts, but bounds incidental focus suppression", async () => {
  vi.useFakeTimers();
  let done!: () => void;
  const pending = monitoring.permissionDialog(
    () =>
      new Promise<void>((resolve) => {
        done = resolve;
      }),
  );
  await act(async () => {
    window.dispatchEvent(new Event("blur"));
    visibility(true);
    await vi.advanceTimersByTimeAsync(1000);
    visibility(false);
    window.dispatchEvent(new Event("focus"));
  });
  expect(events.filter((e) => e.kind === "blur")).toHaveLength(0);
  expect(events.find((e) => e.kind === "hidden").detail).toContain(
    "permission request",
  );
  expect(monitoring.warning).toContain("stay on the interview page");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(2000);
    window.dispatchEvent(new Event("focus"));
    done();
    await pending;
  });
  expect(events.filter((e) => e.kind === "blur")).toHaveLength(1);
  expect(events.find((e) => e.kind === "focus").durationMs).toBe(2000);
});
it("counts each departure once and shows the configured repeated-activity threshold", async () => {
  await act(async () => root.render(createElement(Harness, { threshold: 2 })));
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => {
      visibility(true);
      visibility(true);
    });
    await act(async () => visibility(false));
  }
  expect(monitoring.tabDepartures).toBe(2);
  expect(events.filter((e) => e.kind === "hidden")).toHaveLength(2);
  expect(monitoring.warning).toContain("review threshold of 2");
  expect(monitoring.warning).toContain("do not determine misconduct");
});
it("collects no activity without consent/live activation, or after monitoring stops", async () => {
  await act(async () =>
    root.render(createElement(Harness, { enabled: false })),
  );
  events = [];
  await act(async () => {
    visibility(true);
    window.dispatchEvent(new Event("blur"));
    visibility(false);
    window.dispatchEvent(new Event("focus"));
    monitoring.record("no-face", 5000);
  });
  expect(events).toEqual([]);
  expect(monitoring.tabDepartures).toBe(0);
});
it("shows contextual face and camera warnings only for recorded live observations", async () => {
  await act(async () => monitoring.record("no-face", 5000));
  expect(monitoring.warning).toContain("face was not detected");
  await act(async () => monitoring.record("multiple-faces", 5000));
  expect(monitoring.warning).toContain("More than one face");
  await act(async () => monitoring.record("camera-off"));
  expect(monitoring.warning).toContain("technical issue or accommodation");
  expect(monitoring.warning).toContain("does not determine misconduct");
});
it("summarizes tab duration without double-counting overlapping focus and validates thresholds", () => {
  expect(
    summarizeMonitoring([
      { kind: "hidden", durationMs: 0 },
      { kind: "blur", durationMs: 0 },
      { kind: "visible", durationMs: 2500 },
      { kind: "focus", durationMs: 2600 },
      { kind: "hidden", durationMs: 0 },
      { kind: "multiple-faces", durationMs: 5000 },
    ]),
  ).toMatchObject({
    tabDepartures: 2,
    tabReturns: 1,
    hiddenDurationMs: 2500,
    focusLosses: 1,
    focusDurationMs: 2600,
    multipleFaces: 1,
  });
  expect(tabSwitchThreshold()).toBe(3);
  expect(tabSwitchThreshold(NaN)).toBe(3);
  expect(tabSwitchThreshold(0)).toBe(1);
  expect(tabSwitchThreshold(500)).toBe(20);
});
function mediaTrack(kind: string, displaySurface?: string) {
  return {
    kind,
    readyState: "live",
    enabled: true,
    onended: null as any,
    onmute: null as any,
    onunmute: null as any,
    stop: vi.fn(),
    getSettings: () => ({ displaySurface }),
  };
}
function stream(tracks: ReturnType<typeof mediaTrack>[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  } as unknown as MediaStream;
}
it("uses selected devices, reports camera loss/recovery, and stops all tracks on unmount", async () => {
  const camera = mediaTrack("video"),
    mic = mediaTrack("audio"),
    capture = stream([camera, mic]);
  const getUserMedia = vi.fn(async () => capture);
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  await act(async () =>
    devices.check(false, { camera: "chosen-camera", microphone: "chosen-mic" }),
  );
  expect(getUserMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({ deviceId: { exact: "chosen-camera" } }),
      audio: expect.objectContaining({ deviceId: { exact: "chosen-mic" } }),
    }),
  );
  expect(devices.camera).toBe(true);
  await act(async () => camera.onmute());
  expect(devices.camera).toBe(false);
  await act(async () => camera.onunmute());
  expect(devices.camera).toBe(true);
  await act(async () => devices.stop());
  expect(camera.stop).toHaveBeenCalled();
  expect(mic.stop).toHaveBeenCalled();
  expect(devices.stream).toBeNull();
});
it("validates entire-screen selection and handles browser stop-sharing without ending the camera", async () => {
  const windowTrack = mediaTrack("video", "window"),
    monitorTrack = mediaTrack("video", "monitor");
  const getDisplayMedia = vi
    .fn()
    .mockResolvedValueOnce(stream([windowTrack]))
    .mockResolvedValueOnce(stream([monitorTrack]));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia },
  });
  await act(async () => {
    await expect(devices.shareScreen(true)).rejects.toThrow("entire screen");
  });
  expect(windowTrack.stop).toHaveBeenCalled();
  expect(devices.screen).toBeNull();
  await act(async () => devices.shareScreen(true));
  expect(devices.screen).not.toBeNull();
  await act(async () => monitorTrack.onended());
  expect(devices.screen).toBeNull();
  expect(events.map((e) => e.kind)).toEqual(
    expect.arrayContaining(["screen-share-started", "screen-share-stopped"]),
  );
});
