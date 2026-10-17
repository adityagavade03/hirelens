import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { ApiError } from "./security.js";
import { NotificationModel, UserModel } from "./models.js";
import { sendTwilioSms } from "./native-providers.js";
import {
  loopbackHost,
  providerConfiguration,
  smtpConfigurationIssues,
  validProviderUrl,
} from "./provider-configuration.js";

export const emailReady = () =>
  ["preview", "smtp", "http"].includes(
    providerConfiguration(config).email.mode,
  );
export const smsReady = () =>
  ["preview", "http", "twilio"].includes(
    providerConfiguration(config).sms.mode,
  );

function smtpTransport() {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS:
      !config.smtpSecure &&
      (config.production || !loopbackHost(config.smtpHost)),
    auth: config.smtpUser
      ? { user: config.smtpUser, pass: config.smtpPassword }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dnsTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

// Authenticates and checks TLS/connectivity without sending a message or an OTP.
// Deliberately available while preview mode is on for setup before switchover.
export async function verifySmtpConnection() {
  if (smtpConfigurationIssues(config).length)
    throw new ApiError(
      503,
      "SMTP configuration is incomplete or invalid. Run npm run providers:check.",
    );
  const transport = smtpTransport();
  try {
    if (!(await transport.verify()))
      throw new Error("SMTP verification failed");
    return { connected: true };
  } catch {
    throw new ApiError(
      502,
      "SMTP connection or authentication failed. Check the provider credentials, TLS settings and network access.",
    );
  } finally {
    transport.close();
  }
}
async function preview(channel: string, message: unknown) {
  if (config.production)
    throw new ApiError(503, "Message previews are disabled in production.");
  await mkdir(".data/messages", { recursive: true });
  const messageId = randomUUID();
  await writeFile(
    `.data/messages/${Date.now()}-${messageId}.json`,
    JSON.stringify({ channel, preview: true, ...(message as object) }, null, 2),
    { mode: 0o600 },
  );
  return { accepted: true, messageId };
}
async function adapter(
  url: string,
  key: string,
  body: object,
  idempotencyKey?: string,
) {
  if (!validProviderUrl(url, config.production))
    throw new ApiError(503, "Delivery requires a configured HTTPS provider.");
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (
      !response.ok ||
      result.accepted !== true ||
      typeof result.messageId !== "string" ||
      !result.messageId.trim()
    )
      throw new Error();
    return result;
  } catch {
    throw new ApiError(
      502,
      "The message provider did not confirm acceptance. Try again later.",
    );
  }
}
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  idempotencyKey?: string,
) {
  if (!emailReady())
    throw new ApiError(
      503,
      "Email delivery is not configured. See the local setup guide.",
    );
  const message = {
    from: config.emailFrom || "HireLens <local@hirelens.test>",
    to,
    subject,
    text,
  };
  if (config.messagePreview && !config.production)
    return preview("email", message);
  if (config.smtpHost) {
    const transport = smtpTransport();
    try {
      const result = await transport.sendMail({
        ...message,
        ...(idempotencyKey
          ? { messageId: `<${idempotencyKey}@hirelens.local>` }
          : {}),
      });
      if (!result.accepted.length) throw new Error();
      return { accepted: true, messageId: result.messageId };
    } catch {
      throw new ApiError(
        502,
        "SMTP did not accept this message. Check the delivery configuration.",
      );
    } finally {
      transport.close();
    }
  }
  return adapter(config.emailUrl, config.emailKey, message, idempotencyKey);
}
export async function sendSms(
  to: string,
  text: string,
  idempotencyKey?: string,
) {
  if (!smsReady())
    throw new ApiError(
      503,
      "SMS delivery is not configured. See the local setup guide.",
    );
  if (config.messagePreview && !config.production)
    return preview("sms", { to, text });
  if (config.smsProvider === "twilio") return sendTwilioSms(to, text);
  return adapter(config.smsUrl, config.smsKey, { to, text }, idempotencyKey);
}

// Durable outbox in the existing notification collection. Claims are shared by all servers.
export async function deliverNotifications(limit = 20) {
  for (const channel of ["email", "sms"] as const) {
    // A crashed or timed-out Twilio send may have reached the carrier. Unlike
    // the generic adapter, Twilio does not offer our Idempotency-Key contract.
    if (
      channel === "sms" &&
      providerConfiguration(config).sms.mode === "twilio"
    )
      await NotificationModel.updateMany(
        { smsState: "sending", smsLease: { $lte: new Date() } },
        { $set: { smsState: "failed" }, $unset: { smsLeaseId: 1 } },
      );
    await NotificationModel.updateMany(
      {
        [`${channel}State`]: "sending",
        [`${channel}Attempts`]: { $gte: 5 },
        [`${channel}Lease`]: { $lte: new Date() },
      },
      { $set: { [`${channel}State`]: "failed" } },
    );
    for (let n = 0; n < limit; n++) {
      const state = `${channel}State`,
        lease = `${channel}Lease`,
        attempts = `${channel}Attempts`,
        leaseId = `${channel}LeaseId`;
      const claim = randomUUID();
      const item = await NotificationModel.findOneAndUpdate(
        {
          [state]: { $in: ["pending", "retry", "sending"] },
          [attempts]: { $lt: 5 },
          $or: [
            { [lease]: { $exists: false } },
            { [lease]: { $lte: new Date() } },
          ],
        },
        {
          $set: {
            [state]: "sending",
            [lease]: new Date(Date.now() + 120000),
            [leaseId]: claim,
          },
          $inc: { [attempts]: 1 },
        },
        { returnDocument: "after", sort: { createdAt: 1 } },
      );
      if (!item) break;
      let result = "skipped";
      try {
        const user = await UserModel.findById(item.userId);
        const href =
          item.href?.startsWith("/") && !item.href.startsWith("//")
            ? item.href
            : "/notifications";
        const link = new URL(href, config.origin).toString();
        if (
          channel === "email" &&
          user?.notificationEmail &&
          user.emailVerifiedAt
        ) {
          await sendEmail(
            user.email,
            "HireLens recruitment update",
            `${item.message}\n\n${link}`,
            `${item.id}-email`,
          );
          result =
            config.messagePreview && !config.production
              ? "previewed"
              : "accepted";
        } else if (
          channel === "sms" &&
          user?.notificationSms &&
          user.phoneVerifiedAt &&
          user.notificationPhone
        ) {
          await sendSms(
            user.notificationPhone,
            `You have a HireLens recruitment update. ${link}`,
            `${item.id}-sms`,
          );
          result =
            config.messagePreview && !config.production
              ? "previewed"
              : "accepted";
        }
      } catch (error) {
        result =
          (error instanceof ApiError &&
            ["SMS_ACCEPTANCE_UNKNOWN", "SMS_REJECTED"].includes(error.code)) ||
          Number(item.get(attempts)) >= 5
            ? "failed"
            : "retry";
      }
      await NotificationModel.updateOne(
        { _id: item._id, [leaseId]: claim },
        {
          $set: {
            [state]: result,
            [lease]: new Date(
              Date.now() + 60000 * 2 ** Number(item.get(attempts)),
            ),
          },
          $unset: { [leaseId]: 1 },
        },
      );
    }
  }
}
export function startDeliveryWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await deliverNotifications();
    } catch (error) {
      console.error(
        "Notification delivery will retry after a database error:",
        error instanceof Error ? error.name : "unknown",
      );
    } finally {
      running = false;
    }
  }, 10000);
  timer.unref();
  return () => clearInterval(timer);
}
