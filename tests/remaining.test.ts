import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import PDFDocument from "pdfkit";
import { createCanvas } from "@napi-rs/canvas";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { hashToken } from "../server/security";
import { deliverNotifications } from "../server/delivery";
import { extractResumeDetailed } from "../server/resume";
import {
  connectDatabase,
  UserModel,
  SessionModel,
  AccountActionModel,
  OtpChallengeModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  ReportModel,
  NotificationModel,
  MonitoringModel,
  SubmissionModel,
  AuditModel,
} from "../server/models";
const original = { ...config };
const app = createApp();
const id = () => new mongoose.Types.ObjectId().toString();
const companyId = id(),
  otherCompany = id();
let db: MongoMemoryServer;
let candidate: any,
  hr: any,
  owner: any,
  stranger: any,
  candidateUser: any,
  hrUser: any,
  ownerUser: any,
  job: any,
  application: any;
const password = "StartingPassword!2026";
async function actor(
  role: "candidate" | "hr" | "company",
  email: string,
  company?: string,
) {
  const user = await UserModel.create({
    name: role,
    role,
    email,
    companyId: company,
    passwordHash: await bcrypt.hash(password, 4),
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
function deliveryFixture() {
  const messages: any[] = [];
  config.messagePreview = false;
  config.smtpHost = "";
  config.emailUrl = "https://email.example.test/send";
  config.emailKey = "test";
  config.emailFrom = "local@example.test";
  config.smsUrl = "https://sms.example.test/send";
  config.smsKey = "test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    messages.push(JSON.parse(String(options?.body)));
    return new Response(
      JSON.stringify({ accepted: true, messageId: "fixture" }),
    );
  });
  return messages;
}
const readToken = (message: any) =>
  message.text.match(/#token=([a-f0-9]{64})/)[1];
beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("remaining_tests"));
  ({ user: candidateUser, client: candidate } = await actor(
    "candidate",
    "candidate@local.test",
  ));
  ({ user: hrUser, client: hr } = await actor(
    "hr",
    "hr@local.test",
    companyId,
  ));
  ({ user: ownerUser, client: owner } = await actor(
    "company",
    "owner@local.test",
    companyId,
  ));
  ({ client: stranger } = await actor(
    "company",
    "stranger@local.test",
    otherCompany,
  ));
  job = await JobModel.create({
    companyId,
    title: "Engineer",
    status: "published",
    rounds: ["Technical", "Projects"],
    hrRequests: [{ hrId: hrUser.id, status: "accepted" }],
  });
  application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId: candidateUser.id,
    assignedHrId: hrUser.id,
    resumeId: id(),
    snapshot: {},
    status: "Shortlisted",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, original);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

it("uses single-use email verification and blocks notification opt-in until verified", async () => {
  const messages = deliveryFixture();
  expect(
    (
      await candidate
        .patch("/api/account/notifications")
        .send({ email: true, sms: false })
    ).status,
  ).toBe(409);
  expect(
    (await candidate.post("/api/account/verify-email").send({})).status,
  ).toBe(200);
  const token = readToken(messages[0]);
  expect(
    (await AccountActionModel.findOne({ userId: candidateUser.id }))!.tokenHash,
  ).not.toBe(token);
  expect(
    (await request(app).post("/api/auth/verify-contact").send({ token }))
      .status,
  ).toBe(200);
  expect(
    (await request(app).post("/api/auth/verify-contact").send({ token }))
      .status,
  ).toBe(400);
  expect(
    (
      await candidate
        .patch("/api/account/notifications")
        .send({ email: true, sms: false })
    ).status,
  ).toBe(200);
});

it("verifies SMS ownership independently of the profile phone and supports opt-out", async () => {
  const messages = deliveryFixture();
  expect(
    (
      await candidate
        .patch("/api/account/notifications")
        .send({ email: true, sms: true })
    ).status,
  ).toBe(409);
  expect(
    (
      await candidate
        .post("/api/account/verify-phone")
        .send({ phone: "+919876543210" })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .post("/api/auth/verify-contact")
        .send({ token: readToken(messages[0]) })
    ).status,
  ).toBe(200);
  expect(
    (
      await candidate
        .patch("/api/account/notifications")
        .send({ email: true, sms: true })
    ).status,
  ).toBe(200);
  expect(
    (
      await candidate
        .patch("/api/account/notifications")
        .send({ email: true, sms: false })
    ).status,
  ).toBe(200);
});

it("claims notification deliveries once across concurrent workers and retries provider failures", async () => {
  const messages = deliveryFixture();
  const event = await NotificationModel.create({
    userId: candidateUser.id,
    message: "An interview was scheduled",
    href: "/interviews",
  });
  await Promise.all([deliverNotifications(), deliverNotifications()]);
  expect(messages).toHaveLength(1);
  expect((await NotificationModel.findById(event.id))!.emailState).toBe(
    "accepted",
  );
  const retry = await NotificationModel.create({
    userId: candidateUser.id,
    message: "Another update",
  });
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  await deliverNotifications();
  expect((await NotificationModel.findById(retry.id))!.emailState).toBe(
    "retry",
  );
  await NotificationModel.updateOne(
    { _id: retry.id },
    { emailLease: new Date(0) },
  );
  await deliverNotifications();
  expect((await NotificationModel.findById(retry.id))!.emailState).toBe(
    "accepted",
  );
});

const question = {
  title: "Sum two values",
  description: "Read two integers and print their sum as a single integer.",
  difficulty: "Beginner",
  constraints: "Values from 0 to 100",
  examples: [{ input: "1 2", output: "3" }],
  starter: {
    python: "print(sum(map(int, input().split())))",
    javascript: "",
    java: "",
  },
  tests: [
    { input: "1 2", output: "3", hidden: false },
    { input: "41 52", output: "93", hidden: true },
  ],
};
const schedule = () => ({
  applicationId: application.id,
  interviewerId: hrUser.id,
  problemId: "sum-pairs",
  scheduledAt: new Date(Date.now() + 60000).toISOString(),
  timezone: "Asia/Kolkata",
  duration: 30,
  type: "technical",
  topics: ["Programming"],
  difficulty: "Beginner",
});
let first: any, firstReport: any;
it("authors company-scoped problems, snapshots them, and never exposes hidden test data", async () => {
  expect(
    (await candidate.post("/api/problem-library").send(question)).status,
  ).toBe(403);
  const created = await hr.post("/api/problem-library").send(question);
  expect(created.status).toBe(201);
  expect(
    (
      await stranger
        .put(`/api/problem-library/${created.body._id}`)
        .send(question)
    ).status,
  ).toBe(404);
  expect(
    (await candidate.get("/api/problems")).body.some(
      (p: any) => p.id === created.body._id,
    ),
  ).toBe(false);
  const scheduled = await hr
    .post("/api/interviews")
    .send({ ...schedule(), problemId: created.body._id });
  expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(201);
  first = scheduled.body;
  expect(first.problemSnapshot).toBeUndefined();
  expect(first.roundIndex).toBe(0);
  expect(first.roundCount).toBe(2);
  await hr.put(`/api/problem-library/${created.body._id}`).send({
    ...question,
    title: "Changed title",
    tests: [{ input: "1 2", output: "999", hidden: false }, question.tests[1]],
  });
  const publicProblem = await candidate.get(
    `/api/interviews/${first._id}/problem`,
  );
  expect(publicProblem.body.title).toBe(question.title);
  expect(publicProblem.body.tests).toBeUndefined();
  expect(
    (await stranger.get(`/api/interviews/${first._id}/problem`)).status,
  ).toBe(404);
  const privateCopy = await InterviewModel.findById(first._id).select(
    "+problemSnapshot",
  );
  expect(privateCopy!.problemSnapshot.tests[0].output).toBe("3");
  expect((await hr.post("/api/interviews").send(schedule())).status).toBe(409);
  await InterviewModel.updateOne(
    { _id: first._id },
    { status: "live", consentAt: new Date(), admittedAt: new Date() },
  );
  config.judgeUrl = "https://judge.example.test";
  const inputs: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).endsWith("/languages"))
      return new Response(JSON.stringify([{ id: 71, name: "Python (3.8.1)" }]));
    if (options?.method === "POST") {
      const submitted = JSON.parse(String(options.body));
      inputs.push(Buffer.from(submitted.expected_output, "base64").toString());
      return new Response(JSON.stringify({ token: "fixture" }));
    }
    return new Response(
      JSON.stringify({
        status: { id: 3, description: "Accepted" },
        stdout: Buffer.from("private input echoed").toString("base64"),
      }),
    );
  });
  const submission = await candidate
    .post(`/api/interviews/${first._id}/code`)
    .send({ language: "python", code: "print(3)", mode: "submit" });
  expect(submission.status, JSON.stringify(submission.body)).toBe(201);
  expect(inputs).toEqual(["3", "93"]);
  expect(submission.body.results[1].stdout).toBeUndefined();
});

it("saves separate C/C++ drafts and executes both through the authenticated interview API", async () => {
  config.judgeUrl = "https://judge.example.test";
  const languages = [
    { id: 50, name: "C (GCC 9.2.0)" },
    { id: 54, name: "C++ (GCC 9.2.0)" },
  ];
  const compilerIds: number[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).endsWith("/languages"))
      return new Response(JSON.stringify(languages));
    if (options?.method === "POST") {
      compilerIds.push(JSON.parse(String(options.body)).language_id);
      return new Response(JSON.stringify({ token: "c-family-token" }));
    }
    return new Response(
      JSON.stringify({
        status: { id: 3, description: "Accepted" },
        stdout: Buffer.from("3").toString("base64"),
      }),
    );
  });
  for (const language of ["c", "cpp"]) {
    const code = `int main(void) { /* ${language} draft */ return 0; }`;
    expect(
      (
        await candidate
          .patch(`/api/interviews/${first._id}/draft`)
          .send({ language, code })
      ).status,
    ).toBe(200);
    const run = await candidate
      .post(`/api/interviews/${first._id}/code`)
      .send({ language, code, stdin: "1 2", mode: "run" });
    expect(run.status, JSON.stringify(run.body)).toBe(201);
    expect(run.body).toMatchObject({ language, passed: 1, total: 1 });
  }
  expect(compilerIds).toEqual([50, 54]);
  const saved = await InterviewModel.findById(first._id);
  expect(saved!.drafts.get("c")).toContain("c draft");
  expect(saved!.drafts.get("cpp")).toContain("cpp draft");
  expect(saved!.activeLanguage).toBe("cpp");
  expect(
    (
      await candidate
        .patch(`/api/interviews/${first._id}/draft`)
        .send({ language: "shell", code: "echo no" })
    ).status,
  ).toBe(400);
});

it("advances only after a finalized successful round and keeps previous reports from overwriting the final outcome", async () => {
  await InterviewModel.updateOne(
    { _id: first._id },
    { status: "completed", endedAt: new Date() },
  );
  await ApplicationModel.updateOne(
    { _id: application.id },
    { status: "Interview Completed" },
  );
  firstReport = await ReportModel.create({
    interviewId: first._id,
    companyId,
    candidateId: candidateUser.id,
  });
  expect((await hr.post("/api/interviews").send(schedule())).status).toBe(409);
  const feedback = {
    summary: "Good technical evidence",
    explanation: "Candidate explained both the approach and tradeoffs.",
    decision: "selected",
    finalized: true,
    released: true,
  };
  expect(
    (await hr.patch(`/api/reports/${firstReport.id}`).send(feedback)).status,
  ).toBe(200);
  expect((await ApplicationModel.findById(application.id))!.status).toBe(
    "Interview Completed",
  );
  expect((await owner.get(`/api/jobs/${job.id}`)).body.recruitmentStatus).toBe(
    "Interview in Progress",
  );
  const second = await hr.post("/api/interviews").send(schedule());
  expect(second.status).toBe(201);
  expect(second.body.roundIndex).toBe(1);
  expect(
    (
      await hr
        .patch(`/api/reports/${firstReport.id}`)
        .send({ ...feedback, decision: "rejected" })
    ).status,
  ).toBe(409);
  await InterviewModel.updateOne(
    { _id: second.body._id },
    { status: "completed", endedAt: new Date() },
  );
  const lastReport = await ReportModel.create({
    interviewId: second.body._id,
    companyId,
    candidateId: candidateUser.id,
  });
  expect(
    (await hr.patch(`/api/reports/${lastReport.id}`).send(feedback)).status,
  ).toBe(200);
  expect((await ApplicationModel.findById(application.id))!.status).toBe(
    "Selected",
  );
  expect((await hr.post("/api/interviews").send(schedule())).status).toBe(409);
  expect((await owner.get(`/api/jobs/${job.id}`)).body.recruitmentStatus).toBe(
    "Completed",
  );
  const rounds = await candidate.get(
    `/api/applications/${application.id}/rounds`,
  );
  expect(rounds.body.interviews).toHaveLength(2);
  expect((await owner.post("/api/interviews").send(schedule())).status).toBe(
    403,
  );
});

it("previews retention without deleting, requires a scoped single-use confirmation, and preserves hiring evidence", async () => {
  await InterviewModel.updateOne(
    { _id: first._id },
    {
      endedAt: new Date(Date.now() - 200 * 86400000),
      notes: "Private note",
      drafts: { python: "old draft" },
    },
  );
  await MonitoringModel.create({
    interviewId: first._id,
    candidateId: candidateUser.id,
    kind: "no-face",
  });
  await SubmissionModel.create({
    interviewId: first._id,
    candidateId: candidateUser.id,
    code: "old code",
  });
  const preview = await owner
    .post("/api/company/retention/preview")
    .send({ days: 180, auditDays: 730 });
  expect(preview.status).toBe(200);
  expect(preview.body.interviews).toBe(1);
  expect(await MonitoringModel.countDocuments({ interviewId: first._id })).toBe(
    1,
  );
  const command = {
    previewToken: preview.body.previewToken,
    confirmation: "DELETE PRIVATE INTERVIEW DATA",
  };
  expect(
    (await stranger.post("/api/company/retention/apply").send(command)).status,
  ).toBe(400);
  expect(
    (await hr.post("/api/company/retention/apply").send(command)).status,
  ).toBe(403);
  expect(
    (await owner.post("/api/company/retention/apply").send(command)).status,
  ).toBe(200);
  expect(
    (await owner.post("/api/company/retention/apply").send(command)).status,
  ).toBe(400);
  expect(await MonitoringModel.countDocuments({ interviewId: first._id })).toBe(
    0,
  );
  expect((await InterviewModel.findById(first._id))!.notes).toBe("");
  expect(await ReportModel.exists({ _id: firstReport.id })).toBeTruthy();
  expect(
    (await stranger.get("/api/company/audit")).body.every(
      (e: any) => e.companyId === otherCompany,
    ),
  ).toBe(true);
  expect(
    (await owner.get("/api/company/audit")).body.some((e: any) =>
      e.action.includes("retention"),
    ),
  ).toBe(true);
});

it("resets passwords without revealing unknown emails, rejects replay, and revokes old sessions", async () => {
  const messages = deliveryFixture();
  const known = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: candidateUser.email });
  const unknown = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "missing@local.test" });
  expect(known.body).toEqual(unknown.body);
  expect(messages).toHaveLength(1);
  const token = readToken(messages[0]);
  await OtpChallengeModel.create({
    userId: candidateUser.id,
    tokenHash: hashToken("pending"),
    windowEndsAt: new Date(Date.now() + 60000),
  });
  const body = {
    token,
    password: "ChangedPassword!2026",
    confirmPassword: "ChangedPassword!2026",
  };
  expect(
    (await request(app).post("/api/auth/reset-password").send(body)).status,
  ).toBe(200);
  expect(
    (await request(app).post("/api/auth/reset-password").send(body)).status,
  ).toBe(400);
  expect(
    await OtpChallengeModel.exists({ userId: candidateUser.id }),
  ).toBeNull();
  expect((await candidate.get("/api/auth/me")).status).toBe(401);
  expect(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email: candidateUser.email, password })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email: candidateUser.email, password: body.password })
    ).status,
  ).toBe(200);
});

it("enforces email verification when enabled, including new HR registrations", async () => {
  const messages = deliveryFixture();
  config.emailVerificationRequired = true;
  const credentials = {
    email: "newhr@local.test",
    password,
    role: "hr",
    name: "New HR",
  };
  const registered = await request(app)
    .post("/api/auth/register")
    .send(credentials);
  expect(registered.status).toBe(201);
  expect(registered.body.registered).toBe(true);
  expect(registered.headers["set-cookie"]).toBeUndefined();
  expect(
    (await request(app).post("/api/auth/login").send(credentials)).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/auth/verify-contact")
        .send({ token: readToken(messages[0]) })
    ).status,
  ).toBe(200);
  expect(
    (await request(app).post("/api/auth/login").send(credentials)).status,
  ).toBe(200);
});

it("extracts actual text from an image-only scanned PDF with local OCR", async () => {
  config.ocrEnabled = true;
  const canvas = createCanvas(1200, 600),
    context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 1200, 600);
  context.fillStyle = "black";
  context.font = "36px Arial";
  context.fillText("ADITYA SOFTWARE ENGINEER", 50, 100);
  context.fillText("Skills: Python JavaScript React and SQL", 50, 180);
  context.fillText("Education: Bachelor of Computer Science", 50, 260);
  const pdf = await new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.image(canvas.toBuffer("image/png"), 30, 30, { width: 550 });
    doc.end();
  });
  const result = await extractResumeDetailed(pdf);
  expect(result.method).toBe("local-ocr");
  expect(result.text).toContain("Python");
  expect(result.text).toContain("Computer Science");
}, 60000);
