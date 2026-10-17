import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createServer, type Server } from "node:http";
import { io as client, type Socket } from "socket.io-client";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import PDFDocument from "pdfkit";
import { createApp } from "../server/app";
import { attachRealtime } from "../server/realtime";
import {
  connectDatabase,
  SessionModel,
  UserModel,
  ApplicationModel,
  InterviewModel,
  MonitoringModel,
} from "../server/models";
import { config } from "../server/config";
import {
  generateQuestions,
  assessAnswer,
  executeCode,
  feedbackSchema,
} from "../server/providers";
import { extractResume } from "../server/resume";
import { matchResume } from "../server/matching";
import { hashToken } from "../server/security";
import { registerCompany } from "./company-fixture";

let db: MongoMemoryServer;
let server: Server;
let io: ReturnType<typeof attachRealtime>;
let url: string;
const app = createApp();
const owner = request.agent(app);
const outsider = request.agent(app);
const hr = request.agent(app);
const candidate = request.agent(app);
const stranger = request.agent(app);
let ownerUser: any;
let hrUser: any;
let candidateUser: any;
let job: any;
let application: any;
let interview: any;
let report: any;
let candidateCookie: string;
let hrCookie: string;
let outsiderCookie: string;
let ownerCookie: string;
const profile = {
  name: "Test Candidate",
  phone: "",
  location: "India",
  headline: "Developer",
  education: "Computer Science",
  skills: ["React", "TypeScript"],
  experience: "Built web projects",
  projects: "A React project using TypeScript with tests",
  certifications: "",
  expertise: "",
};
const jobInput = {
  title: "Frontend Engineer",
  description: "Build accessible interfaces with React and TypeScript.",
  skills: ["React", "TypeScript", "Testing"],
  experience: "0–2 years",
  location: "Remote",
  employment: "Full-time",
  criteria: "Explain technical decisions",
  status: "published",
};
async function makePdf(content: string) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.text(content);
    doc.end();
  });
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeAll(async () => {
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: { launchTimeout: 60000 },
  });
  await connectDatabase(db.getUri("hirelens_test"));
  server = createServer(app);
  io = attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  vi.restoreAllMocks();
  io?.close();
  server?.close();
  await mongoose.disconnect();
  await db?.stop();
});
describe("Real MongoDB hiring workflow and isolation", () => {
  it("registers roles, hashes passwords, sets an opaque cookie, and rejects invalid auth", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const a = await registerCompany(owner, {
      name: "Company Owner",
      email: "owner@example.test",
      password: "TestPassword!2026",
      role: "company",
      companyName: "One Company",
    });
    expect(a.status).toBe(200);
    ownerUser = a.body.user;
    ownerCookie = a.headers["set-cookie"][0].split(";")[0];
    expect(a.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(a.body.user.passwordHash).toBeUndefined();
    const b = await registerCompany(outsider, {
      name: "Other Owner",
      email: "other@example.test",
      password: "TestPassword!2026",
      role: "company",
      companyName: "Other Company",
    });
    outsiderCookie = b.headers["set-cookie"][0].split(";")[0];
    const h = await hr.post("/api/auth/register").send({
      name: "HR Person",
      email: "hr@example.test",
      password: "TestPassword!2026",
      role: "hr",
    });
    hrUser = h.body.user;
    hrCookie = h.headers["set-cookie"][0].split(";")[0];
    const c = await candidate.post("/api/auth/register").send({
      name: "Test Candidate",
      email: "candidate@example.test",
      password: "TestPassword!2026",
      role: "candidate",
    });
    candidateUser = c.body.user;
    candidateCookie = c.headers["set-cookie"][0].split(";")[0];
    await stranger.post("/api/auth/register").send({
      name: "Stranger Candidate",
      email: "stranger@example.test",
      password: "TestPassword!2026",
      role: "candidate",
    });
    const stored = await UserModel.findById(candidateUser._id).select(
      "+passwordHash",
    );
    expect(stored!.passwordHash).not.toBe("TestPassword!2026");
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: "candidate@example.test", password: "wrong" })
      ).status,
    ).toBe(401);
    expect(
      (
        await owner
          .post("/api/jobs")
          .set("Origin", "https://evil.example")
          .send(jobInput)
      ).status,
    ).toBe(403);
  });
  it("associates HR only after an invitation and enforces role permissions", async () => {
    expect((await candidate.post("/api/jobs").send(jobInput)).status).toBe(403);
    const invite = await owner
      .post("/api/invitations")
      .send({ email: "hr@example.test" });
    expect(invite.status).toBe(201);
    expect(
      (
        await hr
          .patch(`/api/invitations/${invite.body._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    expect((await hr.get("/api/company")).body.company._id).toBe(
      ownerUser.companyId,
    );
    expect(
      (
        await outsider
          .post("/api/invitations")
          .send({ email: "hr@example.test" })
      ).status,
    ).toBe(409);
  });
  it("creates jobs without granting HR access before acceptance", async () => {
    const result = await owner.post("/api/jobs").send(jobInput);
    expect(result.status).toBe(201);
    job = result.body;
    expect((await hr.get("/api/jobs")).body).toHaveLength(0);
    expect((await outsider.get("/api/jobs")).body).toHaveLength(0);
    expect(
      (await outsider.patch(`/api/jobs/${job._id}`).send(jobInput)).status,
    ).toBe(404);
    const unassigned = await owner
      .post("/api/jobs")
      .send({ ...jobInput, title: "Private Draft", status: "draft" });
    expect(unassigned.status).toBe(201);
    expect((await hr.get("/api/jobs")).body).toHaveLength(0);
    expect((await candidate.get("/api/jobs")).body).toHaveLength(1);
  });
  it("extracts a PDF, handles invalid/scanned documents, and snapshots immutable application evidence", async () => {
    expect((await candidate.patch("/api/profile").send(profile)).status).toBe(
      200,
    );
    expect(
      (
        await candidate
          .post("/api/profile/resume")
          .attach("resume", Buffer.from("not pdf"), "bad.pdf")
      ).status,
    ).toBe(400);
    const blank = await makePdf("");
    expect(
      (
        await candidate
          .post("/api/profile/resume")
          .attach("resume", blank, "blank.pdf")
      ).status,
    ).toBe(422);
    const pdf = await makePdf(
      "Test Candidate. React and TypeScript developer. Built a project with React and TypeScript. Testing experience from coursework.",
    );
    const upload = await candidate
      .post("/api/profile/resume")
      .attach("resume", pdf, "resume.pdf");
    expect(upload.status).toBe(201);
    const applied = await candidate.post(`/api/jobs/${job._id}/apply`).send({
      ...profile,
      email: candidateUser.email,
      phone: "+91 98765 43210",
      city: "Bengaluru",
      state: "Karnataka",
      resumeId: upload.body.resumeId,
      resumeConfirmed: true,
      detailsConfirmed: true,
    });
    expect(applied.status).toBe(201);
    application = applied.body;
    expect(application.match.score).toBeNull();
    expect(application.screening.state).toBe("queued");
    expect(
      (await candidate.post(`/api/jobs/${job._id}/apply`).send({})).status,
    ).toBe(409);
    expect(
      (await outsider.get(`/api/resumes/${upload.body.resumeId}`)).status,
    ).toBe(404);
    expect((await hr.get(`/api/resumes/${upload.body.resumeId}`)).status).toBe(
      404,
    );
    await candidate
      .patch("/api/profile")
      .send({ ...profile, skills: ["Python"] });
    await candidate
      .post("/api/profile/resume")
      .attach(
        "resume",
        await makePdf(
          "New resume revision with Python projects, education and experience in data processing.",
        ),
        "new.pdf",
      );
    const saved = await ApplicationModel.findById(application._id);
    expect(saved!.snapshot.skills).toEqual(["React", "TypeScript"]);
    expect(saved!.resumeId).toBe(upload.body.resumeId);
    expect((await stranger.get("/api/applications")).body).toHaveLength(0);
  });
  it("checks status transitions, scheduling authorization and UTC timestamps", async () => {
    expect(
      (
        await outsider
          .patch(`/api/applications/${application._id}/status`)
          .send({ status: "Shortlisted" })
      ).status,
    ).toBe(404);
    expect(
      (
        await candidate
          .patch(`/api/applications/${application._id}/status`)
          .send({ status: "Shortlisted" })
      ).status,
    ).toBe(403);
    expect(
      (
        await owner
          .patch(`/api/applications/${application._id}/status`)
          .send({ status: "Shortlisted" })
      ).status,
    ).toBe(200);
    expect(
      (
        await owner
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [hrUser._id] })
      ).status,
    ).toBe(201);
    expect((await hr.get("/api/jobs")).body).toHaveLength(0);
    expect((await hr.get("/api/applications")).body).toHaveLength(0);
    expect(
      (await hr.get(`/api/jobs/${job._id}`)).body.applications,
    ).toHaveLength(0);
    expect(
      (
        await owner.patch(`/api/jobs/${job._id}/distribution`).send({
          assignments: [
            {
              applicationId: application._id,
              hrId: hrUser._id,
              expectedHrId: null,
            },
          ],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await hr
          .patch(`/api/hr/assignments/${job._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    expect((await hr.get("/api/jobs")).body).toHaveLength(1);
    expect((await hr.get("/api/applications")).body).toHaveLength(1);
    expect(
      (
        await owner.patch(`/api/jobs/${job._id}/distribution`).send({
          assignments: [
            {
              applicationId: application._id,
              hrId: hrUser._id,
              expectedHrId: hrUser._id,
            },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await hr.get(`/api/resumes/${application.resumeId}`)).status).toBe(
      200,
    );
    const schedule = {
      applicationId: application._id,
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      timezone: "Asia/Kolkata",
      duration: 30,
      type: "technical",
      topics: ["React", "Testing"],
      difficulty: "Beginner",
      problemId: "sum-pairs",
      interviewerId: hrUser._id,
    };
    expect((await owner.post("/api/interviews").send(schedule)).status).toBe(
      403,
    );
    const scheduled = await hr.post("/api/interviews").send(schedule);
    expect(scheduled.status).toBe(201);
    interview = scheduled.body;
    for (const action of ["start", "cancel", "end", "questions"])
      expect(
        (
          await owner
            .post(`/api/interviews/${interview._id}/${action}`)
            .send({})
        ).status,
      ).toBe(403);
    for (const action of ["notes", "schedule", "answers/test/override"])
      expect(
        (
          await owner
            .patch(`/api/interviews/${interview._id}/${action}`)
            .send({})
        ).status,
      ).toBe(403);
    expect(
      (await owner.get(`/api/interviews/${interview._id}/ice`)).status,
    ).toBe(403);
    expect((await owner.get(`/api/interviews/${interview._id}`)).status).toBe(
      200,
    );
    expect(interview.scheduledAt).toBe(schedule.scheduledAt);
    expect((await hr.post("/api/interviews").send(schedule)).status).toBe(409);
    expect(
      (await outsider.get(`/api/interviews/${interview._id}`)).status,
    ).toBe(404);
    expect(
      (await stranger.get(`/api/interviews/${interview._id}`)).status,
    ).toBe(404);
    expect(
      (await candidate.post(`/api/interviews/${interview._id}/start`).send({}))
        .status,
    ).toBe(403);
    expect(
      (await owner.post(`/api/interviews/${interview._id}/start`).send({}))
        .status,
    ).toBe(403);
    expect(
      (await hr.post(`/api/interviews/${interview._id}/start`).send({})).status,
    ).toBe(200);
    expect(
      (
        await candidate
          .patch(`/api/interviews/${interview._id}/draft`)
          .send({ language: "python", code: "print(1)" })
      ).status,
    ).toBe(403);
    await candidate
      .post(`/api/interviews/${interview._id}/consent`)
      .send({ accepted: true });
    expect(
      (
        await candidate
          .post(`/api/interviews/${interview._id}/room/resume`)
          .send({ resumeId: application.resumeId })
      ).status,
    ).toBe(200);
    expect(
      (
        await candidate
          .post(`/api/interviews/${interview._id}/room/wait`)
          .send({ cameraReady: true })
      ).status,
    ).toBe(200);
    expect(
      (await hr.post(`/api/interviews/${interview._id}/room/admit`).send({}))
        .status,
    ).toBe(200);
    expect(
      (await candidate.post(`/api/interviews/${interview._id}/start`).send({}))
        .status,
    ).toBe(200);
    expect(
      (await candidate.get("/api/notifications")).body.length,
    ).toBeGreaterThan(0);
  });
  it("authorizes Socket.IO joins, relays signaling, rejects outsider access and supports reconnect", async () => {
    const connect = (cookie: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = client(url, {
          extraHeaders: { Cookie: cookie },
          transports: ["websocket"],
          forceNew: true,
        });
        s.once("connect", () => resolve(s));
        s.once("connect_error", reject);
      });
    const c = await connect(candidateCookie);
    const h = await connect(hrCookie);
    const o = await connect(outsiderCookie);
    const companySocket = await connect(ownerCookie);
    try {
      const join = (s: Socket) =>
        new Promise<any>((resolve) =>
          s.emit("room:join", { interviewId: interview._id }, resolve),
        );
      expect((await join(c)).ok).toBe(true);
      expect((await join(h)).peers).toHaveLength(1);
      expect((await join(o)).ok).toBe(false);
      expect((await join(companySocket)).ok).toBe(false);
      const received = new Promise<any>((resolve) => h.once("signal", resolve));
      c.emit("signal", {
        interviewId: interview._id,
        description: {
          type: "offer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n",
        },
      });
      expect((await received).description.sdp).toBe(
        "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n",
      );
      c.disconnect();
      const reconnected = await connect(candidateCookie);
      expect((await join(reconnected)).ok).toBe(true);
      reconnected.disconnect();
    } finally {
      c.disconnect();
      h.disconnect();
      o.disconnect();
      companySocket.disconnect();
    }
  });
  it("persists typed answers and monitoring, hides HR notes, and validates spoken review", async () => {
    const questionId = interview.questions[0].id;
    expect(
      (
        await candidate.post(`/api/interviews/${interview._id}/answers`).send({
          questionId,
          text: "A spoken answer.",
          mode: "spoken",
          transcriptionReviewed: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await candidate.post(`/api/interviews/${interview._id}/answers`).send({
          questionId,
          text: "I used React components and tested keyboard interactions with integration tests.",
          mode: "typed",
          transcriptionReviewed: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await candidate.post(`/api/interviews/${interview._id}/answers`).send({
          questionId,
          text: "Duplicate answer",
          mode: "typed",
          transcriptionReviewed: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await hr
          .patch(`/api/interviews/${interview._id}/notes`)
          .send({ notes: "Private interviewer notes" })
      ).status,
    ).toBe(200);
    expect(
      (await candidate.get(`/api/interviews/${interview._id}`)).body.notes,
    ).toBeUndefined();
    expect(
      (
        await candidate.post(`/api/interviews/${interview._id}/events`).send({
          kind: "blur",
          occurredAt: new Date().toISOString(),
          durationMs: 4200,
        })
      ).status,
    ).toBe(201);
    expect(
      await MonitoringModel.countDocuments({ interviewId: interview._id }),
    ).toBe(1);
    expect(
      (
        await candidate
          .patch(`/api/interviews/${interview._id}/draft`)
          .send({ language: "python", code: "print(11)" })
      ).status,
    ).toBe(200);
  });
  it("does not send hiring assessment code to the public practice demo, even if the client requests practice context", async () => {
    const original = { ...config };
    Object.assign(config, {
      judgeUrl: "https://ce.judge0.com",
      production: false,
      host: "127.0.0.1",
      origin: "http://localhost:5173",
    });
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      for (const mode of ["run", "submit"]) {
        const result = await candidate
          .post(`/api/interviews/${interview._id}/code`)
          .send({
            language: "python",
            code: "private assessment source",
            mode,
            context: "practice",
          });
        expect(result.status).toBe(403);
        expect(result.body.error.message).toContain("personal practice");
        expect(result.body.error.code).toBe("PRIVATE_EXECUTOR_REQUIRED");
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      Object.assign(config, original);
    }
  });
  it("reports missing providers honestly and saves only real response results from the contract fixture", async () => {
    expect(
      (await hr.post(`/api/interviews/${interview._id}/questions`).send({}))
        .status,
    ).toBe(503);
    expect(
      (
        await candidate
          .post(`/api/interviews/${interview._id}/code`)
          .send({ language: "python", code: "print(11)", mode: "submit" })
      ).status,
    ).toBe(503);
    config.judgeUrl = "https://judge.test";
    let submissions = 0;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/languages"))
          return response([
            { id: 71, name: "Python (3.8.1)" },
            { id: 63, name: "JavaScript (Node.js)" },
            { id: 62, name: "Java (OpenJDK)" },
          ]);
        if (init?.method === "POST") {
          submissions++;
          const body = JSON.parse(String(init.body));
          expect(body.enable_network).toBe(false);
          expect(body.cpu_time_limit).toBe(2);
          expect(body.wall_time_limit).toBe(5);
          expect(body.memory_limit).toBe(128000);
          expect(body.max_file_size).toBe(1024);
          return response({ token: `fixture-${submissions}` });
        }
        return response({
          status: { id: 3, description: "Accepted" },
          stdout: Buffer.from("fixture output").toString("base64"),
          time: "0.01",
          memory: 1234,
        });
      });
    try {
      const result = await candidate
        .post(`/api/interviews/${interview._id}/code`)
        .send({
          language: "python",
          code: "print(sum(map(int,input().split())))",
          mode: "submit",
        });
      expect(result.status).toBe(201);
      expect(result.body.passed).toBe(4);
      expect(result.body.results[2].hidden).toBe(true);
      expect(result.body.results[2].stdout).toBeUndefined();
      expect(result.body.results[0].time).toBe("0.01");
      expect(result.body.code).toBe("print(sum(map(int,input().split())))");
      expect(result.body.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.body.problemId).toBe(interview.problemId);
      await candidate
        .patch(`/api/interviews/${interview._id}/draft`)
        .send({ language: "python", code: "print('edited after execution')" });
      const saved = (
        await hr.get(`/api/interviews/${interview._id}/submissions`)
      ).body[0];
      expect(saved.code).toBe(result.body.code);
      expect(saved.codeHash).toBe(result.body.codeHash);
      expect(saved.results).toEqual(result.body.results);
    } finally {
      fetch.mockRestore();
      config.judgeUrl = "";
    }
  });
  it("creates private reports, requires human explanation, releases feedback, and exports a PDF", async () => {
    expect(
      (await candidate.post(`/api/interviews/${interview._id}/end`).send({}))
        .status,
    ).toBe(403);
    const ended = await hr
      .post(`/api/interviews/${interview._id}/end`)
      .send({});
    expect(ended.status).toBe(200);
    report = ended.body;
    expect(
      (await owner.patch(`/api/reports/${report._id}`).send({})).status,
    ).toBe(400);
    expect((await owner.get(`/api/reports/${report._id}`)).status).toBe(200);
    expect((await candidate.get(`/api/reports/${report._id}`)).status).toBe(
      404,
    );
    expect((await outsider.get(`/api/reports/${report._id}`)).status).toBe(404);
    expect(
      (
        await hr.patch(`/api/reports/${report._id}`).send({
          summary: "Candidate demonstrated solid technical reasoning.",
          decision: "selected",
          explanation: "",
          finalized: true,
          released: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await hr.patch(`/api/reports/${report._id}`).send({
          summary: "Candidate demonstrated solid technical reasoning.",
          decision: "selected",
          explanation:
            "Selected by the human reviewer based on demonstrated technical evidence.",
          finalized: true,
          released: true,
        })
      ).status,
    ).toBe(200);
    const visible = await candidate.get(`/api/reports/${report._id}`);
    expect(visible.status).toBe(200);
    expect(visible.body.events).toEqual([]);
    expect(visible.body.interview.notes).toBeUndefined();
    expect((await candidate.get("/api/applications")).body[0].status).toBe(
      "Selected",
    );
    const pdf = await hr.get(`/api/reports/${report._id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      (
        await candidate
          .post(`/api/interviews/${interview._id}/answers`)
          .send({})
      ).status,
    ).toBe(409);
  });
  it("keeps personal practice private and supports candidate-owned completion", async () => {
    const practice = await candidate.post("/api/practice").send({
      jobTitle: "Frontend practice",
      topics: ["React"],
      difficulty: "Beginner",
      duration: 15,
      problemId: "sum-pairs",
    });
    expect(practice.status).toBe(201);
    expect(
      (await owner.get(`/api/interviews/${practice.body._id}`)).status,
    ).toBe(404);
    expect(
      (
        await candidate
          .post(`/api/interviews/${practice.body._id}/start`)
          .send({})
      ).status,
    ).toBe(200);
    const original = { ...config };
    Object.assign(config, {
      judgeUrl: "https://ce.judge0.com",
      production: false,
      host: "127.0.0.1",
      origin: "http://localhost:5173",
    });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        if (String(url).endsWith("/languages"))
          return response([{ id: 71, name: "Python (3.8.1)" }]);
        if (init?.method === "POST")
          return response({ token: "practice-token" });
        return response({
          status: { id: 3, description: "Accepted" },
          stdout: Buffer.from("11").toString("base64"),
        });
      });
    try {
      const execution = await candidate
        .post(`/api/interviews/${practice.body._id}/code`)
        .send({
          language: "python",
          code: "print(11)",
          mode: "run",
        });
      expect(execution.status).toBe(201);
      expect(execution.body.results[0]).toMatchObject({
        passed: true,
        stdout: "11",
      });
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      fetch.mockRestore();
      Object.assign(config, original);
    }
    const result = await candidate
      .post(`/api/interviews/${practice.body._id}/end`)
      .send({});
    expect(result.status).toBe(200);
    expect(result.body.released).toBe(true);
    expect(
      (await candidate.get(`/api/reports/${result.body._id}`)).status,
    ).toBe(200);
  });
  it("revokes logout sessions and checks expiry even before Mongo TTL cleanup", async () => {
    const isolated = request.agent(app);
    const logged = await isolated
      .post("/api/auth/login")
      .send({ email: "candidate@example.test", password: "TestPassword!2026" });
    expect(logged.status).toBe(200);
    const token = logged.headers["set-cookie"][0].split(";")[0].split("=")[1];
    await SessionModel.updateOne(
      { tokenHash: hashToken(token) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect((await isolated.get("/api/auth/me")).status).toBe(401);
    await isolated
      .post("/api/auth/login")
      .send({ email: "candidate@example.test", password: "TestPassword!2026" });
    await isolated.post("/api/auth/logout").send({});
    expect((await isolated.get("/api/auth/me")).status).toBe(401);
  });
});
describe("Provider contract validation and matching limits", () => {
  it("does not conflate Java and JavaScript or invent an empty-requirement score", () => {
    const result = matchResume(
      ["Java", "React"],
      { skills: [], experience: "", projects: "" },
      "JavaScript and React application",
    );
    expect(result.matching).toEqual(["React"]);
    expect(result.missing).toEqual(["Java"]);
    expect(result.score).toBe(50);
    expect(
      matchResume([], { skills: [], experience: "", projects: "" }, "").score,
    ).toBeNull();
  });
  it("rejects malformed PDFs", async () => {
    await expect(
      extractResume(Buffer.from("%PDF-not-a-real-document")),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("validates AI scores and refuses malformed or failed responses", async () => {
    expect(feedbackSchema.safeParse({ correctness: 100 }).success).toBe(false);
    config.llmUrl = "https://llm.test/v1";
    config.llmKey = "fixture";
    config.llmModel = "fixture-model";
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      fetch.mockResolvedValueOnce(
        response({
          choices: [{ message: { content: '{"correctness":100}' } }],
        }),
      );
      await expect(assessAnswer({ answer: "test" })).rejects.toMatchObject({
        code: "INVALID_AI_RESPONSE",
      });
      fetch.mockResolvedValueOnce(response({}, 503));
      await expect(
        generateQuestions({ topics: ["React"] }),
      ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
      fetch.mockRejectedValueOnce(new Error("timeout"));
      await expect(
        generateQuestions({ topics: ["React"] }),
      ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
      const feedback = {
        correctness: 4,
        completeness: 3,
        feedback: "Fixture feedback, not a real assessment",
        evidence: ["test answer"],
        missingConcepts: ["edge cases"],
        followUp: "How did you test?",
        uncertainty: "Contract test fixture",
      };
      fetch.mockResolvedValueOnce(
        response({
          choices: [{ message: { content: JSON.stringify(feedback) } }],
        }),
      );
      expect(await assessAnswer({ answer: "test answer" })).toEqual(feedback);
    } finally {
      fetch.mockRestore();
      config.llmUrl = "";
      config.llmKey = "";
      config.llmModel = "";
    }
  });
});
