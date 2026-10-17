import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  Report,
  Interview,
  IntegrityAnalysis,
  ServiceStatus,
} from "../shared/types";
import { send, useResource, dateLabel } from "./api";
import { Panel, Badge, Notice, ErrorBox } from "./ui";
import { useAuth } from "./auth-context";

export function AssessmentPanel({
  report,
  interview,
  integrity,
  stale,
  coding,
  reload,
}: {
  report: Report;
  interview: Interview;
  integrity: IntegrityAnalysis | null;
  stale: boolean;
  coding: { score: number; passed: number; total: number } | null;
  reload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const services = useResource<ServiceStatus | null>("/services", null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const a = report.assessment;
  const canGenerate =
    user.role !== "candidate" || interview.type === "practice";
  return (
    <>
      <Panel
        title="Candidate evaluation"
        description="AI assessments are advisory. Percentages represent a 0–5 content rubric, not a probability of success."
      >
        <div className="panel-form">
          <ErrorBox message={error || report.assessmentError} />
          {stale && (
            <Notice>
              Evidence has changed since this assessment was generated.
              Regenerate and review it before finalizing.
            </Notice>
          )}
          <p>
            <strong>
              Coding test pass rate:{" "}
              {coding
                ? `${coding.score}% (${coding.passed}/${coding.total})`
                : "Not assessed — no test submission"}
            </strong>
          </p>
          {a ? (
            <>
              <p className="prose-text">{a.summary}</p>
              <div className="form-grid">
                {(
                  [
                    ["Technical knowledge", a.technical],
                    ["Problem solving", a.problemSolving],
                    ["Clarity of explanations", a.communication],
                  ] as const
                ).map(([name, m]) => (
                  <section className="evidence" key={name}>
                    <h3>
                      {name}:{" "}
                      {m.score == null ? "Not assessed" : `${m.score * 20}%`}
                    </h3>
                    <p>{m.explanation}</p>
                    <small>
                      Evidence:{" "}
                      {m.evidenceRefs.join(", ") || "Insufficient evidence"}
                    </small>
                  </section>
                ))}
              </div>
              {(
                [
                  ["Strengths", a.strengths],
                  ["Gaps", a.weaknesses],
                  ["Practice next", a.improvements],
                ] as const
              ).map(([name, items]) => (
                <section key={name}>
                  <h3>{name}</h3>
                  <ul>
                    {items.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>
              ))}
              <p>
                <Badge>{a.recommendation}</Badge> {a.recommendationReason}
              </p>
              <Notice>
                {a.limitations.join(" ")} A person must review the evidence and
                make any hiring decision.
              </Notice>
              <small>
                Generated {dateLabel(a.generatedAt)} · {a.model} ·{" "}
                {a.rubricVersion}
              </small>
            </>
          ) : (
            <Notice>
              {services.data?.ai
                ? "Generate an assessment from submitted answers and coding results."
                : "AI assessment is awaiting a configured AI service. Answers, coding results and human feedback remain available below."}
            </Notice>
          )}
          {canGenerate && !report.finalized && (
            <button
              className="btn secondary"
              disabled={busy || !services.data?.ai}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await send(`/reports/${report._id}/assessment`);
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Assessing evidence…"
                : a
                  ? "Regenerate assessment"
                  : "Generate assessment"}
            </button>
          )}
          {canGenerate && !report.finalized && a && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await send(`/reports/${report._id}/assessment`, {}, "DELETE");
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove AI assessment and use human review
            </button>
          )}
        </div>
      </Panel>
      {integrity && (
        <Panel
          title="Integrity review"
          description="Review these observations separately from technical performance."
        >
          <div className="panel-form">
            <p>
              <Badge tone={integrity.level === "high" ? "amber" : "neutral"}>
                {integrity.level} review level
              </Badge>{" "}
              · {integrity.coverage.events} recorded events
            </p>
            {integrity.reasons.map((r) => (
              <div className="evidence" key={r.signal}>
                <strong>
                  {r.signal}: {r.count} events · {r.points} review points
                </strong>
                <p>{r.explanation}</p>
              </div>
            ))}
            {integrity.coverage.monitoringUnavailable && (
              <Notice>
                Monitoring was unavailable for part of this session.
              </Notice>
            )}
            <Notice>{integrity.limitations}</Notice>
          </div>
        </Panel>
      )}
    </>
  );
}
export function PerformanceHistory() {
  const data = useResource<{
    rows: {
      reportId: string;
      jobTitle: string;
      candidateName: string;
      date: string;
      technical: number | null;
      coding: number | null;
      problemSolving: number | null;
      communication: number | null;
      decision: string;
      stale: boolean;
      mode?: "video" | "in_person";
      humanRatings?: Report["ratings"];
    }[];
  }>("/analytics/performance", { rows: [] });
  return (
    <Panel
      title="Performance history"
      description="Only completed sessions you are authorized to review. Missing evidence is shown as unassessed."
    >
      <ErrorBox message={data.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Date</th>
              <th>Technical</th>
              <th>Coding</th>
              <th>Problem solving</th>
              <th>Explanation clarity</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {data.data.rows.map((r) => (
              <tr key={r.reportId}>
                <td>
                  <Link to={`/reports/${r.reportId}`}>{r.jobTitle}</Link>
                  <small>
                    {r.candidateName}
                    {r.stale ? " · Assessment needs refresh" : ""}
                  </small>
                </td>
                <td>{dateLabel(r.date)}</td>
                {(r.mode === "in_person"
                  ? [
                      r.humanRatings?.technical,
                      null,
                      r.humanRatings?.problemSolving,
                      r.humanRatings?.communication,
                    ]
                  : [r.technical, r.coding, r.problemSolving, r.communication]
                ).map((n, i) => (
                  <td key={i}>
                    {r.mode === "in_person" && i === 1
                      ? "Not applicable"
                      : n == null
                        ? "Not assessed"
                        : r.mode === "in_person"
                          ? `Human: ${n}/5`
                          : `${n}%`}
                  </td>
                ))}
                <td>{r.decision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.data.rows.length && (
        <p className="panel-form">
          Completed sessions will appear here. No scores are invented for
          missing assessments.
        </p>
      )}
    </Panel>
  );
}
