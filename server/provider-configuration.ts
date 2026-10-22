import type { config } from "./config.js";
import { createPublicKey } from "node:crypto";
import { z } from "zod";

type Settings = typeof config;
export type DeliveryMode =
  "preview" | "smtp" | "http" | "brevo" | "unconfigured" | "invalid";
type ProviderMode = Exclude<DeliveryMode, "preview" | "smtp" | "brevo">;
export type SmsMode = Exclude<DeliveryMode, "smtp" | "brevo"> | "twilio";
export type CompanyVerificationMode = ProviderMode | "cashfree" | "sandbox";

export function loopbackHost(host: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    host.toLowerCase(),
  );
}

// Reject embedded credentials, fragments and insecure public endpoints before
// sending API keys. Local HTTP is solely a development adapter capability.
export function validProviderUrl(value: string, production: boolean) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === "https:" ||
        (!production && url.protocol === "http:" && loopbackHost(url.hostname)))
    );
  } catch {
    return false;
  }
}

function httpConfiguration(
  url: string,
  key: string,
  prefix: string,
  production: boolean,
) {
  const issues: string[] = [];
  if (!url.trim()) issues.push(`${prefix}_URL is missing.`);
  else if (!validProviderUrl(url, production))
    issues.push(
      `${prefix}_URL must be HTTPS without embedded credentials or a fragment (localhost HTTP is allowed only in development).`,
    );
  if (!key.trim()) issues.push(`${prefix}_API_KEY is missing.`);
  return {
    mode: (!url.trim() && !key.trim()
      ? "unconfigured"
      : issues.length
        ? "invalid"
        : "http") as ProviderMode,
    issues,
  };
}

export function smtpConfigurationIssues(settings: Settings) {
  const issues: string[] = [];
  if (!settings.smtpHost.trim()) issues.push("SMTP_HOST is missing.");
  else if (/\s|[\/@?#]/.test(settings.smtpHost))
    issues.push("SMTP_HOST must be a hostname, not a URL.");
  if (
    !Number.isInteger(settings.smtpPort) ||
    settings.smtpPort < 1 ||
    settings.smtpPort > 65535
  )
    issues.push("SMTP_PORT must be a whole number from 1 to 65535.");
  if (!!settings.smtpUser !== !!settings.smtpPassword)
    issues.push(
      "SMTP_USER and SMTP_PASSWORD must both be set, or both omitted for an authorized relay.",
    );
  if (settings.smtpPort === 465 && !settings.smtpSecure)
    issues.push("SMTP_SECURE must be true for SMTP_PORT=465.");
  return issues;
}

// Brevo needs a structured, single sender. Do not pass a nodemailer-style list
// through to the HTTPS API, or silently reinterpret malformed sender text.
export function brevoSender(value: string) {
  if (/[\x00-\x1f\x7f]/.test(value)) return undefined;
  const source = value.trim();
  const named = /^([^<>]+)<([^<>]+)>$/.exec(source);
  const email = (named ? named[2] : source).trim();
  if (!z.email().max(254).safeParse(email).success) return undefined;
  if (!named) return { email };
  const name = named[1].trim().replace(/^"(.*)"$/, "$1");
  if (!name || name.length > 150) return undefined;
  return { email, name };
}

export function brevoConfigurationIssues(settings: Settings) {
  const issues: string[] = [];
  if (!settings.brevoApiKey.trim()) issues.push("BREVO_API_KEY is missing.");
  else if (/\s|[\x00-\x1f\x7f]/.test(settings.brevoApiKey))
    issues.push("BREVO_API_KEY must be a single token without whitespace.");
  if (!brevoSender(settings.emailFrom))
    issues.push(
      "EMAIL_FROM must be one valid sender email or Name <email> for Brevo.",
    );
  return issues;
}

export function twilioCredentialConfigurationIssues(settings: Settings) {
  const issues: string[] = [];
  if (!/^AC[0-9a-f]{32}$/i.test(settings.twilioAccountSid))
    issues.push("TWILIO_ACCOUNT_SID must be a valid Account SID.");
  if (settings.twilioApiKeySid || settings.twilioApiKeySecret) {
    if (!/^SK[0-9a-f]{32}$/i.test(settings.twilioApiKeySid))
      issues.push("TWILIO_API_KEY_SID must be a valid API Key SID.");
    if (!settings.twilioApiKeySecret.trim())
      issues.push("TWILIO_API_KEY_SECRET is missing.");
  } else if (settings.production) {
    issues.push(
      "Production Twilio access requires TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET.",
    );
  } else if (!settings.twilioAuthToken.trim()) {
    issues.push(
      "Set TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN for local testing.",
    );
  }
  return issues;
}

export function twilioConfigurationIssues(settings: Settings) {
  const issues = twilioCredentialConfigurationIssues(settings);
  if (settings.twilioMessagingServiceSid) {
    if (!/^MG[0-9a-f]{32}$/i.test(settings.twilioMessagingServiceSid))
      issues.push(
        "TWILIO_MESSAGING_SERVICE_SID must be a valid Messaging Service SID.",
      );
  } else if (
    !/^\+[1-9]\d{6,14}$/.test(settings.twilioFrom) &&
    !/^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/.test(settings.twilioFrom)
  ) {
    issues.push(
      "Set TWILIO_FROM to an authorized E.164 number or alphanumeric sender, or set TWILIO_MESSAGING_SERVICE_SID.",
    );
  }
  return issues;
}

export function cashfreeConfigurationIssues(settings: Settings) {
  const issues: string[] = [];
  if (!settings.cashfreeClientId.trim())
    issues.push("CASHFREE_CLIENT_ID is missing.");
  if (!settings.cashfreeClientSecret.trim())
    issues.push("CASHFREE_CLIENT_SECRET is missing.");
  if (!["production", "sandbox"].includes(settings.cashfreeEnvironment))
    issues.push("CASHFREE_ENVIRONMENT must be production or sandbox.");
  if (settings.cashfreePublicKey) {
    try {
      if (
        createPublicKey(settings.cashfreePublicKey).asymmetricKeyType !== "rsa"
      )
        throw new Error("Expected RSA");
    } catch {
      issues.push(
        "CASHFREE_PUBLIC_KEY must be the valid RSA public key downloaded from Cashfree.",
      );
    }
  }
  return issues;
}

export function providerConfiguration(settings: Settings) {
  const preview = settings.messagePreview && !settings.production;
  const emailHttp = httpConfiguration(
    settings.emailUrl,
    settings.emailKey,
    "EMAIL_DELIVERY",
    settings.production,
  );
  const selectedEmail =
    settings.emailProvider === "auto"
      ? settings.smtpHost
        ? "smtp"
        : "http"
      : settings.emailProvider;
  let emailIssues: string[];
  let emailProviderMode: DeliveryMode;
  if (selectedEmail === "brevo") {
    emailIssues = brevoConfigurationIssues(settings);
    emailProviderMode = emailIssues.length ? "invalid" : "brevo";
  } else if (["smtp", "http"].includes(selectedEmail)) {
    emailIssues =
      selectedEmail === "smtp"
        ? smtpConfigurationIssues(settings)
        : emailHttp.issues;
    if (!settings.emailFrom.trim()) emailIssues.push("EMAIL_FROM is missing.");
    else if (/[\r\n]/.test(settings.emailFrom))
      emailIssues.push("EMAIL_FROM must be a single-line sender address.");
    emailProviderMode = emailIssues.length
      ? settings.emailProvider === "auto" &&
        !settings.smtpHost &&
        emailHttp.mode === "unconfigured" &&
        !settings.emailFrom
        ? "unconfigured"
        : "invalid"
      : (selectedEmail as "smtp" | "http");
  } else {
    emailIssues = ["EMAIL_PROVIDER must be auto, smtp, http or brevo."];
    emailProviderMode = "invalid";
  }
  let sms: { mode: Exclude<SmsMode, "preview">; issues: string[] } =
    httpConfiguration(
      settings.smsUrl,
      settings.smsKey,
      "SMS_DELIVERY",
      settings.production,
    );
  if (settings.smsProvider === "twilio") {
    const issues = twilioConfigurationIssues(settings);
    sms = { mode: issues.length ? "invalid" : "twilio", issues };
  } else if (settings.smsProvider !== "http") {
    sms = { mode: "invalid", issues: ["SMS_PROVIDER must be http or twilio."] };
  }
  let companyVerification: { mode: CompanyVerificationMode; issues: string[] } =
    httpConfiguration(
      settings.verificationUrl,
      settings.verificationKey,
      "COMPANY_VERIFICATION",
      settings.production,
    );
  if (settings.verificationProvider === "cashfree") {
    const issues = cashfreeConfigurationIssues(settings);
    companyVerification = {
      mode: issues.length
        ? "invalid"
        : settings.cashfreeEnvironment === "production"
          ? "cashfree"
          : "sandbox",
      issues:
        settings.cashfreeEnvironment === "sandbox"
          ? [
              ...issues,
              "Cashfree sandbox cannot verify real companies. Live CIN access and CASHFREE_ENVIRONMENT=production are required.",
            ]
          : issues,
    };
  } else if (settings.verificationProvider !== "http") {
    companyVerification = {
      mode: "invalid",
      issues: ["COMPANY_VERIFICATION_PROVIDER must be http or cashfree."],
    };
  }
  const emailMode: DeliveryMode = preview ? "preview" : emailProviderMode;
  return {
    email: {
      mode: emailMode,
      providerMode: emailProviderMode,
      issues: emailIssues,
    },
    sms: {
      ...sms,
      providerMode: sms.mode,
      mode: (preview ? "preview" : sms.mode) as SmsMode,
    },
    companyVerification,
    otpReady:
      ["preview", "smtp", "http", "brevo"].includes(emailMode) &&
      settings.otpSecret.length >= 32,
    otpIssues:
      settings.otpSecret.length >= 32
        ? []
        : ["OTP_HASH_SECRET must contain at least 32 characters."],
  };
}
