import type { Express } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { rateStore } from "./scaling.js";
import { z } from "zod";
import {
  CompanyModel,
  UserModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  NotificationModel,
  MonitoringModel,
} from "./models.js";
import { ApiError, permit, objectId, accessibleJob } from "./security.js";
import {
  companyDetailsSchema,
  companyRecord,
  verifyCompany,
} from "./onboarding.js";
import { config, localCompanyRegistrationEnabled } from "./config.js";
import { previewAllowsCompany } from "./private-preview.js";

export async function assertPublishable(companyId: string) {
  const company = await CompanyModel.findById(companyId);
  if (!company) throw new ApiError(404, "Company not found.");
  const localTestingAllowed =
    localCompanyRegistrationEnabled() || previewAllowsCompany(companyId);
  if (company.localDevelopment && !localTestingAllowed)
    throw new ApiError(
      403,
      "Local development companies are disabled in this environment.",
    );
  if (
    company.verification?.status !== "verified" &&
    !(company.localDevelopment && localTestingAllowed) &&
    !(company.sample && config.demoLogin)
  )
    throw new ApiError(
      403,
      "Verify your company profile before publishing jobs. You can still save drafts.",
    );
}
export function registerCompanyRoutes(app: Express) {
  app.get("/api/company", permit("company", "hr"), async (req, res) => {
    const company = req.user.companyId
      ? await CompanyModel.findById(req.user.companyId)
      : null;
    const members = company
      ? await UserModel.find({ companyId: company._id.toString() }).select(
          "name email role profile",
        )
      : [];
    res.json({ company, members });
  });
  app.patch("/api/company", permit("company"), async (req, res) => {
    const company = await CompanyModel.findById(req.user.companyId);
    if (!company) throw new ApiError(404, "Company not found.");
    const text = (max: number) => z.string().trim().max(max);
    const input = z
      .object({
        name: text(150).min(2).optional(),
        website: z
          .union([
            z
              .url()
              .max(500)
              .refine((v) => /^https?:\/\//.test(v)),
            z.literal(""),
          ])
          .optional(),
        description: text(6000).optional(),
        location: text(200).optional(),
        industry: text(120).optional(),
        companyType: text(100).optional(),
        address: text(600).optional(),
        phone: text(40).optional(),
      })
      .strict()
      .parse(req.body);
    if (
      company.verification?.status === "verified" &&
      ((input.name !== undefined && input.name !== company.name) ||
        (input.website !== undefined && input.website !== company.website))
    )
      throw new ApiError(
        409,
        "Verify the updated legal company name or website before changing it.",
      );
    Object.assign(company, input);
    await company.save();
    if (input.name)
      await JobModel.updateMany(
        { companyId: req.user.companyId },
        { $set: { companyName: company.name } },
      );
    res.json(company);
  });
  app.post(
    "/api/company/verify",
    permit("company"),
    rateLimit({
      store: rateStore("company-profile-verification"),
      windowMs: 15 * 60000,
      limit: 5,
      keyGenerator: (req) => req.user._id,
      message: {
        error: {
          message: "Too many verification requests. Try again in 15 minutes.",
        },
      },
    }),
    async (req, res) => {
      const company = await CompanyModel.findById(req.user.companyId);
      if (!company) throw new ApiError(404, "Company not found.");
      const details = companyDetailsSchema.parse(req.body);
      if (details.officialEmail !== req.user.email)
        throw new ApiError(
          400,
          "Use the company account’s registered email address.",
        );
      const result = await verifyCompany(details, req.user.companyId);
      Object.assign(company, companyRecord(details, result));
      await company.save();
      await JobModel.updateMany(
        { companyId: req.user.companyId },
        { $set: { companyName: company.name } },
      );
      res.json({ verified: true });
    },
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/company/logo",
    permit("company"),
    upload.single("logo"),
    async (req, res) => {
      const data = req.file?.buffer;
      const png =
        data &&
        data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg =
        data &&
        data.length > 3 &&
        data[0] === 255 &&
        data[1] === 216 &&
        data[2] === 255;
      if (!png && !jpeg)
        throw new ApiError(400, "Upload a PNG or JPEG logo, up to 1 MB.");
      await CompanyModel.updateOne(
        { _id: req.user.companyId },
        {
          $set: {
            logoData: data,
            logoType: png ? "image/png" : "image/jpeg",
            hasLogo: true,
          },
        },
      );
      res.json({ ok: true });
    },
  );
  app.get("/api/company/logo", permit("company", "hr"), async (req, res) => {
    const company = await CompanyModel.findById(req.user.companyId).select(
      "+logoData",
    );
    if (!company?.logoData)
      throw new ApiError(404, "No company logo uploaded.");
    res.setHeader("Cache-Control", "private, no-store");
    res.type(company.logoType || "image/png").send(company.logoData);
  });
  app.get("/api/company/overview", permit("company"), async (req, res) => {
    const scope = { companyId: req.user.companyId };
    const [
      company,
      jobCounts,
      stages,
      interviewCounts,
      hrCount,
      recentApplications,
      recentJobs,
    ] = await Promise.all([
      CompanyModel.findById(req.user.companyId),
      JobModel.aggregate([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ApplicationModel.aggregate([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      InterviewModel.aggregate([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      UserModel.countDocuments({ ...scope, role: "hr" }),
      ApplicationModel.find(scope).sort({ createdAt: -1 }).limit(6),
      JobModel.find(scope).sort({ createdAt: -1 }).limit(5),
    ]);
    const counts = (rows: any[]) =>
      Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const monitoredInterviews = await InterviewModel.find(scope).select("_id");
    const eventCounts = await MonitoringModel.aggregate([
      {$match: {interviewId: {$in: monitoredInterviews.map(i => i.id)}}},
      {$group: {_id: {$ifNull: ["$review.status", "pending"]}, count: {$sum: 1}}},
    ]);
    res.json({
      company,
      jobs: counts(jobCounts),
      applications: counts(stages),
      interviews: counts(interviewCounts),
      hrCount,
      recentApplications,
      recentJobs,
      proctoringReviews: counts(eventCounts),
    });
  });
  app.get("/api/company/interviewers", permit("company"), async (req, res) => {
    const companyId = req.user.companyId;
    const [members, jobs, interviews] = await Promise.all([
      UserModel.find({ companyId, role: "hr" }).select(
        "name email profile role",
      ),
      JobModel.aggregate([
        {
          $match: {
            companyId,
            status: { $ne: "closed" },
          },
        },
        { $unwind: "$hrRequests" },
        { $match: { "hrRequests.status": "accepted" } },
        { $group: { _id: "$hrRequests.hrId", count: { $sum: 1 } } },
      ]),
      InterviewModel.aggregate([
        { $match: { companyId } },
        {
          $group: {
            _id: { interviewerId: "$interviewerId", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    res.json(
      members.map((m) => ({
        ...m.toObject(),
        assignedJobs: jobs.find((j) => j._id === m.id)?.count || 0,
        upcomingInterviews: interviews
          .filter(
            (i) =>
              i._id.interviewerId === m.id &&
              ["scheduled", "live"].includes(i._id.status),
          )
          .reduce((a, b) => a + b.count, 0),
        completedInterviews:
          interviews.find(
            (i) => i._id.interviewerId === m.id && i._id.status === "completed",
          )?.count || 0,
      })),
    );
  });
  app.patch("/api/hr/availability", permit("hr"), async (req, res) => {
    const input = z
      .object({
        availability: z.enum(["available", "busy", "unavailable"]),
        availabilityNote: z.string().trim().max(500),
      })
      .parse(req.body);
    await UserModel.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "profile.availability": input.availability,
          "profile.availabilityNote": input.availabilityNote,
        },
      },
    );
    res.json({ ok: true });
  });
}
