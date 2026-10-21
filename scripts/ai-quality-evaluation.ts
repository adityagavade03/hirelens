/** Synthetic regression repeatability, never hiring accuracy or fairness evidence. */
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
