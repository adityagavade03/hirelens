import type { Application } from "../shared/types";
import { Badge, Status } from "./ui";
import "./resume.css";

export function ScreeningScore({
  application: a,
}: {
  application: Application;
}) {
  const state = a.screening?.state;
  return (
    <div className="screening-cell">
      <strong>
        {state === "queued"
          ? "Queued"
          : state === "processing"
            ? "Screening…"
            : state === "failed"
              ? "Unavailable"
              : a.match?.score == null
                ? "Not screened"
                : `${a.match.score}%`}
      </strong>
      <small>
        {!a.screening
          ? "Legacy keyword match"
          : state === "completed"
            ? "AI resume match"
            : "Automatic AI screening"}
      </small>
    </div>
  );
}
export function ResumeScreening({
  application: a,
  retry,
  busy,
}: {
  application: Application;
  retry: () => void;
  busy: boolean;
}) {
  const screening = a.screening;
  const retryable =
    (!screening || screening.state === "failed") &&
    ["Applied", "Under Review"].includes(a.status) &&
    !a.assignedHrId;
  return (
    <section aria-label="AI resume screening">
      <div className="screening-banner" role="status">
        <strong>
          {!screening
            ? "This application has a legacy keyword score"
            : screening.state === "completed"
              ? screening.outcome === "shortlisted"
                ? "Original AI result · met the shortlist threshold"
                : screening.outcome === "not_shortlisted"
                  ? "Original AI result · below the shortlist threshold"
                  : "Original AI result · further review needed"
              : screening.state === "failed"
                ? "AI screening unavailable"
                : "Automatic AI screening in progress"}
        </strong>
        {screening?.state === "completed" && (
          <p>
            Current application stage: <Status value={a.status} />. The original
            AI result stays available when the hiring team changes the stage.
          </p>
        )}
        <p>
          {!screening
            ? "This older application has not been compared with the JD by an LLM. Its previous score is not an AI assessment."
            : screening.summary || screening.message}
        </p>
        {screening && (
          <p>
            Company threshold: <strong>{screening.threshold}%</strong>. A
            validated score at or above this threshold qualifies for the
            shortlist. Incomplete or uncertain evidence needs review.
          </p>
        )}
      </div>
      {retryable && (
        <button className="btn secondary" disabled={busy} onClick={retry}>
          {busy
            ? "Queuing…"
            : screening
              ? "Retry AI screening"
              : "Run AI screening"}
        </button>
      )}
      {screening?.state === "completed" && (
        <>
          <div className="match-summary">
            <div>
              <strong>
                {a.match.score ?? "—"}
                <small>{a.match.score == null ? "" : "%"}</small>
              </strong>
              <span>AI resume match</span>
            </div>
            <p>
              Screening uses a saved JD and your submitted application. Later
              profile or job edits do not change this result.
            </p>
          </div>
          <div className="form-grid">
            <div>
              <h4>Matched skills</h4>
              <p>{a.match.matching.join(", ") || "None identified"}</p>
            </div>
            <div>
              <h4>Missing or uncertain skills</h4>
              <p>{a.match.missing.join(", ") || "None identified"}</p>
            </div>
          </div>
          {screening.criteria
            ?.filter((c) => c.status !== "not_required")
            .map((c) => (
              <article className="screening-criterion" key={c.id}>
                <header>
                  <strong>
                    {c.label}
                    {c.required ? " · required" : ""}
                  </strong>
                  <Badge tone={c.status === "met" ? "green" : "amber"}>
                    {c.status === "met"
                      ? "Meets requirement"
                      : c.status === "partial"
                        ? "Partial match"
                        : c.status === "missing"
                          ? "Not evidenced"
                          : "Uncertain"}
                  </Badge>
                </header>
                {c.requirement && (
                  <p>
                    <strong>JD:</strong> {c.requirement}
                  </p>
                )}
                <p>{c.explanation}</p>
                {c.evidence.map((e, i) => (
                  <blockquote key={i}>
                    “{e.quote}”<br />
                    <small>{e.source}</small>
                  </blockquote>
                ))}
              </article>
            ))}
          <details className="screening-details">
            <summary>How this score was calculated</summary>
            <p>{a.match.method}</p>
            <p>
              Model: {screening.model}. Completed{" "}
              {screening.completedAt
                ? new Date(screening.completedAt).toLocaleString()
                : "recently"}
              .
            </p>
            {screening.criteria?.some((c) => c.status === "not_required") && (
              <p>
                Not requested by this JD:{" "}
                {screening.criteria
                  .filter((c) => c.status === "not_required")
                  .map((c) => c.label)
                  .join(", ")}
                . These do not reduce the score.
              </p>
            )}
            {a.match.limitations.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </details>
        </>
      )}
      <details className="screening-details">
        <summary>Submitted application details</summary>
        <p>
          <strong>Name:</strong> {a.candidateName}
        </p>
        {a.contactEmail && (
          <p>
            <strong>Contact email:</strong> {a.contactEmail} (provided for this
            application)
          </p>
        )}
        <p>
          <strong>Phone:</strong> {a.snapshot.phone || "Not provided"}
        </p>
        <p>
          <strong>Location:</strong> {a.snapshot.location || "Not provided"}
        </p>
        <p>
          <strong>Skills:</strong>{" "}
          {a.snapshot.skills.join(", ") || "Not provided"}
        </p>
        {(
          [
            ["Education", a.snapshot.education],
            ["Work experience", a.snapshot.experience],
            ["Projects", a.snapshot.projects],
            ["Certifications", a.snapshot.certifications],
            ["Achievements", a.snapshot.achievements],
            ["Additional information", a.snapshot.additionalInformation],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <h4>{label}</h4>
            <p className="prose-text">{value || "Not provided"}</p>
          </div>
        ))}
      </details>
    </section>
  );
}
