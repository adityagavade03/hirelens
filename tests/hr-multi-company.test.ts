import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { createApp } from "../server/app";
import { hashToken } from "../server/security";
import {
  ApplicationModel,
  CompanyModel,
  InterviewModel,
  InvitationModel,
  JobModel,
  NotificationModel,
  ResumeModel,
  SessionModel,
  UserModel,
  connectDatabase,
} from "../server/models";
import {
  autoAssignShortlistedCandidates,
  interviewerWorkloads,
} from "../server/recruitment";

const app = createApp();
const id = () => new mongoose.Types.ObjectId().toString();
let database: MongoMemoryServer;
beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("hr_multi_company_tests"));
});
beforeEach(async () => {
  await Promise.all([
    ApplicationModel.deleteMany({}),
    CompanyModel.deleteMany({}),
    InterviewModel.deleteMany({}),
    InvitationModel.deleteMany({}),
    JobModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    ResumeModel.deleteMany({}),
    SessionModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

async function person(
  role: "company" | "hr" | "candidate",
  companyId?: string,
  companyIds: string[] = [],
) {
  const user = await UserModel.create({
    name: `${role} ${id()}`,
    email: `${id()}@example.test`,
    role,
    companyId,
    companyIds,
    passwordHash: "fixture-password-hash-never-returned",
    profile: { availability: "available", interviewCapacity: 20 },
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
async function company(name: string) {
  const companyId = id(),
    owner = await person("company", companyId);
  await CompanyModel.create({
    _id: companyId,
    ownerId: owner.user.id,
    name,
    identifier: id(),
    verification: { status: "verified" },
  });
  return { companyId, owner };
}
async function invite(
  owner: Awaited<ReturnType<typeof person>>,
  hr: Awaited<ReturnType<typeof person>>,
) {
  const result = await owner.client
    .post("/api/invitations")
    .send({ email: hr.user.email });
  expect(result.status).toBe(201);
  return result.body._id as string;
}
async function membershipPair() {
  const a = await company("Alpha Engineering"),
    b = await company("Beta Labs");
  // This is an existing, pre-migration HR account whose legacy default must survive.
  const hr = await person("hr", a.companyId, [b.companyId]);
  return { a, b, hr };
}
async function job(companyId: string, hrId: string, accepted = true) {
  return JobModel.create({
    companyId,
    companyName: `Team ${companyId}`,
    title: "Backend Developer",
    status: "published",
    skills: ["JavaScript"],
    requiredHrCount: 3,
    rounds: ["Technical"],
    hrRequests: [{ hrId, status: accepted ? "accepted" : "pending" }],
  });
}
async function application(currentJob: any, hrId?: string) {
  const candidate = await person("candidate");
  const resume = await ResumeModel.create({
    ownerId: candidate.user.id,
    name: "candidate.pdf",
    text: "Fixture resume",
    data: Buffer.from("%PDF-1.4 isolated candidate evidence"),
  });
  const row = await ApplicationModel.create({
    jobId: currentJob.id,
    companyId: currentJob.companyId,
    candidateId: candidate.user.id,
    candidateName: candidate.user.name,
    jobTitle: currentJob.title,
    companyName: currentJob.companyName,
    status: "Shortlisted",
    snapshot: {},
    resumeId: resume.id,
    match: { score: 90 },
    ...(hrId ? { assignedHrId: hrId } : {}),
  });
  return { row, resume, candidate };
}
async function completedInterview(
  currentJob: any,
  currentApplication: any,
  hrId: string,
) {
  return InterviewModel.create({
    applicationId: currentApplication.id,
    companyId: currentJob.companyId,
    candidateId: currentApplication.candidateId,
    interviewerId: hrId,
    companyName: currentJob.companyName,
    jobTitle: currentJob.title,
    scheduledAt: new Date(),
    duration: 30,
    status: "completed",
    type: "technical",
  });
}

describe("One HR account working for multiple isolated companies", () => {
  it("accepts a second company without replacing its legacy membership or account credentials", async () => {
    const a = await company("Alpha"),
      b = await company("Beta"),
      hr = await person("hr", a.companyId);
    const invitationId = await invite(b.owner, hr);
    expect(
      (
        await hr.client
          .get("/api/auth/me")
          .set("X-HireLens-Company", b.companyId)
      ).status,
    ).toBe(403);
    expect(
      (
        await hr.client
          .patch(`/api/invitations/${invitationId}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    const saved = await UserModel.findById(hr.user.id).select("+passwordHash");
    expect(saved?.companyId).toBe(a.companyId);
    expect(saved?.companyIds).toContain(b.companyId);
    expect(saved?.passwordHash).toBe("fixture-password-hash-never-returned");
    const selected = await hr.client
      .get("/api/auth/me")
      .set("X-HireLens-Company", b.companyId);
    expect(selected.status).toBe(200);
    expect(selected.body.user.companyId).toBe(b.companyId);
    expect(selected.body.user.companyIds.sort()).toEqual(
      [a.companyId, b.companyId].sort(),
    );
    expect(selected.body.user.passwordHash).toBeUndefined();
    expect(selected.headers["set-cookie"]).toBeUndefined();
  });

  it("keeps all memberships when an unaffiliated HR accepts two invitations concurrently", async () => {
    const a = await company("Alpha"),
      b = await company("Beta"),
      hr = await person("hr");
    const invites = await Promise.all([
      invite(a.owner, hr),
      invite(b.owner, hr),
    ]);
    const accepted = await Promise.all(
      invites.map((invitationId) =>
        hr.client
          .patch(`/api/invitations/${invitationId}`)
          .send({ status: "accepted" }),
      ),
    );
    expect(accepted.map((r) => r.status)).toEqual([200, 200]);
    const saved = await UserModel.findById(hr.user.id);
    expect(saved?.companyIds?.slice().sort()).toEqual(
      [a.companyId, b.companyId].sort(),
    );
    expect([a.companyId, b.companyId]).toContain(saved?.companyId);
    expect(await InvitationModel.countDocuments({ status: "accepted" })).toBe(
      2,
    );
  });

  it("does not grant membership from a pending/rejected invitation or another HR's acceptance", async () => {
    const a = await company("Alpha"),
      hr = await person("hr"),
      outsider = await person("hr");
    const invitationId = await invite(a.owner, hr);
    expect(
      (
        await outsider.client
          .patch(`/api/invitations/${invitationId}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(404);
    expect(
      (
        await hr.client
          .patch("/api/hr/companies/active")
          .send({ companyId: a.companyId })
      ).status,
    ).toBe(403);
    expect(
      (
        await hr.client
          .patch(`/api/invitations/${invitationId}`)
          .send({ status: "rejected" })
      ).status,
    ).toBe(200);
    expect((await hr.client.get("/api/hr/companies")).body).toEqual([]);
    expect(
      (
        await hr.client
          .get("/api/company")
          .set("X-HireLens-Company", a.companyId)
      ).status,
    ).toBe(403);
    expect(
      (
        await hr.client
          .patch(`/api/invitations/${invitationId}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(404);
  });

  it("lists minimal joined-company choices and validates switching without changing other tabs' default", async () => {
    const { a, b, hr } = await membershipPair();
    const choices = await hr.client.get("/api/hr/companies");
    expect(choices.status).toBe(200);
    expect(choices.body.map((c: any) => c.name)).toEqual([
      "Alpha Engineering",
      "Beta Labs",
    ]);
    for (const choice of choices.body)
      expect(Object.keys(choice).sort()).toEqual(["_id", "active", "name"]);
    const changed = await hr.client
      .patch("/api/hr/companies/active")
      .send({ companyId: b.companyId });
    expect(changed.status).toBe(200);
    expect(changed.body.user.companyId).toBe(b.companyId);
    expect(changed.body.user.passwordHash).toBeUndefined();
    expect((await hr.client.get("/api/auth/me")).body.user.companyId).toBe(
      a.companyId,
    );
    expect((await UserModel.findById(hr.user.id))?.companyId).toBe(a.companyId);
    const invalid = await hr.client
      .get("/api/auth/me")
      .set("X-HireLens-Company", "bad-id");
    expect(invalid.status).toBe(400);
    expect(invalid.headers["set-cookie"]).toBeUndefined();
    expect(
      (await hr.client.get("/api/company").set("X-HireLens-Company", id()))
        .status,
    ).toBe(403);
  });

  it("isolates jobs, applications, interviews and private resume downloads by the explicitly selected company", async () => {
    const { a, b, hr } = await membershipPair();
    const jobA = await job(a.companyId, hr.user.id),
      jobB = await job(b.companyId, hr.user.id);
    const appA = await application(jobA, hr.user.id),
      appB = await application(jobB, hr.user.id);
    const interviewA = await completedInterview(jobA, appA.row, hr.user.id),
      interviewB = await completedInterview(jobB, appB.row, hr.user.id);
    for (const [
      companyId,
      currentJob,
      currentApplication,
      currentInterview,
    ] of [
      [a.companyId, jobA, appA.row, interviewA],
      [b.companyId, jobB, appB.row, interviewB],
    ] as const) {
      expect(
        (
          await hr.client
            .get("/api/company")
            .set("X-HireLens-Company", companyId)
        ).body.company._id,
      ).toBe(companyId);
      expect(
        (
          await hr.client.get("/api/jobs").set("X-HireLens-Company", companyId)
        ).body.map((j: any) => j._id),
      ).toEqual([currentJob.id]);
      expect(
        (
          await hr.client
            .get("/api/applications")
            .set("X-HireLens-Company", companyId)
        ).body.map((j: any) => j._id),
      ).toEqual([currentApplication.id]);
      expect(
        (
          await hr.client
            .get("/api/interviews")
            .set("X-HireLens-Company", companyId)
        ).body.map((j: any) => j._id),
      ).toEqual([currentInterview.id]);
    }
    for (const path of [
      `/api/jobs/${jobB.id}`,
      `/api/applications?jobId=${jobB.id}`,
      `/api/interviews/${interviewB.id}`,
      `/api/resumes/${appB.resume.id}`,
    ]) {
      const denied = await hr.client
        .get(path)
        .set("X-HireLens-Company", a.companyId);
      expect(denied.status, path).toBe(404);
      expect(denied.headers["set-cookie"]).toBeUndefined();
    }
    expect(
      (
        await hr.client
          .get(`/api/resumes/${appB.resume.id}`)
          .set("X-HireLens-Company", b.companyId)
      ).status,
    ).toBe(200);
    const download = await hr.client.get(
      `/api/resumes/${appB.resume.id}?hrCompanyId=${b.companyId}`,
    );
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toMatch(/application\/pdf/);
    expect(
      (
        await request(app).get(
          `/api/resumes/${appB.resume.id}?hrCompanyId=${b.companyId}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await hr.client.get(
          `/api/resumes/${appB.resume.id}?hrCompanyId=${id()}`,
        )
      ).status,
    ).toBe(403);
  });

  it("does not let Company or Candidate roles adopt HR company permissions", async () => {
    const { a, b } = await membershipPair();
    const candidate = await person("candidate");
    expect(
      (
        await a.owner.client
          .get("/api/company")
          .set("X-HireLens-Company", b.companyId)
      ).body.company._id,
    ).toBe(a.companyId);
    for (const account of [a.owner, candidate]) {
      expect(
        (
          await account.client
            .get("/api/hr/companies")
            .set("X-HireLens-Company", b.companyId)
        ).status,
      ).toBe(403);
      expect(
        (
          await account.client
            .patch("/api/hr/companies/active")
            .send({ companyId: b.companyId })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await candidate.client
          .get("/api/company")
          .set("X-HireLens-Company", b.companyId)
      ).status,
    ).toBe(403);
    expect(
      (
        await candidate.client
          .get("/api/auth/me")
          .set("X-HireLens-Company", b.companyId)
      ).body.user.companyId,
    ).toBeUndefined();
  });

  it("shows a shared HR in each company's roster without revealing other memberships", async () => {
    const { a, b, hr } = await membershipPair();
    for (const team of [a, b]) {
      const roster = await team.owner.client.get("/api/company");
      const member = roster.body.members.find((m: any) => m._id === hr.user.id);
      expect(member).toBeTruthy();
      expect(member.companyIds).toBeUndefined();
      expect(member.companyId).toBeUndefined();
      const interviewers = await team.owner.client.get(
        "/api/company/interviewers",
      );
      expect(interviewers.body.map((m: any) => m._id)).toEqual([hr.user.id]);
      expect(interviewers.body[0].companyIds).toBeUndefined();
      expect(
        (await team.owner.client.get("/api/company/overview")).body.hrCount,
      ).toBe(1);
    }
  });

  it("allows a secondary company to request that HR for a job, with no automatic job acceptance", async () => {
    const { b, hr } = await membershipPair();
    const currentJob = await job(b.companyId, hr.user.id);
    currentJob.hrRequests.splice(0);
    await currentJob.save();
    const requested = await b.owner.client
      .post(`/api/jobs/${currentJob.id}/hr-requests`)
      .send({ hrIds: [hr.user.id] });
    expect(requested.status).toBe(201);
    expect(requested.body.hrRequests[0].status).toBe("pending");
    expect(
      (await NotificationModel.findOne({ userId: hr.user.id }))?.href,
    ).toBe(`/assignments?hrCompanyId=${b.companyId}`);
    expect(
      (await hr.client.get("/api/jobs").set("X-HireLens-Company", b.companyId))
        .body,
    ).toEqual([]);
    expect(
      (
        await b.owner.client
          .post("/api/invitations")
          .send({ email: hr.user.email })
      ).status,
    ).toBe(409);
  });

  it("allocates secondary memberships with per-company capacity and retries all memberships after shared settings change", async () => {
    const { a, b, hr } = await membershipPair();
    await UserModel.updateOne(
      { _id: hr.user.id },
      { $set: { "profile.interviewCapacity": 1 } },
    );
    const jobs = await Promise.all([
      job(a.companyId, hr.user.id),
      job(b.companyId, hr.user.id),
    ]);
    for (const currentJob of jobs)
      for (let n = 0; n < 3; n++) await application(currentJob);
    await Promise.all(
      jobs.map((currentJob) => autoAssignShortlistedCandidates(currentJob.id)),
    );
    for (const currentJob of jobs)
      expect(
        await NotificationModel.exists({
          userId: hr.user.id,
          href: new RegExp(`hrCompanyId=${currentJob.companyId}$`),
        }),
      ).toBeTruthy();
    for (const team of [a, b]) {
      const load = (await interviewerWorkloads(team.companyId))[0];
      expect(load.activeCandidates).toBe(1);
      expect(load.remainingCapacity).toBe(0);
      expect(load).not.toHaveProperty("companyIds");
      expect(load).not.toHaveProperty("companyId");
    }
    const changed = await hr.client
      .patch("/api/hr/workload-settings")
      .set("X-HireLens-Company", b.companyId)
      .send({
        availability: "available",
        interviewCapacity: 2,
        availabilityNote: "Available for interviews",
      });
    expect(changed.status).toBe(200);
    for (const team of [a, b])
      expect(
        (await interviewerWorkloads(team.companyId))[0].activeCandidates,
      ).toBe(2);
  });

  it("prevents overlapping interviews for the same HR across two companies", async () => {
    const { a, b, hr } = await membershipPair();
    const jobA = await job(a.companyId, hr.user.id),
      jobB = await job(b.companyId, hr.user.id);
    const appA = await application(jobA, hr.user.id),
      appB = await application(jobB, hr.user.id);
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const input = {
      scheduledAt,
      timezone: "Asia/Kolkata",
      duration: 30,
      type: "technical",
      topics: ["JavaScript"],
      difficulty: "Beginner",
      problemId: "sum-pairs",
      interviewerId: hr.user.id,
      facilitator: "human",
    };
    expect(
      (
        await hr.client
          .post("/api/interviews")
          .set("X-HireLens-Company", a.companyId)
          .send({ ...input, applicationId: appA.row.id })
      ).status,
    ).toBe(201);
    const overlap = await hr.client
      .post("/api/interviews")
      .set("X-HireLens-Company", b.companyId)
      .send({ ...input, applicationId: appB.row.id });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.message).toMatch(/already has an interview/);
    expect((await ApplicationModel.findById(appB.row.id))?.status).toBe(
      "Shortlisted",
    );
    expect(
      await InterviewModel.countDocuments({ interviewerId: hr.user.id }),
    ).toBe(1);
    const nextSlot = new Date(+new Date(scheduledAt) + 3600000).toISOString();
    expect(
      (
        await hr.client
          .post("/api/interviews")
          .set("X-HireLens-Company", b.companyId)
          .send({ ...input, scheduledAt: nextSlot, applicationId: appB.row.id })
      ).status,
    ).toBe(201);
  });
});
