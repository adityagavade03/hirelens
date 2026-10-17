import {
  ApplicationModel,
  InterviewModel,
  JobModel,
  ReportModel,
} from "./models.js";
import { ApiError } from "./security.js";
export async function nextRound(application: any) {
  const job = await JobModel.findById(application.jobId);
  if (!job) throw new ApiError(404, "Job not found.");
  const history = await InterviewModel.find({
    applicationId: application.id,
    status: { $ne: "cancelled" },
  }).sort({ roundIndex: -1, createdAt: -1 });
  const previous = history[0];
  // Freeze the count after the first round so editing a job cannot skip a candidate's remaining rounds.
  const roundCount = previous?.roundCount || Math.max(1, job.rounds.length);
  const roundIndex = previous ? previous.roundIndex + 1 : 0;
  if (history.some((i) => i.status !== "completed"))
    throw new ApiError(
      409,
      "Finish the current interview before scheduling another round.",
    );
  if (previous) {
    const report = await ReportModel.findOne({
      interviewId: previous.id,
      finalized: true,
      decision: "selected",
    });
    if (!report)
      throw new ApiError(
        409,
        "Finalize the previous round as selected to advance this candidate.",
      );
  }
  if (roundIndex >= roundCount)
    throw new ApiError(409, "All interview rounds are complete.");
  if (!["Shortlisted", "Interview Completed"].includes(application.status))
    throw new ApiError(409, "This application is not ready for another round.");
  return {
    roundIndex,
    roundCount,
    roundName: job.rounds[roundIndex] || `Round ${roundIndex + 1}`,
  };
}
export async function assertLatestReport(interview: any) {
  if (
    interview.applicationId &&
    (await InterviewModel.exists({
      applicationId: interview.applicationId,
      roundIndex: { $gt: interview.roundIndex || 0 },
      status: { $ne: "cancelled" },
    }))
  )
    throw new ApiError(
      409,
      "A later round has begun. Earlier round feedback is locked to preserve the hiring history.",
    );
}
