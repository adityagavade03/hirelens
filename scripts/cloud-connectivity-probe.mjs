// A synthetic connectivity check, never an assessment-quality benchmark.
export async function strictCloudAiProbe({
  strict,
  call,
  latestFailure,
  onAttempt = () => {},
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!strict)
    throw new Error("The cloud probe requires strict JSON schema mode.");
  const attempts = [];
  const deadline = Date.now() + 90000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(
        "Strict AI connectivity deadline expired; no fallback was used.",
      );
    try {
      const value = await call(Math.min(30000, remaining));
      if (value?.status !== "ok")
        throw new Error("The synthetic AI result failed validation.");
      const entry = {
        attempt,
        providerStatus: 200,
        category: "passed",
        passed: true,
      };
      attempts.push(entry);
      onAttempt(entry);
      return { status: "ok", attempts };
    } catch {
      const failure = latestFailure();
      const retryable =
        failure.status === 400 && failure.code === "json_validate_failed";
      const entry = {
        attempt,
        providerStatus: Number.isInteger(failure.status)
          ? failure.status
          : null,
        category: retryable ? "json_validate_failed" : "other",
        passed: false,
      };
      attempts.push(entry);
      onAttempt(entry);
      if (!retryable || attempt === 3)
        throw new Error("Strict AI connectivity failed; no fallback was used.");
      await pause(1000);
    }
  }
  throw new Error("Strict AI connectivity failed.");
}
