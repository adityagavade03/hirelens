import { ReportModel } from "./models.js";
import {
  ApiError,
  accessibleInterview,
  mustManageInterview,
} from "./security.js";
import { assertLatestReport } from "./rounds.js";
import { withResources } from "./locks.js";
import type { User } from "../shared/types.js";

export async function assertFeedbackEditable(interview: any) {
  if (await ReportModel.exists({ interviewId: interview.id, finalized: true }))
    throw new ApiError(
      409,
      "Reopen the report before changing interview feedback.",
    );
  await assertLatestReport(interview);
}

// Recheck permissions and finalization inside the same short lock used by
// report finalization. Provider calls must happen outside this critical section.
export async function updateInterviewFeedback<T>(
  user: User,
  interviewId: string,
  update: (interview: any) => Promise<T>,
): Promise<T> {
  return withResources([`report:${interviewId}`], async () => {
    const current = await accessibleInterview(user, interviewId);
    await mustManageInterview(user, current);
    await assertFeedbackEditable(current);
    return update(current);
  });
}
