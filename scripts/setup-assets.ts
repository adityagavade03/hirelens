import {
  mkdir,
  cp,
  writeFile,
  access,
  readdir,
  readFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = [
  {
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    file: "public/vendor/mediapipe/face_landmarker.task",
    minimum: 1000000,
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  },
  {
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    file: "public/vendor/mediapipe/blaze_face_short_range.tflite",
    minimum: 100000,
    sha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
  },
  {
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
    file: "public/vendor/mediapipe/efficientdet_lite0.tflite",
    minimum: 7000000,
    sha256: "4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993",
  },
  {
    url: "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
    file: ".data/ocr/eng.traineddata.gz",
    minimum: 1000000,
    sha256: "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468",
  },
];
await mkdir("public/vendor/mediapipe", { recursive: true });
await mkdir(".data/ocr", { recursive: true });
await cp(
  "node_modules/@mediapipe/tasks-vision/wasm",
  "public/vendor/mediapipe/wasm",
  { recursive: true },
);
// MediaPipe loads the Emscripten factory as a classic script normally. Vite's
// development workers are modules, where its `var` is not a global binding.
// Expose that same factory explicitly; no eval or additional CSP permission.
for (const name of await readdir("public/vendor/mediapipe/wasm")) {
  if (!name.endsWith(".js")) continue;
  const file = `public/vendor/mediapipe/wasm/${name}`;
  const source = await readFile(file, "utf8");
  if (/(?:globalThis|self)\.ModuleFactory\s*=/.test(source)) continue;
  if (!source.includes("var ModuleFactory"))
    throw new Error(
      `Unsupported MediaPipe loader: ${name}. Review the installed runtime before generating assets.`,
    );
  await writeFile(
    file,
    `${source}\nself.ModuleFactory = ModuleFactory;\nself.custom_dbg = console.warn.bind(console);\n`,
  );
}
for (const asset of assets) {
  try {
    await access(asset.file);
    console.log(`Already present: ${asset.file}`);
    continue;
  } catch {
    /* Download missing assets only. */
  }
  const response = await fetch(asset.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(`Asset download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < asset.minimum || data.length > 40000000)
    throw new Error("Unexpected asset size");
  if (
    asset.file.endsWith(".gz")
      ? data[0] !== 0x1f || data[1] !== 0x8b
      : asset.file.endsWith(".task")
        ? !data.subarray(0, 8).includes(Buffer.from("PK"))
        : data.subarray(4, 8).toString() !== "TFL3"
  )
    throw new Error("Unexpected asset format");
  if (createHash("sha256").update(data).digest("hex") !== asset.sha256)
    throw new Error(
      "Asset checksum changed. Review the upstream release before updating the pinned checksum.",
    );
  await writeFile(asset.file, data);
  console.log(
    `Saved ${asset.file} (${data.length} bytes, SHA256 ${createHash("sha256").update(data).digest("hex")})`,
  );
}
console.log(
  "Assets ready. Set RESUME_OCR_ENABLED=true, FACE_MODEL_URL=/vendor/mediapipe/blaze_face_short_range.tflite, OBJECT_MODEL_URL=/vendor/mediapipe/efficientdet_lite0.tflite and MEDIAPIPE_WASM_URL=/vendor/mediapipe/wasm in .env.",
);
