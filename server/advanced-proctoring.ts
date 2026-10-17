import type { Express, RequestHandler } from "express";
import mongoose, { Schema } from "mongoose";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CaptureModel, ClipModel, ReportModel } from "./models.js";
import { accessibleInterview, ApiError, objectId } from "./security.js";
import { withResources } from "./locks.js";
import { summarizeSpeakers } from "../shared/speaker-analysis.js";

const schema = new Schema(
  {
    clipId: { type: String, required: true, unique: true },
    interviewId: { type: String, required: true },
    ownerId: { type: String, required: true },
    consentAt: { type: Date, required: true },
    state: String,
    result: Schema.Types.Mixed,
    error: String,
    token: { type: String, select: false },
    until: { type: Date, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, versionKey: false },
);
export const SpeakerAnalysisModel = mongoose.model("SpeakerAnalysis", schema);
function provider() {
  const url = process.env.DIARIZATION_URL || "",
    key = process.env.DIARIZATION_API_KEY || "";
  if (!url || !key) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError(
      503,
      "The speaker service URL is invalid. Ask the administrator to check its configuration.",
    );
  }
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    )
  )
    throw new ApiError(
      503,
      "Speaker analysis requires HTTPS or a localhost service.",
    );
  return {
    url,
    key,
    local: ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname),
  };
}
const publicResult = (value: any) =>
  value
    ? {
        state:
          value.state === "processing" &&
          value.until &&
          +value.until < Date.now()
            ? "failed"
            : value.state,
        result: value.result,
        error:
          value.state === "processing" &&
          value.until &&
          +value.until < Date.now()
            ? "The analysis request expired. You can consent and retry this clip."
            : value.error,
        consentAt: value.consentAt,
        expiresAt: value.expiresAt,
      }
    : null;
export function registerAdvancedProctoring(
  app: Express,
  providerLimit: RequestHandler,
) {
  app.get("/api/proctoring/capabilities", (_req, res) => {
    const configured = provider();
    res.json({
      speakerAnalysis: !!configured,
      processing: configured?.local
        ? "local service"
        : "configured external service",
      trainedIntegrityModel: false,
      gaze: "experimental local calibration only",
    });
  });
  const clipFor = async (req: any) => {
    const clip = await ClipModel.findById(objectId.parse(req.params.id));
    if (!clip) throw new ApiError(404, "Recording segment not found.");
    await accessibleInterview(req.user, clip.interviewId);
    if (req.user.role === "candidate" && clip.ownerId !== req.user._id)
      throw new ApiError(404, "Recording segment not found.");
    return clip;
  };
  app.get("/api/media/:id/speakers", async (req, res) => {
    const clip = await clipFor(req);
    res.json(
      publicResult(
        await SpeakerAnalysisModel.findOne({
          clipId: clip.id,
          expiresAt: { $gt: new Date() },
        }).select("+until"),
      ),
    );
  });
  app.delete("/api/media/:id/speakers", async (req, res) => {
    const clip = await clipFor(req);
    if (req.user._id !== clip.ownerId)
      throw new ApiError(
        403,
        "Only the recording owner can remove this optional analysis.",
      );
    await SpeakerAnalysisModel.deleteOne({
      clipId: clip.id,
      ownerId: req.user._id,
    });
    res.json({ removed: true });
  });
  app.post("/api/media/:id/speakers", providerLimit, async (req, res) => {
    z.object({ accepted: z.literal(true) })
      .strict()
      .parse(req.body);
    const clip = await clipFor(req);
    if (
      req.user.role !== "candidate" ||
      clip.ownerId !== req.user._id ||
      clip.role !== "candidate"
    )
      throw new ApiError(
        403,
        "Only the candidate can consent to analyze their own recording.",
      );
    const settings = provider();
    if (!settings)
      throw new ApiError(
        503,
        "Speaker analysis is not connected. Existing recordings and transcripts remain available.",
      );
    if (
      !(await CaptureModel.exists({
        _id: clip.captureId,
        ownerId: req.user._id,
        consentAt: { $exists: true },
      }))
    )
      throw new ApiError(403, "Recording consent is unavailable.");
    if (
      await ReportModel.exists({
        interviewId: clip.interviewId,
        finalized: true,
      })
    )
      throw new ApiError(
        409,
        "This report is finalized. No new speaker analysis can be added.",
      );
    const token = randomUUID(),
      now = new Date();
    let item;
    try {
      item = await SpeakerAnalysisModel.findOneAndUpdate(
        {
          clipId: clip.id,
          $or: [{ state: { $ne: "processing" } }, { until: { $lt: now } }],
        },
        {
          $set: {
            interviewId: clip.interviewId,
            ownerId: req.user._id,
            consentAt: now,
            state: "processing",
            token,
            until: new Date(Date.now() + 130000),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
          $unset: { result: 1, error: 1 },
        },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error: any) {
      if (error.code === 11000)
        throw new ApiError(409, "Speaker analysis is already running.");
      throw error;
    }
    try {
      const media = await ClipModel.findById(clip.id).select("+data");
      if (!media) throw new ApiError(404, "The recording was removed.");
      const body = new FormData();
      body.append(
        "file",
        new Blob([new Uint8Array(media.data)], {
          type: clip.mime || "application/octet-stream",
        }),
        "recording.webm",
      );
      const response = await fetch(settings.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.key}` },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error("Speaker service unavailable");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty speaker response");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.length;
          if (bytes > 300000) throw new Error("Speaker response too large");
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const text = Buffer.concat(chunks).toString("utf8");
      const result = summarizeSpeakers(JSON.parse(text));
      await withResources([`report:${clip.interviewId}`], async () => {
        if (
          (await ReportModel.exists({
            interviewId: clip.interviewId,
            finalized: true,
          })) ||
          !(await ClipModel.exists({ _id: clip.id }))
        )
          throw new ApiError(
            409,
            "The interview or recording changed during analysis.",
          );
        await SpeakerAnalysisModel.updateOne(
          { _id: item._id, token, state: "processing" },
          {
            $set: { state: "completed", result },
            $unset: { token: 1, until: 1 },
          },
        );
      });
      res.json(publicResult(await SpeakerAnalysisModel.findById(item._id)));
    } catch (error) {
      await SpeakerAnalysisModel.updateOne(
        { _id: item._id, token },
        {
          $set: {
            state: "failed",
            error:
              "Speaker analysis could not complete. No speaker estimate was saved; you can retry.",
          },
          $unset: { token: 1, until: 1 },
        },
      );
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "Speaker analysis could not complete. No speaker estimate was saved.",
      );
    }
  });
}
