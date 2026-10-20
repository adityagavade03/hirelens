/** Experimental eye-image calibration, never a measure of attention or integrity. */
export const gazeCapture = {
  settleMs: 650,
  targetTimeoutMs: 12000,
  samplesPerTarget: 8,
  readySamples: 3,
  freshFrameMs: 1500,
  maxFrameWidth: 1280,
} as const;
export type GazeFrameQuality =
  | "ready"
  | "no-face"
  | "multiple-faces"
  | "eyes-too-small"
  | "eyes-closed"
  | "eyes-clipped"
  | "low-contrast"
  | "invalid-frame";
export const gazeQualityMessages: Record<GazeFrameQuality, string> = {
  ready:
    "Both eye images are usable. Keep your position steady while following the targets.",
  "no-face":
    "No face landmarks found. Face the camera with light in front of you and check the camera preview.",
  "multiple-faces":
    "More than one face was found. Calibration needs only your face in the camera view.",
  "eyes-too-small":
    "Eye images are too small. Move a little closer to the camera or select a higher-resolution camera.",
  "eyes-closed":
    "Eye openings are not clear enough. Keep both eyes visible; normal blinks are skipped automatically.",
  "eyes-clipped":
    "An eye is outside the camera image. Center your face in the camera preview.",
  "low-contrast":
    "Eye-image detail is too low. Add light in front of you and reduce glare or blur around your eyes.",
  "invalid-frame":
    "The camera image could not be read. Check the camera preview or select another camera.",
};

/** Preserve available eye detail without inventing pixels from a small camera. */
export function gazeFrameSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  const scale = Math.min(
    1,
    gazeCapture.maxFrameWidth / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function gazeEyePatch(
  points: { x: number; y: number }[],
  frameWidth: number,
  frameHeight: number,
):
  | { quality: "ready"; x: number; y: number; width: number; height: number }
  | { quality: Exclude<GazeFrameQuality, "ready"> } {
  if (
    points.length !== 4 ||
    !gazeFrameSize(frameWidth, frameHeight) ||
    points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return { quality: "invalid-frame" };
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const width = (maxX - minX) * frameWidth,
    height = (maxY - minY) * frameHeight;
  if (minX < 0 || maxX > 1 || minY < 0 || maxY > 1)
    return { quality: "eyes-clipped" };
  // These are the original image-quality gates, not calibrated accuracy claims.
  if (width < 12) return { quality: "eyes-too-small" };
  if (height / width < 0.1) return { quality: "eyes-closed" };
  if (height < 3) return { quality: "eyes-too-small" };
  return {
    quality: "ready",
    x: minX * frameWidth,
    y: minY * frameHeight,
    width,
    height,
  };
}

export function gazeEyeFeatures(
  pixels: ArrayLike<number>,
):
  | { quality: "ready"; features: number[] }
  | { quality: "low-contrast" | "invalid-frame" } {
  if (
    pixels.length !== 160 ||
    Array.from(pixels).some((p) => !Number.isFinite(p) || p < 0 || p > 255)
  )
    return { quality: "invalid-frame" };
  const gray = Array.from(
    { length: 40 },
    (_, i) =>
      (pixels[i * 4] * 0.299 +
        pixels[i * 4 + 1] * 0.587 +
        pixels[i * 4 + 2] * 0.114) /
      255,
  );
  const mean = gray.reduce((sum, value) => sum + value, 0) / gray.length;
  const contrast = Math.sqrt(
    gray.reduce((sum, value) => sum + (value - mean) ** 2, 0) / gray.length,
  );
  if (contrast < 0.015) return { quality: "low-contrast" };
  return {
    quality: "ready",
    features: gray.map((value) => (value - mean) / Math.max(0.05, contrast)),
  };
}

export function gazeCollectionFailure(
  accepted: number,
  rejected: Partial<Record<GazeFrameQuality, number>>,
) {
  const reason = (Object.entries(rejected) as [GazeFrameQuality, number][])
    .filter(([quality, count]) => quality !== "ready" && count > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return `Calibration stopped: ${accepted} of ${gazeCapture.samplesPerTarget} usable images collected for this target. ${reason ? gazeQualityMessages[reason] : "The camera did not provide enough fresh images. Check the preview and retry."} No gaze estimate is active.`;
}

export interface GazeSample {
  features: number[];
  x: number;
  y: number;
}
export interface GazeCalibration {
  mean: number[];
  scale: number[];
  x: number[];
  y: number[];
}
export const gazeTargets = [0.12, 0.5, 0.88].flatMap((y) =>
  [0.12, 0.5, 0.88].map((x) => ({ x, y })),
);
export const gazeValidationTargets = [
  { x: 0.25, y: 0.25 },
  { x: 0.75, y: 0.25 },
  { x: 0.25, y: 0.75 },
  { x: 0.75, y: 0.75 },
  { x: 0.5, y: 0.5 },
];
export function sampleMatchesGazeTarget(
  frame: {
    generation: number;
    step: number | null;
    capturedAt: number;
    cameraId: string;
  },
  current: {
    generation: number;
    step: number;
    started: number;
    cameraId: string;
  },
  interviewActive: boolean,
) {
  return (
    !interviewActive &&
    frame.generation === current.generation &&
    frame.step === current.step &&
    frame.cameraId === current.cameraId &&
    Number.isFinite(frame.capturedAt) &&
    frame.capturedAt - current.started >= gazeCapture.settleMs &&
    frame.capturedAt - current.started <= gazeCapture.targetTimeoutMs
  );
}
const finite = (values: number[]) => values.every(Number.isFinite);
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
function solve(a: number[][], b: number[]) {
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < b.length; col++) {
    let pivot = col;
    for (let row = col + 1; row < b.length; row++)
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-9)
      throw new Error("Calibration is unstable. Please retry.");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const divisor = m[col][col];
    for (let j = col; j <= b.length; j++) m[col][j] /= divisor;
    for (let row = 0; row < b.length; row++) {
      if (row === col) continue;
      const amount = m[row][col];
      for (let j = col; j <= b.length; j++) m[row][j] -= amount * m[col][j];
    }
  }
  return m.map((row) => row[b.length]);
}
export function fitGaze(samples: GazeSample[]): GazeCalibration {
  const width = samples[0]?.features.length || 0;
  if (
    width < 2 ||
    width > 128 ||
    samples.length > 2000 ||
    !gazeTargets.every(
      (t) => samples.filter((s) => s.x === t.x && s.y === t.y).length >= 6,
    ) ||
    samples.some(
      (s) => s.features.length !== width || !finite([...s.features, s.x, s.y]),
    )
  )
    throw new Error(
      "Complete all nine calibration targets with working eye images.",
    );
  const mean = Array.from(
    { length: width },
    (_, j) => samples.reduce((n, s) => n + s.features[j], 0) / samples.length,
  );
  const scale = mean.map((m, j) =>
    Math.max(
      0.02,
      Math.sqrt(
        samples.reduce((n, s) => n + (s.features[j] - m) ** 2, 0) /
          samples.length,
      ),
    ),
  );
  const vectors = samples.map((s) => [
    1,
    ...s.features.map((v, j) => (v - mean[j]) / scale[j]),
  ]);
  const matrix = Array.from({ length: width + 1 }, (_, j) =>
    Array.from(
      { length: width + 1 },
      (_, k) =>
        vectors.reduce((n, v) => n + v[j] * v[k], 0) +
        (j === k ? (j === 0 ? 1e-6 : 1) : 0),
    ),
  );
  const output = (axis: "x" | "y") =>
    solve(
      matrix,
      Array.from({ length: width + 1 }, (_, j) =>
        vectors.reduce((n, v, i) => n + v[j] * samples[i][axis], 0),
      ),
    );
  return { mean, scale, x: output("x"), y: output("y") };
}
export function predictGaze(model: GazeCalibration, features: number[]) {
  if (features.length !== model.mean.length || !finite(features)) return null;
  const v = [
    1,
    ...features.map((n, j) => (n - model.mean[j]) / model.scale[j]),
  ];
  const x = v.reduce((sum, n, j) => sum + n * model.x[j], 0),
    y = v.reduce((sum, n, j) => sum + n * model.y[j], 0);
  return finite([x, y]) ? { x, y } : null;
}
/** Validation samples must be collected AFTER fitting, never reused as training. */
export function validateGaze(model: GazeCalibration, samples: GazeSample[]) {
  const complete = gazeValidationTargets.every(
    (t) => samples.filter((s) => s.x === t.x && s.y === t.y).length >= 6,
  );
  const errors = samples.map((s) => {
    const p = predictGaze(model, s.features);
    return p ? Math.hypot(p.x - s.x, p.y - s.y) / Math.SQRT2 : Infinity;
  });
  const targetErrors = gazeValidationTargets.map(
    (t) =>
      median(
        samples.flatMap((s, i) =>
          s.x === t.x && s.y === t.y ? [errors[i]] : [],
        ),
      ) ?? Infinity,
  );
  const medianError = errors.length ? median(errors) : Infinity;
  const maximumTargetError = Math.max(...targetErrors);
  return {
    accepted: complete && medianError <= 0.08 && maximumTargetError <= 0.15,
    medianError,
    maximumTargetError,
    samples: samples.length,
  };
}
