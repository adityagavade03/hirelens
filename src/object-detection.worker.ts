import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import {
  normalizeObjectDetections,
  objectDetectionSettings,
} from "../shared/object-detection";

let detector: ObjectDetector | undefined;
// Only bounded labels/scores/boxes and capture metadata leave this worker.
// Camera pixels are never uploaded or returned to the application/server.
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.kind === "init") {
      detector = await ObjectDetector.createFromOptions(
        await FilesetResolver.forVisionTasks(data.wasm),
        {
          baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
          runningMode: "VIDEO",
          scoreThreshold: objectDetectionSettings.scoreThreshold,
          maxResults: objectDetectionSettings.maxResults,
        },
      );
      self.postMessage({ kind: "ready" });
    } else if (data.kind === "frame") {
      const frame = data.frame as ImageBitmap;
      try {
        if (!detector) throw new Error("Object model unavailable");
        const result = detector.detectForVideo(frame, data.timestamp);
        self.postMessage({
          kind: "detections",
          detections: normalizeObjectDetections(
            result.detections,
            frame.width,
            frame.height,
          ),
          requestId: data.requestId,
          epoch: data.epoch,
          activityEpoch: data.activityEpoch,
          cameraId: data.cameraId,
          capturedAt: data.capturedAt,
          active: data.active,
        });
      } finally {
        frame.close();
      }
    }
  } catch {
    detector?.close();
    detector = undefined;
    self.postMessage({ kind: "error" });
  }
};
