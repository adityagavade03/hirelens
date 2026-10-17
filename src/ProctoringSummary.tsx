import { useState } from "react";
import type { ServiceStatus } from "../shared/types";
import { dateLabel, send, useResource } from "./api";
import { ErrorBox, Notice, Panel } from "./ui";
type Summary = {
  findings: {
    observation: string;
    eventRefs: string[];
    reviewQuestion: string;
  }[];
  limitations: string[];
  generatedAt: string;
  model: string;
  disclaimer: string;
  eventCount: number;
  consideredEvents: number;
};
export function ProctoringSummary({
  reportId,
  finalized,
}: {
  reportId: string;
  finalized: boolean;
}) {
  const record = useResource<{ summary: Summary | null; stale: boolean }>(
    `/reports/${reportId}/proctoring-summary`,
    { summary: null, stale: false },
  );
  const services = useResource<ServiceStatus | null>("/services", null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Panel
      title="AI-assisted monitoring summary"
      description="Review observed activity separately from candidate performance. This summary never makes a selection decision."
    >
      <div className="panel-form">
        <ErrorBox message={error || record.error} />
        {record.data.stale && (
          <Notice>
            Events or review notes have changed. Regenerate this summary to
            include the latest evidence.
          </Notice>
        )}
        {record.data.summary ? (
          <>
            {record.data.summary.findings.map((f, n) => (
              <div className="evidence" key={n}>
                <p>{f.observation}</p>
                <p>{f.reviewQuestion}</p>
                <small>Event references: {f.eventRefs.join(", ")}</small>
              </div>
            ))}
            <p>{record.data.summary.limitations.join(" ")}</p>
            <Notice>{record.data.summary.disclaimer}</Notice>
            <small>
              {record.data.summary.consideredEvents} of{" "}
              {record.data.summary.eventCount} events ·{" "}
              {dateLabel(record.data.summary.generatedAt)} ·{" "}
              {record.data.summary.model}
            </small>
          </>
        ) : (
          <p>
            {services.data?.ai
              ? "Generate a neutral summary of timestamped observations and their human review notes after the interview."
              : "Connect the AI service to generate this optional summary. The event timeline and human review remain available."}
          </p>
        )}
        {!finalized && (
          <button
            className="btn secondary"
            disabled={busy || !services.data?.ai}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await send(`/reports/${reportId}/proctoring-summary`);
                await record.reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Summarizing observations…"
              : record.data.summary
                ? "Regenerate monitoring summary"
                : "Generate monitoring summary"}
          </button>
        )}
      </div>
    </Panel>
  );
}
