import type { Express, RequestHandler } from "express";
import { createHash, randomUUID } from "node:crypto";
import multer from "multer";
import { z } from "zod";
import {
  CaptureModel,
  ClipModel,
  InterviewModel,
  ReportModel,
} from "./models.js";
import {
  accessibleInterview,
  ApiError,
  mustAttendInterview,
  objectId,
  requireLive,
} from "./security.js";
import { transcribeAudio, transcriptionErrors } from "./providers.js";
import { serviceStatus } from "./config.js";
import { withResources } from "./locks.js";
import { withUploadStorage } from "./storage-budget.js";
import type { User } from "../shared/types.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 3 },
});
const meta = (clip: any) => {
  const result = clip.toObject ? clip.toObject() : { ...clip };
  delete result.data;
  delete result.digest;
  delete result.transcriptToken;
  delete result.transcriptLease;
  return result;
};
async function clipFor(user: User, id: string) {
  const clip = await ClipModel.findById(objectId.parse(id));
  if (!clip) throw new ApiError(404, "Recording segment not found.");
  const interview = await accessibleInterview(user, clip.interviewId);
  // Candidates can always review their own capture, never an HR's private track.
  if (user.role === "candidate" && clip.ownerId !== user._id)
    throw new ApiError(404, "Recording segment not found.");
  return { clip, interview };
}
async function editable(interviewId: string) {
  if (await ReportModel.exists({ interviewId, finalized: true }))
    throw new ApiError(
      409,
      "Reopen the report before changing its transcript.",
    );
}
export async function reviewedTranscript(interviewId: string) {
  return ClipModel.find({
    interviewId,
    role: "candidate",
    reviewedAt: { $exists: true },
    transcript: { $ne: "" },
  })
    .select("transcript offsetMs durationMs capturedAt reviewedAt role")
    .sort({ capturedAt: 1, createdAt: 1 });
}
export function registerMedia(app: Express, providerLimit: RequestHandler) {
  app.get("/api/interviews/:id/media", async (req, res) => {
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    const clips = await ClipModel.find({
      interviewId: interview.id,
      ...(req.user.role === "candidate" ? { ownerId: req.user._id } : {}),
    })
      .sort({ capturedAt: 1, createdAt: 1 })
      .limit(720);
    res.json(clips.map(meta));
  });
  app.post("/api/interviews/:id/captures", async (req, res) => {
    z.object({ accepted: z.literal(true) }).parse(req.body);
    const interview = await accessibleInterview(
      req.user,
      objectId.parse(req.params.id),
    );
    await mustAttendInterview(req.user, interview);
    requireLive(interview);
    const capture = await withResources(
      [`media:${interview.id}:${req.user._id}`],
      async () => {
        if (
          (await CaptureModel.countDocuments({
            interviewId: interview.id,
            ownerId: req.user._id,
          })) >= 30
        )
          throw new ApiError(
            409,
            "Recording restart limit reached for this interview.",
          );
        await CaptureModel.updateMany(
          {
            interviewId: interview.id,
            ownerId: req.user._id,
            stoppedAt: { $exists: false },
          },
          { $set: { stoppedAt: new Date() } },
        );
        return CaptureModel.create({
          interviewId: interview.id,
          ownerId: req.user._id,
          role: req.user.role,
          consentAt: new Date(),
        });
      },
    );
    res.status(201).json(capture);
  });
  const uploadAccess: RequestHandler = async (req, _res, next) => {
    const capture = await CaptureModel.findOne({
      _id: objectId.parse(req.params.id),
      ownerId: req.user._id,
    });
    if (!capture) throw new ApiError(404, "Recording session not found.");
    const interview = await accessibleInterview(req.user, capture.interviewId);
    await mustAttendInterview(req.user, interview);
    if (
      capture.stoppedAt ||
      (interview.status !== "live" &&
        !(
          interview.status === "completed" &&
          interview.endedAt &&
          Date.now() - +interview.endedAt < 120000
        ))
    )
      throw new ApiError(409, "This recording session is closed.");
    next();
  };
  app.post(
    "/api/captures/:id/clips",
    uploadAccess,
    upload.single("clip"),
    async (req, res) => {
      const input = z
        .object({
          sequence: z.coerce.number().int().min(0).max(359),
          offsetMs: z.coerce.number().int().min(0).max(10800000),
          durationMs: z.coerce.number().int().min(1).max(120000),
        })
        .parse(req.body);
      const file = req.file;
      if (
        !file ||
        !["video/webm", "audio/webm", "video/mp4", "audio/mp4"].includes(
          file.mimetype,
        )
      )
        throw new ApiError(400, "Upload a WebM or MP4 recording segment.");
      const validHeader = file.mimetype.includes("webm")
        ? file.buffer
            .subarray(0, 4)
            .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        : file.buffer.subarray(4, 8).toString() === "ftyp";
      if (!validHeader)
        throw new ApiError(400, "The file is not a supported recording.");
      const digest = createHash("sha256").update(file.buffer).digest("hex");
      const capture = await CaptureModel.findOne({
        _id: req.params.id,
        ownerId: req.user._id,
      });
      if (!capture) throw new ApiError(404, "Recording session not found.");
      const clip = await withResources(
        [`media:${capture.interviewId}:${req.user._id}`],
        async () => {
          const prior = await ClipModel.findOne({
            captureId: capture.id,
            sequence: input.sequence,
          });
          if (prior) {
            if (
              prior.digest !== digest ||
              prior.offsetMs !== input.offsetMs ||
              prior.durationMs !== input.durationMs
            )
              throw new ApiError(
                409,
                "This segment number already contains a different recording.",
              );
            return prior;
          }
          const fresh = await CaptureModel.findById(capture.id);
          if (!fresh || fresh.stoppedAt)
            throw new ApiError(409, "Recording is stopped.");
          if (
            input.offsetMs + input.durationMs >
            Date.now() - +capture.consentAt + 10000
          )
            throw new ApiError(
              400,
              "The recording timestamps exceed the capture period.",
            );
          const clips = await ClipModel.find({
            interviewId: capture.interviewId,
            ownerId: req.user._id,
          }).select("bytes");
          if (
            clips.length >= 360 ||
            clips.reduce((n, c) => n + (c.bytes || 0), 0) + file.size >
              512 * 1024 * 1024
          )
            throw new ApiError(
              413,
              "The interview recording limit has been reached (360 segments or 512 MB per participant).",
            );
          const document = {
            ...input,
            capturedAt: new Date(+capture.consentAt + input.offsetMs),
            captureId: capture.id,
            interviewId: capture.interviewId,
            ownerId: req.user._id,
            role: capture.role,
            mime: file.mimetype,
            bytes: file.size,
            digest,
            data: file.buffer,
          };
          return withUploadStorage(document, () => ClipModel.create(document));
        },
      );
      res.status(201).json(meta(clip));
    },
  );
  app.post("/api/captures/:id/stop", async (req, res) => {
    const capture = await CaptureModel.findOneAndUpdate(
      { _id: objectId.parse(req.params.id), ownerId: req.user._id },
      { $set: { stoppedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!capture) throw new ApiError(404, "Recording session not found.");
    res.json({ stopped: true });
  });
  app.get("/api/media/:id/play", async (req, res) => {
    const { clip } = await clipFor(req.user, objectId.parse(req.params.id));
    const stored = await ClipModel.findById(clip.id).select("+data");
    if (!stored?.data) throw new ApiError(404, "Recording was removed.");
    const buffer = Buffer.from(stored.data),
      size = buffer.length;
    res.set({
      "Content-Type": clip.mime!,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
    });
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start = match?.[1]
        ? Number(match[1])
        : Math.max(0, size - Number(match?.[2]));
      const end =
        match?.[1] && match?.[2]
          ? Math.min(size - 1, Number(match[2]))
          : size - 1;
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        start < 0 ||
        start > end ||
        start >= size
      ) {
        res.set("Content-Range", `bytes */${size}`).status(416).end();
        return;
      }
      res
        .status(206)
        .set({
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        })
        .end(buffer.subarray(start, end + 1));
    } else res.set("Content-Length", String(size)).end(buffer);
  });
  app.post("/api/media/:id/transcribe", providerLimit, async (req, res) => {
    const { clip, interview } = await clipFor(
      req.user,
      objectId.parse(req.params.id),
    );
    await editable(interview.id);
    if (clip.reviewedAt) {
      res.json(meta(clip));
      return;
    }
    if (!serviceStatus().transcription)
      throw new ApiError(
        503,
        "Connect a speech service to transcribe this saved recording.",
      );
    const token = randomUUID();
    const claimed = await ClipModel.findOneAndUpdate(
      {
        _id: clip.id,
        reviewedAt: { $exists: false },
        $or: [
          { transcriptLease: { $exists: false } },
          { transcriptLease: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          transcriptState: "processing",
          transcriptToken: token,
          transcriptLease: new Date(Date.now() + 60000),
        },
      },
      { returnDocument: "after" },
    ).select("+data");
    if (!claimed) throw new ApiError(409, "Transcription is already running.");
    try {
      const transcript = await transcribeAudio(
        Buffer.from(claimed.data!),
        claimed.mime!.replace("video/", "audio/"),
      );
      const updated = await withResources(
        [`report:${interview.id}`],
        async () => {
          await editable(interview.id);
          return ClipModel.findOneAndUpdate(
            {
              _id: clip.id,
              transcriptToken: token,
              reviewedAt: { $exists: false },
            },
            {
              $set: { transcript, transcriptState: "ready" },
              $unset: {
                transcriptLease: 1,
                transcriptToken: 1,
                transcriptError: 1,
              },
            },
            { returnDocument: "after" },
          );
        },
      );
      if (!updated)
        throw new ApiError(
          409,
          "Transcript changed during transcription. Refresh before editing.",
        );
      res.json(meta(updated));
    } catch (e) {
      await ClipModel.updateOne(
        { _id: clip.id, transcriptToken: token },
        {
          $set: {
            transcriptState: "failed",
            transcriptError:
              e instanceof ApiError &&
              Object.hasOwn(transcriptionErrors, e.code)
                ? `${transcriptionErrors[e.code]} The recording is saved.`
                : "Transcription failed. Retry or enter a reviewed transcript.",
          },
          $unset: { transcriptLease: 1, transcriptToken: 1 },
        },
      );
      throw e;
    }
  });
  app.patch("/api/media/:id/transcript", async (req, res) => {
    const input = z
      .object({
        transcript: z.string().trim().max(20000),
        reviewed: z.literal(true),
        expectedUpdatedAt: z.iso.datetime(),
      })
      .parse(req.body);
    const { clip, interview } = await clipFor(
      req.user,
      objectId.parse(req.params.id),
    );
    const updated = await withResources(
      [`report:${interview.id}`],
      async () => {
        await editable(interview.id);
        return ClipModel.findOneAndUpdate(
          { _id: clip.id, updatedAt: new Date(input.expectedUpdatedAt) },
          {
            $set: {
              transcript: input.transcript,
              transcriptState: "ready",
              reviewedBy: req.user._id,
              reviewedAt: new Date(),
            },
            $unset: {
              transcriptLease: 1,
              transcriptToken: 1,
              transcriptError: 1,
            },
          },
          { returnDocument: "after" },
        );
      },
    );
    if (!updated)
      throw new ApiError(
        409,
        "This transcript changed. Refresh before saving.",
      );
    res.json(meta(updated));
  });
}
