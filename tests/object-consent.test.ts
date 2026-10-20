import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../server/app";
import { config, serviceStatus } from "../server/config";
import { analyzeIntegrity } from "../server/integrity";
import {
  ApplicationModel,
  connectDatabase,
  InterviewModel,
  JobModel,
  MonitoringModel,
  ReportModel,
  SessionModel,
  UserModel,
} from "../server/models";
import { hashToken } from "../server/security";
import { summarizeMonitoring } from "../shared/monitoring";

const app = createApp();
const previous = { ...config };
const companyId = new mongoose.Types.ObjectId().toString();
let database: MongoMemoryServer;
let candidate: any, hr: any, company: any, outsider: any;
let application: any, meeting: any, base: string;
async function actor(role: "candidate" | "hr" | "company") {
  const user = await UserModel.create({
    role,
    name: "Object consent fixture",
    email: randomUUID() + "@example.test",
    passwordHash: "unused-test-hash",
    companyId: role === "candidate" ? undefined : companyId,
  });
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const http = request.agent(app);
  http.jar.setCookie("hirelens_session=" + token);
  return { user, http };
}
beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("object_consent_regression"));
  candidate = await actor("candidate");
  hr = await actor("hr");
  company = await actor("company");
  outsider = await actor("candidate");
  const job = await JobModel.create({
    companyId,
    title: "Object observation fixture",
    companyName: "Isolated fixture",
    status: "published",
    hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
  });
  application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId: candidate.user.id,
    candidateName: candidate.user.name,
    assignedHrId: hr.user.id,
    resumeId: new mongoose.Types.ObjectId().toString(),
    snapshot: candidate.user.profile,
    status: "Interview Scheduled",
    match: {
      score: 87,
      matching: ["Java"],
      missing: [],
      method: "fixture",
      evidence: [],
      limitations: [],
    },
  });
}, 30000);
beforeEach(async () => {
  Object.assign(config, previous, { objectThreshold: 3 });
  const before = new Date(Date.now() - 60000);
  meeting = await InterviewModel.create({
    applicationId: application.id,
    companyId,
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    candidateName: candidate.user.name,
    jobTitle: "Fixture",
    type: "technical",
    facilitator: "human",
    mode: "video",
    status: "live",
    scheduledAt: before,
    startedAt: before,
    consentAt: before,
    admittedAt: before,
    duration: 45,
  });
  base = "/api/interviews/" + meeting.id;
});
afterAll(async () => {
  Object.assign(config, previous);
  await mongoose.disconnect();
  await database?.stop();
});
const observation = (overrides: object = {}) => ({
  clientEventId: randomUUID(),
  kind: "object-detected",
  occurredAt: new Date(Date.now() - 1000).toISOString(),
  durationMs: 3000,
  detail: "Possible phone visible. Review with the candidate.",
  ...overrides,
});
async function consentingWindow() {
  await InterviewModel.updateOne(
    { _id: meeting.id },
    {
      $set: {
        objectConsentWindows: [{ grantedAt: new Date(Date.now() - 20000) }],
      },
    },
  );
}
async function countEvents() {
  return MonitoringModel.countDocuments({ interviewId: meeting.id });
}

it("exposes object model configuration separately without treating missing assets as configured", () => {
  Object.assign(config, { objectModel: "", faceWasm: "/vendor/wasm" });
  expect(serviceStatus().objects).toBe(false);
  config.objectModel = "/vendor/objects.tflite";
  expect(serviceStatus()).toMatchObject({
    objects: true,
    objectModelUrl: "/vendor/objects.tflite",
    objectThresholdSeconds: 3,
  });
  config.faceWasm = "";
  expect(serviceStatus().objects).toBe(false);
});

it("defaults off, grants/revokes idempotently and returns only the consent boolean", async () => {
  expect((await candidate.http.get(base)).body.objectConsent).toBe(false);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await candidate.http
          .post(base + "/object-consent")
          .send({ accepted: true })
      ).body,
    ).toEqual({ accepted: true, objectConsent: true });
  let stored = await InterviewModel.findById(meeting.id);
  expect(stored!.objectConsentWindows).toHaveLength(1);
  expect(stored!.faceConsentWindows).toHaveLength(0);
  for (const reader of [candidate, hr, company]) {
    const response = await reader.http.get(base);
    expect(response.status).toBe(200);
    expect(response.body.objectConsent).toBe(true);
    expect(response.body.objectConsentWindows).toBeUndefined();
  }
  const room = await hr.http.get(base + "/room");
  expect(room.body.objectConsent).toBe(true);
  expect(room.body.objectConsentWindows).toBeUndefined();
  const list = await candidate.http.get("/api/interviews");
  expect(list.body.find((row: any) => row._id === meeting.id)).toMatchObject({
    objectConsent: true,
  });
  expect(JSON.stringify(list.body)).not.toContain("objectConsentWindows");
  for (let i = 0; i < 2; i++)
    expect(
      (
        await candidate.http
          .post(base + "/object-consent")
          .send({ accepted: false })
      ).body.objectConsent,
    ).toBe(false);
  stored = await InterviewModel.findById(meeting.id);
  expect(stored!.objectConsentWindows).toHaveLength(1);
  expect(stored!.objectConsentWindows[0].revokedAt).toBeTruthy();
  expect((await hr.http.get(base + "/room")).body.objectConsent).toBe(false);
});

it("restricts independent consent to the owning candidate and validates acceptance", async () => {
  for (const staff of [hr, company])
    expect(
      (await staff.http.post(base + "/object-consent").send({ accepted: true }))
        .status,
    ).toBe(403);
  expect(
    (
      await outsider.http
        .post(base + "/object-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(base + "/object-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(401);
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: "yes" })
    ).status,
  ).toBe(400);
  expect(
    (await InterviewModel.findById(meeting.id))!.objectConsentWindows,
  ).toHaveLength(0);
});

it.each([
  { status: "completed" },
  { status: "cancelled" },
  { mode: "in_person" },
  { type: "practice" },
])(
  "refuses persisted object consent for unavailable interview mode/status %j",
  async (change) => {
    await InterviewModel.updateOne({ _id: meeting.id }, { $set: change });
    expect(
      (
        await candidate.http
          .post(base + "/object-consent")
          .send({ accepted: true })
      ).status,
    ).toBe(409);
    expect(
      (await InterviewModel.findById(meeting.id))!.objectConsentWindows,
    ).toHaveLength(0);
  },
);

it("allows preflight consent without enabling scheduled or unadmitted monitoring", async () => {
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { status: "scheduled" } },
  );
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(200);
  await consentingWindow();
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(409);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { status: "live" }, $unset: { admittedAt: 1 } },
  );
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(403);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    {
      $set: { admittedAt: new Date(Date.now() - 10000) },
      $unset: { consentAt: 1 },
    },
  );
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(403);
  expect(await countEvents()).toBe(0);
});

it("does not reuse face consent or authorize face observations with object consent", async () => {
  expect(
    (
      await candidate.http
        .post(base + "/room/face-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(200);
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(403);
  expect(
    (
      await candidate.http
        .post(base + "/room/face-consent")
        .send({ accepted: false })
    ).status,
  ).toBe(200);
  await consentingWindow();
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(201);
  expect(
    (
      await candidate.http.post(base + "/events").send(
        observation({
          kind: "no-face",
          occurredAt: new Date(Date.now() + 100).toISOString(),
        }),
      )
    ).status,
  ).toBe(403);
});

it("requires one consent window to cover the entire interval, including its start", async () => {
  const grantedAt = new Date(Date.now() - 20000);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { objectConsentWindows: [{ grantedAt }] } },
  );
  const at = (ms: number) => new Date(+grantedAt + ms).toISOString();
  expect(
    (
      await candidate.http
        .post(base + "/events")
        .send(observation({ occurredAt: at(-1) }))
    ).status,
  ).toBe(403);
  expect(
    (
      await candidate.http
        .post(base + "/events")
        .send(observation({ occurredAt: at(2999) }))
    ).status,
  ).toBe(403);
  expect(
    (
      await candidate.http
        .post(base + "/events")
        .send(observation({ occurredAt: at(3000) }))
    ).status,
  ).toBe(201);
  expect(await countEvents()).toBe(1);
});

it("identifies object interval consent failures without misclassifying other monitoring denials", async () => {
  const missingObject = await candidate.http
    .post(base + "/events")
    .send(observation());
  expect(missingObject.status).toBe(403);
  expect(missingObject.body.error.code).toBe("OBJECT_CONSENT_REQUIRED");
  const missingFace = await candidate.http
    .post(base + "/events")
    .send(observation({ kind: "no-face" }));
  expect(missingFace.status).toBe(403);
  expect(missingFace.body.error.code).toBe("REQUEST_FAILED");
  await consentingWindow();
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $unset: { consentAt: 1 } },
  );
  for (const kind of ["object-detected", "hidden"]) {
    const missingMonitoring = await candidate.http
      .post(base + "/events")
      .send(observation({ kind }));
    expect(missingMonitoring.status).toBe(403);
    expect(missingMonitoring.body.error.code).toBe("REQUEST_FAILED");
  }
  expect(await countEvents()).toBe(0);
});

it("permits a queued pre-revocation observation but rejects post-revocation and cross-gap intervals", async () => {
  const grantedAt = new Date(Date.now() - 20000);
  const revokedAt = new Date(Date.now() - 10000);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    {
      $set: {
        objectConsentWindows: [
          { grantedAt, revokedAt },
          { grantedAt: new Date(Date.now() - 5000) },
        ],
      },
    },
  );
  expect(
    (
      await candidate.http
        .post(base + "/events")
        .send(observation({ occurredAt: revokedAt.toISOString() }))
    ).status,
  ).toBe(201);
  expect(
    (
      await candidate.http
        .post(base + "/events")
        .send(
          observation({ occurredAt: new Date(+revokedAt + 1).toISOString() }),
        )
    ).status,
  ).toBe(403);
  expect(
    (
      await candidate.http
        .post(base + "/events")
        .send(observation({ durationMs: 10000 }))
    ).status,
  ).toBe(403);
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(201);
  expect(await countEvents()).toBe(2);
});

it("rejects observations that started before general monitoring consent or admission", async () => {
  await consentingWindow();
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { consentAt: new Date(Date.now() - 2000) } },
  );
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(403);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    {
      $set: {
        consentAt: new Date(Date.now() - 60000),
        admittedAt: new Date(Date.now() - 2000),
      },
    },
  );
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(403);
  expect(await countEvents()).toBe(0);
});

it("validates sustained duration and bounded metadata without saving image payloads", async () => {
  await consentingWindow();
  config.objectThreshold = 5;
  for (const fields of [
    { durationMs: 4999 },
    { durationMs: 5000.5 },
    { durationMs: 5000, detail: "" },
    { durationMs: 5000, detail: "phone\nuntrusted" },
    { durationMs: 5000, detail: "x".repeat(201) },
  ])
    expect(
      (await candidate.http.post(base + "/events").send(observation(fields)))
        .status,
    ).toBe(400);
  const accepted = await candidate.http.post(base + "/events").send(
    observation({
      durationMs: 5000,
      image: "not-persisted",
      confidence: 0.9,
    }),
  );
  expect(accepted.status).toBe(201);
  expect(accepted.body.image).toBeUndefined();
  expect(accepted.body.confidence).toBeUndefined();
  expect(await countEvents()).toBe(1);
});

it("rejects an entire mixed batch without consent and deduplicates authorized retries", async () => {
  const event = observation();
  const response = await candidate.http
    .post(base + "/events")
    .send({ events: [{ ...observation(), kind: "hidden" }, event] });
  expect(response.status).toBe(403);
  expect(await countEvents()).toBe(0);
  await consentingWindow();
  for (let i = 0; i < 2; i++)
    expect(
      (await candidate.http.post(base + "/events").send({ events: [event] }))
        .status,
    ).toBe(201);
  expect(await countEvents()).toBe(1);
});

it("bounds consent history while always permitting withdrawal of the current grant", async () => {
  const closed = {
    grantedAt: new Date(Date.now() - 60000),
    revokedAt: new Date(Date.now() - 30000),
  };
  await InterviewModel.updateOne(
    { _id: meeting.id },
    {
      $set: {
        objectConsentWindows: Array.from({ length: 100 }, () => ({
          ...closed,
        })),
      },
    },
  );
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(429);
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: false })
    ).status,
  ).toBe(200);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $unset: { "objectConsentWindows.99.revokedAt": 1 } },
  );
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(200);
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: false })
    ).status,
  ).toBe(200);
  expect(
    (await InterviewModel.findById(meeting.id))!.objectConsentWindows,
  ).toHaveLength(100);
});

it("supports AI-led hiring interviews without requiring a human admission", async () => {
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { facilitator: "ai" }, $unset: { admittedAt: 1 } },
  );
  expect(
    (
      await candidate.http
        .post(base + "/object-consent")
        .send({ accepted: true })
    ).status,
  ).toBe(200);
  await consentingWindow();
  expect(
    (await candidate.http.post(base + "/events").send(observation())).status,
  ).toBe(201);
  expect((await candidate.http.get(base)).body.objectConsent).toBe(true);
  expect((await hr.http.get(base)).body.objectConsentWindows).toBeUndefined();
});

it("keeps observations candidate-owned and review-only with zero integrity points or hiring changes", async () => {
  await consentingWindow();
  expect(
    (await hr.http.post(base + "/events").send(observation())).status,
  ).toBe(403);
  expect(
    (await outsider.http.post(base + "/events").send(observation())).status,
  ).toBe(404);
  const before = await ApplicationModel.findById(application.id);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await candidate.http.post(base + "/events").send(
          observation({
            occurredAt: new Date(Date.now() - 1000 - i * 6000).toISOString(),
          }),
        )
      ).status,
    ).toBe(201);
  const timeline = await hr.http.get(base + "/events");
  expect(timeline.status).toBe(200);
  expect(timeline.body).toHaveLength(2);
  const integrity = analyzeIntegrity(timeline.body);
  expect(integrity.score).toBe(0);
  expect(integrity.reasons).toEqual([]);
  expect(summarizeMonitoring(timeline.body).objectObservations).toBe(2);
  const after = await ApplicationModel.findById(application.id);
  expect(after!.status).toBe(before!.status);
  expect(after!.match).toEqual(before!.match);
  expect(await ReportModel.countDocuments({ interviewId: meeting.id })).toBe(0);
});

it("keeps consent history private in report responses too", async () => {
  await consentingWindow();
  const report = await ReportModel.create({
    interviewId: meeting.id,
    candidateId: candidate.user.id,
    companyId,
    finalized: false,
  });
  const response = await hr.http.get("/api/reports/" + report.id);
  expect(response.status).toBe(200);
  expect(response.body.interview.objectConsent).toBe(true);
  expect(response.body.interview.objectConsentWindows).toBeUndefined();
});
