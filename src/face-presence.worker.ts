import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detector: FaceDetector | undefined;
// This worker never sends images to the server. Only a face count leaves it.
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.kind === "init") {
      const files = await FilesetResolver.forVisionTasks(data.wasm);
      detector = await FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.6,
      });
      self.postMessage({ kind: "ready" });
    } else if (data.kind === "frame") {
      try {
        if (!detector) throw new Error("Detector is not ready");
        const count = detector.detectForVideo(data.frame, data.timestamp)
          .detections.length;
        self.postMessage({ kind: "count", count });
      } finally {
        data.frame.close();
      }
    }
  } catch (error) {
    self.postMessage({
      kind: "error",
      message: error instanceof Error ? error.message : "Face model failed",
    });
    detector?.close();
    detector = undefined;
  }
};
