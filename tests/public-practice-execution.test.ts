import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { allowedOrigins, config } from "../server/config";
import { hashToken } from "../server/security";
import {
  connectDatabase,
  ApplicationModel,
  InterviewModel,
  JobModel,
  SessionModel,
  SubmissionModel,
  UserModel,
} from "../server/models";

// Production-mode permission/transport fixtures. No real provider is contacted.
const original = { ...config };
const origin = "https://public-practice.example.test";
const originAlreadyAllowed = allowedOrigins.has(origin);
const app = createApp();
let db: MongoMemoryServer;
let candidate: Awaited<ReturnType<typeof actor>>;
let other: Awaited<ReturnType<typeof actor>>;
let hr: Awaited<ReturnType<typeof actor>>;
let company: Awaited<ReturnType<typeof actor>>;

async function actor(role: "candidate" | "hr" | "company") {
  const user = await UserModel.create({
    name: "Synthetic public-practice fixture",
    email: randomUUID() + "@example.test",
    role,
    passwordHash: "unused-fixture",
    emailVerifiedAt: new Date(),
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
async function practice(patch: Record<string, unknown> = {}) {
  return InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: candidate.user.id,
    scheduledAt: new Date(),
    startedAt: new Date(),
    status: "live",
    type: "practice",
    practiceMode: "coding",
    problemId: "sum-pairs",
    ...patch,
  });
}
const payload = {
  language: "python",
  code: "print(5)",
  stdin: "2 3",
  mode: "run",
  context: "practice",
};
const post = (
  client: typeof candidate.client,
  id: string,
  body: Record<string, unknown> = payload,
) => client.post(`/api/interviews/${id}/code`).set("Origin", origin).send(body);
const respond = (data: unknown) => new Response(JSON.stringify(data));

beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("public_practice_permission_fixture"));
  [candidate, other, hr, company] = await Promise.all([
    actor("candidate"),
    actor("candidate"),
    actor("hr"),
    actor("company"),
  ]);
  allowedOrigins.add(origin);
});
beforeEach(() =>
  Object.assign(config, {
    production: true,
    host: "0.0.0.0",
    origin,
    allowPublicJudge0Practice: true,
    judgeUrl: "https://ce.judge0.com",
    judgeKey: "",
    rapidHost: "",
  }),
);
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
afterAll(async () => {
  if (!originAlreadyAllowed) allowedOrigins.delete(origin);
  await mongoose.disconnect();
  await db?.stop();
});

it("allows an opted-in candidate's genuine hosted personal practice and stores the provider result", async () => {
  const session = await practice();
  const calls = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      expect(String(url)).toMatch(/^https:\/\/ce\.judge0\.com\//);
      if (String(url).endsWith("/languages"))
        return respond([{ id: 72, name: "Python (3.12.0)" }]);
      if (init?.method === "POST") {
        const sent = JSON.parse(String(init.body));
        expect(Buffer.from(sent.source_code, "base64").toString()).toBe(
          payload.code,
        );
        expect(Buffer.from(sent.stdin, "base64").toString()).toBe(
          payload.stdin,
        );
        expect(sent.enable_network).toBe(false);
        return respond({ token: "hosted-personal-token" });
      }
      return respond({
        status: { id: 3, description: "Accepted" },
        stdout: Buffer.from("5\n").toString("base64"),
      });
    });
  const result = await post(candidate.client, session.id);
  expect(result.status).toBe(201);
  expect(result.body.results[0]).toMatchObject({ passed: true, stdout: "5\n" });
  expect(calls).toHaveBeenCalledTimes(3);
  expect(
    await SubmissionModel.countDocuments({ interviewId: session.id }),
  ).toBe(1);
});

it("keeps hosted execution off without the explicit public-practice flag", async () => {
  config.allowPublicJudge0Practice = false;
  const session = await practice();
  const calls = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected fixture provider request"));
  const result = await post(candidate.client, session.id);
  expect(result.status).toBe(503);
  expect(calls).not.toHaveBeenCalled();
  expect(
    await SubmissionModel.countDocuments({ interviewId: session.id }),
  ).toBe(0);
});

it.each(["companyId", "applicationId", "batchId"])(
  "does not send company/application/batch-bound code even when stored type and client context say practice: %s",
  async (field) => {
    const session = await practice({
      [field]: new mongoose.Types.ObjectId().toString(),
    });
    const calls = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected fixture provider request"));
    const result = await post(candidate.client, session.id, {
      ...payload,
      [field]: "",
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("PRIVATE_EXECUTOR_REQUIRED");
    expect(calls).not.toHaveBeenCalled();
    expect(
      await SubmissionModel.countDocuments({ interviewId: session.id }),
    ).toBe(0);
  },
);

it("does not send a practice-labelled record assigned to another interviewer", async () => {
  const session = await practice({ interviewerId: hr.user.id });
  const calls = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected fixture provider request"));
  const result = await post(candidate.client, session.id);
  expect(result.status).toBe(403);
  expect(result.body.error.code).toBe("PRIVATE_EXECUTOR_REQUIRED");
  expect(calls).not.toHaveBeenCalled();
});

it.each(["human", "ai"])(
  "blocks an otherwise accessible live %s hiring interview despite client-forged practice context",
  async (facilitator) => {
    const companyId = new mongoose.Types.ObjectId().toString();
    const job = await JobModel.create({
      companyId,
      title: "Synthetic hiring fixture",
      status: "published",
      hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
    });
    const application = await ApplicationModel.create({
      companyId,
      jobId: job.id,
      candidateId: candidate.user.id,
      assignedHrId: hr.user.id,
      resumeId: new mongoose.Types.ObjectId().toString(),
      status: "Interview Scheduled",
      snapshot: {},
    });
    const session = await practice({
      type: "technical",
      facilitator,
      companyId,
      applicationId: application.id,
      interviewerId: hr.user.id,
      admittedAt: new Date(),
      consentAt: new Date(),
    });
    const calls = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected fixture provider request"));
    const result = await post(candidate.client, session.id, {
      ...payload,
      context: "practice",
      type: "practice",
      companyId: "",
      applicationId: "",
      interviewerId: candidate.user.id,
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("PRIVATE_EXECUTOR_REQUIRED");
    expect(calls).not.toHaveBeenCalled();
    expect(
      await SubmissionModel.countDocuments({ interviewId: session.id }),
    ).toBe(0);
  },
);

it("blocks staff, foreign candidates and unsigned visitors before any source is sent", async () => {
  const session = await practice();
  const calls = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected fixture provider request"));
  for (const staff of [hr, company])
    expect((await post(staff.client, session.id)).status).toBe(403);
  expect((await post(other.client, session.id)).status).toBe(404);
  expect(
    (
      await request(app)
        .post(`/api/interviews/${session.id}/code`)
        .set("Origin", origin)
        .send(payload)
    ).status,
  ).toBe(401);
  expect(calls).not.toHaveBeenCalled();
});

it.each(["scheduled", "completed", "cancelled"])(
  "does not send code for a %s personal session",
  async (status) => {
    const session = await practice({ status });
    const calls = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected fixture provider request"));
    expect((await post(candidate.client, session.id)).status).toBe(409);
    expect(calls).not.toHaveBeenCalled();
  },
);
