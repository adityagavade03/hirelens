import { createHash } from "node:crypto";
import { z } from "zod";
import { llm } from "./providers.js";
import { ApiError } from "./security.js";
import { config } from "./config.js";
import { reviewedTranscript } from "./media.js";
import {
  ApplicationModel,
  JobModel,
  ReportModel,
  SubmissionModel,
  InterviewModel,
} from "./models.js";
import { withResources } from "./locks.js";
import { assertFeedbackEditable } from "./report-state.js";

const metric = z.object({
  evidenceRefs: z.array(z.string().max(100)).max(15),
  explanation: z.string().min(1).max(1500),
  score: z.number().int().min(0).max(5).nullable(),
});
function budgetRows<T>(rows: T[], project: (row: T) => any, budget: number) {
  const selected = [];
  for (const row of [...rows].reverse()) {
    const item = project(row),
      size = JSON.stringify(item).length;
    if (size > budget) continue;
    selected.unshift(item);
    budget -= size;
  }
  return selected;
}
export const assessmentSchema = z.object({
  technical: metric,
  problemSolving: metric,
  communication: metric,
  summary: z.string().min(1).max(5000),
  strengths: z.array(z.string().max(1000)).max(8),
  weaknesses: z.array(z.string().max(1000)).max(8),
  improvements: z.array(z.string().max(1000)).max(8),
  recommendation: z.enum([
    "Strong Candidate",
    "Candidate",
    "Needs Further Evaluation",
    "Not Recommended",
  ]),
  recommendationReason: z.string().max(2000),
  limitations: z.array(z.string().max(1000)).min(1).max(8),
});
export function assessmentEvidence(
  interview: any,
  submissions: any[],
  transcript: any[] = [],
) {
  return {
    jobTitle: interview.jobTitle,
    difficulty: interview.difficulty,
    topics: interview.topics,
    transcript: transcript.map((t) => ({
      ref: `transcript:${t._id}`,
      text: t.transcript,
      capturedAt: t.capturedAt,
    })),
    answers: interview.answers.map((a: any) => ({
      ref: `answer:${a.questionId}`,
      text: a.text,
      mode: a.mode,
      question: interview.questions.find((q: any) => q.id === a.questionId)
        ?.text,
      rubric: interview.questions.find((q: any) => q.id === a.questionId)
        ?.rubric,
      humanReview: a.override || "",
    })),
    coding: submissions.map((s) => ({
      ref: `submission:${s._id}`,
      language: s.language,
      mode: s.mode,
      code: s.code,
      passed: s.passed,
      total: s.total,
      results: s.results.map((r: any) => ({
        status: r.status,
        passed: r.passed,
      })),
    })),
  };
}
export function evidenceHash(
  interview: any,
  submissions: any[],
  transcript: any[] = [],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(assessmentEvidence(interview, submissions, transcript)),
    )
    .digest("hex");
}
export function codingScore(submissions: any[]) {
  const latest = [...submissions]
    .reverse()
    .find((s) => s.mode === "submit" && s.total > 0);
  return latest
    ? {
        score: Math.round((100 * latest.passed) / latest.total),
        passed: latest.passed,
        total: latest.total,
        ref: `submission:${latest._id}`,
      }
    : null;
}
/** The production assessment pipeline, separated from persistence for offline evaluation. */
export async function assessInterviewEvidence(
  interview: any,
  submissions: any[],
  transcript: any[] = [],
  jobCriteria = "Use the question rubrics.",
) {
  const evidence = assessmentEvidence(interview, submissions, transcript);
  if (
    !evidence.answers.length &&
    !evidence.coding.length &&
    !evidence.transcript.length
  )
    throw new ApiError(
      409,
      "No submitted answers or code are available to assess.",
    );
  // Keep context bounded. The report states that only this subset was assessed.
  const input = {
    ...evidence,
    transcript: budgetRows(
      evidence.transcript.slice(-40),
      (t) => ({ ...t, text: t.text.slice(0, 1000) }),
      4000,
    ),
    answers: budgetRows(
      evidence.answers.slice(-20),
      (a: any) => ({
        ...a,
        text: a.text.slice(0, 1000),
        humanReview: a.humanReview.slice(0, 500),
      }),
      8000,
    ),
    coding: budgetRows(
      evidence.coding.slice(-5),
      (s) => ({ ...s, code: s.code.slice(0, 5000) }),
      8000,
    ),
    criteria: jobCriteria.slice(0, 1000) || "Use the question rubrics.",
  };
  const allowed = new Set<string>([
    ...input.answers.map((a: any) => a.ref),
    ...input.coding.map((s) => s.ref),
    ...input.transcript.map((t) => t.ref),
  ]);
  if (!allowed.size)
    throw new ApiError(
      409,
      "No usable evidence fits the assessment context. Review the original work manually.",
    );
  const reference = z.enum([...allowed] as [string, ...string[]]);
  const referencedMetric = z.union([
    metric.extend({
      score: z.null(),
      evidenceRefs: z.array(reference).max(15),
    }),
    metric.extend({
      score: z.number().int().min(0).max(5),
      evidenceRefs: z.array(reference).min(1).max(15),
    }),
  ]);
  const groundedSchema = assessmentSchema.extend({
    technical: referencedMetric,
    problemSolving: referencedMetric,
    communication: referencedMetric,
  });
  const result = await llm(
    `Return the evidence references and explanation before each metric's score, then summarize only those grounded findings. Question text, rubric targets and job criteria describe what SHOULD be demonstrated; they are NEVER evidence that the candidate demonstrated it. Candidate evidence is only answers[].text, reviewed transcript[].text and coding[].code/results. For example, "A hash map stores keys and values" does not demonstrate O(1), collision behavior or a collision strategy even if those appear in the rubric. Do not fill in missing concepts from the rubric. Score each rubric 0-5 (0=no demonstrated understanding,1=major gaps,2=partial,3=adequate,4=strong,5=thorough) or null when evidence is insufficient. Communication means clarity and organization of submitted explanations ONLY, not accent, grammar fluency, personality or vocal traits. Use exact supplied answer:/submission:/transcript: refs for every scored metric. Transcript contains only human-reviewed candidate text, but it can include transcription mistakes or background speech. Do not double-count an answer repeated in the transcript. Do not invent percentages or infer missing performance. Recommendation is advisory: Strong Candidate, Candidate, Needs Further Evaluation, or Not Recommended; always Needs Further Evaluation when evidence is sparse. Explain uncertainty: evidence is excerpted within a 20,000-character budget, up to 20 answers, 5 submissions and 40 reviewed transcript segments; omitted material remains available to human reviewers. No integrity events, protected traits or resume prestige may influence scores. Final selection is human.`,
    input,
    groundedSchema,
  );
  for (const m of [
    result.technical,
    result.problemSolving,
    result.communication,
  ]) {
    if (
      m.evidenceRefs.some((ref) => !allowed.has(ref)) ||
      (m.score != null && !m.evidenceRefs.length)
    )
      throw new ApiError(
        502,
        "AI assessment referenced missing evidence. No assessment was saved.",
      );
  }
  const candidateTextLength = [...input.answers, ...input.transcript].reduce(
    (length, item) => length + item.text.trim().length,
    0,
  );
  if (candidateTextLength < 160 && !input.coding.length) {
    // A brief phrase cannot support a multidimensional interview report.
    // Do not retain a model's invented narrative or zero-score missing evidence.
    const insufficient = {
      score: null,
      explanation:
        "Too little submitted candidate explanation is available to assess this dimension reliably.",
      evidenceRefs: [...allowed],
    };
    Object.assign(result, {
      technical: { ...insufficient },
      problemSolving: { ...insufficient },
      communication: { ...insufficient },
      summary:
        "The available candidate explanation is too brief for an overall interview assessment. Review the original response and collect additional evidence.",
      strengths: [],
      weaknesses: [],
      improvements: [
        "Ask follow-up questions covering the unanswered rubric targets.",
      ],
      recommendation: "Needs Further Evaluation",
      recommendationReason:
        "Insufficient submitted evidence; no candidate ability or missing performance has been inferred.",
      limitations: [
        `Only ${candidateTextLength} characters of candidate explanation and no coding submission are available. Overall metric scores are withheld below the 160-character evidence floor; this is not a judgment of the response's correctness.`,
      ],
    });
  }
  if (
    input.answers.length < 2 ||
    [result.technical, result.problemSolving, result.communication].some(
      (m) => m.score == null,
    )
  ) {
    result.recommendation = "Needs Further Evaluation";
    result.limitations.push(
      "Incomplete assessment: additional evidence and human review are required.",
    );
  }
  return {
    ...result,
    generatedAt: new Date().toISOString(),
    model: config.llmModel,
    sourceHash: evidenceHash(interview, submissions, transcript),
    coding: codingScore(submissions),
    rubricVersion: "content-rubric-v1",
  };
}
export async function generateAssessment(interview: any, reportId: string) {
  const submissions = await SubmissionModel.find({
    interviewId: interview._id.toString(),
  }).sort({ createdAt: 1 });
  const transcript = await reviewedTranscript(interview._id.toString());
  const application = interview.applicationId
    ? await ApplicationModel.findById(interview.applicationId)
    : null;
  const job = application ? await JobModel.findById(application.jobId) : null;
  const assessment = await assessInterviewEvidence(
    interview,
    submissions,
    transcript,
    job?.criteria ?? undefined,
  );
  await withResources([`report:${interview._id}`], async () => {
    const current = await InterviewModel.findById(interview._id);
    if (!current) throw new ApiError(404, "Interview not found.");
    await assertFeedbackEditable(current);
    const currentSubmissions = await SubmissionModel.find({
      interviewId: current.id,
    }).sort({ createdAt: 1 });
    const currentTranscript = await reviewedTranscript(current.id);
    if (
      assessment.sourceHash !==
      evidenceHash(current, currentSubmissions, currentTranscript)
    )
      throw new ApiError(
        409,
        "Interview evidence changed while AI was running. Regenerate the assessment using the latest evidence.",
      );
    const saved = await ReportModel.updateOne(
      { _id: reportId, interviewId: current.id, finalized: false },
      { $set: { assessment }, $unset: { assessmentError: 1 } },
    );
    if (!saved.matchedCount)
      throw new ApiError(
        409,
        "The report changed while AI was running. Its assessment was not changed.",
      );
  });
  return assessment;
}
