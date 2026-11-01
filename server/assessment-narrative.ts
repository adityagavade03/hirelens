type NarrativeAssessment = {
  technical: { explanation: string };
  problemSolving: { explanation: string };
  communication: { explanation: string };
  summary: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  recommendationReason: string;
};

// These are conservative output-contract checks, not a semantic accuracy model.
// An excerpted context cannot establish that a candidate never demonstrated a
// concept. Coverage gaps belong in the report's limitations, where a reviewer
// can distinguish unassessed material from an observed performance weakness.
const unscopedAbsence =
  /\b(?:no|without|lack(?:s|ing)?)\s+(?:[a-z-]+\s+){0,4}(?:evidence|examples?|demonstration)\b|\b(?:candidate|answer|response|transcript)s?\s+(?:did not|does not|do not|has not|have not|failed to|fails to)\s+(?:mention|describe|address|explain|show|provide|demonstrate)\b/i;

// Technical correctness is a separate dimension. Explicit factual-error
// judgments cannot justify a communication score, even if the same sentence
// also says "unclear". Ask for a fresh assessment instead of silently changing
// a provider's score or hiding the original failure.
const correctnessJudgment =
  /\b(?:factual|technical|conceptual)\s+(?:errors?|mistakes?|inaccurac(?:y|ies))\b|\b(?:incorrect|inaccurate|wrong)\s+(?:statements?|answers?|explanations?|claims?|concepts?|facts?)\b|\b(?:answers?|statements?|explanations?|claims?)\s+(?:are|is|were|was)\s+(?:incorrect|inaccurate|wrong)\b/i;

// "Easy to follow despite factual errors" explicitly keeps the dimensions
// separate. Do not reject that valid concession as if the errors caused a poor
// communication score. Remove only the named concession, so a later causal
// correctness judgment in the same explanation is still checked.
const correctnessConcession =
  /\b(?:despite|regardless of|irrespective of|independent(?:ly)? of)\s+(?:(?:the|their|its|some|any|these|those|several)\s+)*(?:(?:factual|technical|conceptual)\s+(?:errors?|mistakes?|inaccurac(?:y|ies))|(?:incorrect|inaccurate|wrong)\s+(?:statements?|answers?|explanations?|claims?|concepts?|facts?))\b/gi;

export function assessmentNarrativeIssues(result: NarrativeAssessment) {
  const issues: string[] = [];
  if (
    correctnessJudgment.test(
      result.communication.explanation.replace(correctnessConcession, ""),
    )
  )
    issues.push("Communication explanation judges technical correctness.");
  const conclusions = [
    result.technical.explanation,
    result.problemSolving.explanation,
    result.communication.explanation,
    result.summary,
    ...result.strengths,
    ...result.weaknesses,
    ...result.improvements,
    result.recommendationReason,
  ];
  if (conclusions.some((text) => unscopedAbsence.test(text)))
    issues.push(
      "A conclusion makes a categorical absence claim from excerpted evidence.",
    );
  return issues;
}
