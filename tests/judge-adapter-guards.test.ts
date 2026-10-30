import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  codeExecutionConfigured,
  config,
  serviceStatus,
} from "../server/config";
import { executeCode, executionLanguages } from "../server/providers";

// Synthetic transport fixtures only: these tests never contact an execution provider.
const original = { ...config };
const languages = [{ id: 72, name: "Python (3.12.0)" }];
const example = [{ input: "2 3", output: "5", hidden: false }];
beforeEach(() => {
  Object.assign(config, {
    production: true,
    judgeUrl: "https://private-executor.example.test",
    judgeKey: "synthetic-private-key",
    judgeHeader: "X-Auth-Token",
    rapidHost: "",
  });
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});

it.each([
  ["missing endpoint", { judgeUrl: "" }],
  ["insecure production endpoint", { judgeUrl: "http://127.0.0.1:2358" }],
  ["non-HTTP endpoint", { judgeUrl: "file:///private/judge" }],
  ["embedded user", { judgeUrl: "https://user@private-executor.example.test" }],
  ["embedded password", { judgeUrl: "https://user:secret@private-executor.example.test" }],
  ["query", { judgeUrl: "https://private-executor.example.test?token=secret" }],
  ["fragment", { judgeUrl: "https://private-executor.example.test#secret" }],
  ["missing credentials", { judgeKey: "" }],
  ["blank credentials", { judgeKey: "   " }],
  ["header injection in credentials", { judgeKey: "secret\r\nX-Injected: yes" }],
  ["NUL in credentials", { judgeKey: "secret\0token" }],
  ["oversized credentials", { judgeKey: "x".repeat(4097) }],
  ["invalid header", { judgeHeader: "X-Auth-Token\r\nX-Injected" }],
] as const)("rejects %s before attempting any provider request", async (_name, patch) => {
  Object.assign(config, patch);
  const fetch = vi.spyOn(globalThis, "fetch");
  expect(codeExecutionConfigured()).toBe(false);
  expect(serviceStatus().code).toBe(false);
  await expect(executeCode("python", "print(5)", example)).rejects.toMatchObject({
    status: 503,
    code: "CONFIGURATION_NEEDED",
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  "https://user:secret@ce.judge0.com",
  "https://ce.judge0.com?token=secret",
  "https://ce.judge0.com#secret",
])("does not bypass endpoint validation for an otherwise local public demo: %s", async (judgeUrl) => {
  Object.assign(config, {
    production: false,
    host: "127.0.0.1",
    origin: "http://localhost:5173",
    judgeUrl,
  });
  const fetch = vi.spyOn(globalThis, "fetch");
  expect(codeExecutionConfigured()).toBe(false);
  await expect(executionLanguages()).rejects.toMatchObject({ status: 503 });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([0, -1, 3.5])("rejects invalid advertised compiler ID %s", async (id) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify([{ id, name: "Python (3.12.0)" }])),
  );
  await expect(executionLanguages()).rejects.toMatchObject({ status: 502 });
});

function runner(result: unknown, token: unknown = "synthetic-submission-token") {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/languages"))
      return new Response(JSON.stringify(languages));
    if (init?.method === "POST")
      return new Response(JSON.stringify({ token }));
    return new Response(JSON.stringify(result));
  });
}

it.each([null, {}, { id: "3" }, { id: 0 }, { id: -1 }, { id: 3.5 }, { id: 13 }, { id: 999 }])(
  "rejects malformed or infrastructure-only execution status %j",
  async (status) => {
    runner({ status, stdout: Buffer.from("5").toString("base64") });
    await expect(executeCode("python", "print(5)", example)).rejects.toMatchObject({
      status: 502,
      code: "INVALID_EXECUTION_RESULT",
    });
  },
);

it.each([null, 123, "", "../other-resource", "token?secret", "x".repeat(201)])(
  "rejects malformed submission token %j without polling",
  async (token) => {
    const fetch = runner({ status: { id: 3 } }, token);
    await expect(executeCode("python", "print(5)", example)).rejects.toMatchObject({
      status: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it("returns canonical verdicts and drops hidden diagnostics and invalid resource metadata", async () => {
  const secret = "HIDDEN_INPUT_AND_EXPECTED_OUTPUT";
  runner({
    status: { id: 4, description: secret },
    stdout: Buffer.from(secret).toString("base64"),
    stderr: Buffer.from(secret).toString("base64"),
    compile_output: Buffer.from(secret).toString("base64"),
    time: secret,
    memory: secret,
  });
  const result = await executeCode("python", "print(5)", [
    { input: secret, output: secret, hidden: true },
  ]);
  expect(result).toEqual([
    { status: "Wrong Answer", statusId: 4, passed: false, hidden: true },
  ]);
  expect(JSON.stringify(result)).not.toContain(secret);
  for (const key of ["input", "expectedOutput", "stdout", "stderr", "compileOutput"])
    expect(result[0]).not.toHaveProperty(key);
});

it.each(["not valid JSON", JSON.stringify({ secret: "x".repeat(2 * 1024 * 1024) })])(
  "rejects unreadable or oversized provider bodies without echoing their content",
  async (body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    const error = await executionLanguages().catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 502, code: "PROVIDER_ERROR" });
    expect(String(error)).not.toContain(body.slice(0, 100));
  },
);

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

it("does not follow a redirect or forward the runner credential to a different server", async () => {
  let received = 0;
  const destination = createServer((_request, response) => {
    received++;
    response.end(JSON.stringify(languages));
  });
  const target = await listen(destination);
  const source = createServer((_request, response) => {
    response.writeHead(302, { Location: `${target}/languages` });
    response.end();
  });
  try {
    Object.assign(config, { production: false, judgeUrl: await listen(source) });
    await expect(executionLanguages()).rejects.toMatchObject({
      status: 502,
      code: "PROVIDER_ERROR",
    });
    expect(received).toBe(0);
  } finally {
    await Promise.all([close(source), close(destination)]);
  }
});
