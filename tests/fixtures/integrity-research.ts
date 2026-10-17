import type { ResearchRow } from "../../shared/integrity-research";

/** Synthetic test-only attestations. Never export this as actual consent or evidence. */
export const researchFixture = () => ({
  schemaVersion: 2,
  purpose: "research-only-human-follow-up",
  protocolReference: "unit-test-only",
  collectionProtocol:
    "Synthetic unit-test fixture only; no human data, real consent or model validation is represented here.",
  rows: Array.from({ length: 200 }, (_, i): ResearchRow => {
    const label = i % 2 ? "needs-follow-up" : "no-follow-up";
    return {
      interviewReference: `test-interview-${i}`,
      participantGroup: `test-participant-${Math.floor(i / 4)}`,
      source: "consented-reviewed-interview",
      consentForResearch: true,
      researchConsent: {
        recordReference: `test-consent-${Math.floor(i / 4)}`,
        protocolReference: "unit-test-only",
        scope: "event-rates-human-follow-up-research",
        consentedAt: "2026-10-01T00:00:00.000Z",
        expiresAt: "2100-01-01T00:00:00.000Z",
        withdrawnAt: null,
      },
      collectedAt: "2026-10-02T00:00:00.000Z",
      reviewedAt: "2026-10-08T00:00:00.000Z",
      independentReviews: ["test-reviewer-a", "test-reviewer-b"].map(
        (reviewerReference) => ({
          reviewerReference,
          label,
          reviewedAt: "2026-10-04T00:00:00.000Z",
          independent: true,
          evidenceReferences: [`test-evidence-${i}`],
        }),
      ),
      adjudication: null,
      label,
      observation: {
        durationSeconds: 600,
        deviceCategory: Math.floor(i / 4) % 2 ? "desktop" : "laptop",
        browserFamily: Math.floor(i / 4) % 2 ? "chromium" : "firefox",
      },
      features: {
        focusChangesPerMinute: i % 2,
        pastesPerMinute: 0,
        fullscreenExitsPerMinute: 0,
        faceAbsencesPerMinute: 0,
        multipleFacesPerMinute: 0,
        coverageFraction: 1,
      },
    };
  }),
});
export const researchAsOf = new Date("2026-10-13T12:00:00.000Z");
