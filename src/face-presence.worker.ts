import {
  FaceDetector,
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

let detector: FaceDetector | undefined;
let fallback: FaceLandmarker | undefined;
// This worker never sends images to the server. Only a face count leaves it.
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.kind === "init") {
      const files = await FilesetResolver.forVisionTasks(data.wasm);
      try {
        detector = await FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
        self.postMessage({ kind: "ready", model: "BlazeFace" });
      } catch {
        if (!data.fallbackModel) throw new Error("Face model could not load");
        self.postMessage({
          kind: "loading",
          model: "Face Landmarker fallback",
        });
        fallback = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: data.fallbackModel, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 4,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
        });
        self.postMessage({ kind: "ready", model: "Face Landmarker fallback" });
      }
    } else if (data.kind === "frame") {
      try {
        if (!detector && !fallback) throw new Error("Detector is not ready");
        const count = detector
          ? detector.detectForVideo(data.frame, data.timestamp).detections
              .length
          : fallback!.detectForVideo(data.frame, data.timestamp).faceLandmarks
              .length;
        self.postMessage({ kind: "count", count, requestId: data.requestId });
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
    fallback?.close();
    detector = undefined;
    fallback = undefined;
  }
};
