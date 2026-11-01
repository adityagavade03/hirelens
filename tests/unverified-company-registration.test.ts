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
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { allowedOrigins, config } from "../server/config";
import {
  CompanyModel,
  CompanyVerificationModel,
  connectDatabase,
  JobModel,
  OtpChallengeModel,
  SessionModel,
  UserModel,
} from "../server/models";

// All accounts and OTPs below belong to an empty disposable database. The only
// email request is intercepted in-process; no real address/provider is used.
const originalConfig = { ...config };
const origin = "https://hirelens-signup.example.test";
const password = "UnverifiedSignupFixture!2026";
const details = {
  companyName: "Ordinary Company Fixture",
  officialEmail: "owner@ordinary-company.example.test",
  registrationNumber: "ORDINARY-12345",
  country: "IN",
  website: "https://ordinary-company.example.test",
  industry: "Software",
  companyType: "Private company",
  address: "10 Fixture Street, Test City",
  phone: "+919876543210",
  location: "Test City",
};
const registration = {
  name: "Company Owner Fixture",
  email: details.officialEmail,
  username: "ordinary-company-owner",
  password,
  confirmPassword: password,
  role: "company",
  companyDetails: details,
};
const job = {
  title: "Platform Engineer Fixture",
  description: "Build reliable services with observable results.",
  skills: ["TypeScript"],
  experience: "1–3 years",
  location: "Test City",
  employment: "Full-time",
  criteria: "Job-related technical evidence",
  status: "draft",
};
let database: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
const post = (path: string) => request(app).post(path).set("Origin", origin);

beforeAll(async () => {
  database = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: { launchTimeout: 60000 },
  });
  await connectDatabase(database.getUri("hirelens_unverified_signup_test"));
});
beforeEach(async () => {
  Object.assign(config, originalConfig, {
    production: true,
    origin,
    localCompanyRegistration: false,
    demoLogin: false,
    verificationProvider: "http",
    verificationUrl: "",
    verificationKey: "",
    emailProvider: "http",
    emailUrl: "https://email.example.test/send",
    emailKey: "synthetic-test-key",
    emailFrom: "HireLens <noreply@example.test>",
    smtpHost: "",
    messagePreview: false,
    otpSecret: "synthetic-signup-fixture-secret-over-32-characters",
    companyOtpRequired: true,
    emailVerificationRequired: true,
  });
  allowedOrigins.add(origin);
  await Promise.all([
    CompanyModel.deleteMany({}),
    CompanyVerificationModel.deleteMany({}),
    UserModel.deleteMany({}),
    SessionModel.deleteMany({}),
    OtpChallengeModel.deleteMany({}),
    JobModel.deleteMany({}),
  ]);
  app = createApp();
});
afterEach(() => {
  vi.restoreAllMocks();
  allowedOrigins.delete(origin);
  Object.assign(config, originalConfig);
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe("Ordinary company signup before business verification", () => {
  it("advertises secure account signup without claiming legal verification or local setup", async () => {
    const options = await request(app).get("/api/auth/options");
    expect(options.body).toMatchObject({
      companyVerification: false,
      localCompanyRegistration: false,
      unverifiedCompanyRegistration: true,
      email: true,
      companyOtp: true,
    });
    expect((await post("/api/auth/company/verify").send(details)).status).toBe(
      503,
    );
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("creates one normal unverified company and one hashed owner without a session or provider request", async () => {
    const external = vi.spyOn(globalThis, "fetch");
    const result = await post("/api/auth/register").send({
      ...registration,
      companyDetails: {
        ...details,
        localDevelopment: true,
        sample: true,
        verification: { status: "verified", reference: "client-forgery" },
      },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body).toMatchObject({ registered: true });
    expect(result.body.message).toMatch(/Business verification is pending/);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect(external).not.toHaveBeenCalled();
    expect(await CompanyModel.countDocuments()).toBe(1);
    expect(await UserModel.countDocuments()).toBe(1);
    expect(await CompanyVerificationModel.countDocuments()).toBe(0);
    expect(await SessionModel.countDocuments()).toBe(0);
    const company = await CompanyModel.findOne().select(
      "+verification.reference",
    );
    const owner = await UserModel.findOne().select("+passwordHash");
    expect(company).toMatchObject({
      name: details.companyName,
      officialEmail: details.officialEmail,
      localDevelopment: false,
      sample: false,
      registrationKey: "IN:ORDINARY12345",
      verification: { status: "unverified" },
    });
    expect(company!.verification?.reference).toBeUndefined();
    expect(company!.verification?.verifiedAt).toBeUndefined();
    expect(owner!.companyId).toBe(company!.id);
    expect(company!.ownerId).toBe(owner!.id);
    expect(owner!.role).toBe("company");
    expect(owner!.emailVerifiedAt).toBeUndefined();
    expect(owner!.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, owner!.passwordHash)).toBe(true);
  });

  it.each([
    ["missing email", { emailUrl: "" }],
    ["short OTP secret", { otpSecret: "short" }],
    ["OTP disabled", { companyOtpRequired: false }],
    ["production message preview only", { emailUrl: "", messagePreview: true }],
  ])(
    "fails closed for %s before saving an account",
    async (_label, overrides) => {
      Object.assign(config, overrides);
      expect(
        (await request(app).get("/api/auth/options")).body
          .unverifiedCompanyRegistration,
      ).toBe(false);
      const result = await post("/api/auth/register").send(registration);
      expect(result.status).toBe(503);
      expect(result.body.error.code).toBe("EMAIL_NOT_CONFIGURED");
      expect(await UserModel.countDocuments()).toBe(0);
      expect(await CompanyModel.countDocuments()).toBe(0);
    },
  );

  it("rejects wrong roles, mixed modes, mismatched identity and invalid credentials", async () => {
    for (const value of [
      { ...registration, role: "candidate" },
      { ...registration, role: "hr" },
      { ...registration, localCompanyDetails: details },
      { ...registration, verificationToken: "a".repeat(64) },
      { ...registration, email: "different@example.test" },
      { ...registration, username: undefined },
      { ...registration, confirmPassword: "DifferentPassword!" },
      { ...registration, companyDetails: { ...details, website: "invalid" } },
    ]) {
      expect((await post("/api/auth/register").send(value)).status).toBe(400);
    }
    expect(await CompanyModel.countDocuments()).toBe(0);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("keeps company identity and owner email unique", async () => {
    expect((await post("/api/auth/register").send(registration)).status).toBe(
      201,
    );
    expect((await post("/api/auth/register").send(registration)).status).toBe(
      409,
    );
    const anotherEmail = "another-owner@ordinary-company.example.test";
    expect(
      (
        await post("/api/auth/register").send({
          ...registration,
          email: anotherEmail,
          username: "another-owner-fixture",
          companyDetails: { ...details, officialEmail: anotherEmail },
        })
      ).status,
    ).toBe(409);
    expect(await CompanyModel.countDocuments()).toBe(1);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it("uses normal password plus one-time email verification and still blocks public publishing", async () => {
    expect((await post("/api/auth/register").send(registration)).status).toBe(
      201,
    );
    const wrongRole = await post("/api/auth/login").send({
      identifier: registration.username,
      password,
      role: "candidate",
    });
    expect(wrongRole.status).toBe(401);
    let code = "";
    const external = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (url, options) => {
        expect(String(url)).toBe(config.emailUrl);
        const email = JSON.parse(String(options?.body));
        expect(email.to).toBe(details.officialEmail);
        code = email.text.match(/\b\d{6}\b/)[0];
        return new Response(
          JSON.stringify({ accepted: true, messageId: "synthetic-signup-otp" }),
        );
      });
    const login = await post("/api/auth/login").send({
      identifier: registration.username,
      password,
      role: "company",
    });
    expect(login.status, JSON.stringify(login.body)).toBe(202);
    expect(login.body.otpRequired).toBe(true);
    expect(login.body.code).toBeUndefined();
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(await SessionModel.countDocuments()).toBe(0);
    expect(external).toHaveBeenCalledOnce();
    const wrongCode = code === "000000" ? "111111" : "000000";
    expect(
      (
        await post("/api/auth/otp/verify").send({
          challengeToken: login.body.challengeToken,
          code: wrongCode,
        })
      ).status,
    ).toBe(400);
    const signed = await post("/api/auth/otp/verify").send({
      challengeToken: login.body.challengeToken,
      code,
    });
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(signed.body.user.role).toBe("company");
    expect(signed.body.user.passwordHash).toBeUndefined();
    expect(signed.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(signed.headers["set-cookie"][0]).toContain("Secure");
    const cookie = signed.headers["set-cookie"][0].split(";")[0];
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    ).toBe(200);
    expect(
      (
        await post("/api/auth/otp/verify").send({
          challengeToken: login.body.challengeToken,
          code,
        })
      ).status,
    ).toBe(400);
    const company = await CompanyModel.findOne();
    const owner = await UserModel.findOne();
    expect(owner!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(company!.verification?.status).toBe("unverified");
    expect(company!.localDevelopment).toBe(false);
    const draft = await post("/api/jobs").set("Cookie", cookie).send(job);
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const published = await post("/api/jobs")
      .set("Cookie", cookie)
      .send({ ...job, status: "published" });
    expect(published.status).toBe(403);
    expect(published.body.error.message).toMatch(/Verify your company profile/);
    expect(await JobModel.countDocuments({ status: "published" })).toBe(0);
    expect(external).toHaveBeenCalledOnce();
  });
});
