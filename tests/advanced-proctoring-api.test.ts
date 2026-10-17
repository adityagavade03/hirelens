import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { createApp } from "../server/app";
import { hashToken } from "../server/security";
import {
  CaptureModel,
  ClipModel,
  InterviewModel,
  ReportModel,
  SessionModel,
  UserModel,
  connectDatabase,
} from "../server/models";
import { SpeakerAnalysisModel } from "../server/advanced-proctoring";
const app = createApp(),
  id = () => new mongoose.Types.ObjectId().toString();
const originalUrl = process.env.DIARIZATION_URL,
  originalKey = process.env.DIARIZATION_API_KEY;
let database: MongoMemoryServer, candidate: any, stranger: any, company: any;
async function actor(role: "candidate" | "company") {
  const user = await UserModel.create({
    name: `Test ${role}`,
    email: `${id()}@example.test`,
    role,
    passwordHash: "unused",
    ...(role === "company" ? { companyId: id() } : {}),
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
  const interview = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: candidate.user.id,
    companyId: company.user.companyId,
    type: "technical",
    facilitator: "human",
    scheduledAt: new Date(),
    startedAt: new Date(),
    status: "live",
  });
  const capture = await CaptureModel.create({
    interviewId: interview.id,
    ownerId: candidate.user.id,
    role: "candidate",
    consentAt: new Date(),
  });
  const clip = await ClipModel.create({
    interviewId: interview.id,
    captureId: capture.id,
    ownerId: candidate.user.id,
    role: "candidate",
    sequence: 0,
    offsetMs: 0,
    durationMs: 15000,
    capturedAt: new Date(),
    mime: "audio/webm",
    bytes: 5,
    digest: "fixture",
    data: Buffer.from("dummy"),
  });
  return { interview, capture, clip };
}
const result = {
  model: "synthetic-provider-fixture",
  duration: 15,
  segments: [
    { start: 0, end: 5, speaker: "speaker_0" },
    { start: 7, end: 12, speaker: "speaker_1" },
  ],
};
beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("hirelens_advanced_proctoring_test"));
  await SpeakerAnalysisModel.init();
  candidate = await actor("candidate");
  stranger = await actor("candidate");
  company = await actor("company");
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.DIARIZATION_URL;
  else process.env.DIARIZATION_URL = originalUrl;
  if (originalKey === undefined) delete process.env.DIARIZATION_API_KEY;
  else process.env.DIARIZATION_API_KEY = originalKey;
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});
function configure() {
  process.env.DIARIZATION_URL = "http://127.0.0.1:8766/v1/audio/diarization";
  process.env.DIARIZATION_API_KEY = "test-key-only";
}
it("requires candidate-owned clip and separate affirmative consent; inaccessible results stay private", async () => {
  configure();
  const { clip } = await fixture(),
    call = vi.spyOn(globalThis, "fetch");
  expect(
    (
      await candidate.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: false })
    ).status,
  ).toBe(400);
  expect(
    (
      await stranger.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(404);
  expect(
    (
      await company.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(403);
  expect(
    (await stranger.client.get(`/api/media/${clip.id}/speakers`)).status,
  ).toBe(404);
  expect(call).not.toHaveBeenCalled();
});
it("saves validated estimated clusters without identity or score and permits authorized review and owner removal", async () => {
  configure();
  const { clip } = await fixture();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(result), { status: 200 }),
  );
  const saved = await candidate.client
    .post(`/api/media/${clip.id}/speakers`)
    .send({ accepted: true });
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({
    state: "completed",
    result: { estimatedSpeakers: 2 },
  });
  expect(saved.body.token).toBeUndefined();
  expect(saved.body.result.score).toBeUndefined();
  expect(
    (await company.client.get(`/api/media/${clip.id}/speakers`)).body.result
      .estimatedSpeakers,
  ).toBe(2);
  expect(
    (await company.client.delete(`/api/media/${clip.id}/speakers`)).status,
  ).toBe(403);
  expect(
    (await candidate.client.delete(`/api/media/${clip.id}/speakers`)).status,
  ).toBe(200);
  expect(
    (await candidate.client.get(`/api/media/${clip.id}/speakers`)).body,
  ).toBeNull();
});
it("does not fabricate estimates when service is missing or returns invalid segment bounds", async () => {
  delete process.env.DIARIZATION_URL;
  delete process.env.DIARIZATION_API_KEY;
  const { clip } = await fixture();
  expect(
    (
      await candidate.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(503);
  expect(await SpeakerAnalysisModel.countDocuments({ clipId: clip.id })).toBe(
    0,
  );
  configure();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        ...result,
        segments: [{ start: 1, end: 999, speaker: "speaker_0" }],
      }),
      { status: 200 },
    ),
  );
  expect(
    (
      await candidate.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(503);
  const stored = await SpeakerAnalysisModel.findOne({ clipId: clip.id });
  expect(stored?.state).toBe("failed");
  expect(stored?.result).toBeUndefined();
});
it("discards late provider output after owner removes consented analysis", async () => {
  configure();
  const { clip } = await fixture();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await SpeakerAnalysisModel.deleteOne({ clipId: clip.id });
    return new Response(JSON.stringify(result), { status: 200 });
  });
  expect(
    (
      await candidate.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(200);
  expect(await SpeakerAnalysisModel.countDocuments({ clipId: clip.id })).toBe(
    0,
  );
});
it("blocks analysis after finalization and discards a response that arrives after finalization", async () => {
  configure();
  const { clip, interview } = await fixture();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await ReportModel.create({
      interviewId: interview.id,
      candidateId: candidate.user.id,
      finalized: true,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  });
  expect(
    (
      await candidate.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(409);
  expect(
    (await SpeakerAnalysisModel.findOne({ clipId: clip.id }))?.result,
  ).toBeUndefined();
  vi.restoreAllMocks();
  const call = vi.spyOn(globalThis, "fetch");
  expect(
    (
      await candidate.client
        .post(`/api/media/${clip.id}/speakers`)
        .send({ accepted: true })
    ).status,
  ).toBe(409);
  expect(call).not.toHaveBeenCalled();
});
it("makes an expired processing lease visible as retryable without exposing its token", async () => {
  const { clip, interview } = await fixture();
  await SpeakerAnalysisModel.create({
    clipId: clip.id,
    interviewId: interview.id,
    ownerId: candidate.user.id,
    consentAt: new Date(),
    state: "processing",
    token: "private-lease-token",
    until: new Date(Date.now() - 1),
    expiresAt: new Date(Date.now() + 86400000),
  });
  const viewed = await candidate.client.get(`/api/media/${clip.id}/speakers`);
  expect(viewed.status).toBe(200);
  expect(viewed.body.state).toBe("failed");
  expect(viewed.body.error).toContain("expired");
  expect(viewed.body.token).toBeUndefined();
  expect(viewed.body.until).toBeUndefined();
});
