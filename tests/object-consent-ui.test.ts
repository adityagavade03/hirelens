// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { api, send } from "../src/api";
import {
  ObjectDetectionControls,
  ObjectDetectionOverlay,
  useObjectConsent,
} from "../src/ObjectDetectionControls";
vi.mock("../src/api", () => ({
  api: vi.fn(async () => ({ objectConsent: true })),
  send: vi.fn(async () => ({ accepted: true })),
}));

let host: HTMLDivElement, root: Root;
let consent: ReturnType<typeof useObjectConsent>;
function Harness({
  id = "interview-a",
  localOnly = false,
  savedConsent = false,
}) {
  consent = useObjectConsent(id, localOnly);
  return createElement(ObjectDetectionControls, {
    consent,
    configured: true,
    savedConsent,
    status: "Object check off",
    ready: false,
    detections: [],
    retry: () => {},
    localOnly,
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(send).mockReset().mockResolvedValue({ accepted: true });
  vi.mocked(api).mockReset().mockResolvedValue({ objectConsent: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(props = {}) {
  await act(async () => root.render(createElement(Harness, props)));
}

it("does not enable local inference from a saved consent or mount alone", async () => {
  await render({ savedConsent: true });
  expect(consent.enabled).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Withdraw saved object consent");
  expect(host.textContent).not.toContain("No supported object estimated");
});

it("waits for a successful independent grant and stays off after a rejected grant", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(send).mockReturnValueOnce(
    new Promise((_resolve, no) => {
      reject = no;
    }),
  );
  await render();
  await act(async () => {
    void consent.change(true);
  });
  expect(consent.enabled).toBe(false);
  expect(consent.busy).toBe(true);
  expect(send).toHaveBeenCalledWith("/interviews/interview-a/object-consent", {
    accepted: true,
  });
  await act(async () => reject(new Error("offline")));
  expect(consent.enabled).toBe(false);
  expect(consent.error).toContain("remains off");
  await act(async () => consent.change(true));
  expect(consent.enabled).toBe(true);
});

it("stops locally before withdrawal completes and allows retry after a network failure", async () => {
  await render();
  await act(async () => consent.change(true));
  let reject!: (error: Error) => void;
  vi.mocked(send).mockReturnValueOnce(
    new Promise((_resolve, no) => {
      reject = no;
    }),
  );
  await act(async () => {
    void consent.change(false);
  });
  expect(consent.enabled).toBe(false);
  expect(consent.busy).toBe(true);
  await act(async () => reject(new Error("offline")));
  expect(consent.enabled).toBe(false);
  expect(consent.error).toContain("stopped on this device");
  expect(host.textContent).toContain("Withdraw saved object consent");
  await act(async () => consent.change(false));
  expect(consent.saved).toBe(false);
});

it("ignores a late consent response from a previous interview", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(send).mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  await render();
  await act(async () => {
    void consent.change(true);
    void consent.change(true);
  });
  expect(send).toHaveBeenCalledTimes(1);
  await render({ id: "interview-b" });
  await act(async () => resolve({ accepted: true }));
  expect(consent.enabled).toBe(false);
  expect(consent.saved).toBeUndefined();
  expect(consent.busy).toBe(false);
});

it("keeps practice opt-in local and off again for another session", async () => {
  await render({ localOnly: true });
  await act(async () => consent.change(true));
  expect(consent.enabled).toBe(true);
  expect(send).not.toHaveBeenCalled();
  await render({ id: "another-practice", localOnly: true });
  expect(consent.enabled).toBe(false);
});

it("stops analysis after observing a withdrawal in another session", async () => {
  vi.useFakeTimers();
  await render();
  await act(async () => consent.change(true));
  vi.mocked(api).mockResolvedValueOnce({ objectConsent: false });
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(consent.enabled).toBe(false);
  expect(consent.saved).toBe(false);
  expect(consent.error).toContain("another session");
});

it("ignores a stale withdrawal poll after an explicit new grant", async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  vi.mocked(api).mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  await render();
  await act(async () => consent.change(true));
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  await act(async () => consent.change(false));
  await act(async () => consent.change(true));
  await act(async () => resolve({ objectConsent: false }));
  expect(consent.enabled).toBe(true);
});

it("stops on the matching monitoring rejection event without affecting another interview", async () => {
  await render();
  await act(async () => consent.change(true));
  const withdrawn = (id: string) =>
    window.dispatchEvent(
      new CustomEvent("hirelens:object-consent-withdrawn", { detail: { id } }),
    );
  await act(async () => {
    withdrawn("other-interview");
  });
  expect(consent.enabled).toBe(true);
  await act(async () => {
    withdrawn("interview-a");
  });
  expect(consent.enabled).toBe(false);
  expect(consent.saved).toBe(false);
  expect(consent.error).toContain("no longer covers");
});

it("aligns boxes with cover-cropped and mirrored camera previews", async () => {
  const video = document.createElement("video");
  Object.defineProperties(video, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  });
  const props = {
    video,
    frameAspect: 4 / 3,
    detections: [
      {
        label: "book",
        score: 0.8,
        box: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
      },
    ],
  };
  await act(async () =>
    root.render(createElement(ObjectDetectionOverlay, props)),
  );
  const box = () => host.querySelector(".object-box")!;
  expect(box().getAttribute("x")).toBe("64");
  expect(box().getAttribute("y")).toBe("36");
  expect(box().getAttribute("width")).toBe("128");
  await act(async () =>
    root.render(
      createElement(ObjectDetectionOverlay, { ...props, mirrored: true }),
    ),
  );
  expect(Number(box().getAttribute("x"))).toBeCloseTo(448);
  expect(host.querySelector("text")?.textContent).toBe("book 80%");
});

it("offers a detail model only when configured, without granting camera consent", async () => {
  await render();
  const onProfileChange = vi.fn();
  const props = {
    consent,
    configured: true,
    status: "Object detection is off",
    ready: false,
    detections: [],
    retry: vi.fn(),
    onProfileChange,
  };
  await act(async () =>
    root.render(createElement(ObjectDetectionControls, props)),
  );
  const select = host.querySelector("select")!;
  expect(select.closest("label")?.textContent).toContain("Local model");
  expect(select.options[1].disabled).toBe(true);
  await act(async () =>
    root.render(
      createElement(ObjectDetectionControls, {
        ...props,
        accuracyAvailable: true,
      }),
    ),
  );
  expect(host.querySelector("select")!.options[1].disabled).toBe(false);
  await act(async () => {
    host.querySelector("select")!.value = "detail";
    host
      .querySelector("select")!
      .dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onProfileChange).toHaveBeenCalledWith("detail");
  expect(send).not.toHaveBeenCalled();
});
