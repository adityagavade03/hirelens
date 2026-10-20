export const roles = ["candidate", "company", "hr"] as const;
export type Role = (typeof roles)[number];
export const applicationStates = [
  "Applied",
  "Under Review",
  "Shortlisted",
  "Interview Scheduled",
  "Interview Completed",
  "Selected",
  "Rejected",
] as const;
export type ApplicationState = (typeof applicationStates)[number];
export interface Profile {
  educationEntries?: import("./resume.js").EducationEntry[];
  experienceEntries?: import("./resume.js").ExperienceEntry[];
  projectEntries?: import("./resume.js").ProjectEntry[];
  certificationEntries?: import("./resume.js").CertificationEntry[];
  achievements?: string;
  additionalInformation?: string;
  phone: string;
  location: string;
  headline: string;
  education: string;
  skills: string[];
  experience: string;
  projects: string;
  certifications: string;
  expertise: string;
  preferredRoles?: string[];
  experienceYears?: number | null;
  availability?: "available" | "busy" | "unavailable";
  availabilityNote?: string;
  interviewCapacity?: number;
  resumeId?: string;
}
export interface User {
  _id: string;
  name: string;
  email: string;
  username?: string;
  emailVerifiedAt?: string;
  notificationEmail?: boolean;
  notificationSms?: boolean;
  notificationPhone?: string;
  phoneVerifiedAt?: string;
  role: Role;
  companyId?: string;
  profile: Profile;
  sample: boolean;
}
export interface Company {
  _id: string;
  name: string;
  identifier: string;
  description: string;
  website: string;
  location: string;
  officialEmail?: string;
  registrationNumber?: string;
  country?: string;
  industry?: string;
  companyType?: string;
  address?: string;
  phone?: string;
  hasLogo?: boolean;
  localDevelopment?: boolean;
  verification?: {
    status: "unverified" | "verified";
    verifiedAt?: string;
    legalName?: string;
  };
  sample: boolean;
}
export interface HrRequest {
  hrId: string;
  status: "pending" | "accepted" | "declined";
  expectedCandidates: number;
  requestedAt: string;
  respondedAt?: string;
}
export interface InterviewInstructions {
  type: "technical" | "behavioral";
  skills: string[];
  topics: string[];
  criteria: string;
  duration: number;
  special: string;
}
export interface Job {
  shortlistThreshold?: number;
  _id: string;
  companyId: string;
  companyName: string;
  title: string;
  description: string;
  skills: string[];
  experience: string;
  location: string;
  employment: string;
  criteria: string;
  role?: string;
  department?: string;
  preferredSkills?: string[];
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  education?: string;
  workMode?: "Remote" | "Hybrid" | "On-site";
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  openings?: number;
  deadline?: string | null;
  rounds?: string[];
  additionalRequirements?: string;
  requiredHrCount: number;
  hrRequests: HrRequest[];
  interviewInstructions: InterviewInstructions;
  myRequest?: HrRequest;
  assignedCandidateCount?: number;
  assignmentStatus?: "unassigned" | "pending" | "accepted" | "declined";
  assignedAt?: string;
  hrId?: string;
  status: "draft" | "published" | "closed";
  sample: boolean;
  createdAt: string;
}
export interface Match {
  source?: "llm" | "legacy";
  components?: {
    name: string;
    score: number | null;
    weight: number;
    evidence: string;
  }[];
  score: number | null;
  method: string;
  matching: string[];
  missing: string[];
  evidence: { skill: string; excerpt: string; source: string }[];
  limitations: string[];
}
export interface Application {
  screening?: {
    state: "queued" | "processing" | "completed" | "failed";
    threshold: number;
    attempts: number;
    message?: string;
    outcome?: "shortlisted" | "not_shortlisted" | "needs_review";
    completedAt?: string;
    model?: string;
    criteria?: ScreeningCriterion[];
    summary?: string;
    jobTitle?: string;
  };
  _id: string;
  jobId: string;
  companyId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: ApplicationState;
  contactEmail?: string;
  city?: string;
  state?: string;
  submittedAt?: string;
  resumeName?: string;
  assignedHrId?: string;
  assignedHrName?: string;
  assignmentPendingReason?: string;
  assignmentPendingAt?: string;
  assignedAt?: string;
  snapshot: Profile;
  resumeId: string;
  match: Match;
  createdAt: string;
  sample: boolean;
}
export interface ScreeningCriterion {
  id: string;
  label: string;
  weight: number;
  required: boolean;
  status: "met" | "partial" | "missing" | "unknown" | "not_required";
  explanation: string;
  requirement: string;
  evidence: { source: string; quote: string }[];
}
export interface Question {
  id: string;
  text: string;
  topic: string;
  rubric: string[];
  source: "curated" | "ai";
}
export interface Feedback {
  correctness: number | null;
  completeness: number | null;
  feedback: string;
  evidence: string[];
  missingConcepts: string[];
  followUp: string;
  uncertainty: string;
}
export interface Answer {
  questionId: string;
  text: string;
  mode: "typed" | "spoken";
  transcriptionReviewed: boolean;
  feedback?: Feedback;
  override?: string;
  createdAt: string;
}
export interface Interview {
  mode?: "video" | "in_person";
  venue?: string;
  facilitator?: "human" | "ai";
  batchId?: string;
  aiPlan?: string[];
  _id: string;
  applicationId?: string;
  companyId?: string;
  candidateId: string;
  interviewerId: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  scheduledAt: string;
  timezone: string;
  duration: number;
  type: "technical" | "behavioral" | "practice";
  status: "scheduled" | "live" | "completed" | "cancelled";
  topics: string[];
  difficulty: string;
  questions: Question[];
  answers: Answer[];
  notes?: string;
  problemId: string;
  roundIndex?: number;
  roundName?: string;
  roundCount?: number;
  consentAt?: string;
  objectConsent?: boolean;
  startedAt?: string;
  endedAt?: string;
  drafts?: Record<string, string>;
  sample: boolean;
}
export interface Problem {
  id: string;
  title: string;
  difficulty: string;
  description: string;
  constraints: string;
  examples: { input: string; output: string }[];
  starter: Record<string, string>;
}
export interface ExecutionResult {
  status: string;
  statusId: number;
  passed: boolean;
  hidden: boolean;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  time?: string;
  memory?: number;
}
export interface Submission {
  codeHash?: string;
  problemId?: string;
  _id: string;
  interviewId: string;
  language: string;
  code: string;
  mode: "run" | "submit";
  results: ExecutionResult[];
  passed: number;
  total: number;
  createdAt: string;
}
export interface MonitoringEvent {
  review?: {
    status: "reviewed" | "explained" | "follow_up";
    note: string;
    reviewedBy: string;
    reviewedAt: string;
  };
  _id: string;
  kind: string;
  occurredAt: string;
  receivedAt: string;
  durationMs: number;
  detail: string;
}
export interface Report {
  ratings?: {
    technical: number | null;
    communication: number | null;
    problemSolving: number | null;
  };
  _id: string;
  interviewId: string;
  summary: string;
  decision: "pending" | "selected" | "rejected" | "hold";
  explanation: string;
  finalized: boolean;
  released: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  assessment?: CandidateAssessment;
  assessmentError?: string;
  updatedAt: string;
}
export interface AssessmentMetric {
  score: number | null;
  explanation: string;
  evidenceRefs: string[];
}
export interface CandidateAssessment {
  summary: string;
  technical: AssessmentMetric;
  problemSolving: AssessmentMetric;
  communication: AssessmentMetric;
  coding: { score: number; passed: number; total: number; ref: string } | null;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  recommendation: string;
  recommendationReason: string;
  limitations: string[];
  generatedAt: string;
  model: string;
  sourceHash: string;
  rubricVersion: string;
}
export interface IntegrityAnalysis {
  level: string;
  score: number | null;
  reasons: {
    signal: string;
    count: number;
    points: number;
    explanation: string;
  }[];
  counts: Record<string, number>;
  coverage: {
    events: number;
    monitoringUnavailable: boolean;
    connectionInterruptions: number;
  };
  limitations: string;
}
export interface Notification {
  _id: string;
  message: string;
  href: string;
  read: boolean;
  createdAt: string;
}
export interface ServiceStatus {
  messagePreview?: boolean;
  delivery?: {
    emailMode: "preview" | "smtp" | "http" | "unconfigured" | "invalid";
    smsMode: "preview" | "http" | "twilio" | "unconfigured" | "invalid";
    companyVerificationMode:
      "http" | "cashfree" | "sandbox" | "unconfigured" | "invalid";
  };
  sms?: boolean;
  ocr?: boolean;
  multiServer?: boolean;
  companyVerification?: boolean;
  email?: boolean;
  companyOtp?: boolean;
  ai: boolean;
  transcription: boolean;
  code: boolean;
  codePublicDemo?: boolean;
  face: boolean;
  objects?: boolean;
  turn: boolean;
  turnLocalDev?: boolean;
  faceThresholdSeconds: number;
  objectThresholdSeconds?: number;
  tabSwitchWarningThreshold?: number;
  faceModelUrl: string;
  mediapipeWasmUrl: string;
  faceLandmarkModelUrl?: string;
  objectModelUrl?: string;
}
