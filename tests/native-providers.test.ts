import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { config, serviceStatus } from "../server/config";
import { providerConfiguration } from "../server/provider-configuration";
import { sendSms, deliverNotifications } from "../server/delivery";
import { verifyCashfreeCin } from "../server/native-providers";
import { CompanyModel, NotificationModel, UserModel } from "../server/models";
import { verifyCompany, type CompanyDetails } from "../server/onboarding";

const original = { ...config };
const accountSid = `AC${"1".repeat(32)}`;
const messageSid = `SM${"2".repeat(32)}`;
const company: CompanyDetails = {
  companyName: "Fixture Software Private Limited",
  officialEmail: "registry@fixture.example",
  registrationNumber: "U72900KA2020PTC123456",
  country: "IN",
  website: "https://fixture.example",
  industry: "Software",
  companyType: "Private company",
  address: "123 Fixture Road",
  phone: "+919876543210",
  location: "Fixture city",
};
beforeEach(() => {
  Object.assign(config, {
    production: false,
    messagePreview: false,
    smsProvider: "twilio",
    twilioAccountSid: accountSid,
    twilioApiKeySid: `SK${"3".repeat(32)}`,
    twilioApiKeySecret: "fixture-api-secret",
    twilioAuthToken: "",
    twilioFrom: "+15005550006",
    twilioMessagingServiceSid: "",
    verificationProvider: "cashfree",
    cashfreeEnvironment: "production",
    cashfreeClientId: "fixture-client",
    cashfreeClientSecret: "fixture-secret",
    cashfreePublicKey: "",
  });
  // Fail closed if any individual test forgets to stub a provider response.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("No live requests in tests"),
  );
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
function smsResponse(overrides: object = {}) {
  return new Response(
    JSON.stringify({
      account_sid: accountSid,
      sid: messageSid,
      status: "queued",
      ...overrides,
    }),
    { status: 201 },
  );
}
function cashfreeResponse(overrides: object = {}) {
  vi.mocked(fetch).mockImplementationOnce(async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({
        verification_id: request.verification_id,
        reference_id: 12345,
        status: "VALID",
        cin: company.registrationNumber,
        company_name: company.companyName,
        cin_status: "ACTIVE",
        email: company.officialEmail,
        incorporation_country: "INDIA",
        ...overrides,
      }),
    );
  });
}

it("sends Twilio form data with server-only API credentials and returns acceptance only", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(smsResponse());
  await expect(
    sendSms("+919876543210", "Fixture & verification link", "outbox-id"),
  ).resolves.toEqual({ accepted: true, messageId: messageSid });
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
  );
  expect(options).toMatchObject({ method: "POST", redirect: "error" });
  const headers = new Headers(options?.headers);
  expect(headers.get("authorization")).toBe(
    `Basic ${Buffer.from(`${config.twilioApiKeySid}:${config.twilioApiKeySecret}`).toString("base64")}`,
  );
  expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
  expect(headers.has("idempotency-key")).toBe(false);
  expect(
    Object.fromEntries(new URLSearchParams(String(options?.body))),
  ).toEqual({
    To: "+919876543210",
    Body: "Fixture & verification link",
    From: config.twilioFrom,
  });
});

it("supports a Messaging Service without requiring an additional From sender", async () => {
  config.twilioMessagingServiceSid = `MG${"4".repeat(32)}`;
  config.twilioFrom = "";
  vi.mocked(fetch).mockResolvedValueOnce(smsResponse({ status: "accepted" }));
  await sendSms("+919876543210", "Fixture");
  const body = new URLSearchParams(
    String(vi.mocked(fetch).mock.calls[0][1]?.body),
  );
  expect(body.get("MessagingServiceSid")).toBe(
    config.twilioMessagingServiceSid,
  );
  expect(body.has("From")).toBe(false);
});

it("permits Auth Token for local testing but requires an API key in production", async () => {
  config.twilioApiKeySid = "";
  config.twilioApiKeySecret = "";
  config.twilioAuthToken = "fixture-token";
  vi.mocked(fetch).mockResolvedValueOnce(smsResponse());
  await sendSms("+919876543210", "Fixture");
  const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
  expect(headers.get("authorization")).toBe(
    `Basic ${Buffer.from(`${accountSid}:fixture-token`).toString("base64")}`,
  );
  config.production = true;
  await expect(sendSms("+919876543210", "Fixture")).rejects.toMatchObject({
    status: 503,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects incomplete credentials, invalid senders and malformed destinations before sending", async () => {
  config.twilioApiKeySecret = "";
  config.twilioAuthToken = "must-not-fallback-from-incomplete-key";
  await expect(sendSms("+919876543210", "Fixture")).rejects.toMatchObject({
    status: 503,
  });
  config.twilioApiKeySecret = "fixture";
  config.twilioFrom = "https://malformed.example";
  await expect(sendSms("+919876543210", "Fixture")).rejects.toMatchObject({
    status: 503,
  });
  config.twilioFrom = "+15005550006";
  await expect(sendSms("9876543210", "Fixture")).rejects.toMatchObject({
    status: 400,
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  [400, "SMS_REJECTED"],
  [401, "SMS_REJECTED"],
  [429, "SMS_RETRYABLE"],
  [500, "SMS_ACCEPTANCE_UNKNOWN"],
])(
  "classifies Twilio HTTP %s without exposing provider text",
  async (status, code) => {
    const response = new Response("provider-secret customer data", { status });
    const cancel = vi.spyOn(response.body!, "cancel");
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const error = await sendSms("+919876543210", "Fixture").catch(
      (value) => value,
    );
    expect(error).toMatchObject({ code });
    expect(error.message).not.toContain("provider-secret");
    expect(cancel).toHaveBeenCalledOnce();
  },
);

it.each([
  ["wrong account", () => smsResponse({ account_sid: `AC${"9".repeat(32)}` })],
  ["unrecognized status", () => smsResponse({ status: "unknown" })],
  ["oversized response", () => new Response(" ".repeat(65537))],
])("does not confirm acceptance for a Twilio %s", async (_label, response) => {
  vi.mocked(fetch).mockResolvedValueOnce(response());
  await expect(sendSms("+919876543210", "Fixture")).rejects.toMatchObject({
    code: "SMS_ACCEPTANCE_UNKNOWN",
  });
});

it("does not automatically resend an uncertain or expired in-flight Twilio notification", async () => {
  const updates = vi
    .spyOn(NotificationModel, "updateMany")
    .mockResolvedValue({} as any);
  const write = vi
    .spyOn(NotificationModel, "updateOne")
    .mockResolvedValue({} as any);
  vi.spyOn(NotificationModel, "findOneAndUpdate")
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      _id: "fixture-notification",
      id: "fixture-notification",
      userId: "fixture-user",
      href: "/notifications",
      get: () => 1,
    } as any)
    .mockResolvedValueOnce(null);
  vi.spyOn(UserModel, "findById").mockResolvedValue({
    notificationSms: true,
    phoneVerifiedAt: new Date(),
    notificationPhone: "+919876543210",
  } as any);
  await deliverNotifications();
  expect(fetch).toHaveBeenCalledOnce();
  expect(updates).toHaveBeenCalledWith(
    expect.objectContaining({
      smsState: "sending",
      smsLease: expect.anything(),
    }),
    expect.objectContaining({ $set: { smsState: "failed" } }),
  );
  expect(write).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      $set: expect.objectContaining({ smsState: "failed" }),
    }),
  );
});

it("maps a live matching active Cashfree CIN response into the existing company verification flow", async () => {
  vi.spyOn(CompanyModel, "exists").mockResolvedValue(null);
  cashfreeResponse();
  await expect(verifyCompany(company)).resolves.toEqual({
    legalName: company.companyName,
    reference: "cashfree-cin:12345",
  });
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("https://api.cashfree.com/verification/cin");
  expect(options).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      "x-client-id": "fixture-client",
      "x-client-secret": "fixture-secret",
    },
  });
  const body = JSON.parse(String(options?.body));
  expect(body).toEqual({
    cin: company.registrationNumber,
    verification_id: expect.stringMatching(/^hirelens-[a-f0-9-]{36}$/),
  });
  expect(JSON.stringify(body)).not.toContain(company.officialEmail);
});

it("does not issue real verification for sandbox mode, unsupported countries or invalid CIN", async () => {
  config.cashfreeEnvironment = "sandbox";
  expect(providerConfiguration(config).companyVerification.mode).toBe(
    "sandbox",
  );
  expect(serviceStatus().companyVerification).toBe(false);
  await expect(verifyCashfreeCin(company)).rejects.toMatchObject({
    status: 503,
  });
  config.cashfreeEnvironment = "production";
  await expect(
    verifyCashfreeCin({ ...company, country: "US" }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    verifyCashfreeCin({ ...company, registrationNumber: "made-up" }),
  ).rejects.toMatchObject({ status: 422 });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["invalid CIN", { status: "INVALID" }, 422],
  ["inactive CIN", { cin_status: "STRIKE OFF" }, 422],
  ["different email", { email: "other@fixture.example" }, 422],
  ["different company", { company_name: "Different Company" }, 422],
  ["different CIN", { cin: "U72900KA2020PTC654321" }, 502],
  ["different country", { incorporation_country: "USA" }, 502],
  ["different request", { verification_id: "stale-request" }, 502],
  ["missing registry email", { email: null }, 502],
  ["missing reference", { reference_id: null }, 502],
])(
  "rejects Cashfree %s without turning email ownership into business verification",
  async (_label, override, status) => {
    cashfreeResponse(override);
    await expect(verifyCashfreeCin(company)).rejects.toMatchObject({ status });
  },
);

it("generates Cashfree RSA-OAEP signature using the downloaded public key and current timestamp", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  config.cashfreePublicKey = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  cashfreeResponse();
  await verifyCashfreeCin(company);
  const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
  const signature = Buffer.from(headers.get("x-cf-signature")!, "base64");
  const decoded = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    signature,
  ).toString();
  const [client, timestamp] = decoded.split(".");
  expect(client).toBe(config.cashfreeClientId);
  expect(Math.abs(Number(timestamp) - Date.now() / 1000)).toBeLessThan(5);
});

it("fails closed on Cashfree credentials, oversized responses and raw provider failures", async () => {
  config.cashfreeClientSecret = "";
  await expect(verifyCashfreeCin(company)).rejects.toMatchObject({
    status: 503,
  });
  expect(fetch).not.toHaveBeenCalled();
  config.cashfreeClientSecret = "fixture-secret";
  vi.mocked(fetch).mockResolvedValueOnce(new Response(" ".repeat(65537)));
  await expect(verifyCashfreeCin(company)).rejects.toMatchObject({
    status: 502,
  });
  const response = new Response("fixture-secret provider response", {
    status: 403,
  });
  const cancel = vi.spyOn(response.body!, "cancel");
  vi.mocked(fetch).mockResolvedValueOnce(response);
  await expect(verifyCashfreeCin(company)).rejects.toMatchObject({
    status: 502,
  });
  expect(cancel).toHaveBeenCalledOnce();
  vi.mocked(fetch).mockRejectedValueOnce(
    new Error("fixture-secret provider response"),
  );
  await expect(verifyCashfreeCin(company)).rejects.not.toThrow(
    "fixture-secret",
  );
});

it("exposes native readiness without disclosing credentials and rejects unknown provider selections", () => {
  expect(serviceStatus()).toMatchObject({
    sms: true,
    companyVerification: true,
    delivery: { smsMode: "twilio", companyVerificationMode: "cashfree" },
  });
  const report = JSON.stringify(providerConfiguration(config));
  expect(report).not.toContain(config.cashfreeClientSecret);
  expect(report).not.toContain(config.twilioApiKeySecret);
  config.smsProvider = "typo";
  config.verificationProvider = "typo";
  expect(serviceStatus()).toMatchObject({
    sms: false,
    companyVerification: false,
  });
});
