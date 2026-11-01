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

it.each(["Keep my corrections", "Use latest saved transcript"])(
  "preserves unsaved corrections on background transcription and requires an explicit choice: %s",
  async (choice) => {
    const initialRevision = "2026-10-31T06:00:00.000Z";
    const latestRevision = "2026-10-31T06:00:10.000Z";
    let clip = {
      _id: "clip-id",
      ownerId: "hr-id",
      role: "hr",
      createdAt: initialRevision,
      updatedAt: initialRevision,
      offsetMs: 0,
      durationMs: 30000,
      transcript: "Initial automatic text.",
      transcriptState: "ready",
    };
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit = {}) => {
        if (url === "/api/interviews/interview-id/media")
          return new Response(JSON.stringify([{ ...clip }]));
        if (
          url === "/api/media/clip-id/transcript" &&
          options.method === "PATCH"
        ) {
          const input = JSON.parse(String(options.body));
          writes.push(input);
          clip = { ...clip, transcript: input.transcript };
          return new Response(JSON.stringify({ ...clip }));
        }
        throw new Error(`Unexpected test request: ${url}`);
      }),
    );
    await act(async () =>
      root.render(createElement(MediaReview, { interviewId: "interview-id" })),
    );
    await act(async () => {
      const select = host.querySelector("select")!;
      select.value = "clip-id";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const textarea = host.querySelector("textarea")!;
    const manual = "My independently reviewed correction.";
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, manual);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    clip = {
      ...clip,
      updatedAt: latestRevision,
      transcript: "New background recognition.",
    };
    await act(async () => button("Refresh recordings").click());
    expect(textarea.value).toBe(manual);
    expect(host.textContent).toContain("unsaved corrections are preserved");
    expect(button("Save reviewed transcript").disabled).toBe(true);
    await act(async () => button("Save reviewed transcript").click());
    expect(writes).toHaveLength(0);
    await act(async () => button(choice).click());
    const expected =
      choice === "Keep my corrections" ? manual : clip.transcript;
    expect(textarea.value).toBe(expected);
    expect(button("Save reviewed transcript").disabled).toBe(false);
    await act(async () => button("Save reviewed transcript").click());
    expect(writes).toEqual([
      {
        transcript: expected,
        reviewed: true,
        expectedUpdatedAt: latestRevision,
      },
    ]);
    expect(host.textContent).not.toContain("unsaved corrections are preserved");
  },
);

it("refreshes server transcript text when the reviewer has made no local changes", async () => {
  const revision = "2026-10-31T06:00:00.000Z";
  let text = "Initial recognition.";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              _id: "clip-id",
              ownerId: "hr-id",
              role: "hr",
              createdAt: revision,
              updatedAt: revision,
              offsetMs: 0,
              durationMs: 30000,
              transcript: text,
              transcriptState: "ready",
            },
          ]),
        ),
    ),
  );
  await act(async () =>
    root.render(createElement(MediaReview, { interviewId: "interview-id" })),
  );
  await act(async () => {
    const select = host.querySelector("select")!;
    select.value = "clip-id";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelector("textarea")!.value).toBe(text);
  text = "The completed recognition.";
  await act(async () => button("Refresh recordings").click());
  expect(host.querySelector("textarea")!.value).toBe(text);
  expect(host.textContent).not.toContain("unsaved corrections are preserved");
});
