// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MediaReview } from "../src/InterviewMedia";

vi.mock("../src/auth-context", () => ({
  useAuth: () => ({ user: { _id: "hr-id", role: "hr" } }),
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
}
it("refreshes a failed transcription revision while preserving the manual draft for a successful reviewed save", async () => {
  const oldRevision = "2026-10-13T06:00:00.000Z";
  const failedRevision = "2026-10-13T06:00:10.000Z";
  const message =
    "Speech recognition returned no usable text. Retry or enter a reviewed transcript.";
  let clip = {
    _id: "clip-id",
    ownerId: "hr-id",
    role: "hr",
    createdAt: oldRevision,
    updatedAt: oldRevision,
    offsetMs: 0,
    durationMs: 30000,
    transcript: "",
    transcriptState: "pending",
    transcriptError: "",
    reviewedAt: undefined as string | undefined,
  };
  const writes: {
    transcript: string;
    reviewed: boolean;
    expectedUpdatedAt: string;
  }[] = [];
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const request = vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url === "/api/interviews/interview-id/media")
      return respond([{ ...clip }]);
    if (url === "/api/media/clip-id/transcribe") {
      clip = {
        ...clip,
        updatedAt: failedRevision,
        transcriptState: "failed",
        transcriptError: message,
      };
      return respond({ error: { message, code: "NO_USABLE_TRANSCRIPT" } }, 422);
    }
    if (url === "/api/media/clip-id/transcript" && options.method === "PATCH") {
      const input = JSON.parse(String(options.body));
      writes.push(input);
      if (input.expectedUpdatedAt !== clip.updatedAt)
        return respond(
          {
            error: {
              message: "This transcript changed. Refresh before saving.",
            },
          },
          409,
        );
      clip = {
        ...clip,
        transcript: input.transcript,
        transcriptState: "ready",
        transcriptError: "",
        reviewedAt: "2026-10-13T06:00:20.000Z",
      };
      return respond({ ...clip });
    }
    throw new Error(`Unexpected test request: ${url}`);
  });
  vi.stubGlobal("fetch", request);
  await act(async () =>
    root.render(createElement(MediaReview, { interviewId: "interview-id" })),
  );
  await act(async () => {
    const select = host.querySelector("select")!;
    select.value = "clip-id";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const textarea = host.querySelector("textarea")!;
  const draft = "I explained the transaction boundary and rollback.";
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, draft);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(textarea.value).toBe(draft);
  await act(async () => button("Transcribe segment").click());
  expect(host.textContent).toContain("no usable text");
  expect(textarea.value).toBe(draft);
  expect(
    request.mock.calls.filter(
      ([url]) => url === "/api/interviews/interview-id/media",
    ),
  ).toHaveLength(2);
  await act(async () => button("Save reviewed transcript").click());
  expect(writes).toEqual([
    { transcript: draft, reviewed: true, expectedUpdatedAt: failedRevision },
  ]);
  expect(clip.reviewedAt).toBeDefined();
  expect(clip.transcript).toBe(draft);
  expect(host.textContent).not.toContain("This transcript changed");
});
