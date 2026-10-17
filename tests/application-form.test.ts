import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import PDFDocument from "pdfkit";
import { createApp } from "../server/app";
import { hashToken } from "../server/security";
import {
  ApplicationModel,
  JobModel,
  ResumeModel,
  SessionModel,
  UserModel,
  connectDatabase,
} from "../server/models";
import { resumeMaxBytes } from "../shared/application";

const app = createApp();
const id = () => new mongoose.Types.ObjectId().toString();
let db: MongoMemoryServer;
let pdf: Buffer;
beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("reviewed_application_tests"));
  pdf = await new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument(),
      chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.text(
      "Reviewed resume: Java, Spring Boot, SQL. Built a REST API during a Computer Science degree.",
    );
    doc.end();
  });
});
beforeEach(async () => {
  await Promise.all([
    ApplicationModel.deleteMany({}),
    JobModel.deleteMany({}),
    ResumeModel.deleteMany({}),
    SessionModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

async function actor(role: "candidate" | "hr" | "company" = "candidate") {
  const user = await UserModel.create({
    name: "Saved profile name",
    email: `${id()}@example.test`,
    role,
    passwordHash: "test only",
    profile: {
      skills: ["Old skill"],
      education: "Old education",
      location: "Old location",
    },
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
async function fixture() {
  const candidate = await actor();
  const job = await JobModel.create({
    companyId: id(),
    companyName: "Reviewed application company",
    title: "Junior Java Developer",
    description: "Build backend APIs with Java and Spring Boot",
    skills: ["Java"],
    status: "published",
    shortlistThreshold: 80,
  });
  const resume = await ResumeModel.create({
    ownerId: candidate.user.id,
    name: "profile.pdf",
    data: pdf,
    text: "Old profile resume about another technology.",
  });
  await UserModel.updateOne(
    { _id: candidate.user.id },
    { $set: { "profile.resumeId": resume.id } },
  );
  const body = {
    name: "Reviewed Candidate Name",
    email: "contact@example.test",
    phone: "+91 98765 43210",
    city: "Hubballi",
    state: "Karnataka",
    education: "B.Tech Computer Science",
    experienceYears: 0,
    skills: ["Java", "Spring Boot"],
    projects: "Built a Java API",
    additionalInformation: "Available after graduation",
    resumeId: resume.id,
    resumeConfirmed: true,
    detailsConfirmed: true,
  };
  return { ...candidate, job, resume, body };
}

it("requires reviewed details and explicit resume confirmation instead of silently using the profile", async () => {
  const { client, job, body } = await fixture();
  for (const input of [
    {},
    { ...body, resumeConfirmed: false },
    { ...body, detailsConfirmed: false },
    { ...body, email: "invalid" },
    { ...body, phone: "call me" },
    { ...body, state: "" },
  ]) {
    expect(
      (await client.post(`/api/jobs/${job.id}/apply`).send(input)).status,
    ).toBe(400);
  }
  expect(await ApplicationModel.countDocuments()).toBe(0);
});

it("uses the expressly uploaded job resume and reviewed snapshot without changing the profile or account identity", async () => {
  const { client, user, job, body, resume } = await fixture();
  const upload = await client
    .post(`/api/jobs/${job.id}/application-resume`)
    .attach("resume", pdf, "selected.pdf");
  expect(upload.status).toBe(201);
  const result = await client
    .post(`/api/jobs/${job.id}/apply`)
    .send({ ...body, resumeId: upload.body.resumeId });
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({
    candidateName: body.name,
    contactEmail: body.email,
    resumeId: upload.body.resumeId,
    resumeName: "selected.pdf",
    screening: { state: "queued", threshold: 80 },
    snapshot: {
      education: body.education,
      skills: body.skills,
      additionalInformation: body.additionalInformation,
    },
  });
  expect(result.body.screeningJob).toBeUndefined();
  const unchanged = await UserModel.findById(user.id);
  expect(unchanged!.email).toBe(user.email);
  expect(unchanged!.name).toBe(user.name);
  expect(unchanged!.profile!.resumeId).toBe(resume.id);
  expect(unchanged!.profile!.skills).toEqual(["Old skill"]);
  await UserModel.updateOne(
    { _id: user.id },
    { $set: { "profile.skills": ["Later skill"] } },
  );
  const saved = await ApplicationModel.findById(result.body._id);
  expect(saved!.snapshot.skills).toEqual(body.skills);
  expect(
    (await client.post(`/api/jobs/${job.id}/apply`).send(body)).status,
  ).toBe(409);
});

it("permits an explicitly confirmed saved PDF and serializes duplicate submissions", async () => {
  const { client, job, body, resume } = await fixture();
  const results = await Promise.all([
    client.post(`/api/jobs/${job.id}/apply`).send(body),
    client.post(`/api/jobs/${job.id}/apply`).send(body),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await ApplicationModel.countDocuments()).toBe(1);
  expect((await ApplicationModel.findOne())!.resumeId).toBe(resume.id);
});

it("rejects other candidates' resumes and uploads belonging to another job", async () => {
  const { client, job, body, resume } = await fixture();
  const other = await actor();
  expect(
    (await other.client.post(`/api/jobs/${job.id}/apply`).send(body)).status,
  ).toBe(400);
  expect((await other.client.get(`/api/resumes/${resume.id}`)).status).toBe(
    404,
  );
  await ResumeModel.updateOne(
    { _id: resume.id },
    { $set: { applicationJobId: id() } },
  );
  expect(
    (await client.post(`/api/jobs/${job.id}/apply`).send(body)).status,
  ).toBe(400);
  expect(await ApplicationModel.countDocuments()).toBe(0);
});

it("enforces PDF extension, MIME, signature, size, and candidate permissions on scoped uploads", async () => {
  const { client, job } = await fixture();
  const hr = await actor("hr");
  expect(
    (
      await hr.client
        .post(`/api/jobs/${job.id}/application-resume`)
        .attach("resume", pdf, "valid.pdf")
    ).status,
  ).toBe(403);
  expect(
    (
      await client
        .post(`/api/jobs/${job.id}/application-resume`)
        .attach("resume", pdf, "wrong.txt")
    ).status,
  ).toBe(400);
  expect(
    (
      await client
        .post(`/api/jobs/${job.id}/application-resume`)
        .attach("resume", Buffer.from("not a PDF"), "fake.pdf")
    ).status,
  ).toBe(400);
  const oversized = await client
    .post(`/api/jobs/${job.id}/application-resume`)
    .attach("resume", Buffer.alloc(resumeMaxBytes + 1), "large.pdf");
  expect(oversized.status).toBe(400);
  expect(oversized.body.error.message).toMatch(/large|size|limit/i);
});

it("blocks applications and uploads after closing or the deadline", async () => {
  const { client, job, body } = await fixture();
  await JobModel.updateOne(
    { _id: job.id },
    { $set: { deadline: new Date(Date.now() - 1000) } },
  );
  expect(
    (await client.post(`/api/jobs/${job.id}/apply`).send(body)).status,
  ).toBe(409);
  expect(
    (
      await client
        .post(`/api/jobs/${job.id}/application-resume`)
        .attach("resume", pdf, "valid.pdf")
    ).status,
  ).toBe(409);
  await JobModel.updateOne({ _id: job.id }, { $set: { status: "closed" } });
  expect(
    (await client.post(`/api/jobs/${job.id}/apply`).send(body)).status,
  ).toBe(404);
});
