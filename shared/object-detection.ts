/** Local object estimates are contextual observations, never proof of misconduct. */
export interface CameraObject {
  label: string;
  score: number;
  /** Coordinates in the unmirrored source image, normalized to 0..1. */
  box: { x: number; y: number; width: number; height: number };
}

export const objectDetectionSettings = {
  scoreThreshold: 0.5,
  maxResults: 8,
  maxFrameDimension: 640,
  frameIntervalMs: 500,
  freshFrameMs: 2000,
} as const;
export const reviewObjectLabels = ["cell phone", "book"] as const;
export type ReviewObjectLabel = (typeof reviewObjectLabels)[number];

export function objectThresholdMs(seconds?: number) {
  return (
    Math.min(30, Math.max(3, Number.isFinite(seconds) ? seconds! : 3)) * 1000
  );
}

export function objectFrameSize(width: number, height: number) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(
    1,
    objectDetectionSettings.maxFrameDimension / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type RawDetection = {
  categories?: { categoryName?: unknown; score?: unknown }[];
  boundingBox?: {
    originX?: unknown;
    originY?: unknown;
    width?: unknown;
    height?: unknown;
  };
};
const labelName = (value: unknown) =>
  typeof value === "string" && /^[a-z][a-z0-9 -]{0,63}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : "";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Drop malformed/low-score results and clip model boxes to the actual image. */
export function normalizeObjectDetections(
  value: unknown,
  width: number,
  height: number,
): CameraObject[] {
  if (!Array.isArray(value) || !objectFrameSize(width, height)) return [];
  return value
    .slice(0, 64)
    .flatMap((raw): CameraObject[] => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as RawDetection;
      if (!Array.isArray(item.categories)) return [];
      const category = item.categories
        .filter(
          (c) =>
            c &&
            labelName(c.categoryName) &&
            finite(c.score) &&
            c.score >= objectDetectionSettings.scoreThreshold &&
            c.score <= 1,
        )
        .sort((a, b) => (b.score as number) - (a.score as number))[0];
      const box = item.boundingBox;
      if (
        !category ||
        !box ||
        !finite(box.originX) ||
        !finite(box.originY) ||
        !finite(box.width) ||
        !finite(box.height) ||
        box.width <= 0 ||
        box.height <= 0
      )
        return [];
      const x = clamp(box.originX / width),
        y = clamp(box.originY / height);
      const right = clamp((box.originX + box.width) / width),
        bottom = clamp((box.originY + box.height) / height);
      if (right <= x || bottom <= y) return [];
      return [
        {
          label: labelName(category.categoryName),
          score: category.score as number,
          box: { x, y, width: right - x, height: bottom - y },
        },
      ];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, objectDetectionSettings.maxResults);
}

/** Validate worker metadata without accepting arbitrary properties or pixels. */
export function sanitizeCameraObjects(value: unknown): CameraObject[] {
  if (!Array.isArray(value)) return [];
  return normalizeObjectDetections(
    value.slice(0, 64).map((raw) => {
      const item = raw as Partial<CameraObject> | null;
      return {
        categories: [{ categoryName: item?.label, score: item?.score }],
        boundingBox: {
          originX: item?.box?.x,
          originY: item?.box?.y,
          width: item?.box?.width,
          height: item?.box?.height,
        },
      };
    }),
    1,
    1,
  );
}

/** Each review label has an independent, once-per-continuous-appearance timer. */
export class SustainedObjectObservations {
  private observations = new Map<
    ReviewObjectLabel,
    { since: number; last: number; notified: boolean }
  >();
  reset() {
    this.observations.clear();
  }
  observe(objects: CameraObject[], capturedAt: number, thresholdMs = 3000) {
    if (!Number.isFinite(capturedAt)) {
      this.reset();
      return [];
    }
    const present = new Set(
      sanitizeCameraObjects(objects).map((object) => object.label),
    );
    const events: { label: ReviewObjectLabel; durationMs: number }[] = [];
    const minimum = Math.min(
      30000,
      Math.max(3000, Number.isFinite(thresholdMs) ? thresholdMs : 3000),
    );
    for (const label of reviewObjectLabels) {
      if (!present.has(label)) {
        this.observations.delete(label);
        continue;
      }
      let prior = this.observations.get(label);
      if (
        !prior ||
        capturedAt < prior.last ||
        capturedAt - prior.last > objectDetectionSettings.freshFrameMs
      ) {
        prior = { since: capturedAt, last: capturedAt, notified: false };
        this.observations.set(label, prior);
      }
      prior.last = capturedAt;
      if (!prior.notified && capturedAt - prior.since >= minimum) {
        prior.notified = true;
        events.push({ label, durationMs: capturedAt - prior.since });
      }
    }
    return events;
  }
}
