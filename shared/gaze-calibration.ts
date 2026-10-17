/** Experimental eye-image calibration, never a measure of attention or integrity. */
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
    frame.capturedAt - current.started >= 650
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
