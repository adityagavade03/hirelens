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
import { assessmentNarrativeIssues } from "./assessment-narrative.js";

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
  // Some strict hosted decoders reject unions of objects with identical keys.
  // Keep score nullable within one object; the guard below still rejects every
  // non-null score without a valid supplied reference before anything is saved.
  const referencedMetric = metric.extend({
    evidenceRefs: z.array(reference).max(15),
  });
  // The scope summary is computed from the selected evidence, instead of a
  // second free-form account that can contradict the referenced metric findings.
  const groundedSchema = assessmentSchema.omit({ summary: true }).extend({
    technical: referencedMetric,
    problemSolving: referencedMetric,
    communication: referencedMetric,
    weaknesses: z
      .array(
        z.object({
          evidenceRef: reference,
          quote: z.string().min(1).max(300),
          observation: z.string().min(1).max(500),
        }),
      )
      .max(8),
  });
  const generated = await llm(
    `Return the evidence references and explanation before each metric's score, then summarize only those grounded findings. Question text, rubric targets and job criteria describe what SHOULD be demonstrated; they are NEVER evidence that the candidate demonstrated it. Candidate evidence is only answers[].text, reviewed transcript[].text and coding[].code/results. For example, "A hash map stores keys and values" does not demonstrate O(1), collision behavior or a collision strategy even if those appear in the rubric. Do not fill in missing concepts from the rubric. Score each rubric 0-5 (0=no demonstrated understanding,1=major gaps,2=partial,3=adequate,4=strong,5=thorough) or null when evidence is insufficient.
COMMUNICATION IS A SEPARATE DIMENSION: judge only whether the submitted explanation is clear, organized and followable. A technically false answer can be stated clearly. Do not lower communication for factual errors, incorrect technical claims, brevity alone, omitted topics, accent, grammar fluency, personality or vocal traits. Explain the observed wording or organization separately from technical correctness; use null if that dimension is not assessable.
EVIDENCE COVERAGE IS A LIMITATION, NOT A PERFORMANCE WEAKNESS: strengths, weaknesses, improvements and recommendationReason may describe observed candidate content but must not claim "no evidence", "no examples", "no demonstration", or that the candidate did not mention/describe/explain a concept. Put unassessed coverage only in limitations, explicitly scoped to the supplied excerpts, such as "Advanced topics were not assessed from these excerpts." A reviewed transcript is an example of submitted communication even when too brief for an overall score. Recognize specific edge conditions actually stated: for example "an empty interval means the value is absent" demonstrates that not-found condition and cannot support a claim that all edge cases were omitted. Every weakness must contain an exact quote from candidate text/code (or a literal coding result status), its supplied evidenceRef, and an observation identifying the specific evidenced error or unclear reasoning. An omitted topic has no supporting quotation and belongs only in limitations. Weaknesses can and should be [] when no specific observed error is supported. Do not invent shortcomings to fill arrays or add new requirements such as rehashing, load factors or advanced topics that the question rubric did not request. The server generates a factual scope summary; put the actual assessment in the referenced metric explanations rather than generating another summary.
Use exact supplied answer:/submission:/transcript: refs for every scored metric. Transcript contains only human-reviewed candidate text, but it can include transcription mistakes or background speech. Do not double-count an answer repeated in the transcript. Do not invent percentages or infer missing performance. Recommendation is advisory: Strong Candidate, Candidate, Needs Further Evaluation, or Not Recommended; always Needs Further Evaluation when evidence is sparse. Explain uncertainty: evidence is excerpted within a 20,000-character budget, up to 20 answers, 5 submissions and 40 reviewed transcript segments; omitted material remains available to human reviewers. No integrity events, protected traits or resume prestige may influence scores. Final selection is human.`,
    input,
    groundedSchema,
  );
  const quoteSources = new Map<string, string>([
    ...input.answers.map((a: any) => [a.ref, a.text] as const),
    ...input.transcript.map((t) => [t.ref, t.text] as const),
    ...input.coding.map(
      (s) => [s.ref, `${s.code}\n${JSON.stringify(s.results)}`] as const,
    ),
  ]);
  const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
  for (const weakness of generated.weaknesses)
    if (
      !normalized(weakness.quote) ||
      !normalized(quoteSources.get(weakness.evidenceRef) || "").includes(
        normalized(weakness.quote),
      )
    )
      throw new ApiError(
        502,
        "AI report included an unverifiable candidate quotation. Review the original evidence or regenerate the assessment. No assessment was saved.",
        "UNGROUNDED_AI_REPORT",
      );
  let weaknessEvidence = generated.weaknesses;
  const result = assessmentSchema.parse({
    ...generated,
    summary: `This assessment covers ${input.answers.length} submitted answer excerpt(s), ${input.transcript.length} reviewed transcript excerpt(s), and ${input.coding.length} coding submission(s). The separate technical, problem-solving and explanation-clarity findings apply to this supplied evidence. Review unassessed material before making a hiring decision.`,
    weaknesses: generated.weaknesses.map((w) => w.observation),
  });
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
    weaknessEvidence = [];
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
  if (assessmentNarrativeIssues(result).length)
    throw new ApiError(
      502,
      "AI report mixed assessment dimensions or made an unsupported evidence-absence claim. Review the original evidence or regenerate the assessment. No assessment was saved.",
      "UNGROUNDED_AI_REPORT",
    );
  return {
    ...result,
    weaknesses: weaknessEvidence.map(
      (w) =>
        `${w.observation} Candidate evidence (${w.evidenceRef}): “${w.quote}”`,
    ),
    generatedAt: new Date().toISOString(),
    model: config.llmModel,
    sourceHash: evidenceHash(interview, submissions, transcript),
    coding: codingScore(submissions),
    rubricVersion: "content-rubric-v2",
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
