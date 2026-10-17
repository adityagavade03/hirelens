import { describe, expect, it } from "vitest";
import {
  fitGaze,
  gazeTargets,
  gazeValidationTargets,
  predictGaze,
  validateGaze,
  sampleMatchesGazeTarget,
} from "../shared/gaze-calibration";
import { summarizeSpeakers } from "../shared/speaker-analysis";
import {
  researchDatasetSchema,
  inspectResearchData,
  splitResearchData,
  trainReviewResearch,
} from "../shared/integrity-research";
import { analyzeIntegrity } from "../server/integrity";
import { researchFixture as fixture } from "./fixtures/integrity-research";

const features = (x: number, y: number) => [x, y, x + y, x - y];
const samples = (targets: { x: number; y: number }[]) =>
  targets.flatMap((t) =>
    Array.from({ length: 8 }, () => ({ ...t, features: features(t.x, t.y) })),
  );
describe("calibrated eye-image estimation", () => {
  it("rejects delayed frames from an earlier calibration, target, camera, or unsettled capture", () => {
    const current = {
      generation: 3,
      step: 2,
      started: 1000,
      cameraId: "camera-b",
    };
    const frame = {
      generation: 3,
      step: 2,
      capturedAt: 1800,
      cameraId: "camera-b",
    };
    expect(sampleMatchesGazeTarget(frame, current, false)).toBe(true);
    expect(
      sampleMatchesGazeTarget({ ...frame, generation: 2 }, current, false),
    ).toBe(false);
    expect(sampleMatchesGazeTarget({ ...frame, step: 1 }, current, false)).toBe(
      false,
    );
    expect(
      sampleMatchesGazeTarget(
        { ...frame, cameraId: "camera-a" },
        current,
        false,
      ),
    ).toBe(false);
    expect(
      sampleMatchesGazeTarget({ ...frame, capturedAt: 1200 }, current, false),
    ).toBe(false);
    expect(sampleMatchesGazeTarget(frame, current, true)).toBe(false);
  });
  it("fits known targets and evaluates new held-out observations", () => {
    const model = fitGaze(samples(gazeTargets));
    expect(validateGaze(model, samples(gazeValidationTargets)).accepted).toBe(
      true,
    );
    expect(predictGaze(model, features(0.25, 0.75))?.x).toBeCloseTo(0.25, 1);
    expect(predictGaze(model, features(0.25, 0.75))?.y).toBeCloseTo(0.75, 1);
  });
  it("rejects incomplete, nonfinite, constant, and inaccurate calibration", () => {
    expect(() => fitGaze(samples(gazeTargets.slice(1)))).toThrow();
    expect(() =>
      fitGaze(samples(gazeTargets).map((s) => ({ ...s, features: [NaN, 0] }))),
    ).toThrow();
    const constant = fitGaze(
      samples(gazeTargets).map((s) => ({ ...s, features: [1, 1] })),
    );
    expect(
      validateGaze(
        constant,
        samples(gazeValidationTargets).map((s) => ({ ...s, features: [1, 1] })),
      ).accepted,
    ).toBe(false);
    const model = fitGaze(samples(gazeTargets));
    expect(
      validateGaze(model, samples(gazeValidationTargets.slice(1))),
    ).toMatchObject({ accepted: false });
    expect(
      validateGaze(
        model,
        samples(gazeValidationTargets).map((s) => ({
          ...s,
          features: features(1 - s.x, 1 - s.y),
        })),
      ).accepted,
    ).toBe(false);
    expect(predictGaze(model, [1, NaN])).toBeNull();
  });
});
describe("speaker cluster validation", () => {
  it("merges duplicate overlaps and does not count a short noise cluster as another speaker", () => {
    const r = summarizeSpeakers({
      model: "fixture",
      duration: 20,
      segments: [
        { start: 0, end: 6, speaker: "speaker_0" },
        { start: 2, end: 5, speaker: "speaker_0" },
        { start: 8, end: 9, speaker: "speaker_1" },
      ],
    });
    expect(r.clusters[0].seconds).toBe(6);
    expect(r.estimatedSpeakers).toBe(1);
    expect(r.additionalSpeakerEstimate).toBe(false);
  });
  it("exposes sustained clusters as estimates and rejects fabricated counts, identities and invalid timelines", () => {
    const result = {
      model: "fixture",
      duration: 20,
      segments: [
        { start: 0, end: 6, speaker: "speaker_0" },
        { start: 8, end: 14, speaker: "speaker_1" },
      ],
    };
    expect(summarizeSpeakers(result)).toMatchObject({
      estimatedSpeakers: 2,
      additionalSpeakerEstimate: true,
    });
    expect(() =>
      summarizeSpeakers({ ...result, estimatedSpeakers: 7 }),
    ).toThrow();
    expect(() =>
      summarizeSpeakers({
        ...result,
        segments: [{ start: 0, end: 30, speaker: "speaker_0" }],
      }),
    ).toThrow();
    expect(() =>
      summarizeSpeakers({
        ...result,
        segments: [{ start: 0, end: 3, speaker: "John" }],
      }),
    ).toThrow();
    expect(() =>
      summarizeSpeakers({
        ...result,
        segments: [{ start: 7, end: 3, speaker: "speaker_0" }],
      }),
    ).toThrow();
  });
  it("does not add gaze or speaker estimates to integrity scores", () => {
    const baseline = analyzeIntegrity([]);
    const result = analyzeIntegrity([
      { kind: "gaze-away", occurredAt: new Date() },
      { kind: "additional-speaker", occurredAt: new Date() },
    ]);
    expect(result.score).toBe(baseline.score);
    expect(result.level).toBe("low");
  });
});
describe("research training preparation", () => {
  it("refuses absent data, duplicated interviews and nonconsented or demographic features", () => {
    expect(inspectResearchData({ ...fixture(), rows: [] }).readyToTrain).toBe(
      false,
    );
    const duplicate = fixture();
    duplicate.rows[1].interviewReference = duplicate.rows[0].interviewReference;
    expect(() => splitResearchData(duplicate)).toThrow("Duplicate");
    const noConsent = fixture();
    Object.assign(noConsent.rows[0], { consentForResearch: false });
    expect(researchDatasetSchema.safeParse(noConsent).success).toBe(false);
    const demographic = fixture();
    Object.assign(demographic.rows[0].features, { gender: "unknown" });
    expect(researchDatasetSchema.safeParse(demographic).success).toBe(false);
  });
  it("keeps participant groups disjoint and exports research metrics without activation", () => {
    const { train, test } = splitResearchData(fixture());
    const trainGroups = new Set(train.map((r) => r.participantGroup));
    expect(test.some((r) => trainGroups.has(r.participantGroup))).toBe(false);
    const result = trainReviewResearch(fixture());
    expect(result.deploymentApproved).toBe(false);
    expect(result.heldOutRows + result.trainedRows).toBe(200);
    expect(Number.isFinite(result.heldOut.brierScore)).toBe(true);
  });
});
