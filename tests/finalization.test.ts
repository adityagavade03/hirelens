import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { evidenceHash } from "../server/assessment";
import { withResources } from "../server/locks";
import { hashToken } from "../server/security";
import {
  ApplicationModel,
  connectDatabase,
  InterviewModel,
  JobModel,
  NotificationModel,
  ReportModel,
  SessionModel,
  SubmissionModel,
  UserModel,
} from "../server/models";

// All records belong to a temporary database. Provider responses below are
// deterministic fixtures; no configured Judge0 or AI service is contacted.
const app = createApp(),
  original = { ...config };
const id = () => new mongoose.Types.ObjectId().toString();
const companyId = id();
let db: MongoMemoryServer, hr: any, candidate: any;
const releaseGates: (() => void)[] = [];
const pendingRequests: Promise<any>[] = [];
const review = {
  summary: "Review of the recorded interview evidence.",
  decision: "hold",
  explanation:
    "Further technical evaluation is needed before a hiring decision.",
  finalized: true,
  released: true,
};
const feedback = {
  correctness: 4,
  completeness: 3,
  feedback: "The answer describes average lookup complexity.",
  evidence: ["average constant time lookup"],
  missingConcepts: ["Worst-case collisions"],
  followUp: "What happens when keys collide?",
  uncertainty: "Only one short answer was assessed.",
};
const reportAssessment = {
  summary: "Synthetic replacement assessment from the delayed provider.",
  technical: {
    score: 3,
    explanation: "The answer identifies average hash map complexity.",
    evidenceRefs: ["answer:q1"],
  },
  problemSolving: {
    score: null,
    explanation: "There is no worked problem-solving example.",
    evidenceRefs: [],
  },
  communication: {
    score: 3,
    explanation: "The submitted answer is concise and understandable.",
    evidenceRefs: ["answer:q1"],
  },
  strengths: ["Identifies average constant-time lookup."],
  weaknesses: ["Does not discuss collision behavior."],
  improvements: ["Explain worst-case lookup complexity."],
  recommendation: "Needs Further Evaluation",
  recommendationReason: "One short answer is insufficient evidence.",
  limitations: [
    "Synthetic isolated provider fixture; no real candidate assessed.",
  ],
};

async function actor(role: "hr" | "candidate") {
  const user = await UserModel.create({
    name: `Finalization test ${role}`,
    email: `${id()}@example.test`,
    role,
    companyId: role === "hr" ? companyId : undefined,
    passwordHash: "unused isolated fixture",
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

async function interview() {
  const job = await JobModel.create({
    companyId,
    title: "Finalization regression fixture",
    hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
  });
  const application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId: candidate.user.id,
    resumeId: id(),
    snapshot: {},
    status: "Interview Scheduled",
    assignedHrId: hr.user.id,
  });
  return InterviewModel.create({
    applicationId: application.id,
    companyId,
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    status: "live",
    scheduledAt: new Date(),
    startedAt: new Date(),
    consentAt: new Date(),
    admittedAt: new Date(),
    notes: "Initial interviewer notes.",
    questions: [
      {
        id: "q1",
        text: "Explain a hash map lookup.",
        topic: "Algorithms",
        rubric: ["Accurate complexity"],
      },
    ],
    answers: [
      {
        questionId: "q1",
        text: "A map can provide average constant time lookup.",
        mode: "typed",
        transcriptionReviewed: true,
      },
    ],
    problemId: "sum-pairs",
  });
}

async function end(i: any) {
  const result = await hr.client.post(`/api/interviews/${i.id}/end`).send({});
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const current = await InterviewModel.findById(i.id);
  const submissions = await SubmissionModel.find({ interviewId: i.id }).sort({
    createdAt: 1,
  });
  const hash = evidenceHash(current, submissions);
  await ReportModel.updateOne(
    { _id: result.body._id },
    {
      $set: {
        assessment: { sourceHash: hash, summary: "Synthetic test assessment." },
      },
    },
  );
  return { reportId: result.body._id as string, hash };
}

async function finalize(reportId: string) {
  const result = await hr.client.patch(`/api/reports/${reportId}`).send(review);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
}

async function expectStable(
  i: any,
  report: { reportId: string; hash: string },
) {
  const current = await InterviewModel.findById(i.id);
  const submissions = await SubmissionModel.find({ interviewId: i.id }).sort({
    createdAt: 1,
  });
  expect(evidenceHash(current, submissions)).toBe(report.hash);
  const view = await hr.client.get(`/api/reports/${report.reportId}`);
  expect(view.status).toBe(200);
  expect(view.body.assessmentStale).toBe(false);
  expect(view.body.report.finalized).toBe(true);
  expect(view.body.report.released).toBe(true);
  return current!;
}

function gate() {
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  releaseGates.push(release);
  return { entered, reached, blocked, release };
}

function syntheticJudge(block?: ReturnType<typeof gate>) {
  config.judgeUrl = "https://synthetic-judge.invalid";
  let paused = false;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const address = String(url);
    expect(address.startsWith(config.judgeUrl)).toBe(true);
    if (address.endsWith("/languages"))
      return new Response(JSON.stringify([{ id: 71, name: "Python (3.8.1)" }]));
    if (init?.method === "POST")
      return new Response(
        JSON.stringify({ token: "isolated-finalization-token" }),
      );
    if (block && !paused) {
      paused = true;
      block.entered();
      await block.blocked;
    }
    return new Response(
      JSON.stringify({
        status: { id: 3, description: "Accepted" },
        stdout: Buffer.from("11").toString("base64"),
        time: "0.001",
        memory: 1024,
      }),
    );
  });
}

function syntheticAssessment(
  block?: ReturnType<typeof gate>,
  result: unknown = feedback,
) {
  Object.assign(config, {
    llmUrl: "https://synthetic-ai.invalid/v1",
    llmKey: "fixture",
    llmModel: "fixture",
  });
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    expect(String(url)).toBe(`${config.llmUrl}/chat/completions`);
    if (block) {
      block.entered();
      await block.blocked;
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    );
  });
}

function startCode(i: any) {
  const pending = candidate.client
    .post(`/api/interviews/${i.id}/code`)
    .send({ language: "python", code: "print(11)", mode: "submit" })
    .then((response: any) => response);
  pendingRequests.push(pending);
  return pending;
}

beforeAll(async () => {
  db = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(db.getUri("hirelens_finalization"));
  hr = await actor("hr");
  candidate = await actor("candidate");
});
afterEach(async () => {
  for (const release of releaseGates.splice(0)) release();
  await Promise.allSettled(pendingRequests.splice(0));
  vi.restoreAllMocks();
  Object.assign(config, original);
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

it("keeps finalized and released answer review, notes, and assessment immutable", async () => {
  const i = await interview(),
    report = await end(i);
  await finalize(report.reportId);
  const provider = syntheticAssessment();
  const override = await hr.client
    .patch(`/api/interviews/${i.id}/answers/q1/override`)
    .send({ override: "Changed review after final publication." });
  const notes = await hr.client
    .patch(`/api/interviews/${i.id}/notes`)
    .send({ notes: "Changed notes after final publication." });
  const assessment = await hr.client
    .post(`/api/interviews/${i.id}/answers/q1/assess`)
    .send({});
  expect(override.status).toBe(409);
  expect(notes.status).toBe(409);
  expect(assessment.status).toBe(409);
  expect(provider).not.toHaveBeenCalled();
  const current = await expectStable(i, report);
  expect(current.notes).toBe("Initial interviewer notes.");
  expect(current.answers[0].override || "").toBe("");
  expect(current.answers[0].feedback).toBeUndefined();
});

it("allows human review of a completed draft and marks its previous assessment stale", async () => {
  const i = await interview(),
    report = await end(i);
  const override =
    "The candidate needs to explain hash collisions in a follow-up.";
  expect(
    (
      await hr.client
        .patch(`/api/interviews/${i.id}/answers/q1/override`)
        .send({ override })
    ).status,
  ).toBe(200);
  expect(
    (
      await hr.client
        .patch(`/api/interviews/${i.id}/notes`)
        .send({ notes: "Reviewed after the interview ended." })
    ).status,
  ).toBe(200);
  const current = await InterviewModel.findById(i.id);
  expect(current!.answers[0].override).toBe(override);
  expect(current!.notes).toBe("Reviewed after the interview ended.");
  const view = await hr.client.get(`/api/reports/${report.reportId}`);
  expect(view.body.report.finalized).toBe(false);
  expect(view.body.assessmentStale).toBe(true);
  expect(
    (await hr.client.patch(`/api/reports/${report.reportId}`).send(review))
      .status,
  ).toBe(409);
});

it("discards in-flight code results after the report is finalized and released", async () => {
  const i = await interview(),
    block = gate();
  syntheticJudge(block);
  const pending = startCode(i);
  await block.reached;
  const report = await end(i);
  await finalize(report.reportId);
  block.release();
  expect((await pending).status).toBe(409);
  expect(await SubmissionModel.countDocuments({ interviewId: i.id })).toBe(0);
  await expectStable(i, report);
});

it("discards in-flight code results once a session ends even before report finalization", async () => {
  const i = await interview(),
    block = gate();
  syntheticJudge(block);
  const pending = startCode(i);
  await block.reached;
  const report = await end(i);
  block.release();
  expect((await pending).status).toBe(409);
  expect(await SubmissionModel.countDocuments({ interviewId: i.id })).toBe(0);
  const view = await hr.client.get(`/api/reports/${report.reportId}`);
  expect(view.body.report.finalized).toBe(false);
  expect(view.body.assessmentStale).toBe(false);
});

it("still saves a successful code submission while the session is live", async () => {
  const i = await interview();
  syntheticJudge();
  const result = await startCode(i);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const stored = await SubmissionModel.find({ interviewId: i.id });
  expect(stored).toHaveLength(1);
  expect(stored[0].candidateId).toBe(candidate.user.id);
  expect(stored[0].code).toBe("print(11)");
  expect(stored[0].results.length).toBeGreaterThan(0);
  expect(stored[0].passed).toBe(stored[0].total);
  expect(result.body._id).toBe(stored[0].id);
});

it("rejects both finalization and answer edits while another report update holds its lease", async () => {
  const i = await interview(),
    report = await end(i);
  await withResources([`report:${i.id}`], async () => {
    const [finalized, edited] = await Promise.all([
      hr.client.patch(`/api/reports/${report.reportId}`).send(review),
      hr.client.patch(`/api/interviews/${i.id}/answers/q1/override`).send({
        override:
          "Concurrent interpretation must not change finalized evidence.",
      }),
    ]);
    expect(finalized.status).toBe(409);
    expect(edited.status).toBe(409);
  });
  const current = await InterviewModel.findById(i.id);
  expect(evidenceHash(current, [])).toBe(report.hash);
  expect((await ReportModel.findById(report.reportId))!.finalized).toBe(false);
  await finalize(report.reportId);
  await expectStable(i, report);
});

it("does not apply a slow answer assessment after finalization", async () => {
  const i = await interview(),
    report = await end(i),
    block = gate();
  syntheticAssessment(block);
  const pending = hr.client
    .post(`/api/interviews/${i.id}/answers/q1/assess`)
    .send({})
    .then((response: any) => response);
  pendingRequests.push(pending);
  await block.reached;
  await finalize(report.reportId);
  block.release();
  expect((await pending).status).toBe(409);
  const current = await expectStable(i, report);
  expect(current.answers[0].feedback).toBeUndefined();
});

it("allows an answer assessment to finish during an unfinalized human review", async () => {
  const i = await interview();
  await end(i);
  syntheticAssessment();
  const result = await hr.client
    .post(`/api/interviews/${i.id}/answers/q1/assess`)
    .send({});
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  expect(result.body).toEqual(feedback);
  expect((await InterviewModel.findById(i.id))!.answers[0].feedback).toEqual(
    feedback,
  );
});

it("returns the candidate's latest saved code to assigned HR without exposing it to unrelated HR", async () => {
  const i = await interview(),
    unrelatedHr = await actor("hr");
  const firstDraft = "print('first draft')",
    latestDraft = "print('latest draft')";
  expect(
    (
      await candidate.client
        .patch(`/api/interviews/${i.id}/draft`)
        .send({ language: "python", code: firstDraft })
    ).status,
  ).toBe(200);
  const firstPoll = await hr.client.get(`/api/interviews/${i.id}`);
  expect(firstPoll.status).toBe(200);
  expect(firstPoll.body.drafts.python).toBe(firstDraft);
  expect(
    (
      await candidate.client
        .patch(`/api/interviews/${i.id}/draft`)
        .send({ language: "python", code: latestDraft })
    ).status,
  ).toBe(200);
  const updatedPoll = await hr.client.get(`/api/interviews/${i.id}`);
  expect(updatedPoll.status).toBe(200);
  expect(updatedPoll.body.drafts.python).toBe(latestDraft);
  const ownPoll = await candidate.client.get(`/api/interviews/${i.id}`);
  expect(ownPoll.status).toBe(200);
  expect(ownPoll.body.drafts.python).toBe(latestDraft);
  expect((await unrelatedHr.client.get(`/api/interviews/${i.id}`)).status).toBe(
    404,
  );
  expect((await InterviewModel.findById(i.id))!.drafts.get("python")).toBe(
    latestDraft,
  );
});

it("discards an AI interview turn's delayed answer feedback after the session ends", async () => {
  const i = await interview(),
    block = gate();
  await InterviewModel.updateOne(
    { _id: i.id },
    { $set: { facilitator: "ai" } },
  );
  const provider = syntheticAssessment(block);
  const pending = candidate.client
    .post(`/api/interviews/${i.id}/ai/next`)
    .send({})
    .then((response: any) => response);
  pendingRequests.push(pending);
  await block.reached;
  // Disable automatic end-of-interview report generation while the synthetic
  // answer assessment is suspended; no second provider request is expected.
  config.llmUrl = "";
  const report = await end(i);
  await finalize(report.reportId);
  block.release();
  expect((await pending).status).toBe(409);
  expect(provider).toHaveBeenCalledTimes(1);
  const current = await expectStable(i, report);
  expect(current.answers[0].feedback).toBeUndefined();
  expect(current.questions).toHaveLength(1);
  expect(current.aiBusyToken).toBeUndefined();
  expect(current.aiBusyUntil).toBeUndefined();
});

it("does not save an assessment generated from evidence changed during the provider request", async () => {
  const i = await interview(),
    report = await end(i),
    block = gate();
  expect(
    (await hr.client.delete(`/api/reports/${report.reportId}/assessment`))
      .status,
  ).toBe(200);
  syntheticAssessment(block, reportAssessment);
  const pending = hr.client
    .post(`/api/reports/${report.reportId}/assessment`)
    .send({})
    .then((response: any) => response);
  pendingRequests.push(pending);
  await block.reached;
  const override =
    "During review, the interviewer identified missing collision analysis.";
  expect(
    (
      await hr.client
        .patch(`/api/interviews/${i.id}/answers/q1/override`)
        .send({ override })
    ).status,
  ).toBe(200);
  block.release();
  expect((await pending).status).toBe(409);
  const stored = await ReportModel.findById(report.reportId);
  expect(stored!.assessment).toBeUndefined();
  expect(stored!.finalized).toBe(false);
  const current = await InterviewModel.findById(i.id);
  expect(current!.answers[0].override).toBe(override);
  expect(evidenceHash(current, [])).not.toBe(report.hash);
});

it("preserves a finalized report when its delayed replacement assessment returns", async () => {
  const i = await interview(),
    report = await end(i),
    block = gate();
  syntheticAssessment(block, reportAssessment);
  const pending = hr.client
    .post(`/api/reports/${report.reportId}/assessment`)
    .send({})
    .then((response: any) => response);
  pendingRequests.push(pending);
  await block.reached;
  await finalize(report.reportId);
  const published = (await ReportModel.findById(report.reportId))!.toObject();
  block.release();
  expect((await pending).status).toBe(409);
  expect((await ReportModel.findById(report.reportId))!.toObject()).toEqual(
    published,
  );
  await expectStable(i, report);
});

it("uses the canonical report lease for uppercase interview IDs", async () => {
  const i = await interview(),
    uppercaseId = i.id.toUpperCase();
  expect(uppercaseId).not.toBe(i.id);
  await withResources([`report:${i.id}`], async () => {
    const [override, notes, ended] = await Promise.all([
      hr.client
        .patch(`/api/interviews/${uppercaseId}/answers/q1/override`)
        .send({
          override:
            "An alternate ID spelling must not bypass the shared report lock.",
        }),
      hr.client.patch(`/api/interviews/${uppercaseId}/notes`).send({
        notes: "This update must wait for the existing report update.",
      }),
      hr.client.post(`/api/interviews/${uppercaseId}/end`).send({}),
    ]);
    expect(override.status).toBe(409);
    expect(notes.status).toBe(409);
    expect(ended.status).toBe(409);
  });
  const current = await InterviewModel.findById(i.id);
  expect(current!.status).toBe("live");
  expect(current!.endedAt).toBeUndefined();
  expect(current!.notes).toBe("Initial interviewer notes.");
  expect(current!.answers[0].override).toBeUndefined();
  expect(current!.answers[0].feedback).toBeUndefined();
  expect(await ReportModel.countDocuments({ interviewId: i.id })).toBe(0);
  expect((await ApplicationModel.findById(i.applicationId))!.status).toBe(
    "Interview Scheduled",
  );
});

it("does not complete a later scheduled round when an old interview end request is retried", async () => {
  const i = await interview(),
    report = await end(i);
  const nextRound = await InterviewModel.create({
    applicationId: i.applicationId,
    companyId,
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 86400000),
    roundIndex: 1,
    roundCount: 2,
    roundName: "Second technical interview",
  });
  await ApplicationModel.updateOne(
    { _id: i.applicationId },
    {
      $set: { status: "Interview Scheduled" },
    },
  );
  const notificationsBefore = await NotificationModel.countDocuments({
    userId: candidate.user.id,
  });
  const retried = await hr.client.post(`/api/interviews/${i.id}/end`).send({});
  expect(retried.status, JSON.stringify(retried.body)).toBe(200);
  expect(retried.body._id).toBe(report.reportId);
  expect((await ApplicationModel.findById(i.applicationId))!.status).toBe(
    "Interview Scheduled",
  );
  expect((await InterviewModel.findById(nextRound.id))!.status).toBe(
    "scheduled",
  );
  expect(
    await NotificationModel.countDocuments({ userId: candidate.user.id }),
  ).toBe(notificationsBefore);
  expect(await ReportModel.countDocuments({ interviewId: i.id })).toBe(1);
  expect(await ReportModel.countDocuments({ interviewId: nextRound.id })).toBe(
    0,
  );
});
