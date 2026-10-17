import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { llm, assessAnswer } from "./providers.js";
import { config } from "./config.js";
import { withResources } from "./locks.js";
import { assertFeedbackEditable } from "./report-state.js";
import { InterviewModel, ApplicationModel, JobModel } from "./models.js";
import {
  accessibleInterview,
  ApiError,
  objectId,
  mustAttendInterview,
  requireLive,
} from "./security.js";
const nextSchema = z.object({
  plan: z.array(z.string().min(1).max(300)).min(1).max(6),
  question: z.object({
    text: z.string().min(10).max(2000),
    topic: z.string().max(100),
    rubric: z.array(z.string().min(1).max(500)).min(1).max(6),
  }),
});
export function repeatsQuestion(proposed: string, previous: string[]) {
  const words = (value: string) =>
    new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
  const a = words(proposed);
  return previous.some((text) => {
    const b = words(text),
      shared = [...a].filter((w) => b.has(w)).length;
    return shared > 0 && shared / (a.size + b.size - shared) >= 0.86;
  });
}
export function registerAiInterview(app: Express, limit: RequestHandler) {
  app.post("/api/interviews/:id/ai/next", limit, async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustAttendInterview(req.user, interview);
    requireLive(interview);
    if (interview.facilitator !== "ai")
      throw new ApiError(
        409,
        "This session is managed by a human interviewer.",
      );
    const unanswered = interview.questions.find(
      (q) => !interview.answers.some((a) => a.questionId === q.id),
    );
    if (unanswered) {
      res.json({
        question: unanswered,
        plan: interview.aiPlan,
        complete: false,
      });
      return;
    }
    const token = randomUUID();
    const claimed = await InterviewModel.findOneAndUpdate(
      {
        _id: interview.id,
        status: "live",
        // Do not act on a stale pre-lock read after another turn has finished.
        $expr: {
          $and: [
            { $eq: [{ $size: "$questions" }, interview.questions.length] },
            { $eq: [{ $size: "$answers" }, interview.answers.length] },
          ],
        },
        $or: [
          { aiBusyUntil: { $exists: false } },
          { aiBusyUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          aiBusyUntil: new Date(Date.now() + 3 * config.llmTimeout + 30000),
          aiBusyToken: token,
        },
      },
    );
    if (!claimed)
      throw new ApiError(
        409,
        "An AI question is already being prepared. Please wait.",
      );
    try {
      const application = interview.applicationId
        ? await ApplicationModel.findById(interview.applicationId)
        : null;
      const job = application
        ? await JobModel.findById(application.jobId)
        : null;
      const previous = interview.answers.at(-1);
      if (previous && !previous.feedback) {
        const q = interview.questions.find((q) => q.id === previous.questionId);
        previous.feedback = await assessAnswer({
          question: q?.text,
          rubric: q?.rubric,
          answer: previous.text,
        });
        await withResources([`report:${interview.id}`], async () => {
          const current = await accessibleInterview(req.user, interview.id);
          await mustAttendInterview(req.user, current);
          requireLive(current);
          await assertFeedbackEditable(current);
          const saved = await InterviewModel.updateOne(
            {
              _id: interview.id,
              status: "live",
              aiBusyToken: token,
              "answers.questionId": previous.questionId,
            },
            { $set: { "answers.$.feedback": previous.feedback } },
          );
          if (!saved.matchedCount)
            throw new ApiError(
              409,
              "The session changed while feedback was generated.",
            );
        });
      }
      if (interview.questions.length >= 12) {
        res.json({ complete: true, plan: interview.aiPlan });
        return;
      }
      const createNext = (repair = "") =>
        llm(
          "Return JSON {plan:string[],question:{text,topic,rubric:string[]}}. Create a short interview plan and exactly ONE next question. Keep an existing plan. Cover supplied job criteria and interview type (technical or behavioral). Adapt the next question to the most recent answer and its technical feedback. Avoid repeating prior questions. Increase depth when supported, or ask a clarifying follow-up when evidence is weak. Do not answer the question for the candidate. Use only job-relevant content. " +
            repair,
          {
            jobTitle: interview.jobTitle,
            description: job?.description?.slice(0, 2000),
            criteria: job?.criteria?.slice(0, 1000),
            type: interview.type,
            difficulty: interview.difficulty,
            topics: interview.topics,
            candidateSkills: application?.snapshot.skills,
            existingPlan: interview.aiPlan,
            previousQuestions: interview.questions.map((q) => ({
              text: q.text?.slice(0, 350),
              topic: q.topic,
            })),
            previousAnswers: interview.answers.slice(-4).map((a) => ({
              text: a.text?.slice(0, 2000),
              feedback: a.feedback
                ? {
                    correctness: a.feedback.correctness,
                    completeness: a.feedback.completeness,
                    missingConcepts: a.feedback.missingConcepts?.slice(0, 4),
                  }
                : undefined,
            })),
          },
          nextSchema,
        );
      let next = await createNext();
      const priorTexts = interview.questions.map((q) => q.text || "");
      if (repeatsQuestion(next.question.text, priorTexts))
        next = await createNext(
          "Your last generation repeated an existing question. Ask a different, unanswered aspect of the topic; do not paraphrase any previous question.",
        );
      if (repeatsQuestion(next.question.text, priorTexts))
        throw new ApiError(
          502,
          "AI repeated a previous question. Your answer is saved. Retry Continue AI interview or finish the session.",
        );
      const question = {
        ...next.question,
        id: randomUUID(),
        source: "ai" as const,
      };
      const updated = await InterviewModel.updateOne(
        { _id: interview.id, status: "live", aiBusyToken: token },
        {
          $push: { questions: question },
          $set: {
            aiPlan: interview.aiPlan.length ? interview.aiPlan : next.plan,
          },
        },
      );
      if (!updated.modifiedCount)
        throw new ApiError(
          409,
          "The session changed while the question was generated.",
        );
      res.json({
        question,
        plan: interview.aiPlan.length ? interview.aiPlan : next.plan,
        complete: false,
      });
    } finally {
      await InterviewModel.updateOne(
        { _id: interview.id, aiBusyToken: token },
        { $unset: { aiBusyUntil: 1, aiBusyToken: 1 } },
      );
    }
  });
}
