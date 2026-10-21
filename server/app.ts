import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { z } from "zod";
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  installPrivatePreviewGate,
  privatePreviewConfigured,
  decoratePrivatePreviewHtml,
  previewAllowsCompany,
} from "./private-preview.js";
import PDFDocument from "pdfkit";
import { monitoringKinds } from "../shared/monitoring.js";
import { codingLanguageKeys } from "../shared/languages.js";
import { iceConfiguration } from "./ice.js";
import { registerInterviewRoom } from "./interview-room.js";
import { admitted, roomChanged, humanRoom } from "./room-events.js";
import {
  config,
  serviceStatus,
  allowedOrigins,
  localCompanyRegistrationEnabled,
} from "./config.js";
import {
  UserModel,
  CompanyModel,
  SessionModel,
  InvitationModel,
  ResumeModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  SubmissionModel,
  CodeRevisionModel,
  MonitoringModel,
  ReportModel,
  NotificationModel,
} from "./models.js";
import {
  ApiError,
  authenticate,
  permit,
  publicUser,
  newSession,
  hashToken,
  objectId,
  jobScope,
  accessibleJob,
  accessibleInterview,
  mustManageInterview,
  mustAttendInterview,
  requireLive,
  localCompanyAccessAllowed,
} from "./security.js";
import { type User, type ApplicationState } from "../shared/types.js";
import { emptyAiMatch, screeningJob } from "./screening.js";
import { resumeFields, resumeTextFields } from "../shared/resume.js";
import {
  applicationInputSchema,
  resumeMaxBytes,
} from "../shared/application.js";
import { extractResumeDetailed } from "./resume.js";
import { publicProblems, problems, curatedQuestions } from "./problems.js";
import {
  generateQuestions,
  assessAnswer,
  transcribeAudio,
  executeCode,
  executionLanguages,
} from "./providers.js";

import { auditRequests, registerGovernanceRoutes } from "./governance.js";
import { rateStore, redis } from "./scaling.js";
import { registerAccountRoutes } from "./accounts.js";
import { registerProctoringReview } from "./proctoring-review.js";
import {
  registerCodingRoutes,
  resolveProblem,
  interviewProblem,
} from "./coding.js";
import { nextRound, assertLatestReport } from "./rounds.js";
import { analyzeIntegrity } from "./integrity.js";
import { generateAssessment, evidenceHash, codingScore } from "./assessment.js";
import { registerAuthRoutes } from "./onboarding.js";
import { registerCompanyRoutes, assertPublishable } from "./company.js";

import {
  registerRecruitmentRoutes,
  withJobWorkflow,
  assignShortlistedWithinWorkflow,
} from "./recruitment.js";
import { registerInterviewBatches } from "./interview-batches.js";
import { registerAiInterview } from "./ai-interview.js";
import { registerMedia, reviewedTranscript } from "./media.js";
import { registerAdvancedProctoring } from "./advanced-proctoring.js";
import { registerSimilarity } from "./similarity.js";
import { withResources } from "./locks.js";
import { assertSlot } from "./calendar.js";
import {
  assertFeedbackEditable,
  updateInterviewFeedback,
} from "./report-state.js";

const text = (max = 2000) => z.string().trim().max(max);
const list = z.array(text(100).min(1)).max(30);
const profileSchema = z.object({
  ...resumeFields,
  name: text(100).min(2),
  phone: text(40),
  location: text(150),
  headline: text(200),
  education: text(4000),
  skills: list,
  experience: text(6000),
  projects: text(6000),
  certifications: text(4000),
  expertise: text(2000),
  preferredRoles: list.default([]),
  experienceYears: z.number().min(0).max(80).nullable().optional(),
});
const jobSchema = z
  .object({
    title: text(150).min(3),
    description: text(12000).min(20),
    skills: list.min(1),
    experience: text(200),
    difficulty: z
      .enum(["Beginner", "Intermediate", "Advanced"])
      .default("Intermediate"),
    location: text(200).min(1),
    employment: z.enum(["Full-time", "Part-time", "Internship", "Contract"]),
    criteria: text(4000),
    interviewInstructions: z
      .object({
        type: z.enum(["technical", "behavioral"]).default("technical"),
        skills: list.default([]),
        topics: list.default([]),
        criteria: text(4000).default(""),
        duration: z.number().int().min(10).max(180).default(45),
        special: text(6000).default(""),
      })
      .default({
        type: "technical",
        skills: [],
        topics: [],
        criteria: "",
        duration: 45,
        special: "",
      }),
    role: text(150).default(""),
    department: text(100).default(""),
    preferredSkills: list.default([]),
    education: text(2000).default(""),
    shortlistThreshold: z.number().int().min(1).max(100).default(80),
    workMode: z.enum(["Remote", "Hybrid", "On-site"]).default("On-site"),
    salaryMin: z.number().min(0).max(1e10).nullable().optional(),
    salaryMax: z.number().min(0).max(1e10).nullable().optional(),
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("INR"),
    openings: z.number().int().min(1).max(10000).default(1),
    deadline: z.iso.datetime({ offset: true }).nullable().optional(),
    rounds: list.max(12).default([]),
    additionalRequirements: text(4000).default(""),
    status: z.enum(["draft", "published", "closed"]),
  })
  .refine(
    (v) =>
      v.salaryMin == null || v.salaryMax == null || v.salaryMax >= v.salaryMin,
    {
      message: "Maximum salary must be at least the minimum salary",
      path: ["salaryMax"],
    },
  );
const scheduleSchema = z.object({
  scheduledAt: z.iso.datetime({ offset: true }),
  timezone: text(100).refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA timezone"),
  duration: z.number().int().min(10).max(180),
  type: z.enum(["technical", "behavioral"]),
  topics: list.min(1),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  problemId: z.string().min(1).max(100),
  interviewerId: objectId,
  facilitator: z.enum(["human", "ai"]).default("human"),
  mode: z.enum(["video", "in_person"]).default("video"),
  venue: text(500).default(""),
});
function validateInterviewMode(input: z.infer<typeof scheduleSchema>) {
  if (input.mode === "in_person" && input.venue.length < 5)
    throw new ApiError(
      400,
      "Enter the address or meeting location for the in-person interview.",
    );
  if (input.mode === "in_person" && input.facilitator !== "human")
    throw new ApiError(
      400,
      "In-person interviews must be conducted by an HR interviewer.",
    );
  if (input.mode === "video") input.venue = "";
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: resumeMaxBytes, files: 1 },
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});
const notify = async (userId: string, message: string, href: string) =>
  NotificationModel.create({ userId, message, href });
async function checkAssignee(companyId: string, hrId?: string | null) {
  if (!hrId) return;
  const hr = await UserModel.findOne({
    _id: hrId,
    companyId,
    role: "hr",
  });
  if (!hr)
    throw new ApiError(400, "Choose an authorized member of your company.");
  if (hr.profile?.availability === "unavailable")
    throw new ApiError(409, "This interviewer is unavailable.");
}
async function scopedApplication(user: User, id: string) {
  objectId.parse(id);
  const record = await ApplicationModel.findOne({
    _id: id,
    ...(user.role === "hr"
      ? { assignedHrId: user._id, companyId: user.companyId || "__none" }
      : {}),
  });
  if (!record) throw new ApiError(404, "Application not found.");
  if (user.role === "candidate") {
    if (record.candidateId !== user._id)
      throw new ApiError(404, "Application not found.");
  } else {
    await accessibleJob(user, record.jobId);
  }
  return record;
}
async function applicationJob(user: User, jobId: string) {
  const job = await JobModel.findOne({ _id: jobId, status: "published" });
  if (!job) throw new ApiError(404, "This job is not accepting applications.");
  if (!(await localCompanyAccessAllowed({ companyId: job.companyId })))
    throw new ApiError(
      403,
      "This local development company is disabled in this environment.",
    );
  if (job.deadline && job.deadline.getTime() <= Date.now())
    throw new ApiError(409, "The application deadline has passed.");
  if (await ApplicationModel.exists({ jobId, candidateId: user._id }))
    throw new ApiError(
      409,
      "You have already applied for this job. Track it in Applications.",
    );
  return job;
}
async function interviewView(interview: any, user: User) {
  const result = interview.toObject({ flattenMaps: true });
  result.objectConsent = !!interview.objectConsentWindows?.some(
    (window: any) => !window.revokedAt,
  );
  delete result.problemSnapshot;
  delete result.aiBusyToken;
  delete result.aiBusyUntil;
  // Room documents and control state are available only through the participant-only room API.
  for (const key of [
    "roomResumeId",
    "resumeSharedAt",
    "waitingAt",
    "admittedAt",
    "roomInstruction",
    "cameraAccommodation",
    "screenRequired",
    "entireScreen",
    "codingPrompt",
    "codingSentAt",
    "faceConsentWindows",
    "objectConsentWindows",
  ])
    delete result[key];
  if (user.role === "candidate" && interview.type !== "practice") {
    delete result.notes;
    result.answers = result.answers.map((a: any) => ({
      questionId: a.questionId,
      text: a.text,
      mode: a.mode,
      transcriptionReviewed: a.transcriptionReviewed,
      createdAt: a.createdAt,
    }));
  }
  if (user.role === "hr" && interview.interviewerId !== user._id) {
    delete result.notes;
    result.answers = [];
    result.drafts = {};
  }
  return result;
}
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.production) app.set("trust proxy", 1);
  app.use(
    helmet({
      // Native same-origin form POSTs need their real Origin for the preview
      // gate. Helmet's no-referrer default makes that Origin "null".
      referrerPolicy: { policy: "same-origin" },
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
              workerSrc: ["'self'", "blob:"],
              connectSrc: [
                "'self'",
                "https:",
                new URL(config.origin).origin.replace(/^http/, "ws"),
              ],
              imgSrc: ["'self'", "data:"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              mediaSrc: ["'self'", "blob:"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  installPrivatePreviewGate(app);
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(auditRequests);
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (
        (origin && !allowedOrigins.has(origin)) ||
        req.get("sec-fetch-site") === "cross-site"
      )
        throw new ApiError(403, "Request origin is not allowed.");
      if (config.production && !origin)
        throw new ApiError(403, "An origin header is required.");
    }
    next();
  });
  // A health probe must remain usable when the shared rate-limit store is
  // reconnecting. It reports dependency readiness without touching that store.
  app.get("/api/health", (_req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    const scalingReady = !config.redisUrl || !!redis?.isReady;
    res.status(databaseReady && scalingReady ? 200 : 503).json({
      status: !databaseReady
        ? "database unavailable"
        : scalingReady
          ? "ready"
          : "shared services unavailable",
    });
  });
  app.use(
    "/api",
    rateLimit({
      store: rateStore("global"),
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: { message: "Too many requests. Please wait a minute." },
      },
    }),
  );
  const authLimit = rateLimit({
    store: rateStore("auth"),
    windowMs: 15 * 60000,
    limit: 35,
    skipSuccessfulRequests: true,
    message: {
      error: { message: "Too many login attempts. Try again in 15 minutes." },
    },
  });
  const providerLimit = rateLimit({
    store: rateStore("providers"),
    windowMs: 60000,
    limit: 12,
    keyGenerator: (req) => req.user._id,
    message: {
      error: {
        message: "Please wait before making another assessment request.",
      },
    },
  });
  registerAuthRoutes(app, authLimit);
  registerAccountRoutes(app, authLimit);
  app.post("/api/auth/logout", async (req, res) => {
    if (req.cookies.hirelens_session)
      await SessionModel.deleteOne({
        tokenHash: hashToken(req.cookies.hirelens_session),
      });
    res.clearCookie("hirelens_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.production,
    });
    res.json({ ok: true });
  });
  app.use("/api", authenticate);
  app.get("/api/auth/me", (req, res) => res.json({ user: req.user }));
  app.get("/api/services", (_req, res) => res.json(serviceStatus()));
  registerCodingRoutes(app);
  registerInterviewRoom(app);
  registerGovernanceRoutes(app);
  registerProctoringReview(app, providerLimit);
  app.get("/api/languages", providerLimit, async (_req, res) =>
    res.json(await executionLanguages()),
  );
  app.patch("/api/profile", async (req, res) => {
    const { name, ...profile } = profileSchema.parse(req.body);
    Object.assign(profile, resumeTextFields(profile));
    const user = await UserModel.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          name,
          ...Object.fromEntries(
            Object.entries(profile).map(([k, v]) => [`profile.${k}`, v]),
          ),
        },
      },
      { returnDocument: "after" },
    );
    res.json({ user: publicUser(user) });
  });
  app.post(
    "/api/profile/resume",
    permit("candidate"),
    upload.single("resume"),
    async (req, res) => {
      if (!req.file) throw new ApiError(400, "Select a PDF resume.");
      const extraction = await extractResumeDetailed(req.file.buffer);
      const content = extraction.text;
      const resume = await ResumeModel.create({
        ownerId: req.user._id,
        name: req.file.originalname
          .replace(/[^a-zA-Z0-9 ._-]/g, "")
          .slice(0, 150),
        data: req.file.buffer,
        text: content,
      });
      await UserModel.updateOne(
        { _id: req.user._id },
        { $set: { "profile.resumeId": resume._id.toString() } },
      );
      res.status(201).json({
        resumeId: resume._id,
        name: resume.name,
        characters: content.length,
        extractionMethod: extraction.method,
      });
    },
  );
  app.get("/api/resumes/:id", async (req, res) => {
    const id = objectId.parse(req.params.id);
    const resume = await ResumeModel.findById(id).select("+data");
    if (!resume) throw new ApiError(404, "Resume not found.");
    if (resume.ownerId !== req.user._id) {
      const jobIds = (
        await JobModel.find(await jobScope(req.user)).select("_id")
      ).map((j) => j._id.toString());
      const application = await ApplicationModel.exists({
        resumeId: id,
        jobId: { $in: jobIds },
        ...(req.user.role === "hr"
          ? {
              assignedHrId: req.user._id,
              companyId: req.user.companyId || "__none",
            }
          : {}),
      });
      if (!application) throw new ApiError(404, "Resume not found.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="resume.pdf"');
    res.send(resume.data);
  });
  registerCompanyRoutes(app);
  registerRecruitmentRoutes(app);
  registerInterviewBatches(app);
  registerAiInterview(app, providerLimit);
  registerMedia(app, providerLimit);
  registerAdvancedProctoring(app, providerLimit);
  registerSimilarity(app);
  app.get("/api/invitations", permit("company", "hr"), async (req, res) =>
    res.json(
      await InvitationModel.find(
        req.user.role === "company"
          ? { companyId: req.user.companyId }
          : { email: req.user.email },
      ).sort({ createdAt: -1 }),
    ),
  );
  app.post("/api/invitations", permit("company"), async (req, res) => {
    const { email } = z
      .object({ email: z.email().transform((v) => v.toLowerCase()) })
      .parse(req.body);
    const hr = await UserModel.findOne({ email, role: "hr" });
    if (hr?.companyId && hr.companyId !== req.user.companyId)
      throw new ApiError(
        409,
        "This HR manager already belongs to another company.",
      );
    const company = await CompanyModel.findById(req.user.companyId);
    const invitation = await InvitationModel.findOneAndUpdate(
      { companyId: req.user.companyId, email },
      { $set: { companyName: company?.name, status: "pending" } },
      { upsert: true, returnDocument: "after" },
    );
    if (hr)
      await notify(
        hr._id.toString(),
        `${company?.name} invited you to its hiring team.`,
        "/team",
      );
    res.status(201).json(invitation);
  });
  app.patch("/api/invitations/:id", permit("hr"), async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["accepted", "rejected"]) })
      .parse(req.body);
    const invitation = await InvitationModel.findOne({
      _id: objectId.parse(req.params.id),
      email: req.user.email,
      status: "pending",
    });
    if (!invitation) throw new ApiError(404, "Pending invitation not found.");
    if (status === "accepted") {
      if (
        !(await localCompanyAccessAllowed({ companyId: invitation.companyId }))
      )
        throw new ApiError(
          403,
          "This local development company is disabled in this environment.",
        );
      const updated = await UserModel.findOneAndUpdate(
        {
          _id: req.user._id,
          $or: [
            { companyId: { $exists: false } },
            { companyId: invitation.companyId },
          ],
        },
        { $set: { companyId: invitation.companyId } },
        { returnDocument: "after" },
      );
      if (!updated)
        throw new ApiError(409, "You already belong to another company.");
    }
    invitation.status = status;
    await invitation.save();
    res.json(invitation);
  });
  app.get("/api/jobs", async (req, res) => {
    const candidateCompanyScope =
      req.user.role === "candidate" && !localCompanyRegistrationEnabled()
        ? {
            companyId: {
              $nin: (
                await CompanyModel.distinct("_id", { localDevelopment: true })
              )
                .map(String)
                .filter((id) => !previewAllowsCompany(id)),
            },
          }
        : {};
    const scope =
      req.user.role === "candidate"
        ? { status: "published" as const, ...candidateCompanyScope }
        : await jobScope(req.user);
    const jobs = await JobModel.find(scope).sort({ createdAt: -1 }).limit(200);
    const search = String(req.query.q || "").toLowerCase();
    res.json(
      jobs
        .filter((j) =>
          `${j.title} ${j.companyName} ${j.location} ${j.skills.join(" ")}`
            .toLowerCase()
            .includes(search),
        )
        .map((j) => {
          const result: any = j.toObject();
          if (req.user.role === "candidate") {
            delete result.hrRequests;
            delete result.interviewInstructions;
            delete result.requiredHrCount;
          }
          if (req.user.role === "hr")
            result.hrRequests = result.hrRequests.filter(
              (r: any) => r.hrId === req.user._id,
            );
          return result;
        }),
    );
  });
  app.post("/api/jobs", permit("company"), async (req, res) => {
    const input = jobSchema.parse(req.body);
    const company = await CompanyModel.findById(req.user.companyId);
    if (input.status === "published") {
      await assertPublishable(req.user.companyId!);
      if (input.deadline && new Date(input.deadline).getTime() <= Date.now())
        throw new ApiError(400, "Choose a future application deadline.");
    }
    const job = new JobModel({
      ...input,
      companyId: req.user.companyId,
      companyName: company?.name,
    });
    await job.save();
    res.status(201).json(job);
  });
  app.patch("/api/jobs/:id", permit("company"), async (req, res) => {
    const id = objectId.parse(req.params.id);
    await accessibleJob(req.user, id);
    await withJobWorkflow(id, async () => {
      const job = await accessibleJob(req.user, objectId.parse(req.params.id));
      const input = jobSchema.parse({
        ...job.toObject(),
        deadline: job.deadline?.toISOString() || null,
        ...req.body,
      });
      if (input.status === "published") {
        await assertPublishable(req.user.companyId!);
        if (input.deadline && new Date(input.deadline).getTime() <= Date.now())
          throw new ApiError(400, "Choose a future application deadline.");
      }
      Object.assign(job, input);
      await job.save();
      res.json(job);
    });
  });
  app.post(
    "/api/jobs/:id/application-resume",
    permit("candidate"),
    providerLimit,
    upload.single("resume"),
    async (req, res) => {
      const jobId = objectId.parse(req.params.id);
      await applicationJob(req.user, jobId);
      if (!req.file) throw new ApiError(400, "Select a PDF resume.");
      if (
        !/\.pdf$/i.test(req.file.originalname) ||
        req.file.mimetype !== "application/pdf"
      )
        throw new ApiError(400, "Upload a PDF file, up to 5 MB.");
      const extraction = await extractResumeDetailed(req.file.buffer);
      const resume = await ResumeModel.create({
        ownerId: req.user._id,
        applicationJobId: jobId,
        name: req.file.originalname
          .replace(/[^a-zA-Z0-9 ._-]/g, "")
          .slice(0, 150),
        data: req.file.buffer,
        text: extraction.text,
      });
      res
        .status(201)
        .json({
          resumeId: resume.id,
          name: resume.name,
          characters: extraction.text.length,
        });
    },
  );
  app.post("/api/jobs/:id/apply", permit("candidate"), async (req, res) => {
    const jobId = objectId.parse(req.params.id);
    await withJobWorkflow(jobId, async () => {
      const job = await applicationJob(req.user, jobId);
      const input = applicationInputSchema.parse(req.body);
      const resume = await ResumeModel.findOne({
        _id: input.resumeId,
        ownerId: req.user._id,
        $or: [
          { applicationJobId: { $exists: false } },
          { applicationJobId: jobId },
        ],
      });
      if (!resume)
        throw new ApiError(
          400,
          "Choose your own saved resume or upload a PDF for this job.",
        );
      // Only the reviewed form is evidence. Neither the profile nor account identity is changed.
      const snapshot = {
        phone: input.phone,
        location: input.city + ", " + input.state,
        education: input.education,
        skills: input.skills,
        experience: input.experience,
        experienceYears: input.experienceYears,
        projects: input.projects,
        certifications: input.certifications,
        achievements: input.achievements,
        additionalInformation: input.additionalInformation,
        headline: "",
        expertise: "",
        resumeId: resume.id,
      };
      const application = await ApplicationModel.create({
        jobId,
        companyId: job.companyId,
        companyName: job.companyName,
        jobTitle: job.title,
        candidateId: req.user._id,
        candidateName: input.name,
        contactEmail: input.email,
        city: input.city,
        state: input.state,
        submittedAt: new Date(),
        resumeId: resume.id,
        resumeName: resume.name,
        snapshot,
        match: emptyAiMatch(),
        screening: {
          state: "queued",
          threshold: job.shortlistThreshold || 80,
          attempts: 0,
          message:
            "Application received. AI screening will compare this submitted resume and reviewed details with the job requirements.",
        },
        screeningJob: screeningJob(job),
        screeningNextAttempt: new Date(),
      });
      const company = await CompanyModel.findById(job.companyId);
      if (company)
        await notify(
          company.ownerId,
          input.name + " applied for " + job.title + ".",
          "/applications",
        );
      const publicApplication = application.toObject();
      delete publicApplication.screeningJob;
      delete publicApplication.screeningNextAttempt;
      res.status(201).json(publicApplication);
    });
  });
  app.post(
    "/api/applications/:id/screening/retry",
    providerLimit,
    async (req, res) => {
      const id = objectId.parse(req.params.id);
      const initial =
        req.user.role === "candidate"
          ? await ApplicationModel.findOne({
              _id: id,
              candidateId: req.user._id,
            })
          : await scopedApplication(req.user, id);
      if (!initial) throw new ApiError(404, "Application not found.");
      await withJobWorkflow(initial.jobId, async () => {
        const current =
          await ApplicationModel.findById(id).select("+screeningJob");
        if (
          !current ||
          !["Applied", "Under Review"].includes(current.status) ||
          current.assignedHrId ||
          (await InterviewModel.exists({
            applicationId: id,
            status: { $ne: "cancelled" },
          }))
        )
          throw new ApiError(
            409,
            "Screening cannot replace an application already in the interview process.",
          );
        if (current.screening && current.screening.state !== "failed")
          throw new ApiError(
            409,
            "Screening is already queued, running, or completed.",
          );
        const job = await JobModel.findById(current.jobId);
        if (!job) throw new ApiError(404, "Job not found.");
        current.set("screeningJob", current.screeningJob || screeningJob(job));
        current.set("screening", {
          state: "queued",
          threshold: current.screeningJob.shortlistThreshold || 80,
          attempts: 0,
          message: "AI screening is queued.",
        });
        current.set("screeningNextAttempt", new Date());
        current.set("match", emptyAiMatch());
        await current.save();
      });
      res.json(await ApplicationModel.findById(id));
    },
  );
  app.get("/api/applications", async (req, res) => {
    const scope =
      req.user.role === "candidate"
        ? { candidateId: req.user._id }
        : {
            jobId: {
              $in: (
                await JobModel.find(await jobScope(req.user)).select("_id")
              ).map((j) => j._id.toString()),
            },
          };
    if (req.query.jobId && req.user.role !== "candidate")
      await accessibleJob(req.user, objectId.parse(req.query.jobId));
    res.json(
      await ApplicationModel.find({
        ...scope,
        ...(req.user.role === "hr"
          ? {
              assignedHrId: req.user._id,
              companyId: req.user.companyId || "__none",
            }
          : {}),
        ...(req.query.jobId ? { jobId: objectId.parse(req.query.jobId) } : {}),
      }).sort({ createdAt: -1 }),
    );
  });
  app.patch(
    "/api/applications/:id/status",
    permit("company", "hr"),
    async (req, res) => {
      const initial = await scopedApplication(
        req.user,
        objectId.parse(req.params.id),
      );
      await withJobWorkflow(initial.jobId, async () => {
        const application = await scopedApplication(
          req.user,
          objectId.parse(req.params.id),
        );
        if (
          req.user.role === "hr" &&
          application.assignedHrId &&
          application.assignedHrId !== req.user._id
        )
          throw new ApiError(
            409,
            "Another interviewer is handling this candidate. Ask the company to reassign them first.",
          );
        const { status } = z
          .object({
            status: z.enum(["Under Review", "Shortlisted", "Rejected"]),
          })
          .parse(req.body);
        const transitions: Partial<Record<ApplicationState, string[]>> = {
          Applied: ["Under Review", "Shortlisted", "Rejected"],
          "Under Review": ["Shortlisted", "Rejected"],
          Shortlisted: ["Under Review", "Rejected"],
        };
        if (
          application.status === "Rejected" &&
          application.screening?.outcome === "not_shortlisted" &&
          !(await InterviewModel.exists({ applicationId: application.id }))
        )
          transitions.Rejected = ["Under Review", "Shortlisted"];
        if (
          !transitions[application.status as ApplicationState]?.includes(status)
        )
          throw new ApiError(
            409,
            "This status change is not allowed. Use the interview report for a final decision.",
          );
        const stopScreening =
          application.screening &&
          ["queued", "processing"].includes(application.screening.state)
            ? {
                "screening.state": "failed",
                "screening.message":
                  "AI screening stopped after a reviewer changed the application stage.",
              }
            : {};
        const updated = await ApplicationModel.findOneAndUpdate(
          { _id: application._id, status: application.status },
          {
            $set: { status, ...stopScreening },
            $unset: {
              assignedHrId: 1,
              assignedHrName: 1,
              assignedAt: 1,
              assignmentPendingReason: 1,
              assignmentPendingAt: 1,
              screeningLease: 1,
              screeningLeaseUntil: 1,
            },
          },
          { returnDocument: "after" },
        );
        if (!updated)
          throw new ApiError(409, "The application changed. Please refresh.");
        if (status === "Shortlisted")
          await assignShortlistedWithinWorkflow(application.jobId);
        const result = await ApplicationModel.findById(application.id);
        await notify(
          application.candidateId,
          `Your application for ${application.jobTitle} is now ${status}.`,
          "/applications",
        );
        if (
          application.assignedHrId &&
          application.assignedHrId !== result?.assignedHrId
        )
          await notify(
            application.assignedHrId,
            `${application.candidateName} was removed from your assigned candidates for ${application.jobTitle}.`,
            "/applications",
          );
        res.json(result);
      });
    },
  );
  app.get("/api/interviews", async (req, res) => {
    const assignedApplications =
      req.user.role === "hr"
        ? await ApplicationModel.find({
            assignedHrId: req.user._id,
            jobId: {
              $in: (
                await JobModel.find(await jobScope(req.user)).select("_id")
              ).map((j) => j.id),
            },
          }).select("_id")
        : [];
    const scope =
      req.user.role === "candidate"
        ? { candidateId: req.user._id }
        : req.user.role === "company"
          ? { companyId: req.user.companyId || "__none" }
          : {
              interviewerId: req.user._id,
              companyId: req.user.companyId || "__none",
              $or: [
                {
                  applicationId: { $in: assignedApplications.map((a) => a.id) },
                },
                { status: { $in: ["completed", "cancelled"] as const } },
              ],
            };
    const rows = await InterviewModel.find(scope)
      .sort({ scheduledAt: 1 })
      .limit(200);
    res.json(await Promise.all(rows.map((i) => interviewView(i, req.user))));
  });
  app.get("/api/applications/:id/rounds", async (req, res) => {
    const application = await scopedApplication(
      req.user,
      objectId.parse(req.params.id),
    );
    const rows = await InterviewModel.find({
      applicationId: application.id,
    }).sort({ roundIndex: 1, createdAt: 1 });
    const reports = await ReportModel.find({
      interviewId: { $in: rows.map((i) => i.id) },
      ...(req.user.role === "candidate" ? { released: true } : {}),
    });
    let next: Awaited<ReturnType<typeof nextRound>> | undefined,
      reason = "";
    if (
      req.user.role === "hr" &&
      (!application.assignedHrId || application.assignedHrId === req.user._id)
    ) {
      try {
        next = await nextRound(application);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        reason = e.message;
      }
    }
    res.json({
      interviews: await Promise.all(
        rows.map(async (i) => ({
          ...(await interviewView(i, req.user)),
          report:
            req.user.role === "hr" && i.interviewerId !== req.user._id
              ? undefined
              : reports.find((r) => r.interviewId === i.id),
        })),
      ),
      canSchedule: !!next,
      nextRoundName: next?.roundName,
      reason,
    });
  });
  app.post("/api/interviews", permit("hr"), async (req, res) => {
    const { applicationId, ...input } = scheduleSchema
      .extend({ applicationId: objectId })
      .parse(req.body);
    validateInterviewMode(input);
    const initial = await scopedApplication(req.user, applicationId);
    await withResources(
      [`calendar:${req.user._id}`, `calendar:${initial.candidateId}`],
      () =>
        withJobWorkflow(initial.jobId, async () => {
          const application = await scopedApplication(req.user, applicationId);
          if (application.assignedHrId !== req.user._id)
            throw new ApiError(
              409,
              "This candidate must be assigned to you before you can schedule an interview.",
            );
          const round = await nextRound(application);
          const problemSnapshot = await resolveProblem(
            input.problemId,
            application.companyId,
          );
          await checkAssignee(application.companyId, input.interviewerId);
          if (req.user.role === "hr" && input.interviewerId !== req.user._id)
            throw new ApiError(
              403,
              "HR can schedule only their own interviews.",
            );
          if (new Date(input.scheduledAt).getTime() < Date.now() - 60000)
            throw new ApiError(400, "Choose a future interview time.");
          await assertSlot(
            req.user._id,
            application.candidateId,
            new Date(input.scheduledAt),
            input.duration,
          );
          const reserved = await ApplicationModel.findOneAndUpdate(
            {
              _id: applicationId,
              status: application.status,
              ...(application.assignedHrId
                ? { assignedHrId: req.user._id }
                : { assignedHrId: { $exists: false } }),
            },
            {
              $set: {
                status: "Interview Scheduled",
                assignedHrId: req.user._id,
                assignedAt: new Date(),
              },
            },
          );
          if (!reserved)
            throw new ApiError(
              409,
              "This candidate already has a scheduled interview.",
            );
          let interview;
          try {
            interview = await InterviewModel.create({
              ...input,
              ...round,
              problemSnapshot,
              applicationId,
              companyId: application.companyId,
              candidateId: application.candidateId,
              candidateName: application.candidateName,
              jobTitle: application.jobTitle,
              companyName: application.companyName,
              questions:
                input.facilitator === "ai"
                  ? []
                  : curatedQuestions(input.topics),
            });
          } catch (error) {
            await ApplicationModel.updateOne(
              { _id: applicationId, status: "Interview Scheduled" },
              { $set: { status: application.status } },
            );
            throw error;
          }
          await notify(
            application.candidateId,
            `Your ${application.jobTitle} interview has been scheduled.`,
            "/interviews",
          );
          res.status(201).json(await interviewView(interview, req.user));
        }),
    );
  });
  app.post("/api/practice", permit("candidate"), async (req, res) => {
    const input = z
      .object({
        jobTitle: text(150).min(3),
        topics: list.min(1),
        difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
        duration: z.number().int().min(10).max(90),
        problemId: z.string().refine((v) => !!problems[v]),
        facilitator: z.enum(["human", "ai"]).default("human"),
      })
      .parse(req.body);
    res.status(201).json(
      await InterviewModel.create({
        ...input,
        candidateId: req.user._id,
        interviewerId: req.user._id,
        candidateName: req.user.name,
        companyName: "Personal practice",
        scheduledAt: new Date(),
        timezone: "Asia/Kolkata",
        type: "practice",
        questions:
          input.facilitator === "ai" ? [] : curatedQuestions(input.topics),
      }),
    );
  });
  app.get("/api/interviews/:id", async (req, res) =>
    res.json(
      await interviewView(
        await accessibleInterview(req.user, objectId.parse(req.params.id)),
        req.user,
      ),
    ),
  );
  app.patch("/api/interviews/:id/schedule", permit("hr"), async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustManageInterview(req.user, interview);
    if (interview.status !== "scheduled")
      throw new ApiError(409, "Only a scheduled interview can be changed.");
    const input = scheduleSchema.parse(req.body);
    validateInterviewMode(input);
    await checkAssignee(interview.companyId!, input.interviewerId);
    if (req.user.role === "hr" && input.interviewerId !== req.user._id)
      throw new ApiError(403, "HR can schedule only their own interviews.");
    if (new Date(input.scheduledAt).getTime() < Date.now())
      throw new ApiError(400, "Choose a future date.");
    await withResources(
      [
        `calendar:${interview.interviewerId}`,
        `calendar:${interview.candidateId}`,
      ],
      async () => {
        await assertSlot(
          req.user._id,
          interview.candidateId,
          new Date(input.scheduledAt),
          input.duration,
          interview.id,
        );
        const problemSnapshot =
          input.problemId !== interview.problemId
            ? await resolveProblem(
                input.problemId,
                interview.companyId || undefined,
              )
            : undefined;
        if (
          input.facilitator !== interview.facilitator &&
          !interview.answers.length
        ) {
          interview.questions.splice(0);
          if (input.facilitator !== "ai")
            interview.questions.push(...curatedQuestions(input.topics));
          interview.aiPlan = [];
        }
        Object.assign(
          interview,
          input,
          problemSnapshot ? { problemSnapshot } : {},
        );
        const saved = await InterviewModel.updateOne(
          {
            _id: interview.id,
            status: "scheduled",
            updatedAt: interview.updatedAt,
          },
          {
            $set: {
              ...input,
              ...(problemSnapshot ? { problemSnapshot } : {}),
              questions: interview.questions,
              aiPlan: interview.aiPlan,
            },
          },
        );
        if (!saved.matchedCount)
          throw new ApiError(
            409,
            "The interview changed. Refresh before rescheduling.",
          );
        await notify(
          interview.candidateId,
          "Your interview schedule has changed.",
          "/interviews",
        );
        res.json(await interviewView(interview, req.user));
      },
    );
  });
  app.post("/api/interviews/:id/cancel", permit("hr"), async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustManageInterview(req.user, interview);
    const cancelled = await InterviewModel.findOneAndUpdate(
      { _id: interview._id, status: "scheduled" },
      { $set: { status: "cancelled" } },
      { returnDocument: "after" },
    );
    if (!cancelled)
      throw new ApiError(409, "Only a scheduled interview can be cancelled.");
    await ApplicationModel.updateOne(
      { _id: interview.applicationId, status: "Interview Scheduled" },
      { $set: { status: "Shortlisted" } },
    );
    await notify(
      interview.candidateId,
      "Your interview was cancelled. The hiring team will follow up.",
      "/interviews",
    );
    res.json(await interviewView(cancelled, req.user));
  });
  app.post(
    "/api/interviews/:id/consent",
    permit("candidate"),
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      z.object({ accepted: z.literal(true) }).parse(req.body);
      if (interview.mode === "in_person")
        throw new ApiError(
          409,
          "Online monitoring is not enabled for an in-person appointment.",
        );
      if (["completed", "cancelled"].includes(interview.status))
        throw new ApiError(409, "This session has ended.");
      interview.consentAt = new Date();
      await interview.save();
      res.json({ ok: true });
    },
  );
  app.post("/api/interviews/:id/start", async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustAttendInterview(req.user, interview);
    if (interview.mode === "in_person") {
      await mustManageInterview(req.user, interview);
      if (!["scheduled", "live"].includes(interview.status))
        throw new ApiError(409, "This session has ended.");
      if (+interview.scheduledAt - Date.now() > 15 * 60000)
        throw new ApiError(
          409,
          "The interview opens 15 minutes before its scheduled time.",
        );
      const started = await InterviewModel.findOneAndUpdate(
        { _id: interview.id, status: "scheduled" },
        { $set: { status: "live", startedAt: new Date() } },
        { returnDocument: "after" },
      );
      roomChanged(interview.id, "started");
      res.json(await interviewView(started || interview, req.user));
      return;
    }
    if (req.user.role === "candidate" && !admitted(interview))
      throw new ApiError(403, "Wait for the interviewer to admit you.");
    if (
      ![interview.candidateId, interview.interviewerId].includes(req.user._id)
    )
      throw new ApiError(
        403,
        "Only the candidate and assigned interviewer can join this room.",
      );
    if (!["scheduled", "live"].includes(interview.status))
      throw new ApiError(409, "This session has ended.");
    if (
      req.user.role === "candidate" &&
      interview.type !== "practice" &&
      !interview.consentAt
    )
      throw new ApiError(
        403,
        "Review and accept the monitoring notice before joining.",
      );
    if (
      interview.type !== "practice" &&
      new Date(interview.scheduledAt).getTime() - Date.now() > 15 * 60000
    )
      throw new ApiError(
        409,
        "The room opens 15 minutes before the scheduled time.",
      );
    await InterviewModel.updateOne(
      { _id: interview._id, status: "scheduled" },
      { $set: { status: "live", startedAt: new Date() } },
    );
    res.json(
      await interviewView(
        await InterviewModel.findById(interview._id),
        req.user,
      ),
    );
  });
  app.get("/api/interviews/:id/ice", providerLimit, async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustAttendInterview(req.user, interview);
    if (interview.mode === "in_person")
      throw new ApiError(409, "This appointment takes place in person.");
    if (!["scheduled", "live"].includes(interview.status))
      throw new ApiError(
        409,
        "Video relay credentials are available only for scheduled or live interviews.",
      );
    res
      .set("Cache-Control", "no-store")
      .json(await iceConfiguration(req.user._id));
  });
  app.patch("/api/interviews/:id/notes", async (req, res) => {
    await updateInterviewFeedback(
      req.user,
      objectId.parse(req.params.id),
      async (interview) => {
        const { notes } = z.object({ notes: text(20000) }).parse(req.body);
        await InterviewModel.updateOne(
          { _id: interview._id },
          { $set: { notes } },
        );
      },
    );
    res.json({ ok: true });
  });
  app.post("/api/interviews/:id/questions", providerLimit, async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustManageInterview(req.user, interview);
    if (["completed", "cancelled"].includes(interview.status))
      throw new ApiError(409, "This interview has ended.");
    if (interview.questions.length >= 20)
      throw new ApiError(400, "This session already has 20 questions.");
    const application = interview.applicationId
      ? await ApplicationModel.findById(interview.applicationId)
      : null;
    const job = application ? await JobModel.findById(application.jobId) : null;
    const technicalProfile = application?.snapshot || req.user.profile;
    const questions = await generateQuestions({
      interviewType: interview.type,
      jobTitle: interview.jobTitle,
      requiredSkills: job?.skills || interview.topics,
      interviewCriteria:
        job?.interviewInstructions?.criteria ||
        job?.criteria ||
        "Technical correctness and clear reasoning",
      candidateSkills: technicalProfile.skills,
      candidateProjects: technicalProfile.projects,
      topics: interview.topics,
      difficulty: interview.difficulty,
      previousAnswers: interview.answers.map((a) => ({
        question: interview.questions.find((q) => q.id === a.questionId)?.text,
        answer: a.text,
      })),
    });
    await InterviewModel.updateOne(
      { _id: interview._id, status: { $in: ["scheduled", "live"] } },
      {
        $push: {
          questions: {
            $each: questions.slice(0, 20 - interview.questions.length),
          },
        },
      },
    );
    roomChanged(interview.id, "conversation");
    res.json(questions);
  });
  app.post(
    "/api/interviews/:id/answers",
    permit("candidate"),
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      await mustAttendInterview(req.user, interview);
      requireLive(interview);
      const answer = z
        .object({
          questionId: z.string(),
          text: text(20000).min(5),
          mode: z.enum(["typed", "spoken"]),
          transcriptionReviewed: z.boolean(),
        })
        .parse(req.body);
      if (!interview.questions.some((q) => q.id === answer.questionId))
        throw new ApiError(400, "Question not found.");
      if (answer.mode === "spoken" && !answer.transcriptionReviewed)
        throw new ApiError(400, "Review the transcription before submitting.");
      const updated = await InterviewModel.findOneAndUpdate(
        {
          _id: interview._id,
          status: "live",
          "answers.questionId": { $ne: answer.questionId },
        },
        { $push: { answers: { ...answer, createdAt: new Date() } } },
        { returnDocument: "after" },
      );
      if (!updated)
        throw new ApiError(
          409,
          "An answer is already submitted for this question or the session ended.",
        );
      roomChanged(interview.id, "conversation");
      res.status(201).json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/answers/:questionId/assess",
    providerLimit,
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      await mustManageInterview(req.user, interview);
      const answer = interview.answers.find(
        (a) => a.questionId === req.params.questionId,
      );
      const question = interview.questions.find(
        (q) => q.id === req.params.questionId,
      );
      if (!answer || !question)
        throw new ApiError(404, "Submitted answer not found.");
      await assertFeedbackEditable(interview);
      const feedback = await assessAnswer({
        question: question.text,
        rubric: question.rubric,
        answer: answer.text,
      });
      await updateInterviewFeedback(req.user, interview.id, async (current) => {
        const saved = await InterviewModel.updateOne(
          { _id: current._id, "answers.questionId": answer.questionId },
          { $set: { "answers.$.feedback": feedback } },
        );
        if (!saved.matchedCount)
          throw new ApiError(
            409,
            "The submitted answer changed while feedback was generated.",
          );
      });
      res.json(feedback);
    },
  );
  app.patch(
    "/api/interviews/:id/answers/:questionId/override",
    permit("hr"),
    async (req, res) => {
      await updateInterviewFeedback(
        req.user,
        objectId.parse(req.params.id),
        async (interview) => {
          const { override } = z
            .object({ override: text(6000).min(5) })
            .parse(req.body);
          const saved = await InterviewModel.updateOne(
            { _id: interview._id, "answers.questionId": req.params.questionId },
            { $set: { "answers.$.override": override } },
          );
          if (!saved.matchedCount) throw new ApiError(404, "Answer not found.");
        },
      );
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/transcribe",
    permit("candidate"),
    providerLimit,
    audioUpload.single("audio"),
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      await mustAttendInterview(req.user, interview);
      requireLive(interview);
      if (
        !req.file ||
        !/^audio\/(webm|mp4|ogg|mpeg|wav)/.test(req.file.mimetype)
      )
        throw new ApiError(400, "Provide a supported audio recording.");
      res.json({
        text: await transcribeAudio(req.file.buffer, req.file.mimetype),
      });
    },
  );
  app.patch(
    "/api/interviews/:id/draft",
    permit("candidate"),
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      await mustAttendInterview(req.user, interview);
      requireLive(interview);
      const { language, code } = z
        .object({
          language: z.enum(codingLanguageKeys),
          code: z.string().max(50000),
        })
        .parse(req.body);
      await InterviewModel.updateOne(
        { _id: interview._id, status: "live" },
        { $set: { [`drafts.${language}`]: code, activeLanguage: language } },
      );
      roomChanged(interview.id, "code");
      const hash = createHash("sha256")
        .update(`${language}:${code}`)
        .digest("hex");
      const last = await CodeRevisionModel.findOne({
        interviewId: interview.id,
      }).sort({ createdAt: -1 });
      if (
        last?.hash !== hash &&
        (await CodeRevisionModel.countDocuments({
          interviewId: interview.id,
        })) < 300
      ) {
        const captured = await InterviewModel.findOneAndUpdate(
          {
            _id: interview.id,
            status: "live",
            $or: [
              { lastRevisionAt: { $exists: false } },
              { lastRevisionAt: { $lt: new Date(Date.now() - 15000) } },
            ],
          },
          { $set: { lastRevisionAt: new Date() } },
        );
        if (captured)
          await CodeRevisionModel.create({
            interviewId: interview.id,
            candidateId: req.user._id,
            language,
            code,
            hash,
          });
      }
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/code",
    permit("candidate"),
    providerLimit,
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      await mustAttendInterview(req.user, interview);
      requireLive(interview);
      const input = z
        .object({
          language: z.enum(codingLanguageKeys),
          code: z.string().min(1).max(50000),
          mode: z.enum(["run", "submit"]),
          stdin: z.string().max(10000).default(""),
        })
        .parse(req.body);
      const problem = await interviewProblem(interview);
      if (!problem) throw new ApiError(400, "Coding problem unavailable.");
      const results = await executeCode(
        input.language,
        input.code,
        input.mode === "submit"
          ? problem.tests
          : [{ input: input.stdin, hidden: false }],
        interview.type === "practice" &&
          !interview.companyId &&
          !interview.applicationId &&
          interview.interviewerId === req.user._id
          ? "practice"
          : "interview",
      );
      const submission = await withResources(
        [`report:${interview.id}`],
        async () => {
          const current = await accessibleInterview(req.user, interview.id);
          await mustAttendInterview(req.user, current);
          if (current.status !== "live")
            throw new ApiError(
              409,
              "The interview ended while code was running. These results were not added to its report.",
            );
          requireLive(current);
          await assertFeedbackEditable(current);
          return SubmissionModel.create({
            interviewId: interview._id.toString(),
            candidateId: req.user._id,
            language: input.language,
            code: input.code,
            codeHash: createHash("sha256")
              .update(`${input.language}:${input.code}`)
              .digest("hex"),
            problemId: interview.problemId,
            mode: input.mode,
            results,
            passed: results.filter((r) => r.passed).length,
            total: results.length,
          });
        },
      );
      roomChanged(interview.id, "output");
      res.status(201).json(submission);
    },
  );
  app.get("/api/interviews/:id/submissions", async (req, res) => {
    await accessibleInterview(req.user, objectId.parse(req.params.id));
    res.json(
      await SubmissionModel.find({ interviewId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(100),
    );
  });
  app.get("/api/interviews/:id/code-history", async (req, res) => {
    await accessibleInterview(req.user, objectId.parse(req.params.id));
    res.json(
      await CodeRevisionModel.find({ interviewId: req.params.id })
        .select("language createdAt")
        .sort({ createdAt: 1 })
        .limit(300),
    );
  });
  app.get("/api/interviews/:id/code-history/:revision", async (req, res) => {
    await accessibleInterview(req.user, objectId.parse(req.params.id));
    const revision = await CodeRevisionModel.findOne({
      _id: objectId.parse(req.params.revision),
      interviewId: req.params.id,
    });
    if (!revision) throw new ApiError(404, "Code revision not found.");
    res.json(revision);
  });
  app.post(
    "/api/interviews/:id/events",
    permit("candidate"),
    async (req, res) => {
      const persistEvents = async () => {
        const interview = await accessibleInterview(
          req.user,
          objectId.parse(req.params.id),
        );
        await mustAttendInterview(req.user, interview);
        if (
          !interview.consentAt ||
          interview.type === "practice" ||
          interview.mode === "in_person"
        )
          throw new ApiError(403, "Monitoring consent is required.");
        if (!admitted(interview))
          throw new ApiError(403, "Monitoring starts after admission.");
        const ended = interview.endedAt ? +new Date(interview.endedAt) : 0;
        // Allow metadata already collected during a call to finish uploading after HR ends it.
        if (
          interview.status !== "live" &&
          !(
            interview.status === "completed" &&
            ended &&
            Date.now() - ended <= 600000
          )
        )
          throw new ApiError(
            409,
            "Monitoring uploads are closed for this interview.",
          );
        const eventSchema = z.object({
          clientEventId: z.uuid().optional(),
          kind: z.enum(monitoringKinds),
          occurredAt: z.iso.datetime({ offset: true }),
          durationMs: z.number().min(0).max(86400000).default(0),
          detail: text(200).default(""),
        });
        const input = z
          .union([
            eventSchema,
            z.object({
              events: z
                .array(eventSchema.extend({ clientEventId: z.uuid() }))
                .min(1)
                .max(30),
            }),
          ])
          .parse(req.body);
        const events = "events" in input ? input.events : [input];
        for (const event of events) {
          const at = +new Date(event.occurredAt);
          if (event.kind === "object-detected") {
            if (
              event.durationMs < config.objectThreshold * 1000 ||
              !Number.isInteger(event.durationMs) ||
              !event.detail ||
              /[\r\n\0]/.test(event.detail)
            )
              throw new ApiError(
                400,
                "Object observations require a sustained interval and a short single-line description.",
              );
            const began = at - event.durationMs;
            const monitoringStart = Math.max(
              +interview.consentAt,
              interview.startedAt ? +interview.startedAt : 0,
              humanRoom(interview) && interview.admittedAt
                ? +interview.admittedAt
                : 0,
            );
            if (
              began < monitoringStart ||
              !interview.objectConsentWindows.some(
                (window: any) =>
                  window.grantedAt &&
                  began >= +window.grantedAt &&
                  (!window.revokedAt || at <= +window.revokedAt),
              )
            )
              throw new ApiError(
                403,
                "Separate object observation consent must cover the entire observed interval.",
                "OBJECT_CONSENT_REQUIRED",
              );
          }
          if (
            humanRoom(interview) &&
            ["no-face", "multiple-faces", "head-turned"].includes(event.kind) &&
            !interview.faceConsentWindows.some(
              (w: any) =>
                w.grantedAt &&
                at >= +w.grantedAt &&
                (!w.revokedAt || at <= +w.revokedAt),
            )
          )
            throw new ApiError(
              403,
              "Separate face monitoring consent is required for this observation.",
            );
          if (
            Math.abs(at - Date.now()) > 86400000 ||
            (ended && at > ended + 15000)
          )
            throw new ApiError(
              400,
              "Event timestamp is outside the accepted interview window.",
            );
        }
        const saved = [];
        for (const event of events) {
          const document = {
            ...event,
            interviewId: interview._id.toString(),
            candidateId: req.user._id,
          };
          if (event.clientEventId) {
            const key = {
              interviewId: document.interviewId,
              clientEventId: event.clientEventId,
            };
            try {
              saved.push(
                await MonitoringModel.findOneAndUpdate(
                  key,
                  { $setOnInsert: document },
                  { upsert: true, returnDocument: "after" },
                ),
              );
            } catch (error) {
              if ((error as { code?: number }).code !== 11000) throw error;
              saved.push(await MonitoringModel.findOne(key));
            }
          } else saved.push(await MonitoringModel.create(document));
        }
        roomChanged(interview.id, "monitoring");
        res
          .status(201)
          .json("events" in input ? { accepted: saved.length } : saved[0]);
      };
      // Serialize optional-consent changes against object observations. Other
      // browser metadata retains its existing concurrent retry behavior.
      const includesObjects =
        req.body?.kind === "object-detected" ||
        (Array.isArray(req.body?.events) &&
          req.body.events.some((event: any) => event?.kind === "object-detected"));
      if (includesObjects)
        await withResources(
          [`room:${objectId.parse(req.params.id)}`],
          persistEvents,
        );
      else await persistEvents();
    },
  );
  app.get("/api/interviews/:id/events", async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    if (req.user.role === "candidate" && interview.type !== "practice")
      throw new ApiError(
        403,
        "Only hiring staff can review monitoring events.",
      );
    res.json(
      await MonitoringModel.find({ interviewId: req.params.id })
        .sort({ occurredAt: -1 })
        .limit(2000),
    );
  });
  app.post("/api/interviews/:id/end", async (req, res) => {
    const interviewId = objectId.parse(req.params.id);
    const { interview, report } = await withResources(
      [`report:${interviewId}`],
      async () => {
        let interview = await accessibleInterview(req.user, interviewId);
        if (
          interview.facilitator === "ai" &&
          req.user.role === "candidate" &&
          interview.candidateId === req.user._id
        ) {
          await mustAttendInterview(req.user, interview);
          if (interview.status !== "completed") requireLive(interview);
        } else await mustManageInterview(req.user, interview);
        if (!["live", "completed"].includes(interview.status))
          throw new ApiError(409, "Start the interview first.");
        const completed = await InterviewModel.findOneAndUpdate(
          { _id: interview._id, status: "live" },
          { $set: { status: "completed", endedAt: new Date() } },
          { returnDocument: "after" },
        );
        // Use the final snapshot, including answers saved just before completion.
        if (completed) interview = completed;
        if (completed && interview.applicationId)
          await ApplicationModel.updateOne(
            { _id: interview.applicationId, status: "Interview Scheduled" },
            { $set: { status: "Interview Completed" } },
          );
        const report = await ReportModel.findOneAndUpdate(
          { interviewId: interview.id },
          {
            $setOnInsert: {
              companyId: interview.companyId,
              candidateId: interview.candidateId,
              released: interview.type === "practice",
            },
          },
          { upsert: true, returnDocument: "after" },
        );
        if (completed && interview.type !== "practice")
          await notify(
            interview.candidateId,
            "Your interview is complete. Feedback will appear when released by the hiring team.",
            "/reports",
          );
        return { interview, report };
      },
    );
    roomChanged(interview.id, "ended");
    if (
      serviceStatus().ai &&
      interview.mode !== "in_person" &&
      !report.finalized &&
      !report.assessment &&
      !report.assessmentError
    ) {
      try {
        report.assessment = await generateAssessment(interview, report.id);
      } catch (e) {
        report.assessmentError =
          e instanceof ApiError
            ? e.message
            : "Assessment could not be generated. Retry from the report.";
        await ReportModel.updateOne(
          { _id: report.id, finalized: false },
          { $set: { assessmentError: report.assessmentError } },
        );
      }
    }
    res.json(await ReportModel.findById(report.id));
  });
  app.get("/api/reports", async (req, res) => {
    const interviews = await InterviewModel.find(
      req.user.role === "candidate"
        ? { candidateId: req.user._id }
        : req.user.role === "company"
          ? { companyId: req.user.companyId || "__none" }
          : {
              companyId: req.user.companyId || "__none",
              interviewerId: req.user._id,
            },
    );
    res.json(
      await ReportModel.find({
        interviewId: { $in: interviews.map((i) => i._id.toString()) },
        ...(req.user.role === "candidate" ? { released: true } : {}),
      }).sort({ updatedAt: -1 }),
    );
  });
  async function reportData(user: User, id: string) {
    const report = await ReportModel.findById(objectId.parse(id));
    if (!report) throw new ApiError(404, "Report not found.");
    const interview = await accessibleInterview(user, report.interviewId);
    if (user.role === "candidate" && !report.released)
      throw new ApiError(404, "Report not found.");
    const application = interview.applicationId
      ? await ApplicationModel.findById(interview.applicationId)
      : null;
    const submissions = await SubmissionModel.find({
      interviewId: report.interviewId,
    }).sort({ createdAt: 1 });
    const events =
      user.role !== "candidate"
        ? await MonitoringModel.find({ interviewId: report.interviewId }).sort({
            occurredAt: 1,
          })
        : [];
    const interviewResult = interview.toObject();
    delete (interviewResult as any).objectConsentWindows;
    (interviewResult as any).objectConsent = !!interview.objectConsentWindows?.some(
      (window: any) => !window.revokedAt,
    );
    const transcript = await reviewedTranscript(interview.id);
    delete interviewResult.aiBusyToken;
    delete interviewResult.aiBusyUntil;
    if (user.role === "candidate") delete (interviewResult as any).notes;
    return {
      report,
      interview: interviewResult,
      application,
      submissions,
      events,
      integrity:
        user.role !== "candidate"
          ? analyzeIntegrity(events, !!interview.consentAt)
          : null,
      coding: codingScore(submissions),
      transcript,
      assessmentStale:
        !!report.assessment &&
        report.assessment.sourceHash !==
          evidenceHash(interview, submissions, transcript),
    };
  }
  app.post("/api/reports/:id/assessment", providerLimit, async (req, res) => {
    const data = await reportData(req.user, objectId.parse(req.params.id));
    if (req.user.role !== "company")
      await mustManageInterview(req.user, data.interview);
    if (data.report.finalized)
      throw new ApiError(
        409,
        "This report is finalized. Reopen the human review before regenerating its assessment.",
      );
    res.json(await generateAssessment(data.interview, data.report.id));
  });
  app.delete("/api/reports/:id/assessment", async (req, res) => {
    const data = await reportData(req.user, objectId.parse(req.params.id));
    if (req.user.role !== "company")
      await mustManageInterview(req.user, data.interview);
    await assertLatestReport(data.interview);
    const removed = await ReportModel.updateOne(
      { _id: data.report.id, finalized: false },
      { $unset: { assessment: 1, assessmentError: 1 } },
    );
    if (!removed.matchedCount)
      throw new ApiError(
        409,
        "Reopen the report before removing its AI assessment.",
      );
    res.json({ ok: true });
  });
  app.get("/api/reports/:id", async (req, res) =>
    res.json(await reportData(req.user, objectId.parse(req.params.id))),
  );
  app.get("/api/analytics/performance", async (req, res) => {
    const scope =
      req.user.role === "candidate"
        ? { candidateId: req.user._id }
        : req.user.role === "company"
          ? { companyId: req.user.companyId || "__none" }
          : {
              companyId: req.user.companyId || "__none",
              interviewerId: req.user._id,
            };
    const interviews = await InterviewModel.find({
      ...scope,
      status: "completed",
    })
      .sort({ endedAt: -1 })
      .limit(100);
    const reports = await ReportModel.find({
      interviewId: { $in: interviews.map((i) => i.id) },
      ...(req.user.role === "candidate" ? { released: true } : {}),
    });
    const rows = await Promise.all(
      reports.map(async (r) => {
        const i = interviews.find((i) => i.id === r.interviewId)!;
        const submissions = await SubmissionModel.find({
          interviewId: i.id,
        }).sort({ createdAt: 1 });
        const stale =
          !!r.assessment &&
          r.assessment.sourceHash !==
            evidenceHash(i, submissions, await reviewedTranscript(i.id));
        const score = (key: string) =>
          !stale && r.assessment?.[key]?.score != null
            ? r.assessment[key].score * 20
            : null;
        return {
          reportId: r.id,
          jobTitle: i.jobTitle,
          candidateName: i.candidateName,
          mode: i.mode || "video",
          humanRatings: i.mode === "in_person" ? r.ratings : undefined,
          date: i.endedAt || i.scheduledAt,
          technical: score("technical"),
          coding: codingScore(submissions)?.score ?? null,
          problemSolving: score("problemSolving"),
          communication: score("communication"),
          decision: r.decision,
          stale: i.mode === "in_person" ? false : stale,
        };
      }),
    );
    res.json({
      rows: rows.sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    });
  });
  app.patch("/api/reports/:id", permit("hr", "company"), async (req, res) => {
    let data = await reportData(req.user, objectId.parse(req.params.id));
    if (req.user.role === "hr")
      await mustManageInterview(req.user, data.interview);
    const saveReport = async () => {
      data = await reportData(req.user, objectId.parse(req.params.id));
      await assertLatestReport(data.interview);
      const input = z
        .object({
          summary: text(12000),
          decision: z.enum(["pending", "selected", "rejected", "hold"]),
          explanation: text(6000),
          ratings: z
            .object({
              technical: z.number().int().min(1).max(5).nullable(),
              communication: z.number().int().min(1).max(5).nullable(),
              problemSolving: z.number().int().min(1).max(5).nullable(),
            })
            .optional(),
          finalized: z.boolean(),
          released: z.boolean(),
        })
        .parse(req.body);
      if (input.finalized && data.assessmentStale)
        throw new ApiError(
          409,
          "The AI assessment is out of date. Regenerate or remove it before finalizing the report.",
        );
      if (
        input.finalized &&
        (input.decision === "pending" || input.explanation.length < 10)
      )
        throw new ApiError(
          400,
          "Provide a decision and explanation before finalizing.",
        );
      if (input.released && !input.finalized)
        throw new ApiError(
          400,
          "Finalize the report before releasing feedback.",
        );
      Object.assign(data.report, input);
      data.report.reviewedBy = req.user._id;
      data.report.reviewedAt = new Date();
      await data.report.save();
      if (data.interview.applicationId) {
        const status =
          input.finalized && input.decision === "selected"
            ? (data.interview.roundIndex || 0) + 1 <
              (data.interview.roundCount || 1)
              ? "Interview Completed"
              : "Selected"
            : input.finalized && input.decision === "rejected"
              ? "Rejected"
              : "Interview Completed";
        await ApplicationModel.updateOne(
          { _id: data.interview.applicationId },
          { $set: { status } },
        );
      }
      if (input.released)
        await notify(
          data.interview.candidateId,
          "Your interview feedback is ready.",
          "/reports",
        );
      res.json(data.report);
    };
    await withResources([`report:${data.interview._id}`], async () => {
      if (data.application)
        await withJobWorkflow(data.application.jobId, saveReport);
      else await saveReport();
    });
  });
  app.get("/api/reports/:id/pdf", async (req, res) => {
    const data = await reportData(req.user, objectId.parse(req.params.id));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="hirelens-report.pdf"',
    );
    const doc = new PDFDocument({ margin: 48, size: "A4", bufferPages: true });
    doc.pipe(res);
    const heading = (s: string) => {
      doc
        .moveDown()
        .fontSize(15)
        .fillColor("#256953")
        .text(s)
        .fillColor("#202924")
        .fontSize(10);
    };
    doc.fontSize(25).fillColor("#256953").text("HireLens | Interview report");
    doc
      .fontSize(10)
      .fillColor("#202924")
      .text(`${data.interview.candidateName} — ${data.interview.jobTitle}`);
    doc.text(
      `${data.interview.type === "practice" ? "Personal practice" : "Hiring assessment"} | ${data.report.finalized ? "Finalized" : "Draft"} | ${new Date(data.interview.scheduledAt).toISOString()}`,
    );
    doc.text(
      `Round ${(data.interview.roundIndex || 0) + 1} of ${data.interview.roundCount || 1}: ${data.interview.roundName || "Interview"}`,
    );
    heading("Human review");
    doc.text(data.report.summary || "No summary recorded.");
    doc.text(
      `Decision: ${data.report.decision}\n${data.report.explanation || "No decision explanation recorded."}`,
    );
    if (data.report.ratings) {
      for (const [key, label] of [
        ["technical", "Technical"],
        ["communication", "Communication"],
        ["problemSolving", "Problem solving"],
      ] as const) {
        const rating = data.report.ratings[key];
        doc.text(
          `${label}: ${rating == null ? "Not assessed" : `${rating}/5`}`,
        );
      }
    }
    if (data.report.assessment) {
      const a = data.report.assessment;
      heading("AI-assisted assessment — requires human review");
      if (data.assessmentStale)
        doc.text(
          "Evidence changed after generation. Regenerate before relying on this assessment.",
        );
      doc.text(a.summary);
      for (const key of ["technical", "problemSolving", "communication"]) {
        const m = a[key];
        doc.text(
          `${key}: ${m.score == null ? "Insufficient evidence" : `${m.score * 20}% (${m.score}/5 rubric)`}. ${m.explanation} Evidence: ${m.evidenceRefs.join(", ")}`,
        );
      }
      doc.text(
        `Coding test pass rate: ${data.coding ? `${data.coding.score}%` : "Not assessed"}`,
      );
      doc.text(
        `Advisory recommendation: ${a.recommendation}. ${a.recommendationReason}`,
      );
      for (const key of [
        "strengths",
        "weaknesses",
        "improvements",
        "limitations",
      ])
        doc.text(`${key}: ${a[key].join("; ")}`);
    }
    if (data.application) {
      heading("Resume evidence");
      doc.text(data.application.match?.method || "No match available.");
      doc.text(
        `Skill coverage: ${data.application.match?.score ?? "Unavailable"}`,
      );
      for (const e of data.application.match?.evidence || [])
        doc.text(`${e.skill} (${e.source}): ${e.excerpt}`);
      doc.text((data.application.match?.limitations || []).join("\n"));
    }
    heading("Questions, answers and advisory feedback");
    for (const q of data.interview.questions) {
      doc
        .moveDown()
        .fontSize(11)
        .text(q.text || "");
      doc.fontSize(10).text(`Rubric: ${q.rubric.join("; ")}`);
      const a = data.interview.answers.find((a) => a.questionId === q.id);
      doc.text(a?.text || "No answer submitted.");
      if (a?.feedback) doc.text(JSON.stringify(a.feedback, null, 2));
      if (a?.override) doc.text(`HR override: ${a.override}`);
    }
    if (data.transcript.length) {
      heading("Reviewed candidate transcript excerpts");
      doc.text(
        "Up to 40 reviewed segments, 2,000 characters each. Full recordings and transcripts remain in the authorized report view. Device speaker labels do not identify a person.",
      );
      for (const segment of data.transcript.slice(-40))
        doc.text(
          `${segment.capturedAt?.toISOString() || "Time unavailable"}: ${segment.transcript.slice(0, 2000)}`,
        );
    }
    heading("Coding submissions");
    for (const s of data.submissions) {
      doc.text(
        `${s.language} / ${s.mode}: ${s.passed}/${s.total} successful executions`,
      );
      doc.text(s.code || "");
      doc.text(JSON.stringify(s.results));
    }
    if (!data.submissions.length) doc.text("No code submitted.");
    if (req.user.role !== "candidate") {
      heading("Interviewer notes");
      doc.text(data.interview.notes || "No notes.");
      heading("Monitoring timeline — separate from technical assessment");
      doc.text(
        `Integrity review level: ${data.integrity?.level}. ${data.integrity?.limitations}`,
      );
      doc.text(
        "Browser events are contextual observations and do not prove cheating. Client events can be missing or manipulated.",
      );
      for (const e of data.events)
        doc.text(
          `${e.occurredAt?.toISOString()} — ${e.kind} (${e.durationMs} ms)`,
        );
    }
    heading("Limitations");
    doc.text(
      "AI feedback is advisory and can be incorrect. Human reviewers decide hiring outcomes. No appearance, accent, emotion, or demographic assessment is performed.",
    );
    doc.end();
  });
  app.get("/api/notifications", async (req, res) =>
    res.json(
      await NotificationModel.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50),
    ),
  );
  app.patch("/api/notifications/read", async (req, res) => {
    await NotificationModel.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true } },
    );
    res.json({ ok: true });
  });
  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "API endpoint not found.")),
  );
  if (config.production) {
    const previewIndex = async (
      _req: express.Request,
      res: express.Response,
    ) => {
      const html = await readFile(path.resolve("dist/index.html"), "utf8");
      res.type("html").send(decoratePrivatePreviewHtml(html));
    };
    if (privatePreviewConfigured()) app.get(["/", "/index.html"], previewIndex);
    app.use(express.static(path.resolve("dist")));
    app.get(
      "/{*path}",
      privatePreviewConfigured()
        ? previewIndex
        : (_req, res) => res.sendFile(path.resolve("dist/index.html")),
    );
  }
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues
              .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
              .join("; "),
          },
        });
        return;
      }
      if (error.code === 11000) {
        res.status(409).json({
          error: {
            code: "DUPLICATE",
            message:
              "This record already exists. You may already have applied or registered with this email.",
          },
        });
        return;
      }
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          error: {
            code: "UPLOAD_ERROR",
            message: "Upload is too large or has an unexpected field.",
          },
        });
        return;
      }
      const status =
        error instanceof ApiError
          ? error.status
          : error.status === 400
            ? 400
            : 500;
      if (status === 500) console.error("Request failed:", error.message);
      res.status(status).json({
        error: {
          code: error instanceof ApiError ? error.code : "SERVER_ERROR",
          message:
            status === 500
              ? "Something went wrong. Please try again."
              : error.message,
        },
      });
    },
  );
  return app;
}
