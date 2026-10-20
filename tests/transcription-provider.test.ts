import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config } from "../server/config";
import { transcribeAudio, transcriptionErrors } from "../server/providers";

let previous: Pick<typeof config, "sttUrl" | "sttKey" | "sttModel">;
beforeEach(() => {
  previous = {
    sttUrl: config.sttUrl,
    sttKey: config.sttKey,
    sttModel: config.sttModel,
  };
  Object.assign(config, {
    sttUrl: "http://127.0.0.1:8765/v1",
    sttKey: "test-only-key",
    sttModel: "fixture",
  });
});
afterEach(() => {
  Object.assign(config, previous);
  vi.unstubAllGlobals();
});
const audio = Buffer.from("test audio");

it.each(Object.keys(transcriptionErrors))(
  "exposes an actionable %s error without trusting provider text",
  async (code) => {
    const status =
      code === "AUDIO_TOO_LONG" ? 413 : code === "INVALID_AUDIO" ? 400 : 422;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: {
                code,
                message: "Secret provider diagnostics must not be exposed",
                diagnostics: { arbitrary: "private" },
              },
            }),
            { status },
          ),
      ),
    );
    await expect(transcribeAudio(audio, "audio/webm")).rejects.toMatchObject({
      status,
      code,
      message: transcriptionErrors[code],
    });
  },
);

it("rejects unknown error codes and oversized errors without leaking provider content", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { code: "OTHER", message: "private" } }),
        { status: 422 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { code: "NO_AUDIO_TRACK", message: "private".repeat(3000) },
        }),
        { status: 422 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  for (let attempt = 0; attempt < 2; attempt++)
    await expect(transcribeAudio(audio, "audio/webm")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message:
        "External service returned HTTP 422. Check the provider configuration.",
    });
});

it("reports a busy service without describing silence or a successful transcript", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("private", { status: 429 })),
  );
  await expect(transcribeAudio(audio, "audio/webm")).rejects.toMatchObject({
    code: "SPEECH_BUSY",
    status: 503,
  });
});

it.each([401, 429, 500])(
  "releases unread response bodies after HTTP %s",
  async (status) => {
    const cancelled = vi.fn();
    const body = new ReadableStream({ cancel: cancelled });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status })),
    );
    await expect(transcribeAudio(audio, "audio/webm")).rejects.toBeInstanceOf(
      Error,
    );
    expect(cancelled).toHaveBeenCalledOnce();
  },
);

it("accepts bounded compatible transcripts and prevents credential-bearing redirects", async () => {
  const fetcher = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          text: " I tested the function. ",
          diagnostics: { warnings: [] },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(transcribeAudio(audio, "audio/webm")).resolves.toBe(
    "I tested the function.",
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error" });
});

it("rejects an oversized successful provider response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ text: "x".repeat(140000) })),
    ),
  );
  await expect(transcribeAudio(audio, "audio/webm")).rejects.toMatchObject({
    code: "PROVIDER_ERROR",
  });
});
