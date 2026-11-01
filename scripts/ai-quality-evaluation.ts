/** Synthetic regression repeatability, never hiring accuracy or fairness evidence. */
import type { ResumeQualityCase } from "./ai-quality-cases.js";

type ReportNarrative = {
  communication: { explanation: string };
  summary: string;
  weaknesses: string[];
};

/** Specific semantic regressions found by inspecting the retained report run. */
export function reportNarrativeQualityChecks(
  id: string,
  output: ReportNarrative,
) {
  const narrative = [output.summary, ...output.weaknesses].join("\n");
  if (id === "wrong-answers-injection")
    return [
      {
        label:
          "Communication reasoning stays separate from the fixture's factual errors",
        passed:
          !/\b(?:factual|technical|conceptual)\s+(?:errors?|mistakes?)\b|\b(?:incorrect|wrong|inaccurate)\s+(?:statements?|answers?|claims?|explanations?)\b/i.test(
            output.communication.explanation.replace(
              /\b(?:despite|regardless of|irrespective of|independent(?:ly)? of)\s+(?:(?:the|their|its|some|any|these|those|several)\s+)*(?:(?:factual|technical|conceptual)\s+(?:errors?|mistakes?|inaccurac(?:y|ies))|(?:incorrect|inaccurate|wrong)\s+(?:statements?|answers?|explanations?|claims?|concepts?|facts?))\b/gi,
              "",
            ),
          ),
      },
    ];
  if (id === "reviewed-transcript-only")
    return [
      {
        label:
          "The supplied reviewed transcript is not described as zero communication examples",
        passed:
          !/\b(?:no|lack(?:s|ing)?)\s+(?:[a-z-]+\s+){0,3}communication\s+(?:examples?|evidence|demonstration)\b/i.test(
            narrative,
          ),
      },
    ];
  if (id === "grounded-strong-answers")
    return [
      {
        label:
          "The stated empty-interval condition is not described as zero edge-case handling",
        passed:
          !/\b(?:no|missing|omitted|lack(?:s|ing)?|failed to|fails to|did not|does not)\b[^.!?]{0,100}\bedge[ -]?cases?\b/i.test(
            narrative,
          ),
      },
    ];
  return [];
}

// Known gaps can reduce the aggregate score without vetoing a shortlist. Unknown
// or truncated evidence still needs review, whatever the score. This is a
// diagnostic expectation, not a second implementation of resume scoring.
export function qualityExpectedOutcome(
  expected: ResumeQualityCase["expected"],
  context: {
    score: number | null;
    threshold: number;
    uncertain: boolean;
    truncated: boolean;
  },
) {
  if (expected !== "aggregate_threshold") return expected;
  if (
    context.truncated ||
    context.uncertain ||
    context.score == null ||
    !Number.isFinite(context.score) ||
    context.score < 0 ||
    context.score > 100 ||
    !Number.isFinite(context.threshold) ||
    context.threshold < 0 ||
    context.threshold > 100
  )
    return "needs_review";
  return context.score >= context.threshold ? "shortlisted" : "not_shortlisted";
}

export function qualityOptions(args: string[], knownIds: string[]) {
  const options = new Map<string, string>();
  for (const arg of args) {
    const match = arg.match(/^--(case|output|repeats)=(.+)$/);
    if (!match || options.has(match[1]))
      throw new Error(
        "Use each of --case=ids, --output=name and --repeats=1..5 at most once.",
      );
    options.set(match[1], match[2]);
  }
  const selected = options.get("case")?.split(",");
  if (
    selected &&
    (new Set(selected).size !== selected.length ||
      selected.some((id) => !knownIds.includes(id)))
  )
    throw new Error(
      "Every selected case must be a unique existing benchmark ID.",
    );
  const repeated = options.get("repeats") || "1";
  if (!/^[1-5]$/.test(repeated))
    throw new Error("Repeats must be an integer from 1 to 5.");
  const name =
    options.get("output") ||
    `ai-quality-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(name))
    throw new Error("Output must be a simple filename without an extension.");
  return { selected, repeats: Number(repeated), name };
}

export type QualityResult = {
  id: string;
  passed: boolean;
  repetition: number;
  output?: {
    outcome?: string;
    recommendation?: string;
    match?: { score?: number | null };
    criteria?: { id: string; status: string }[];
  };
};
export function qualityStability(results: QualityResult[], repeats: number) {
  return [...new Set(results.map((result) => result.id))].map((id) => {
    const rows = results.filter((result) => result.id === id);
    const successful = rows.filter((result) => result.output);
    const outcomes = [
      ...new Set(
        successful
          .map(
            (result) => result.output?.outcome || result.output?.recommendation,
          )
          .filter(Boolean),
      ),
    ];
    const scores = successful
      .map((result) => result.output?.match?.score)
      .filter(
        (score): score is number =>
          typeof score === "number" && Number.isFinite(score),
      );
    const statuses = new Map<string, Set<string>>();
    for (const row of successful)
      for (const criterion of row.output?.criteria || []) {
        if (!statuses.has(criterion.id)) statuses.set(criterion.id, new Set());
        statuses.get(criterion.id)!.add(criterion.status);
      }
    return {
      id,
      attempts: rows.length,
      requestedRepeats: repeats,
      passed: rows.filter((result) => result.passed).length,
      failed: rows.filter((result) => !result.passed).length,
      complete: rows.length === repeats,
      repeatabilityMeasured: repeats > 1 && successful.length > 1,
      distinctOutcomes: outcomes,
      scoreRange: scores.length
        ? { min: Math.min(...scores), max: Math.max(...scores) }
        : null,
      differingCriteria: [...statuses]
        .filter(([, values]) => values.size > 1)
        .map(([criterionId, values]) => ({
          id: criterionId,
          statuses: [...values],
        })),
    };
  });
}
