import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { hashToken } from "../server/security";
import {
  connectDatabase,
  InterviewModel,
  MonitoringModel,
  ReportModel,
  SessionModel,
  UserModel,
} from "../server/models";
const app = createApp();
const id = () => new mongoose.Types.ObjectId().toString();
let db: MongoMemoryServer;
const original = {
  llmUrl: config.llmUrl,
  llmKey: config.llmKey,
  llmModel: config.llmModel,
};
beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("proctoring_review_tests"));
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, original);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
async function actor(role: "company" | "hr" | "candidate", companyId?: string) {
  const user = await UserModel.create({
    name: `Review ${role}`,
    email: `${id()}@example.test`,
    role,
    companyId,
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
async function fixture() {
  const companyId = id();
  const owner = await actor("company", companyId),
    hr = await actor("hr", companyId),
    candidate = await actor("candidate"),
    outsider = await actor("company", id());
  const interview = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    companyId,
    scheduledAt: new Date(),
    status: "completed",
    consentAt: new Date(),
    endedAt: new Date(),
    mode: "video",
  });
  const report = await ReportModel.create({
    interviewId: interview.id,
    candidateId: candidate.user.id,
    companyId,
    released: true,
  });
  const event = await MonitoringModel.create({
    interviewId: interview.id,
    candidateId: candidate.user.id,
    kind: "visible",
    durationMs: 5000,
    occurredAt: new Date(),
    detail: "Returned after browser was hidden",
  });
  return { owner, hr, candidate, outsider, interview, report, event };
}
const body = (eventRef: string) => ({
  findings: [
    {
      observation: "The page returned after five seconds in the background.",
      eventRefs: [eventRef],
      reviewQuestion:
        "Was the switch needed for a technical or accessibility reason?",
    },
  ],
  limitations: ["A browser event does not establish intent or misconduct."],
});
function provider(result: unknown, mutate?: () => Promise<void>) {
  Object.assign(config, {
    llmUrl: "https://ai.example.test/v1",
    llmKey: "test-only",
    llmModel: "test-model",
  });
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await mutate?.();
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
      { status: 200 },
    );
  });
}
it("allows scoped staff to review exact events, preserves review history, and rejects candidate/cross-company writes", async () => {
  const f = await fixture(),
    route = `/api/interviews/${f.interview.id}/events/${f.event.id}/review`;
  const input = {
    status: "explained",
    note: "Candidate reported an accessibility tool opened a dialog.",
  };
  expect((await f.candidate.client.patch(route).send(input)).status).toBe(403);
  expect((await f.outsider.client.patch(route).send(input)).status).toBe(404);
  expect(
    (await f.hr.client.patch(route).send({ ...input, note: "short" })).status,
  ).toBe(400);
  const result = await f.hr.client.patch(route).send(input);
  expect(result.status).toBe(200);
  expect(result.body.review.reviewedBy).toBe(f.hr.user.id);
  expect(result.body.reviewHistory).toBeUndefined();
  const stored = await MonitoringModel.findById(f.event.id).select(
    "+reviewHistory",
  );
  expect(stored!.reviewHistory).toHaveLength(1);
  expect(
    (await f.owner.client.patch(route.replace(f.event.id, id())).send(input))
      .status,
  ).toBe(404);
});
it("locks event review and AI generation after report finalization", async () => {
  const f = await fixture();
  await ReportModel.updateOne(
    { _id: f.report.id },
    { $set: { finalized: true } },
  );
  expect(
    (
      await f.hr.client
        .patch(`/api/interviews/${f.interview.id}/events/${f.event.id}/review`)
        .send({ status: "reviewed", note: "Reviewed with the candidate." })
    ).status,
  ).toBe(409);
  expect(
    (await f.hr.client.post(`/api/reports/${f.report.id}/proctoring-summary`))
      .status,
  ).toBe(409);
});
it("saves evidence-linked private summaries and detects staleness after a human review", async () => {
  const f = await fixture();
  const fetch = provider(body(f.event.id));
  const route = `/api/reports/${f.report.id}/proctoring-summary`;
  const result = await f.hr.client.post(route);
  expect(result.status).toBe(200);
  expect(result.body.summary.findings[0].eventRefs).toEqual([f.event.id]);
  expect(
    JSON.parse(String(fetch.mock.calls[0][1]?.body)).messages[1].content,
  ).not.toContain(f.candidate.user.email);
  expect((await f.candidate.client.get(route)).status).toBe(403);
  expect((await f.outsider.client.get(route)).status).toBe(404);
  expect((await f.owner.client.get(route)).body.stale).toBe(false);
  expect(
    (await f.candidate.client.get(`/api/reports/${f.report.id}`)).body.report
      .proctoringSummary,
  ).toBeUndefined();
  await f.hr.client
    .patch(`/api/interviews/${f.interview.id}/events/${f.event.id}/review`)
    .send({
      status: "explained",
      note: "Discussed a legitimate technical interruption.",
    });
  expect((await f.owner.client.get(route)).body.stale).toBe(true);
  expect((await ReportModel.findById(f.report.id))?.decision).toBe("pending");
});
it("rejects invented event references without saving an AI narrative", async () => {
  const f = await fixture();
  provider(body(id()));
  expect(
    (await f.hr.client.post(`/api/reports/${f.report.id}/proctoring-summary`))
      .status,
  ).toBe(502);
  expect(
    (await ReportModel.findById(f.report.id).select("+proctoringSummary"))
      ?.proctoringSummary,
  ).toBeUndefined();
});
it("does not save a generated summary if observations changed during the AI request", async () => {
  const f = await fixture();
  provider(body(f.event.id), async () => {
    await MonitoringModel.updateOne(
      { _id: f.event.id },
      { $set: { detail: "Updated context while the summary was generating" } },
    );
  });
  expect(
    (
      await f.owner.client.post(
        `/api/reports/${f.report.id}/proctoring-summary`,
      )
    ).status,
  ).toBe(409);
  expect(
    (await ReportModel.findById(f.report.id).select("+proctoringSummary"))
      ?.proctoringSummary,
  ).toBeUndefined();
});
