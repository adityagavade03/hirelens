import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useResource, dateLabel } from "./api";
import { useAuth } from "./auth-context";
import { ErrorBox, Status } from "./ui";
import type { Application, Interview, Report } from "../shared/types";
export function InterviewRounds({
  application,
  onSchedule,
}: {
  application: Application;
  onSchedule: () => void;
}) {
  const { user } = useAuth();
  const rounds = useResource<{
    interviews: (Interview & { report?: Report })[];
    canSchedule: boolean;
    reason?: string;
    nextRoundName?: string;
  }>(`/applications/${application._id}/rounds`, {
    interviews: [],
    canSchedule: false,
  });
  const stage = `${application._id}:${application.status}:${application.assignedHrId || ""}`;
  const previousStage = useRef(stage);
  useEffect(() => {
    if (previousStage.current !== stage) {
      previousStage.current = stage;
      void rounds.reload();
    }
  }, [stage, rounds.reload]);
  return (
    <section>
      <h3>Interview rounds</h3>
      <ErrorBox message={rounds.error} />
      {rounds.data.interviews.map((i) => (
        <div className="evidence" key={i._id}>
          <div>
            <strong>
              {i.roundName || "Interview"} · Round {(i.roundIndex || 0) + 1} /{" "}
              {i.roundCount || 1}
            </strong>
            <Status value={i.status} />
          </div>
          <p>{dateLabel(i.scheduledAt)}</p>
          {i.report && (
            <Link className="text-link" to={`/reports/${i.report._id}`}>
              View round feedback · {i.report.decision}
            </Link>
          )}
        </div>
      ))}
      {!rounds.loading && !rounds.data.interviews.length && (
        <p>No rounds scheduled yet.</p>
      )}
      {user.role === "hr" &&
        (!application.assignedHrId ||
          application.assignedHrId === user._id) && (
          <div className="form-actions">
            {rounds.data.canSchedule ? (
              <button className="btn primary" onClick={onSchedule}>
                Schedule {rounds.data.nextRoundName || "interview"}
              </button>
            ) : (
              <p className="muted">{rounds.data.reason}</p>
            )}
          </div>
        )}
    </section>
  );
}
