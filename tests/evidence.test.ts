import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { hashToken } from "../server/security";
import {
  connectDatabase,
  UserModel,
  SessionModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  ReportModel,
  SubmissionModel,
  CaptureModel,
  ClipModel,
  InterviewBatchModel,
  NotificationModel,
} from "../server/models";
import { compareCode, codeTokens } from "../server/similarity";
import { reviewedTranscript } from "../server/media";
import { evidenceHash } from "../server/assessment";
import { headTurned } from "../shared/orientation";
import { repeatsQuestion } from "../server/ai-interview";
const app = createApp(),
  original = { ...config };
const id = () => new mongoose.Types.ObjectId().toString(),
  companyId = id();
let db: MongoMemoryServer, owner: any, hr: any, candidate: any, stranger: any;
async function actor(role: "company" | "hr" | "candidate", company?: string) {
  const user = await UserModel.create({
    name: `Test ${role}`,
    role,
    email: `${id()}@example.test`,
    companyId: company,
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
async function practice() {
  return InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: candidate.user.id,
    type: "practice",
    scheduledAt: new Date(),
    startedAt: new Date(),
    status: "live",
  });
}
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(100).fill(0)]);
async function capture(i: any) {
  return candidate.client
    .post(`/api/interviews/${i.id}/captures`)
    .send({ accepted: true });
}
function upload(client: any, captureId: string, sequence = 0, bytes = webm) {
  return client
    .post(`/api/captures/${captureId}/clips`)
    .field("sequence", String(sequence))
    .field("offsetMs", "0")
    .field("durationMs", "1")
    .attach("clip", bytes, {
      filename: "clip.webm",
      contentType: "video/webm",
    });
}
beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("hirelens_evidence"));
  owner = await actor("company", companyId);
  hr = await actor("hr", companyId);
  candidate = await actor("candidate");
  stranger = await actor("candidate");
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, original);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

it("requires explicit recording consent, saves segments idempotently, and enforces participant privacy", async () => {
  const i = await practice();
  expect(
    (
      await candidate.client
        .post(`/api/interviews/${i.id}/captures`)
        .send({ accepted: false })
    ).status,
  ).toBe(400);
  const c = await capture(i);
  expect(c.status).toBe(201);
  expect((await upload(stranger.client, c.body._id)).status).toBe(404);
  const first = await upload(candidate.client, c.body._id);
  expect(first.status).toBe(201);
  expect(first.body.data).toBeUndefined();
  expect(first.body.digest).toBeUndefined();
  expect((await upload(candidate.client, c.body._id)).body._id).toBe(
    first.body._id,
  );
  expect(
    (
      await upload(
        candidate.client,
        c.body._id,
        0,
        Buffer.concat([webm, Buffer.from("changed")]),
      )
    ).status,
  ).toBe(409);
  expect(
    (await stranger.client.get(`/api/media/${first.body._id}/play`)).status,
  ).toBe(404);
  expect((await owner.client.get(`/api/interviews/${i.id}/media`)).status).toBe(
    404,
  );
  const range = await candidate.client
    .get(`/api/media/${first.body._id}/play`)
    .set("Range", "bytes=0-3");
  const detachedCompany = await actor("company");
  expect(
    (await detachedCompany.client.get(`/api/interviews/${i.id}/media`)).status,
  ).toBe(404);
  expect(range.status).toBe(206);
  expect(range.headers["content-range"]).toBe(`bytes 0-3/${webm.length}`);
  expect(
    (
      await candidate.client
        .get(`/api/media/${first.body._id}/play`)
        .set("Range", "bytes=9000-10000")
    ).status,
  ).toBe(416);
  await candidate.client.post(`/api/captures/${c.body._id}/stop`).send({});
  expect((await upload(candidate.client, c.body._id, 1)).status).toBe(409);
});
it("rejects arbitrary files and recording outside a live session", async () => {
  const i = await practice(),
    c = await capture(i);
  expect(
    (await upload(candidate.client, c.body._id, 0, Buffer.from("not a video")))
      .status,
  ).toBe(400);
  await InterviewModel.updateOne(
    { _id: i.id },
    { $set: { status: "completed", endedAt: new Date(Date.now() - 180000) } },
  );
  expect((await capture(i)).status).toBe(409);
  expect((await upload(candidate.client, c.body._id)).status).toBe(409);
});
it("preserves recording retries and playback when shared upload storage is full", async () => {
  const i = await practice(),
    c = await capture(i),
    stored = await upload(candidate.client, c.body._id);
  expect(stored.status).toBe(201);
  config.storageBudgetBytes = 1;
  config.storageBudgetScope = "database";

  const retry = await upload(candidate.client, c.body._id);
  expect(retry.status).toBe(201);
  expect(retry.body._id).toBe(stored.body._id);

  const next = await upload(candidate.client, c.body._id, 1);
  expect(next.status).toBe(507);
  expect(next.body.error.code).toBe("STORAGE_BUDGET_EXCEEDED");
  expect(await ClipModel.countDocuments({ interviewId: i.id })).toBe(1);
  expect(
    (await candidate.client.get(`/api/media/${stored.body._id}/play`)).status,
  ).toBe(200);
});
it("uses only reviewed transcript evidence, detects conflicts, and blocks changes to finalized reports", async () => {
  const i = await practice(),
    c = await capture(i),
    stored = await upload(candidate.client, c.body._id),
    clipId = stored.body._id;
  Object.assign(config, {
    sttUrl: "https://speech.invalid",
    sttKey: "fixture",
    sttModel: "fixture",
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ text: "I chose a hash map for constant time lookup." }),
    ),
  );
  const transcription = await candidate.client
    .post(`/api/media/${clipId}/transcribe`)
    .send({});
  expect(transcription.status).toBe(200);
  expect(await reviewedTranscript(i.id)).toHaveLength(0);
  const before = evidenceHash(i, []);
  const saved = await candidate.client
    .patch(`/api/media/${clipId}/transcript`)
    .send({
      transcript: transcription.body.transcript,
      reviewed: true,
      expectedUpdatedAt: transcription.body.updatedAt,
    });
  expect(saved.status).toBe(200);
  expect(await reviewedTranscript(i.id)).toHaveLength(1);
  expect(evidenceHash(i, [], await reviewedTranscript(i.id))).not.toBe(before);
  expect(
    (
      await candidate.client.patch(`/api/media/${clipId}/transcript`).send({
        transcript: "changed",
        reviewed: true,
        expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      })
    ).status,
  ).toBe(409);
  await ReportModel.create({
    interviewId: i.id,
    candidateId: candidate.user.id,
    finalized: true,
  });
  expect(
    (
      await candidate.client.patch(`/api/media/${clipId}/transcript`).send({
        transcript: "changed",
        reviewed: true,
        expectedUpdatedAt: saved.body.updatedAt,
      })
    ).status,
  ).toBe(409);
});
it("preserves saved recordings when transcription is unavailable", async () => {
  config.sttUrl = "";
  const i = await practice(),
    c = await capture(i),
    stored = await upload(candidate.client, c.body._id);
  expect(
    (
      await candidate.client
        .post(`/api/media/${stored.body._id}/transcribe`)
        .send({})
    ).status,
  ).toBe(503);
  expect(await ClipModel.countDocuments({ interviewId: i.id })).toBe(1);
});
it.each(["", " \n\t "])(
  "keeps recordings retryable when speech recognition returns blank text (%j)",
  async (text) => {
    Object.assign(config, {
      sttUrl: "https://speech.invalid",
      sttKey: "fixture",
      sttModel: "fixture",
    });
    const i = await practice(),
      c = await capture(i),
      stored = await upload(candidate.client, c.body._id),
      clipId = stored.body._id;
    const provider = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ text })));
    const failed = await candidate.client
      .post(`/api/media/${clipId}/transcribe`)
      .send({});
    expect(failed.status).toBe(422);
    expect(failed.body.error.code).toBe("NO_USABLE_TRANSCRIPT");
    const saved = await ClipModel.findById(clipId).select("+data");
    expect(saved!.transcriptState).toBe("failed");
    expect(saved!.transcriptError).toContain("no usable text");
    expect(saved!.transcriptError).toContain("recording is saved");
    expect(Buffer.from(saved!.data!)).toEqual(webm);
    expect(saved!.reviewedAt).toBeUndefined();
    expect(saved!.transcriptLease).toBeUndefined();
    expect(await reviewedTranscript(i.id)).toHaveLength(0);
    provider.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ text: "  I tested the boundary conditions.  " }),
      ),
    );
    const retried = await candidate.client
      .post(`/api/media/${clipId}/transcribe`)
      .send({});
    expect(retried.status).toBe(200);
    expect(retried.body.transcriptState).toBe("ready");
    expect(retried.body.transcript).toBe("I tested the boundary conditions.");
    expect(retried.body.transcriptError).toBeUndefined();
    expect(await reviewedTranscript(i.id)).toHaveLength(0);
  },
);
it("retries an unreviewed ready transcript but never overwrites reviewed evidence", async () => {
  Object.assign(config, {
    sttUrl: "https://speech.invalid",
    sttKey: "fixture",
    sttModel: "fixture",
  });
  const i = await practice(),
    c = await capture(i),
    stored = await upload(candidate.client, c.body._id),
    clipId = stored.body._id;
  await ClipModel.updateOne(
    { _id: clipId },
    { $set: { transcriptState: "ready", transcript: "" } },
  );
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ text: "I explained the transaction boundary." }),
      ),
    );
  const retried = await candidate.client
    .post(`/api/media/${clipId}/transcribe`)
    .send({});
  expect(retried.status).toBe(200);
  expect(retried.body.transcript).toBe("I explained the transaction boundary.");
  expect(provider).toHaveBeenCalledTimes(1);
  const reviewed = await candidate.client
    .patch(`/api/media/${clipId}/transcript`)
    .send({
      transcript: "Human-reviewed version.",
      reviewed: true,
      expectedUpdatedAt: retried.body.updatedAt,
    });
  expect(reviewed.status).toBe(200);
  const protectedResult = await candidate.client
    .post(`/api/media/${clipId}/transcribe`)
    .send({});
  expect(protectedResult.body.transcript).toBe("Human-reviewed version.");
  expect(provider).toHaveBeenCalledTimes(1);
});
const solution = `function solve(values) { const counts = new Map(); let total = 0; for (const item of values) { if (counts.has(item)) { counts.set(item, counts.get(item) + 1); } else { counts.set(item, 1); } total += item; } const result = []; for (const entry of counts) { if (entry[1] > 1) { result.push(entry[0]); } } result.sort((a,b) => a-b); return { result, total, unique: counts.size }; }`;
it("compares normalized code conservatively and excludes starter patterns", () => {
  expect(
    compareCode(solution, solution.replaceAll("counts", "frequencies")).score,
  ).toBe(100);
  expect(compareCode("print(1)", "print(2)").score).toBeNull();
  expect(compareCode(solution, solution, solution).score).toBeNull();
  expect(codeTokens('const url="https://a.test/#path"; // comment')).toEqual([
    "const",
    "ID",
    "=",
    "STR",
    ";",
  ]);
});
it("restricts similarity to the company and hides unauthorized peer references", async () => {
  const otherHr = await actor("hr", companyId);
  const current = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    companyId,
    status: "completed",
    scheduledAt: new Date(),
  });
  const peer = await InterviewModel.create({
    candidateId: stranger.user.id,
    interviewerId: otherHr.user.id,
    companyId,
    status: "completed",
    scheduledAt: new Date(),
  });
  for (const i of [current, peer])
    await SubmissionModel.create({
      interviewId: i.id,
      candidateId: i.candidateId,
      language: "javascript",
      mode: "submit",
      code: solution,
    });
  const result = await hr.client.get(
    `/api/interviews/${current.id}/similarity`,
  );
  expect(result.status).toBe(200);
  expect(result.body.matches).toHaveLength(1);
  expect(result.body.matches[0].interviewId).toBeUndefined();
  expect(
    (await owner.client.get(`/api/interviews/${current.id}/similarity`)).body
      .matches[0].interviewId,
  ).toBe(peer.id);
  expect(
    (await candidate.client.get(`/api/interviews/${current.id}/similarity`))
      .status,
  ).toBe(403);
});
async function recruitment(candidateId: string) {
  const job = await JobModel.create({
    companyId,
    title: "Backend engineer",
    hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
  });
  const application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId,
    resumeId: id(),
    snapshot: {},
    status: "Shortlisted",
  });
  return { job, application };
}
it("prevents simultaneous cross-job bookings for the same interviewer", async () => {
  const a = await recruitment(candidate.user.id),
    b = await recruitment(stranger.user.id);
  // Both candidates have already passed allocation; this test exercises the
  // shared calendar lock rather than the unassigned-candidate guard.
  await ApplicationModel.updateMany(
    { _id: { $in: [a.application.id, b.application.id] } },
    { $set: { assignedHrId: hr.user.id, assignedAt: new Date() } },
  );
  const input = {
    interviewerId: hr.user.id,
    scheduledAt: new Date(Date.now() + 172800000).toISOString(),
    timezone: "Asia/Kolkata",
    duration: 30,
    type: "technical",
    topics: ["Java"],
    difficulty: "Intermediate",
    problemId: "sum-pairs",
  };
  const results = await Promise.all(
    [a, b].map((x) =>
      hr.client
        .post("/api/interviews")
        .send({ ...input, applicationId: x.application.id }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    await InterviewModel.countDocuments({
      applicationId: { $in: [a.application.id, b.application.id] },
    }),
  ).toBe(1);
});
it("recovers an interrupted batch without touching another batch or notifying candidates", async () => {
  const { job, application } = await recruitment(candidate.user.id);
  const batch = await InterviewBatchModel.create({
    companyId,
    jobId: job.id,
    interviewerId: hr.user.id,
    requestId: randomUUID(),
    name: "Interrupted batch",
    recovery: [{ id: application.id, status: "Shortlisted" }],
  });
  await InterviewBatchModel.updateOne(
    { _id: batch.id },
    { $set: { updatedAt: new Date(Date.now() - 180000) } },
    { timestamps: false },
  );
  await ApplicationModel.updateOne(
    { _id: application.id },
    {
      $set: {
        status: "Interview Scheduled",
        assignedHrId: hr.user.id,
        schedulingBatchId: batch.id,
      },
    },
  );
  await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    scheduledAt: new Date(),
    batchId: batch.id,
    applicationId: application.id,
    companyId,
  });
  expect(
    (
      await hr.client
        .post(`/api/interview-batches/${batch.id}/recover`)
        .send({})
    ).status,
  ).toBe(200);
  expect(await InterviewModel.countDocuments({ batchId: batch.id })).toBe(0);
  const restored = await ApplicationModel.findById(application.id);
  expect(restored!.status).toBe("Shortlisted");
  expect(restored!.assignedHrId).toBeUndefined();
  expect((await InterviewBatchModel.findById(batch.id))!.status).toBe("failed");
  expect(
    (
      await hr.client
        .post(`/api/interview-batches/${batch.id}/recover`)
        .send({})
    ).status,
  ).toBe(200);
});
it("includes recordings and transcripts in authorized retention cleanup", async () => {
  const i = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    companyId,
    scheduledAt: new Date(),
    endedAt: new Date(Date.now() - 200 * 86400000),
    status: "completed",
  });
  await ReportModel.create({
    interviewId: i.id,
    candidateId: candidate.user.id,
    companyId,
    finalized: true,
  });
  const c = await CaptureModel.create({
    interviewId: i.id,
    ownerId: candidate.user.id,
    role: "candidate",
    consentAt: new Date(),
  });
  await ClipModel.create({
    interviewId: i.id,
    captureId: c.id,
    ownerId: candidate.user.id,
    sequence: 0,
    data: webm,
    transcript: "private",
  });
  const preview = await owner.client
    .post("/api/company/retention/preview")
    .send({ days: 180, auditDays: 730 });
  expect(preview.body.recordingSegments).toBe(1);
  expect(
    (
      await owner.client.post("/api/company/retention/apply").send({
        previewToken: preview.body.previewToken,
        confirmation: "DELETE PRIVATE INTERVIEW DATA",
      })
    ).status,
  ).toBe(200);
  expect(await ClipModel.countDocuments({ interviewId: i.id })).toBe(0);
  expect(await CaptureModel.countDocuments({ interviewId: i.id })).toBe(0);
  expect(await ReportModel.exists({ interviewId: i.id })).toBeTruthy();
});
it("treats coarse head geometry as unavailable for tiny or missing faces", () => {
  expect(headTurned([])).toBe(false);
  const points = Array.from({ length: 264 }, () => ({ x: 0.5, y: 0.5 }));
  points[33] = { x: 0.3, y: 0.4 };
  points[263] = { x: 0.7, y: 0.4 };
  expect(headTurned(points)).toBe(false);
  points[1] = { x: 0.68, y: 0.5 };
  expect(headTurned(points)).toBe(true);
});
it("detects repeated AI wording without treating every shared topic as a duplicate", () => {
  expect(
    repeatsQuestion("Explain how Java hash maps handle collisions!", [
      "Explain how Java hash maps handle collisions?",
    ]),
  ).toBe(true);
  expect(
    repeatsQuestion("What is the time complexity of hash map lookup?", [
      "Explain how Java hash maps handle collisions?",
    ]),
  ).toBe(false);
});
