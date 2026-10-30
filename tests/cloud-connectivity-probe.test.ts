import { expect, it, vi } from "vitest";
import { strictCloudAiProbe } from "../scripts/cloud-connectivity-probe.mjs";

it("requires strict schema mode before any provider call", async () => {
  const call = vi.fn();
  await expect(
    strictCloudAiProbe({ strict: false, call, latestFailure: () => ({}) }),
  ).rejects.toThrow("strict JSON schema");
  expect(call).not.toHaveBeenCalled();
});
it("requires a real validated ok result and records each bounded generation retry", async () => {
  const call = vi
    .fn()
    .mockRejectedValueOnce(new Error("private provider response"))
    .mockRejectedValueOnce(new Error("private provider response"))
    .mockResolvedValue({ status: "ok" });
  const pause = vi.fn(async () => {}),
    onAttempt = vi.fn();
  const result = await strictCloudAiProbe({
    strict: true,
    call,
    latestFailure: () => ({ status: 400, code: "json_validate_failed" }),
    pause,
    onAttempt,
  });
  expect(result.status).toBe("ok");
  expect(call).toHaveBeenCalledTimes(3);
  expect(pause).toHaveBeenCalledTimes(2);
  expect(result.attempts.map((a) => a.passed)).toEqual([false, false, true]);
  expect(JSON.stringify(onAttempt.mock.calls)).not.toContain(
    "private provider response",
  );
});
it.each([400, 401, 403, 429, 500, 503])(
  "does not retry unrelated HTTP %i failures",
  async (status) => {
    const call = vi.fn().mockRejectedValue(new Error("provider error")),
      pause = vi.fn(async () => {});
    await expect(
      strictCloudAiProbe({
        strict: true,
        call,
        latestFailure: () => ({
          status,
          code: status === 400 ? "invalid_schema" : "json_validate_failed",
        }),
        pause,
      }),
    ).rejects.toThrow("no fallback");
    expect(call).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  },
);
it("fails after exactly three generation errors without inventing success", async () => {
  const call = vi.fn().mockRejectedValue(new Error("generation failed")),
    pause = vi.fn(async () => {});
  await expect(
    strictCloudAiProbe({
      strict: true,
      call,
      latestFailure: () => ({ status: 400, code: "json_validate_failed" }),
      pause,
    }),
  ).rejects.toThrow("no fallback");
  expect(call).toHaveBeenCalledTimes(3);
  expect(pause).toHaveBeenCalledTimes(2);
});
it("rejects invalid resolved content even on HTTP 200", async () => {
  const call = vi.fn().mockResolvedValue({ status: "wrong" });
  await expect(
    strictCloudAiProbe({
      strict: true,
      call,
      latestFailure: () => ({ status: 200 }),
    }),
  ).rejects.toThrow("no fallback");
  expect(call).toHaveBeenCalledTimes(1);
});
it("does not start another request after its overall deadline", async () => {
  let time = 1000;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => time);
  const call = vi.fn().mockRejectedValue(new Error("generation failed"));
  try {
    await expect(
      strictCloudAiProbe({
        strict: true,
        call,
        latestFailure: () => ({ status: 400, code: "json_validate_failed" }),
        pause: async () => {
          time += 90001;
        },
      }),
    ).rejects.toThrow("deadline expired");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(30000);
  } finally {
    clock.mockRestore();
  }
});
