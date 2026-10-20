import type { Express, Request } from "express";
import multer from "multer";
import { z } from "zod";
import {
  ApplicationModel,
  InterviewModel,
  ResumeModel,
  UserModel,
} from "./models.js";
import {
  accessibleInterview,
  mustAttendInterview,
  ApiError,
  objectId,
  permit,
} from "./security.js";
import { extractResumeDetailed } from "./resume.js";
import { resolveProblem } from "./coding.js";
import { roomChanged, humanRoom } from "./room-events.js";
import { withResources } from "./locks.js";

async function room(req: Request) {
  const i = await accessibleInterview(req.user, objectId.parse(req.params.id));
  await mustAttendInterview(req.user, i);
  if (!humanRoom(i))
    throw new ApiError(409, "This action is for a human interview room.");
  return i;
}
function open(i: any) {
  if (!["scheduled", "live"].includes(i.status))
    throw new ApiError(409, "This interview has ended.");
}
function beforeEntry(i: any) {
  open(i);
  if (i.admittedAt)
    throw new ApiError(
      409,
      "Prepare the resume and room policy before admission.",
    );
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
export function registerInterviewRoom(app: Express) {
  // Independent optional consent for object observations, including AI-led
  // hiring interviews. Practice observations stay local and are not persisted.
  app.post(
    "/api/interviews/:id/object-consent",
    permit("candidate"),
    async (req, res) => {
      const { accepted } = z.object({ accepted: z.boolean() }).parse(req.body);
      const id = objectId.parse(req.params.id);
      await withResources([`room:${id}`], async () => {
        const i = await accessibleInterview(req.user, id);
        await mustAttendInterview(req.user, i);
        if (i.type === "practice" || i.mode === "in_person")
          throw new ApiError(
            409,
            "Object observation consent is available only for online hiring interviews. Practice previews stay on your device.",
          );
        open(i);
        const current = i.objectConsentWindows.find((w: any) => !w.revokedAt);
        if (accepted && !current) {
          if (i.objectConsentWindows.length >= 100)
            throw new ApiError(
              429,
              "Object observation consent has changed too often. Leave the optional check off.",
            );
          i.objectConsentWindows.push({ grantedAt: new Date() });
        } else if (!accepted && current) current.revokedAt = new Date();
        await i.save();
        roomChanged(i.id, "object-consent");
        res.json({ accepted, objectConsent: accepted });
      });
    },
  );
  app.post(
    "/api/interviews/:id/room/face-consent",
    permit("candidate"),
    async (req, res) => {
      const { accepted } = z.object({ accepted: z.boolean() }).parse(req.body);
      const id = objectId.parse(req.params.id);
      await withResources([`room:${id}`], async () => {
        const i = await room(req);
        open(i);
        const current = i.faceConsentWindows.find((w: any) => !w.revokedAt);
        if (accepted && !current) {
          if (i.faceConsentWindows.length >= 100)
            throw new ApiError(
              429,
              "Face consent has changed too often in this room. Leave the optional check off.",
            );
          i.faceConsentWindows.push({ grantedAt: new Date() });
        } else if (!accepted && current) current.revokedAt = new Date();
        await i.save();
        roomChanged(i.id, "face-consent");
        res.json({ accepted });
      });
    },
  );
  app.get("/api/interviews/:id/room", async (req, res) => {
    const i = await room(req);
    const interviewer = await UserModel.findById(i.interviewerId).select(
      "name",
    );
    const resume =
      i.roomResumeId && (req.user.role === "candidate" || i.resumeSharedAt)
        ? await ResumeModel.findById(i.roomResumeId).select("name")
        : null;
    res.json({
      interviewerName: interviewer?.name || "Assigned interviewer",
      candidateName: i.candidateName,
      waitingAt: i.waitingAt,
      admittedAt: i.admittedAt,
      resumeId: resume?.id,
      resumeName: resume?.name,
      resumeSharedAt: i.resumeSharedAt,
      cameraAccommodation: i.cameraAccommodation,
      screenRequired: i.screenRequired,
      entireScreen: i.entireScreen,
      faceConsent: !!i.faceConsentWindows?.some((w: any) => !w.revokedAt),
      objectConsent: !!i.objectConsentWindows?.some((w: any) => !w.revokedAt),
      instruction: i.roomInstruction,
      codingPrompt: i.codingPrompt,
      codingSentAt: i.codingSentAt,
      activeLanguage: i.activeLanguage || "java",
    });
  });
  app.get(
    "/api/interviews/:id/room/resumes",
    permit("candidate"),
    async (req, res) => {
      const i = await room(req);
      const application = i.applicationId
        ? await ApplicationModel.findById(i.applicationId).select("resumeId")
        : null;
      const resumes = await ResumeModel.find({ ownerId: req.user._id })
        .select("name createdAt")
        .sort({ createdAt: -1 })
        .limit(50);
      res.json({
        resumes,
        recommendedId: application?.resumeId || req.user.profile.resumeId,
      });
    },
  );
  app.post(
    "/api/interviews/:id/room/resume/upload",
    permit("candidate"),
    upload.single("resume"),
    async (req, res) => {
      // Validate before storing. Upload remains local to this interview; the application snapshot is unchanged.
      const i = await room(req);
      beforeEntry(i);
      if (
        !req.file ||
        req.file.mimetype !== "application/pdf" ||
        !req.file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
      )
        throw new ApiError(400, "Choose a PDF resume up to 5 MB.");
      const { text } = await extractResumeDetailed(req.file.buffer);
      await withResources([`room:${i.id}`], async () => {
        beforeEntry(await room(req));
        const resume = await ResumeModel.create({
          ownerId: req.user._id,
          name: req
            .file!.originalname.replace(/[^a-zA-Z0-9 ._-]/g, "")
            .slice(0, 150),
          text,
          data: req.file!.buffer,
        });
        await InterviewModel.updateOne(
          { _id: i.id },
          { $set: { roomResumeId: resume.id }, $unset: { resumeSharedAt: 1 } },
        );
      });
      roomChanged(i.id, "resume");
      res.status(201).json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/room/resume",
    permit("candidate"),
    async (req, res) => {
      const { resumeId } = z.object({ resumeId: objectId }).parse(req.body);
      await withResources([`room:${req.params.id}`], async () => {
        const i = await room(req);
        beforeEntry(i);
        if (
          !(await ResumeModel.exists({ _id: resumeId, ownerId: req.user._id }))
        )
          throw new ApiError(404, "Resume not found.");
        await InterviewModel.updateOne(
          { _id: i.id },
          { $set: { roomResumeId: resumeId }, $unset: { resumeSharedAt: 1 } },
        );
        roomChanged(i.id, "resume");
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/room/resume/share",
    permit("candidate"),
    async (req, res) => {
      const i = await room(req);
      open(i);
      if (!i.admittedAt || !i.roomResumeId)
        throw new ApiError(
          409,
          "Join with a prepared resume before sharing it.",
        );
      await InterviewModel.updateOne(
        { _id: i.id, status: "live" },
        { $set: { resumeSharedAt: new Date() } },
      );
      roomChanged(i.id, "resume");
      res.json({ ok: true });
    },
  );
  app.get("/api/interviews/:id/room/resume/pdf", async (req, res) => {
    const i = await room(req);
    if (!i.roomResumeId || (req.user.role !== "candidate" && !i.resumeSharedAt))
      throw new ApiError(404, "Resume not shared.");
    const resume = await ResumeModel.findOne({
      _id: i.roomResumeId,
      ownerId: i.candidateId,
    }).select("+data");
    if (!resume) throw new ApiError(404, "Resume unavailable.");
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="resume.pdf"',
        "Cache-Control": "no-store",
      })
      .send(resume.data);
  });
  app.patch(
    "/api/interviews/:id/room/policy",
    permit("hr"),
    async (req, res) => {
      const policy = z
        .object({
          cameraAccommodation: z.boolean(),
          screenRequired: z.boolean(),
          entireScreen: z.boolean(),
        })
        .parse(req.body);
      await withResources([`room:${req.params.id}`], async () => {
        const i = await room(req);
        beforeEntry(i);
        await InterviewModel.updateOne({ _id: i.id }, { $set: policy });
        roomChanged(i.id, "policy");
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/room/wait",
    permit("candidate"),
    async (req, res) => {
      const { cameraReady } = z
        .object({ cameraReady: z.boolean() })
        .parse(req.body);
      const i = await room(req);
      open(i);
      if (+i.scheduledAt - Date.now() > 15 * 60000)
        throw new ApiError(
          409,
          "The room opens 15 minutes before the scheduled time.",
        );
      if (!i.consentAt)
        throw new ApiError(403, "Accept the monitoring notice first.");
      if (!i.cameraAccommodation && !cameraReady)
        throw new ApiError(
          409,
          "Enable a working camera or ask your interviewer to approve an accommodation.",
        );
      if (!i.roomResumeId)
        throw new ApiError(409, "Select or upload your resume first.");
      await InterviewModel.updateOne(
        { _id: i.id, status: { $in: ["scheduled", "live"] } },
        { $set: { waitingAt: new Date() } },
      );
      roomChanged(i.id, "waiting");
      res.json({ ok: true });
    },
  );
  app.post("/api/interviews/:id/room/admit", permit("hr"), async (req, res) => {
    await withResources([`room:${req.params.id}`], async () => {
      const i = await room(req);
      open(i);
      if (!i.waitingAt || !i.consentAt || !i.roomResumeId)
        throw new ApiError(
          409,
          "The candidate must finish setup and enter the waiting room first.",
        );
      await InterviewModel.updateOne(
        { _id: i.id, status: { $in: ["scheduled", "live"] } },
        {
          $set: {
            admittedAt: i.admittedAt || new Date(),
            status: "live",
            startedAt: i.startedAt || new Date(),
          },
        },
      );
      roomChanged(i.id, "admitted");
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/interviews/:id/room/instruction",
    permit("hr"),
    async (req, res) => {
      const input = z
        .object({
          text: z.string().trim().min(1).max(1000),
          kind: z
            .enum(["instruction", "screen-request"])
            .default("instruction"),
        })
        .parse(req.body);
      const i = await room(req);
      open(i);
      await InterviewModel.updateOne(
        { _id: i.id },
        {
          $set: { roomInstruction: { ...input, at: new Date().toISOString() } },
        },
      );
      roomChanged(i.id, "instruction");
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/interviews/:id/room/question",
    permit("hr"),
    async (req, res) => {
      const input = z
        .object({
          problemId: z.string().min(1).max(100),
          prompt: z.string().trim().max(5000).default(""),
        })
        .parse(req.body);
      const i = await room(req);
      open(i);
      if (!i.admittedAt) throw new ApiError(409, "Admit the candidate first.");
      const problem = await resolveProblem(
        input.problemId,
        i.companyId || undefined,
      );
      await InterviewModel.updateOne(
        { _id: i.id, status: "live" },
        {
          $set: {
            problemId: input.problemId,
            problemSnapshot: problem,
            codingPrompt: input.prompt,
            codingSentAt: new Date(),
          },
        },
      );
      roomChanged(i.id, "question");
      res.json({ ok: true });
    },
  );
}
