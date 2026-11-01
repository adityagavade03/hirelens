// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../src/api";
import {
  CodingProgramHelp,
  ExecutionLanguageStatus,
  useExecutionLanguages,
} from "../src/ExecutionLanguageStatus";

vi.mock("../src/api", () => ({ api: vi.fn() }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(api).mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
function Harness({ enabled = true }: { enabled?: boolean }) {
  const runner = useExecutionLanguages(enabled);
  const [code, setCode] = useState("print(42)");
  return createElement(
    "div",
    {},
    createElement("textarea", {
      "aria-label": "Solution",
      value: code,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        setCode(event.target.value),
    }),
    enabled &&
      createElement(ExecutionLanguageStatus, {
        state: runner,
        language: "python",
      }),
    createElement(
      "button",
      { disabled: !enabled || !runner.languages.includes("python") },
      "Run examples",
    ),
    createElement("output", {}, runner.languages.join(",")),
  );
}
const render = async (enabled = true) =>
  act(async () => root.render(createElement(Harness, { enabled })));
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;

it("recovers Run and Submit readiness after a temporary discovery failure without losing the draft", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new Error("Code runner returned HTTP 503."))
    .mockResolvedValueOnce([{ key: "python" }, { key: "java" }]);
  await render();
  expect(host.textContent).toContain("Code runner returned HTTP 503.");
  expect(button("Run examples").disabled).toBe(true);
  expect(host.querySelector("textarea")?.value).toBe("print(42)");
  await act(async () => button("Retry code runner").click());
  expect(host.textContent).toContain("Runner ready for the selected language.");
  expect(host.textContent).not.toContain("HTTP 503");
  expect(button("Run examples").disabled).toBe(false);
  expect(host.querySelector("textarea")?.value).toBe("print(42)");
  expect(api).toHaveBeenCalledTimes(2);
  expect(
    vi.mocked(api).mock.calls.every(([path]) => path === "/languages"),
  ).toBe(true);
});

it("does not discover public languages for a blocked hiring context", async () => {
  await render(false);
  expect(api).not.toHaveBeenCalled();
  expect(button("Run examples").disabled).toBe(true);
  expect(host.textContent).not.toContain("Refresh available languages");
});

it("ignores a stale language response after execution is disabled", async () => {
  let resolve!: (value: { key: string }[]) => void;
  vi.mocked(api).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  expect(button("Checking code runner…").disabled).toBe(true);
  const signal = vi.mocked(api).mock.calls[0][1]?.signal;
  await render(false);
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve([{ key: "python" }]));
  expect(host.querySelector("output")?.textContent).toBe("");
  expect(button("Run examples").disabled).toBe(true);
});

it("explains the complete-program contract and language-specific input entry points", async () => {
  await act(async () =>
    root.render(createElement(CodingProgramHelp, { language: "java" })),
  );
  expect(host.textContent).toContain(
    "A LeetCode-style function alone will not run here",
  );
  expect(host.textContent).toContain(
    "Java must use a public class named Main.",
  );
  expect(host.querySelector("pre")?.textContent).toContain("public class Main");
  expect(host.querySelector("pre")?.textContent).toContain("System.in");
  await act(async () =>
    root.render(createElement(CodingProgramHelp, { language: "javascript" })),
  );
  expect(host.querySelector("pre")?.textContent).toContain(
    "fs.readFileSync(0, 'utf8')",
  );
  expect(host.textContent).toContain("avoid extra prompts or debug output");
});
