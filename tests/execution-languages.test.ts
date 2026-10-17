import { afterEach, expect, it, vi } from "vitest";
import {
  config,
  serviceStatus,
  publicJudge0Configured,
} from "../server/config";
import { executeCode, executionLanguages } from "../server/providers";
import { safeProblem } from "../server/coding";
import { codeTokens } from "../server/similarity";
import { problems } from "../server/problems";

const original = { ...config };
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});

const advertisedLanguages = [
  { id: 1, name: "C# (Mono 6.6)" },
  { id: 2, name: "Objective-C (Clang 7.0.1)" },
  { id: 3, name: "C (GCC 7.4.0)" },
  { id: 4, name: "C++ (GCC 7.4.0)" },
  { id: 51, name: "C (GCC 12.2.0)" },
  { id: 52, name: "C++ (GCC 12.2.0)" },
  { id: 61, name: "JavaScript (Node.js 20.0.0)" },
  { id: 62, name: "Java (OpenJDK 17.0.0)" },
  { id: 71, name: "Python (2.7.17)" },
  { id: 72, name: "Python (3.12.0)" },
];

it("discovers C/C++ compiler IDs without confusing language names or assuming provider IDs", async () => {
  config.judgeUrl = "https://judge.example.test";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(advertisedLanguages)),
  );
  expect(await executionLanguages()).toEqual([
    { key: "python", id: 72, name: "Python (3.12.0)" },
    { key: "javascript", id: 61, name: "JavaScript (Node.js 20.0.0)" },
    { key: "java", id: 62, name: "Java (OpenJDK 17.0.0)" },
    { key: "c", id: 51, name: "C (GCC 12.2.0)" },
    { key: "cpp", id: 52, name: "C++ (GCC 12.2.0)" },
  ]);
});

it.each([
  ["c", 51],
  ["cpp", 52],
] as const)(
  "submits %s source and stdin to the isolated runner and protects hidden output",
  async (language, compiler) => {
    config.judgeUrl = "https://judge.example.test";
    config.judgeKey = "private-test-key";
    config.judgeHeader = "X-Auth-Token";
    const submitted: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      expect((options?.headers as Record<string, string>)["X-Auth-Token"]).toBe(
        "private-test-key",
      );
      if (String(url).endsWith("/languages"))
        return new Response(JSON.stringify(advertisedLanguages));
      if (options?.method === "POST") {
        submitted.push(JSON.parse(String(options.body)));
        return new Response(JSON.stringify({ token: "execution-token" }));
      }
      return new Response(
        JSON.stringify({
          status: { id: 3, description: "Accepted" },
          stdout: Buffer.from("42\n").toString("base64"),
          stderr: Buffer.from("private details").toString("base64"),
          compile_output: Buffer.from("private compiler output").toString(
            "base64",
          ),
          time: "0.001",
          memory: 1024,
        }),
      );
    });
    const source = "int main(void) { return 0; }";
    const result = await executeCode(language, source, [
      { input: "20 22", output: "42", hidden: false },
      { input: "private test", output: "42", hidden: true },
    ]);
    expect(submitted).toHaveLength(2);
    expect(submitted[0]).toMatchObject({
      language_id: compiler,
      enable_network: false,
      cpu_time_limit: 2,
      wall_time_limit: 5,
      memory_limit: 128000,
    });
    expect(Buffer.from(submitted[0].source_code, "base64").toString()).toBe(
      source,
    );
    expect(Buffer.from(submitted[0].stdin, "base64").toString()).toBe("20 22");
    expect(result[0]).toMatchObject({ passed: true, stdout: "42\n" });
    expect(result[1]).toMatchObject({ passed: true, hidden: true });
    expect(result[1]).not.toHaveProperty("stdout");
    expect(result[1]).not.toHaveProperty("stderr");
    expect(result[1]).not.toHaveProperty("compileOutput");
  },
);

it("does not submit code for a compiler absent from the connected service", async () => {
  config.judgeUrl = "https://judge.example.test";
  const calls = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify([{ id: 99, name: "C# (Mono 6.6)" }])),
    );
  await expect(executeCode("c", "int main(void) {}", [])).rejects.toMatchObject(
    { status: 400 },
  );
  expect(calls).toHaveBeenCalledTimes(1);
});

it("polls the submission's cloud region and does not leak it to later submissions", async () => {
  config.judgeUrl = "https://judge.example.test";
  config.judgeKey = "private-test-key";
  config.judgeHeader = "X-Auth-Token";
  const regions = ["us-east-1", "eu-central-1", null];
  let submissions = 0;
  const polls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const headers = new Headers(options?.headers);
    expect(headers.get("X-Auth-Token")).toBe("private-test-key");
    if (String(url).endsWith("/languages"))
      return new Response(JSON.stringify(advertisedLanguages));
    if (options?.method === "POST") {
      expect(headers.has("X-Judge0-Region")).toBe(false);
      const id = submissions++;
      return new Response(JSON.stringify({ token: `token-${id}` }), {
        headers: regions[id] ? { "X-Judge0-Region": regions[id] } : {},
      });
    }
    const token = String(url).match(/\/submissions\/(token-(\d+))\?/)!;
    polls.push(token[1]);
    expect(headers.get("X-Judge0-Region")).toBe(regions[Number(token[2])]);
    return new Response(
      JSON.stringify({ status: { id: 3, description: "Accepted" } }),
    );
  });
  const results = await executeCode("c", "int main(void) { return 0; }", [
    { input: "first", hidden: false },
    { input: "second", hidden: false },
    { input: "third", hidden: false },
  ]);
  expect(results.every((result) => result.passed)).toBe(true);
  expect(polls).toEqual(["token-0", "token-1", "token-2"]);
});

it("labels the official public demo and blocks hiring execution before sending source", async () => {
  Object.assign(config, {
    judgeUrl: "https://ce.judge0.com",
    production: false,
    host: "127.0.0.1",
    origin: "http://localhost:5173",
  });
  expect(serviceStatus()).toMatchObject({ code: true, codePublicDemo: true });
  config.origin = "http://provider-review.localhost:5174";
  expect(serviceStatus().code).toBe(true);
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(
    executeCode("c", "private hiring source", []),
  ).rejects.toMatchObject({ status: 403 });
  expect(fetch).not.toHaveBeenCalled();
  config.judgeUrl = "https://ce.judge0.com.example.test";
  expect(publicJudge0Configured()).toBe(false);
});

it.each([
  { production: true },
  { host: "0.0.0.0" },
  { origin: "https://hirelens.example.test" },
  { origin: "http://attackerlocalhost:5174" },
  { judgeUrl: "http://ce.judge0.com" },
])(
  "rejects public demo use outside local HTTPS practice (%j)",
  async (change) => {
    Object.assign(config, {
      judgeUrl: "https://ce.judge0.com",
      production: false,
      host: "127.0.0.1",
      origin: "http://localhost:5173",
      ...change,
    });
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(serviceStatus()).toMatchObject({
      code: false,
      codePublicDemo: true,
    });
    await expect(
      executeCode("c", "sample source", [], "practice"),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("gives historical problem snapshots C/C++ starters without mutating saved questions or revealing tests", () => {
  const legacy = {
    ...problems["sum-pairs"],
    starter: {
      python: "saved python",
      javascript: "saved js",
      java: "saved java",
    },
  };
  const visible = safeProblem(legacy);
  expect(visible.starter.c).toContain("int main(void)");
  expect(visible.starter.cpp).toContain("#include <iostream>");
  expect(visible.starter.python).toBe("saved python");
  expect(visible).not.toHaveProperty("tests");
  expect(legacy.starter).not.toHaveProperty("c");
});

it("keeps executable C/C++ macros in similarity evidence while excluding includes and comments", () => {
  const source =
    "#include <stdio.h>\n#define TWICE(value) ((value) * 2)\nint main(void) { return TWICE(2); } // note";
  expect(codeTokens(source, "c")).toEqual(
    codeTokens(
      source.replaceAll("TWICE", "DOUBLE").replace("stdio.h", "stdlib.h"),
      "cpp",
    ),
  );
  expect(codeTokens(source, "c")).toContain("*");
  expect(codeTokens("# Python comment\nprint(2)", "python")).toEqual([
    "print",
    "(",
    "NUM",
    ")",
  ]);
});
