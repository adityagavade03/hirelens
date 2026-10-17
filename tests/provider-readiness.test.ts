import { afterEach, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { config, serviceStatus } from "../server/config";
import {
  providerConfiguration,
  validProviderUrl,
} from "../server/provider-configuration";
import {
  emailReady,
  smsReady,
  sendEmail,
  sendSms,
  verifySmtpConnection,
} from "../server/delivery";

const original = { ...config };
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
function settings() {
  Object.assign(config, {
    production: false,
    messagePreview: false,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPassword: "",
    emailFrom: "",
    emailUrl: "",
    emailKey: "",
    smsUrl: "",
    smsKey: "",
    verificationUrl: "",
    verificationKey: "",
    otpSecret: "test-key-with-at-least-thirty-two-characters",
  });
}
function smtp() {
  settings();
  Object.assign(config, {
    smtpHost: "smtp.example.test",
    smtpUser: "secret-user",
    smtpPassword: "secret-password",
    emailFrom: "HireLens <noreply@example.test>",
  });
}

it("identifies previews separately from real provider configuration and never exposes secrets", () => {
  smtp();
  config.messagePreview = true;
  const report = providerConfiguration(config);
  expect(report.email).toMatchObject({ mode: "preview", providerMode: "smtp" });
  expect(report.sms).toMatchObject({
    mode: "preview",
    providerMode: "unconfigured",
  });
  expect(report.companyVerification.mode).toBe("unconfigured");
  expect(serviceStatus()).toMatchObject({
    email: true,
    sms: true,
    companyVerification: false,
    delivery: { emailMode: "preview", smsMode: "preview" },
  });
  expect(JSON.stringify(report)).not.toContain(config.smtpPassword);
  expect(JSON.stringify(serviceStatus())).not.toContain(config.smtpUser);
});

it("cannot enable previews in production or mark OTP ready without a hashing secret", async () => {
  settings();
  config.messagePreview = true;
  config.production = true;
  expect(emailReady()).toBe(false);
  expect(smsReady()).toBe(false);
  expect(serviceStatus()).toMatchObject({
    email: false,
    sms: false,
    messagePreview: false,
  });
  await expect(
    sendEmail("person@example.test", "OTP", "123456"),
  ).rejects.toMatchObject({ status: 503 });
  config.production = false;
  config.otpSecret = "";
  expect(emailReady()).toBe(true);
  expect(serviceStatus().email).toBe(false);
});

it("rejects insecure, credential-bearing and malformed adapters before transmitting a key", async () => {
  settings();
  for (const url of [
    "http://mail.example.test/send",
    "https://user:password@example.test",
    "https://example.test/send#secret",
    "file:///temp/send",
    "not-a-url",
  ]) {
    expect(validProviderUrl(url, false)).toBe(false);
  }
  expect(validProviderUrl("http://localhost:4010/send", false)).toBe(true);
  expect(validProviderUrl("http://[::1]:4010/send", false)).toBe(true);
  expect(validProviderUrl("http://localhost:4010/send", true)).toBe(false);
  expect(validProviderUrl("https://mail.example.test/send", true)).toBe(true);
  config.smsUrl = "https://user:password@example.test/send";
  config.smsKey = "sensitive-key";
  config.verificationUrl = "http://registry.example.test/verify";
  config.verificationKey = "sensitive-key";
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(sendSms("+919876543210", "test")).rejects.toMatchObject({
    status: 503,
  });
  expect(serviceStatus().companyVerification).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it("detects incomplete SMTP credentials, invalid ports and the wrong TLS setting before connection", async () => {
  smtp();
  config.smtpPassword = "";
  config.smtpPort = 465;
  const report = providerConfiguration(config);
  expect(report.email.mode).toBe("invalid");
  expect(report.email.issues).toEqual(
    expect.arrayContaining([
      expect.stringContaining("SMTP_USER and SMTP_PASSWORD"),
      expect.stringContaining("SMTP_SECURE"),
    ]),
  );
  config.smtpPort = Number.NaN;
  const create = vi.spyOn(nodemailer, "createTransport");
  await expect(verifySmtpConnection()).rejects.toMatchObject({ status: 503 });
  expect(create).not.toHaveBeenCalled();
  expect(emailReady()).toBe(false);
});

it("checks SMTP with TLS and authentication while preview is on without sending any message", async () => {
  smtp();
  config.messagePreview = true;
  const verify = vi.fn().mockResolvedValue(true);
  const close = vi.fn();
  const sendMail = vi.fn();
  const create = vi
    .spyOn(nodemailer, "createTransport")
    .mockReturnValue({ verify, close, sendMail } as any);
  await expect(verifySmtpConnection()).resolves.toEqual({ connected: true });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ requireTLS: true, secure: false }),
  );
  expect(verify).toHaveBeenCalledOnce();
  expect(sendMail).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it("redacts provider failures and closes failed SMTP checks", async () => {
  smtp();
  const close = vi.fn();
  vi.spyOn(nodemailer, "createTransport").mockReturnValue({
    verify: vi
      .fn()
      .mockRejectedValue(new Error("secret-password raw SMTP response")),
    close,
  } as any);
  await expect(verifySmtpConnection()).rejects.toMatchObject({
    status: 502,
    message:
      "SMTP connection or authentication failed. Check the provider credentials, TLS settings and network access.",
  });
  expect(close).toHaveBeenCalledOnce();
});

it("supports a local development SMTP relay but still requires TLS for production", async () => {
  settings();
  config.smtpHost = "127.0.0.1";
  config.smtpPort = 1025;
  const create = vi.spyOn(nodemailer, "createTransport").mockReturnValue({
    verify: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
  } as any);
  await verifySmtpConnection();
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ requireTLS: false, auth: undefined }),
  );
  config.production = true;
  await verifySmtpConnection();
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ requireTLS: true }),
  );
});

it("requires real HTTP acceptance with a nonblank message id and forwards retry idempotency", async () => {
  settings();
  config.smsUrl = "https://sms.example.test/send";
  config.smsKey = "key";
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ accepted: true, messageId: "  " })),
    );
  await expect(
    sendSms("+919876543210", "fixture", "notification-id"),
  ).rejects.toMatchObject({ status: 502 });
  expect(fetch).toHaveBeenCalledWith(
    config.smsUrl,
    expect.objectContaining({
      redirect: "error",
      headers: expect.objectContaining({
        "Idempotency-Key": "notification-id",
      }),
    }),
  );
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ accepted: true, messageId: "provider-id" })),
  );
  await expect(sendSms("+919876543210", "fixture")).resolves.toMatchObject({
    accepted: true,
    messageId: "provider-id",
  });
});
