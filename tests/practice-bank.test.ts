import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import {
  connectDatabase,
  UserModel,
  SessionModel,
  InterviewModel,
  SubmissionModel,
} from "../server/models";
import { config } from "../server/config";
import { hashToken } from "../server/security";
import { publicProblems, problems } from "../server/problems";
import { practiceDefinitions } from "../server/question-bank";
import { executorDomain } from "../scripts/prepare-private-executor";
const app = createApp(),
  original = { ...config };
let database: MongoMemoryServer, candidate: any, other: any, hr: any;
async function actor(role: "candidate" | "hr") {
  const user = await UserModel.create({
    name: "Practice fixture",
    email: randomUUID() + "@example.test",
    role,
    passwordHash: "unused",
  });
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const client = request.agent(app);
  client.jar.setCookie(`hirelens_session=${token}`);
  return { user, client };
}
beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("private_coding_practice_test"));
  candidate = await actor("candidate");
  other = await actor("candidate");
  hr = await actor("hr");
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

it("contains100 distinct new questions per difficulty with public examples, bounded private tests and five language starters", () => {
  expect(practiceDefinitions).toHaveLength(300);
  expect(new Set(practiceDefinitions.map((p) => p.id)).size).toBe(300);
  expect(
    new Set(practiceDefinitions.map((p) => p.title.toLowerCase())).size,
  ).toBe(300);
  for (const level of ["Easy", "Medium", "Hard"])
    expect(
      practiceDefinitions.filter((p) => p.difficulty === level),
    ).toHaveLength(100);
  for (const p of practiceDefinitions) {
    expect(p.description.length, p.id).toBeGreaterThan(60);
    expect(p.constraints.length, p.id).toBeGreaterThan(5);
    expect(p.examples.length, p.id).toBeGreaterThanOrEqual(2);
    expect(p.tests.filter((t) => t.hidden).length, p.id).toBeGreaterThanOrEqual(
      3,
    );
    expect(p.tests.length, p.id).toBeLessThanOrEqual(20);
    expect(
      p.tests.every(
        (t) =>
          typeof t.output === "string" &&
          !/\b(?:NaN|undefined|Infinity)\b/.test(t.output),
      ),
      p.id,
    ).toBe(true);
    for (const lang of ["python", "javascript", "java", "c", "cpp"])
      expect(typeof problems[p.id].starter[lang]).toBe("string");
  }
});
it("does not expose test cases or reference solutions through public question projection or API", async () => {
  for (const p of publicProblems()) {
    expect(p).not.toHaveProperty("tests");
    expect(p).not.toHaveProperty("solve");
    expect(p).not.toHaveProperty("solution");
  }
  const result = await candidate.client.get("/api/problems");
  expect(result.status).toBe(200);
  expect(result.body).toHaveLength(302);
  expect(
    result.body.every(
      (p: any) => !p.tests && !p.solve && !p.solution && p.examples.length >= 1,
    ),
  ).toBe(true);
});
it("starts coding practice without camera, microphone, screening or AI and hides the private snapshot", async () => {
  const created = await candidate.client
    .post("/api/practice/coding")
    .send({ problemId: "sum-pairs" });
  expect(created.status).toBe(201);
  expect(created.body).not.toHaveProperty("problemSnapshot");
  expect(created.body).not.toHaveProperty("tests");
  const row = await InterviewModel.findById(created.body._id).select(
    "+problemSnapshot",
  );
  expect(row?.status).toBe("live");
  expect(row?.type).toBe("practice");
  expect(row?.practiceMode).toBe("coding");
  expect(row?.companyId).toBeUndefined();
  expect(row?.consentAt).toBeUndefined();
  expect(row?.questions).toHaveLength(0);
  expect(row?.problemSnapshot.tests).toHaveLength(4);
  const view = await candidate.client.get(
    `/api/interviews/${created.body._id}/problem`,
  );
  expect(view.status).toBe(200);
  expect(view.body).not.toHaveProperty("tests");
  expect(
    (await other.client.get(`/api/interviews/${created.body._id}`)).status,
  ).toBe(404);
  expect(
    (await hr.client.get(`/api/interviews/${created.body._id}/problem`)).status,
  ).toBe(404);
});
it("blocks invalid IDs and other roles before creating a coding practice session", async () => {
  const count = await InterviewModel.countDocuments();
  for (const id of ["__proto__", "constructor", "toString", "not-a-problem"])
    expect(
      (
        await candidate.client
          .post("/api/practice/coding")
          .send({ problemId: id })
      ).status,
    ).toBe(404);
  expect(
    (
      await hr.client
        .post("/api/practice/coding")
        .send({ problemId: "sum-pairs" })
    ).status,
  ).toBe(403);
  expect(await InterviewModel.countDocuments()).toBe(count);
});
it("saves coding drafts privately while execution is unavailable and never fabricates results", async () => {
  config.judgeUrl = "";
  const session = (
    await candidate.client
      .post("/api/practice/coding")
      .send({ problemId: practiceDefinitions[0].id })
  ).body._id;
  expect(
    (
      await candidate.client
        .patch(`/api/interviews/${session}/draft`)
        .send({ language: "python", code: "print(42)" })
    ).status,
  ).toBe(200);
  expect(
    (await candidate.client.get(`/api/interviews/${session}`)).body.drafts
      .python,
  ).toBe("print(42)");
  const result = await candidate.client
    .post(`/api/interviews/${session}/code`)
    .send({ language: "python", code: "print(42)", mode: "submit" });
  expect(result.status).toBe(503);
  expect(await SubmissionModel.countDocuments({ interviewId: session })).toBe(
    0,
  );
  expect(
    (
      await other.client
        .patch(`/api/interviews/${session}/draft`)
        .send({ language: "python", code: "x" })
    ).status,
  ).toBe(404);
});
it("checks submitted solutions through the configured private adapter and hides private output", async () => {
  config.judgeUrl = "https://private-runner.example.test";
  config.judgeKey = "fixture-private-key";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    expect(String(url)).toMatch(/^https:\/\/private-runner\.example\.test\//);
    if (String(url).endsWith("/languages"))
      return new Response(
        JSON.stringify([{ id: 71, name: "Python (3.12.0)" }]),
      );
    if (options?.method === "POST") {
      const payload = JSON.parse(String(options.body));
      expect(payload.enable_network).toBe(false);
      return new Response(JSON.stringify({ token: "private-token" }));
    }
    return new Response(
      JSON.stringify({
        status: { id: 3, description: "Accepted" },
        stdout: Buffer.from("11").toString("base64"),
        time: "0.01",
        memory: 1024,
      }),
    );
  });
  const session = (
    await candidate.client
      .post("/api/practice/coding")
      .send({ problemId: "sum-pairs" })
  ).body._id;
  const run = await candidate.client
    .post(`/api/interviews/${session}/code`)
    .send({
      language: "python",
      code: "a,b=map(int,input().split()); print(a+b)",
      mode: "submit",
    });
  expect(run.status).toBe(201);
  expect(run.body.total).toBe(4);
  expect(run.body.passed).toBe(4);
  for (const result of run.body.results.filter((r: any) => r.hidden)) {
    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toBeUndefined();
  }
});
it("finishes a coding-only practice session idempotently and prevents later draft/code writes", async () => {
  const session = (
    await candidate.client
      .post("/api/practice/coding")
      .send({ problemId: "sum-pairs" })
  ).body._id;
  expect(
    (await other.client.post(`/api/practice/coding/${session}/finish`)).status,
  ).toBe(404);
  expect(
    (await candidate.client.post(`/api/practice/coding/${session}/finish`))
      .status,
  ).toBe(200);
  expect(
    (await candidate.client.post(`/api/practice/coding/${session}/finish`))
      .status,
  ).toBe(200);
  expect(
    (
      await candidate.client
        .patch(`/api/interviews/${session}/draft`)
        .send({ language: "python", code: "x" })
    ).status,
  ).toBe(409);
  expect(
    (await candidate.client.get(`/api/interviews/${session}`)).body.status,
  ).toBe("completed");
});
it("validates prepared private executor DNS names without accepting URLs, tokens or local hosts", () => {
  expect(executorDomain("")).toBe("");
  expect(executorDomain("RUNNER.HIRELENS-DEMO.COM")).toBe(
    "runner.hirelens-demo.com",
  );
  for (const value of [
    "localhost",
    "127.0.0.1",
    "runner.example.com",
    "https://host.com",
    "host.com:443",
    "host.com/path",
    "host.com\nSECRET=x",
  ])
    expect(() => executorDomain(value)).toThrow();
});
