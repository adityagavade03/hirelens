import type { Job } from "../shared/types";
export function InterviewInstructions({ job }: { job: Job }) {
  const instructions = job.interviewInstructions;
  return (
    <div>
      <h3>Interview instructions for HR</h3>
      <dl className="job-facts">
        <div>
          <dt>Rounds ({job.rounds?.length || 0})</dt>
          <dd>{job.rounds?.join(" → ") || "Not specified"}</dd>
        </div>
        <div>
          <dt>Interview type</dt>
          <dd>{instructions?.type || "Not specified"}</dd>
        </div>
        <div>
          <dt>Expected duration</dt>
          <dd>
            {instructions?.duration
              ? `${instructions.duration} minutes`
              : "Not specified"}
          </dd>
        </div>
        <div>
          <dt>Skills to evaluate</dt>
          <dd>{instructions?.skills?.join(", ") || job.skills.join(", ")}</dd>
        </div>
        <div>
          <dt>Focus topics</dt>
          <dd>{instructions?.topics?.join(", ") || "Not specified"}</dd>
        </div>
      </dl>
      <h4>Questions and evaluation criteria</h4>
      <p className="prose-text">
        {instructions?.criteria || job.criteria || "No additional criteria."}
      </p>
      <h4>Special instructions</h4>
      <p className="prose-text">
        {instructions?.special || "No special instructions."}
      </p>
    </div>
  );
}
