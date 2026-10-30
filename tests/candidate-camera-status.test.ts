import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../server/app";
import {
  connectDatabase,
  UserModel,
  SessionModel,
  InterviewModel,
  JobModel,
  ApplicationModel,
} from "../server/models";
import { hashToken } from "../server/security";
import { freshCameraSnapshot } from "../shared/camera-status";
const app = createApp();
let db: MongoMemoryServer,
  candidate: any,
  hr: any,
  outsider: any,
  interview: any;
const companyId = new mongoose.Types.ObjectId().toString();
async function actor(role: "candidate" | "hr") {
  const user = await UserModel.create({
    name: "Synthetic camera review",
    email: `${randomUUID()}@example.test`,
    role,
    companyId: role === "hr" ? companyId : undefined,
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
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("candidate_camera_status_only"));
  candidate = await actor("candidate");
  hr = await actor("hr");
  outsider = await actor("candidate");
});
beforeEach(async () => {
  const job = await JobModel.create({
    companyId,
    title: "Synthetic role",
    status: "published",
    hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
  });
  const application = await ApplicationModel.create({
    companyId,
    jobId: job.id,
    candidateId: candidate.user.id,
    candidateName: candidate.user.name,
    jobTitle: job.title,
    companyName: "Synthetic",
    assignedHrId: hr.user.id,
    resumeId: new mongoose.Types.ObjectId().toString(),
    snapshot: {},
    status: "Interview Scheduled",
  });
  interview = await InterviewModel.create({
    companyId,
    applicationId: application.id,
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    type: "technical",
    facilitator: "human",
    mode: "video",
    status: "live",
    admittedAt: new Date(),
    consentAt: new Date(),
    scheduledAt: new Date(),
    faceConsentWindows: [{ grantedAt: new Date() }],
    objectConsentWindows: [{ grantedAt: new Date() }],
  });
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const input = () => ({
  camera: true,
  face: { state: "ready", count: 2 },
  objects: {
    state: "ready",
    items: [
      {
        label: "cell phone",
        score: 0.9,
        box: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
      },
    ],
  },
  frameAspect: 1.5,
});
const base = () => `/api/interviews/${interview.id}/room`;
it("shares candidate metadata with assigned HR only and never accepts HR camera checks", async () => {
  expect(
    (await hr.client.post(`${base()}/camera-status`).send(input())).status,
  ).toBe(403);
  expect(
    (await outsider.client.post(`${base()}/camera-status`).send(input()))
      .status,
  ).toBe(404);
  expect(
    (await candidate.client.post(`${base()}/camera-status`).send(input()))
      .status,
  ).toBe(200);
  const view = await hr.client.get(base());
  expect(view.body.candidateCameraStatus.face.count).toBe(2);
  expect(view.body.candidateCameraStatus.objects.items[0].label).toBe(
    "cell phone",
  );
  expect(freshCameraSnapshot(view.body.candidateCameraStatus)).toBe(true);
  expect((await outsider.client.get(base())).status).toBe(404);
});
it("requires admission, live interview and browser monitoring consent", async () => {
  for (const change of [
    { status: "scheduled" },
    { admittedAt: null },
    { consentAt: null },
  ]) {
    await InterviewModel.updateOne(
      { _id: interview.id },
      {
        $set: {
          status: "live",
          admittedAt: new Date(),
          consentAt: new Date(),
          ...change,
        },
      },
    );
    expect(
      (await candidate.client.post(`${base()}/camera-status`).send(input()))
        .status,
    ).toBe(409);
  }
});
it("strips observations without separate face and object consent", async () => {
  await InterviewModel.updateOne(
    { _id: interview.id },
    { $set: { faceConsentWindows: [], objectConsentWindows: [] } },
  );
  expect(
    (await candidate.client.post(`${base()}/camera-status`).send(input()))
      .status,
  ).toBe(200);
  const value = (await hr.client.get(base())).body.candidateCameraStatus;
  expect(value.face).toEqual({ state: "off", count: null });
  expect(value.objects).toEqual({ state: "off", items: [] });
});
it("clears observations on withdrawal and does not resurrect them after reconsent", async () => {
  await candidate.client.post(`${base()}/camera-status`).send(input());
  expect(
    (
      await candidate.client
        .post(`${base()}/face-consent`)
        .send({ accepted: false })
    ).status,
  ).toBe(200);
  expect(
    (
      await candidate.client
        .post(`/api/interviews/${interview.id}/object-consent`)
        .send({ accepted: false })
    ).status,
  ).toBe(200);
  await candidate.client
    .post(`${base()}/face-consent`)
    .send({ accepted: true });
  await candidate.client
    .post(`/api/interviews/${interview.id}/object-consent`)
    .send({ accepted: true });
  const value = (await hr.client.get(base())).body.candidateCameraStatus;
  expect(value.face.count).toBeNull();
  expect(value.objects.items).toEqual([]);
});
it("never shows camera-off or failed checks as fresh observations", async () => {
  await candidate.client
    .post(`${base()}/camera-status`)
    .send({ ...input(), camera: false });
  const value = (await hr.client.get(base())).body.candidateCameraStatus;
  expect(value.face).toEqual({ state: "paused", count: null });
  expect(value.objects).toEqual({ state: "paused", items: [] });
  const payload = input();
  payload.face.state = "error";
  payload.objects.state = "paused";
  await candidate.client.post(`${base()}/camera-status`).send(payload);
  const next = (await hr.client.get(base())).body.candidateCameraStatus;
  expect(next.face.count).toBeNull();
  expect(next.objects.items).toEqual([]);
});
it("rejects malformed observations, unexpected labels, images and client timestamps", async () => {
  for (const value of [
    { ...input(), at: new Date().toISOString() },
    { ...input(), image: "pixels" },
    { ...input(), face: { state: "ready", count: 100000 } },
    {
      ...input(),
      objects: {
        state: "ready",
        items: [{ ...input().objects.items[0], label: "person identity" }],
      },
    },
  ])
    expect(
      (await candidate.client.post(`${base()}/camera-status`).send(value))
        .status,
    ).toBe(400);
});
it("hides ended-interview snapshots and treats old snapshots as stale", async () => {
  await candidate.client.post(`${base()}/camera-status`).send(input());
  const value = (await hr.client.get(base())).body.candidateCameraStatus;
  expect(freshCameraSnapshot(value, Date.parse(value.at) + 20001)).toBe(false);
  await InterviewModel.updateOne(
    { _id: interview.id },
    { $set: { status: "completed" } },
  );
  expect(
    (await hr.client.get(base())).body.candidateCameraStatus,
  ).toBeUndefined();
  expect(
    (await candidate.client.post(`${base()}/camera-status`).send(input()))
      .status,
  ).toBe(409);
});
