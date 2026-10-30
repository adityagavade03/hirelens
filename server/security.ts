import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { config, localCompanyRegistrationEnabled } from "./config.js";
import { previewAllowsCompany } from "./private-preview.js";
import { cloudTestAllowsCompany } from "./cloud-test-companies.js";
import {
  SessionModel,
  CompanyModel,
  UserModel,
  JobModel,
  InterviewModel,
  ApplicationModel,
  InterviewBatchModel,
} from "./models.js";
import type { User, Role } from "../shared/types.js";
declare global {
  namespace Express {
    interface Request {
      user: User;
      sessionToken?: string;
    }
  }
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export const ensure = (
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition => {
  if (!condition) throw new ApiError(status, message, code);
};
export const objectId = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, "Invalid identifier")
  .toLowerCase();
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function publicUser(user: any): User {
  const result = user.toObject ? user.toObject() : { ...user };
  delete result.passwordHash;
  if (result.role === "hr") result.companyIds = hrCompanyIds(result);
  return JSON.parse(JSON.stringify(result));
}
/** Retain existing single-company HR accounts without a destructive migration. */
export function hrCompanyIds(user: {
  companyId?: string | null;
  companyIds?: readonly string[] | null;
}): string[] {
  return [
    ...new Set(
      [user.companyId, ...(user.companyIds || [])]
        .filter(
          (id): id is string =>
            typeof id === "string" && /^[0-9a-f]{24}$/i.test(id),
        )
        .map((id) => id.toLowerCase()),
    ),
  ];
}
/** Used for HR rosters and assignment checks, including legacy memberships. */
export function hrMemberFilter(companyId: string) {
  return {
    role: "hr" as const,
    $or: [{ companyId }, { companyIds: companyId }],
  };
}
export async function assertHrMembership(user: User, companyId: string) {
  if (
    user.role !== "hr" ||
    !hrCompanyIds(user).includes(companyId) ||
    !(await localCompanyAccessAllowed({ companyId }))
  )
    throw new ApiError(
      403,
      "You are not a member of this company.",
      "HR_COMPANY_ACCESS_DENIED",
    );
}
export async function localCompanyAccessAllowed(user: {
  companyId?: string | null;
}) {
  return (
    !user.companyId ||
    localCompanyRegistrationEnabled() ||
    previewAllowsCompany(user.companyId) ||
    cloudTestAllowsCompany(user.companyId) ||
    !(await CompanyModel.exists({
      _id: user.companyId,
      localDevelopment: true,
    }))
  );
}
/** Resolve legacy/default access or a validated, explicit tab selection. */
export async function resolveUserCompanyContext(
  user: User,
  requestedCompanyId?: string,
): Promise<User | null> {
  const result = publicUser(user);
  // A tab selects its company explicitly; sessions and other browser tabs do not
  // silently change context when an HR switches to another company's workspace.
  if (result.role === "hr") {
    if (requestedCompanyId !== undefined) {
      const parsed = objectId.safeParse(requestedCompanyId);
      if (!parsed.success)
        throw new ApiError(
          400,
          "Select a valid company.",
          "INVALID_COMPANY_CONTEXT",
        );
      await assertHrMembership(result, parsed.data);
      return { ...result, companyId: parsed.data };
    }
    const ids = hrCompanyIds(result);
    if (!ids.length) return { ...result, companyId: undefined };
    for (const companyId of ids)
      if (await localCompanyAccessAllowed({ companyId }))
        return { ...result, companyId };
    return null;
  }
  // Company and candidate permissions never come from an HR selection header.
  return (await localCompanyAccessAllowed(result)) ? result : null;
}
export async function userForToken(
  token?: string,
  requestedCompanyId?: string,
) {
  if (!token || token.length !== 64) return null;
  const session = await SessionModel.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await UserModel.findById(session.userId);
  return user
    ? resolveUserCompanyContext(publicUser(user), requestedCompanyId)
    : null;
}
export async function newSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + config.sessionHours * 3600000),
  });
  res.cookie("hirelens_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.production,
    maxAge: config.sessionHours * 3600000,
    path: "/",
  });
}
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Listing/joining a different company must remain possible after a stale tab
  // selection. These endpoints perform their own membership checks instead.
  const companySelectionRoute =
    req.path === "/hr/companies" || req.path === "/hr/companies/active";
  const selection = companySelectionRoute
    ? undefined
    : (req.get("X-HireLens-Company") ??
      ((req.method === "GET" || req.method === "HEAD") && typeof req.query.hrCompanyId === "string"
        ? req.query.hrCompanyId
        : undefined));
  const user = await userForToken(req.cookies?.hirelens_session, selection);
  if (!user)
    throw new ApiError(401, "Please sign in to continue.", "UNAUTHENTICATED");
  req.user = user;
  req.sessionToken = req.cookies.hirelens_session;
  // Authenticated pages/assets can vary by tab workspace even under the same
  // session cookie. Keep an earlier stricter cache policy, otherwise disable it.
  if (!res.hasHeader("Cache-Control"))
    res.setHeader("Cache-Control", "private, no-store");
  res.vary("Cookie");
  res.vary("X-HireLens-Company");
  next();
}
export function permit(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!allowed.includes(req.user.role))
      throw new ApiError(403, "Your role cannot perform this action.");
    next();
  };
}
export async function jobScope(user: User) {
  if (user.role === "company") return { companyId: user.companyId || "__none" };
  if (user.role === "hr")
    return {
      companyId: user.companyId || "__none",
      hrRequests: { $elemMatch: { hrId: user._id, status: "accepted" } },
    };
  return { _id: "000000000000000000000000" };
}
export async function accessibleJob(user: User, jobId: string) {
  objectId.parse(jobId);
  const job = await JobModel.findOne({ _id: jobId, ...(await jobScope(user)) });
  if (!job) throw new ApiError(404, "Job not found.");
  return job;
}
export async function accessibleInterview(user: User, interviewId: string) {
  objectId.parse(interviewId);
  const interview = await InterviewModel.findById(interviewId);
  if (!interview) throw new ApiError(404, "Interview not found.");
  const allowed =
    interview.candidateId === user._id ||
    (user.role === "company" &&
      !!interview.companyId &&
      interview.type !== "practice" &&
      interview.companyId === user.companyId) ||
    (user.role === "hr" &&
      interview.type !== "practice" &&
      !!interview.companyId &&
      interview.interviewerId === user._id &&
      interview.companyId === user.companyId);
  if (!allowed) throw new ApiError(404, "Interview not found.");
  if (user.role === "hr" && ["scheduled", "live"].includes(interview.status))
    await assertInterviewAssignment(interview);
  return interview;
}
export async function assertInterviewAssignment(interview: any) {
  if (interview.type === "practice") return;
  if (
    interview.batchId &&
    !(await InterviewBatchModel.exists({
      _id: interview.batchId,
      status: "ready",
    }))
  )
    throw new ApiError(
      409,
      "This interview batch has not finished scheduling.",
    );
  const application = await ApplicationModel.findOne({
    _id: interview.applicationId,
    assignedHrId: interview.interviewerId,
  });
  const job =
    application &&
    (await JobModel.exists({
      _id: application.jobId,
      companyId: interview.companyId,
      hrRequests: {
        $elemMatch: { hrId: interview.interviewerId, status: "accepted" },
      },
    }));
  if (!job)
    throw new ApiError(
      403,
      "An HR must accept this job and receive this candidate before conducting the interview.",
    );
}
export async function mustManageInterview(user: User, interview: any) {
  if (
    interview.type === "practice" &&
    user.role === "candidate" &&
    interview.candidateId === user._id
  )
    return;
  if (
    user.role !== "hr" ||
    interview.interviewerId !== user._id ||
    interview.companyId !== user.companyId
  )
    throw new ApiError(403, "Only the interviewer can perform this action.");
  await assertInterviewAssignment(interview);
}
export async function mustAttendInterview(user: User, interview: any) {
  if (
    user.role === "company" ||
    ![interview.candidateId, interview.interviewerId].includes(user._id)
  )
    throw new ApiError(
      403,
      "Only the candidate and assigned HR can enter this interview.",
    );
  await assertInterviewAssignment(interview);
}
export function requireLive(interview: any) {
  if (interview.mode === "in_person")
    throw new ApiError(
      409,
      "Online interview tools are not enabled for an in-person appointment.",
    );
  if (interview.status !== "live")
    throw new ApiError(409, "Start this interview before submitting work.");
  if (
    interview.type !== "practice" &&
    interview.facilitator !== "ai" &&
    !interview.admittedAt
  )
    throw new ApiError(403, "Wait for the interviewer to admit the candidate.");
  if (interview.type !== "practice" && !interview.consentAt)
    throw new ApiError(
      403,
      "Review and accept the monitoring notice before submitting work.",
    );
}
