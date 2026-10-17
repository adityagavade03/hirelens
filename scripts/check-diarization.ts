import "dotenv/config";
import { readFile } from "node:fs/promises";
import { summarizeSpeakers } from "../shared/speaker-analysis.js";

try {
  const url = process.env.DIARIZATION_URL,
    key = process.env.DIARIZATION_API_KEY;
  if (!url || !key)
    throw new Error(
      "Configure DIARIZATION_URL and DIARIZATION_API_KEY after starting the actual local service.",
    );
  const file =
    process.argv[2] || ".data/diarization/sample-multiple-speakers.wav";
  const input = await readFile(file);
  if (input.length > 6 * 1024 * 1024)
    throw new Error("Sample exceeds the service's 6 MB limit.");
  const data = new FormData();
  data.append("file", new Blob([new Uint8Array(input)]), "sample.wav");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: data,
    redirect: "error",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw new Error(
      `Speaker service returned HTTP ${response.status}; no estimate claimed.`,
    );
  const result = summarizeSpeakers(await response.json());
  if (!process.argv[2] && !result.additionalSpeakerEstimate)
    throw new Error(
      "The public multiple-speaker sample did not produce two sustained speaker clusters.",
    );
  console.log(
    JSON.stringify(
      {
        result: "Real pretrained service returned a validated estimate",
        model: result.model,
        seconds: result.duration,
        rawClusters: result.clusters.length,
        sustainedClusters: result.estimatedSpeakers,
        limitations:
          "Successful inference is not an accuracy guarantee. Counts may over/under-estimate actual speakers; no identity or cheating decision is made.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
