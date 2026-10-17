import { z } from "zod";
import { createHash } from "node:crypto";

export const researchFeatures = [
  "focusChangesPerMinute",
  "pastesPerMinute",
  "fullscreenExitsPerMinute",
  "faceAbsencesPerMinute",
  "multipleFacesPerMinute",
  "coverageFraction",
] as const;
const reference = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/,
    "Use a pseudonymous reference without names, email addresses or free text",
  );
const label = z.enum(["needs-follow-up", "no-follow-up"]);
const reviewLabel = z.enum([
  "needs-follow-up",
  "no-follow-up",
  "insufficient-evidence",
]);
const review = z
  .object({
    reviewerReference: reference,
    label: reviewLabel,
    reviewedAt: z.iso.datetime(),
    independent: z.literal(true),
    evidenceReferences: z.array(reference).min(1).max(30),
  })
  .strict();
export const researchRowSchema = z
  .object({
    interviewReference: reference,
    participantGroup: reference,
    source: z.literal("consented-reviewed-interview"),
    consentForResearch: z.literal(true),
    researchConsent: z
      .object({
        recordReference: reference,
        protocolReference: reference,
        scope: z.literal("event-rates-human-follow-up-research"),
        consentedAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        withdrawnAt: z.iso.datetime().nullable(),
      })
      .strict(),
    collectedAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime(),
    independentReviews: z.array(review).length(2),
    adjudication: z
      .object({
        reviewerReference: reference,
        label,
        reviewedAt: z.iso.datetime(),
        evidenceReferences: z.array(reference).min(1).max(30),
      })
      .strict()
      .nullable(),
    label,
    observation: z
      .object({
        durationSeconds: z.number().int().min(60).max(14400),
        deviceCategory: z.enum([
          "desktop",
          "laptop",
          "tablet",
          "phone",
          "other",
        ]),
        browserFamily: z.enum(["chromium", "firefox", "webkit", "other"]),
      })
      .strict(),
    features: z
      .object({
        focusChangesPerMinute: z.number().min(0).max(60),
        pastesPerMinute: z.number().min(0).max(60),
        fullscreenExitsPerMinute: z.number().min(0).max(60),
        faceAbsencesPerMinute: z.number().min(0).max(60),
        multipleFacesPerMinute: z.number().min(0).max(60),
        coverageFraction: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();
export const researchDatasetSchema = z
  .object({
    schemaVersion: z.literal(2),
    purpose: z.literal("research-only-human-follow-up"),
    protocolReference: reference,
    collectionProtocol: z.string().trim().min(30).max(4000),
    rows: z.array(researchRowSchema).max(100000),
  })
  .strict();
export type ResearchRow = z.infer<typeof researchRowSchema>;
type Dataset = z.infer<typeof researchDatasetSchema>;
type Issue = { code: string; message: string; row?: number };
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const splitVersion = "participant-sha256-v2-fixed-holdout";
const binaryLabels = ["needs-follow-up", "no-follow-up"] as const;
const reviewLabels = [...binaryLabels, "insufficient-evidence"] as const;
const countLabels = (rows: ResearchRow[]) =>
  Object.fromEntries(
    binaryLabels.map((value) => [
      value,
      rows.filter((r) => r.label === value).length,
    ]),
  ) as Record<(typeof binaryLabels)[number], number>;

/** File order cannot change group assignments, normalization or model fitting. */
function partition(data: Dataset) {
  const groups = [...new Set(data.rows.map((r) => r.participantGroup))].sort(
    (a, b) =>
      hash(splitVersion + ":" + a).localeCompare(hash(splitVersion + ":" + b)),
  );
  const heldout = new Set(groups.slice(0, Math.ceil(groups.length * 0.25)));
  const rows = [...data.rows].sort((a, b) =>
    a.interviewReference.localeCompare(b.interviewReference),
  );
  return {
    train: rows.filter((r) => !heldout.has(r.participantGroup)),
    test: rows.filter((r) => heldout.has(r.participantGroup)),
    groups,
  };
}

/** Pair-specific kappa avoids pooling unrelated panels into a misleading statistic. */
export function annotationReliability(rows: ResearchRow[]) {
  const pairs = new Map<string, [string, string][]>();
  for (const row of rows) {
    const ordered = [...row.independentReviews].sort((a, b) =>
      a.reviewerReference.localeCompare(b.reviewerReference),
    );
    const key = JSON.stringify(ordered.map((r) => r.reviewerReference));
    const values = pairs.get(key) ?? [];
    values.push([ordered[0].label, ordered[1].label]);
    pairs.set(key, values);
  }
  const reports = [...pairs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pair, values]) => {
      const n = values.length;
      const observedAgreement = values.filter(([a, b]) => a === b).length / n;
      const expectedAgreement = reviewLabels.reduce(
        (sum, target) =>
          sum +
          ((values.filter(([a]) => a === target).length / n) *
            values.filter(([, b]) => b === target).length) /
            n,
        0,
      );
      return {
        reviewerPairHash: hash(pair),
        interviews: n,
        observedAgreement,
        cohenKappa:
          expectedAgreement === 1
            ? null
            : (observedAgreement - expectedAgreement) / (1 - expectedAgreement),
        degenerateLabelDistribution: expectedAgreement === 1,
      };
    });
  const agreed = rows.filter(
    (r) => r.independentReviews[0].label === r.independentReviews[1].label,
  ).length;
  return {
    interviews: rows.length,
    observedAgreement: rows.length ? agreed / rows.length : null,
    disagreements: rows.length - agreed,
    insufficientEvidenceReviews: rows.reduce(
      (n, r) =>
        n +
        r.independentReviews.filter((v) => v.label === "insufficient-evidence")
          .length,
      0,
    ),
    adjudicatedInterviews: rows.filter((r) => r.adjudication !== null).length,
    reviewerPairs: reports,
    limitation:
      "Agreement is measured before adjudication. Agreement is not proof of cheating or label accuracy; kappa is undefined for some constant-label panels.",
  };
}

export function inspectResearchData(input: unknown, asOf = new Date()) {
  if (!Number.isFinite(asOf.getTime()))
    throw new Error("A valid consent-check time is required.");
  const parsed = researchDatasetSchema.safeParse(input);
  if (!parsed.success)
    return {
      readyToTrain: false as const,
      checkedAt: asOf.toISOString(),
      blockingIssues: parsed.error.issues.map((e) => ({
        code: "SCHEMA",
        message: e.path.join(".") + ": " + e.message,
      })),
      warnings: [] as Issue[],
      summary: null,
    };
  const data = parsed.data,
    issues: Issue[] = [],
    warnings: Issue[] = [];
  const seen = new Set<string>(),
    consentOwners = new Map<string, string>();
  const consentRecords = new Map<string, string>();
  data.rows.forEach((row, index) => {
    const add = (code: string, message: string) =>
      issues.push({ code, message, row: index + 1 });
    if (seen.has(row.interviewReference))
      add(
        "DUPLICATE_INTERVIEW",
        "Duplicate interviews are not independent observations.",
      );
    seen.add(row.interviewReference);
    const consent = row.researchConsent,
      owner = consentOwners.get(consent.recordReference);
    if (owner && owner !== row.participantGroup)
      add(
        "CONSENT_REUSED",
        "A consent reference cannot belong to different participants.",
      );
    consentOwners.set(consent.recordReference, row.participantGroup);
    const consentRecord = JSON.stringify(consent),
      previousConsent = consentRecords.get(consent.recordReference);
    if (previousConsent && previousConsent !== consentRecord)
      add(
        "CONSENT_INCONSISTENT",
        "Every session using a consent reference must carry the same current consent record, including withdrawal and expiry.",
      );
    consentRecords.set(consent.recordReference, consentRecord);
    if (consent.protocolReference !== data.protocolReference)
      add(
        "CONSENT_PROTOCOL",
        "Consent must reference this dataset's collection protocol.",
      );
    if (consent.withdrawnAt !== null)
      add(
        "CONSENT_WITHDRAWN",
        "Remove withdrawn sessions and rebuild affected research artifacts.",
      );
    if (Date.parse(consent.expiresAt) <= asOf.getTime())
      add(
        "CONSENT_EXPIRED",
        "Research consent has expired; do not train on this session.",
      );
    if (Date.parse(consent.consentedAt) > Date.parse(row.collectedAt))
      add(
        "CONSENT_AFTER_COLLECTION",
        "Research consent must precede collection.",
      );
    const finalTime = Date.parse(row.reviewedAt);
    if (finalTime < Date.parse(row.collectedAt) || finalTime > asOf.getTime())
      add(
        "REVIEW_TIME",
        "Final review must follow collection and cannot be in the future.",
      );
    const reviewers = row.independentReviews;
    if (reviewers[0].reviewerReference === reviewers[1].reviewerReference)
      add(
        "REVIEWER_INDEPENDENCE",
        "Two distinct independent reviewers are required.",
      );
    for (const r of reviewers)
      if (
        Date.parse(r.reviewedAt) < Date.parse(row.collectedAt) ||
        Date.parse(r.reviewedAt) > finalTime
      )
        add(
          "REVIEW_TIME",
          "Independent reviews must follow collection and precede final review.",
        );
    const needsAdjudication =
      reviewers.some((r) => r.label === "insufficient-evidence") ||
      reviewers[0].label !== reviewers[1].label;
    if (needsAdjudication && !row.adjudication)
      add(
        "ADJUDICATION_REQUIRED",
        "Disagreement or insufficient evidence requires an independent third review, or exclusion from training.",
      );
    if (row.adjudication) {
      const a = row.adjudication;
      if (reviewers.some((r) => r.reviewerReference === a.reviewerReference))
        add(
          "ADJUDICATOR_INDEPENDENCE",
          "An adjudicator must differ from the initial reviewers.",
        );
      if (a.label !== row.label)
        add("FINAL_LABEL", "The final label must match the adjudicated label.");
      if (
        Date.parse(a.reviewedAt) > finalTime ||
        reviewers.some(
          (r) => Date.parse(r.reviewedAt) > Date.parse(a.reviewedAt),
        )
      )
        add(
          "ADJUDICATION_TIME",
          "Adjudication must follow both reviews and precede the final timestamp.",
        );
    } else if (!needsAdjudication && reviewers[0].label !== row.label)
      add(
        "FINAL_LABEL",
        "The final label must match the independently agreed label.",
      );
    if (row.features.coverageFraction === 0)
      add(
        "NO_COVERAGE",
        "A session without monitoring coverage cannot supply measured event rates.",
      );
  });
  const { train, test, groups } = partition(data);
  if (data.rows.length < 100)
    issues.push({
      code: "MINIMUM_ROWS",
      message:
        "At least 100 genuinely consented, independently reviewed interviews are required.",
    });
  if (groups.length < 20)
    issues.push({
      code: "MINIMUM_GROUPS",
      message:
        "At least 20 independently consented participant groups are required.",
    });
  for (const [name, rows] of [
    ["training", train],
    ["held-out", test],
  ] as const)
    for (const target of binaryLabels)
      if (rows.filter((r) => r.label === target).length < 10)
        issues.push({
          code: "SPLIT_CLASS_SIZE",
          message:
            "Both labels need at least 10 interviews in each participant-disjoint split; " +
            name +
            " / " +
            target +
            " is too small. Collect representative data without rerolling the split.",
        });
  const lowCoverage = data.rows.filter(
    (r) => r.features.coverageFraction < 0.8,
  ).length;
  if (lowCoverage)
    warnings.push({
      code: "LOW_COVERAGE",
      message:
        lowCoverage +
        " interviews have less than 80% monitoring coverage. This is a review prompt, not a validated threshold or misconduct evidence.",
    });
  const constantFeatures = researchFeatures.filter(
    (key) =>
      train.length > 0 &&
      train.every((r) => r.features[key] === train[0].features[key]),
  );
  if (constantFeatures.length)
    warnings.push({
      code: "CONSTANT_FEATURES",
      message:
        "Training has constant features: " +
        constantFeatures.join(", ") +
        ". Generalization remains untested.",
    });
  if (
    new Set(data.rows.map((r) => r.observation.deviceCategory)).size < 2 ||
    new Set(data.rows.map((r) => r.observation.browserFamily)).size < 2
  )
    warnings.push({
      code: "DEVICE_COVERAGE",
      message:
        "More than one device and browser family is needed before drawing cross-device conclusions.",
    });
  const reliability = annotationReliability(data.rows);
  if (reliability.disagreements || reliability.insufficientEvidenceReviews)
    warnings.push({
      code: "ANNOTATION_REVIEW",
      message:
        "Inspect initial disagreement and insufficient-evidence labels before accepting the adjudicated dataset.",
    });
  return {
    readyToTrain: issues.length === 0,
    checkedAt: asOf.toISOString(),
    blockingIssues: issues,
    warnings,
    summary: {
      rows: data.rows.length,
      participantGroups: groups.length,
      labels: countLabels(data.rows),
      splitVersion,
      training: {
        rows: train.length,
        groups: new Set(train.map((r) => r.participantGroup)).size,
        labels: countLabels(train),
      },
      heldOut: {
        rows: test.length,
        groups: new Set(test.map((r) => r.participantGroup)).size,
        labels: countLabels(test),
      },
      annotationReliability: reliability,
    },
  };
}

export function splitResearchData(input: unknown, asOf = new Date()) {
  const preflight = inspectResearchData(input, asOf);
  if (!preflight.readyToTrain)
    throw new Error(
      preflight.blockingIssues.map((i) => i.code + ": " + i.message).join("\n"),
    );
  const data = researchDatasetSchema.parse(input);
  return { data, ...partition(data), preflight };
}

type EvaluationRow = {
  participantGroup: string;
  actual: boolean;
  probability: number;
  deviceCategory: string;
  browserFamily: string;
};
type Counts = {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  squaredError: number;
  rows: number;
};
const emptyCounts = (): Counts => ({
  truePositive: 0,
  falsePositive: 0,
  trueNegative: 0,
  falseNegative: 0,
  squaredError: 0,
  rows: 0,
});
const ratio = (a: number, b: number) => (b ? a / b : null);
function countsFor(rows: EvaluationRow[]) {
  const counts = emptyCounts();
  for (const r of rows) {
    counts.rows++;
    counts.squaredError += (r.probability - Number(r.actual)) ** 2;
    if (r.probability >= 0.5)
      r.actual ? counts.truePositive++ : counts.falsePositive++;
    else r.actual ? counts.falseNegative++ : counts.trueNegative++;
  }
  return counts;
}
function metrics(c: Counts) {
  const recall = ratio(c.truePositive, c.truePositive + c.falseNegative);
  const specificity = ratio(c.trueNegative, c.trueNegative + c.falsePositive);
  return {
    truePositive: c.truePositive,
    falsePositive: c.falsePositive,
    trueNegative: c.trueNegative,
    falseNegative: c.falseNegative,
    accuracy: ratio(c.truePositive + c.trueNegative, c.rows),
    precision: ratio(c.truePositive, c.truePositive + c.falsePositive),
    recall,
    falsePositiveRate: ratio(c.falsePositive, c.falsePositive + c.trueNegative),
    balancedAccuracy:
      recall === null || specificity === null
        ? null
        : (recall + specificity) / 2,
    f1: ratio(
      2 * c.truePositive,
      2 * c.truePositive + c.falsePositive + c.falseNegative,
    ),
    brierScore: ratio(c.squaredError, c.rows),
  };
}
const metricKeys = [
  "accuracy",
  "precision",
  "recall",
  "falsePositiveRate",
  "balancedAccuracy",
  "f1",
  "brierScore",
] as const;
function bootstrap(rows: EvaluationRow[], seed: string) {
  const groupMap = new Map<string, EvaluationRow[]>();
  for (const row of rows) {
    const group = groupMap.get(row.participantGroup) ?? [];
    group.push(row);
    groupMap.set(row.participantGroup, group);
  }
  const groups = [...groupMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, values]) => countsFor(values));
  let state = parseInt(hash(seed).slice(0, 8), 16) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const samples = Object.fromEntries(
    metricKeys.map((key) => [key, [] as number[]]),
  ) as Record<(typeof metricKeys)[number], number[]>;
  const iterations = 1000;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const total = emptyCounts();
    for (let i = 0; i < groups.length; i++) {
      const group = groups[Math.floor(random() * groups.length)];
      for (const key of Object.keys(total) as (keyof Counts)[])
        total[key] += group[key];
    }
    const values = metrics(total);
    for (const key of metricKeys) {
      const value = values[key];
      if (value !== null) samples[key].push(value);
    }
  }
  return {
    method: "deterministic participant-cluster percentile bootstrap",
    confidenceLevel: 0.95,
    iterations,
    participantGroups: groups.length,
    intervals: Object.fromEntries(
      metricKeys.map((key) => {
        const values = samples[key].sort((a, b) => a - b);
        return [
          key,
          {
            lower: values.length
              ? values[Math.floor((values.length - 1) * 0.025)]
              : null,
            upper: values.length
              ? values[Math.ceil((values.length - 1) * 0.975)]
              : null,
            definedReplicates: values.length,
          },
        ];
      }),
    ),
    limitation:
      "Resampling preserves sessions within each participant. Intervals reflect this held-out sample only and exclude annotation error, dataset selection and model-training uncertainty. Few groups or rare labels can make intervals unstable or degenerate.",
  };
}
export function evaluateResearchPredictions(
  rows: EvaluationRow[],
  bootstrapSeed = "hirelens-integrity-evaluation-v2",
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !Number.isFinite(r.probability) ||
        r.probability < 0 ||
        r.probability > 1,
    )
  )
    throw new Error(
      "Evaluation requires held-out rows with valid probabilities.",
    );
  const subgroup = (key: "deviceCategory" | "browserFamily") =>
    [...new Set(rows.map((r) => r[key]))].sort().map((value) => {
      const group = rows.filter((r) => r[key] === value),
        participants = new Set(group.map((r) => r.participantGroup)).size;
      return {
        value,
        rows: group.length,
        participantGroups: participants,
        descriptiveOnly: true,
        smallSample:
          group.length < 30 ||
          participants < 5 ||
          !group.some((r) => r.actual) ||
          !group.some((r) => !r.actual),
        metrics: metrics(countsFor(group)),
      };
    });
  return {
    ...metrics(countsFor(rows)),
    threshold: 0.5,
    uncertainty: bootstrap(rows, bootstrapSeed),
    calibration: Array.from({ length: 5 }, (_, index) => {
      const lower = index / 5,
        upper = (index + 1) / 5;
      const bin = rows.filter(
        (r) => r.probability >= lower && (r.probability < upper || index === 4),
      );
      return {
        lowerInclusive: lower,
        upper,
        rows: bin.length,
        meanProbability: bin.length
          ? bin.reduce((n, r) => n + r.probability, 0) / bin.length
          : null,
        observedFollowUpFraction: bin.length
          ? bin.filter((r) => r.actual).length / bin.length
          : null,
      };
    }),
    subgroups: {
      deviceCategory: subgroup("deviceCategory"),
      browserFamily: subgroup("browserFamily"),
    },
  };
}

export function trainReviewResearch(input: unknown, asOf = new Date()) {
  const { data, train, test, preflight } = splitResearchData(input, asOf);
  const vector = (r: ResearchRow) => researchFeatures.map((k) => r.features[k]);
  const mean = researchFeatures.map(
    (_, j) => train.reduce((n, r) => n + vector(r)[j], 0) / train.length,
  );
  const scale = mean.map((m, j) =>
    Math.max(
      0.01,
      Math.sqrt(
        train.reduce((n, r) => n + (vector(r)[j] - m) ** 2, 0) / train.length,
      ),
    ),
  );
  const x = (r: ResearchRow) => [
    1,
    ...vector(r).map((v, j) => (v - mean[j]) / scale[j]),
  ];
  const weights = Array(researchFeatures.length + 1).fill(0) as number[];
  const sigmoid = (v: number) =>
    1 / (1 + Math.exp(-Math.max(-30, Math.min(30, v))));
  const probability = (r: ResearchRow) =>
    sigmoid(x(r).reduce((n, v, j) => n + v * weights[j], 0));
  // Hyperparameters and threshold are fixed before the holdout is evaluated.
  for (let step = 0; step < 1200; step++) {
    const gradient = weights.map(() => 0);
    for (const row of train) {
      const v = x(row),
        error = probability(row) - Number(row.label === "needs-follow-up");
      for (let j = 0; j < v.length; j++)
        gradient[j] += (error * v[j]) / train.length;
    }
    for (let j = 0; j < weights.length; j++)
      weights[j] -= 0.03 * (gradient[j] + (j ? 0.02 * weights[j] : 0));
  }
  const evaluations = test.map((r) => ({
    participantGroup: r.participantGroup,
    actual: r.label === "needs-follow-up",
    probability: probability(r),
    ...r.observation,
  }));
  const baselineProbability =
    train.filter((r) => r.label === "needs-follow-up").length / train.length;
  return {
    version: "review-research-logistic-v2",
    deploymentApproved: false,
    purpose: data.purpose,
    protocolReference: data.protocolReference,
    consentCheckedAt: asOf.toISOString(),
    featureNames: researchFeatures,
    mean,
    scale,
    weights,
    trainingParameters: {
      iterations: 1200,
      learningRate: 0.03,
      l2: 0.02,
      threshold: 0.5,
    },
    trainedRows: train.length,
    heldOutRows: test.length,
    preflight,
    heldOut: evaluateResearchPredictions(evaluations),
    baseline: {
      method:
        "constant training-label prevalence, evaluated on the same untouched holdout",
      probability: baselineProbability,
      ...metrics(
        countsFor(
          evaluations.map((r) => ({ ...r, probability: baselineProbability })),
        ),
      ),
    },
    limitations:
      "Research artifact only. Review labels are not ground truth cheating. Consent and independence attestations require a human provenance audit. Do not load this model into HireLens or use it for hiring. Holdout metrics, uncertainty and device/browser slices do not establish accuracy or fairness for new populations. Never tune on this holdout; independent prospective evaluation, annotation audit and a fresh validation study remain required.",
  };
}
