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
  JobModel,
  NotificationModel,
  SessionModel,
  UserModel,
  connectDatabase,
} from "../server/models";
import {
  autoAssignShortlistedCandidates,
  interviewerWorkloads,
  retryPendingAssignments,
} from "../server/recruitment";

const app = createApp();
const id = () => new mongoose.Types.ObjectId().toString();
let database: MongoMemoryServer;
beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("automatic_distribution_tests"));
});
beforeEach(async () => {
  await Promise.all([
    ApplicationModel.deleteMany({}),
    CompanyModel.deleteMany({}),
    InterviewModel.deleteMany({}),
    JobModel.deleteMany({}),
    NotificationModel.deleteMany({}),
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
  settings = {},
) {
  const user = await UserModel.create({
    name: `${role} ${id()}`,
    email: `${id()}@example.test`,
    role,
    companyId,
    passwordHash: "unused",
    profile: { availability: "available", interviewCapacity: 20, ...settings },
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
async function company() {
  const companyId = id();
  const owner = await person("company", companyId);
  await CompanyModel.create({
    _id: companyId,
    ownerId: owner.user.id,
    name: "Distribution test company",
    identifier: id(),
  });
  return { companyId, owner };
}
async function job(
  companyId: string,
  hrs: { user: { id: string } }[],
  statuses?: string[],
) {
  return JobModel.create({
    companyId,
    companyName: "Test company",
    title: "Software Developer",
    status: "published",
    requiredHrCount: Math.max(5, hrs.length),
    hrRequests: hrs.map((hr, index) => ({
      hrId: hr.user.id,
      status: statuses?.[index] || "accepted",
    })),
  });
}
async function applicants(currentJob: any, count: number, extra = {}) {
  return ApplicationModel.insertMany(
    Array.from({ length: count }, (_, index) => ({
      jobId: currentJob.id,
      companyId: currentJob.companyId,
      candidateId: id(),
      candidateName: `Candidate ${index}`,
      jobTitle: currentJob.title,
      companyName: "Test company",
      status: "Shortlisted",
      snapshot: {},
      resumeId: id(),
      match: { score: 90 },
      ...extra,
    })),
  );
}

describe("Automatic interview assignment against an isolated real database", () => {
  it("splits ten shortlisted candidates evenly between five accepted HRs and retries idempotently", async () => {
    const { companyId } = await company();
    const hrs = await Promise.all(
      Array.from({ length: 5 }, () => person("hr", companyId)),
    );
    const currentJob = await job(companyId, hrs);
    await applicants(currentJob, 10);
    expect(await autoAssignShortlistedCandidates(currentJob.id)).toEqual({
      assigned: 10,
      pending: 0,
    });
    const workloads = await interviewerWorkloads(companyId);
    expect(workloads.map((hr) => hr.activeCandidates)).toEqual([2, 2, 2, 2, 2]);
    const before = await ApplicationModel.find({}).sort({ _id: 1 });
    expect(
      before.every(
        (application) =>
          application.assignedHrName && !application.assignmentPendingAt,
      ),
    ).toBe(true);
    expect(await NotificationModel.countDocuments()).toBe(20);
    expect(await autoAssignShortlistedCandidates(currentJob.id)).toEqual({
      assigned: 0,
      pending: 0,
    });
    const after = await ApplicationModel.find({}).sort({ _id: 1 });
    expect(after.map((a) => a.assignedHrId)).toEqual(
      before.map((a) => a.assignedHrId),
    );
    expect(await NotificationModel.countDocuments()).toBe(20);
  });

  it("balances total company workloads, includes remainder candidates, and excludes busy/uninvited HRs", async () => {
    const { companyId } = await company();
    const first = await person("hr", companyId),
      second = await person("hr", companyId),
      busy = await person("hr", companyId, { availability: "busy" }),
      uninvited = await person("hr", companyId);
    const previousJob = await job(companyId, [first]);
    await applicants(previousJob, 3, { assignedHrId: first.user.id });
    const currentJob = await job(
      companyId,
      [first, second, busy, uninvited],
      ["accepted", "accepted", "accepted", "pending"],
    );
    await applicants(currentJob, 6);
    await autoAssignShortlistedCandidates(currentJob.id);
    const workloads = await interviewerWorkloads(companyId);
    expect(
      workloads.find((h) => h.hrId === busy.user.id)?.activeCandidates,
    ).toBe(0);
    expect(
      workloads.find((h) => h.hrId === uninvited.user.id)?.activeCandidates,
    ).toBe(0);
    const totals = [first, second]
      .map((h) => workloads.find((w) => w.hrId === h.user.id)!.activeCandidates)
      .sort();
    expect(totals).toEqual([4, 5]);
  });

  it("serializes cross-job capacity and retains a persistent pending queue without duplicate admin alerts", async () => {
    const { companyId, owner } = await company();
    const hr = await person("hr", companyId, { interviewCapacity: 1 });
    const [firstJob, secondJob] = await Promise.all([
      job(companyId, [hr]),
      job(companyId, [hr]),
    ]);
    await applicants(firstJob, 2);
    await applicants(secondJob, 2);
    await Promise.all([
      autoAssignShortlistedCandidates(firstJob.id),
      autoAssignShortlistedCandidates(secondJob.id),
    ]);
    expect(
      await ApplicationModel.countDocuments({ assignedHrId: hr.user.id }),
    ).toBe(1);
    expect(
      await ApplicationModel.countDocuments({
        assignmentPendingAt: { $exists: true },
      }),
    ).toBe(3);
    const alerts = await NotificationModel.countDocuments({
      userId: owner.user.id,
    });
    await retryPendingAssignments(companyId);
    expect(
      await NotificationModel.countDocuments({ userId: owner.user.id }),
    ).toBe(alerts);
    await ApplicationModel.updateOne(
      { assignedHrId: hr.user.id },
      { $set: { status: "Selected" } },
    );
    await retryPendingAssignments(companyId);
    expect(
      await ApplicationModel.countDocuments({
        assignedHrId: hr.user.id,
        status: "Shortlisted",
      }),
    ).toBe(1);
    expect(
      await ApplicationModel.countDocuments({
        assignmentPendingAt: { $exists: true },
      }),
    ).toBe(2);
  });

  it("starts when one HR accepts without waiting for the target count, and availability changes drain the queue", async () => {
    const { companyId } = await company();
    const hr = await person("hr", companyId, { availability: "unavailable" });
    const currentJob = await job(companyId, [hr], ["pending"]);
    await applicants(currentJob, 2);
    expect(
      (
        await hr.client
          .patch(`/api/hr/assignments/${currentJob.id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    expect(
      await ApplicationModel.countDocuments({ assignedHrId: hr.user.id }),
    ).toBe(0);
    const setting = await hr.client
      .patch("/api/hr/workload-settings")
      .send({ availability: "available", interviewCapacity: 2 });
    expect(setting.status).toBe(200);
    expect(setting.body.activeCandidates).toBe(2);
    expect(
      await ApplicationModel.countDocuments({ assignedHrId: hr.user.id }),
    ).toBe(2);
    expect(
      (await hr.client.get(`/api/jobs/${currentJob.id}`)).body.applications,
    ).toHaveLength(2);
  });

  it("never auto-reassigns existing or scheduled interviews and cannot use foreign-company accepted IDs", async () => {
    const { companyId } = await company();
    const hr = await person("hr", companyId),
      foreign = await person("hr", id());
    const currentJob = await job(companyId, [hr, foreign]);
    const [protectedCandidate] = await applicants(currentJob, 1);
    await InterviewModel.create({
      candidateId: protectedCandidate.candidateId,
      applicationId: protectedCandidate.id,
      companyId,
      interviewerId: hr.user.id,
      jobTitle: "Existing interview",
      status: "scheduled",
      scheduledAt: new Date(),
    });
    await applicants(currentJob, 1, { assignedHrId: hr.user.id });
    await applicants(currentJob, 1);
    expect(await autoAssignShortlistedCandidates(currentJob.id)).toEqual({
      assigned: 1,
      pending: 1,
    });
    expect(
      (await ApplicationModel.findById(protectedCandidate.id))?.assignedHrId,
    ).toBeUndefined();
    expect(
      await ApplicationModel.countDocuments({ assignedHrId: foreign.user.id }),
    ).toBe(0);
  });

  it("protects workload APIs and manual reassignment with scope, availability, capacity, and interview checks", async () => {
    const { companyId, owner } = await company();
    const first = await person("hr", companyId),
      target = await person("hr", companyId, { interviewCapacity: 1 });
    const candidate = await person("candidate");
    const outsider = await company();
    const currentJob = await job(companyId, [first, target]);
    const [application] = await applicants(currentJob, 1, {
      assignedHrId: first.user.id,
    });
    const distribution = (hrId: string, expectedHrId = first.user.id) => ({
      assignments: [{ applicationId: application.id, hrId, expectedHrId }],
    });
    expect((await candidate.client.get("/api/hr/workloads")).status).toBe(403);
    expect(
      (
        await outsider.owner.client
          .post(`/api/jobs/${currentJob.id}/auto-distribution`)
          .send({})
      ).status,
    ).toBe(404);
    expect(
      (
        await first.client
          .post(`/api/jobs/${currentJob.id}/auto-distribution`)
          .send({})
      ).status,
    ).toBe(403);
    await UserModel.updateOne(
      { _id: target.user.id },
      { $set: { "profile.availability": "unavailable" } },
    );
    expect(
      (
        await owner.client
          .patch(`/api/jobs/${currentJob.id}/distribution`)
          .send(distribution(target.user.id))
      ).status,
    ).toBe(409);
    await UserModel.updateOne(
      { _id: target.user.id },
      { $set: { "profile.availability": "available" } },
    );
    const [occupied] = await applicants(currentJob, 1, {
      assignedHrId: target.user.id,
    });
    expect(
      (
        await owner.client
          .patch(`/api/jobs/${currentJob.id}/distribution`)
          .send(distribution(target.user.id))
      ).status,
    ).toBe(409);
    await ApplicationModel.updateOne(
      { _id: occupied.id },
      { $set: { status: "Selected" } },
    );
    expect(
      (
        await owner.client
          .patch(`/api/jobs/${currentJob.id}/distribution`)
          .send(distribution(target.user.id))
      ).status,
    ).toBe(200);
    expect(
      (await ApplicationModel.findById(application.id))?.assignedHrName,
    ).toBe(target.user.name);
    await InterviewModel.create({
      candidateId: application.candidateId,
      applicationId: application.id,
      companyId,
      interviewerId: target.user.id,
      jobTitle: "Interview",
      status: "live",
      scheduledAt: new Date(),
    });
    expect(
      (
        await owner.client
          .patch(`/api/jobs/${currentJob.id}/distribution`)
          .send(distribution(first.user.id, target.user.id))
      ).status,
    ).toBe(409);
    expect(
      (await first.client.get(`/api/jobs/${currentJob.id}`)).body.applications,
    ).toHaveLength(0);
  });
});
