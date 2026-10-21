import { describe, expect, it } from "vitest";
import {
  normalizeObjectDetections,
  objectFrameSize,
  objectThresholdMs,
  sanitizeCameraObjects,
  SustainedObjectObservations,
  type CameraObject,
  objectFrameQuality,
  objectQualityMessage,
  sanitizeObjectFrameQuality,
} from "../shared/object-detection";

const object = (label: string, score = 0.8): CameraObject => ({
  label,
  score,
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
});
describe("local object metadata", () => {
  it("uses conservative exposure warnings and returns bounded metadata without pixels", () => {
    const pixels = (n: number) =>
      new Uint8ClampedArray([n, n, n, 255, n, n, n, 255]);
    expect(objectFrameQuality(pixels(10))).toEqual({
      state: "dark",
      mean: 10,
      darkFraction: 1,
      brightFraction: 0,
    });
    expect(objectFrameQuality(pixels(250)).state).toBe("glare");
    expect(objectFrameQuality(pixels(80)).state).toBe("usable");
    const mixed = new Uint8ClampedArray([0, 0, 0, 255, 160, 160, 160, 255]);
    expect(objectFrameQuality(mixed).state).toBe("usable"); // A dark background alone is not a pause.
    expect(objectFrameQuality([]).state).toBe("unavailable");
    expect(objectFrameQuality([NaN, 0, 0, 255]).state).toBe("unavailable");
    expect(
      sanitizeObjectFrameQuality({
        state: "usable",
        mean: Infinity,
        darkFraction: 0,
        brightFraction: 0,
      }).state,
    ).toBe("unavailable");
    expect(Object.keys(objectFrameQuality(pixels(120))).sort()).toEqual([
      "brightFraction",
      "darkFraction",
      "mean",
      "state",
    ]);
    expect(
      objectQualityMessage(objectFrameQuality(pixels(120)), 320, 240),
    ).toContain("Low camera resolution");
    expect(
      objectQualityMessage(objectFrameQuality(pixels(120)), 1280, 720),
    ).toBe("");
  });
  it("preserves aspect, bounds processing size and does not enlarge low-resolution video", () => {
    expect(objectFrameSize(1920, 1080)).toEqual({ width: 640, height: 360 });
    expect(objectFrameSize(480, 960)).toEqual({ width: 320, height: 640 });
    expect(objectFrameSize(320, 240)).toEqual({ width: 320, height: 240 });
    expect(objectFrameSize(0, 720)).toBeNull();
    expect(objectFrameSize(NaN, 720)).toBeNull();
  });
  it("keeps bounded source-image boxes and rejects malformed or weak detections", () => {
    const box = { originX: -20, originY: 30, width: 100, height: 240 };
    const detection = (label: string, score: number) => ({
      categories: [{ categoryName: label, score }],
      boundingBox: box,
    });
    expect(
      normalizeObjectDetections(
        [
          detection("cell phone", 0.8),
          detection("book", 0.49),
          detection("chair", NaN),
          detection("<image>", 0.9),
          detection("person", 1.1),
          { ...detection("laptop", 0.7), boundingBox: { ...box, width: -20 } },
        ],
        200,
        150,
      ),
    ).toEqual([
      {
        label: "cell phone",
        score: 0.8,
        box: { x: 0, y: 0.2, width: 0.4, height: 0.8 },
      },
    ]);
    expect(
      normalizeObjectDetections(
        Array.from({ length: 15 }, (_, n) => detection("book", 0.5 + n / 100)),
        200,
        150,
      ),
    ).toHaveLength(8);
    expect(
      normalizeObjectDetections([detection("book", 0.5)], 200, 150)[0].score,
    ).toBe(0.5);
  });
  it("strips unexpected worker properties, retains supported local display labels and rejects malformed boxes", () => {
    const sanitized = sanitizeCameraObjects([
      { ...object("keyboard"), image: "must-not-leave-worker" },
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]).toMatchObject({ label: "keyboard", score: 0.8 });
    expect(Object.keys(sanitized[0]).sort()).toEqual(["box", "label", "score"]);
    expect(sanitized[0].box.width).toBeCloseTo(0.3);
    expect(sanitized[0].box.height).toBeCloseTo(0.4);
    expect(
      sanitizeCameraObjects([
        null,
        {},
        { ...object("book"), box: { x: NaN, y: 0, width: 1, height: 1 } },
      ]),
    ).toEqual([]);
  });
});
describe("sustained review observations", () => {
  it("requires at least three seconds, maintains independent phone/book timers, and ignores ordinary desk objects", () => {
    const observations = new SustainedObjectObservations();
    expect(objectThresholdMs()).toBe(3000);
    expect(objectThresholdMs(NaN)).toBe(3000);
    expect(objectThresholdMs(-1)).toBe(3000);
    expect(objectThresholdMs(900)).toBe(30000);
    const phone = object("cell phone"),
      book = object("book"),
      desk = object("laptop");
    for (let at = 0; at < 3000; at += 500)
      expect(
        observations.observe(
          at < 1000 ? [phone, desk] : [phone, book, desk],
          at,
        ),
      ).toEqual([]);
    expect(observations.observe([phone, book, desk], 3000)).toEqual([
      { label: "cell phone", durationMs: 3000 },
    ]);
    expect(observations.observe([phone, book, desk], 3500)).toEqual([]);
    expect(observations.observe([phone, book, desk], 4000)).toEqual([
      { label: "book", durationMs: 3000 },
    ]);
    for (let at = 4500; at <= 10000; at += 500)
      expect(observations.observe([phone, book, desk], at)).toEqual([]);
  });
  it("restarts an interval on absence, stale gaps, backwards time or a privacy reset", () => {
    const observations = new SustainedObjectObservations(),
      phone = [object("cell phone")];
    observations.observe(phone, 0);
    observations.observe(phone, 1500);
    observations.observe([], 2000);
    expect(observations.observe(phone, 3500)).toEqual([]);
    expect(observations.observe(phone, 6500)).toEqual([]); // Three-second gap is not continuous evidence.
    expect(observations.observe(phone, 7500)).toEqual([]);
    expect(observations.observe(phone, 7000)).toEqual([]);
    observations.reset();
    expect(observations.observe(phone, 10000)).toEqual([]);
    expect(observations.observe(phone, 11500)).toEqual([]);
    expect(observations.observe(phone, 13000)).toEqual([
      { label: "cell phone", durationMs: 3000 },
    ]);
  });
  it("honors a higher configured threshold and never emits based on low-score or invalid-time samples", () => {
    const observations = new SustainedObjectObservations();
    for (let at = 0; at < 5000; at += 500)
      expect(observations.observe([object("book")], at, 5000)).toEqual([]);
    expect(observations.observe([object("book")], 5000, 5000)).toEqual([
      { label: "book", durationMs: 5000 },
    ]);
    observations.reset();
    for (let at = 0; at < 6000; at += 500)
      expect(observations.observe([object("book", 0.4)], at)).toEqual([]);
    expect(observations.observe([object("book")], NaN)).toEqual([]);
  });
});
