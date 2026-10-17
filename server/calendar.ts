import { InterviewModel } from "./models.js";
import { ApiError } from "./security.js";
export async function assertSlot(
  interviewerId: string,
  candidateId: string,
  at: Date,
  duration: number,
  excludeId?: string,
) {
  const conflicts = await InterviewModel.find({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    type: { $ne: "practice" },
    status: { $in: ["scheduled", "live"] },
    $or: [{ interviewerId }, { candidateId }],
    scheduledAt: { $lt: new Date(+at + duration * 60000) },
  }).select("scheduledAt duration");
  if (conflicts.some((i) => +i.scheduledAt + (i.duration || 30) * 60000 > +at))
    throw new ApiError(
      409,
      "The interviewer or candidate already has an interview in this time slot.",
    );
}
