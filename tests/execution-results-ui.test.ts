// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ExecutionResult, Submission } from "../shared/types";
import { ExecutionResults, submissionVerdict } from "../src/ExecutionResults";

let host: HTMLDivElement, root: Root;
const passed: ExecutionResult = {
  status: "Accepted",
  statusId: 3,
  passed: true,
  hidden: false,
  input: "4 7",
  expectedOutput: "11",
  stdout: "11\n",
  time: "0.002",
  memory: 1024,
};
function submission(results: ExecutionResult[] = [passed]): Submission {
  return {
    _id: "submission-a",
    interviewId: "practice-a",
    language: "python",
    code: "print(11)",
    mode: "submit",
    results,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    createdAt: "2026-10-30T12:00:00.000Z",
  };
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = async (value: Submission) =>
  act(async () =>
    root.render(createElement(ExecutionResults, { submission: value })),
  );

it("shows accepted full submissions with all-case totals and explicit runtime/memory units", async () => {
  await render(
    submission([
      passed,
      {
        ...passed,
        hidden: true,
        input: undefined,
        expectedOutput: undefined,
        stdout: undefined,
        time: "0.003",
        memory: 2048,
      },
    ]),
  );
  expect(host.textContent).toContain("Full submission");
  expect(host.textContent).toContain("2 / 2 tests passed");
  expect(host.textContent).toContain("Total runtime: 5.0 ms");
  expect(host.textContent).toContain("Peak case memory: 2.00 MB");
  expect(host.textContent).toContain("Expected output");
  expect(host.textContent).toContain("Your output");
});
it("compares a public wrong answer with its input and expected output", async () => {
  await render(
    submission([
      {
        ...passed,
        statusId: 4,
        status: "Wrong Answer",
        passed: false,
        stdout: "12\n",
      },
    ]),
  );
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Wrong Answer",
  );
  expect(host.textContent).toContain("0 / 1 tests passed");
  const blocks = [...host.querySelectorAll("pre")].map((p) => p.textContent);
  expect(blocks).toEqual(["4 7", "11", "12\n"]);
});
it("never renders hidden input/output/compiler/stderr even if a response accidentally contains them", async () => {
  await render(
    submission([
      passed,
      {
        ...passed,
        statusId: 4,
        status: "Wrong Answer",
        passed: false,
        hidden: true,
        input: "PRIVATE_INPUT",
        expectedOutput: "PRIVATE_EXPECTED",
        stdout: "PRIVATE_OUTPUT",
        compileOutput: "PRIVATE_COMPILE",
        stderr: "PRIVATE_STDERR",
      },
    ]),
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Hidden test 2"))!
      .click(),
  );
  for (const secret of [
    "PRIVATE_INPUT",
    "PRIVATE_EXPECTED",
    "PRIVATE_OUTPUT",
    "PRIVATE_COMPILE",
    "PRIVATE_STDERR",
  ])
    expect(host.textContent).not.toContain(secret);
  expect(host.querySelectorAll("pre")).toHaveLength(0);
  expect(host.textContent).toContain("stay private");
});
it("labels successful custom input as execution rather than a correct solution", async () => {
  await render({
    ...submission(),
    mode: "run",
    runMode: "custom",
    results: [{ ...passed, expectedOutput: undefined }],
  });
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Executed");
  expect(host.textContent).not.toContain("Accepted");
  expect(host.textContent).not.toContain("tests passed");
  expect(host.textContent).not.toContain("Expected output");
  expect(host.textContent).toContain("Custom input checks execution only");
});
it("distinguishes checked visible examples from custom input and shows compiler diagnostics", async () => {
  await render({
    ...submission([
      {
        ...passed,
        statusId: 6,
        status: "Compilation Error",
        passed: false,
        stdout: "",
        compileOutput: "Main.java: missing semicolon",
      },
    ]),
    mode: "run",
    runMode: "examples",
  });
  expect(host.textContent).toContain("Visible example run");
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Compilation Error",
  );
  expect(host.textContent).toContain("Main.java: missing semicolon");
  expect(host.textContent).toContain("0 / 1 tests passed");
});
it("does not invent accepted results or zero resource measurements when data is missing", async () => {
  await render(
    submission([{ ...passed, time: undefined, memory: undefined, stdout: "" }]),
  );
  expect(host.textContent).toContain("Total runtime: Unavailable");
  expect(host.textContent).toContain("Peak case memory: Unavailable");
  expect(host.textContent).toContain("(empty)");
  await render(submission([]));
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "No results received",
  );
});
it("resets the selected case when loading another historical result", async () => {
  await render(
    submission([
      passed,
      { ...passed, input: "SECOND_CASE", stdout: "SECOND_OUTPUT" },
    ]),
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Case 2"))!
      .click(),
  );
  expect(host.textContent).toContain("SECOND_CASE");
  await render({ ...submission(), _id: "submission-b" });
  expect(host.textContent).not.toContain("SECOND_CASE");
  expect(
    host.querySelector('button[aria-pressed="true"]')?.textContent,
  ).toContain("Case 1");
});
it("never calls a partial all-test submission accepted", async () => {
  await render({ ...submission(), total: 4, passed: 4 });
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Incomplete results",
  );
  expect(host.textContent).toContain("1 / 4 tests passed");
  expect(host.textContent).toContain("returned 1 results for 4 test cases");
  expect(submissionVerdict({ ...submission(), total: 0 })).toBe(
    "Incomplete results",
  );
});
it("distinguishes terminal failures from a successful solution", () => {
  expect(
    submissionVerdict(
      submission([
        {
          ...passed,
          statusId: 5,
          status: "Time Limit Exceeded",
          passed: false,
        },
      ]),
    ),
  ).toBe("Time Limit Exceeded");
  expect(
    submissionVerdict(
      submission([
        { ...passed, statusId: 11, status: "Runtime Error", passed: false },
      ]),
    ),
  ).toBe("Runtime Error");
  expect(
    submissionVerdict(
      submission([
        { ...passed, statusId: 13, status: "Internal Error", passed: false },
      ]),
    ),
  ).toBe("Execution Service Error");
});
