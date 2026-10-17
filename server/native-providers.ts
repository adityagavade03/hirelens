import { constants, publicEncrypt, randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { ApiError } from "./security.js";
import {
  cashfreeConfigurationIssues,
  twilioConfigurationIssues,
} from "./provider-configuration.js";
import type { CompanyDetails } from "./onboarding.js";
import { readProviderJson } from "./provider-response.js";

// Twilio's Messages API does not promise idempotency for a retried POST. An
// interrupted request may already have sent an SMS: never silently resend it.
export async function sendTwilioSms(to: string, text: string) {
  if (twilioConfigurationIssues(config).length)
    throw new ApiError(
      503,
      "Twilio SMS configuration is incomplete. Run npm run providers:check.",
    );
  if (!/^\+[1-9]\d{6,14}$/.test(to) || !text.trim() || text.length > 1600)
    throw new ApiError(
      400,
      "Use an international phone number and an SMS message of 1–1600 characters.",
      "SMS_REJECTED",
    );
  const username = config.twilioApiKeySid || config.twilioAccountSid;
  const password = config.twilioApiKeySid
    ? config.twilioApiKeySecret
    : config.twilioAuthToken;
  const body = new URLSearchParams({ To: to, Body: text });
  if (config.twilioMessagingServiceSid)
    body.set("MessagingServiceSid", config.twilioMessagingServiceSid);
  else body.set("From", config.twilioFrom);
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );
    if (!response.ok) await response.body?.cancel().catch(() => undefined);
    if (response.status === 429)
      throw new ApiError(
        503,
        "Twilio is temporarily rate limiting SMS requests. Try again later.",
        "SMS_RETRYABLE",
      );
    if (response.status >= 400 && response.status < 500)
      throw new ApiError(
        502,
        "Twilio rejected this SMS. Check the account, approved sender, destination permissions and trial restrictions.",
        "SMS_REJECTED",
      );
    if (!response.ok) throw new Error("Uncertain acceptance");
    const result = z
      .object({
        sid: z.string().regex(/^SM[0-9a-f]{32}$/i),
        account_sid: z.literal(config.twilioAccountSid),
        status: z.enum(["accepted", "queued", "sending", "sent", "delivered"]),
      })
      .safeParse(await readProviderJson(response));
    if (!result.success) throw new Error("Uncertain acceptance");
    return { accepted: true, messageId: result.data.sid };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "Twilio did not confirm acceptance. The SMS may have been sent; check its Twilio log before trying again.",
      "SMS_ACCEPTANCE_UNKNOWN",
    );
  }
}

const normalizedName = (value: string) =>
  value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const cinPattern = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

export async function verifyCashfreeCin(details: CompanyDetails) {
  // Sandbox responses are test data. They must never become CompanyVerification
  // receipts, even when the application itself is running on localhost.
  if (
    config.cashfreeEnvironment !== "production" ||
    cashfreeConfigurationIssues(config).length
  )
    throw new ApiError(
      503,
      "Real company verification requires configured Cashfree production CIN access. Sandbox results cannot verify a company.",
      "VERIFICATION_NOT_CONFIGURED",
    );
  const cin = details.registrationNumber.trim().toUpperCase();
  if (details.country !== "IN" || !cinPattern.test(cin))
    throw new ApiError(
      422,
      "Cashfree company verification supports Indian companies with a valid 21-character CIN. Enter the registered company name and registry email.",
    );
  const verificationId = `hirelens-${randomUUID()}`;
  let payload: unknown;
  try {
    const signature = config.cashfreePublicKey
      ? publicEncrypt(
          {
            key: config.cashfreePublicKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha1",
          },
          Buffer.from(
            `${config.cashfreeClientId}.${Math.floor(Date.now() / 1000)}`,
          ),
        ).toString("base64")
      : undefined;
    const response = await fetch("https://api.cashfree.com/verification/cin", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "x-client-id": config.cashfreeClientId,
        "x-client-secret": config.cashfreeClientSecret,
        ...(signature ? { "x-cf-signature": signature } : {}),
      },
      body: JSON.stringify({ verification_id: verificationId, cin }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Provider unavailable");
    }
    payload = await readProviderJson(response);
  } catch {
    throw new ApiError(
      502,
      "Cashfree could not complete verification. Check live CIN access, credentials, balance and the configured IP allowlist or public key.",
    );
  }
  if (
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    payload.status === "INVALID"
  )
    throw new ApiError(
      422,
      "The CIN could not be verified. Check the official registration number.",
    );
  const result = z
    .object({
      status: z.literal("VALID"),
      verification_id: z.literal(verificationId),
      reference_id: z.number().int().positive(),
      cin: z.string().transform((value) => value.trim().toUpperCase()),
      company_name: z.string().trim().min(2).max(150),
      cin_status: z.string(),
      email: z
        .email()
        .max(254)
        .transform((value) => value.toLowerCase()),
      incorporation_country: z.enum(["INDIA", "IN"]),
    })
    .safeParse(payload);
  if (!result.success || result.data.cin !== cin)
    throw new ApiError(
      502,
      "Cashfree returned incomplete or mismatched company identity data. No company was verified.",
    );
  const data = result.data;
  if (data.cin_status !== "ACTIVE")
    throw new ApiError(
      422,
      "The registry does not show this company as active. Check the official company record.",
    );
  if (
    !normalizedName(data.company_name) ||
    data.email !== details.officialEmail.toLowerCase() ||
    normalizedName(data.company_name) !== normalizedName(details.companyName)
  )
    throw new ApiError(
      422,
      "Use the company name and official email recorded in the company registry. Email ownership alone cannot verify a business.",
    );
  return {
    verified: true,
    legalName: data.company_name,
    reference: `cashfree-cin:${data.reference_id}`,
    officialEmail: data.email,
    country: "IN",
    registrationNumber: data.cin,
  };
}
