import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "../server/config";
import {
  CompanyModel,
  connectDatabase,
  SessionModel,
  UserModel,
} from "../server/models";
import {
  ApiError,
  authenticate,
  hashToken,
  hrCompanyIds,
  publicUser,
  resolveUserCompanyContext,
  userForToken,
} from "../server/security";
import { registerHrCompanyRoutes } from "../server/hr-companies";

let db: MongoMemoryServer;
let a: string, b: string, disabled: string, foreign: string;
const originalConfig = { ...config };
const app = express();
app.use(express.json(), cookieParser());
app.use("/api", authenticate);
app.get("/api/context", (req, res) => res.json(req.user));
app.post("/api/context", (req, res) => res.json(req.user));
registerHrCompanyRoutes(app);
app.use((error: any, _req: any, res: any, _next: any) => {
  res
    .status(error instanceof ApiError ? error.status : 500)
    .json({ error: { message: error.message, code: error.code } });
});

async function actor(
  role: "hr" | "candidate" | "company",
  fields: Record<string, unknown> = {},
) {
  const user = await UserModel.create({
    role,
    name: "Context fixture",
    email: `${randomUUID()}@example.test`,
    passwordHash: "not-a-real-password",
    ...fields,
  });
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  return { user, token, cookie: `hirelens_session=${token}` };
}

beforeAll(async () => {
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: { launchTimeout: 60000 },
  });
  await connectDatabase(db.getUri("hr_company_security"));
  Object.assign(config, { localCompanyRegistration: false, production: false });
  const companies = await CompanyModel.insertMany([
    {
      ownerId: new mongoose.Types.ObjectId().toString(),
      name: "Alpha",
      identifier: "CTX-A",
    },
    {
      ownerId: new mongoose.Types.ObjectId().toString(),
      name: "Beta",
      identifier: "CTX-B",
    },
    {
      ownerId: new mongoose.Types.ObjectId().toString(),
      name: "Disabled local",
      identifier: "CTX-LOCAL",
      localDevelopment: true,
    },
    {
      ownerId: new mongoose.Types.ObjectId().toString(),
      name: "Outside",
      identifier: "CTX-FOREIGN",
    },
  ]);
  [a, b, disabled, foreign] = companies.map((company) => company.id);
});
afterAll(async () => {
  Object.assign(config, originalConfig);
  await mongoose.disconnect();
  await db?.stop();
});

describe("HR company context security", () => {
  it("normalizes legacy memberships without retaining invalid IDs or exposing password hashes", async () => {
    expect(
      hrCompanyIds({
        companyId: a.toUpperCase(),
        companyIds: [a, b, "invalid", b.toUpperCase()],
      }),
    ).toEqual([a, b]);
    const fixture = await actor("hr", { companyId: a });
    const user = await userForToken(fixture.token);
    expect(user?.companyIds).toEqual([a]);
    expect(user?.companyId).toBe(a);
    expect(publicUser(fixture.user)).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("keeps explicit tab contexts independent and never overwrites the HR's legacy default", async () => {
    const fixture = await actor("hr", { companyId: a, companyIds: [a, b] });
    expect((await userForToken(fixture.token, b))?.companyId).toBe(b);
    expect((await userForToken(fixture.token))?.companyId).toBe(a);
    expect((await userForToken(fixture.token, a))?.companyId).toBe(a);
    expect((await UserModel.findById(fixture.user.id))?.companyId).toBe(a);
    expect((await userForToken(fixture.token, b))?.companyIds).toEqual([a, b]);
  });

  it("falls back from a disabled legacy company to a valid joined company while denying explicit disabled access", async () => {
    const fixture = await actor("hr", { companyId: disabled, companyIds: [b] });
    expect(
      (await resolveUserCompanyContext(publicUser(fixture.user)))?.companyId,
    ).toBe(b);
    expect((await userForToken(fixture.token))?.companyId).toBe(b);
    await expect(userForToken(fixture.token, disabled)).rejects.toMatchObject({
      status: 403,
      code: "HR_COMPANY_ACCESS_DENIED",
    });
    const onlyDisabled = await actor("hr", { companyId: disabled });
    expect(await userForToken(onlyDisabled.token)).toBeNull();
  });

  it("fails closed for malformed or stale/foreign selections, including membership removal", async () => {
    const fixture = await actor("hr", { companyId: a, companyIds: [a, b] });
    await expect(
      userForToken(fixture.token, "not-an-id"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(userForToken(fixture.token, "")).rejects.toMatchObject({
      status: 400,
    });
    await expect(userForToken(fixture.token, foreign)).rejects.toMatchObject({
      status: 403,
      code: "HR_COMPANY_ACCESS_DENIED",
    });
    await UserModel.updateOne(
      { _id: fixture.user.id },
      { $pull: { companyIds: b } },
    );
    await expect(userForToken(fixture.token, b)).rejects.toMatchObject({
      status: 403,
      code: "HR_COMPANY_ACCESS_DENIED",
    });
    expect((await userForToken(fixture.token))?.companyId).toBe(a);
  });

  it("does not let company or candidate users adopt an HR context", async () => {
    const company = await actor("company", { companyId: a, companyIds: [b] });
    const candidate = await actor("candidate", { companyIds: [b] });
    expect((await userForToken(company.token, b))?.companyId).toBe(a);
    expect((await userForToken(candidate.token, b))?.companyId).toBeUndefined();
    expect((await userForToken(company.token, "malformed"))?.companyId).toBe(a);
  });

  it("validates direct GET asset contexts, gives headers precedence, and ignores query selection on mutations", async () => {
    const fixture = await actor("hr", { companyId: a, companyIds: [a, b] });
    const get = (query: string) =>
      request(app)
        .get(`/api/context?hrCompanyId=${query}`)
        .set("Cookie", fixture.cookie);
    const directAssetContext = await get(b);
    expect(directAssetContext.body.companyId).toBe(b);
    expect(directAssetContext.headers["cache-control"]).toBe(
      "private, no-store",
    );
    expect(directAssetContext.headers.vary).toContain("Cookie");
    expect(directAssetContext.headers.vary).toContain("X-HireLens-Company");
    expect((await get(b).set("X-HireLens-Company", a)).body.companyId).toBe(a);
    expect((await get(foreign)).status).toBe(403);
    expect((await get("malformed")).status).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/context?hrCompanyId=${b}`)
          .set("Cookie", fixture.cookie)
          .send({})
      ).body.companyId,
    ).toBe(a);
  });

  it("can recover the switcher from a stale selection but still validates the requested new company", async () => {
    const fixture = await actor("hr", { companyId: a, companyIds: [a, b] });
    const list = await request(app)
      .get("/api/hr/companies")
      .set("Cookie", fixture.cookie)
      .set("X-HireLens-Company", foreign);
    expect(list.status).toBe(200);
    expect(list.body.map((company: any) => company._id)).toEqual([a, b]);
    expect(list.body.every((company: any) => !company.companyIds)).toBe(true);
    const switched = await request(app)
      .patch("/api/hr/companies/active")
      .set("Cookie", fixture.cookie)
      .set("X-HireLens-Company", foreign)
      .send({ companyId: b });
    expect(switched.status).toBe(200);
    expect(switched.body.user.companyId).toBe(b);
    const denied = await request(app)
      .patch("/api/hr/companies/active")
      .set("Cookie", fixture.cookie)
      .send({ companyId: foreign });
    expect(denied.status).toBe(403);
  });
});
