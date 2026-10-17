import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { config } from "../server/config";
import {
  connectDatabase,
  CompanyModel,
  CompanyVerificationModel,
  OtpChallengeModel,
  UserModel,
  JobModel,
  NotificationModel,
  ApplicationModel,
  InterviewModel,
  migrateLegacyAssignments,
} from "../server/models";
import { hashToken } from "../server/security";

let db: MongoMemoryServer;
const app = createApp(),
  owner = request.agent(app),
  hr = request.agent(app),
  candidate = request.agent(app),
  outsideHr = request.agent(app);
let token: string, ownerUser: any, hrUser: any, job: any;
const password = "TestPassword!2026";
const details = {
  companyName: "Verified Company",
  officialEmail: "owner@verified.example.test",
  country: "IN",
  registrationNumber: "TEST-12345",
  website: "https://verified.example.test",
  industry: "Software",
  companyType: "Private company",
  address: "10 Test Street, Test City",
  phone: "1234567890",
  location: "Test City",
};
const jobInput = {
  title: "Platform Engineer",
  role: "Software engineering",
  department: "Engineering",
  description: "Build reliable services and thoughtful interfaces.",
  skills: ["TypeScript"],
  preferredSkills: ["React"],
  education: "Relevant degree or equivalent experience",
  experience: "1–3 years",
  location: "Bengaluru",
  employment: "Full-time",
  workMode: "Hybrid" as const,
  salaryMin: 600000,
  salaryMax: 1200000,
  salaryCurrency: "INR",
  openings: 2,
  deadline: new Date(Date.now() + 86400000).toISOString(),
  rounds: ["HR conversation", "Technical"],
  criteria: "Job-related technical evidence",
  additionalRequirements: "Communicate technical decisions",
  status: "draft" as const,
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
function mockVerification(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    response({
      verified: true,
      legalName: details.companyName,
      reference: "verification-fixture-only",
      officialEmail: details.officialEmail,
      country: details.country,
      registrationNumber: details.registrationNumber,
      ...overrides,
    }),
  );
}
async function startLogin(identifier = details.officialEmail) {
  let code = "";
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body.to).toBe(details.officialEmail);
      code = body.text.match(/\b\d{6}\b/)[0];
      return response({ accepted: true, messageId: "email-fixture-only" });
    });
  const login = await owner
    .post("/api/auth/login")
    .send({ identifier, password, role: "company" });
  mock.mockRestore();
  return { login, code };
}
beforeAll(async () => {
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: { launchTimeout: 60000 },
  });
  await connectDatabase(db.getUri("hirelens_company_test"));
  Object.assign(config, {
    verificationUrl: "https://verification.example.test/verify",
    verificationKey: "fixture-key",
    emailUrl: "https://email.example.test/send",
    emailKey: "fixture-key",
    emailFrom: "HireLens <noreply@example.test>",
    otpSecret: "test-only-secret-with-more-than-32-characters",
    companyOtpRequired: true,
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
describe("Company verification and role-specific authentication", () => {
  it("fails closed when verification is missing, negative, malformed, or mismatched", async () => {
    config.verificationUrl = "";
    expect(
      (await request(app).post("/api/auth/company/verify").send(details))
        .status,
    ).toBe(503);
    config.verificationUrl = "https://verification.example.test/verify";
    mockVerification({ verified: false });
    expect(
      (await request(app).post("/api/auth/company/verify").send(details))
        .status,
    ).toBe(422);
    vi.restoreAllMocks();
    mockVerification({ officialEmail: "someoneelse@example.test" });
    expect(
      (await request(app).post("/api/auth/company/verify").send(details))
        .status,
    ).toBe(502);
    expect(await CompanyModel.countDocuments()).toBe(0);
  });
  it("requires backend verification, matching confirmed credentials and a single-use receipt", async () => {
    expect(
      (
        await owner.post("/api/auth/register").send({
          name: "Owner",
          email: details.officialEmail,
          password,
          confirmPassword: password,
          role: "company",
          username: "verified-owner",
        })
      ).status,
    ).toBe(400);
    const mock = mockVerification();
    const verified = await owner.post("/api/auth/company/verify").send(details);
    expect(verified.status).toBe(200);
    expect(mock).toHaveBeenCalledOnce();
    token = verified.body.verificationToken;
    expect(verified.body.reference).toBeUndefined();
    const stored = await CompanyVerificationModel.findOne();
    expect(stored!.tokenHash).toBe(hashToken(token));
    const registration = {
      name: "Company Administrator",
      email: details.officialEmail,
      username: "verified-owner",
      password,
      confirmPassword: password,
      role: "company",
      verificationToken: token,
    };
    expect(
      (
        await owner
          .post("/api/auth/register")
          .send({ ...registration, confirmPassword: "different" })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .post("/api/auth/register")
          .send({ ...registration, email: "wrong@example.test" })
      ).status,
    ).toBe(400);
    const result = await owner.post("/api/auth/register").send(registration);
    expect(result.status).toBe(201);
    expect(result.body.registered).toBe(true);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect((await owner.get("/api/auth/me")).status).toBe(401);
    expect(
      (await owner.post("/api/auth/register").send(registration)).status,
    ).toBe(409);
    expect(await CompanyVerificationModel.countDocuments()).toBe(0);
    const company = await CompanyModel.findOne();
    expect(company!.verification?.status).toBe("verified");
    expect(company!.registrationKey).toBe("IN:TEST12345");
    const saved = await UserModel.findOne().select("+passwordHash");
    expect(saved!.passwordHash).not.toBe(password);
  });
  it("rejects duplicate company identity and expired verification receipts", async () => {
    expect(
      (await request(app).post("/api/auth/company/verify").send(details))
        .status,
    ).toBe(409);
    const expiredToken = "f".repeat(64);
    await CompanyVerificationModel.create({
      tokenHash: hashToken(expiredToken),
      details: { ...details, officialEmail: "expired@example.test" },
      legalName: "Expired",
      reference: "fixture",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      (
        await request(app).post("/api/auth/register").send({
          name: "Expired Admin",
          email: "expired@example.test",
          username: "expired-admin",
          password,
          confirmPassword: password,
          role: "company",
          verificationToken: expiredToken,
        })
      ).status,
    ).toBe(400);
  });
  it("blocks wrong-role credentials and unavailable email delivery", async () => {
    expect(
      (
        await owner
          .post("/api/auth/login")
          .send({ identifier: "verified-owner", password, role: "hr" })
      ).status,
    ).toBe(401);
    config.emailUrl = "";
    expect(
      (
        await owner
          .post("/api/auth/login")
          .send({ identifier: "verified-owner", password, role: "company" })
      ).status,
    ).toBe(503);
    expect((await owner.get("/api/auth/me")).status).toBe(401);
    config.emailUrl = "https://email.example.test/send";
  });
  it("delivers a secure code, withholds the session, limits resend, and consumes the code once", async () => {
    const { login, code } = await startLogin("verified-owner");
    expect(login.status).toBe(202);
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(login.body.code).toBeUndefined();
    expect(JSON.stringify(login.body)).not.toContain(code);
    const stored = await OtpChallengeModel.findOne().select("+codeHash");
    expect(stored!.codeHash).not.toBe(code);
    expect(stored!.tokenHash).toBe(hashToken(login.body.challengeToken));
    expect(
      (
        await owner
          .post("/api/auth/otp/resend")
          .send({ challengeToken: login.body.challengeToken })
      ).status,
    ).toBe(429);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(
      (
        await owner
          .post("/api/auth/otp/verify")
          .send({ challengeToken: login.body.challengeToken, code: wrong })
      ).status,
    ).toBe(400);
    const signed = await owner
      .post("/api/auth/otp/verify")
      .send({ challengeToken: login.body.challengeToken, code });
    expect(signed.status).toBe(200);
    expect(signed.body.user.passwordHash).toBeUndefined();
    expect(signed.headers["set-cookie"][0]).toContain("HttpOnly");
    ownerUser = signed.body.user;
    expect(
      (
        await request(app)
          .post("/api/auth/otp/verify")
          .send({ challengeToken: login.body.challengeToken, code })
      ).status,
    ).toBe(400);
  });
  it("rejects expired codes and locks out five incorrect attempts even across new login requests", async () => {
    const { login, code } = await startLogin();
    const challengeToken = login.body.challengeToken;
    await OtpChallengeModel.updateOne(
      { userId: ownerUser._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(
      (
        await request(app)
          .post("/api/auth/otp/verify")
          .send({ challengeToken, code })
      ).status,
    ).toBe(400);
    await OtpChallengeModel.updateOne(
      { userId: ownerUser._id },
      { $set: { expiresAt: new Date(Date.now() + 60000) } },
    );
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request(app)
            .post("/api/auth/otp/verify")
            .send({ challengeToken, code: wrong })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/otp/verify")
          .send({ challengeToken, code })
      ).status,
    ).toBe(400);
    await OtpChallengeModel.updateOne(
      { userId: ownerUser._id },
      { $set: { lastSentAt: new Date(Date.now() - 61000) } },
    );
    expect(
      (
        await owner.post("/api/auth/login").send({
          identifier: details.officialEmail,
          password,
          role: "company",
        })
      ).status,
    ).toBe(429);
    await OtpChallengeModel.deleteMany({});
  });
  it("resends through the adapter and invalidates the previous code and challenge", async () => {
    const { login, code } = await startLogin();
    await OtpChallengeModel.updateOne(
      { userId: ownerUser._id },
      { $set: { lastSentAt: new Date(Date.now() - 61000) } },
    );
    let newCode = "";
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      async (_url, options) => {
        newCode = JSON.parse(String(options?.body)).text.match(/\b\d{6}\b/)[0];
        return response({ accepted: true, messageId: "resend-test-fixture" });
      },
    );
    const resent = await owner
      .post("/api/auth/otp/resend")
      .send({ challengeToken: login.body.challengeToken });
    expect(resent.status).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/otp/verify")
          .send({ challengeToken: login.body.challengeToken, code })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .post("/api/auth/otp/verify")
          .send({ challengeToken: resent.body.challengeToken, code: newCode })
      ).status,
    ).toBe(200);
  });
});
describe("Company recruitment and HR assignment", () => {
  it("keeps dashboards and company/HR APIs restricted to the authenticated role", async () => {
    for (const [client, email, role] of [
      [hr, "hr@verified.example.test", "hr"],
      [candidate, "candidate@verified.example.test", "candidate"],
      [outsideHr, "outside@verified.example.test", "hr"],
    ] as const) {
      const result = await client.post("/api/auth/register").send({
        name: role === "hr" ? "Test Interviewer" : "Test Candidate",
        email,
        password,
        role,
      });
      expect(result.status).toBe(201);
      if (client === hr) hrUser = result.body.user;
      expect((await client.get("/api/company/overview")).status).toBe(403);
      expect((await client.get("/api/company/interviewers")).status).toBe(403);
    }
    expect((await owner.get("/api/hr/assignments")).status).toBe(403);
    expect(
      (
        await owner
          .patch("/api/hr/availability")
          .send({ availability: "available", availabilityNote: "" })
      ).status,
    ).toBe(403);
    expect((await request(app).get("/api/company/overview")).status).toBe(401);
    const invitation = await owner
      .post("/api/invitations")
      .send({ email: hrUser.email });
    expect(
      (
        await hr
          .patch(`/api/invitations/${invitation.body._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
  });
  it("saves full job requirements as draft, edits, publishes, unpublishes, closes and checks deadlines", async () => {
    const saved = await owner.post("/api/jobs").send(jobInput);
    expect(saved.status).toBe(201);
    job = saved.body;
    expect(job.salaryMin).toBe(600000);
    expect(job.openings).toBe(2);
    expect(job.rounds).toEqual(jobInput.rounds);
    expect(job.education).toBe(jobInput.education);
    expect((await candidate.get("/api/jobs")).body).toHaveLength(0);
    expect(
      (await owner.patch(`/api/jobs/${job._id}`).send({ salaryMax: 1 })).status,
    ).toBe(400);
    expect(
      (await owner.patch(`/api/jobs/${job._id}`).send({ status: "published" }))
        .status,
    ).toBe(200);
    expect((await candidate.get("/api/jobs")).body[0]._id).toBe(job._id);
    expect(
      (await owner.patch(`/api/jobs/${job._id}`).send({ status: "draft" }))
        .status,
    ).toBe(200);
    expect((await candidate.get("/api/jobs")).body).toHaveLength(0);
    expect(
      (await owner.patch(`/api/jobs/${job._id}`).send({ status: "closed" }))
        .status,
    ).toBe(200);
    expect(
      (
        await owner.patch(`/api/jobs/${job._id}`).send({
          status: "published",
          deadline: new Date(Date.now() - 1000).toISOString(),
        })
      ).status,
    ).toBe(400);
    await owner.patch(`/api/jobs/${job._id}`).send({ status: "published" });
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { deadline: new Date(Date.now() - 1000) } },
    );
    expect(
      (await candidate.post(`/api/jobs/${job._id}/apply`).send({})).status,
    ).toBe(409);
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { deadline: new Date(jobInput.deadline) } },
    );
  });
  it("protects verified identity, profile/logo permissions, and never silently verifies legacy companies", async () => {
    expect(
      (
        await owner
          .patch("/api/company")
          .send({ name: "Unverified new identity" })
      ).status,
    ).toBe(409);
    expect(
      (
        await owner.patch("/api/company").send({
          description: "Updated company profile",
          industry: "Technology",
        })
      ).status,
    ).toBe(200);
    expect(
      (await candidate.patch("/api/company").send({ description: "wrong" }))
        .status,
    ).toBe(403);
    expect(
      (
        await owner
          .post("/api/company/logo")
          .attach("logo", Buffer.from("<svg/>"), "logo.svg")
      ).status,
    ).toBe(400);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx5kAAAAASUVORK5CYII=",
      "base64",
    );
    expect(
      (await owner.post("/api/company/logo").attach("logo", png, "logo.png"))
        .status,
    ).toBe(200);
    expect(
      (await owner.get("/api/company/logo")).headers["content-type"],
    ).toContain("image/png");
    expect((await candidate.get("/api/company/logo")).status).toBe(403);
    await CompanyModel.updateOne(
      { _id: ownerUser.companyId },
      { $set: { "verification.status": "unverified" } },
    );
    expect(
      (await owner.post("/api/jobs").send({ ...jobInput, status: "published" }))
        .status,
    ).toBe(403);
    expect((await owner.get("/api/company/overview")).status).toBe(200);
    await CompanyModel.updateOne(
      { _id: ownerUser.companyId },
      { $set: { "verification.status": "verified" } },
    );
  });
  it("lists only company HR, validates availability, persists a pending request and notifies HR", async () => {
    expect((await hr.get("/api/applications")).body).toHaveLength(0);
    const user = (await candidate.get("/api/auth/me")).body.user;
    await ApplicationModel.create({
      jobId: job._id,
      companyId: ownerUser.companyId,
      candidateId: user._id,
      candidateName: user.name,
      jobTitle: job.title,
      companyName: details.companyName,
      resumeId: new mongoose.Types.ObjectId().toString(),
      snapshot: user.profile,
      status: "Shortlisted",
    });
    const list = await owner.get("/api/company/interviewers");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]._id).toBe(hrUser._id);
    expect(list.body[0].completedInterviews).toBe(0);
    const outside = (await outsideHr.get("/api/auth/me")).body.user;
    expect(
      (
        await owner
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [outside._id] })
      ).status,
    ).toBe(400);
    await hr
      .patch("/api/hr/availability")
      .send({ availability: "unavailable", availabilityNote: "On leave" });
    expect(
      (
        await owner
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [hrUser._id] })
      ).status,
    ).toBe(400);
    await hr.patch("/api/hr/availability").send({
      availability: "available",
      availabilityNote: "Weekday afternoons",
    });
    const assigned = await owner
      .post(`/api/jobs/${job._id}/hr-requests`)
      .send({ hrIds: [hrUser._id] });
    expect(assigned.status).toBe(201);
    expect(assigned.body.hrRequests[0].status).toBe("pending");
    expect(
      await NotificationModel.exists({
        userId: hrUser._id,
        href: "/assignments",
      }),
    ).not.toBeNull();
    expect((await hr.get("/api/hr/assignments")).body[0]._id).toBe(job._id);
    expect((await outsideHr.get("/api/hr/assignments")).body).toHaveLength(0);
    expect(
      (
        await candidate
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [hrUser._id] })
      ).status,
    ).toBe(403);
  });
  it("allows HR acceptance or decline, notifies the company and reports actual workload", async () => {
    expect(
      (
        await outsideHr
          .patch(`/api/hr/assignments/${job._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(409);
    expect(
      (
        await hr
          .patch(`/api/hr/assignments/${job._id}`)
          .send({ status: "declined" })
      ).status,
    ).toBe(200);
    expect((await hr.get("/api/jobs")).body).toHaveLength(0);
    expect(
      (
        await owner
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [hrUser._id] })
      ).status,
    ).toBe(201);
    expect(
      (
        await hr
          .patch(`/api/hr/assignments/${job._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    expect(
      (
        await hr
          .patch(`/api/hr/assignments/${job._id}`)
          .send({ status: "declined" })
      ).status,
    ).toBe(409);
    const list = (await owner.get("/api/company/interviewers")).body;
    expect(list[0].assignedJobs).toBe(1);
    expect(list[0].upcomingInterviews).toBe(0);
    const overview = (await owner.get("/api/company/overview")).body;
    expect(overview.jobs.published).toBe(1);
    expect(overview.hrCount).toBe(1);
    expect(overview.applications).toEqual({ Shortlisted: 1 });
    expect(
      await NotificationModel.exists({
        userId: ownerUser._id,
        message: { $regex: "accepted" },
      }),
    ).not.toBeNull();
  });
  it("distributes a job across accepted HRs and prevents cross-job, stale and duplicate assignments", async () => {
    const second = request.agent(app);
    const registered = await second.post("/api/auth/register").send({
      name: "Second HR",
      email: "second@verified.example.test",
      password,
      role: "hr",
    });
    const secondId = registered.body.user._id;
    const invite = await owner
      .post("/api/invitations")
      .send({ email: "second@verified.example.test" });
    expect(
      (
        await second
          .patch(`/api/invitations/${invite.body._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    expect(
      (
        await owner
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [secondId] })
      ).status,
    ).toBe(409);
    expect(
      (
        await owner
          .patch(`/api/jobs/${job._id}/hr-count`)
          .send({ requiredHrCount: 2 })
      ).status,
    ).toBe(200);
    expect(
      (
        await owner
          .post(`/api/jobs/${job._id}/hr-requests`)
          .send({ hrIds: [secondId] })
      ).status,
    ).toBe(201);
    expect(
      (
        await owner
          .patch(`/api/jobs/${job._id}/hr-count`)
          .send({ requiredHrCount: 1 })
      ).status,
    ).toBe(409);
    const first = await ApplicationModel.findOne({ jobId: job._id });
    const another = await ApplicationModel.create({
      jobId: job._id,
      companyId: ownerUser.companyId,
      candidateId: new mongoose.Types.ObjectId().toString(),
      candidateName: "Second candidate",
      jobTitle: job.title,
      resumeId: new mongoose.Types.ObjectId().toString(),
      snapshot: {},
      status: "Shortlisted",
    });
    const distribute = (assignments: unknown[]) =>
      owner.patch(`/api/jobs/${job._id}/distribution`).send({ assignments });
    expect(
      (
        await distribute([
          {
            applicationId: first!.id,
            hrId: secondId,
            expectedHrId: hrUser._id,
          },
        ])
      ).status,
    ).toBe(403);
    expect(
      (
        await second
          .patch(`/api/hr/assignments/${job._id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    const rows = [
      { applicationId: first!.id, hrId: hrUser._id, expectedHrId: hrUser._id },
      { applicationId: another.id, hrId: secondId, expectedHrId: secondId },
    ];
    expect((await distribute([rows[0], rows[0]])).status).toBe(400);
    expect(
      (
        await distribute([
          rows[0],
          {
            ...rows[1],
            applicationId: new mongoose.Types.ObjectId().toString(),
          },
        ])
      ).status,
    ).toBe(404);
    expect((await ApplicationModel.findById(first!.id))!.assignedHrId).toBe(
      hrUser._id,
    );
    expect((await ApplicationModel.findById(another.id))!.assignedHrId).toBe(
      secondId,
    );
    expect((await distribute(rows)).status).toBe(200);
    expect(
      (await distribute([{ ...rows[0], hrId: secondId, expectedHrId: null }]))
        .status,
    ).toBe(409);
    expect(
      (await hr.get("/api/applications")).body.map((a: any) => a._id),
    ).toEqual([first!.id]);
    expect(
      (await second.get("/api/applications")).body.map((a: any) => a._id),
    ).toEqual([another.id]);
    expect(
      (
        await candidate
          .patch(`/api/jobs/${job._id}/distribution`)
          .send({ assignments: rows })
      ).status,
    ).toBe(403);
    expect(
      (
        await hr
          .patch(`/api/applications/${another.id}/status`)
          .send({ status: "Rejected" })
      ).status,
    ).toBe(404);
    expect((await outsideHr.get(`/api/jobs/${job._id}`)).status).toBe(404);
    const details = (await owner.get(`/api/jobs/${job._id}`)).body;
    expect(details.counts).toMatchObject({
      applications: 2,
      shortlisted: 2,
      distributed: 2,
      accepted: 2,
    });
    expect(details.recruitmentStatus).toBe("Ready to Schedule");
    expect(
      (await second.get(`/api/jobs/${job._id}`)).body.applications,
    ).toHaveLength(1);
    expect(
      (await second.get("/api/hr/assignments")).body[0].assignedCandidateCount,
    ).toBe(1);
    expect(
      (
        await owner
          .patch(`/api/applications/${first!.id}/status`)
          .send({ status: "Under Review" })
      ).status,
    ).toBe(200);
    expect(
      (await ApplicationModel.findById(first!.id))!.assignedHrId,
    ).toBeUndefined();
    expect((await hr.get("/api/applications")).body).toHaveLength(0);
    expect(
      (
        await distribute([
          { applicationId: first!.id, hrId: hrUser._id, expectedHrId: null },
        ])
      ).status,
    ).toBe(409);
    expect(
      await NotificationModel.exists({
        userId: secondId,
        href: `/applications?jobId=${job._id}&applicationId=${another.id}`,
      }),
    ).not.toBeNull();
  });
  it("persists HR instructions and keeps them out of candidate job listings", async () => {
    const instructions = {
      type: "behavioral",
      duration: 50,
      skills: ["Communication"],
      topics: ["Project decisions"],
      criteria: "Ask about a project trade-off",
      special: "Record evidence for each criterion.",
    };
    expect(
      (
        await owner
          .patch(`/api/jobs/${job._id}`)
          .send({ interviewInstructions: instructions })
      ).status,
    ).toBe(200);
    expect(
      (await hr.get(`/api/jobs/${job._id}`)).body.job.interviewInstructions,
    ).toEqual(instructions);
    const publicJob = (await candidate.get("/api/jobs")).body[0];
    expect(publicJob.interviewInstructions).toBeUndefined();
    expect(publicJob.hrRequests).toBeUndefined();
  });
  it("migrates old assignments without assuming acceptance or distributing candidates", async () => {
    const legacy = await JobModel.create({
      ...jobInput,
      companyId: ownerUser.companyId,
      hrId: hrUser._id,
      assignmentStatus: "unassigned",
    });
    const explicit = await JobModel.create({
      ...jobInput,
      companyId: ownerUser.companyId,
      hrId: hrUser._id,
      assignmentStatus: "accepted",
    });
    const before = await ApplicationModel.countDocuments({
      assignedHrId: { $exists: true },
    });
    await migrateLegacyAssignments();
    await migrateLegacyAssignments();
    const migrated = await JobModel.findById(legacy.id);
    expect(migrated!.hrRequests).toHaveLength(1);
    expect(migrated!.hrRequests[0].status).toBe("pending");
    expect(migrated!.hrId).toBeUndefined();
    expect((await JobModel.findById(explicit.id))!.hrRequests[0].status).toBe(
      "accepted",
    );
    expect(
      await ApplicationModel.countDocuments({
        assignedHrId: { $exists: true },
      }),
    ).toBe(before);
  });
  it("requires acceptance and explicit distribution before opening a legacy appointment", async () => {
    const legacy = await JobModel.create({
      ...jobInput,
      status: "published",
      companyId: ownerUser.companyId,
      hrRequests: [{ hrId: hrUser._id, status: "pending" }],
    });
    const application = await ApplicationModel.create({
      jobId: legacy.id,
      companyId: ownerUser.companyId,
      candidateId: new mongoose.Types.ObjectId().toString(),
      candidateName: "Legacy candidate",
      resumeId: new mongoose.Types.ObjectId().toString(),
      snapshot: {},
      status: "Interview Scheduled",
    });
    const appointment = await InterviewModel.create({
      applicationId: application.id,
      companyId: ownerUser.companyId,
      candidateId: application.candidateId,
      interviewerId: hrUser._id,
      scheduledAt: new Date(Date.now() + 60000),
      type: "technical",
      status: "scheduled",
    });
    expect((await hr.get(`/api/interviews/${appointment.id}`)).status).toBe(
      403,
    );
    expect(
      (await hr.get("/api/interviews")).body.some(
        (i: any) => i._id === appointment.id,
      ),
    ).toBe(false);
    expect(
      (
        await hr
          .patch(`/api/hr/assignments/${legacy.id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(200);
    expect((await hr.get(`/api/interviews/${appointment.id}`)).status).toBe(
      403,
    );
    expect(
      (
        await owner.patch(`/api/jobs/${legacy.id}/distribution`).send({
          assignments: [
            {
              applicationId: application.id,
              hrId: hrUser._id,
              expectedHrId: null,
            },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await hr.get(`/api/interviews/${appointment.id}`)).status).toBe(
      200,
    );
    expect(
      (await hr.get("/api/interviews")).body.some(
        (i: any) => i._id === appointment.id,
      ),
    ).toBe(true);
    expect(
      (
        await owner.patch(`/api/jobs/${legacy.id}/distribution`).send({
          assignments: [
            {
              applicationId: application.id,
              hrId: null,
              expectedHrId: hrUser._id,
            },
          ],
        })
      ).status,
    ).toBe(409);
  });
});
