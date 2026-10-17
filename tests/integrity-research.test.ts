import { describe, expect, it } from "vitest";
import {
  annotationReliability,
  evaluateResearchPredictions,
  inspectResearchData,
  splitResearchData,
  trainReviewResearch,
} from "../shared/integrity-research";
import { researchFixture, researchAsOf } from "./fixtures/integrity-research";

const codes = (data: unknown) =>
  inspectResearchData(data, researchAsOf).blockingIssues.map(
    (issue) => issue.code,
  );

describe("research provenance preflight", () => {
  it("gives actionable empty-collection blockers without inventing data", () => {
    const report = inspectResearchData(
      { ...researchFixture(), rows: [] },
      researchAsOf,
    );
    expect(report.readyToTrain).toBe(false);
    expect(report.summary?.rows).toBe(0);
    expect(report.blockingIssues.map((r) => r.code)).toContain("MINIMUM_ROWS");
    expect(report.summary?.annotationReliability.observedAgreement).toBeNull();
  });
  it.each([
    [
      "CONSENT_WITHDRAWN",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.researchConsent.withdrawnAt = "2026-10-09T00:00:00.000Z";
      },
    ],
    [
      "CONSENT_EXPIRED",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.researchConsent.expiresAt = "2026-10-13T12:00:00.000Z";
      },
    ],
    [
      "CONSENT_AFTER_COLLECTION",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.researchConsent.consentedAt = "2026-10-03T00:00:00.000Z";
      },
    ],
    [
      "CONSENT_PROTOCOL",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.researchConsent.protocolReference = "another-protocol";
      },
    ],
    [
      "REVIEWER_INDEPENDENCE",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.independentReviews[1].reviewerReference =
          r.independentReviews[0].reviewerReference;
      },
    ],
    [
      "REVIEW_TIME",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.independentReviews[1].reviewedAt = "2026-10-01T00:00:00.000Z";
      },
    ],
    [
      "REVIEW_TIME",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.reviewedAt = "2026-10-14T00:00:00.000Z";
      },
    ],
    [
      "NO_COVERAGE",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.features.coverageFraction = 0;
      },
    ],
    [
      "FINAL_LABEL",
      (r: ReturnType<typeof researchFixture>["rows"][number]) => {
        r.label = "needs-follow-up";
      },
    ],
  ])("blocks %s before training", (expected, mutate) => {
    const data = researchFixture();
    mutate(data.rows[0]);
    expect(codes(data)).toContain(expected);
    expect(() => trainReviewResearch(data, researchAsOf)).toThrow(expected);
  });
  it("rejects a consent identity reused for a different participant", () => {
    const data = researchFixture();
    data.rows[4].researchConsent.recordReference =
      data.rows[0].researchConsent.recordReference;
    expect(codes(data)).toContain("CONSENT_REUSED");
  });
  it("refuses inconsistent consent records across sessions of one participant", () => {
    const data = researchFixture();
    data.rows[0].researchConsent.expiresAt = "2099-01-01T00:00:00.000Z";
    expect(codes(data)).toContain("CONSENT_INCONSISTENT");
  });
  it("requires third-party adjudication and preserves original disagreement", () => {
    const data = researchFixture(),
      row = data.rows[0];
    row.independentReviews[1].label = "insufficient-evidence";
    expect(codes(data)).toContain("ADJUDICATION_REQUIRED");
    row.adjudication = {
      reviewerReference: "test-reviewer-c",
      label: row.label,
      reviewedAt: "2026-10-06T00:00:00.000Z",
      evidenceReferences: ["test-context-observation"],
    };
    const report = inspectResearchData(data, researchAsOf);
    expect(report.readyToTrain).toBe(true);
    expect(report.summary?.annotationReliability).toMatchObject({
      disagreements: 1,
      insufficientEvidenceReviews: 1,
      adjudicatedInterviews: 1,
    });
    row.adjudication.reviewerReference =
      row.independentReviews[0].reviewerReference;
    expect(codes(data)).toContain("ADJUDICATOR_INDEPENDENCE");
    row.adjudication.reviewerReference = "test-reviewer-c";
    row.adjudication.reviewedAt = "2026-10-03T00:00:00.000Z";
    expect(codes(data)).toContain("ADJUDICATION_TIME");
  });
  it("rejects raw personal fields, unsafe identifiers, and legacy consent-only rows", () => {
    const data = researchFixture();
    Object.assign(data.rows[0], { email: "not-real@example.invalid" });
    expect(codes(data)).toContain("SCHEMA");
    const rawReference = researchFixture();
    rawReference.rows[0].participantGroup = "not-real@example.invalid";
    expect(codes(rawReference)).toContain("SCHEMA");
    const old = researchFixture();
    delete (old.rows[0] as Partial<(typeof old.rows)[0]>).researchConsent;
    expect(codes(old)).toContain("SCHEMA");
  });
  it("flags limited coverage without equating missing observations to misconduct", () => {
    const data = researchFixture();
    data.rows[0].features.coverageFraction = 0.3;
    const report = inspectResearchData(data, researchAsOf);
    expect(report.readyToTrain).toBe(true);
    expect(report.warnings.map((r) => r.code)).toContain("LOW_COVERAGE");
  });
});

describe("review-label reliability", () => {
  it("reports the expected observed agreement and Cohen kappa", () => {
    const rows = researchFixture().rows.slice(0, 4);
    const combinations = [
      ["needs-follow-up", "needs-follow-up"],
      ["needs-follow-up", "no-follow-up"],
      ["no-follow-up", "no-follow-up"],
      ["no-follow-up", "no-follow-up"],
    ] as const;
    rows.forEach((row, i) =>
      row.independentReviews.forEach((r, j) => {
        r.label = combinations[i][j];
      }),
    );
    const report = annotationReliability(rows);
    expect(report.observedAgreement).toBe(0.75);
    expect(report.reviewerPairs[0].cohenKappa).toBeCloseTo(0.5);
  });
  it("keeps mixed reviewer panels separate and leaves degenerate kappa undefined", () => {
    const rows = researchFixture().rows.slice(0, 2);
    rows[1].independentReviews[0].reviewerReference = "test-reviewer-c";
    const report = annotationReliability(rows);
    expect(report.reviewerPairs).toHaveLength(2);
    expect(report.reviewerPairs.every((r) => r.cohenKappa === null)).toBe(true);
  });
});

describe("honest held-out evaluation", () => {
  const predictions = () => [
    {
      participantGroup: "p1",
      actual: true,
      probability: 0.9,
      deviceCategory: "laptop",
      browserFamily: "firefox",
    },
    {
      participantGroup: "p1",
      actual: false,
      probability: 0.7,
      deviceCategory: "laptop",
      browserFamily: "firefox",
    },
    {
      participantGroup: "p2",
      actual: true,
      probability: 0.3,
      deviceCategory: "desktop",
      browserFamily: "chromium",
    },
    {
      participantGroup: "p2",
      actual: false,
      probability: 0.1,
      deviceCategory: "desktop",
      browserFamily: "chromium",
    },
  ];
  it("computes confusion counts, Brier error, calibration and small-sample slices", () => {
    const result = evaluateResearchPredictions(predictions());
    expect(result).toMatchObject({
      truePositive: 1,
      falsePositive: 1,
      trueNegative: 1,
      falseNegative: 1,
      precision: 0.5,
      recall: 0.5,
      falsePositiveRate: 0.5,
      balancedAccuracy: 0.5,
    });
    expect(result.brierScore).toBeCloseTo(0.25);
    expect(result.calibration.reduce((n, b) => n + b.rows, 0)).toBe(4);
    expect(
      result.subgroups.deviceCategory.every(
        (r) => r.smallSample && r.descriptiveOnly,
      ),
    ).toBe(true);
    expect(result.uncertainty.participantGroups).toBe(2);
    expect(result.uncertainty.iterations).toBe(1000);
  });
  it("does not report undefined rates as zero or count repeated sessions as independent", () => {
    const result = evaluateResearchPredictions(
      predictions().map((p) => ({ ...p, actual: true, probability: 0.1 })),
    );
    expect(result.precision).toBeNull();
    expect(result.falsePositiveRate).toBeNull();
    expect(result.uncertainty.intervals.precision.definedReplicates).toBe(0);
    expect(result.uncertainty.intervals.precision.lower).toBeNull();
    expect(result.uncertainty.participantGroups).toBe(2);
  });
  it("is deterministic and keeps bootstrap estimates within possible bounds", () => {
    const a = evaluateResearchPredictions(predictions()),
      b = evaluateResearchPredictions([...predictions()].reverse());
    expect(a.uncertainty).toEqual(b.uncertainty);
    for (const interval of Object.values(a.uncertainty.intervals)) {
      expect(interval.lower).toBeGreaterThanOrEqual(0);
      expect(interval.upper).toBeLessThanOrEqual(1);
      expect(interval.lower).toBeLessThanOrEqual(interval.upper!);
    }
    expect(() =>
      evaluateResearchPredictions([
        { ...predictions()[0], probability: Number.NaN },
      ]),
    ).toThrow();
  });
  it("reproduces coefficients and held-out groups independent of input order", () => {
    const data = researchFixture(),
      a = trainReviewResearch(data, researchAsOf);
    const b = trainReviewResearch(
      { ...data, rows: [...data.rows].reverse() },
      researchAsOf,
    );
    expect(a.weights).toEqual(b.weights);
    expect(a.heldOut).toEqual(b.heldOut);
    expect(a.deploymentApproved).toBe(false);
    expect(a.baseline.probability).toBe(0.5);
    const { train, test } = splitResearchData(data, researchAsOf),
      groups = new Set(train.map((r) => r.participantGroup));
    expect(test.every((r) => !groups.has(r.participantGroup))).toBe(true);
  });
  it("does not leak held-out features into normalization or fitted coefficients", () => {
    const data = researchFixture(),
      original = trainReviewResearch(data, researchAsOf);
    const heldout = new Set(
      splitResearchData(data, researchAsOf).test.map(
        (r) => r.interviewReference,
      ),
    );
    for (const row of data.rows)
      if (heldout.has(row.interviewReference))
        row.features.focusChangesPerMinute = 40;
    const altered = trainReviewResearch(data, researchAsOf);
    expect(altered.mean).toEqual(original.mean);
    expect(altered.scale).toEqual(original.scale);
    expect(altered.weights).toEqual(original.weights);
    expect(altered.heldOut.brierScore).not.toEqual(original.heldOut.brierScore);
  });
});
