import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import type { Stream } from "node:stream";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "../server/config.js";

const run = promisify(execFile);
const python = resolve(
  process.platform === "win32"
    ? ".data/speech/venv/Scripts/python.exe"
    : ".data/speech/venv/bin/python",
);
const generator = resolve("scripts/check-media-fixture.py");
const sample = resolve(".data/speech/check.wav");
if (config.production)
  throw new Error("Run this isolated synthetic check outside production.");
const speechUrl = new URL(config.sttUrl || "http://unconfigured.invalid");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(speechUrl.hostname) ||
  !config.sttKey ||
  !config.sttModel
)
  throw new Error(
    "Configure the existing local speech service first. This check never uploads media to an external provider.",
  );
await access(python);
await access(sample);
await mkdir(".data/runtime", { recursive: true });
const directory = await mkdtemp(resolve(".data/runtime/media-check-"));
const sourcePath = join(directory, "synthetic-source.webm");
const playbackPath = join(directory, "api-playback.webm");
const media = async (...args: string[]) => {
  const result = await run(python, [generator, ...args], {
    timeout: 30000,
    windowsHide: true,
  });
  return JSON.parse(result.stdout) as {
    durationMs: number;
    videoFrames: number;
    audioFrames: number;
    audioSamples: number;
    audioSeconds: number;
    audioPeak: number;
    codecs: Record<string, string>;
  };
};
const generated = await media("generate", sample, sourcePath);
assert(
  generated.videoFrames > 0 &&
    generated.audioFrames > 0 &&
    generated.audioPeak > 0,
);
const bytes = await readFile(sourcePath);
assert(
  bytes.length < 6 * 1024 * 1024,
  "Synthetic segment exceeds API upload limit",
);
console.log(
  `Generated synthetic VP8/Opus WebM: ${generated.videoFrames} video frames, ${generated.audioSeconds}s audio. No device capture.`,
);

// The application is imported only after Redis is disabled for this isolated
// process. The configured MONGODB_URI is never used by this check.
config.redisUrl = "";
const { createApp } = await import("../server/app.js");
const {
  connectDatabase,
  UserModel,
  SessionModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  ClipModel,
} = await import("../server/models.js");
const { hashToken } = await import("../server/security.js");
const { reviewedTranscript } = await import("../server/media.js");
const app = createApp();
const id = () => new mongoose.Types.ObjectId().toString();
const database = await MongoMemoryServer.create({
  binary: { version: "7.0.24" },
});
const statuses: Record<string, number> = {};
function status<T extends { status: number; body: any }>(
  label: string,
  response: T,
  expected: number,
): T {
  statuses[label] = response.status;
  assert.equal(
    response.status,
    expected,
    `${label}: expected ${expected}; ${response.body?.error?.message || "unexpected HTTP response"}`,
  );
  return response;
}
function binary(
  response: Stream,
  done: (error: Error | null, value: Buffer | undefined) => void,
) {
  const chunks: Buffer[] = [];
  response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  response.on("error", (error) => done(error, undefined));
  response.on("end", () => done(null, Buffer.concat(chunks)));
}
try {
  await connectDatabase(database.getUri("hirelens_isolated_media_check"));
  const companyId = id();
  async function actor(role: "candidate" | "hr", company?: string) {
    const user = await UserModel.create({
      name: `Synthetic media ${role}`,
      role,
      companyId: company,
      email: `${id()}@media-check.example.test`,
      passwordHash: "unusable-synthetic-check",
    });
    const token = randomBytes(32).toString("hex");
    await SessionModel.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 600000),
    });
    const client = request.agent(app);
    client.jar.setCookie(`hirelens_session=${token}`);
    return { user, client };
  }
  const candidate = await actor("candidate");
  const hr = await actor("hr", companyId);
  const stranger = await actor("candidate");
  const job = await JobModel.create({
    companyId,
    title: "Synthetic media check",
    hrRequests: [{ hrId: hr.user.id, status: "accepted" }],
  });
  const application = await ApplicationModel.create({
    jobId: job.id,
    companyId,
    candidateId: candidate.user.id,
    resumeId: id(),
    snapshot: {},
    assignedHrId: hr.user.id,
    status: "Interview Scheduled",
  });
  const interview = await InterviewModel.create({
    applicationId: application.id,
    companyId,
    candidateId: candidate.user.id,
    interviewerId: hr.user.id,
    scheduledAt: new Date(),
    startedAt: new Date(),
    admittedAt: new Date(),
    consentAt: new Date(),
    status: "live",
    type: "technical",
    facilitator: "human",
  });
  status(
    "consentDenied",
    await candidate.client
      .post(`/api/interviews/${interview.id}/captures`)
      .send({ accepted: false }),
    400,
  );
  const capture = status(
    "captureCreated",
    await candidate.client
      .post(`/api/interviews/${interview.id}/captures`)
      .send({ accepted: true }),
    201,
  );
  const upload = (sequence = 0) =>
    candidate.client
      .post(`/api/captures/${capture.body._id}/clips`)
      .field("sequence", String(sequence))
      .field("offsetMs", "0")
      .field("durationMs", String(generated.durationMs))
      .attach("clip", bytes, {
        filename: "synthetic.webm",
        contentType: "video/webm",
      });
  const saved = status("uploaded", await upload(), 201);
  assert.equal(saved.body.data, undefined);
  const clipId = saved.body._id;
  const repeated = status("idempotentUpload", await upload(), 201);
  assert.equal(repeated.body._id, clipId);
  assert.equal(
    await ClipModel.countDocuments({ interviewId: interview.id }),
    1,
  );

  status(
    "unauthenticatedPlayback",
    await request(app).get(`/api/media/${clipId}/play`),
    401,
  );
  status(
    "unrelatedCandidatePlayback",
    await stranger.client.get(`/api/media/${clipId}/play`),
    404,
  );
  const playback = status(
    "candidatePlayback",
    await candidate.client
      .get(`/api/media/${clipId}/play`)
      .buffer(true)
      .parse(binary),
    200,
  );
  assert.equal(playback.headers["content-type"], "video/webm");
  assert.equal(playback.headers["cache-control"], "private, no-store");
  assert(
    Buffer.isBuffer(playback.body) && playback.body.equals(bytes),
    "Downloaded clip differs from uploaded media",
  );
  await writeFile(playbackPath, playback.body);
  const decoded = await media("inspect", playbackPath);
  assert.deepEqual(
    decoded,
    generated,
    "Downloaded media did not fully decode identically",
  );

  const range = status(
    "assignedHrRangePlayback",
    await hr.client
      .get(`/api/media/${clipId}/play`)
      .set("Range", "bytes=0-1023")
      .buffer(true)
      .parse(binary),
    206,
  );
  assert.equal(range.headers["content-range"], `bytes 0-1023/${bytes.length}`);
  assert(range.body.equals(bytes.subarray(0, 1024)));
  const suffix = status(
    "suffixRangePlayback",
    await candidate.client
      .get(`/api/media/${clipId}/play`)
      .set("Range", "bytes=-128")
      .buffer(true)
      .parse(binary),
    206,
  );
  assert(suffix.body.equals(bytes.subarray(-128)));
  status(
    "invalidRange",
    await candidate.client
      .get(`/api/media/${clipId}/play`)
      .set("Range", `bytes=${bytes.length}-`),
    416,
  );
  status(
    "captureStopped",
    await candidate.client
      .post(`/api/captures/${capture.body._id}/stop`)
      .send({}),
    200,
  );
  status("uploadAfterStop", await upload(1), 409);
  console.log(
    "Passed: consent, upload, idempotent retry, authorization, full decode, byte-range playback and stopping capture.",
  );

  const transcription = status(
    "realLocalTranscription",
    await candidate.client.post(`/api/media/${clipId}/transcribe`).send({}),
    200,
  );
  const transcript = String(transcription.body.transcript || "").trim();
  assert(
    transcript.length > 15 &&
      /interview/i.test(transcript) &&
      /hash/i.test(transcript),
    "Local Whisper did not recognize the expected synthetic interview/hash-map sample",
  );
  assert.equal(transcription.body.transcriptState, "ready");
  assert.equal(
    (await reviewedTranscript(interview.id)).length,
    0,
    "Unreviewed transcript must not become report evidence",
  );
  const reviewed = status(
    "reviewedTranscript",
    await candidate.client.patch(`/api/media/${clipId}/transcript`).send({
      transcript,
      reviewed: true,
      expectedUpdatedAt: transcription.body.updatedAt,
    }),
    200,
  );
  assert(reviewed.body.reviewedAt);
  assert.equal((await reviewedTranscript(interview.id)).length, 1);
  console.log(
    `Passed: actual local ${config.sttModel} transcription and explicit review: ${transcript}`,
  );
  const evidence = {
    checkedAt: new Date().toISOString(),
    result: "passed",
    fixture:
      "Synthetic moving bars and existing computer-generated interview speech. No camera/microphone capture.",
    normalDatabaseUsed: false,
    database: "temporary isolated MongoMemoryServer, stopped after check",
    source: sourcePath,
    playback: playbackPath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    decoded,
    statuses,
    transcription: {
      provider: "local Whisper",
      model: config.sttModel,
      transcript,
      reviewed: true,
    },
    limitations: [
      "This verifies saved media and speech processing, not physical camera/microphone capture, browser MediaRecorder, remote audio transport or cross-network WebRTC.",
    ],
  };
  await writeFile(
    join(directory, "result.json"),
    JSON.stringify(evidence, null, 2),
  );
  await writeFile(
    resolve(".data/runtime/media-check-result.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(`Saved verification evidence: ${join(directory, "result.json")}`);
} finally {
  await mongoose.disconnect();
  await database.stop();
}
