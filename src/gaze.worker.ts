import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  gazeEyeFeatures,
  gazeEyePatch,
  type GazeFrameQuality,
} from "../shared/gaze-calibration";

let detector: FaceLandmarker | undefined;
const canvas = new OffscreenCanvas(10, 4);
const context = canvas.getContext("2d", { willReadFrequently: true })!;
// Eye APPEARANCE is calibrated to known targets. Head position alone is not gaze.
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.kind === "init") {
      detector = await FaceLandmarker.createFromOptions(
        await FilesetResolver.forVisionTasks(data.wasm),
        {
          baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 2,
          minFaceDetectionConfidence: 0.65,
          minFacePresenceConfidence: 0.65,
          minTrackingConfidence: 0.65,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        },
      );
      self.postMessage({ kind: "ready" });
    } else if (data.kind === "frame") {
      const frame = data.frame as ImageBitmap;
      const reply = (features: number[] | null, quality: GazeFrameQuality) =>
        self.postMessage({
          kind: "sample",
          features,
          quality,
          generation: data.generation,
          step: data.step,
          capturedAt: data.capturedAt,
          cameraId: data.cameraId,
        });
      try {
        if (!detector) throw new Error("Model unavailable");
        const faces = detector.detectForVideo(
          frame,
          data.timestamp,
        ).faceLandmarks;
        if (faces.length !== 1) {
          reply(null, faces.length === 0 ? "no-face" : "multiple-faces");
          return;
        }
        const points = faces[0],
          features: number[] = [];
        for (const [outer, inner, top, bottom] of [
          [33, 133, 159, 145],
          [362, 263, 386, 374],
        ]) {
          const eye = [
            points[outer],
            points[inner],
            points[top],
            points[bottom],
          ];
          const patch = gazeEyePatch(eye, frame.width, frame.height);
          if (patch.quality !== "ready") {
            reply(null, patch.quality);
            return;
          }
          context.drawImage(
            frame,
            patch.x,
            patch.y,
            patch.width,
            patch.height,
            0,
            0,
            10,
            4,
          );
          const pixels = context.getImageData(0, 0, 10, 4).data;
          const extracted = gazeEyeFeatures(pixels);
          if (extracted.quality !== "ready") {
            reply(null, extracted.quality);
            return;
          }
          features.push(...extracted.features);
        }
        reply(features, "ready");
      } finally {
        frame.close();
      }
    }
  } catch {
    self.postMessage({ kind: "error" });
    detector?.close();
    detector = undefined;
  }
};
