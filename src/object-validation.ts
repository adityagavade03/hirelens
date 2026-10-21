/** Dev-only, manual local benchmark. No camera, network upload, recording or interview API. */
import {
  sanitizeCameraObjects,
  sanitizeObjectFrameQuality,
  type CameraObject,
  type ObjectFrameQuality,
} from "../shared/object-detection";

type Result = {
  caseId: string;
  model: "balanced" | "detail";
  expectedLabels: string[];
  detections: CameraObject[];
  quality: ObjectFrameQuality;
  inferenceMs: number;
  expectedLabelsFound: string[];
  expectedLabelsMissed: string[];
};
const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const form = byId<HTMLFormElement>("comparison-form"),
  photo = byId<HTMLImageElement>("photo"),
  status = byId("status"),
  results = byId("results"),
  boxes = document.getElementById("boxes") as unknown as SVGSVGElement,
  compare = byId<HTMLButtonElement>("compare"),
  download = byId<HTMLButtonElement>("download");
let objectUrl: string | undefined,
  running = false,
  generation = 0;
let report: Result[] = [];
function clean() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined;
  photo.hidden = true;
  photo.removeAttribute("src");
  boxes.replaceChildren();
  compare.disabled = true;
}
function selectPhoto(url: string, file = false) {
  clean();
  if (file) objectUrl = url;
  photo.onload = () => {
    photo.hidden = false;
    compare.disabled = false;
    status.textContent =
      "Photo ready. Review visible labels, then compare. No model has run on this photo yet.";
  };
  photo.onerror = () => {
    clean();
    status.textContent =
      "Photo could not be decoded. Run asset setup or select another image.";
  };
  photo.src = url;
  boxes.replaceChildren();
}
byId<HTMLButtonElement>("load-sample").onclick = () => {
  const name = byId<HTMLSelectElement>("sample").value;
  if (!["multi_objects", "cats_and_dogs"].includes(name)) return;
  byId<HTMLInputElement>("case-id").value =
    `public-${name === "multi_objects" ? "desk" : "animals"}-01`;
  byId<HTMLInputElement>("expected").value = "";
  selectPhoto(`/vendor/mediapipe/test-fixtures/${name}.jpg`);
};
byId<HTMLInputElement>("local-file").onchange = (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  if (
    file.size > 20 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    status.textContent =
      "Choose a JPEG, PNG or WebP photo no larger than 20 MB.";
    return;
  }
  byId<HTMLInputElement>("case-id").value = "local-case-01";
  byId<HTMLInputElement>("expected").value = "";
  selectPhoto(URL.createObjectURL(file), true);
};
byId<HTMLButtonElement>("clear").onclick = () => {
  generation++;
  clean();
  report = [];
  results.textContent = "No inference has run.";
  download.disabled = true;
  byId<HTMLInputElement>("local-file").value = "";
  status.textContent = "Photo and comparison metadata cleared from this page.";
};
function infer(
  model: Result["model"],
  bitmap: ImageBitmap,
): Promise<
  Omit<
    Result,
    | "caseId"
    | "model"
    | "expectedLabels"
    | "expectedLabelsFound"
    | "expectedLabelsMissed"
  >
> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./object-detection.worker.ts", import.meta.url),
      { type: "module" },
    );
    let transferred = false,
      started = 0;
    const timer = setTimeout(
      () => finish(new Error("Model timed out on this device.")),
      45000,
    );
    const finish = (error?: Error, result?: Parameters<typeof resolve>[0]) => {
      clearTimeout(timer);
      worker.terminate();
      if (!transferred) bitmap.close();
      if (error) reject(error);
      else resolve(result!);
    };
    worker.onerror = () => finish(new Error("Local model could not start."));
    worker.onmessage = ({ data }) => {
      if (data.kind === "error")
        return finish(
          new Error(
            "Local model failed. Check installed assets and browser support.",
          ),
        );
      if (data.kind === "ready") {
        started = performance.now();
        worker.postMessage(
          {
            kind: "frame",
            frame: bitmap,
            timestamp: started,
            requestId: 1,
            epoch: 0,
            activityEpoch: 0,
            cameraId: "public-photo",
            capturedAt: Date.now(),
            active: false,
          },
          [bitmap],
        );
        transferred = true;
      } else if (data.kind === "detections")
        finish(undefined, {
          detections: sanitizeCameraObjects(data.detections),
          quality: sanitizeObjectFrameQuality(data.quality),
          inferenceMs: Math.round(performance.now() - started),
        });
    };
    worker.postMessage({
      kind: "init",
      model: new URL(
        `/vendor/mediapipe/efficientdet_${model === "detail" ? "lite2" : "lite0"}.tflite`,
        location.href,
      ).href,
      wasm: new URL("/vendor/mediapipe/wasm", location.href).href,
    });
  });
}
function draw(items: CameraObject[]) {
  boxes.replaceChildren();
  boxes.setAttribute(
    "viewBox",
    `0 0 ${photo.naturalWidth} ${photo.naturalHeight}`,
  );
  for (const item of items) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [key, value] of Object.entries({
      x: item.box.x * photo.naturalWidth,
      y: item.box.y * photo.naturalHeight,
      width: item.box.width * photo.naturalWidth,
      height: item.box.height * photo.naturalHeight,
    }))
      rect.setAttribute(key, String(value));
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "#e2a900");
    rect.setAttribute("stroke-width", "3");
    boxes.append(rect);
  }
}
form.onsubmit = async (event) => {
  event.preventDefault();
  if (
    running ||
    !photo.complete ||
    !photo.naturalWidth ||
    !form.reportValidity()
  )
    return;
  running = true;
  const version = generation;
  for (const input of form.querySelectorAll<
    HTMLInputElement | HTMLButtonElement | HTMLSelectElement
  >("input,button,select"))
    input.disabled = true;
  const caseId = byId<HTMLInputElement>("case-id").value;
  const expectedLabels = [
    ...new Set(
      byId<HTMLInputElement>("expected")
        .value.toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[a-z][a-z0-9 -]{0,63}$/.test(s)),
    ),
  ].slice(0, 20);
  const comparisons: Result[] = [];
  try {
    for (const model of ["balanced", "detail"] as const) {
      status.textContent = `Running ${model} model locally. The photo stays on this device.`;
      const frame = await createImageBitmap(photo, {
        resizeWidth: Math.round(
          photo.naturalWidth *
            Math.min(
              1,
              640 / Math.max(photo.naturalWidth, photo.naturalHeight),
            ),
        ),
        resizeHeight: Math.round(
          photo.naturalHeight *
            Math.min(
              1,
              640 / Math.max(photo.naturalWidth, photo.naturalHeight),
            ),
        ),
      });
      const output = await infer(model, frame);
      if (version !== generation) return;
      const found = new Set(output.detections.map((d) => d.label));
      comparisons.push({
        caseId,
        model,
        expectedLabels,
        ...output,
        expectedLabelsFound: expectedLabels.filter((l) => found.has(l)),
        expectedLabelsMissed: expectedLabels.filter((l) => !found.has(l)),
      });
      results.textContent = JSON.stringify(comparisons, null, 2);
      draw(output.detections);
    }
    report = [...report, ...comparisons].slice(-40);
    status.textContent =
      "Both local models completed. Boxes show the last model's estimates. Results do not establish phone/book or real-camera accuracy.";
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Comparison failed.";
  } finally {
    running = false;
    for (const input of form.querySelectorAll<
      HTMLInputElement | HTMLButtonElement | HTMLSelectElement
    >("input,button,select"))
      input.disabled = false;
    download.disabled = !report.length;
    compare.disabled = !photo.naturalWidth;
  }
};
download.onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          schema: 1,
          scope:
            "manual local photo comparison; no image data; not physical accuracy validation",
          threshold: 0.5,
          results: report,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "hirelens-object-comparison.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("pagehide", clean, { once: true });
