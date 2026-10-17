import type { Express, RequestHandler, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { rateStore } from "./scaling.js";
import {
  AccountActionModel,
  OtpChallengeModel,
  SessionModel,
  UserModel,
} from "./models.js";
import { ApiError, authenticate, hashToken, publicUser } from "./security.js";
import { config } from "./config.js";
import { emailReady, sendEmail, sendSms } from "./delivery.js";
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export async function issueAccountAction(
  user: any,
  purpose: "reset" | "email" | "phone",
  destination = user.email,
) {
  const existing = await AccountActionModel.findOne({
    userId: user.id || user._id,
    purpose,
  });
  if (existing && existing.updatedAt.getTime() > Date.now() - 60000) return;
  const token = randomBytes(32).toString("hex");
  let record;
  try {
    record = await AccountActionModel.findOneAndUpdate(
      {
        userId: user.id || user._id,
        purpose,
        updatedAt: { $lte: new Date(Date.now() - 60000) },
      },
      {
        tokenHash: hashToken(token),
        destination,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return;
    throw error;
  }
  const link = `${config.origin}/auth/${purpose === "reset" ? "reset-password" : "verify-contact"}#token=${token}`;
  try {
    const text = `Use this link to ${purpose === "reset" ? "reset your password" : `verify your ${purpose}`}: ${link}\nThis single-use link expires in 15 minutes. Ignore it if you did not request it.`;
    if (purpose === "phone") await sendSms(destination, text);
    else
      await sendEmail(
        destination,
        purpose === "reset"
          ? "Reset your HireLens password"
          : "Verify your HireLens email",
        text,
      );
  } catch (error) {
    await AccountActionModel.deleteOne({
      _id: record!._id,
      tokenHash: hashToken(token),
    });
    throw error;
  }
}
export function registerAccountRoutes(
  app: Express,
  loginLimit: RequestHandler,
) {
  const limit = [
    loginLimit,
    rateLimit({
      windowMs: 15 * 60000,
      limit: 20,
      store: rateStore("account-actions"),
      message: {
        error: { message: "Too many account requests. Wait 15 minutes." },
      },
    }),
  ];
  for (const purpose of ["reset", "email"] as const)
    app.post(
      `/api/auth/${purpose === "reset" ? "forgot-password" : "resend-verification"}`,
      limit,
      async (req: Request, res: Response) => {
        const { email } = z.object({ email: emailSchema }).parse(req.body);
        if (!emailReady())
          throw new ApiError(
            503,
            "Email delivery is not configured. Enable local previews or connect an email provider.",
          );
        const user = await UserModel.findOne({ email });
        if (
          user &&
          !(user.sample && !config.demoLogin) &&
          (purpose === "reset" || !user.emailVerifiedAt)
        ) {
          // Keep unknown addresses and provider failures indistinguishable at this endpoint.
          try {
            await issueAccountAction(user, purpose);
          } catch {
            console.error(
              "Account email was not accepted; check delivery configuration.",
            );
          }
        }
        res.json({
          message:
            "If this account is eligible, a link has been sent. Check your inbox or the configured local message preview. Wait one minute before requesting another.",
        });
      },
    );
  app.post(
    "/api/auth/reset-password",
    limit,
    async (req: Request, res: Response) => {
      const input = z
        .object({
          token: tokenSchema,
          password: z
            .string()
            .min(10)
            .max(72)
            .refine((v) => Buffer.byteLength(v) <= 72),
          confirmPassword: z.string(),
        })
        .parse(req.body);
      if (input.password !== input.confirmPassword)
        throw new ApiError(400, "Passwords must match.");
      const passwordHash = await bcrypt.hash(input.password, 12);
      const action = await AccountActionModel.findOneAndDelete({
        tokenHash: hashToken(input.token),
        purpose: "reset",
        expiresAt: { $gt: new Date() },
      });
      if (!action)
        throw new ApiError(
          400,
          "This reset link is invalid, expired, or already used.",
        );
      const user = await UserModel.findOneAndUpdate(
        { _id: action.userId, email: action.destination },
        { passwordHash },
      );
      if (!user)
        throw new ApiError(
          400,
          "The account has changed. Request another reset link.",
        );
      await SessionModel.deleteMany({ userId: action.userId });
      await OtpChallengeModel.deleteMany({ userId: action.userId });
      req.user = publicUser(user);
      res.clearCookie("hirelens_session", { path: "/" });
      res.json({
        message:
          "Password updated. All existing sessions have been signed out. Sign in with your new password.",
      });
    },
  );
  app.post(
    "/api/auth/verify-contact",
    limit,
    async (req: Request, res: Response) => {
      const { token } = z.object({ token: tokenSchema }).parse(req.body);
      const action = await AccountActionModel.findOneAndDelete({
        tokenHash: hashToken(token),
        purpose: { $in: ["email", "phone"] },
        expiresAt: { $gt: new Date() },
      });
      if (!action)
        throw new ApiError(
          400,
          "This verification link is invalid, expired, or already used.",
        );
      const user = await UserModel.findOneAndUpdate(
        {
          _id: action.userId,
          ...(action.purpose === "email" ? { email: action.destination } : {}),
        },
        action.purpose === "email"
          ? { emailVerifiedAt: new Date() }
          : {
              notificationPhone: action.destination,
              phoneVerifiedAt: new Date(),
              notificationSms: false,
            },
        { returnDocument: "after" },
      );
      if (!user) throw new ApiError(400, "Account unavailable.");
      req.user = publicUser(user);
      res.json({
        message:
          "Contact verified. Sign in and choose your notification preferences in your profile.",
      });
    },
  );
  app.post(
    "/api/account/verify-email",
    authenticate,
    limit,
    async (req: Request, res: Response) => {
      if (!req.user.emailVerifiedAt)
        await issueAccountAction(req.user, "email");
      res.json({
        message:
          "Verification requested. Check your inbox or local message preview.",
      });
    },
  );
  app.post(
    "/api/account/verify-phone",
    authenticate,
    limit,
    async (req: Request, res: Response) => {
      const { phone } = z
        .object({
          phone: z
            .string()
            .regex(
              /^\+[1-9]\d{7,14}$/,
              "Use an international phone number, such as +919876543210",
            ),
        })
        .parse(req.body);
      await issueAccountAction(req.user, "phone", phone);
      res.json({
        message:
          "Verification requested. Open the link sent by SMS or in the local message preview.",
      });
    },
  );
  app.patch(
    "/api/account/notifications",
    authenticate,
    async (req: Request, res: Response) => {
      const input = z
        .object({ email: z.boolean(), sms: z.boolean() })
        .parse(req.body);
      if (input.email && !req.user.emailVerifiedAt)
        throw new ApiError(409, "Verify your email first.");
      if (input.sms && !req.user.phoneVerifiedAt)
        throw new ApiError(409, "Verify your SMS number first.");
      const user = await UserModel.findByIdAndUpdate(
        req.user._id,
        { notificationEmail: input.email, notificationSms: input.sms },
        { returnDocument: "after" },
      );
      res.json({ user: publicUser(user) });
    },
  );
}
