import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { config } from "../server/config";
import { feedbackSchema, llm, transcribeAudio } from "../server/providers";
import { screeningSchema } from "../server/screening";
import {
  assessmentSchema,
  assessInterviewEvidence,
} from "../server/assessment";
import { reportQualityCases } from "../scripts/ai-quality-cases";

const original = { ...config };
const baseUrl = "https://api.groq.com/openai/v1";
const secret = "fixture-only-hosted-provider-key";
beforeEach(() => {
  Object.assign(config, {
    llmUrl: baseUrl,
    llmKey: secret,
    llmModel: "openai/gpt-oss-20b",
    llmSchema: true,
    llmTimeout: 45000,
    sttUrl: baseUrl,
    sttKey: secret,
    sttModel: "whisper-large-v3",
  });
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("No live provider requests in tests"),
  );
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});

it("keeps the production screening, answer and report schemas compatible with strict hosted output", () => {
  function checkObjects(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) checkObjects(child);
      return;
    }
    const schema = node as Record<string, any>;
    if (schema.type === "object") {
      expect(schema.additionalProperties).toBe(false);
      expect(new Set(schema.required)).toEqual(
        new Set(Object.keys(schema.properties)),
      );
    }
    for (const child of Object.values(schema)) checkObjects(child);
  }
  for (const schema of [screeningSchema, feedbackSchema, assessmentSchema])
    checkObjects(z.toJSONSchema(schema));
});

it("uses a Groq-compatible chat endpoint, bearer authentication and a closed strict JSON schema", async () => {
  const schema = z.object({
    result: z.object({
      explanation: z.string().max(200),
      score: z.number().min(0).max(5).nullable(),
    }),
    limitations: z.array(z.string()).min(1),
  });
  const synthetic = {
    result: { explanation: "Synthetic answer only.", score: null },
    limitations: ["No hiring evidence."],
  };
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(synthetic),
              reasoning: "Provider metadata is not assessment content.",
            },
          },
        ],
      }),
    ),
  );
  await expect(
    llm(
      "Evaluate this synthetic answer.",
      { answer: "Synthetic example" },
      schema,
    ),
  ).resolves.toEqual(synthetic);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(`${baseUrl}/chat/completions`);
  expect(new Headers(options?.headers).get("authorization")).toBe(
    `Bearer ${secret}`,
  );
  const body = JSON.parse(String(options?.body));
  expect(body.model).toBe("openai/gpt-oss-20b");
  expect(body.response_format).toMatchObject({
    type: "json_schema",
    json_schema: { strict: true },
  });
  const jsonSchema = body.response_format.json_schema.schema;
  expect(jsonSchema.additionalProperties).toBe(false);
  expect(jsonSchema.required).toEqual(["result", "limitations"]);
  expect(jsonSchema.properties.result.additionalProperties).toBe(false);
  expect(jsonSchema.properties.result.required).toEqual([
    "explanation",
    "score",
  ]);
  expect(
    JSON.stringify(jsonSchema.properties.result.properties.score),
  ).toContain('"null"');
  expect(body.messages[1].content).toBe(
    JSON.stringify({ untrustedEvidence: { answer: "Synthetic example" } }),
  );
  expect(String(options?.body)).not.toContain(secret);
});

it("rejects malformed hosted assessments rather than saving a fabricated success", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"score":"invented"}' } }],
      }),
    ),
  );
  await expect(
    llm("Synthetic fixture", {}, z.object({ score: z.number() })),
  ).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
});

it("sends grounded report metrics without overlapping object-union keys rejected by Groq", async () => {
  const fixture = structuredClone(
    reportQualityCases.find((row) => row.id === "grounded-strong-answers")!,
  );
  vi.mocked(fetch).mockImplementationOnce(async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    const properties = request.response_format.json_schema.schema.properties;
    for (const name of ["technical", "problemSolving", "communication"]) {
      // Groq rejects identical required-key sets in object anyOf alternatives.
      expect(properties[name].anyOf).toBeUndefined();
      expect(properties[name].type).toBe("object");
      expect(properties[name].properties.evidenceRefs.items.enum).toContain(
        "answer:hash",
      );
    }
    const metric = {
      evidenceRefs: ["answer:hash"],
      explanation:
        "The supplied answer explains lookup complexity and collisions.",
      score: 4,
    };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                technical: metric,
                problemSolving: metric,
                communication: metric,
                summary: "Synthetic supplied evidence only.",
                strengths: ["Explains hash maps"],
                weaknesses: [],
                improvements: [],
                recommendation: "Candidate",
                recommendationReason: "Subject to human review.",
                limitations: ["Small synthetic sample."],
              }),
            },
          },
        ],
      }),
    );
  });
  const result = await assessInterviewEvidence(
    fixture.interview,
    [...fixture.submissions],
    [...fixture.transcript],
  );
  expect(result.technical.evidenceRefs).toEqual(["answer:hash"]);
  expect(result.coding?.score).toBe(75);
});

it.each([
  ["audio/wav", "answer.wav"],
  ["audio/ogg", "answer.ogg"],
  ["audio/mpeg", "answer.mp3"],
  ["audio/flac", "answer.flac"],
  ["audio/webm;codecs=opus", "answer.webm"],
  ["audio/mp4", "answer.m4a"],
  ["video/mp4", "answer.mp4"],
])(
  "keeps %s audio and its filename aligned in the hosted transcription request",
  async (mime, filename) => {
    const syntheticAudio = Buffer.from(
      "synthetic multipart fixture, not recorded speech",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: " Synthetic transcription. " })),
    );
    await expect(transcribeAudio(syntheticAudio, mime)).resolves.toBe(
      "Synthetic transcription.",
    );
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${baseUrl}/audio/transcriptions`);
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    const headers = new Headers(options?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${secret}`);
    // fetch generates the multipart boundary; manually setting Content-Type would break it.
    expect(headers.has("content-type")).toBe(false);
    const form = options?.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3");
    const file = form.get("file") as File;
    expect(file.name).toBe(filename);
    expect(file.type).toBe(mime);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(syntheticAudio);
  },
);
