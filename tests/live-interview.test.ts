import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { io as client, type Socket } from "socket.io-client";
import { createApp } from "../server/app";
import { attachRealtime } from "../server/realtime";
import {
  connectDatabase,
  UserModel,
  SessionModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  MonitoringModel,
  ResumeModel,
} from "../server/models";
import { hashToken } from "../server/security";
import { config } from "../server/config";
import { iceConfiguration } from "../server/ice";
import { analyzeIntegrity } from "../server/integrity";
import { validateRoomSdp } from "../server/room-events";
import PDFDocument from "pdfkit";
const original = { ...config },
  app = createApp(),
  server = createServer(app),
  realtime = attachRealtime(server);
let db: MongoMemoryServer,
  url: string,
  c: any,
  hr: any,
  other: any,
  interview: any;
const companyId = new mongoose.Types.ObjectId().toString();
async function actor(role: "candidate" | "hr") {
  const user = await UserModel.create({
    role,
    name: `Fixture ${role}`,
    email: `${randomUUID()}@example.test`,
    companyId: role === "hr" ? companyId : undefined,
    passwordHash: "unused-fixture",
  });
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const cookie = `hirelens_session=${token}`,
    http = request.agent(app);
  http.jar.setCookie(cookie);
  return { user, cookie, http };
}
const sockets: Socket[] = [];
async function connect(cookie: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = client(url, {
      forceNew: true,
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
    });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}
const emit = (socket: Socket, event: string, body: object) =>
  socket.timeout(3000).emitWithAck(event, body);
async function preparedRoom() {
  const pdf = await new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.text(
      "Isolated test resume. Java developer with experience building tested web applications, APIs and reliable databases. This document is used only in the temporary test database.",
    );
    doc.end();
  });
  const resume = await ResumeModel.create({
    ownerId: c.user.id,
    name: "fixture.pdf",
    text: "Test resume",
    data: pdf,
  });
  const data = interview.toObject();
  delete data._id;
  delete data.admittedAt;
  delete data.startedAt;
  delete data.consentAt;
  const meeting = await InterviewModel.create({ ...data, status: "scheduled" });
  return { meeting, resume, pdf, base: `/api/interviews/${meeting.id}` };
}
beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("live_media_regression"));
  await MonitoringModel.init();
  c = await actor("candidate");
  hr = await actor("hr");
  other = await actor("candidate");
  const job = await JobModel.create({
    companyId,
    companyName: "Isolated media test",
    title: "Engineer",
    status: "published",
    hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
  });
  const application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId: c.user.id,
    candidateName: c.user.name,
    assignedHrId: hr.user.id,
    jobTitle: job.title,
    companyName: job.companyName,
    resumeId: new mongoose.Types.ObjectId().toString(),
    snapshot: c.user.profile,
    status: "Interview Scheduled",
  });
  interview = await InterviewModel.create({
    applicationId: application.id,
    companyId,
    companyName: job.companyName,
    candidateId: c.user.id,
    candidateName: c.user.name,
    interviewerId: hr.user.id,
    jobTitle: job.title,
    type: "technical",
    status: "live",
    consentAt: new Date(),
    admittedAt: new Date(),
    startedAt: new Date(),
    scheduledAt: new Date(),
    duration: 45,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  vi.restoreAllMocks();
  Object.assign(config, original);
  await InterviewModel.updateOne(
    { _id: interview.id },
    { $set: { status: "live", consentAt: new Date() }, $unset: { endedAt: 1 } },
  );
});
afterAll(async () => {
  await new Promise<void>((resolve) => realtime.close(() => resolve()));
  await mongoose.disconnect();
  await db?.stop();
});
it("enforces separate candidate face consent and rejects post-withdrawal observations", async () => {
  const { meeting, base } = await preparedRoom();
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { status: "live", admittedAt: new Date(), consentAt: new Date() },
  );
  const observation = (at = new Date().toISOString()) => ({
    clientEventId: randomUUID(),
    kind: "no-face",
    occurredAt: at,
    durationMs: 5000,
  });
  expect((await c.http.post(`${base}/events`).send(observation())).status).toBe(
    403,
  );
  expect(
    (await hr.http.post(`${base}/room/face-consent`).send({ accepted: true }))
      .status,
  ).toBe(403);
  expect(
    (
      await other.http
        .post(`${base}/room/face-consent`)
        .send({ accepted: true })
    ).status,
  ).toBe(404);
  expect(
    (await c.http.post(`${base}/room/face-consent`).send({ accepted: true }))
      .status,
  ).toBe(200);
  const during = new Date().toISOString();
  expect(
    (await c.http.post(`${base}/events`).send(observation(during))).status,
  ).toBe(201);
  expect((await hr.http.get(`${base}/room`)).body.faceConsent).toBe(true);
  expect((await c.http.get(base)).body.faceConsentWindows).toBeUndefined();
  expect(
    (await c.http.post(`${base}/room/face-consent`).send({ accepted: false }))
      .status,
  ).toBe(200);
  expect(
    (await c.http.post(`${base}/events`).send(observation(during))).status,
  ).toBe(201);
  expect(
    (
      await c.http
        .post(`${base}/events`)
        .send(observation(new Date(Date.now() + 100).toISOString()))
    ).status,
  ).toBe(403);
  expect((await hr.http.get(`${base}/room`)).body.faceConsent).toBe(false);
  expect(
    (
      await c.http
        .post(`${base}/events`)
        .send({ ...observation(), kind: "hidden" })
    ).status,
  ).toBe(201);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { status: "completed", endedAt: new Date() },
  );
  expect(
    (await c.http.post(`${base}/room/face-consent`).send({ accepted: true }))
      .status,
  ).toBe(409);
});
it("relays camera/microphone/share status only between the assigned live participants", async () => {
  const candidate = await connect(c.cookie),
    interviewer = await connect(hr.cookie),
    outsider = await connect(other.cookie);
  const body = {
    interviewId: interview.id,
    camera: true,
    microphone: false,
    screen: true,
  };
  expect((await emit(outsider, "media:state", body)).ok).toBe(false);
  expect(
    (await emit(candidate, "room:join", { interviewId: interview.id })).ok,
  ).toBe(true);
  expect(
    (await emit(interviewer, "room:join", { interviewId: interview.id })).ok,
  ).toBe(true);
  const received = new Promise<any>((resolve) =>
    interviewer.once("media:state", resolve),
  );
  expect((await emit(candidate, "media:state", body)).ok).toBe(true);
  expect(await received).toMatchObject({ ...body, from: c.user.id });
  expect(
    (
      await emit(candidate, "media:state", {
        ...body,
        interviewId: new mongoose.Types.ObjectId().toString(),
      })
    ).ok,
  ).toBe(false);
  await InterviewModel.updateOne(
    { _id: interview.id },
    { status: "completed", endedAt: new Date() },
  );
  expect((await emit(candidate, "media:state", body)).ok).toBe(false);
});
it("rejects empty/ambiguous signalling and replaces a participant's stale tab safely", async () => {
  const first = await connect(c.cookie);
  await emit(first, "room:join", { interviewId: interview.id });
  expect((await emit(first, "signal", { interviewId: interview.id })).ok).toBe(
    false,
  );
  expect(
    (
      await emit(first, "signal", {
        interviewId: interview.id,
        description: { type: "offer", sdp: "test" },
        candidate: { candidate: "test" },
      })
    ).ok,
  ).toBe(false);
  const disconnected = new Promise<string>((resolve) =>
    first.once("disconnect", resolve),
  );
  const second = await connect(c.cookie);
  expect(
    (await emit(second, "room:join", { interviewId: interview.id })).ok,
  ).toBe(true);
  expect(await disconnected).toBe("io server disconnect");
  expect(
    (
      await emit(second, "signal", {
        interviewId: interview.id,
        description: {
          type: "offer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n",
        },
      })
    ).ok,
  ).toBe(true);
});
it("blocks in-person media joins and revalidates the mode on signaling and media updates", async () => {
  const { meeting } = await preparedRoom();
  await InterviewModel.updateOne(
    { _id: meeting.id },
    {
      $set: {
        mode: "in_person",
        status: "live",
        consentAt: new Date(),
        admittedAt: new Date(),
      },
    },
  );
  const interviewer = await connect(hr.cookie),
    candidate = await connect(c.cookie);
  const room = { interviewId: meeting.id };
  expect((await emit(interviewer, "room:watch", room)).ok).toBe(true);
  for (const participant of [interviewer, candidate]) {
    const joined = await emit(participant, "room:join", room);
    expect(joined.ok).toBe(false);
    expect(joined.error).toContain("in-person");
  }
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { mode: "video" } },
  );
  expect((await emit(interviewer, "room:join", room)).ok).toBe(true);
  await InterviewModel.updateOne(
    { _id: meeting.id },
    { $set: { mode: "in_person" } },
  );
  const signaling = await emit(interviewer, "signal", {
    ...room,
    candidate: { candidate: "candidate:fixture" },
  });
  expect(signaling.ok).toBe(false);
  expect(signaling.error).toContain("in-person");
  const media = await emit(interviewer, "media:state", {
    ...room,
    camera: true,
    microphone: true,
    screen: false,
  });
  expect(media.ok).toBe(false);
  expect(media.error).toContain("in-person");
});
it("batches monitoring metadata idempotently even when the response is retried concurrently", async () => {
  const event = {
    clientEventId: randomUUID(),
    kind: "screen-share-started",
    occurredAt: new Date().toISOString(),
    durationMs: 0,
    detail: "Shared browser tab",
  };
  const responses = await Promise.all([
    c.http
      .post(`/api/interviews/${interview.id}/events`)
      .send({ events: [event] }),
    c.http
      .post(`/api/interviews/${interview.id}/events`)
      .send({ events: [event] }),
  ]);
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  expect(
    await MonitoringModel.countDocuments({
      clientEventId: event.clientEventId,
    }),
  ).toBe(1);
  expect(
    (await c.http.get(`/api/interviews/${interview.id}/events`)).status,
  ).toBe(403);
  expect(
    (await hr.http.get(`/api/interviews/${interview.id}/events`)).body.some(
      (e: any) => e.clientEventId === event.clientEventId,
    ),
  ).toBe(true);
});
it("persists tab departure and return duration for the assigned HR to review", async () => {
  const at = Date.now();
  const departure = {
    clientEventId: randomUUID(),
    kind: "hidden",
    occurredAt: new Date(at - 2400).toISOString(),
    durationMs: 0,
    detail: "Tab departure 1 · browser online",
  };
  const returned = {
    clientEventId: randomUUID(),
    kind: "visible",
    occurredAt: new Date(at).toISOString(),
    durationMs: 2400,
    detail: "Returned after tab departure 1 · browser online",
  };
  const saved = await c.http
    .post(`/api/interviews/${interview.id}/events`)
    .send({ events: [departure, returned] });
  expect(saved.status).toBe(201);
  const timeline = await hr.http.get(`/api/interviews/${interview.id}/events`);
  expect(timeline.status).toBe(200);
  expect(
    timeline.body.find(
      (event: any) => event.clientEventId === returned.clientEventId,
    ),
  ).toMatchObject({
    kind: "visible",
    durationMs: 2400,
    occurredAt: returned.occurredAt,
  });
  expect((await InterviewModel.findById(interview.id))?.status).toBe("live");
});
it("enforces consent and candidate ownership and limits batch size", async () => {
  const event = {
    clientEventId: randomUUID(),
    kind: "camera-off",
    occurredAt: new Date().toISOString(),
  };
  expect(
    (
      await other.http
        .post(`/api/interviews/${interview.id}/events`)
        .send({ events: [event] })
    ).status,
  ).toBe(404);
  expect(
    (
      await hr.http
        .post(`/api/interviews/${interview.id}/events`)
        .send({ events: [event] })
    ).status,
  ).toBe(403);
  expect(
    (
      await c.http
        .post(`/api/interviews/${interview.id}/events`)
        .send({ events: Array(31).fill(event) })
    ).status,
  ).toBe(400);
  await InterviewModel.updateOne(
    { _id: interview.id },
    { $unset: { consentAt: 1 } },
  );
  expect(
    (
      await c.http
        .post(`/api/interviews/${interview.id}/events`)
        .send({ events: [event] })
    ).status,
  ).toBe(403);
});
it("accepts recently queued in-call events after completion but rejects newly fabricated or late uploads", async () => {
  const end = Date.now() - 2000;
  await InterviewModel.updateOne(
    { _id: interview.id },
    { status: "completed", endedAt: new Date(end) },
  );
  const event = {
    clientEventId: randomUUID(),
    kind: "blur",
    occurredAt: new Date(end - 1000).toISOString(),
  };
  expect(
    (
      await c.http
        .post(`/api/interviews/${interview.id}/events`)
        .send({ events: [event] })
    ).status,
  ).toBe(201);
  expect(
    (
      await c.http.post(`/api/interviews/${interview.id}/events`).send({
        events: [
          {
            ...event,
            clientEventId: randomUUID(),
            occurredAt: new Date(end + 20000).toISOString(),
          },
        ],
      })
    ).status,
  ).toBe(400);
  await InterviewModel.updateOne(
    { _id: interview.id },
    { endedAt: new Date(Date.now() - 601000) },
  );
  expect(
    (
      await c.http
        .post(`/api/interviews/${interview.id}/events`)
        .send({ events: [event] })
    ).status,
  ).toBe(409);
});
it.each(["scheduled", "live"])(
  "authorizes %s interview participants before requesting Twilio credentials and prevents response caching",
  async (status) => {
    await InterviewModel.updateOne({ _id: interview.id }, { $set: { status } });
    const account = `AC${"1".repeat(32)}`;
    Object.assign(config, {
      turnProvider: "twilio",
      twilioAccountSid: account,
      twilioApiKeySid: `SK${"2".repeat(32)}`,
      twilioApiKeySecret: "private-test-key",
      turnTtl: 3600,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        account_sid: account,
        ttl: 3600,
        ice_servers: [
          {
            urls: "turn:global.turn.twilio.com:3478?transport=udp",
            username: "temporary-test-user",
            credential: "temporary-test-password",
          },
        ],
      }),
    );
    const endpoint = `/api/interviews/${interview.id}/ice`;
    expect((await request(app).get(endpoint)).status).toBe(401);
    expect([403, 404]).toContain((await other.http.get(endpoint)).status);
    expect(fetchMock).not.toHaveBeenCalled();
    const response = await c.http.get(endpoint);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.iceServers[0].credential).toBe(
      "temporary-test-password",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it.each(["completed", "cancelled"])(
  "does not request relay credentials for a %s interview",
  async (status) => {
    Object.assign(config, {
      turnProvider: "twilio",
      twilioAccountSid: `AC${"1".repeat(32)}`,
      twilioApiKeySid: `SK${"2".repeat(32)}`,
      twilioApiKeySecret: "private-test-key",
    });
    await InterviewModel.updateOne({ _id: interview.id }, { $set: { status } });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Provider must not be contacted"));
    const response = await c.http.get(`/api/interviews/${interview.id}/ice`);
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain("scheduled or live");
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("creates expiring user-specific relay credentials for UDP, TCP and TLS without returning the secret", async () => {
  config.turnUrl =
    "turn:relay.example.test:3478?transport=udp,turns:relay.example.test:5349?transport=tcp";
  config.turnSecret = "test-only-relay-secret";
  config.turnTtl = 3600;
  const ice = await iceConfiguration(c.user.id),
    turn = ice.iceServers[1];
  expect(turn.urls).toHaveLength(2);
  expect(turn.username).toContain(c.user.id);
  expect(Number(turn.username!.split(":")[0])).toBeGreaterThan(
    Date.now() / 1000 + 3500,
  );
  expect(turn.credential).toBe(
    createHmac("sha1", config.turnSecret)
      .update(turn.username!)
      .digest("base64"),
  );
  expect(JSON.stringify(ice)).not.toContain(config.turnSecret);
  config.turnUrl = "https://not-a-turn-server.example.test";
  await expect(iceConfiguration(c.user.id)).rejects.toThrow(
    "Video server settings",
  );
});
it("does not expose a local-only relay in production", async () => {
  config.production = true;
  config.turnLocalDev = true;
  await expect(iceConfiguration(c.user.id)).rejects.toThrow(
    "local test relay cannot serve production",
  );
});
it("does not assign integrity points for device outages, screen sharing or coarse head orientation", () => {
  const review = analyzeIntegrity(
    [
      "camera-off",
      "microphone-off",
      "screen-share-stopped",
      "monitoring-unavailable",
      "head-turned",
    ].map((kind) => ({ kind, occurredAt: new Date().toISOString() })),
  );
  expect(review.score).toBe(0);
  expect(review.coverage.monitoringUnavailable).toBe(true);
});

it("requires resume, consent, camera readiness and assigned HR admission before candidate entry", async () => {
  const { meeting, resume, base } = await preparedRoom();
  expect((await c.http.post(`${base}/start`).send({})).status).toBe(403);
  expect(
    (await c.http.post(`${base}/room/wait`).send({ cameraReady: true })).status,
  ).toBe(403);
  expect(
    (await c.http.post(`${base}/consent`).send({ accepted: true })).status,
  ).toBe(200);
  expect(
    (await c.http.post(`${base}/room/wait`).send({ cameraReady: true })).status,
  ).toBe(409);
  expect(
    (await c.http.post(`${base}/room/resume`).send({ resumeId: resume.id }))
      .status,
  ).toBe(200);
  expect(
    (await c.http.post(`${base}/room/wait`).send({ cameraReady: false }))
      .status,
  ).toBe(409);
  expect((await c.http.post(`${base}/room/policy`).send({})).status).toBe(404);
  expect(
    (
      await c.http.patch(`${base}/room/policy`).send({
        cameraAccommodation: true,
        screenRequired: true,
        entireScreen: false,
      })
    ).status,
  ).toBe(403);
  const candidate = await connect(c.cookie);
  expect(
    (await emit(candidate, "room:join", { interviewId: meeting.id })).ok,
  ).toBe(false);
  const interviewer = await connect(hr.cookie);
  expect(
    (await emit(interviewer, "room:watch", { interviewId: meeting.id })).ok,
  ).toBe(true);
  const waiting = new Promise<any>((resolve) =>
    interviewer.once("room:update", resolve),
  );
  expect(
    (await c.http.post(`${base}/room/wait`).send({ cameraReady: true })).status,
  ).toBe(200);
  expect(await waiting).toMatchObject({
    interviewId: meeting.id,
    kind: "waiting",
  });
  expect((await c.http.post(`${base}/room/admit`).send({})).status).toBe(403);
  expect((await other.http.post(`${base}/room/admit`).send({})).status).toBe(
    403,
  );
  expect((await hr.http.post(`${base}/room/admit`).send({})).status).toBe(200);
  expect((await c.http.post(`${base}/start`).send({})).status).toBe(200);
  expect(
    (await emit(candidate, "room:join", { interviewId: meeting.id })).ok,
  ).toBe(true);
  expect(
    (await c.http.post(`${base}/room/resume`).send({ resumeId: resume.id }))
      .status,
  ).toBe(409);
  expect(
    (
      await hr.http.patch(`${base}/room/policy`).send({
        cameraAccommodation: true,
        screenRequired: false,
        entireScreen: false,
      })
    ).status,
  ).toBe(409);
});

it("keeps the interview PDF private until candidate sharing and rejects invalid uploads and outsiders", async () => {
  const { meeting, resume, base, pdf } = await preparedRoom();
  expect(
    (
      await c.http
        .post(`${base}/room/resume/upload`)
        .attach("resume", Buffer.from("not a pdf"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        })
    ).status,
  ).toBe(400);
  expect(
    (
      await c.http.post(`${base}/room/resume/upload`).attach("resume", pdf, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      })
    ).status,
  ).toBe(201);
  expect(
    (await other.http.post(`${base}/room/resume`).send({ resumeId: resume.id }))
      .status,
  ).toBe(404);
  expect((await hr.http.get(`${base}/room/resume/pdf`)).status).toBe(404);
  expect((await hr.http.get(`${base}/room`)).body.resumeId).toBeUndefined();
  expect(
    (await c.http.get(`${base}/room/resume/pdf`)).headers["content-type"],
  ).toContain("application/pdf");
  await c.http.post(`${base}/consent`).send({ accepted: true });
  await c.http.post(`${base}/room/wait`).send({ cameraReady: true });
  await hr.http.post(`${base}/room/admit`).send({});
  expect((await c.http.post(`${base}/room/resume/share`).send({})).status).toBe(
    200,
  );
  expect((await hr.http.get(`${base}/room/resume/pdf`)).status).toBe(200);
  expect((await other.http.get(`${base}/room/resume/pdf`)).status).toBe(404);
  const unassigned = await actor("hr");
  expect([403, 404]).toContain(
    (await unassigned.http.get(`${base}/room/resume/pdf`)).status,
  );
  expect((await hr.http.get(`${base}/room`)).body.interviewerName).toBe(
    hr.user.name,
  );
  expect((await c.http.get(`${base}`)).body.roomResumeId).toBeUndefined();
  expect(
    (await InterviewModel.findById(meeting.id))?.roomResumeId,
  ).toBeTruthy();
});

it("supports an explicitly HR-approved camera accommodation and enforces role checks on room controls", async () => {
  const { resume, base } = await preparedRoom();
  await c.http.post(`${base}/consent`).send({ accepted: true });
  await c.http.post(`${base}/room/resume`).send({ resumeId: resume.id });
  expect(
    (
      await hr.http.patch(`${base}/room/policy`).send({
        cameraAccommodation: true,
        screenRequired: true,
        entireScreen: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (await c.http.post(`${base}/room/wait`).send({ cameraReady: false }))
      .status,
  ).toBe(200);
  expect((await hr.http.post(`${base}/room/admit`).send({})).status).toBe(200);
  expect(
    (await c.http.post(`${base}/room/instruction`).send({ text: "forbidden" }))
      .status,
  ).toBe(403);
  expect(
    (
      await hr.http.post(`${base}/room/instruction`).send({
        text: "Please share your entire screen",
        kind: "screen-request",
      })
    ).status,
  ).toBe(200);
  expect((await c.http.get(`${base}/room`)).body.instruction.kind).toBe(
    "screen-request",
  );
  expect(
    (
      await c.http
        .post(`${base}/room/question`)
        .send({ problemId: "sum-pairs" })
    ).status,
  ).toBe(403);
  expect(
    (
      await hr.http.post(`${base}/room/question`).send({
        problemId: "sum-pairs",
        prompt: "Explain the complexity of your solution",
      })
    ).status,
  ).toBe(200);
  const question = (await c.http.get(`${base}/problem`)).body;
  expect(question.tests).toBeUndefined();
  expect((await c.http.get(`${base}/room`)).body.codingPrompt).toContain(
    "complexity",
  );
  await hr.http
    .patch(`${base}/notes`)
    .send({ notes: "Private reviewer evidence" });
  expect((await c.http.get(base)).body.notes).toBeUndefined();
  expect(JSON.stringify((await c.http.get(`${base}/room`)).body)).not.toContain(
    "Private reviewer evidence",
  );
});

it("pushes authorized live-code updates, preserves drafts on reconnect, and reports unavailable execution honestly", async () => {
  const candidate = await connect(c.cookie),
    interviewer = await connect(hr.cookie),
    outsider = await connect(other.cookie);
  expect(
    (await emit(outsider, "room:watch", { interviewId: interview.id })).ok,
  ).toBe(false);
  expect(
    (await emit(interviewer, "room:watch", { interviewId: interview.id })).ok,
  ).toBe(true);
  const received = new Promise<any>((resolve) =>
    interviewer.once("room:update", resolve),
  );
  const code =
    "public class Main { public static void main(String[] args) { System.out.println(7); } }";
  expect(
    (
      await c.http
        .patch(`/api/interviews/${interview.id}/draft`)
        .send({ language: "java", code })
    ).status,
  ).toBe(200);
  expect(await received).toEqual({ interviewId: interview.id, kind: "code" });
  expect(
    (await hr.http.get(`/api/interviews/${interview.id}`)).body.drafts.java,
  ).toBe(code);
  expect(
    (await hr.http.get(`/api/interviews/${interview.id}/room`)).body
      .activeLanguage,
  ).toBe("java");
  candidate.disconnect();
  const reconnected = await connect(c.cookie);
  expect(
    (await emit(reconnected, "room:join", { interviewId: interview.id })).ok,
  ).toBe(true);
  expect(
    (await c.http.get(`/api/interviews/${interview.id}`)).body.drafts.java,
  ).toBe(code);
  config.judgeUrl = "";
  expect(
    (
      await c.http
        .post(`/api/interviews/${interview.id}/code`)
        .send({ language: "java", code, mode: "run" })
    ).status,
  ).toBe(503);
  expect(
    (await c.http.get(`/api/interviews/${interview.id}/submissions`)).body,
  ).toHaveLength(0);
});

it("rejects HR screen publication and invalid media layouts at the authenticated signaling boundary", async () => {
  const hrSocket = await connect(hr.cookie);
  await emit(hrSocket, "room:join", { interviewId: interview.id });
  expect(
    (
      await emit(hrSocket, "media:state", {
        interviewId: interview.id,
        camera: true,
        microphone: true,
        screen: true,
      })
    ).ok,
  ).toBe(false);
  const prefix =
    "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n";
  for (const direction of ["sendrecv", "sendonly", ""]) {
    const sdp = prefix + (direction ? `a=${direction}\r\n` : "");
    expect(
      (
        await emit(hrSocket, "signal", {
          interviewId: interview.id,
          description: { type: "offer", sdp },
        })
      ).ok,
    ).toBe(false);
  }
  expect(
    (
      await emit(hrSocket, "signal", {
        interviewId: interview.id,
        description: { type: "offer", sdp: prefix + "a=recvonly\r\n" },
      })
    ).ok,
  ).toBe(true);
  expect(() =>
    validateRoomSdp(prefix + "a=recvonly\r\na=sendrecv\r\n", false),
  ).toThrow();
  expect(() => validateRoomSdp(prefix + "a=sendonly\r\n", true)).not.toThrow();
  expect(() => validateRoomSdp(prefix + "a=recvonly\r\n", true)).toThrow();
  expect(() =>
    validateRoomSdp(
      prefix + "a=recvonly\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n",
      false,
    ),
  ).toThrow();
});

it("pushes end-of-meeting updates and rejects media and writes after the assigned HR ends it", async () => {
  const { resume, meeting, base } = await preparedRoom();
  await c.http.post(`${base}/consent`).send({ accepted: true });
  await c.http.post(`${base}/room/resume`).send({ resumeId: resume.id });
  await c.http.post(`${base}/room/wait`).send({ cameraReady: true });
  await hr.http.post(`${base}/room/admit`).send({});
  const socket = await connect(c.cookie);
  await emit(socket, "room:watch", { interviewId: meeting.id });
  await emit(socket, "room:join", { interviewId: meeting.id });
  const ended = new Promise<any>((resolve) =>
    socket.once("room:update", resolve),
  );
  expect((await c.http.post(`${base}/end`).send({})).status).toBe(403);
  expect((await hr.http.post(`${base}/end`).send({})).status).toBe(200);
  expect(await ended).toMatchObject({ kind: "ended" });
  expect(
    (
      await emit(socket, "media:state", {
        interviewId: meeting.id,
        camera: true,
        microphone: true,
        screen: true,
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await c.http
        .patch(`${base}/draft`)
        .send({ language: "java", code: "late" })
    ).status,
  ).toBe(409);
  expect(
    (await hr.http.post(`${base}/room/instruction`).send({ text: "late" }))
      .status,
  ).toBe(409);
});
