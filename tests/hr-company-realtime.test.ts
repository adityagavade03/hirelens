import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as client, type Socket } from "socket.io-client";
import { attachRealtime } from "../server/realtime";
import { hashToken } from "../server/security";
import {
  ApplicationModel,
  CompanyModel,
  connectDatabase,
  InterviewModel,
  JobModel,
  SessionModel,
  UserModel,
} from "../server/models";

const server = createServer(express());
const realtime = attachRealtime(server);
const sockets: Socket[] = [];
let db: MongoMemoryServer;
let url: string,
  a: string,
  b: string,
  foreign: string,
  hrId: string,
  cookie: string;
let roomA: string, roomB: string;

async function connect(companyId?: unknown) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = client(url, {
      forceNew: true,
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      auth: companyId === undefined ? {} : { companyId },
      reconnection: false,
      timeout: 4000,
    });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}
const emit = (socket: Socket, event: string, body: object) =>
  socket.timeout(3000).emitWithAck(event, body);

async function room(companyId: string, label: string) {
  const candidate = await UserModel.create({
    role: "candidate",
    name: `Candidate ${label}`,
    email: `${randomUUID()}@example.test`,
    passwordHash: "unused-fixture",
  });
  const job = await JobModel.create({
    companyId,
    companyName: label,
    title: `${label} engineer`,
    status: "published",
    hrRequests: [{ hrId, status: "accepted" }],
  });
  const application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId: candidate.id,
    candidateName: candidate.name,
    assignedHrId: hrId,
    jobTitle: job.title,
    companyName: label,
    resumeId: new mongoose.Types.ObjectId().toString(),
    snapshot: candidate.profile,
    status: "Interview Scheduled",
  });
  return (
    await InterviewModel.create({
      applicationId: application.id,
      companyId,
      companyName: label,
      candidateId: candidate.id,
      candidateName: candidate.name,
      interviewerId: hrId,
      jobTitle: job.title,
      type: "technical",
      mode: "video",
      status: "live",
      consentAt: new Date(),
      admittedAt: new Date(),
      startedAt: new Date(),
      scheduledAt: new Date(),
      duration: 45,
    })
  ).id;
}

beforeAll(async () => {
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: { launchTimeout: 60000 },
  });
  await connectDatabase(db.getUri("hr_company_realtime"));
  const companies = await CompanyModel.insertMany(
    ["Alpha", "Beta", "Outside"].map((name) => ({
      ownerId: new mongoose.Types.ObjectId().toString(),
      name,
      identifier: `SOCKET-${name}`,
    })),
  );
  [a, b, foreign] = companies.map((company) => company.id);
  const hr = await UserModel.create({
    role: "hr",
    name: "Shared HR",
    email: "shared-hr@socket.example.test",
    passwordHash: "unused-fixture",
    companyId: a,
    companyIds: [a, b],
  });
  hrId = hr.id;
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId: hrId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  cookie = `hirelens_session=${token}`;
  roomA = await room(a, "Alpha");
  roomB = await room(b, "Beta");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
  await UserModel.updateOne(
    { _id: hrId },
    { $set: { companyId: a, companyIds: [a, b] } },
  );
});
afterAll(async () => {
  await new Promise<void>((resolve) => realtime.close(() => resolve()));
  await mongoose.disconnect();
  await db?.stop();
});

describe("multi-company HR room isolation", () => {
  it("keeps the legacy default socket in company A and requires explicit company B context for room B", async () => {
    const defaultSocket = await connect();
    expect(
      await emit(defaultSocket, "room:watch", { interviewId: roomA }),
    ).toMatchObject({ ok: true });
    expect(
      await emit(defaultSocket, "room:watch", { interviewId: roomB }),
    ).toMatchObject({ ok: false });
    expect(
      await emit(defaultSocket, "room:join", { interviewId: roomB }),
    ).toMatchObject({ ok: false });
    const betaSocket = await connect(b);
    expect(
      await emit(betaSocket, "room:watch", { interviewId: roomB }),
    ).toMatchObject({ ok: true });
    expect(
      await emit(betaSocket, "room:join", { interviewId: roomB }),
    ).toMatchObject({ ok: true });
    expect(
      await emit(betaSocket, "room:watch", { interviewId: roomA }),
    ).toMatchObject({ ok: false });
  });

  it("rejects unjoined and malformed company selections during the handshake", async () => {
    await expect(connect(foreign)).rejects.toThrow();
    await expect(connect("malformed")).rejects.toThrow();
    await expect(connect({ companyId: b })).rejects.toThrow();
  });

  it("pins an existing connection to its company even if the account default changes", async () => {
    const socket = await connect();
    await UserModel.updateOne({ _id: hrId }, { $set: { companyId: b } });
    expect(
      await emit(socket, "room:watch", { interviewId: roomA }),
    ).toMatchObject({ ok: true });
    expect(
      await emit(socket, "room:watch", { interviewId: roomB }),
    ).toMatchObject({ ok: false });
  });

  it("disconnects a joined room after membership is revoked rather than leaving the HR subscribed", async () => {
    const socket = await connect(b);
    expect(
      await emit(socket, "room:watch", { interviewId: roomB }),
    ).toMatchObject({ ok: true });
    expect(
      await emit(socket, "room:join", { interviewId: roomB }),
    ).toMatchObject({ ok: true });
    await UserModel.updateOne({ _id: hrId }, { $pull: { companyIds: b } });
    const disconnected = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error("Revoked company connection remained subscribed")),
        4000,
      );
      socket.once("disconnect", (reason) => {
        clearTimeout(timer);
        resolve(reason);
      });
    });
    socket.emit("room:watch", { interviewId: roomB });
    expect(await disconnected).toBe("io server disconnect");
    expect(socket.connected).toBe(false);
  });
});
