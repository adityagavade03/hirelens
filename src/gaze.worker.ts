import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

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
      const reply = (features: number[] | null) =>
        self.postMessage({
          kind: "sample",
          features,
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
          reply(null);
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
          const minX = Math.min(...eye.map((p) => p.x)),
            maxX = Math.max(...eye.map((p) => p.x));
          const minY = Math.min(...eye.map((p) => p.y)),
            maxY = Math.max(...eye.map((p) => p.y));
          const width = (maxX - minX) * frame.width,
            height = (maxY - minY) * frame.height;
          // Closed, tiny or clipped eyes have no usable estimate.
          if (
            width < 12 ||
            height < 3 ||
            height / width < 0.1 ||
            minX < 0 ||
            maxX > 1 ||
            minY < 0 ||
            maxY > 1
          ) {
            reply(null);
            return;
          }
          context.drawImage(
            frame,
            minX * frame.width,
            minY * frame.height,
            width,
            height,
            0,
            0,
            10,
            4,
          );
          const pixels = context.getImageData(0, 0, 10, 4).data;
          const gray = Array.from(
            { length: 40 },
            (_, i) =>
              (pixels[i * 4] * 0.299 +
                pixels[i * 4 + 1] * 0.587 +
                pixels[i * 4 + 2] * 0.114) /
              255,
          );
          const mean = gray.reduce((n, v) => n + v, 0) / gray.length;
          const contrast = Math.sqrt(
            gray.reduce((n, v) => n + (v - mean) ** 2, 0) / gray.length,
          );
          if (contrast < 0.015) {
            reply(null);
            return;
          }
          features.push(
            ...gray.map((v) => (v - mean) / Math.max(0.05, contrast)),
          );
        }
        reply(features);
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
