import { afterEach, beforeEach, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { config, serviceStatus } from "../server/config";
import { providerConfiguration } from "../server/provider-configuration";
import {
  emailReady,
  sendEmail,
  deliverNotifications,
} from "../server/delivery";
import { NotificationModel, UserModel } from "../server/models";

const original = { ...config };
const key = "fixture-brevo-secret-not-a-real-key";
const recipient = "person@example.test";
beforeEach(() => {
  Object.assign(config, {
    production: true,
    messagePreview: false,
    emailProvider: "brevo",
    brevoApiKey: key,
    emailFrom: "HireLens <sender@example.test>",
    // Explicit provider selection must not fall back to these stale settings.
    smtpHost: "old-smtp.example.test",
    emailUrl: "https://old-adapter.example.test/send",
    emailKey: "old-adapter-secret",
    otpSecret: "isolated-test-hashing-secret-over-thirty-two-characters",
  });
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("No live requests in tests"),
  );
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
const accepted = () =>
  new Response(JSON.stringify({ messageId: "<fixture@relay.example.test>" }), {
    status: 201,
  });

it("sends Brevo's HTTPS payload with server-only authentication and confirms acceptance only", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(accepted());
  const smtp = vi.spyOn(nodemailer, "createTransport");
  await expect(
    sendEmail(recipient, "Verify your email", "A fixture verification message"),
  ).resolves.toEqual({
    accepted: true,
    messageId: "<fixture@relay.example.test>",
  });
  expect(smtp).not.toHaveBeenCalled();
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("https://api.brevo.com/v3/smtp/email");
  expect(options).toMatchObject({
    method: "POST",
    redirect: "error",
    signal: expect.any(AbortSignal),
  });
  expect(new Headers(options?.headers).get("api-key")).toBe(key);
  expect(JSON.parse(String(options?.body))).toEqual({
    sender: { name: "HireLens", email: "sender@example.test" },
    to: [{ email: recipient }],
    subject: "Verify your email",
    textContent: "A fixture verification message",
  });
  expect(String(options?.body)).not.toContain(key);
  expect(providerConfiguration(config).email).toMatchObject({
    mode: "brevo",
    providerMode: "brevo",
    issues: [],
  });
  expect(emailReady()).toBe(true);
  expect(serviceStatus()).toMatchObject({
    email: true,
    delivery: { emailMode: "brevo" },
  });
  expect(JSON.stringify(providerConfiguration(config))).not.toContain(key);
  expect(JSON.stringify(serviceStatus())).not.toContain(key);
});

it("uses the same provider UUID for retries of an outbox item, and a different UUID for another item", async () => {
  vi.mocked(fetch).mockImplementation(async () => accepted());
  for (const item of [
    "notification-a-email",
    "notification-a-email",
    "notification-b-email",
  ])
    await sendEmail(recipient, "Update", "Fixture", item);
  const keys = vi
    .mocked(fetch)
    .mock.calls.map(
      ([, options]) => JSON.parse(String(options?.body)).headers.idempotencyKey,
    );
  expect(keys[0]).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).not.toBe(keys[2]);
});

it.each([
  ["empty key", { brevoApiKey: "" }],
  ["key with whitespace", { brevoApiKey: "fixture key" }],
  ["sender list", { emailFrom: "a@example.test, b@example.test" }],
  ["invalid address", { emailFrom: "HireLens <invalid>" }],
  [
    "header injection",
    { emailFrom: "sender@example.test\r\nBcc: another@example.test" },
  ],
  ["unknown provider", { emailProvider: "misspelled" }],
])(
  "rejects %s before connecting without exposing configuration values",
  async (_name, settings) => {
    Object.assign(config, settings);
    const smtp = vi.spyOn(nodemailer, "createTransport");
    const report = providerConfiguration(config);
    expect(report.email.mode).toBe("invalid");
    expect(emailReady()).toBe(false);
    const error = await sendEmail(recipient, "Subject", "Fixture").catch(
      (value) => value,
    );
    expect(error).toMatchObject({ status: 503 });
    expect(error.message).not.toContain(key);
    expect(JSON.stringify(report)).not.toContain(key);
    expect(fetch).not.toHaveBeenCalled();
    expect(smtp).not.toHaveBeenCalled();
  },
);

it("supports a bare sender and an explicit HTTP choice even when stale SMTP settings remain", async () => {
  config.emailFrom = "sender@example.test";
  vi.mocked(fetch).mockResolvedValueOnce(accepted());
  await sendEmail(recipient, "Subject", "Fixture");
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).sender,
  ).toEqual({ email: "sender@example.test" });
  config.emailProvider = "http";
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ accepted: true, messageId: "http-fixture" })),
  );
  await sendEmail(recipient, "Subject", "Fixture");
  expect(vi.mocked(fetch).mock.calls[1][0]).toBe(config.emailUrl);
  expect(providerConfiguration(config).email.mode).toBe("http");
});

it.each([
  [400, "EMAIL_REJECTED"],
  [401, "EMAIL_REJECTED"],
  [429, "EMAIL_RETRYABLE"],
  [500, "EMAIL_ACCEPTANCE_UNKNOWN"],
])(
  "classifies HTTP %s without disclosing raw provider errors or credentials",
  async (status, code) => {
    const response = new Response(`Raw recipient information ${key}`, {
      status,
    });
    const cancel = vi.spyOn(response.body!, "cancel");
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const error = await sendEmail(recipient, "Subject", "Fixture").catch(
      (value) => value,
    );
    expect(error).toMatchObject({ code });
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain("Raw recipient");
    expect(cancel).toHaveBeenCalledOnce();
  },
);

it.each([
  [
    "blank message ID",
    () => new Response(JSON.stringify({ messageId: " " }), { status: 201 }),
  ],
  [
    "missing message ID",
    () => new Response(JSON.stringify({ accepted: true }), { status: 201 }),
  ],
  ["malformed JSON", () => new Response("not JSON", { status: 201 })],
  [
    "oversized response",
    () => new Response(" ".repeat(65537), { status: 201 }),
  ],
  [
    "unexpected success code",
    () =>
      new Response(JSON.stringify({ messageId: "unconfirmed" }), {
        status: 200,
      }),
  ],
])("does not claim acceptance after %s", async (_name, response) => {
  vi.mocked(fetch).mockResolvedValueOnce(response());
  await expect(
    sendEmail(recipient, "Subject", "Fixture"),
  ).rejects.toMatchObject({ code: "EMAIL_ACCEPTANCE_UNKNOWN" });
});

it("aborts stalled requests and returns a redacted uncertain-acceptance error", async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(controller.signal);
  vi.mocked(fetch).mockImplementationOnce(
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new Error(`Raw timeout ${key}`)),
        );
      }),
  );
  const pending = sendEmail(recipient, "Subject", "Fixture");
  expect(timeout).toHaveBeenCalledWith(15000);
  controller.abort();
  const error = await pending.catch((value) => value);
  expect(error).toMatchObject({ code: "EMAIL_ACCEPTANCE_UNKNOWN" });
  expect(error.message).not.toContain(key);
});

it("rejects an invalid recipient, injected subject or empty retry key before any send", async () => {
  for (const args of [
    ["invalid", "Subject", "Fixture"],
    [`${recipient}\n`, "Subject", "Fixture"],
    [recipient, "Subject\r\nBcc: other@example.test", "Fixture"],
    [recipient, "Subject", "Fixture", ""],
  ])
    await expect(
      sendEmail(args[0], args[1], args[2], args[3]),
    ).rejects.toMatchObject({ code: "EMAIL_REJECTED" });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["uncertain timeout", undefined, "failed"],
  ["explicit rate limit", 429, "retry"],
])(
  "does not resend an expired in-flight email and records an %s correctly",
  async (_label, status, state) => {
    if (status)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("redacted", { status }),
      );
    const updates = vi
      .spyOn(NotificationModel, "updateMany")
      .mockResolvedValue({} as any);
    const write = vi
      .spyOn(NotificationModel, "updateOne")
      .mockResolvedValue({} as any);
    vi.spyOn(NotificationModel, "findOneAndUpdate")
      .mockResolvedValueOnce({
        _id: "notification",
        id: "notification",
        userId: "user",
        href: "/notifications",
        get: () => 1,
      } as any)
      .mockResolvedValue(null);
    vi.spyOn(UserModel, "findById").mockResolvedValue({
      notificationEmail: true,
      emailVerifiedAt: new Date(),
      email: recipient,
    } as any);
    await deliverNotifications();
    expect(fetch).toHaveBeenCalledOnce();
    expect(updates).toHaveBeenCalledWith(
      { emailState: "sending", emailLease: { $lte: expect.any(Date) } },
      { $set: { emailState: "failed" }, $unset: { emailLeaseId: 1 } },
    );
    expect(write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ emailState: state }),
      }),
    );
  },
);
