import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { assertPublishable } from "../server/company";
import { hashToken, userForToken } from "../server/security";
import {
  ApplicationModel,
  CompanyModel,
  CompanyVerificationModel,
  connectDatabase,
  InvitationModel,
  JobModel,
  OtpChallengeModel,
  ResumeModel,
  SessionModel,
  UserModel,
} from "../server/models";

// This suite uses an empty, disposable database. No normal local records or
// configured verification/email provider are used.
const originalConfig = { ...config };
const password = "LocalOnlyTestPassword!2026";
const details = {
  companyName: "Local Onboarding Fixture",
  officialEmail: "owner@local-onboarding.example.test",
  registrationNumber: "LOCAL-12345",
  country: "IN",
  website: "https://local-onboarding.example.test",
  industry: "Software",
  companyType: "Private company",
  address: "10 Fixture Street, Test City",
  phone: "1234567890",
  location: "Test City",
};
const registration = {
  name: "Local Company Owner",
  email: details.officialEmail,
  username: "local-company-owner",
  password,
  confirmPassword: password,
  role: "company",
  localCompanyDetails: details,
};
const jobInput = {
  title: "Local Platform Engineer",
  description: "Build reliable services and thoughtful interfaces.",
  skills: ["TypeScript"],
  experience: "1–3 years",
  location: "Test City",
  employment: "Full-time",
  criteria: "Job-related technical evidence",
  status: "published" as const,
};
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
let db: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

async function register() {
  const result = await request(app)
    .post("/api/auth/register")
    .send(registration);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result;
}

async function sessionFor(userId: string) {
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const client = request.agent(app);
  client.jar.setCookie(`hirelens_session=${token}`);
  return { client, token };
}

async function startCompanyLogin() {
  let code = "";
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(async (_url, options) => {
      const email = JSON.parse(String(options?.body));
      expect(email.to).toBe(details.officialEmail);
      code = email.text.match(/\b\d{6}\b/)[0];
      return jsonResponse({
        accepted: true,
        messageId: "isolated-email-fixture",
      });
    });
  const client = request.agent(app);
  const login = await client.post("/api/auth/login").send({
    identifier: registration.username,
    password,
    role: "company",
  });
  expect(login.status, JSON.stringify(login.body)).toBe(202);
  expect(mock).toHaveBeenCalledOnce();
  mock.mockRestore();
  return { client, login, code };
}

beforeAll(async () => {
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: { launchTimeout: 60000 },
  });
  await connectDatabase(db.getUri("hirelens_local_company_test"));
});
beforeEach(async () => {
  Object.assign(config, originalConfig, {
    localCompanyRegistration: true,
    production: false,
    host: "127.0.0.1",
    origin: "http://localhost:5173",
    verificationUrl: "",
    verificationKey: "",
    emailUrl: "https://email.example.test/send",
    emailKey: "isolated-email-fixture-key",
    emailFrom: "HireLens <noreply@example.test>",
    smtpHost: "",
    messagePreview: false,
    otpSecret: "isolated-local-onboarding-secret-with-over-32-characters",
    companyOtpRequired: true,
    demoLogin: false,
    emailVerificationRequired: false,
  });
  await Promise.all([
    CompanyModel.deleteMany({}),
    CompanyVerificationModel.deleteMany({}),
    UserModel.deleteMany({}),
    SessionModel.deleteMany({}),
    OtpChallengeModel.deleteMany({}),
    JobModel.deleteMany({}),
    ApplicationModel.deleteMany({}),
    InvitationModel.deleteMany({}),
    ResumeModel.deleteMany({}),
  ]);
  app = createApp();
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, originalConfig);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

describe("Explicit local company onboarding", () => {
  it("is advertised and accepted only when explicitly enabled on local development hosts", async () => {
    const base = { ...config };
    for (const change of [
      { localCompanyRegistration: false },
      { production: true },
      { host: "0.0.0.0" },
      { host: "192.168.1.20" },
      { origin: "https://hirelens.example.test" },
      { origin: "https://localhost.attacker.example.test" },
    ]) {
      Object.assign(config, base, change);
      const options = await request(app).get("/api/auth/options");
      expect(options.body.localCompanyRegistration).toBe(false);
      expect(
        (await request(app).post("/api/auth/register").send(registration))
          .status,
      ).toBe(403);
    }
    Object.assign(config, base, { origin: "http://onboarding.localhost:5174" });
    const options = await request(app).get("/api/auth/options");
    expect(options.body.localCompanyRegistration).toBe(true);
    expect(options.body.companyVerification).toBe(false);
    expect(options.body.messagePreview).toBe(false);
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await CompanyModel.countDocuments()).toBe(0);
  });

  it("preserves the real verification path and rejects malformed or mixed registration modes", async () => {
    expect(
      (await request(app).post("/api/auth/company/verify").send(details))
        .status,
    ).toBe(503);
    const { localCompanyDetails: _local, ...normalRegistration } = registration;
    expect(
      (await request(app).post("/api/auth/register").send(normalRegistration))
        .status,
    ).toBe(400);
    for (const invalid of [
      { ...registration, role: "candidate" },
      { ...registration, role: "hr" },
      { ...registration, verificationToken: "a".repeat(64) },
      { ...registration, email: "different@example.test" },
      { ...registration, username: undefined },
      { ...registration, confirmPassword: "DoesNotMatch!" },
      {
        ...registration,
        localCompanyDetails: { ...details, website: "invalid" },
      },
    ]) {
      expect(
        (await request(app).post("/api/auth/register").send(invalid)).status,
      ).toBe(400);
    }
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await CompanyModel.countDocuments()).toBe(0);
    expect(await CompanyVerificationModel.countDocuments()).toBe(0);
  });

  it("creates only an unverified local company with hashed credentials and no automatic login", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const result = await register();
    expect(result.body.registered).toBe(true);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    const company = await CompanyModel.findOne().select(
      "+verification.reference",
    );
    expect(company).toBeTruthy();
    expect(company!.localDevelopment).toBe(true);
    expect(company!.sample).toBe(false);
    expect(company!.verification?.status).toBe("unverified");
    expect(company!.verification?.verifiedAt).toBeUndefined();
    expect(company!.verification?.reference).toBeUndefined();
    expect(company!.verification?.legalName).toBeUndefined();
    expect(company!.registrationKey).toBe("IN:LOCAL12345");
    expect(company!.name).toBe(details.companyName);
    const owner = await UserModel.findOne().select("+passwordHash");
    expect(owner!.companyId).toBe(company!.id);
    expect(company!.ownerId).toBe(owner!.id);
    expect(owner!.sample).toBe(false);
    expect(owner!.emailVerifiedAt).toBeUndefined();
    expect(owner!.passwordHash).not.toBe(password);
    expect(owner!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await SessionModel.countDocuments()).toBe(0);
    expect(await CompanyVerificationModel.countDocuments()).toBe(0);
  });

  it("rejects duplicate company identities before creating another user", async () => {
    await register();
    expect(
      (await request(app).post("/api/auth/register").send(registration)).status,
    ).toBe(409);
    const other = {
      ...registration,
      username: "different-local-owner",
      email: "another-owner@example.test",
      localCompanyDetails: {
        ...details,
        officialEmail: "another-owner@example.test",
        registrationNumber: "local 12345",
      },
    };
    expect(
      (await request(app).post("/api/auth/register").send(other)).status,
    ).toBe(409);
    // A company identity can already exist even if no matching user survives.
    await UserModel.deleteMany({});
    expect(
      (await request(app).post("/api/auth/register").send(registration)).status,
    ).toBe(409);
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await CompanyModel.countDocuments()).toBe(1);
  });

  it("rolls the user back if a company uniqueness race rejects the final insert", async () => {
    vi.spyOn(CompanyModel, "create").mockRejectedValueOnce(
      Object.assign(new Error("duplicate fixture"), { code: 11000 }),
    );
    const result = await request(app)
      .post("/api/auth/register")
      .send(registration);
    expect(result.status).toBe(409);
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await CompanyModel.countDocuments()).toBe(0);
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it("still requires an email OTP and does not turn OTP success into company verification", async () => {
    await register();
    const { client, login, code } = await startCompanyLogin();
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(login.body.code).toBeUndefined();
    expect(JSON.stringify(login.body)).not.toContain(code);
    expect((await client.get("/api/auth/me")).status).toBe(401);
    const challenge = await OtpChallengeModel.findOne().select("+codeHash");
    expect(challenge!.codeHash).not.toBe(code);
    const signed = await client
      .post("/api/auth/otp/verify")
      .send({ challengeToken: login.body.challengeToken, code });
    expect(signed.status).toBe(200);
    expect(signed.body.user.role).toBe("company");
    expect(signed.body.user.passwordHash).toBeUndefined();
    expect(
      (await client.get("/api/company")).body.company.verification.status,
    ).toBe("unverified");
    expect((await client.post("/api/jobs").send(jobInput)).status).toBe(201);
  });

  it("blocks local company and member sessions, logins, and publishing after local mode is disabled", async () => {
    await register();
    const owner = await UserModel.findOne();
    const company = await CompanyModel.findOne();
    const member = await UserModel.create({
      name: "Local HR Fixture",
      email: "hr@example.test",
      role: "hr",
      companyId: company!.id,
      passwordHash: "unused isolated fixture",
    });
    const ownerSession = await sessionFor(owner!.id);
    const memberSession = await sessionFor(member.id);
    expect((await ownerSession.client.get("/api/company")).status).toBe(200);
    expect((await memberSession.client.get("/api/company")).status).toBe(200);
    await expect(assertPublishable(company!.id)).resolves.toBeUndefined();
    config.localCompanyRegistration = false;
    expect(await userForToken(ownerSession.token)).toBeNull();
    expect(await userForToken(memberSession.token)).toBeNull();
    expect((await ownerSession.client.get("/api/company")).status).toBe(401);
    expect((await memberSession.client.get("/api/company")).status).toBe(401);
    expect(
      (
        await request(app).post("/api/auth/login").send({
          identifier: registration.username,
          password,
          role: "company",
        })
      ).status,
    ).toBe(403);
    await expect(assertPublishable(company!.id)).rejects.toMatchObject({
      status: 403,
    });
    Object.assign(config, { localCompanyRegistration: true, production: true });
    expect(await userForToken(ownerSession.token)).toBeNull();
    await expect(assertPublishable(company!.id)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("cannot redeem or resend an existing local-company OTP after local mode is disabled", async () => {
    await register();
    const { client, login, code } = await startCompanyLogin();
    config.localCompanyRegistration = false;
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(
      (
        await client
          .post("/api/auth/otp/resend")
          .send({ challengeToken: login.body.challengeToken })
      ).status,
    ).toBe(403);
    expect(
      (
        await client
          .post("/api/auth/otp/verify")
          .send({ challengeToken: login.body.challengeToken, code })
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(await SessionModel.countDocuments()).toBe(0);
    expect((await UserModel.findOne())!.emailVerifiedAt).toBeUndefined();
  });

  it("hides local jobs and rejects applications when local mode is disabled while preserving verified jobs", async () => {
    await register();
    const company = await CompanyModel.findOne();
    const localJob = await JobModel.create({
      ...jobInput,
      companyId: company!.id,
      companyName: company!.name,
    });
    const verified = await CompanyModel.create({
      name: "Verified Job Fixture",
      ownerId: new mongoose.Types.ObjectId().toString(),
      identifier: "VERIFIED-JOB-FIXTURE",
      verification: { status: "verified" },
    });
    const verifiedJob = await JobModel.create({
      ...jobInput,
      companyId: verified.id,
      companyName: verified.name,
    });
    const candidate = await UserModel.create({
      name: "Local Application Fixture",
      email: "candidate@example.test",
      role: "candidate",
      passwordHash: "unused isolated fixture",
      profile: { skills: ["TypeScript"] },
    });
    const resume = await ResumeModel.create({
      ownerId: candidate.id,
      name: "fixture.pdf",
      text: "TypeScript development experience",
      data: Buffer.from("isolated resume fixture"),
    });
    candidate.profile!.resumeId = resume.id;
    await candidate.save();
    const { client } = await sessionFor(candidate.id);
    expect(
      (await client.get("/api/jobs")).body.map((job: any) => job._id),
    ).toEqual(expect.arrayContaining([localJob.id, verifiedJob.id]));
    config.localCompanyRegistration = false;
    expect(
      (await client.get("/api/jobs")).body.map((job: any) => job._id),
    ).toEqual([verifiedJob.id]);
    expect(
      (await client.post(`/api/jobs/${localJob.id}/apply`).send({})).status,
    ).toBe(403);
    expect(await ApplicationModel.countDocuments()).toBe(0);
    const reviewed = {
      name: candidate.name,
      email: candidate.email,
      phone: "+91 98765 43210",
      city: "Bengaluru",
      state: "Karnataka",
      education: "Computer Science",
      skills: ["TypeScript"],
      resumeId: resume.id,
      resumeConfirmed: true,
      detailsConfirmed: true,
    };
    expect(
      (await client.post(`/api/jobs/${verifiedJob.id}/apply`).send(reviewed))
        .status,
    ).toBe(201);
    config.localCompanyRegistration = true;
    expect(
      (await client.post(`/api/jobs/${localJob.id}/apply`).send(reviewed))
        .status,
    ).toBe(201);
  });

  it("does not trap an HR account in a disabled local company when accepting an old invitation", async () => {
    await register();
    const company = await CompanyModel.findOne();
    const hr = await UserModel.create({
      name: "Invitation HR Fixture",
      email: "invited-hr@example.test",
      role: "hr",
      passwordHash: "unused isolated fixture",
    });
    const invitation = await InvitationModel.create({
      companyId: company!.id,
      companyName: company!.name,
      email: hr.email,
      status: "pending",
    });
    const { client, token } = await sessionFor(hr.id);
    config.localCompanyRegistration = false;
    expect(
      (
        await client
          .patch(`/api/invitations/${invitation.id}`)
          .send({ status: "accepted" })
      ).status,
    ).toBe(403);
    expect((await UserModel.findById(hr.id))!.companyId).toBeUndefined();
    expect((await InvitationModel.findById(invitation.id))!.status).toBe(
      "pending",
    );
    expect((await userForToken(token))?._id).toBe(hr.id);
    expect(
      (
        await client
          .patch(`/api/invitations/${invitation.id}`)
          .send({ status: "rejected" })
      ).status,
    ).toBe(200);
    expect((await InvitationModel.findById(invitation.id))!.status).toBe(
      "rejected",
    );
  });

  it("upgrades a local company only after a matching real verification response", async () => {
    await register();
    const owner = await UserModel.findOne();
    const { client, token } = await sessionFor(owner!.id);
    config.verificationUrl = "https://verification.example.test/verify";
    config.verificationKey = "isolated-verification-key";
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        verified: true,
        legalName: "Registry Verified Fixture",
        reference: "registry-fixture-reference",
        officialEmail: details.officialEmail,
        country: details.country,
        registrationNumber: details.registrationNumber,
      }),
    );
    expect(
      (await client.post("/api/company/verify").send(details)).status,
    ).toBe(200);
    expect(mock).toHaveBeenCalledOnce();
    mock.mockRestore();
    const company = await CompanyModel.findOne().select(
      "+verification.reference",
    );
    expect(company!.localDevelopment).toBe(false);
    expect(company!.verification?.status).toBe("verified");
    expect(company!.verification?.verifiedAt).toBeInstanceOf(Date);
    expect(company!.verification?.reference).toBe("registry-fixture-reference");
    expect(company!.name).toBe("Registry Verified Fixture");
    config.localCompanyRegistration = false;
    expect((await userForToken(token))?._id).toBe(owner!.id);
    await expect(assertPublishable(company!.id)).resolves.toBeUndefined();
    const { login } = await startCompanyLogin();
    expect(login.body.otpRequired).toBe(true);
  });
});
