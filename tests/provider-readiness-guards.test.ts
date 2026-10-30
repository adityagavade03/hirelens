import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config, codeExecutionConfigured } from "../server/config";
import { interviewProviderReadiness } from "../scripts/provider-readiness";

const original = { ...config };
beforeEach(() => {
  Object.assign(config, {
    production: true,
    judgeUrl: "https://private-executor.example.test",
    judgeKey: "synthetic-private-key",
    judgeHeader: "X-Auth-Token",
    rapidHost: "",
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("Readiness must never call providers");
  });
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});

it.each([
  ["production loopback HTTP", { judgeUrl: "http://127.0.0.1:2358" }],
  ["production localhost HTTP", { judgeUrl: "http://localhost:2358" }],
  ["missing private key", { judgeKey: "" }],
  ["blank private key", { judgeKey: "   " }],
  ["credential CRLF", { judgeKey: "synthetic\r\nX-Injected: yes" }],
  ["credential NUL", { judgeKey: "synthetic\0key" }],
  ["credential tab", { judgeKey: "synthetic\tkey" }],
  ["credential DEL", { judgeKey: "synthetic\x7fkey" }],
  ["oversized credential", { judgeKey: "x".repeat(4097) }],
  ["header injection", { judgeHeader: "X-Auth-Token\r\nX-Injected" }],
] as const)("does not report rejected runtime configuration as externally ready: %s", (_label, patch) => {
  Object.assign(config, patch);
  expect(codeExecutionConfigured()).toBe(false);
  const report = interviewProviderReadiness(config).execution;
  expect(report.mode).toBe("invalid");
  expect(report.configuredForExternalUse).toBe(false);
  expect(report.issues.length).toBeGreaterThan(0);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  "https://user:secret@ce.judge0.com",
  "https://ce.judge0.com?token=secret",
  "https://ce.judge0.com#secret",
])("does not hide malformed public endpoint configuration behind the practice-only label: %s", (judgeUrl) => {
  Object.assign(config, {
    production: false,
    host: "127.0.0.1",
    origin: "http://localhost:5173",
    judgeUrl,
  });
  expect(codeExecutionConfigured()).toBe(false);
  const report = interviewProviderReadiness(config).execution;
  expect(report.mode).toBe("invalid");
  expect(report.configuredForExternalUse).toBe(false);
  expect(JSON.stringify(report)).not.toContain(judgeUrl);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps valid local public practice distinct from authenticated private setup", () => {
  Object.assign(config, {
    production: false,
    host: "127.0.0.1",
    origin: "http://localhost:5173",
    judgeUrl: "https://ce.judge0.com",
    judgeKey: "",
  });
  expect(codeExecutionConfigured()).toBe(true);
  expect(interviewProviderReadiness(config).execution).toMatchObject({
    mode: "public-practice-only",
    configuredForExternalUse: false,
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("marks valid authenticated HTTPS private setup configured but unverified without printing credentials", () => {
  expect(codeExecutionConfigured()).toBe(true);
  const report = interviewProviderReadiness(config).execution;
  expect(report).toEqual({
    mode: "private-configured-unverified",
    configuredForExternalUse: true,
    issues: [],
  });
  expect(JSON.stringify(report)).not.toContain(config.judgeKey);
  expect(JSON.stringify(report)).not.toContain(config.judgeUrl);
  expect(fetch).not.toHaveBeenCalled();
});
