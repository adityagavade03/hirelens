import { describe, expect, it } from "vitest";
import {
  gazeCollectionFailure,
  gazeEyeFeatures,
  gazeEyePatch,
  gazeFrameSize,
  sampleMatchesGazeTarget,
} from "../shared/gaze-calibration";

const eye = (width: number, height: number) => [
  { x: 0.25, y: 0.25 },
  { x: 0.25 + width, y: 0.25 },
  { x: 0.25 + width / 2, y: 0.25 - height / 2 },
  { x: 0.25 + width / 2, y: 0.25 + height / 2 },
];
describe("eye-image quality gates", () => {
  it("retains actual camera detail, caps large frames, and never upscales a small camera", () => {
    expect(gazeFrameSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(gazeFrameSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(gazeFrameSize(320, 240)).toEqual({ width: 320, height: 240 });
    expect(gazeFrameSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(gazeFrameSize(0, 720)).toBeNull();
    expect(gazeFrameSize(Infinity, 720)).toBeNull();
    // A 16px eye is usable at the camera's own resolution but was lost at 640px.
    expect(gazeEyePatch(eye(0.0125, 0.006), 1280, 720).quality).toBe("ready");
    expect(gazeEyePatch(eye(0.0125, 0.006), 640, 360).quality).toBe(
      "eyes-too-small",
    );
  });
  it("distinguishes small, closed, clipped and malformed eyes without relaxing the original gates", () => {
    expect(gazeEyePatch(eye(0.05, 0.02), 640, 480).quality).toBe("ready");
    expect(gazeEyePatch(eye(0.05, 0.001), 640, 480).quality).toBe(
      "eyes-closed",
    );
    expect(gazeEyePatch(eye(0.02, 0.004), 640, 480).quality).toBe(
      "eyes-too-small",
    );
    expect(
      gazeEyePatch(
        eye(0.05, 0.02).map((p) => ({ ...p, x: p.x - 0.3 })),
        640,
        480,
      ).quality,
    ).toBe("eyes-clipped");
    expect(gazeEyePatch([{ x: NaN, y: 0.2 }], 640, 480).quality).toBe(
      "invalid-frame",
    );
    expect(gazeEyePatch(eye(0.05, 0.02), 640, 0).quality).toBe("invalid-frame");
  });
  it("rejects uniform/invalid pixels while extracting finite normalized eye appearance", () => {
    const pixels = Array.from({ length: 40 }, (_, i) => [
      i % 2 ? 90 : 160,
      i % 2 ? 90 : 160,
      i % 2 ? 90 : 160,
      255,
    ]).flat();
    const result = gazeEyeFeatures(pixels);
    expect(result.quality).toBe("ready");
    if (result.quality === "ready") {
      expect(result.features).toHaveLength(40);
      expect(result.features.every(Number.isFinite)).toBe(true);
      expect(result.features.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    }
    expect(gazeEyeFeatures(Array(160).fill(120)).quality).toBe("low-contrast");
    expect(gazeEyeFeatures(pixels.slice(1)).quality).toBe("invalid-frame");
    expect(gazeEyeFeatures([...pixels.slice(1), NaN]).quality).toBe(
      "invalid-frame",
    );
  });
  it("reports the dominant rejected image reason and excludes capture after the target deadline", () => {
    expect(
      gazeCollectionFailure(2, { "eyes-too-small": 9, "no-face": 2 }),
    ).toContain("2 of 8");
    expect(
      gazeCollectionFailure(2, { "eyes-too-small": 9, "no-face": 2 }),
    ).toContain("Move a little closer");
    expect(gazeCollectionFailure(0, {})).toContain("enough fresh images");
    const current = {
      generation: 1,
      step: 0,
      started: 1000,
      cameraId: "camera",
    };
    expect(
      sampleMatchesGazeTarget(
        { ...current, capturedAt: 13000 },
        current,
        false,
      ),
    ).toBe(true);
    expect(
      sampleMatchesGazeTarget(
        { ...current, capturedAt: 13001 },
        current,
        false,
      ),
    ).toBe(false);
  });
});
