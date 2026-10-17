// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventReviewControls } from "../src/MonitoringReview";
import type { MonitoringEvent } from "../shared/types";

let root: Root, host: HTMLDivElement;
const event: MonitoringEvent = {
  _id: "event-id",
  kind: "visible",
  occurredAt: "2026-10-17T06:00:00.000Z",
  receivedAt: "2026-10-17T06:00:01.000Z",
  durationMs: 2400,
  detail: "Returned after tab departure 1",
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
    (item) => item.textContent === text,
  )!;
}
async function inputNote(text: string) {
  await act(async () => {
    const field = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it("saves staff context to the exact event and refreshes only after a successful response", async () => {
  const onSaved = vi.fn();
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(event), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  await act(async () =>
    root.render(
      createElement(EventReviewControls, {
        interviewId: "interview-id",
        event,
        onSaved,
      }),
    ),
  );
  expect(host.textContent).toContain("Awaiting human review");
  await act(async () => button("Review event").click());
  await act(async () => {
    const field = host.querySelector("select")!;
    field.value = "explained";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await inputNote("  Candidate explained a brief network issue.  ");
  await submit();
  expect(fetch).toHaveBeenCalledWith(
    "/api/interviews/interview-id/events/event-id/review",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({
        status: "explained",
        note: "Candidate explained a brief network issue.",
      }),
    }),
  );
  expect(onSaved).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).toBeNull();
});

it("retains the review draft when finalized-report protection rejects saving", async () => {
  const onSaved = vi.fn();
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            message:
              "Reopen the interview report before changing its evidence review.",
          },
        }),
        { status: 409 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await act(async () =>
    root.render(
      createElement(EventReviewControls, {
        interviewId: "interview-id",
        event,
        onSaved,
      }),
    ),
  );
  await act(async () => button("Review event").click());
  await inputNote("short");
  await submit();
  expect(fetch).not.toHaveBeenCalled();
  expect(host.textContent).toContain("between 10 and 2,000");
  const note = "Discuss with the candidate before deciding any follow-up.";
  await inputNote(note);
  await submit();
  expect(host.textContent).toContain("Reopen the interview report");
  expect(host.querySelector("textarea")?.value).toBe(note);
  expect(onSaved).not.toHaveBeenCalled();
});

it("displays saved context without editing controls on a finalized report", async () => {
  const reviewed: MonitoringEvent = {
    ...event,
    review: {
      status: "explained",
      note: "Network interruption confirmed by both participants.",
      reviewedBy: "hr-id",
      reviewedAt: event.occurredAt,
    },
  };
  await act(async () =>
    root.render(
      createElement(EventReviewControls, {
        interviewId: "interview-id",
        event: reviewed,
        readOnly: true,
        onSaved: vi.fn(),
      }),
    ),
  );
  expect(host.textContent).toContain("Context recorded");
  expect(host.textContent).toContain(reviewed.review!.note);
  expect(host.querySelector("button")).toBeNull();
});
