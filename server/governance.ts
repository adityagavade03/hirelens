import type { Express, RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import mongoose, { Schema } from "mongoose";
import { z } from "zod";
import {
  AuditModel,
  InterviewModel,
  MonitoringModel,
  ReportModel,
  SubmissionModel,
  CodeRevisionModel,
  CaptureModel,
  ClipModel,
} from "./models.js";
import { ApiError, hashToken, permit } from "./security.js";
import { SpeakerAnalysisModel } from "./advanced-proctoring.js";
const Plan = mongoose.model(
  "RetentionPlan",
  new Schema(
    {
      tokenHash: { type: String, unique: true, required: true },
      companyId: String,
      actorId: String,
      interviewIds: [String],
      auditIds: [String],
      expiresAt: { type: Date, expires: 0 },
    },
    { timestamps: true },
  ),
);
export const auditRequests: RequestHandler = (req, res, next) => {
  res.once("finish", () => {
    if (!req.user || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    // Store route templates, never request bodies, query strings, cookies, tokens or resume contents.
    void AuditModel.create({
      actorId: req.user._id,
      companyId: req.user.companyId,
      action: `${req.method} ${req.route?.path || "unknown"}`,
      resourceId: typeof req.params.id === "string" ? req.params.id : undefined,
      status: res.statusCode,
    }).catch(() => console.error("An audit event could not be persisted."));
  });
  next();
};
export function registerGovernanceRoutes(app: Express) {
  app.get("/api/company/audit", permit("company"), async (req, res) => {
    const before = z.iso.datetime().optional().parse(req.query.before);
    const events = await AuditModel.find({
      companyId: req.user.companyId || "__none",
      ...(before ? { createdAt: { $lt: new Date(before) } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(events);
  });
  app.post(
    "/api/company/retention/preview",
    permit("company"),
    async (req, res) => {
      const { days, auditDays } = z
        .object({
          days: z.number().int().min(30).max(3650),
          auditDays: z.number().int().min(365).max(3650),
        })
        .parse(req.body);
      const companyId = req.user.companyId || "__none";
      const reports = await ReportModel.find({
        companyId,
        finalized: true,
      }).select("interviewId");
      const interviews = await InterviewModel.find({
        companyId,
        _id: { $in: reports.map((r) => r.interviewId) },
        status: "completed",
        endedAt: { $lt: new Date(Date.now() - days * 86400000) },
      }).select("_id");
      const interviewIds = interviews.map((i) => i.id);
      const audit = await AuditModel.find({
        companyId,
        createdAt: { $lt: new Date(Date.now() - auditDays * 86400000) },
      }).select("_id");
      if (interviewIds.length + audit.length > 10000)
        throw new ApiError(
          409,
          "This cleanup exceeds 10,000 records. Use a shorter retention range or a maintenance migration.",
        );
      const previewToken = randomBytes(32).toString("hex");
      await Plan.create({
        tokenHash: hashToken(previewToken),
        companyId,
        actorId: req.user._id,
        interviewIds,
        auditIds: audit.map((a) => a.id),
        expiresAt: new Date(Date.now() + 5 * 60000),
      });
      res.json({
        previewToken,
        interviews: interviewIds.length,
        monitoringEvents: await MonitoringModel.countDocuments({
          interviewId: { $in: interviewIds },
        }),
        submissions: await SubmissionModel.countDocuments({
          interviewId: { $in: interviewIds },
        }),
        auditEvents: audit.length,
        codeRevisions: await CodeRevisionModel.countDocuments({
          interviewId: { $in: interviewIds },
        }),
        recordingSegments: await ClipModel.countDocuments({
          interviewId: { $in: interviewIds },
        }),
      });
    },
  );
  app.post(
    "/api/company/retention/apply",
    permit("company"),
    async (req, res) => {
      const { previewToken, confirmation } = z
        .object({
          previewToken: z.string().regex(/^[a-f0-9]{64}$/),
          confirmation: z.literal("DELETE PRIVATE INTERVIEW DATA"),
        })
        .parse(req.body);
      const plan = await Plan.findOneAndDelete({
        tokenHash: hashToken(previewToken),
        actorId: req.user._id,
        companyId: req.user.companyId,
        expiresAt: { $gt: new Date() },
      });
      if (!plan)
        throw new ApiError(
          400,
          "Preview expired or already applied. Preview again before deleting.",
        );
      const scope = { interviewId: { $in: plan.interviewIds } };
      const monitoring = await MonitoringModel.deleteMany(scope);
      const submissions = await SubmissionModel.deleteMany(scope);
      const revisions = await CodeRevisionModel.deleteMany(scope);
      const clips = await ClipModel.deleteMany(scope);
      await SpeakerAnalysisModel.deleteMany(scope);
      await CaptureModel.deleteMany(scope);
      const interviews = await InterviewModel.updateMany(
        {
          _id: { $in: plan.interviewIds },
          companyId: plan.companyId,
          status: "completed",
        },
        { $set: { notes: "", drafts: {} } },
      );
      const audit = await AuditModel.deleteMany({
        _id: { $in: plan.auditIds },
        companyId: plan.companyId,
      });
      res.json({
        interviews: interviews.modifiedCount,
        monitoringEvents: monitoring.deletedCount,
        submissions: submissions.deletedCount,
        codeRevisions: revisions.deletedCount,
        recordingSegments: clips.deletedCount,
        auditEvents: audit.deletedCount,
      });
    },
  );
}
