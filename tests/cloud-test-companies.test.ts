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
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { io as connectSocket } from "socket.io-client";
import bcrypt from "bcryptjs";
import * as cloudTests from "../server/cloud-test-companies";
import {
  config,
  allowedOrigins,
  localCompanyRegistrationEnabled,
} from "../server/config";
import { createApp } from "../server/app";
import { attachRealtime } from "../server/realtime";
import { assertPublishable } from "../server/company";
import { hashToken, userForToken } from "../server/security";
import {
  CompanyModel,
  UserModel,
  SessionModel,
  JobModel,
  OtpChallengeModel,
  connectDatabase,
} from "../server/models";

const companyId = "1234567890abcdef12345678";
const secondCompanyId = "1234567890abcdef12345679";
const outsideId = "1234567890abcdef12345670";
const origin = "https://hirelens-cloud-test.example.test";
const environment = (overrides: NodeJS.ProcessEnv = {}, now = Date.now()) => ({
  NODE_ENV: "production",
  APP_ORIGIN: origin,
  CLOUD_TEST_COMPANY_IDS: `${companyId},${secondCompanyId}`,
  CLOUD_TEST_EXPIRES_AT: new Date(now + 3600000).toISOString(),
  ...overrides,
});
const original = { ...config };
const originalOrigins = new Set(allowedOrigins);
const guards: ReturnType<typeof cloudTests.createCloudTestAccess>[] = [];
function access(...args: Parameters<typeof cloudTests.createCloudTestAccess>) {
  const guard = cloudTests.createCloudTestAccess(...args);
  guards.push(guard);
  return guard;
}

afterEach(() => {
  for (const guard of guards.splice(0)) guard.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.assign(config, original);
  allowedOrigins.clear();
  for (const value of originalOrigins) allowedOrigins.add(value);
});

describe("Bounded cloud company testing policy", () => {
  it("is disabled by default and requires complete explicit configuration", () => {
    expect(
      cloudTests.parseCloudTestEnvironment({ NODE_ENV: "production" }),
    ).toBeNull();
    for (const invalid of [
      { CLOUD_TEST_COMPANY_IDS: companyId },
      { CLOUD_TEST_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() },
      environment({ CLOUD_TEST_COMPANY_IDS: "" }),
      environment({ CLOUD_TEST_EXPIRES_AT: "" }),
    ])
      expect(() => cloudTests.parseCloudTestEnvironment(invalid)).toThrow(
        "Cloud company testing requires",
      );
  });

  it("requires production and an exact public HTTPS origin without preview settings", () => {
    for (const invalid of [
      { NODE_ENV: "development" },
      { NODE_ENV: "test" },
      { APP_ORIGIN: "http://hirelens.example.test" },
      { APP_ORIGIN: `${origin}/` },
      { APP_ORIGIN: `${origin}/path` },
      { APP_ORIGIN: `${origin}?query=yes` },
      { APP_ORIGIN: `${origin}#fragment` },
      { APP_ORIGIN: "https://user:password@hirelens.example.test" },
      { APP_ORIGIN: "https://127.0.0.1" },
      { APP_ORIGIN: "https://[::1]" },
      { APP_ORIGIN: "https://localhost" },
      { APP_ORIGIN: "https://device.localhost" },
      { PRIVATE_PREVIEW_ACCESS: "account" },
      { PRIVATE_PREVIEW_COMPANY_IDS: "" },
    ])
      expect(() =>
        cloudTests.parseCloudTestEnvironment(environment(invalid)),
      ).toThrow("Cloud company testing requires");
  });

  it("permits only one or two explicit distinct ObjectIds, with no wildcard or implied membership", () => {
    const parsed = cloudTests.parseCloudTestEnvironment(
      environment({
        CLOUD_TEST_COMPANY_IDS: `${companyId.toUpperCase()}, ${secondCompanyId}`,
      }),
    );
    const guard = access(parsed);
    expect(guard.allowsCompany(companyId)).toBe(true);
    expect(guard.allowsCompany(secondCompanyId)).toBe(true);
    expect(guard.allowsCompany(outsideId)).toBe(false);
    expect(guard.allowsCompany()).toBe(false);
    for (const ids of [
      "*",
      "all",
      `${companyId},`,
      `${companyId},${companyId}`,
      `${companyId},${secondCompanyId},${outsideId}`,
      "not-an-object-id",
    ])
      expect(() =>
        cloudTests.parseCloudTestEnvironment(
          environment({ CLOUD_TEST_COMPANY_IDS: ids }),
        ),
      ).toThrow("Cloud company testing requires");
  });

  it("accepts an absolute expiry up to 31 days and rejects expired, rolled or longer dates", () => {
    const now = Date.UTC(2026, 9, 22, 0, 0, 0);
    const boundary = new Date(now + 31 * 86400000).toISOString();
    expect(
      cloudTests.parseCloudTestEnvironment(
        environment({ CLOUD_TEST_EXPIRES_AT: boundary }, now),
        now,
      )?.expiresAt,
    ).toBe(Date.parse(boundary));
    for (const expiry of [
      new Date(now).toISOString(),
      new Date(now - 1).toISOString(),
      new Date(now + 31 * 86400000 + 1).toISOString(),
      "2026-11-01",
      "invalid",
      "2026-02-30T00:00:00.000Z",
    ])
      expect(() =>
        cloudTests.parseCloudTestEnvironment(
          environment({ CLOUD_TEST_EXPIRES_AT: expiry }, now),
          now,
        ),
      ).toThrow("Cloud company testing requires");
  });

  it("revokes the selected IDs at the original absolute deadline without sliding the expiry", () => {
    let now = Date.UTC(2026, 9, 22, 0, 0, 0);
    const expiresAt = now + 31 * 86400000;
    const guard = access(
      cloudTests.parseCloudTestEnvironment(
        environment(
          { CLOUD_TEST_EXPIRES_AT: new Date(expiresAt).toISOString() },
          now,
        ),
        now,
      ),
      () => now,
    );
    now = expiresAt - 1;
    expect(guard.allowsCompany(companyId)).toBe(true);
    now = expiresAt;
    expect(guard.allowsCompany(companyId)).toBe(false);
    expect(guard.allowsCompany(secondCompanyId)).toBe(false);
    expect(guard.configured).toBe(true);
    expect(() =>
      cloudTests.parseCloudTestEnvironment(
        environment(
          { CLOUD_TEST_EXPIRES_AT: new Date(expiresAt).toISOString() },
          now,
        ),
        now,
      ),
    ).toThrow();
  });

  it("adds an accessible unverified test notice without exposing company IDs or changing ordinary HTML", () => {
    const html = '<html><body class="app"><div id="root"></div></body></html>';
    const guard = access(cloudTests.parseCloudTestEnvironment(environment()));
    const decorated = guard.decorateHtml(html);
    expect(decorated).toContain('aria-label="Cloud test workspace"');
    expect(decorated).toContain("Selected companies remain unverified");
    expect(decorated).toContain("Workspace access ends");
    expect(decorated).toContain(
      "Normal sign-in and email verification required",
    );
    expect(decorated).not.toContain(companyId);
    expect(access(null).decorateHtml(html)).toBe(html);
  });

  it("blocks every public, candidate and API request at expiry before downstream data or cookies", async () => {
    let now = Date.now();
    const expiry = now + 3600000;
    const guard = access(
      cloudTests.parseCloudTestEnvironment(
        environment(
          { CLOUD_TEST_EXPIRES_AT: new Date(expiry).toISOString() },
          now,
        ),
        now,
      ),
      () => now,
    );
    const app = express();
    const downstream = vi.fn((_req: express.Request, res: express.Response) =>
      res.cookie("downstream", "not-after-expiry").json({ privateData: true }),
    );
    guard.install(app);
    app.use(downstream);
    expect((await request(app).get("/candidate")).status).toBe(200);
    downstream.mockClear();
    now = expiry;
    for (const path of [
      "/",
      "/auth/candidate",
      "/auth/company",
      "/auth/hr",
      "/candidate",
      "/api/health",
      "/api/auth/me",
      "/api/jobs",
      "/assets/main.js",
    ]) {
      const result = await request(app)
        .get(path)
        .set("Cookie", "hirelens_session=existing-candidate-cookie");
      expect(result.status).toBe(410);
      expect(result.body).toEqual({
        error: {
          code: "CLOUD_TEST_EXPIRED",
          message: "This HireLens test workspace has expired.",
        },
      });
      expect(result.headers["set-cookie"]).toBeUndefined();
      expect(result.headers["cache-control"]).toBe("no-store");
    }
    const mutation = await request(app)
      .post("/api/auth/register")
      .send({ role: "candidate" });
    expect(mutation.status).toBe(410);
    expect(mutation.headers["set-cookie"]).toBeUndefined();
    expect(downstream).not.toHaveBeenCalled();
  });

  it("leaves ordinary production requests and sockets unchanged when cloud testing is unset", async () => {
    const guard = access(null);
    const app = express();
    guard.install(app);
    app.use((_req, res) => res.json({ ordinaryApplication: true }));
    expect((await request(app).get("/api/health")).body).toEqual({
      ordinaryApplication: true,
    });
    expect(guard.socketAllowed()).toBe(true);
    const socket = { disconnect: vi.fn(), once: vi.fn() };
    guard.trackSocket(socket);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("keeps a 31-day workspace live without timer overflow, then disconnects existing candidate sockets at its deadline", async () => {
    vi.useFakeTimers();
    const start = Date.UTC(2026, 9, 22, 0, 0, 0);
    vi.setSystemTime(start);
    const expiry = start + 31 * 86400000;
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const guard = access(
      cloudTests.parseCloudTestEnvironment(
        environment(
          { CLOUD_TEST_EXPIRES_AT: new Date(expiry).toISOString() },
          start,
        ),
        start,
      ),
    );
    const socket = { disconnect: vi.fn(), once: vi.fn() };
    guard.trackSocket(socket);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(
      timeout.mock.calls.every(([, duration]) => Number(duration) <= 60000),
    ).toBe(true);
    vi.setSystemTime(expiry - 60001);
    await vi.advanceTimersByTimeAsync(60000);
    expect(guard.socketAllowed()).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(guard.socketAllowed()).toBe(false);
    expect(socket.disconnect).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe("Cloud company access integration", () => {
  let database: MongoMemoryServer;
  let app: ReturnType<typeof createApp>;
  const password = "CloudOnlyFixturePassword2026!";
  let now: number;
  let expiry: number;
  beforeAll(async () => {
    database = await MongoMemoryServer.create({
      binary: { version: "7.0.24" },
      instance: { launchTimeout: 60000 },
    });
    await connectDatabase(database.getUri("hirelens_cloud_company_test"));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await database?.stop();
  });
  beforeEach(async () => {
    now = Date.now();
    expiry = now + 3600000;
    const guard = access(
      cloudTests.parseCloudTestEnvironment(
        environment(
          { CLOUD_TEST_EXPIRES_AT: new Date(expiry).toISOString() },
          now,
        ),
        now,
      ),
      () => now,
    );
    vi.spyOn(cloudTests, "cloudTestAllowsCompany").mockImplementation(
      guard.allowsCompany,
    );
    vi.spyOn(cloudTests, "installCloudTestGate").mockImplementation(
      guard.install,
    );
    vi.spyOn(cloudTests, "cloudTestSocketAllowed").mockImplementation(
      guard.socketAllowed,
    );
    vi.spyOn(cloudTests, "trackCloudTestSocket").mockImplementation(
      guard.trackSocket,
    );
    Object.assign(config, {
      production: true,
      host: "0.0.0.0",
      origin,
      localCompanyRegistration: true,
      demoLogin: false,
      companyOtpRequired: true,
      emailVerificationRequired: true,
      messagePreview: false,
      smtpHost: "",
      emailUrl: "https://email.example.test/send",
      emailKey: "isolated-cloud-fixture-key",
      emailFrom: "HireLens <noreply@example.test>",
      otpSecret: "isolated-cloud-fixture-secret-with-more-than-32-characters",
      verificationUrl: "",
      verificationKey: "",
    });
    allowedOrigins.clear();
    allowedOrigins.add(origin);
    await Promise.all([
      CompanyModel.deleteMany({}),
      UserModel.deleteMany({}),
      SessionModel.deleteMany({}),
      JobModel.deleteMany({}),
      OtpChallengeModel.deleteMany({}),
    ]);
    for (const id of [companyId, secondCompanyId, outsideId]) {
      const ownerId = new mongoose.Types.ObjectId().toString();
      await CompanyModel.create({
        _id: id,
        name: `Cloud Test ${id}`,
        identifier: `CLOUD-${id}`,
        ownerId,
        localDevelopment: true,
        verification: { status: "unverified" },
      });
      await UserModel.create({
        _id: ownerId,
        email: `owner-${id}@example.test`,
        name: "Cloud Owner Fixture",
        role: "company",
        companyId: id,
        passwordHash: await bcrypt.hash(password, 4),
      });
    }
    app = createApp();
  });
  async function cookieFor(role: "company" | "hr" | "candidate", id?: string) {
    const user =
      role === "company"
        ? await UserModel.findOne({ role, companyId: id })
        : await UserModel.create({
            name: `${role} Cloud Fixture`,
            email: `${role}-${randomBytes(4).toString("hex")}@example.test`,
            role,
            companyId: id,
            emailVerifiedAt: new Date(),
            passwordHash: await bcrypt.hash(password, 4),
          });
    const token = randomBytes(32).toString("hex");
    await SessionModel.create({
      tokenHash: hashToken(token),
      userId: user!.id,
      expiresAt: new Date(Date.now() + 3600000),
    });
    return { cookie: `hirelens_session=${token}`, token, user: user! };
  }

  it("allows only selected companies and their members, without verifying them or opening local registration", async () => {
    expect(localCompanyRegistrationEnabled()).toBe(false);
    for (const id of [companyId, secondCompanyId]) {
      const owner = await cookieFor("company", id);
      const hr = await cookieFor("hr", id);
      expect(
        (await request(app).get("/api/company").set("Cookie", owner.cookie))
          .status,
      ).toBe(200);
      expect(
        (await request(app).get("/api/company").set("Cookie", hr.cookie))
          .status,
      ).toBe(200);
      await expect(assertPublishable(id)).resolves.toBeUndefined();
      const company = await CompanyModel.findById(id);
      expect(company!.localDevelopment).toBe(true);
      expect(company!.verification?.status).toBe("unverified");
      expect(company!.verification?.verifiedAt).toBeUndefined();
    }
    const outside = await cookieFor("company", outsideId);
    expect(await userForToken(outside.token)).toBeNull();
    await expect(assertPublishable(outsideId)).rejects.toMatchObject({
      status: 403,
    });
    const options = await request(app).get("/api/auth/options");
    expect(options.body.localCompanyRegistration).toBe(false);
    expect(options.body.companyOtp).toBe(true);
    expect(options.body.demo).toBe(false);
  });

  it("keeps company OTP mandatory and does not create a session before email verification", async () => {
    const user = await UserModel.findOne({ companyId });
    const deliver = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accepted: true,
          messageId: "cloud-test-email-fixture",
        }),
        { status: 200 },
      ),
    );
    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ identifier: user!.email, password, role: "company" });
    expect(login.status).toBe(202);
    expect(login.body.otpRequired).toBe(true);
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(login.body.code).toBeUndefined();
    expect(deliver).toHaveBeenCalledOnce();
    expect(await SessionModel.countDocuments()).toBe(0);
    expect((await CompanyModel.findById(companyId))!.verification?.status).toBe(
      "unverified",
    );
  });

  it("does not enable local company signup or bypass HR and candidate email verification", async () => {
    const registration = await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        name: "New Cloud Company",
        email: "new-company@example.test",
        username: "new-cloud-company",
        password,
        confirmPassword: password,
        role: "company",
        localCompanyDetails: {
          companyName: "New Cloud Company",
          officialEmail: "new-company@example.test",
          registrationNumber: "CLOUD-NEW-1234",
          country: "IN",
          website: "https://new-company.example.test",
          industry: "Software",
          companyType: "Private company",
          address: "10 Fixture Street, Test City",
          phone: "1234567890",
          location: "Test City",
        },
      });
    expect(registration.status).toBe(403);
    expect(await CompanyModel.countDocuments()).toBe(3);
    expect(
      await UserModel.exists({ email: "new-company@example.test" }),
    ).toBeNull();
    for (const role of ["hr", "candidate"] as const) {
      const email = `unverified-${role}@example.test`;
      await UserModel.create({
        name: `Unverified ${role}`,
        email,
        role,
        ...(role === "hr" ? { companyId } : {}),
        passwordHash: await bcrypt.hash(password, 4),
      });
      const login = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ identifier: email, password, role });
      expect(login.status).toBe(403);
      expect(login.body.error.message).toContain(
        "Verify your email before signing in",
      );
      expect(login.headers["set-cookie"]).toBeUndefined();
    }
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it("shows selected companies' published jobs to candidates and hides other local companies", async () => {
    for (const id of [companyId, secondCompanyId, outsideId])
      await JobModel.create({
        companyId: id,
        companyName: "Unverified Test Fixture",
        title: `Job ${id}`,
        description: "Evaluate TypeScript engineering.",
        skills: ["TypeScript"],
        status: "published",
      });
    const candidate = await cookieFor("candidate");
    const response = await request(app)
      .get("/api/jobs")
      .set("Cookie", candidate.cookie);
    expect(response.status).toBe(200);
    expect(response.body.map((job: any) => job.companyId).sort()).toEqual(
      [companyId, secondCompanyId].sort(),
    );
    const hr = await cookieFor("hr", companyId);
    const forbidden = await request(app)
      .post("/api/jobs")
      .set("Origin", origin)
      .set("Cookie", hr.cookie)
      .send({});
    expect(forbidden.status).toBe(403);
  });

  it("revokes selected company sessions, publishing and candidate job visibility at expiry", async () => {
    await JobModel.create({
      companyId,
      companyName: "Unverified Test Fixture",
      title: "Cloud Test Job",
      description: "Evaluate TypeScript engineering.",
      skills: ["TypeScript"],
      status: "published",
    });
    const owner = await cookieFor("company", companyId);
    const candidate = await cookieFor("candidate");
    now = expiry;
    expect(await userForToken(owner.token)).toBeNull();
    await expect(assertPublishable(companyId)).rejects.toMatchObject({
      status: 403,
    });
    const blocked = await request(app)
      .get("/api/jobs")
      .set("Cookie", candidate.cookie);
    expect(blocked.status).toBe(410);
    expect(blocked.body.error.code).toBe("CLOUD_TEST_EXPIRED");
    expect((await CompanyModel.findById(companyId))!.verification?.status).toBe(
      "unverified",
    );
  });

  it("rejects expired Engine.IO requests and disconnects an authenticated candidate before another socket event", async () => {
    const candidate = await cookieFor("candidate");
    const server = createServer(app);
    const io = attachRealtime(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test listener");
    const socket = connectSocket(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      extraHeaders: { Cookie: candidate.cookie, Origin: origin },
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      now = expiry;
      const disconnected = new Promise<void>((resolve) =>
        socket.once("disconnect", () => resolve()),
      );
      socket.emit("unused:test-event", {});
      await disconnected;
      expect(socket.connected).toBe(false);
      const polling = await request(server)
        .get("/socket.io/?EIO=4&transport=polling")
        .set("Origin", origin)
        .set("Cookie", candidate.cookie);
      expect([403, 410]).toContain(polling.status);
      expect(polling.text).not.toContain('"sid"');
    } finally {
      socket.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
