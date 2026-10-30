import { z } from "zod";
import type { CameraObject } from "./object-detection.js";

export const cameraCheckStates = [
  "off",
  "loading",
  "ready",
  "paused",
  "error",
  "not-configured",
] as const;
export type CameraCheckState = (typeof cameraCheckStates)[number];
const state = z.enum(cameraCheckStates);
const unit = z.number().finite().min(0).max(1);
export const candidateCameraInput = z
  .object({
    camera: z.boolean(),
    face: z
      .object({ state, count: z.number().int().min(0).max(20).nullable() })
      .strict(),
    objects: z
      .object({
        state,
        items: z
          .array(
            z
              .object({
                label: z.enum(["cell phone", "book"]),
                score: unit,
                box: z
                  .object({ x: unit, y: unit, width: unit, height: unit })
                  .strict(),
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
    frameAspect: z.number().finite().min(0.1).max(10).nullable(),
  })
  .strict();

/** Last device-reported metadata only; contains no image/audio data. */
export interface CandidateCameraStatus {
  at: string;
  camera: boolean;
  face: { state: CameraCheckState; count: number | null };
  objects: { state: CameraCheckState; items: CameraObject[] };
  frameAspect: number | null;
}
export function freshCameraSnapshot(
  snapshot?: CandidateCameraStatus | null,
  now = Date.now(),
) {
  if (!snapshot) return false;
  const age = now - Date.parse(snapshot.at);
  return Number.isFinite(age) && age >= 0 && age <= 20000;
}
export function consentedCameraSnapshot(
  snapshot: CandidateCameraStatus | undefined,
  faceConsent: boolean,
  objectConsent: boolean,
  live: boolean,
): CandidateCameraStatus | undefined {
  if (!snapshot || !live) return undefined;
  return {
    ...snapshot,
    face: faceConsent ? snapshot.face : { state: "off", count: null },
    objects: objectConsent ? snapshot.objects : { state: "off", items: [] },
    frameAspect: objectConsent ? snapshot.frameAspect : null,
  };
}
