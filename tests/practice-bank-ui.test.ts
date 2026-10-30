// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { Problem } from "../shared/types";
import {
  PracticeQuestionBank,
  filterPracticeProblems,
} from "../src/PracticeQuestionBank";
import { send } from "../src/api";
vi.mock("../src/api", () => ({ send: vi.fn() }));
const rows: Problem[] = Array.from({ length: 45 }, (_, i) => ({
  id: `practice-${i}`,
  title: `Original question ${i}`,
  topic: i % 2 ? "Arrays" : "Strings",
  difficulty: i % 3 === 0 ? "Easy" : i % 3 === 1 ? "Medium" : "Hard",
  description: "Read standard input and print the requested answer.",
  constraints: "1 <= n <= 100",
  examples: [
    { input: "1", output: "1" },
    { input: "2", output: "2" },
  ],
  starter: { python: "", java: "", javascript: "", c: "", cpp: "" },
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.mocked(send).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = async () =>
  act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        {},
        createElement(PracticeQuestionBank, {
          problems: rows,
          loading: false,
          error: "",
          executionAvailable: false,
        }),
      ),
    ),
  );
it("filters by difficulty, topic and keyword together", () => {
  expect(
    filterPracticeProblems(rows, "Original question 1", "Medium", "Arrays").map(
      (p) => p.id,
    ),
  ).toEqual(["practice-1", "practice-13", "practice-19"]);
  expect(filterPracticeProblems(rows, "missing", "All", "All")).toEqual([]);
});
it("shows real counts,20questions perpage and a clear unavailable-execution notice", async () => {
  await render();
  expect(host.textContent).toContain("Easy: 15");
  expect(host.textContent).toContain("Medium: 15");
  expect(host.textContent).toContain("Hard: 15");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(20);
  expect(host.textContent).toContain(
    "Private code execution is awaiting server setup",
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Next")!
      .click(),
  );
  expect(host.textContent).toContain("Page 2 of 3");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(20);
});
it("reads the problem and examples before creating any practice session", async () => {
  await render();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Original question 0")!
      .click(),
  );
  expect(
    host.querySelector('[aria-label="Selected coding question"]')?.textContent,
  ).toContain("Example 2");
  expect(send).not.toHaveBeenCalled();
});
it("starts a coding-only personal workspace and reports service failure without requesting devices", async () => {
  vi.mocked(send).mockRejectedValue(new Error("Synthetic setup unavailable"));
  await render();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Practice")!
      .click(),
  );
  expect(send).toHaveBeenCalledWith("/practice/coding", {
    problemId: "practice-0",
  });
  expect(host.textContent).toContain("Synthetic setup unavailable");
  expect(host.querySelector("video")).toBeNull();
  expect(host.textContent).not.toContain("Enter waiting room");
});
