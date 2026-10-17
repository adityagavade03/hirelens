import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  trainReviewResearch,
  researchDatasetSchema,
  inspectResearchData,
} from "../shared/integrity-research.js";
import { z } from "zod";

const [input, output, reportOutput] = process.argv.slice(2);
const saveNew = (path: string, value: unknown) =>
  writeFile(resolve(path), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
const loadDataset = async (path: string) => {
  const file = resolve(path);
  if ((await stat(file)).size > 50_000_000)
    throw new Error("Dataset exceeds the 50 MB research limit.");
  const raw = await readFile(file, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 50_000_000)
    throw new Error("Dataset exceeds the 50 MB research limit.");
  return { raw, data: JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown };
};
try {
  if (input === "--schema") {
    console.log(JSON.stringify(z.toJSONSchema(researchDatasetSchema), null, 2));
  } else if (input === "--template" && output) {
    await saveNew(output, {
      schemaVersion: 2,
      purpose: "research-only-human-follow-up",
      protocolReference: "replace-with-approved-protocol-id",
      collectionProtocol:
        "Replace this placeholder with your actual consent, retention, withdrawal, de-identification, independent review and frozen-holdout procedures before collecting any sessions.",
      rows: [],
    });
    console.log(
      "Saved an EMPTY collection template. It contains no participants, consent attestations, labels or training examples. Read docs/INTEGRITY-RESEARCH-PROTOCOL.md before collecting data.",
    );
  } else if (input === "--validate" && output) {
    const { raw, data } = await loadDataset(output);
    const report = {
      ...inspectResearchData(data),
      datasetSha256: createHash("sha256").update(raw).digest("hex"),
    };
    if (reportOutput) await saveNew(reportOutput, report);
    console.log(JSON.stringify(report, null, 2));
    if (!report.readyToTrain) process.exitCode = 2;
  } else if (!input || !output || input.startsWith("--")) {
    console.error(
      "Usage:\n  npm run integrity:research -- --schema\n  npm run integrity:research -- --template empty-dataset.json\n  npm run integrity:research -- --validate consented-reviewed-dataset.json [new-preflight-report.json]\n  npm run integrity:research -- consented-reviewed-dataset.json new-research-model.json\nNo real training data is bundled. Consent and reviewer provenance must be checked by a human. The output is never activated in HireLens.",
    );
    process.exitCode = 1;
  } else {
    const { raw, data } = await loadDataset(input);
    const result = trainReviewResearch(data);
    const implementation = await readFile(
      new URL("../shared/integrity-research.ts", import.meta.url),
      "utf8",
    );
    await saveNew(output, {
      ...result,
      createdAt: new Date().toISOString(),
      datasetSha256: createHash("sha256").update(raw).digest("hex"),
      implementationSha256: createHash("sha256")
        .update(implementation)
        .digest("hex"),
    });
    console.log(
      `Saved research artifact for ${result.trainedRows} training / ${result.heldOutRows} held-out interviews. It is not active in HireLens.`,
    );
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
