import mongoose, { Schema } from "mongoose";
import { roles, applicationStates } from "../shared/types.js";
const options = { timestamps: true, versionKey: false } as const;
const id = { type: String, required: true, index: true };
const profileSchema = new Schema(
  {
    phone: { type: String, default: "" },
    location: { type: String, default: "" },
    headline: { type: String, default: "" },
    education: { type: String, default: "" },
    skills: { type: [String], default: [] },
    experience: { type: String, default: "" },
    projects: { type: String, default: "" },
    certifications: { type: String, default: "" },
    expertise: { type: String, default: "" },
    achievements: { type: String, default: "" },
    additionalInformation: { type: String, default: "" },
    educationEntries: { type: [Schema.Types.Mixed], default: undefined },
    experienceEntries: { type: [Schema.Types.Mixed], default: undefined },
    projectEntries: { type: [Schema.Types.Mixed], default: undefined },
    certificationEntries: { type: [Schema.Types.Mixed], default: undefined },
    preferredRoles: { type: [String], default: [] },
    experienceYears: { type: Number, min: 0, max: 80, default: null },
    availability: {
      type: String,
      enum: ["available", "busy", "unavailable"],
      default: "available",
    },
    availabilityNote: { type: String, default: "" },
    interviewCapacity: { type: Number, min: 1, max: 500, default: 20 },
    resumeId: String,
  },
  { _id: false },
);
export const UserModel = mongoose.model(
  "User",
  new Schema(
    {
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      username: { type: String, unique: true, sparse: true },
      passwordHash: { type: String, required: true, select: false },
      role: { type: String, enum: roles, required: true },
      companyId: { type: String, index: true },
      emailVerifiedAt: Date,
      notificationEmail: { type: Boolean, default: false },
      notificationSms: { type: Boolean, default: false },
      notificationPhone: String,
      phoneVerifiedAt: Date,
      profile: { type: profileSchema, default: () => ({}) },
      sample: { type: Boolean, default: false },
    },
    options,
  ),
);
export const CompanyModel = mongoose.model(
  "Company",
  new Schema(
    {
      ownerId: id,
      allocationLock: { type: String, select: false },
      allocationLockUntil: { type: Date, select: false },
      name: { type: String, required: true },
      identifier: { type: String, required: true, unique: true },
      description: { type: String, default: "" },
      website: { type: String, default: "" },
      location: { type: String, default: "" },
      officialEmail: { type: String, unique: true, sparse: true },
      registrationNumber: String,
      registrationKey: { type: String, unique: true, sparse: true },
      country: String,
      industry: { type: String, default: "" },
      companyType: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      hasLogo: { type: Boolean, default: false },
      logoData: { type: Buffer, select: false },
      logoType: String,
      localDevelopment: { type: Boolean, default: false },
      verification: {
        status: {
          type: String,
          enum: ["unverified", "verified"],
          default: "unverified",
        },
        verifiedAt: Date,
        legalName: String,
        reference: { type: String, select: false },
      },
      sample: { type: Boolean, default: false },
    },
    options,
  ),
);
export const SessionModel = mongoose.model(
  "Session",
  new Schema(
    {
      tokenHash: { type: String, required: true, unique: true },
      userId: id,
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    options,
  ),
);
export const CompanyVerificationModel = mongoose.model(
  "CompanyVerification",
  new Schema(
    {
      tokenHash: { type: String, required: true, unique: true },
      details: { type: Schema.Types.Mixed, required: true },
      reference: { type: String, required: true },
      legalName: { type: String, required: true },
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    options,
  ),
);
export const OtpChallengeModel = mongoose.model(
  "OtpChallenge",
  new Schema(
    {
      userId: { type: String, required: true, unique: true },
      tokenHash: { type: String, unique: true, sparse: true },
      codeHash: { type: String, select: false },
      expiresAt: Date,
      windowEndsAt: { type: Date, required: true, expires: 0 },
      lastSentAt: Date,
      sends: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      delivered: { type: Boolean, default: false },
    },
    options,
  ),
);
const invitationSchema = new Schema(
  {
    companyId: id,
    companyName: String,
    email: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  options,
);
invitationSchema.index({ companyId: 1, email: 1 }, { unique: true });
export const InvitationModel = mongoose.model("Invitation", invitationSchema);
export const ResumeModel = mongoose.model(
  "Resume",
  new Schema(
    {
      ownerId: id,
      name: String,
      data: { type: Buffer, required: true, select: false },
      text: { type: String, required: true },
      applicationJobId: String,
      sample: { type: Boolean, default: false },
    },
    options,
  ),
);
export const JobModel = mongoose.model(
  "Job",
  new Schema(
    {
      companyId: id,
      companyName: String,
      title: { type: String, required: true },
      description: String,
      skills: [String],
      experience: String,
      difficulty: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"],
        default: "Intermediate",
      },
      location: String,
      employment: { type: String, default: "Full-time" },
      criteria: String,
      role: { type: String, default: "" },
      department: { type: String, default: "" },
      preferredSkills: [String],
      education: { type: String, default: "" },
      workMode: {
        type: String,
        enum: ["Remote", "Hybrid", "On-site"],
        default: "On-site",
      },
      salaryMin: Number,
      salaryMax: Number,
      salaryCurrency: { type: String, default: "INR" },
      openings: { type: Number, min: 1, default: 1 },
      deadline: Date,
      rounds: [String],
      additionalRequirements: { type: String, default: "" },
      shortlistThreshold: { type: Number, min: 1, max: 100, default: 80 },
      requiredHrCount: { type: Number, min: 1, max: 100, default: 1 },
      hrRequests: {
        type: [
          new Schema(
            {
              hrId: { type: String, required: true },
              status: {
                type: String,
                enum: ["pending", "accepted", "declined"],
                default: "pending",
              },
              expectedCandidates: { type: Number, min: 0, default: 0 },
              requestedAt: { type: Date, default: Date.now },
              respondedAt: Date,
            },
            { _id: false },
          ),
        ],
        default: [],
      },
      interviewInstructions: {
        type: {
          type: String,
          enum: ["technical", "behavioral"],
          default: "technical",
        },
        skills: [String],
        topics: [String],
        criteria: { type: String, default: "" },
        duration: { type: Number, min: 10, max: 180, default: 45 },
        special: { type: String, default: "" },
      },
      workflowLock: { type: String, select: false },
      workflowLockUntil: { type: Date, select: false },
      assignmentStatus: {
        type: String,
        enum: ["unassigned", "pending", "accepted", "declined"],
        default: "unassigned",
      },
      assignedAt: Date,
      hrId: String,
      status: {
        type: String,
        enum: ["draft", "published", "closed"],
        default: "draft",
      },
      sample: { type: Boolean, default: false },
    },
    options,
  ),
);
const applicationSchema = new Schema(
  {
    jobId: id,
    companyId: id,
    candidateId: id,
    candidateName: String,
    jobTitle: String,
    companyName: String,
    contactEmail: String,
    city: String,
    state: String,
    submittedAt: Date,
    resumeName: String,
    resumeId: id,
    snapshot: { type: profileSchema, required: true },
    match: Schema.Types.Mixed,
    screening: Schema.Types.Mixed,
    screeningJob: { type: Schema.Types.Mixed, select: false },
    screeningLease: { type: String, select: false },
    screeningLeaseUntil: { type: Date, select: false },
    screeningNextAttempt: { type: Date, select: false },
    status: { type: String, enum: applicationStates, default: "Applied" },
    assignedHrId: { type: String, index: true },
    assignedHrName: String,
    assignmentPendingReason: String,
    assignmentPendingAt: Date,
    schedulingBatchId: { type: String, select: false },
    assignedAt: Date,
    sample: { type: Boolean, default: false },
  },
  options,
);
applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ status: 1, assignedHrId: 1, updatedAt: 1 });
applicationSchema.index({
  "screening.state": 1,
  screeningNextAttempt: 1,
  screeningLeaseUntil: 1,
});
export const ApplicationModel = mongoose.model(
  "Application",
  applicationSchema,
);
const questionSchema = new Schema(
  {
    id: String,
    text: String,
    topic: String,
    rubric: [String],
    source: { type: String, enum: ["curated", "ai"] },
  },
  { _id: false },
);
const answerSchema = new Schema(
  {
    questionId: String,
    text: String,
    mode: { type: String, enum: ["typed", "spoken"] },
    transcriptionReviewed: Boolean,
    feedback: Schema.Types.Mixed,
    override: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
export const InterviewModel = mongoose.model(
  "Interview",
  new Schema(
    {
      applicationId: String,
      companyId: String,
      candidateId: id,
      interviewerId: id,
      candidateName: String,
      jobTitle: String,
      companyName: String,
      scheduledAt: { type: Date, required: true },
      mode: { type: String, enum: ["video", "in_person"], default: "video" },
      venue: { type: String, default: "" },
      timezone: String,
      duration: Number,
      type: {
        type: String,
        enum: ["technical", "behavioral", "practice"],
        default: "technical",
      },
      status: {
        type: String,
        enum: ["scheduled", "live", "completed", "cancelled"],
        default: "scheduled",
      },
      topics: [String],
      difficulty: String,
      facilitator: { type: String, enum: ["human", "ai"], default: "human" },
      batchId: String,
      aiBusyUntil: Date,
      aiBusyToken: String,
      aiPlan: { type: [String], default: [] },
      lastRevisionAt: Date,
      questions: [questionSchema],
      answers: [answerSchema],
      notes: { type: String, default: "" },
      problemId: { type: String, default: "sum-pairs" },
      problemSnapshot: { type: Schema.Types.Mixed, select: false },
      roundIndex: { type: Number, default: 0 },
      roundName: { type: String, default: "Interview" },
      roundCount: { type: Number, default: 1 },
      consentAt: Date,
      faceConsentWindows: {
        type: [{ _id: false, grantedAt: Date, revokedAt: Date }],
        default: [],
      },
      waitingAt: Date,
      admittedAt: Date,
      roomResumeId: String,
      resumeSharedAt: Date,
      cameraAccommodation: { type: Boolean, default: false },
      screenRequired: { type: Boolean, default: true },
      entireScreen: { type: Boolean, default: false },
      roomInstruction: Schema.Types.Mixed,
      codingPrompt: String,
      codingSentAt: Date,
      activeLanguage: { type: String, default: "java" },
      startedAt: Date,
      endedAt: Date,
      drafts: { type: Map, of: String, default: () => ({}) },
      sample: { type: Boolean, default: false },
    },
    options,
  ),
);
export const SubmissionModel = mongoose.model(
  "Submission",
  new Schema(
    {
      interviewId: id,
      candidateId: id,
      language: String,
      code: String,
      mode: String,
      codeHash: String,
      problemId: String,
      results: [Schema.Types.Mixed],
      passed: Number,
      total: Number,
    },
    options,
  ),
);
export const CodeRevisionModel = mongoose.model(
  "CodeRevision",
  new Schema(
    {
      interviewId: id,
      candidateId: id,
      language: String,
      code: String,
      hash: String,
    },
    options,
  ),
);
const batchSchema = new Schema(
  {
    companyId: id,
    jobId: id,
    interviewerId: id,
    requestId: { type: String, required: true },
    name: { type: String, required: true },
    interviewIds: [String],
    requestHash: String,
    recovery: { type: Schema.Types.Mixed, select: false },
    status: {
      type: String,
      enum: ["building", "ready", "failed"],
      default: "building",
    },
  },
  options,
);
batchSchema.index({ interviewerId: 1, requestId: 1 }, { unique: true });
export const InterviewBatchModel = mongoose.model(
  "InterviewBatch",
  batchSchema,
);
const monitoringSchema = new Schema(
  {
    interviewId: id,
    candidateId: id,
    kind: String,
    occurredAt: Date,
    receivedAt: { type: Date, default: Date.now },
    durationMs: Number,
    detail: String,
    clientEventId: String,
    review: {
      status: { type: String, enum: ["reviewed", "explained", "follow_up"] },
      note: String,
      reviewedBy: String,
      reviewedAt: Date,
    },
    reviewHistory: { type: [Schema.Types.Mixed], default: [], select: false },
  },
  options,
);
monitoringSchema.index(
  { interviewId: 1, clientEventId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientEventId: { $type: "string" } },
  },
);
export const MonitoringModel = mongoose.model(
  "MonitoringEvent",
  monitoringSchema,
);
// Each participant explicitly opts in to recording their own device track.
export const CaptureModel = mongoose.model(
  "Capture",
  new Schema(
    {
      interviewId: id,
      ownerId: id,
      role: { type: String, required: true },
      consentAt: { type: Date, required: true },
      stoppedAt: Date,
    },
    options,
  ),
);
const clipSchema = new Schema(
  {
    interviewId: id,
    captureId: id,
    ownerId: id,
    role: String,
    sequence: { type: Number, required: true },
    offsetMs: Number,
    durationMs: Number,
    capturedAt: Date,
    mime: String,
    bytes: Number,
    digest: String,
    data: { type: Buffer, required: true, select: false },
    transcript: { type: String, default: "" },
    transcriptState: { type: String, default: "pending" },
    transcriptError: String,
    transcriptLease: Date,
    transcriptToken: { type: String, select: false },
    reviewedBy: String,
    reviewedAt: Date,
  },
  options,
);
clipSchema.index({ captureId: 1, sequence: 1 }, { unique: true });
export const ClipModel = mongoose.model("InterviewClip", clipSchema);
export const ResourceLockModel = mongoose.model(
  "ResourceLock",
  new Schema(
    {
      key: { type: String, unique: true, required: true },
      token: String,
      until: Date,
    },
    options,
  ),
);
export const ReportModel = mongoose.model(
  "Report",
  new Schema(
    {
      interviewId: { type: String, required: true, unique: true },
      companyId: String,
      candidateId: id,
      summary: { type: String, default: "" },
      ratings: {
        technical: { type: Number, min: 1, max: 5, default: null },
        communication: { type: Number, min: 1, max: 5, default: null },
        problemSolving: { type: Number, min: 1, max: 5, default: null },
      },
      proctoringSummary: { type: Schema.Types.Mixed, select: false },
      decision: {
        type: String,
        enum: ["pending", "selected", "rejected", "hold"],
        default: "pending",
      },
      explanation: { type: String, default: "" },
      finalized: { type: Boolean, default: false },
      released: { type: Boolean, default: false },
      reviewedBy: String,
      reviewedAt: Date,
      assessment: Schema.Types.Mixed,
      assessmentError: String,
    },
    options,
  ),
);
export const NotificationModel = mongoose.model(
  "Notification",
  new Schema(
    {
      userId: id,
      message: String,
      href: String,
      read: { type: Boolean, default: false },
      emailState: { type: String, default: "pending" },
      smsState: { type: String, default: "pending" },
      emailAttempts: { type: Number, default: 0 },
      smsAttempts: { type: Number, default: 0 },
      emailLease: Date,
      smsLease: Date,
      emailLeaseId: String,
      smsLeaseId: String,
    },
    options,
  ),
);
const actionSchema = new Schema(
  {
    userId: id,
    purpose: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    destination: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  options,
);
actionSchema.index({ userId: 1, purpose: 1 }, { unique: true });
export const AccountActionModel = mongoose.model("AccountAction", actionSchema);
export const CodingProblemModel = mongoose.model(
  "CodingProblem",
  new Schema(
    {
      companyId: id,
      authorId: id,
      content: { type: Schema.Types.Mixed, required: true },
    },
    options,
  ),
);
export const AuditModel = mongoose.model(
  "AuditEvent",
  new Schema(
    {
      companyId: { type: String, index: true },
      actorId: id,
      action: String,
      resourceId: String,
      status: Number,
    },
    options,
  ),
);
export async function connectDatabase(uri: string) {
  mongoose.set("bufferCommands", false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await migrateLegacyAssignments();
}
export async function migrateLegacyAssignments() {
  // Preserve explicit legacy responses; a direct assignment is never acceptance.
  const legacyJobs = await JobModel.find({
    hrId: { $type: "string" },
    "hrRequests.0": { $exists: false },
  });
  for (const job of legacyJobs) {
    const shortlisted = await ApplicationModel.countDocuments({
      jobId: job.id,
      status: "Shortlisted",
    });
    await JobModel.updateOne(
      { _id: job._id, "hrRequests.0": { $exists: false } },
      {
        $set: {
          hrRequests: [
            {
              hrId: job.hrId,
              status: ["accepted", "declined"].includes(
                job.assignmentStatus || "",
              )
                ? job.assignmentStatus
                : "pending",
              expectedCandidates: Math.ceil(shortlisted / job.requiredHrCount),
              requestedAt: job.assignedAt || job.createdAt,
            },
          ],
        },
        $unset: { hrId: 1, assignmentStatus: 1, assignedAt: 1 },
      },
    );
  }
}
