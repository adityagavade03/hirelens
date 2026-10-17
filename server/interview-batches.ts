import mongoose from "mongoose";
import { createHash } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { accessibleJob, ApiError, objectId, permit } from "./security.js";
import { withJobWorkflow } from "./recruitment.js";
import {
  ApplicationModel,
  InterviewModel,
  InterviewBatchModel,
  NotificationModel,
  UserModel,
} from "./models.js";
import { nextRound } from "./rounds.js";
import { resolveProblem } from "./coding.js";
import { curatedQuestions } from "./problems.js";
import { withResources } from "./locks.js";
import { assertSlot } from "./calendar.js";

async function notifyBatch(batch: any) {
  const interviews = await InterviewModel.find({ batchId: batch.id });
  for (const i of interviews)
    await NotificationModel.updateOne(
      { userId: i.candidateId, href: `/room/${i.id}` },
      {
        $setOnInsert: {
          userId: i.candidateId,
          message: `Your ${i.jobTitle} interview is scheduled for ${i.scheduledAt.toISOString()}.`,
          href: `/room/${i.id}`,
        },
      },
      { upsert: true },
    );
}
async function rollbackBatch(batch: any) {
  const original = batch.recovery as
    | {
        id: string;
        status: string;
        assignedHrId?: string;
        assignedAt?: string;
      }[]
    | undefined;
  if (!original)
    throw new ApiError(
      409,
      "This legacy batch has no recovery snapshot. Review its applications manually.",
    );
  if (
    await InterviewModel.exists({
      batchId: batch.id,
      status: { $nin: ["scheduled", "cancelled"] },
    })
  )
    throw new ApiError(
      409,
      "This batch includes a started interview and cannot be rolled back.",
    );
  await InterviewModel.deleteMany({
    batchId: batch.id,
    status: { $in: ["scheduled", "cancelled"] },
  });
  for (const a of original)
    await ApplicationModel.updateOne(
      { _id: a.id, schedulingBatchId: batch.id },
      {
        $set: {
          status: a.status,
          ...(a.assignedHrId
            ? { assignedHrId: a.assignedHrId, assignedAt: a.assignedAt }
            : {}),
        },
        $unset: {
          schedulingBatchId: 1,
          ...(!a.assignedHrId ? { assignedHrId: 1, assignedAt: 1 } : {}),
        },
      },
    );
  await InterviewBatchModel.updateOne(
    { _id: batch.id, status: { $ne: "ready" } },
    { $set: { status: "failed" }, $unset: { recovery: 1 } },
  );
}

export function registerInterviewBatches(app: Express) {
  app.post(
    "/api/interview-batches/:id/recover",
    permit("hr"),
    async (req, res) => {
      const batch = await InterviewBatchModel.findOne({
        _id: objectId.parse(req.params.id),
        interviewerId: req.user._id,
      }).select("+recovery");
      if (!batch) throw new ApiError(404, "Batch not found.");
      await accessibleJob(req.user, batch.jobId);
      await withJobWorkflow(batch.jobId, async () => {
        const fresh = await InterviewBatchModel.findById(batch.id).select(
          "+recovery",
        );
        if (!fresh) throw new ApiError(404, "Batch not found.");
        if (fresh.status === "ready") {
          await notifyBatch(fresh);
          res.json({ status: "ready" });
          return;
        }
        if (fresh.status === "failed" && !fresh.recovery) {
          res.json({ status: "failed" });
          return;
        }
        if (Date.now() - +fresh.updatedAt < 120000)
          throw new ApiError(
            409,
            "Allow two minutes for an active scheduling request before recovering it.",
          );
        await rollbackBatch(fresh);
        res.json({
          status: "failed",
          message:
            "Incomplete appointments removed and original application states restored. Schedule a new batch.",
        });
      });
    },
  );
  app.get(
    "/api/jobs/:id/interview-batches",
    permit("hr", "company"),
    async (req, res) => {
      const job = await accessibleJob(req.user, objectId.parse(req.params.id));
      const batches = await InterviewBatchModel.find({
        jobId: job.id,
        ...(req.user.role === "hr" ? { interviewerId: req.user._id } : {}),
      }).sort({ createdAt: -1 });
      const interviews = await InterviewModel.find({
        batchId: { $in: batches.map((b) => b.id) },
      }).select("candidateName scheduledAt status batchId");
      res.json(
        batches.map((b) => ({
          ...b.toObject(),
          interviews: interviews.filter((i) => i.batchId === b.id),
        })),
      );
    },
  );
  app.post(
    "/api/jobs/:id/interview-batches",
    permit("hr"),
    async (req, res) => {
      const input = z
        .object({
          requestId: z.uuid(),
          name: z.string().trim().min(3).max(100),
          applicationIds: z
            .array(objectId)
            .min(1)
            .max(20)
            .refine((ids) => new Set(ids).size === ids.length),
          startsAt: z.iso.datetime({ offset: true }),
          timezone: z
            .string()
            .max(100)
            .refine((v) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: v });
                return true;
              } catch {
                return false;
              }
            }),
          duration: z.number().int().min(10).max(180),
          gap: z.number().int().min(0).max(60),
          problemId: z.string().min(1).max(100),
          facilitator: z.enum(["human", "ai"]).default("human"),
          mode: z.enum(["video", "in_person"]).default("video"),
          venue: z.string().trim().max(500).default(""),
        })
        .parse(req.body);
      if (
        input.mode === "in_person" &&
        (input.venue.length < 5 || input.facilitator !== "human")
      )
        throw new ApiError(
          400,
          "In-person interviews need a meeting location and a human interviewer.",
        );
      if (input.mode === "video") input.venue = "";
      const hr = await UserModel.findById(req.user._id).select(
        "profile.availability",
      );
      if (hr?.profile?.availability === "unavailable")
        throw new ApiError(
          409,
          "Update your availability before scheduling interviews.",
        );
      const job = await accessibleJob(req.user, objectId.parse(req.params.id));
      const selected = await ApplicationModel.find({
        _id: { $in: input.applicationIds },
        jobId: job.id,
      }).select("candidateId");
      const requestHash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const result = await withResources(
        [
          `calendar:${req.user._id}`,
          ...selected.map((a) => `calendar:${a.candidateId}`),
        ],
        () =>
          withJobWorkflow(job.id, async () => {
            const prior = await InterviewBatchModel.findOne({
              interviewerId: req.user._id,
              requestId: input.requestId,
            });
            if (prior) {
              if (prior.jobId !== job.id)
                throw new ApiError(
                  409,
                  "This request was already used for another job.",
                );
              if (prior.requestHash && prior.requestHash !== requestHash)
                throw new ApiError(
                  409,
                  "This request ID was already used with different scheduling details.",
                );
              if (prior.status !== "ready")
                throw new ApiError(
                  409,
                  "This batch is not ready. Refresh its status before creating another.",
                );
              await notifyBatch(prior);
              return prior;
            }
            if (new Date(input.startsAt).getTime() < Date.now())
              throw new ApiError(400, "Choose a future start time.");
            const applications = await ApplicationModel.find({
              _id: { $in: input.applicationIds },
              jobId: job.id,
            });
            if (applications.length !== input.applicationIds.length)
              throw new ApiError(
                404,
                "A selected application does not belong to this job.",
              );
            const problemSnapshot = await resolveProblem(
              input.problemId,
              job.companyId,
            );
            const plans = [];
            for (const [index, id] of input.applicationIds.entries()) {
              const a = applications.find((a) => a.id === id)!;
              if (a.assignedHrId !== req.user._id)
                throw new ApiError(
                  409,
                  "Every candidate in this batch must be assigned to you first.",
                );
              const round = await nextRound(a);
              const start = new Date(
                new Date(input.startsAt).getTime() +
                  index * (input.duration + input.gap) * 60000,
              );
              await assertSlot(
                req.user._id,
                a.candidateId,
                start,
                input.duration,
              );
              const conflicts = await InterviewModel.find({
                interviewerId: req.user._id,
                status: { $in: ["scheduled", "live"] },
                scheduledAt: { $lt: new Date(+start + input.duration * 60000) },
              }).select("scheduledAt duration");
              if (
                conflicts.some(
                  (i) => +i.scheduledAt + (i.duration || 30) * 60000 > +start,
                )
              )
                throw new ApiError(
                  409,
                  "An interview already occupies one of these time slots.",
                );
              plans.push({
                _id: new mongoose.Types.ObjectId(),
                applicationId: a.id,
                candidateId: a.candidateId,
                candidateName: a.candidateName,
                companyId: job.companyId,
                companyName: job.companyName,
                jobTitle: job.title,
                interviewerId: req.user._id,
                scheduledAt: start,
                timezone: input.timezone,
                duration: input.duration,
                facilitator: input.facilitator,
                mode: input.mode,
                venue: input.venue,
                type: job.interviewInstructions?.type || "technical",
                topics: job.interviewInstructions?.topics.length
                  ? job.interviewInstructions.topics
                  : job.skills,
                difficulty: job.difficulty,
                problemId: input.problemId,
                problemSnapshot,
                questions:
                  input.facilitator === "ai"
                    ? []
                    : curatedQuestions(job.skills),
                ...round,
              });
            }
            const batch = await InterviewBatchModel.create({
              companyId: job.companyId,
              jobId: job.id,
              interviewerId: req.user._id,
              requestId: input.requestId,
              name: input.name,
              interviewIds: plans.map((p) => p._id.toString()),
              requestHash,
              recovery: applications.map((a) => ({
                id: a.id,
                status: a.status,
                assignedHrId: a.assignedHrId,
                assignedAt: a.assignedAt,
              })),
            });
            try {
              await InterviewModel.insertMany(
                plans.map((p) => ({ ...p, batchId: batch.id })),
              );
              const changes = await ApplicationModel.bulkWrite(
                applications.map((a) => ({
                  updateOne: {
                    filter: { _id: a.id, status: a.status },
                    update: {
                      $set: {
                        status: "Interview Scheduled",
                        assignedHrId: req.user._id,
                        assignedAt: new Date(),
                        schedulingBatchId: batch.id,
                      },
                    },
                  },
                })),
              );
              if (changes.matchedCount !== applications.length)
                throw new ApiError(
                  409,
                  "An application changed while scheduling. Please retry.",
                );
              batch.status = "ready";
              await batch.save();
              await ApplicationModel.updateMany(
                { schedulingBatchId: batch.id },
                { $unset: { schedulingBatchId: 1 } },
              );
              await InterviewBatchModel.updateOne(
                { _id: batch.id },
                { $unset: { recovery: 1 } },
              );
            } catch (error) {
              const saved = await InterviewBatchModel.findById(batch.id).select(
                "+recovery",
              );
              if (saved && saved.status !== "ready") await rollbackBatch(saved);
              throw error;
            }
            await notifyBatch(batch);
            return batch;
          }),
      );
      res.status(201).json(result);
    },
  );
}
