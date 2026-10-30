import { useEffect, useState } from "react";
import type { ExecutionResult, Submission } from "../shared/types";
import "./execution-results.css";

export const isCustomRun = (submission: Submission) =>
  submission.mode === "run" && submission.runMode !== "examples";

export function executionVerdict(result: ExecutionResult, custom = false) {
  if (result.statusId === 3) return custom ? "Executed" : "Accepted";
  if (result.statusId === 4) return "Wrong Answer";
  if (result.statusId === 5) return "Time Limit Exceeded";
  if (result.statusId === 6) return "Compilation Error";
  if (result.statusId === 8) return "Output Limit Exceeded";
  if (result.statusId === 13 || result.statusId === 14)
    return "Execution Service Error";
  if (result.statusId <= 2) return "Result Incomplete";
  if (/memory limit/i.test(result.status)) return "Memory Limit Exceeded";
  return "Runtime Error";
}
export function submissionVerdict(submission: Submission) {
  if (!submission.results.length) return "No results received";
  if (
    !Number.isInteger(submission.total) ||
    submission.total < 1 ||
    submission.results.length !== submission.total
  )
    return "Incomplete results";
  const failure = submission.results.find((r) => r.statusId !== 3);
  return executionVerdict(
    failure || submission.results[0],
    isCustomRun(submission),
  );
}
function seconds(value?: string) {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function memory(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
const displayTime = (value: number | null) =>
  value === null ? "Unavailable" : `${(value * 1000).toFixed(1)} ms`;
const displayMemory = (value: number | null) =>
  value === null
    ? "Unavailable"
    : value < 1024
      ? `${value} KB`
      : `${(value / 1024).toFixed(2)} MB`;
const content = (value?: string) =>
  value === undefined ? "Unavailable" : value === "" ? "(empty)" : value;

export function ExecutionResults({ submission }: { submission: Submission }) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [submission._id]);
  const custom = isCustomRun(submission),
    results = submission.results;
  const index = Math.min(selected, Math.max(0, results.length - 1)),
    item = results[index];
  const times = results.map((r) => seconds(r.time)),
    memories = results.map((r) => memory(r.memory));
  const totalTime =
    times.length && times.every((t) => t !== null)
      ? times.reduce((sum, t) => sum! + t!, 0)
      : null;
  const peakMemory =
    memories.length && memories.every((m) => m !== null)
      ? Math.max(...(memories as number[]))
      : null;
  const passed = results.filter((r) => r.statusId === 3).length;
  return (
    <section className="execution-results" aria-label="Execution result">
      <header className="execution-result-heading">
        <div>
          <p>
            {custom
              ? "Custom input run"
              : submission.mode === "submit"
                ? "Full submission"
                : "Visible example run"}
          </p>
          <h3 role="status">{submissionVerdict(submission)}</h3>
        </div>
        {!custom && (
          <strong>
            {passed} / {submission.total} tests passed
          </strong>
        )}
      </header>
      {custom && (
        <p>
          Custom input checks execution only. Example runs and full submissions
          compare output with expected answers.
        </p>
      )}
      {submissionVerdict(submission) === "Incomplete results" && (
        <p>
          The service returned {results.length} results for {submission.total}{" "}
          test cases. This attempt cannot be marked accepted; retry when the
          private execution service is available.
        </p>
      )}
      <div className="execution-resource-summary">
        <span>
          Total runtime: <strong>{displayTime(totalTime)}</strong>
        </span>
        <span>
          Peak case memory: <strong>{displayMemory(peakMemory)}</strong>
        </span>
      </div>
      <div className="execution-case-list" role="group" aria-label="Test cases">
        {results.map((r, n) => (
          <button
            className={`btn secondary ${n === index ? "execution-case-selected" : ""}`}
            key={n}
            aria-pressed={n === index}
            onClick={() => setSelected(n)}
          >
            {r.hidden ? `Hidden test ${n + 1}` : `Case ${n + 1}`} ·{" "}
            {executionVerdict(r, custom)}
          </button>
        ))}
      </div>
      {item ? (
        <section
          className="execution-case-detail"
          aria-label="Selected test case"
        >
          <h4>
            {item.hidden ? `Hidden test ${index + 1}` : `Case ${index + 1}`}:{" "}
            {executionVerdict(item, custom)}
          </h4>
          <p>
            Runtime: {displayTime(seconds(item.time))} · Memory:{" "}
            {displayMemory(memory(item.memory))}
          </p>
          {item.hidden ? (
            <p>
              The input, expected output and program output for this hidden test
              stay private. Review the verdict and try more examples.
            </p>
          ) : (
            <>
              <div className="execution-io">
                <div>
                  <h4>Input</h4>
                  <pre>{content(item.input)}</pre>
                </div>
                {!custom && (
                  <div>
                    <h4>Expected output</h4>
                    <pre>{content(item.expectedOutput)}</pre>
                  </div>
                )}
                <div>
                  <h4>Your output</h4>
                  <pre>{content(item.stdout)}</pre>
                </div>
              </div>
              {!!item.compileOutput && (
                <div>
                  <h4>Compiler message</h4>
                  <pre>{item.compileOutput}</pre>
                </div>
              )}
              {!!item.stderr && (
                <div>
                  <h4>Runtime message</h4>
                  <pre>{item.stderr}</pre>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <p>
          No execution result was returned. Retry when the private execution
          service is available.
        </p>
      )}
    </section>
  );
}
