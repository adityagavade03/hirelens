import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { ApiError } from "./security.js";
import {
  brevoConfigurationIssues,
  brevoSender,
} from "./provider-configuration.js";
import { readProviderJson } from "./provider-response.js";

// UUIDv5 in the DNS namespace. The same outbox key maps to the same UUID even
// after a restart; changing providers does not change the durable outbox record.
function brevoIdempotencyKey(value: string) {
  const bytes = createHash("sha1")
    .update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex"))
    .update(`hirelens-brevo-email:${value}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sendBrevoEmail(
  to: string,
  subject: string,
  text: string,
  idempotencyKey?: string,
) {
  if (brevoConfigurationIssues(config).length)
    throw new ApiError(
      503,
      "Brevo email configuration is incomplete or invalid. Run npm run providers:check.",
    );
  if (
    !z.email().max(254).safeParse(to).success ||
    /[\x00-\x1f\x7f]/.test(to) ||
    !subject.trim() ||
    subject.length > 998 ||
    /[\x00-\x1f\x7f]/.test(subject) ||
    !text.trim() ||
    text.length > 1000000 ||
    text.includes("\0") ||
    (idempotencyKey !== undefined &&
      (!idempotencyKey.trim() ||
        idempotencyKey.length > 500 ||
        /[\x00-\x1f\x7f]/.test(idempotencyKey)))
  )
    throw new ApiError(
      400,
      "Use one valid recipient, a single-line subject and a nonempty email message.",
      "EMAIL_REJECTED",
    );
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "api-key": config.brevoApiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: brevoSender(config.emailFrom),
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(idempotencyKey
          ? { headers: { idempotencyKey: brevoIdempotencyKey(idempotencyKey) } }
          : {}),
      }),
    });
    if (response.status !== 201)
      await response.body?.cancel().catch(() => undefined);
    if (response.status === 429)
      throw new ApiError(
        503,
        "Brevo is temporarily rate limiting email requests. Try again later.",
        "EMAIL_RETRYABLE",
      );
    if (response.status >= 400 && response.status < 500)
      throw new ApiError(
        502,
        "Brevo rejected this email. Check the account, verified sender, transactional access and sending limits.",
        "EMAIL_REJECTED",
      );
    if (response.status !== 201) throw new Error("Uncertain acceptance");
    const result = z
      .object({
        messageId: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .regex(/^[^\x00-\x1f\x7f]+$/),
      })
      .safeParse(await readProviderJson(response));
    if (!result.success) throw new Error("Uncertain acceptance");
    return { accepted: true, messageId: result.data.messageId };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Brevo's idempotency window is finite. A failed request or a crashed worker
    // can have sent the email already; do not let the outbox retry it later.
    throw new ApiError(
      502,
      "Brevo did not confirm acceptance. The email may have been sent; check its transactional log before trying again.",
      "EMAIL_ACCEPTANCE_UNKNOWN",
    );
  }
}
