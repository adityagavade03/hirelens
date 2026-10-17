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
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { hashToken } from "../server/security";
import {
  ApplicationModel,
  CompanyModel,
  InterviewBatchModel,
  InterviewModel,
  JobModel,
  NotificationModel,
  ReportModel,
  SessionModel,
  UserModel,
  connectDatabase,
} from "../server/models";

const app = createApp(),
  originalConfig = { ...config };
const id = () => new mongoose.Types.ObjectId().toString();
const at = (minutes: number) =>
  new Date(Date.now() + minutes * 60000).toISOString();
let database: MongoMemoryServer;
beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("interview_scheduling_tests"));
});
beforeEach(async () => {
  expect(mongoose.connection.name).toBe("interview_scheduling_tests");
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("External services are disabled in scheduling tests."),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, originalConfig);
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

async function actor(role: "candidate" | "hr" | "company", companyId?: string) {
  const user = await UserModel.create({
    name: `${role} ${id()}`,
    email: `${id()}@example.test`,
    role,
    companyId,
    passwordHash: "unused",
    profile: { availability: "available" },
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
async function application(job: any, candidateId: string, hrId?: string) {
  return ApplicationModel.create({
    jobId: job.id,
    companyId: job.companyId,
    candidateId,
    candidateName: "Scheduling Candidate",
    jobTitle: job.title,
    companyName: "Scheduling Company",
    status: "Shortlisted",
    snapshot: {},
    resumeId: id(),
    match: { score: 90 },
    ...(hrId ? { assignedHrId: hrId, assignedAt: new Date() } : {}),
  });
}
async function fixture() {
  const companyId = id();
  const owner = await actor("company", companyId),
    hr = await actor("hr", companyId),
    secondHr = await actor("hr", companyId),
    candidate = await actor("candidate");
  await CompanyModel.create({
    _id: companyId,
    ownerId: owner.user.id,
    identifier: id(),
    name: "Scheduling Company",
  });
  const job = await JobModel.create({
    companyId,
    title: "React Developer",
    companyName: "Scheduling Company",
    status: "published",
    skills: ["React"],
    rounds: ["Technical interview"],
    requiredHrCount: 2,
    hrRequests: [
      { hrId: hr.user.id, status: "accepted" },
      { hrId: secondHr.user.id, status: "accepted" },
    ],
  });
  const record = await application(job, candidate.user.id, hr.user.id);
  return {
    companyId,
    owner,
    hr,
    secondHr,
    candidate,
    job,
    application: record,
  };
}
function schedule(
  applicationId: string,
  interviewerId: string,
  overrides = {},
) {
  return {
    applicationId,
    interviewerId,
    scheduledAt: at(10),
    timezone: "Asia/Kolkata",
    duration: 30,
    type: "technical",
    topics: ["React"],
    difficulty: "Beginner",
    problemId: "sum-pairs",
    ...overrides,
  };
}
async function inPersonInterview(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await f.hr.client.post("/api/interviews").send(
    schedule(f.application.id, f.hr.user.id, {
      mode: "in_person",
      venue: "Office A, meeting room 2",
    }),
  );
  expect(result.status).toBe(201);
  return result.body;
}

describe("Interview scheduling and manual in-person feedback", () => {
  it("validates in-person batches and persists the shared venue on every appointment", async () => {
    const f = await fixture();
    const secondCandidate = await actor("candidate");
    const secondApplication = await application(
      f.job,
      secondCandidate.user.id,
      f.hr.user.id,
    );
    const input = {
      requestId: randomUUID(),
      name: "On-site interviews",
      applicationIds: [f.application.id, secondApplication.id],
      startsAt: at(60),
      timezone: "Asia/Kolkata",
      duration: 30,
      gap: 10,
      problemId: "sum-pairs",
      mode: "in_person",
      venue: "Office A, accessible meeting room 2",
    };
    for (const invalid of [{ venue: "Room" }, { facilitator: "ai" }]) {
      expect(
        (
          await f.hr.client
            .post(`/api/jobs/${f.job.id}/interview-batches`)
            .send({ ...input, ...invalid })
        ).status,
      ).toBe(400);
    }
    await UserModel.updateOne(
      { _id: f.hr.user.id },
      { $set: { "profile.availability": "unavailable" } },
    );
    expect(
      (
        await f.hr.client
          .post(`/api/jobs/${f.job.id}/interview-batches`)
          .send(input)
      ).status,
    ).toBe(409);
    expect(await InterviewModel.countDocuments()).toBe(0);
    await UserModel.updateOne(
      { _id: f.hr.user.id },
      { $set: { "profile.availability": "available" } },
    );
    const result = await f.hr.client
      .post(`/api/jobs/${f.job.id}/interview-batches`)
      .send(input);
    expect(result.status).toBe(201);
    const interviews = await InterviewModel.find({ batchId: result.body._id });
    expect(interviews).toHaveLength(2);
    expect(
      interviews.every(
        (item) =>
          item.mode === "in_person" &&
          item.venue === input.venue &&
          item.facilitator === "human",
      ),
    ).toBe(true);
  });
  it("defaults to human video and requires the application's assigned HR for scheduling", async () => {
    const f = await fixture();
    await ApplicationModel.updateOne(
      { _id: f.application.id },
      { $unset: { assignedHrId: 1 } },
    );
    expect(
      (
        await f.hr.client
          .post("/api/interviews")
          .send(schedule(f.application.id, f.hr.user.id))
      ).status,
    ).toBe(404);
    await ApplicationModel.updateOne(
      { _id: f.application.id },
      { $set: { assignedHrId: f.hr.user.id } },
    );
    expect(
      (
        await f.secondHr.client
          .post("/api/interviews")
          .send(schedule(f.application.id, f.secondHr.user.id))
      ).status,
    ).toBe(404);
    expect(
      (
        await f.owner.client
          .post("/api/interviews")
          .send(schedule(f.application.id, f.hr.user.id))
      ).status,
    ).toBe(403);
    const result = await f.hr.client.post("/api/interviews").send(
      schedule(f.application.id, f.hr.user.id, {
        venue: "Not a video meeting location",
      }),
    );
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      mode: "video",
      facilitator: "human",
      venue: "",
      interviewerId: f.hr.user.id,
      status: "scheduled",
    });
    expect((await ApplicationModel.findById(f.application.id))?.status).toBe(
      "Interview Scheduled",
    );
    expect((await f.candidate.client.get("/api/interviews")).body).toHaveLength(
      1,
    );
    expect(
      await NotificationModel.exists({
        userId: f.candidate.user.id,
        message: /scheduled/,
      }),
    ).toBeTruthy();
  });

  it("requires a valid in-person location and rejects an AI facilitator for that mode", async () => {
    const f = await fixture();
    for (const invalid of [
      { mode: "in_person", venue: " A " },
      { mode: "in_person", venue: "Office A", facilitator: "ai" },
      { mode: "telephone" },
    ]) {
      expect(
        (
          await f.hr.client
            .post("/api/interviews")
            .send(schedule(f.application.id, f.hr.user.id, invalid))
        ).status,
      ).toBe(400);
    }
    expect(await InterviewModel.countDocuments()).toBe(0);
    const result = await inPersonInterview(f);
    expect(result).toMatchObject({
      mode: "in_person",
      venue: "Office A, meeting room 2",
      facilitator: "human",
    });
    expect(
      (await f.candidate.client.get(`/api/interviews/${result._id}`)).body
        .venue,
    ).toBe("Office A, meeting room 2");
  });

  it("allows only the assigned HR to conduct an in-person appointment without camera consent and creates one manual report", async () => {
    const f = await fixture();
    const interview = await inPersonInterview(f);
    Object.assign(config, {
      llmUrl: "https://disabled-ai.example.test/v1",
      llmKey: "fixture",
      llmModel: "fixture",
    });
    expect(
      (
        await f.candidate.client
          .post(`/api/interviews/${interview._id}/start`)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await f.owner.client
          .post(`/api/interviews/${interview._id}/start`)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await f.secondHr.client
          .post(`/api/interviews/${interview._id}/start`)
          .send({})
      ).status,
    ).toBe(404);
    const started = await f.hr.client
      .post(`/api/interviews/${interview._id}/start`)
      .send({});
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("live");
    expect(
      (await InterviewModel.findById(interview._id))?.consentAt,
    ).toBeUndefined();
    expect(
      (await f.hr.client.get(`/api/interviews/${interview._id}/ice`)).status,
    ).toBe(409);
    expect(
      (
        await f.hr.client.patch(`/api/interviews/${interview._id}/notes`).send({
          notes:
            "Explained React state clearly; request an example of an effect.",
        })
      ).status,
    ).toBe(200);
    expect(
      (await f.candidate.client.get(`/api/interviews/${interview._id}`)).body
        .notes,
    ).toBeUndefined();
    expect(
      (
        await f.candidate.client
          .post(`/api/interviews/${interview._id}/end`)
          .send({})
      ).status,
    ).toBe(403);
    const ended = await f.hr.client
      .post(`/api/interviews/${interview._id}/end`)
      .send({});
    expect(ended.status).toBe(200);
    expect(ended.body).toMatchObject({ finalized: false, released: false });
    expect(ended.body.assessment).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect((await ApplicationModel.findById(f.application.id))?.status).toBe(
      "Interview Completed",
    );
    const repeated = await f.hr.client
      .post(`/api/interviews/${interview._id}/end`)
      .send({});
    expect(repeated.status).toBe(200);
    expect(repeated.body._id).toBe(ended.body._id);
    expect(await ReportModel.countDocuments()).toBe(1);
  });

  it("prevents starting in-person interviews more than 15 minutes early", async () => {
    const f = await fixture();
    const result = await f.hr.client.post("/api/interviews").send(
      schedule(f.application.id, f.hr.user.id, {
        scheduledAt: at(60),
        mode: "in_person",
        venue: "Office A",
      }),
    );
    expect(result.status).toBe(201);
    expect(
      (
        await f.hr.client
          .post(`/api/interviews/${result.body._id}/start`)
          .send({})
      ).status,
    ).toBe(409);
    expect((await InterviewModel.findById(result.body._id))?.status).toBe(
      "scheduled",
    );
  });

  it("detects scheduling/rescheduling conflicts, preserves assignment on cancellation, and supports a new appointment", async () => {
    const f = await fixture();
    const otherCandidate = await actor("candidate");
    const otherApplication = await application(
      f.job,
      otherCandidate.user.id,
      f.hr.user.id,
    );
    const firstInput = schedule(f.application.id, f.hr.user.id, {
      scheduledAt: at(60),
    });
    const first = await f.hr.client.post("/api/interviews").send(firstInput);
    expect(first.status).toBe(201);
    expect(
      (
        await f.hr.client.post("/api/interviews").send(
          schedule(otherApplication.id, f.hr.user.id, {
            scheduledAt: firstInput.scheduledAt,
          }),
        )
      ).status,
    ).toBe(409);
    const secondInput = schedule(otherApplication.id, f.hr.user.id, {
      scheduledAt: at(120),
    });
    const second = await f.hr.client.post("/api/interviews").send(secondInput);
    expect(second.status).toBe(201);
    expect(
      (
        await f.hr.client
          .patch(`/api/interviews/${first.body._id}/schedule`)
          .send({ ...firstInput, scheduledAt: secondInput.scheduledAt })
      ).status,
    ).toBe(409);
    const movedInput = {
      ...firstInput,
      scheduledAt: at(180),
      mode: "in_person",
      venue: "Office B, conference room",
    };
    const moved = await f.hr.client
      .patch(`/api/interviews/${first.body._id}/schedule`)
      .send(movedInput);
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      mode: "in_person",
      venue: movedInput.venue,
      scheduledAt: movedInput.scheduledAt,
    });
    expect(
      (
        await f.candidate.client
          .post(`/api/interviews/${first.body._id}/cancel`)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await f.hr.client
          .post(`/api/interviews/${first.body._id}/cancel`)
          .send({})
      ).status,
    ).toBe(200);
    expect(await ApplicationModel.findById(f.application.id)).toMatchObject({
      status: "Shortlisted",
      assignedHrId: f.hr.user.id,
    });
    expect(
      (
        await f.hr.client
          .post("/api/interviews")
          .send({ ...firstInput, scheduledAt: movedInput.scheduledAt })
      ).status,
    ).toBe(201);
    expect((await InterviewModel.findById(second.body._id))?.status).toBe(
      "scheduled",
    );
  });

  it("also checks candidate conflicts across different jobs and interviewers, while allowing adjacent slots", async () => {
    const f = await fixture();
    const firstInput = schedule(f.application.id, f.hr.user.id, {
      scheduledAt: at(60),
    });
    expect(
      (await f.hr.client.post("/api/interviews").send(firstInput)).status,
    ).toBe(201);
    const secondJob = await JobModel.create({
      companyId: f.companyId,
      title: "Second job",
      status: "published",
      skills: ["React"],
      hrRequests: [{ hrId: f.secondHr.user.id, status: "accepted" }],
    });
    const secondApplication = await application(
      secondJob,
      f.candidate.user.id,
      f.secondHr.user.id,
    );
    expect(
      (
        await f.secondHr.client.post("/api/interviews").send(
          schedule(secondApplication.id, f.secondHr.user.id, {
            scheduledAt: firstInput.scheduledAt,
          }),
        )
      ).status,
    ).toBe(409);
    const adjacent = new Date(
      +new Date(firstInput.scheduledAt) + 30 * 60000,
    ).toISOString();
    expect(
      (
        await f.secondHr.client.post("/api/interviews").send(
          schedule(secondApplication.id, f.secondHr.user.id, {
            scheduledAt: adjacent,
          }),
        )
      ).status,
    ).toBe(201);
  });

  it("validates nullable 1–5 ratings and releases the final human decision to the candidate", async () => {
    const f = await fixture();
    const interview = await inPersonInterview(f);
    await f.hr.client.post(`/api/interviews/${interview._id}/start`).send({});
    const report = (
      await f.hr.client.post(`/api/interviews/${interview._id}/end`).send({})
    ).body;
    const input = {
      summary: "Explained the code and tradeoffs clearly.",
      decision: "pending",
      explanation: "",
      finalized: false,
      released: false,
      ratings: { technical: 4, communication: null, problemSolving: 3 },
    };
    expect(
      (await f.candidate.client.patch(`/api/reports/${report._id}`).send(input))
        .status,
    ).toBe(403);
    expect(
      (await f.secondHr.client.patch(`/api/reports/${report._id}`).send(input))
        .status,
    ).toBe(404);
    for (const rating of [0, 6, 2.5])
      expect(
        (
          await f.hr.client.patch(`/api/reports/${report._id}`).send({
            ...input,
            ratings: { ...input.ratings, technical: rating },
          })
        ).status,
      ).toBe(400);
    const saved = await f.hr.client
      .patch(`/api/reports/${report._id}`)
      .send(input);
    expect(saved.status).toBe(200);
    expect(saved.body.ratings).toMatchObject(input.ratings);
    expect(
      (await f.hr.client.get("/api/analytics/performance")).body.rows[0],
    ).toMatchObject({
      reportId: report._id,
      mode: "in_person",
      humanRatings: input.ratings,
      stale: false,
    });
    expect(
      (await f.candidate.client.get("/api/analytics/performance")).body.rows,
    ).toHaveLength(0);
    expect(
      (await f.candidate.client.get(`/api/reports/${report._id}`)).status,
    ).toBe(404);
    expect(
      (
        await f.hr.client
          .patch(`/api/reports/${report._id}`)
          .send({ ...input, released: true })
      ).status,
    ).toBe(400);
    const finalized = await f.hr.client
      .patch(`/api/reports/${report._id}`)
      .send({
        ...input,
        decision: "selected",
        explanation:
          "Demonstrated the required frontend skills with clear examples.",
        finalized: true,
        released: true,
      });
    expect(finalized.status).toBe(200);
    expect((await ApplicationModel.findById(f.application.id))?.status).toBe(
      "Selected",
    );
    expect(
      (await f.candidate.client.get(`/api/reports/${report._id}`)).body.report
        .decision,
    ).toBe("selected");
    expect(
      (await f.candidate.client.get("/api/analytics/performance")).body.rows[0],
    ).toMatchObject({
      mode: "in_person",
      humanRatings: input.ratings,
      decision: "selected",
    });
  });

  it("requires every batch candidate to be assigned to its scheduling HR and creates an idempotent video batch", async () => {
    const f = await fixture();
    const secondCandidate = await actor("candidate");
    const secondApplication = await application(f.job, secondCandidate.user.id);
    const input = {
      requestId: randomUUID(),
      name: "Technical interviews",
      applicationIds: [f.application.id, secondApplication.id],
      startsAt: at(60),
      timezone: "Asia/Kolkata",
      duration: 30,
      gap: 10,
      problemId: "sum-pairs",
    };
    expect(
      (
        await f.hr.client
          .post(`/api/jobs/${f.job.id}/interview-batches`)
          .send(input)
      ).status,
    ).toBe(409);
    expect(await InterviewBatchModel.countDocuments()).toBe(0);
    await ApplicationModel.updateOne(
      { _id: secondApplication.id },
      { $set: { assignedHrId: f.secondHr.user.id } },
    );
    expect(
      (
        await f.hr.client
          .post(`/api/jobs/${f.job.id}/interview-batches`)
          .send(input)
      ).status,
    ).toBe(409);
    await ApplicationModel.updateOne(
      { _id: secondApplication.id },
      { $set: { assignedHrId: f.hr.user.id } },
    );
    const result = await f.hr.client
      .post(`/api/jobs/${f.job.id}/interview-batches`)
      .send(input);
    expect(result.status).toBe(201);
    expect(result.body.status).toBe("ready");
    const interviews = await InterviewModel.find({
      batchId: result.body._id,
    }).sort({ scheduledAt: 1 });
    expect(interviews).toHaveLength(2);
    expect(
      interviews.every(
        (item) => item.mode === "video" && item.interviewerId === f.hr.user.id,
      ),
    ).toBe(true);
    expect(+interviews[1].scheduledAt - +interviews[0].scheduledAt).toBe(
      40 * 60000,
    );
    expect(
      (
        await f.hr.client
          .post(`/api/jobs/${f.job.id}/interview-batches`)
          .send(input)
      ).body._id,
    ).toBe(result.body._id);
    expect(await InterviewModel.countDocuments()).toBe(2);
  });
});
