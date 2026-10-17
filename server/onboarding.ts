import type {
  Express,
  RequestHandler,
  Response as ExpressResponse,
} from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import {
  randomBytes,
  randomInt,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { config, localCompanyRegistrationEnabled } from "./config.js";
import {
  CompanyModel,
  CompanyVerificationModel,
  OtpChallengeModel,
  UserModel,
  SessionModel,
} from "./models.js";
import {
  ApiError,
  hashToken,
  newSession,
  publicUser,
  localCompanyAccessAllowed,
} from "./security.js";
import { rateStore } from "./scaling.js";
import { emailReady, sendEmail } from "./delivery.js";
import { issueAccountAction } from "./accounts.js";
import { verifyCashfreeCin } from "./native-providers.js";
import { roles } from "../shared/types.js";
import {
  providerConfiguration,
  validProviderUrl,
} from "./provider-configuration.js";

const text = (max: number) => z.string().trim().max(max);
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const companyDetailsSchema = z.object({
  companyName: text(150).min(2),
  officialEmail: email,
  registrationNumber: text(100).default(""),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code, such as IN"),
  website: z
    .url()
    .max(500)
    .refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS website"),
  industry: text(120).min(2),
  companyType: text(100).min(2),
  address: text(600).min(5),
  phone: text(40).min(5),
  location: text(200).min(2),
});
export type CompanyDetails = z.infer<typeof companyDetailsSchema>;
export const registrationKey = (details: CompanyDetails) =>
  details.registrationNumber
    ? `${details.country}:${details.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, "")}`
    : undefined;

async function providerRequest(url: string, key: string, body: unknown) {
  if (!validProviderUrl(url, config.production))
    throw new ApiError(
      503,
      "The configured provider requires an HTTPS endpoint.",
    );
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider rejected request");
    return await response.json();
  } catch {
    throw new ApiError(
      502,
      "The verification or email provider is unavailable. Please try again later.",
    );
  }
}
export async function verifyCompany(
  details: CompanyDetails,
  excludeCompanyId?: string,
) {
  await assertCompanyUnique(details, excludeCompanyId);
  if (
    !["http", "cashfree"].includes(
      providerConfiguration(config).companyVerification.mode,
    )
  )
    throw new ApiError(
      503,
      "Company verification is not configured yet. Contact the platform administrator to connect the verification service.",
      "VERIFICATION_NOT_CONFIGURED",
    );
  return verifyCompanyIdentity(details);
}
async function assertCompanyUnique(
  details: CompanyDetails,
  excludeCompanyId?: string,
) {
  const key = registrationKey(details);
  const duplicate = await CompanyModel.exists({
    ...(excludeCompanyId ? { _id: { $ne: excludeCompanyId } } : {}),
    $or: [
      { officialEmail: details.officialEmail },
      ...(key ? [{ registrationKey: key }] : []),
    ],
  });
  if (duplicate)
    throw new ApiError(
      409,
      "This company is already registered. Sign in with its existing account.",
    );
}
async function verifyCompanyIdentity(details: CompanyDetails) {
  const result = z
    .object({
      verified: z.boolean(),
      legalName: text(150).optional(),
      reference: text(200).optional(),
      officialEmail: email.optional(),
      country: text(2).optional(),
      registrationNumber: text(100).optional(),
    })
    .safeParse(
      config.verificationProvider === "cashfree"
        ? await verifyCashfreeCin(details)
        : await providerRequest(
            config.verificationUrl,
            config.verificationKey,
            details,
          ),
    );
  if (!result.success)
    throw new ApiError(
      502,
      "The company verification service returned an invalid response.",
    );
  const data = result.data;
  if (!data.verified)
    throw new ApiError(
      422,
      "Your company could not be verified. Check the official details and try again.",
    );
  if (
    !data.legalName ||
    !data.reference ||
    data.officialEmail !== details.officialEmail ||
    data.country !== details.country ||
    (data.registrationNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, "") !==
      details.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, "")
  )
    throw new ApiError(
      502,
      "The verification result did not match the submitted company identity.",
    );
  return { legalName: data.legalName, reference: data.reference };
}
export function companyRecord(
  details: CompanyDetails,
  verification: { legalName: string; reference: string },
) {
  const { companyName: _name, ...fields } = details;
  return {
    ...fields,
    name: verification.legalName,
    localDevelopment: false,
    registrationKey: registrationKey(details),
    verification: {
      status: "verified" as const,
      verifiedAt: new Date(),
      ...verification,
    },
  };
}
async function assertLocalCompanyAccess(user: { companyId?: string | null }) {
  if (!(await localCompanyAccessAllowed(user)))
    throw new ApiError(
      403,
      "Local development company access is disabled in this environment.",
    );
}
const otpRequired = (user: any) =>
  user.role === "company" &&
  config.companyOtpRequired &&
  !(config.demoLogin && user.sample);
const otpDigest = (token: string, code: string) =>
  createHmac("sha256", config.otpSecret)
    .update(`${token}:${code}`)
    .digest("hex");
async function issueOtp(user: any) {
  await assertLocalCompanyAccess(user);
  if (!emailReady() || config.otpSecret.length < 32)
    throw new ApiError(
      503,
      "Email verification is not configured yet. Contact the platform administrator; sign-in cannot continue without a verification code.",
      "EMAIL_NOT_CONFIGURED",
    );
  const userId = user._id.toString(),
    now = new Date();
  await OtpChallengeModel.deleteOne({ userId, windowEndsAt: { $lte: now } });
  await OtpChallengeModel.updateOne(
    { userId },
    {
      $setOnInsert: {
        windowEndsAt: new Date(Date.now() + 20 * 60000),
        sends: 0,
        attempts: 0,
      },
    },
    { upsert: true },
  );
  const token = randomBytes(32).toString("hex"),
    code = randomInt(0, 1000000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60000);
  const challenge = await OtpChallengeModel.findOneAndUpdate(
    {
      userId,
      attempts: { $lt: 5 },
      sends: { $lt: 5 },
      $or: [
        { lastSentAt: { $exists: false } },
        { lastSentAt: { $lte: new Date(Date.now() - 60000) } },
      ],
    },
    {
      $inc: { sends: 1 },
      $set: {
        tokenHash: hashToken(token),
        codeHash: otpDigest(token, code),
        expiresAt,
        lastSentAt: now,
        delivered: false,
      },
    },
    { returnDocument: "after" },
  );
  if (!challenge)
    throw new ApiError(
      429,
      "Wait at least one minute before requesting another code. After five sends or attempts, wait 20 minutes.",
    );
  await sendEmail(
    user.email,
    "Your HireLens company sign-in code",
    `Your HireLens verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  );
  await OtpChallengeModel.updateOne(
    { _id: challenge._id, tokenHash: hashToken(token) },
    { $set: { delivered: true } },
  );
  return {
    otpRequired: true,
    challengeToken: token,
    expiresAt,
    resendAfterSeconds: 60,
    destination: user.email.replace(/^(.).+(@.*)$/, "$1•••$2"),
  };
}
async function finishLogin(res: ExpressResponse, user: any, oldToken?: string) {
  await assertLocalCompanyAccess(user);
  if (oldToken)
    await SessionModel.deleteOne({ tokenHash: hashToken(oldToken) });
  await newSession(res, user._id.toString());
  res.json({ user: publicUser(user) });
}
export function registerAuthRoutes(app: Express, authLimit: RequestHandler) {
  const verificationLimit = rateLimit({
    store: rateStore("company-verification"),
    windowMs: 15 * 60000,
    limit: 15,
    message: {
      error: {
        message:
          "Too many company verification requests. Try again in 15 minutes.",
      },
    },
  });
  app.get("/api/auth/options", (_req, res) =>
    res.json({
      companyVerification: ["http", "cashfree"].includes(
        providerConfiguration(config).companyVerification.mode,
      ),
      localCompanyRegistration: localCompanyRegistrationEnabled(),
      messagePreview: config.messagePreview && !config.production,
      email: !!(emailReady() && config.otpSecret.length >= 32),
      companyOtp: config.companyOtpRequired,
      demo: config.demoLogin,
    }),
  );
  app.post(
    "/api/auth/company/verify",
    authLimit,
    verificationLimit,
    async (req, res) => {
      const details = companyDetailsSchema.parse(req.body);
      const verified = await verifyCompany(details);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60000);
      await CompanyVerificationModel.create({
        tokenHash: hashToken(token),
        details,
        ...verified,
        expiresAt,
      });
      res.json({
        verificationToken: token,
        legalName: verified.legalName,
        expiresAt,
      });
    },
  );
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const input = z
      .object({
        name: text(100).min(2),
        email,
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/)
          .optional(),
        password: z
          .string()
          .min(10)
          .max(72)
          .refine(
            (v) => Buffer.byteLength(v, "utf8") <= 72,
            "Password must fit within 72 UTF-8 bytes",
          ),
        confirmPassword: z.string().optional(),
        role: z.enum(roles),
        localCompanyDetails: companyDetailsSchema.optional(),
        verificationToken: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .parse(req.body);
    const localDetails = input.localCompanyDetails;
    if (localDetails) {
      if (input.role !== "company" || input.verificationToken)
        throw new ApiError(
          400,
          "Choose either local company setup or verified company registration.",
        );
      if (!localCompanyRegistrationEnabled())
        throw new ApiError(
          403,
          "Local company registration is disabled in this environment.",
        );
      if (!input.username || input.email !== localDetails.officialEmail)
        throw new ApiError(
          400,
          "Choose a username and use the company’s official email address.",
        );
      await assertCompanyUnique(localDetails);
    }
    if (
      (input.role === "company" || input.confirmPassword !== undefined) &&
      input.password !== input.confirmPassword
    )
      throw new ApiError(400, "Passwords must match.");
    if (
      await UserModel.exists({
        $or: [
          { email: input.email },
          ...(input.username ? [{ username: input.username }] : []),
        ],
      })
    )
      throw new ApiError(409, "This email or username is already registered.");
    let verified: any;
    if (input.role === "company" && !localDetails) {
      if (!input.username || !input.verificationToken)
        throw new ApiError(
          400,
          "Verify your company and choose a username before registering.",
        );
      verified = await CompanyVerificationModel.findOneAndDelete({
        tokenHash: hashToken(input.verificationToken),
        expiresAt: { $gt: new Date() },
        "details.officialEmail": input.email,
      });
      if (!verified)
        throw new ApiError(
          400,
          "Company verification has expired or does not match this email. Verify your company again.",
        );
    }
    const userId = new mongoose.Types.ObjectId(),
      companyId =
        verified || localDetails ? new mongoose.Types.ObjectId() : undefined;
    const user = await UserModel.create({
      _id: userId,
      name: input.name,
      email: input.email,
      username: input.username,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role,
      companyId: companyId?.toString(),
    });
    if (companyId) {
      try {
        await CompanyModel.create({
          _id: companyId,
          ownerId: userId.toString(),
          identifier: `HL-${randomBytes(6).toString("hex").toUpperCase()}`,
          ...(localDetails
            ? {
                ...localDetails,
                name: localDetails.companyName,
                registrationKey: registrationKey(localDetails),
                localDevelopment: true,
                verification: { status: "unverified" },
              }
            : companyRecord(verified.details, verified)),
        });
      } catch (error) {
        await UserModel.deleteOne({ _id: userId });
        throw error;
      }
      res.status(201).json({
        registered: true,
        message: localDetails
          ? "Local company account created. The company is unverified. Sign in to open your workspace."
          : "Company registered and verified. Sign in to verify your email and open your workspace.",
      });
    } else if (config.emailVerificationRequired) {
      try {
        await issueAccountAction(user, "email");
      } catch {
        /* Resend remains available if the provider is down. */
      }
      res.status(201).json({
        registered: true,
        message:
          "Account created. Verify your email before signing in. Use Resend verification if needed.",
      });
    } else {
      await newSession(res, userId.toString());
      res.status(201).json({ user: publicUser(user) });
    }
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const input = z
      .object({
        identifier: text(254).min(1).optional(),
        email: email.optional(),
        password: z.string().min(1).max(72),
        role: z.enum(roles).optional(),
      })
      .parse(req.body);
    const identifier = (input.identifier || input.email || "").toLowerCase();
    const user = await UserModel.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select("+passwordHash");
    if (
      !user ||
      !(await bcrypt.compare(input.password, user.passwordHash)) ||
      (input.role && input.role !== user.role)
    )
      throw new ApiError(
        401,
        "The credentials do not match an account for this role.",
      );
    if (user.sample && !config.demoLogin)
      throw new ApiError(
        403,
        "Sample account access is disabled in this environment.",
      );
    await assertLocalCompanyAccess(user);
    if (
      user.role !== "company" &&
      config.emailVerificationRequired &&
      !user.emailVerifiedAt &&
      !(config.demoLogin && user.sample)
    )
      throw new ApiError(
        403,
        "Verify your email before signing in. Use Resend verification to request a link.",
      );
    req.user = publicUser(user);
    if (otpRequired(user)) res.status(202).json(await issueOtp(user));
    else await finishLogin(res, user, req.cookies?.hirelens_session);
  });
  app.post("/api/auth/otp/verify", authLimit, async (req, res) => {
    const { challengeToken, code } = z
      .object({
        challengeToken: z.string().regex(/^[a-f0-9]{64}$/),
        code: z
          .string()
          .regex(/^\d{6}$/, "Enter the six-digit verification code"),
      })
      .parse(req.body);
    const tokenHash = hashToken(challengeToken);
    const challenge = await OtpChallengeModel.findOneAndUpdate(
      {
        tokenHash,
        delivered: true,
        expiresAt: { $gt: new Date() },
        windowEndsAt: { $gt: new Date() },
        attempts: { $lt: 5 },
      },
      { $inc: { attempts: 1 } },
      { returnDocument: "after" },
    ).select("+codeHash");
    if (
      !challenge ||
      !challenge.codeHash ||
      !timingSafeEqual(
        Buffer.from(challenge.codeHash, "hex"),
        Buffer.from(otpDigest(challengeToken, code), "hex"),
      )
    )
      throw new ApiError(
        400,
        "Invalid or expired code, or too many attempts. Request a new code after the waiting period.",
      );
    const consumed = await OtpChallengeModel.findOneAndDelete({
      _id: challenge._id,
      tokenHash,
      codeHash: challenge.codeHash,
      delivered: true,
    });
    if (!consumed) throw new ApiError(400, "This code has already been used.");
    const user = await UserModel.findById(challenge.userId);
    if (!user || user.role !== "company")
      throw new ApiError(401, "Account unavailable. Please sign in again.");
    await assertLocalCompanyAccess(user);
    req.user = publicUser(user);
    user.emailVerifiedAt = new Date();
    await user.save();
    await finishLogin(res, user, req.cookies?.hirelens_session);
  });
  app.post("/api/auth/otp/resend", authLimit, async (req, res) => {
    const { challengeToken } = z
      .object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    const challenge = await OtpChallengeModel.findOne({
      tokenHash: hashToken(challengeToken),
      windowEndsAt: { $gt: new Date() },
    });
    if (!challenge)
      throw new ApiError(400, "This sign-in request expired. Sign in again.");
    const user = await UserModel.findById(challenge.userId);
    if (!user) throw new ApiError(401, "Account unavailable.");
    res.json(await issueOtp(user));
  });
}
