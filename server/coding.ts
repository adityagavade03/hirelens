import type { Express } from "express";
import { z } from "zod";
import type { Problem, User } from "../shared/types.js";
import { blankStarters } from "../shared/languages.js";
import { CodingProblemModel, InterviewModel } from "./models.js";
import { accessibleInterview, ApiError, objectId, permit } from "./security.js";
import { problems, publicProblems } from "./problems.js";
export type PrivateProblem = Problem & {
  tests: { input: string; output: string; hidden: boolean }[];
};
const sample = z.object({
  input: z.string().max(10000),
  output: z.string().max(10000),
});
const schema = z.object({
  title: z.string().trim().min(3).max(150),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  description: z.string().trim().min(20).max(12000),
  constraints: z.string().max(2000),
  examples: z.array(sample).min(1).max(5),
  starter: z.object({
    python: z.string().max(10000),
    javascript: z.string().max(10000),
    java: z.string().max(10000),
    c: z.string().max(10000).default(blankStarters.c),
    cpp: z.string().max(10000).default(blankStarters.cpp),
  }),
  tests: z
    .array(sample.extend({ hidden: z.boolean() }))
    .min(2)
    .max(20)
    .refine(
      (tests) => tests.some((t) => t.hidden) && tests.some((t) => !t.hidden),
      "Include at least one public and one hidden test",
    ),
});
export const safeProblem = (problem: PrivateProblem): Problem => {
  const { tests: _tests, ...publicPart } = problem;
  return {
    ...publicPart,
    starter: { ...blankStarters, ...publicPart.starter },
  };
};
export async function resolveProblem(
  id: string,
  companyId?: string,
): Promise<PrivateProblem> {
  if (Object.hasOwn(problems, id)) return problems[id];
  if (!/^[a-f0-9]{24}$/i.test(id) || !companyId)
    throw new ApiError(404, "Coding problem not found.");
  const row = await CodingProblemModel.findOne({ _id: id, companyId });
  if (!row) throw new ApiError(404, "Coding problem not found.");
  return { ...row.content, id: row.id } as PrivateProblem;
}
export async function interviewProblem(interview: any) {
  const row = await InterviewModel.findById(interview._id).select(
    "+problemSnapshot",
  );
  return (
    (row?.problemSnapshot as PrivateProblem) ||
    resolveProblem(interview.problemId, interview.companyId)
  );
}
export function registerCodingRoutes(app: Express) {
  app.post("/api/practice/coding", permit("candidate"), async (req, res) => {
    const { problemId } = z
      .object({ problemId: z.string().min(1).max(150) })
      .strict()
      .parse(req.body);
    if (!Object.hasOwn(problems, problemId))
      throw new ApiError(404, "Practice question not found.");
    const problem = problems[problemId];
    const session = await InterviewModel.create({
      candidateId: req.user._id,
      interviewerId: req.user._id,
      candidateName: req.user.name,
      companyName: "Personal practice",
      jobTitle: problem.title,
      topics: [problem.topic || "Problem solving"],
      difficulty:
        problem.difficulty === "Easy"
          ? "Beginner"
          : problem.difficulty === "Hard"
            ? "Advanced"
            : "Intermediate",
      problemId,
      problemSnapshot: problem,
      type: "practice",
      practiceMode: "coding",
      facilitator: "human",
      mode: "video",
      status: "live",
      startedAt: new Date(),
      scheduledAt: new Date(),
      timezone: "Asia/Kolkata",
      duration: 90,
      questions: [],
    });
    // A newly created Mongoose document still contains select:false fields.
    // Never return its private snapshot/tests in the creation response.
    res
      .status(201)
      .json({ _id: session.id, practiceMode: "coding", problemId });
  });
  app.post(
    "/api/practice/coding/:id/finish",
    permit("candidate"),
    async (req, res) => {
      const session = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      if (
        session.type !== "practice" ||
        session.practiceMode !== "coding" ||
        session.candidateId !== req.user._id ||
        session.companyId ||
        session.applicationId
      )
        throw new ApiError(404, "Coding practice session not found.");
      if (session.status === "completed") return res.json({ ok: true });
      const changed = await InterviewModel.updateOne(
        { _id: session.id, status: "live" },
        { $set: { status: "completed", endedAt: new Date() } },
      );
      if (!changed.modifiedCount)
        throw new ApiError(409, "This practice session is no longer active.");
      res.json({ ok: true });
    },
  );
  app.get("/api/problems", async (req, res) => {
    const custom =
      req.user.role !== "candidate" && req.user.companyId
        ? await CodingProblemModel.find({ companyId: req.user.companyId })
            .sort({ createdAt: -1 })
            .limit(200)
        : [];
    res.json([
      ...publicProblems(),
      ...custom.map((p) =>
        safeProblem({ ...p.content, id: p.id } as PrivateProblem),
      ),
    ]);
  });
  app.get("/api/problem-library", permit("company", "hr"), async (req, res) => {
    res.json(
      await CodingProblemModel.find({
        companyId: req.user.companyId || "__none",
      })
        .sort({ createdAt: -1 })
        .limit(200),
    );
  });
  app.post(
    "/api/problem-library",
    permit("company", "hr"),
    async (req, res) => {
      if (!req.user.companyId)
        throw new ApiError(
          409,
          "Join a company before creating coding questions.",
        );
      const content = schema.parse(req.body);
      res.status(201).json(
        await CodingProblemModel.create({
          companyId: req.user.companyId,
          authorId: req.user._id,
          content,
        }),
      );
    },
  );
  app.put(
    "/api/problem-library/:id",
    permit("company", "hr"),
    async (req, res) => {
      const content = schema.parse(req.body);
      const row = await CodingProblemModel.findOneAndUpdate(
        {
          _id: objectId.parse(req.params.id),
          companyId: req.user.companyId || "__none",
        },
        { content },
        { returnDocument: "after" },
      );
      if (!row) throw new ApiError(404, "Coding problem not found.");
      res.json(row);
    },
  );
  app.get("/api/interviews/:id/problem", async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    res.json(safeProblem(await interviewProblem(interview)));
  });
}
