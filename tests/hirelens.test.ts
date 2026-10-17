import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { hashToken } from "../server/security";
import {
  connectDatabase,
  UserModel,
  CompanyModel,
  SessionModel,
  JobModel,
  ApplicationModel,
  ResumeModel,
  InterviewModel,
  ReportModel,
  SubmissionModel,
  CodeRevisionModel,
  MonitoringModel,
} from "../server/models";
import { analyzeIntegrity } from "../server/integrity";
import { matchResume } from "../server/matching";
import type { ApplicationState } from "../shared/types";
const app = createApp(),
  original = { ...config };
const id = () => new mongoose.Types.ObjectId().toString();
const companyId = id();
let db: MongoMemoryServer,
  owner: any,
  hr: any,
  candidate: any,
  outsider: any,
  otherHr: any;
async function actor(role: "hr" | "company" | "candidate", company?: string) {
  const user = await UserModel.create({
    name: `Test ${role}`,
    role,
    email: `${id()}@example.test`,
    companyId: company,
    passwordHash: "unused-fixture-hash",
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
async function job(accepted = true) {
  return JobModel.create({
    companyId,
    companyName: "Test company",
    title: "Java Engineer",
    description: "Build and explain reliable Java backend applications.",
    skills: ["Java"],
    status: "published",
    difficulty: "Advanced",
    hrRequests: accepted ? [{ hrId: hr.user.id, status: "accepted" }] : [],
  });
}
async function application(
  j: any,
  status: ApplicationState = "Applied",
  user = candidate.user,
) {
  const resume = await ResumeModel.create({
    ownerId: user.id,
    name: "resume.pdf",
    text: "Java computer science",
    data: Buffer.from("%PDF-1.4 fixture"),
  });
  return ApplicationModel.create({
    jobId: j.id,
    companyId,
    candidateId: user.id,
    candidateName: user.name,
    jobTitle: j.title,
    companyName: j.companyName,
    resumeId: resume.id,
    snapshot: user.profile,
    status,
  });
}
beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("hirelens_latest"));
  owner = await actor("company", companyId);
  await CompanyModel.create({
    _id: companyId,
    ownerId: owner.user.id,
    name: "Test company",
    identifier: id(),
  });
  hr = await actor("hr", companyId);
  candidate = await actor("candidate");
  outsider = await actor("company", id());
  otherHr = await actor("hr", companyId);
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, original);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
it("keeps other HR assignments and unassigned applications private while preserving owner and candidate access", async () => {
  const j = await job();
  await JobModel.updateOne(
    { _id: j.id },
    { $push: { hrRequests: { hrId: otherHr.user.id, status: "accepted" } } },
  );
  const secondCandidate = await actor("candidate"),
    waitingCandidate = await actor("candidate");
  const first = await application(j, "Shortlisted");
  const second = await application(j, "Shortlisted", secondCandidate.user);
  const waiting = await application(j, "Applied", waitingCandidate.user);
  await ApplicationModel.updateOne(
    { _id: first.id },
    { $set: { assignedHrId: hr.user.id } },
  );
  await ApplicationModel.updateOne(
    { _id: second.id },
    { $set: { assignedHrId: otherHr.user.id } },
  );
  const list = `/api/applications?jobId=${j.id}`;
  expect((await hr.client.get(list)).body.map((row: any) => row._id)).toEqual([
    first.id,
  ]);
  expect(
    (await otherHr.client.get(list)).body.map((row: any) => row._id),
  ).toEqual([second.id]);
  expect((await owner.client.get(list)).body).toHaveLength(3);
  expect(
    (await candidate.client.get(list)).body.map((row: any) => row._id),
  ).toEqual([first.id]);
  expect(
    (await candidate.client.get(`/api/resumes/${first.resumeId}`)).status,
  ).toBe(200);
  expect(
    (await candidate.client.get(`/api/resumes/${second.resumeId}`)).status,
  ).toBe(404);
  expect((await hr.client.get(`/api/resumes/${first.resumeId}`)).status).toBe(
    200,
  );
  for (const hidden of [second, waiting]) {
    expect(
      (await hr.client.get(`/api/resumes/${hidden.resumeId}`)).status,
    ).toBe(404);
    expect(
      (await hr.client.get(`/api/applications/${hidden.id}/rounds`)).status,
    ).toBe(404);
    expect(
      (await hr.client.post(`/api/applications/${hidden.id}/screening/retry`))
        .status,
    ).toBe(404);
    for (const status of ["Shortlisted", "Rejected"])
      expect(
        (
          await hr.client
            .patch(`/api/applications/${hidden.id}/status`)
            .send({ status })
        ).status,
      ).toBe(404);
    expect(
      (await owner.client.get(`/api/resumes/${hidden.resumeId}`)).status,
    ).toBe(200);
  }
  // Access follows the current assignment on every request, not a cached acceptance.
  await ApplicationModel.updateOne(
    { _id: first.id },
    { $set: { assignedHrId: otherHr.user.id } },
  );
  expect((await hr.client.get(list)).body).toEqual([]);
  expect((await hr.client.get(`/api/resumes/${first.resumeId}`)).status).toBe(
    404,
  );
  expect(
    (await hr.client.get(`/api/applications/${first.id}/rounds`)).status,
  ).toBe(404);
  expect(
    (await otherHr.client.get(`/api/resumes/${first.resumeId}`)).status,
  ).toBe(200);
  expect(
    (await otherHr.client.get(`/api/applications/${first.id}/rounds`)).status,
  ).toBe(200);
});
it("grants applicant/resume access only after both job acceptance and candidate assignment", async () => {
  const j = await job(false);
  expect(
    (
      await owner.client
        .post(`/api/jobs/${j.id}/hr-requests`)
        .send({ hrIds: [hr.user.id] })
    ).status,
  ).toBe(201);
  const a = await application(j);
  expect(
    (await hr.client.get(`/api/jobs/${j.id}`)).body.applications,
  ).toHaveLength(0);
  expect((await hr.client.get(`/api/resumes/${a.resumeId}`)).status).toBe(404);
  expect(
    (
      await hr.client
        .patch(`/api/applications/${a.id}/status`)
        .send({ status: "Shortlisted" })
    ).status,
  ).toBe(404);
  expect(
    (
      await hr.client
        .patch(`/api/hr/assignments/${j.id}`)
        .send({ status: "accepted" })
    ).status,
  ).toBe(200);
  expect(
    (await hr.client.get(`/api/jobs/${j.id}`)).body.applications,
  ).toHaveLength(0);
  expect((await hr.client.get(`/api/applications?jobId=${j.id}`)).body).toEqual(
    [],
  );
  expect((await hr.client.get(`/api/resumes/${a.resumeId}`)).status).toBe(404);
  expect((await hr.client.get(`/api/applications/${a.id}/rounds`)).status).toBe(
    404,
  );
  expect(
    (
      await hr.client
        .patch(`/api/applications/${a.id}/status`)
        .send({ status: "Shortlisted" })
    ).status,
  ).toBe(404);
  expect(
    (await otherHr.client.get(`/api/applications?jobId=${j.id}`)).status,
  ).toBe(404);
  expect((await outsider.client.get(`/api/resumes/${a.resumeId}`)).status).toBe(
    404,
  );
  const shortlisted = await owner.client
    .patch(`/api/applications/${a.id}/status`)
    .send({ status: "Shortlisted" });
  expect(shortlisted.status).toBe(200);
  expect(shortlisted.body.assignedHrId).toBe(hr.user.id);
  expect(
    (await hr.client.get(`/api/applications?jobId=${j.id}`)).body.map(
      (row: any) => row._id,
    ),
  ).toEqual([a.id]);
  expect((await hr.client.get(`/api/resumes/${a.resumeId}`)).status).toBe(200);
  const scheduled = await hr.client.post("/api/interviews").send({
    applicationId: a.id,
    scheduledAt: new Date(Date.now() + 60000).toISOString(),
    timezone: "Asia/Kolkata",
    duration: 30,
    type: "technical",
    topics: ["Java"],
    difficulty: "Advanced",
    problemId: "sum-pairs",
    interviewerId: hr.user.id,
  });
  expect(scheduled.status).toBe(201);
  expect(scheduled.body.candidateId).toBe(candidate.user.id);
  await InterviewModel.updateOne(
    { _id: scheduled.body._id },
    { $set: { status: "completed", endedAt: new Date() } },
  );
  const report = await ReportModel.create({
    interviewId: scheduled.body._id,
    candidateId: candidate.user.id,
    companyId,
  });
  const review = {
    summary: "Evidence reviewed with the assigned interviewer.",
    decision: "selected",
    explanation:
      "Technical examples and code were reviewed by the hiring team.",
    finalized: true,
    released: true,
  };
  expect(
    (await outsider.client.patch(`/api/reports/${report.id}`).send(review))
      .status,
  ).toBe(404);
  expect(
    (await candidate.client.patch(`/api/reports/${report.id}`).send(review))
      .status,
  ).toBe(403);
  expect(
    (await owner.client.patch(`/api/reports/${report.id}`).send(review)).status,
  ).toBe(200);
  expect((await ReportModel.findById(report.id))!.reviewedBy).toBe(
    owner.user.id,
  );
  expect(
    (await candidate.client.get(`/api/reports/${report.id}`)).body.integrity,
  ).toBeNull();
});
it("creates private batch appointments, rejects duplicates and overlaps, and safely retries a request", async () => {
  const j = await job(),
    c2 = await actor("candidate"),
    a = await application(j, "Shortlisted"),
    b = await application(j, "Shortlisted", c2.user);
  await ApplicationModel.updateMany(
    { _id: { $in: [a.id, b.id] } },
    { $set: { assignedHrId: hr.user.id, assignedAt: new Date() } },
  );
  const input = {
    requestId: randomUUID(),
    name: "Java batch",
    applicationIds: [a.id, b.id],
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    timezone: "Asia/Kolkata",
    duration: 30,
    gap: 10,
    problemId: "sum-pairs",
  };
  expect(
    (
      await outsider.client
        .post(`/api/jobs/${j.id}/interview-batches`)
        .send(input)
    ).status,
  ).toBe(403);
  expect(
    (
      await otherHr.client
        .post(`/api/jobs/${j.id}/interview-batches`)
        .send(input)
    ).status,
  ).toBe(404);
  expect(
    (
      await hr.client
        .post(`/api/jobs/${j.id}/interview-batches`)
        .send({ ...input, applicationIds: [a.id, a.id] })
    ).status,
  ).toBe(400);
  const created = await hr.client
    .post(`/api/jobs/${j.id}/interview-batches`)
    .send(input);
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("ready");
  const retry = await hr.client
    .post(`/api/jobs/${j.id}/interview-batches`)
    .send(input);
  expect(retry.body._id).toBe(created.body._id);
  const sessions = await InterviewModel.find({
    batchId: created.body._id,
  }).sort({ scheduledAt: 1 });
  expect(sessions).toHaveLength(2);
  expect(+sessions[1].scheduledAt - +sessions[0].scheduledAt).toBe(40 * 60000);
  expect(sessions[0].candidateId).not.toBe(sessions[1].candidateId);
  expect(
    (await candidate.client.get(`/api/interviews/${sessions[1].id}`)).status,
  ).toBe(404);
  const j2 = await job(),
    a2 = await application(j2, "Shortlisted");
  await ApplicationModel.updateOne(
    { _id: a2.id },
    { $set: { assignedHrId: hr.user.id, assignedAt: new Date() } },
  );
  expect(
    (
      await hr.client
        .post(`/api/jobs/${j2.id}/interview-batches`)
        .send({ ...input, requestId: randomUUID(), applicationIds: [a2.id] })
    ).status,
  ).toBe(409);
  expect(await InterviewModel.countDocuments({ applicationId: a2.id })).toBe(0);
  expect((await ApplicationModel.findById(a2.id))!.status).toBe("Shortlisted");
});
function aiFixture(output: (body: any) => unknown) {
  Object.assign(config, {
    llmUrl: "https://fixture.invalid",
    llmKey: "fixture",
    llmModel: "fixture",
  });
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async (_url, init) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(output(JSON.parse(String(init?.body)))),
              },
            },
          ],
        }),
      ),
  );
}
it("conducts adaptive AI practice, preserves answers through provider failure, and releases its turn lock", async () => {
  const created = await candidate.client.post("/api/practice").send({
    jobTitle: "Java practice",
    topics: ["Java"],
    difficulty: "Intermediate",
    duration: 30,
    problemId: "sum-pairs",
    facilitator: "ai",
  });
  expect(created.status).toBe(201);
  const interviewId = created.body._id;
  expect(created.body.questions).toHaveLength(0);
  await candidate.client.post(`/api/interviews/${interviewId}/start`).send({});
  config.llmUrl = "";
  expect(
    (
      await candidate.client
        .post(`/api/interviews/${interviewId}/ai/next`)
        .send({})
    ).status,
  ).toBe(503);
  let turns = 0;
  const contexts: any[] = [];
  const fixture = aiFixture((body) => {
    contexts.push(JSON.parse(body.messages[1].content).untrustedEvidence);
    if (body.messages[0].content.includes("correctness and completeness"))
      return {
        correctness: 4,
        completeness: 3,
        feedback: "Explain the collection choice.",
        evidence: ["HashMap"],
        missingConcepts: [],
        followUp: "Discuss complexity.",
        uncertainty: "Single answer.",
      };
    turns++;
    return {
      plan: ["Collections", "Complexity"],
      question: {
        text:
          turns === 1
            ? "How would you use a Java HashMap?"
            : "Explain HashMap collision complexity.",
        topic: "Java",
        rubric: ["Explain key lookup"],
      },
    };
  });
  const first = await candidate.client
    .post(`/api/interviews/${interviewId}/ai/next`)
    .send({});
  expect(first.status).toBe(200);
  const again = await candidate.client
    .post(`/api/interviews/${interviewId}/ai/next`)
    .send({});
  expect(again.body.question.id).toBe(first.body.question.id);
  expect(turns).toBe(1);
  await candidate.client.post(`/api/interviews/${interviewId}/answers`).send({
    questionId: first.body.question.id,
    text: "A HashMap maps keys to values with hash buckets.",
    mode: "typed",
    transcriptionReviewed: true,
  });
  const next = await candidate.client
    .post(`/api/interviews/${interviewId}/ai/next`)
    .send({});
  expect(next.status).toBe(200);
  expect(next.body.question.text).toContain("collision");
  expect(contexts.at(-1).previousAnswers[0].text).toContain("HashMap");
  await candidate.client.post(`/api/interviews/${interviewId}/answers`).send({
    questionId: next.body.question.id,
    text: "Collisions require comparison within a bucket.",
    mode: "typed",
    transcriptionReviewed: true,
  });
  fixture.mockRestore();
  aiFixture(() => ({ invalid: true }));
  expect(
    (
      await candidate.client
        .post(`/api/interviews/${interviewId}/ai/next`)
        .send({})
    ).status,
  ).toBe(502);
  const saved = await InterviewModel.findById(interviewId);
  expect(saved!.answers).toHaveLength(2);
  expect(saved!.aiBusyToken).toBeUndefined();
});
it("validates AI report references, preserves human control, and hides unreleased history", async () => {
  const j = await job(),
    a = await application(j, "Interview Completed");
  a.assignedHrId = hr.user.id;
  await a.save();
  const i = await InterviewModel.create({
    applicationId: a.id,
    companyId,
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    jobTitle: j.title,
    scheduledAt: new Date(),
    status: "completed",
    questions: [
      { id: "q1", text: "Explain lookup", rubric: ["Complexity"] },
      { id: "q2", text: "Explain tests", rubric: ["Edge cases"] },
    ],
    answers: [
      { questionId: "q1", text: "Use a map for efficient lookup." },
      { questionId: "q2", text: "Test empty inputs and collisions." },
    ],
    consentAt: new Date(),
  });
  const report = await ReportModel.create({
    interviewId: i.id,
    companyId,
    candidateId: candidate.user.id,
  });
  await SubmissionModel.create({
    interviewId: i.id,
    candidateId: candidate.user.id,
    mode: "submit",
    language: "python",
    code: "print(1)",
    passed: 3,
    total: 4,
  });
  const metric = {
    score: 4,
    explanation: "Clear explanation with examples.",
    evidenceRefs: ["answer:q1"],
  };
  const output = {
    summary: "Evidence from two answers and one submission.",
    technical: metric,
    problemSolving: metric,
    communication: metric,
    strengths: ["Clear reasoning"],
    weaknesses: ["One failing test"],
    improvements: ["Review the failing case"],
    recommendation: "Candidate",
    recommendationReason: "Requires human review.",
    limitations: ["Small evidence sample."],
  };
  const fixture = aiFixture(() => output);
  const assessed = await owner.client
    .post(`/api/reports/${report.id}/assessment`)
    .send({});
  expect(assessed.status).toBe(200);
  expect(assessed.body.coding.score).toBe(75);
  expect((await ReportModel.findById(report.id))!.decision).toBe("pending");
  expect((await candidate.client.get(`/api/reports/${report.id}`)).status).toBe(
    404,
  );
  expect(
    (await candidate.client.get("/api/analytics/performance")).body.rows.some(
      (r: any) => r.reportId === report.id,
    ),
  ).toBe(false);
  fixture.mockRestore();
  aiFixture(() => ({
    ...output,
    technical: { ...metric, evidenceRefs: ["answer:invented"] },
  }));
  expect(
    (await owner.client.post(`/api/reports/${report.id}/assessment`).send({}))
      .status,
  ).toBe(502);
  expect(
    (await ReportModel.findById(report.id))!.assessment.technical.evidenceRefs,
  ).toEqual(["answer:q1"]);
  await InterviewModel.updateOne(
    { _id: i.id },
    {
      $set: {
        "answers.0.override":
          "Human correction: important missing constraints.",
      },
    },
  );
  expect(
    (await owner.client.get(`/api/reports/${report.id}`)).body.assessmentStale,
  ).toBe(true);
  expect(
    (
      await owner.client.patch(`/api/reports/${report.id}`).send({
        summary: "Human evidence review.",
        decision: "hold",
        explanation: "More evidence is needed for a decision.",
        finalized: true,
        released: true,
      })
    ).status,
  ).toBe(409);
  expect(
    (await owner.client.delete(`/api/reports/${report.id}/assessment`).send({}))
      .status,
  ).toBe(200);
  expect(
    (
      await owner.client.patch(`/api/reports/${report.id}`).send({
        summary: "Human evidence review.",
        decision: "hold",
        explanation: "More evidence is needed for a decision.",
        finalized: true,
        released: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (await outsider.client.get("/api/analytics/performance")).body.rows,
  ).toHaveLength(0);
});
it("records bounded editor history and prevents cross-candidate access", async () => {
  const i = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: candidate.user.id,
    type: "practice",
    scheduledAt: new Date(),
    status: "live",
  });
  const path = `/api/interviews/${i.id}`;
  expect(
    (
      await candidate.client
        .patch(`${path}/draft`)
        .send({ language: "python", code: "print(1)" })
    ).status,
  ).toBe(200);
  await candidate.client
    .patch(`${path}/draft`)
    .send({ language: "python", code: "print(2)" });
  expect(await CodeRevisionModel.countDocuments({ interviewId: i.id })).toBe(1);
  const history = await candidate.client.get(`${path}/code-history`);
  expect(history.body).toHaveLength(1);
  expect(history.body[0].code).toBeUndefined();
  expect(
    (await outsider.client.get(`${path}/code-history/${history.body[0]._id}`))
      .status,
  ).toBe(404);
  expect(
    (await candidate.client.get(`${path}/code-history/${history.body[0]._id}`))
      .body.code,
  ).toBe("print(1)");
});
it("serializes simultaneous AI turns and retries without creating duplicate questions", async () => {
  const i = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: candidate.user.id,
    type: "practice",
    facilitator: "ai",
    scheduledAt: new Date(),
    status: "live",
  });
  Object.assign(config, {
    llmUrl: "https://fixture.invalid",
    llmKey: "fixture",
    llmModel: "fixture",
  });
  let markStarted!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    markStarted();
    await release;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                plan: ["Collections"],
                question: {
                  text: "Explain a Java collection choice.",
                  topic: "Java",
                  rubric: ["Explain tradeoffs"],
                },
              }),
            },
          },
        ],
      }),
    );
  });
  const first = candidate.client
    .post(`/api/interviews/${i.id}/ai/next`)
    .send({})
    .then((r: any) => r);
  await started;
  const overlapping = await candidate.client
    .post(`/api/interviews/${i.id}/ai/next`)
    .send({});
  finish();
  expect(overlapping.status).toBe(409);
  expect((await first).status).toBe(200);
  expect(
    (await candidate.client.post(`/api/interviews/${i.id}/ai/next`).send({}))
      .status,
  ).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await InterviewModel.findById(i.id))!.questions).toHaveLength(1);
});
it("assesses the final AI answer without creating a thirteenth question", async () => {
  const questions = Array.from({ length: 12 }, (_, n) => ({
    id: `q${n}`,
    text: `Explain technical concept ${n}.`,
    topic: "Java",
    rubric: ["Give a clear example"],
  }));
  const answers = questions.map((q) => ({
    questionId: q.id,
    text: "A concrete example and explanation.",
    mode: "typed",
  }));
  const i = await InterviewModel.create({
    candidateId: candidate.user.id,
    interviewerId: candidate.user.id,
    type: "practice",
    facilitator: "ai",
    scheduledAt: new Date(),
    status: "live",
    questions,
    answers,
  });
  const fetch = aiFixture(() => ({
    correctness: 3,
    completeness: 3,
    feedback: "An adequate example.",
    evidence: ["concrete example"],
    missingConcepts: [],
    followUp: "",
    uncertainty: "Limited evidence.",
  }));
  const result = await candidate.client
    .post(`/api/interviews/${i.id}/ai/next`)
    .send({});
  expect(result.status).toBe(200);
  expect(result.body.complete).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  const saved = await InterviewModel.findById(i.id);
  expect(saved!.questions).toHaveLength(12);
  expect(saved!.answers.at(-1)!.feedback.correctness).toBe(3);
});
it("uses multiple independent signals for integrity review and avoids double-counting focus loss", () => {
  const at = new Date();
  expect(analyzeIntegrity([{ kind: "hidden", occurredAt: at }]).level).toBe(
    "low",
  );
  const events = Array.from({ length: 8 }, (_, n) =>
    ["hidden", "blur", "paste", "multiple-faces"].map((kind) => ({
      kind,
      occurredAt: new Date(+at + n * 10000),
    })),
  ).flat();
  const review = analyzeIntegrity(events);
  expect(review.level).toBe("high");
  expect(review.reasons[0].count).toBe(8);
  expect(review.reasons[0].points).toBe(30);
  expect(analyzeIntegrity([], false).score).toBeNull();
  expect(
    analyzeIntegrity([{ kind: "monitoring-unavailable" }]).coverage
      .monitoringUnavailable,
  ).toBe(true);
});
it("persists preferred roles and structured experience without changing immutable applications", async () => {
  const j = await job(),
    a = await application(j);
  const updated = await candidate.client.patch("/api/profile").send({
    name: "Candidate profile",
    phone: "",
    location: "India",
    headline: "Developer",
    skills: ["Java"],
    education: "Computer Science",
    experience: "Built backend systems",
    projects: "API",
    certifications: "",
    expertise: "",
    preferredRoles: ["Backend developer"],
    experienceYears: 2.5,
  });
  expect(updated.status).toBe(200);
  expect(updated.body.user.profile.preferredRoles).toEqual([
    "Backend developer",
  ]);
  expect(updated.body.user.profile.experienceYears).toBe(2.5);
  expect(
    (await ApplicationModel.findById(a.id))!.snapshot.preferredRoles,
  ).toHaveLength(0);
});
it("reports resume evidence by criterion and leaves unknown experience unscored", () => {
  const profile = {
    skills: ["Java"],
    experience: "Backend projects",
    projects: "API",
    education: "Computer science",
    experienceYears: 2,
  };
  const m = matchResume(["Java"], profile, "Java backend", {
    experience: "4 years",
    education: "Computer science",
    preferredSkills: ["SQL"],
  });
  expect(m.components!.find((c) => c.name === "Experience")!.score).toBe(50);
  expect(m.score).toBe(85);
  expect(
    matchResume(["Java"], { ...profile, experienceYears: null }, "Java", {
      experience: "4 years",
    }).components!.find((c) => c.name === "Experience")!.score,
  ).toBeNull();
});
