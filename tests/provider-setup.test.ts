import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse } from "dotenv";
import { config } from "../server/config";
import {
  prepareProviderFields,
  stageProviderSettings,
  validatePublicTurnSettings,
} from "../scripts/setup-providers";
import { interviewProviderReadiness } from "../scripts/provider-readiness";

const twilio = {
  service: "twilio-both",
  TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
  TWILIO_API_KEY_SID: "SK" + "2".repeat(32),
  TWILIO_API_KEY_SECRET: "synthetic-private-api-secret",
  TWILIO_MESSAGING_SERVICE_SID: "MG" + "3".repeat(32),
};
const judge = {
  service: "judge0",
  JUDGE0_URL: "https://judge.example.test",
  JUDGE0_API_KEY: "synthetic-private-executor-secret",
};
const cashfree = {
  service: "cashfree",
  CASHFREE_ENVIRONMENT: "production",
  CASHFREE_CLIENT_ID: "synthetic-client",
  CASHFREE_CLIENT_SECRET: "synthetic-secret",
  CASHFREE_IP_ALLOWLIST_CONFIRMED: "yes",
};
let directory = "";
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "hirelens-provider-setup-"));
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("Setup must never call a provider");
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  const resolved = resolve(directory);
  if (
    dirname(resolved) !== resolve(tmpdir()) ||
    !resolved.startsWith(join(resolve(tmpdir()), "hirelens-provider-setup-"))
  )
    throw new Error("Unexpected temporary test directory");
  await rm(resolved, { recursive: true, force: true });
});

it("stages only selected fields without reading/changing live settings or sending requests", async () => {
  const original =
    'SMTP_PASSWORD="keep-existing-gmail"\nMESSAGE_PREVIEW=false\nOTP_HASH_SECRET="keep-existing-otp"\n';
  await writeFile(join(directory, ".env"), original);
  const result = await stageProviderSettings(
    { ...twilio, SMTP_PASSWORD: "do-not-copy", MESSAGE_PREVIEW: "true" },
    directory,
  );
  expect(await readFile(join(directory, ".env"), "utf8")).toBe(original);
  expect(dirname(result.destination)).toBe(
    join(directory, ".data", "provider-setup"),
  );
  const staged = parse(await readFile(result.destination));
  expect(staged).toMatchObject({
    SMS_PROVIDER: "twilio",
    TURN_PROVIDER: "twilio",
    TURN_LOCAL_DEV: "false",
    TWILIO_FROM: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_API_KEY_SECRET: twilio.TWILIO_API_KEY_SECRET,
  });
  expect(staged.SMTP_PASSWORD).toBeUndefined();
  expect(staged.MESSAGE_PREVIEW).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain(twilio.TWILIO_API_KEY_SECRET);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps repeated staged configurations separate", async () => {
  const first = await stageProviderSettings(judge, directory);
  const second = await stageProviderSettings(
    { ...judge, JUDGE0_API_KEY: "replacement-synthetic-key" },
    directory,
  );
  expect(first.destination).not.toBe(second.destination);
  expect(parse(await readFile(first.destination)).JUDGE0_API_KEY).toBe(
    judge.JUDGE0_API_KEY,
  );
  expect(
    await readdir(join(directory, ".data", "provider-setup")),
  ).toHaveLength(2);
});

it.each([
  "http://executor.example.test",
  "https://user:secret@executor.example.test",
  "https://executor.example.test?key=secret",
  "https://executor.example.test/#secret",
  "https://ce.judge0.com",
  "https://extra-ce.judge0.com.",
])(
  "rejects unsafe or public hiring execution configuration: %s",
  async (url) => {
    await expect(
      stageProviderSettings({ ...judge, JUDGE0_URL: url }, directory),
    ).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("permits the authenticated loopback executor and checks RapidAPI host binding", () => {
  expect(
    prepareProviderFields({ ...judge, JUDGE0_URL: "http://127.0.0.1:2358" })
      .fields.JUDGE0_AUTH_HEADER,
  ).toBe("X-Auth-Token");
  expect(
    prepareProviderFields({
      ...judge,
      JUDGE0_AUTH_HEADER: "X-RapidAPI-Key",
      JUDGE0_RAPIDAPI_HOST: "judge.example.test",
    }).fields.JUDGE0_RAPIDAPI_HOST,
  ).toBe("judge.example.test");
  expect(() =>
    prepareProviderFields({
      ...judge,
      JUDGE0_AUTH_HEADER: "X-RapidAPI-Key",
      JUDGE0_RAPIDAPI_HOST: "other.example.test",
    }),
  ).toThrow("must match");
  expect(() =>
    prepareProviderFields({ ...judge, JUDGE0_AUTH_HEADER: "Cookie" }),
  ).toThrow("JUDGE0_AUTH_HEADER");
});

it("refuses blank/injected settings, unsupported service paths and incomplete Twilio credentials", async () => {
  for (const value of [
    "",
    " ",
    "secret\nMESSAGE_PREVIEW=false",
    "secret\0value",
  ])
    await expect(
      stageProviderSettings(
        { ...twilio, TWILIO_API_KEY_SECRET: value },
        directory,
      ),
    ).rejects.toThrow("TWILIO_API_KEY_SECRET");
  expect(() => prepareProviderFields({ service: "../../.env" })).toThrow(
    "Choose",
  );
  expect(() =>
    prepareProviderFields({ ...twilio, TWILIO_API_KEY_SID: "invalid" }),
  ).toThrow("API Key SID");
  expect(() =>
    prepareProviderFields({
      ...twilio,
      TWILIO_MESSAGING_SERVICE_SID: "",
      TWILIO_FROM: "",
    }),
  ).toThrow("authorized");
  expect(await readdir(directory)).toEqual([]);
});

it("does not stage SMS activation for TURN only or TURN activation for SMS only", () => {
  const relay = prepareProviderFields({
    ...twilio,
    service: "twilio-turn",
  }).fields;
  expect(relay.TURN_PROVIDER).toBe("twilio");
  expect(relay.SMS_PROVIDER).toBeUndefined();
  expect(relay.TWILIO_FROM).toBeUndefined();
  const sms = prepareProviderFields({
    ...twilio,
    service: "twilio-sms",
  }).fields;
  expect(sms.SMS_PROVIDER).toBe("twilio");
  expect(sms.TURN_PROVIDER).toBeUndefined();
});

it("rejects local/private relays and malformed transports while allowing public UDP/TCP/TLS configuration", () => {
  const base = { TURN_SECRET: "x".repeat(32) };
  for (const TURN_URL of [
    "turn:localhost:3478",
    "turn:127.0.0.01:3478",
    "turn:192.168.1.10:3478",
    "turn:172.20.1.1:3478",
    "turn:[::1]:3478",
    "turn:[fd00::10]:3478",
    "turn:host.local:3478",
    "turn:turn.example.test:99999",
    "turns:turn.example.test:5349?transport=udp",
    "TURNS:turn.example.test:5349?transport=UDP",
    "turn:user:password@turn.example.test:3478",
    "turn:turn.example.test:3478?token=secret",
  ])
    expect(validatePublicTurnSettings({ ...base, TURN_URL })).not.toEqual([]);
  expect(
    validatePublicTurnSettings({
      ...base,
      TURN_URL:
        "turn:turn.example.test:3478?transport=udp,turn:turn.example.test:3478?transport=tcp,turns:turn.example.test:5349?transport=tcp",
    }),
  ).toEqual([]);
});

it("requires Cashfree public authentication readiness but preserves sandbox as sandbox", () => {
  expect(() =>
    prepareProviderFields({ ...cashfree, CASHFREE_IP_ALLOWLIST_CONFIRMED: "" }),
  ).toThrow("allowlisted");
  expect(
    prepareProviderFields({
      ...cashfree,
      CASHFREE_ENVIRONMENT: "sandbox",
      CASHFREE_IP_ALLOWLIST_CONFIRMED: "",
    }).fields.CASHFREE_ENVIRONMENT,
  ).toBe("sandbox");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  expect(
    prepareProviderFields({
      ...cashfree,
      CASHFREE_IP_ALLOWLIST_CONFIRMED: "",
      CASHFREE_PUBLIC_KEY: publicKey.trim().replace(/\n/g, "\\n"),
    }).fields.CASHFREE_PUBLIC_KEY,
  ).toContain("PUBLIC KEY");
  expect(() =>
    prepareProviderFields({
      ...cashfree,
      CASHFREE_PUBLIC_KEY: privateKey.trim().replace(/\n/g, "\\n"),
    }),
  ).toThrow("never a private key");
});

it("preserves dotenv-special characters losslessly and never serializes arbitrary fields", async () => {
  const secret = 'literal # dollar $ backslash\\n and "quoted" text';
  const result = await stageProviderSettings(
    { ...judge, JUDGE0_API_KEY: secret, DATABASE_PASSWORD: "do-not-stage" },
    directory,
  );
  const parsed = parse(await readFile(result.destination));
  expect(parsed.JUDGE0_API_KEY).toBe(secret);
  expect(parsed.DATABASE_PASSWORD).toBeUndefined();
});

it("reports public practice and local relay separately from configured/unverified external services", () => {
  const report = interviewProviderReadiness({
    ...config,
    judgeUrl: "https://ce.judge0.com",
    judgeKey: "",
    turnProvider: "hmac",
    turnLocalDev: true,
  });
  expect(report.execution).toMatchObject({
    mode: "public-practice-only",
    configuredForExternalUse: false,
  });
  expect(report.relay).toMatchObject({
    mode: "local-test-only",
    configuredForExternalUse: false,
  });
  const external = interviewProviderReadiness({
    ...config,
    production: true,
    judgeUrl: judge.JUDGE0_URL,
    judgeKey: judge.JUDGE0_API_KEY,
    judgeHeader: "X-Auth-Token",
    rapidHost: "",
    turnProvider: "twilio",
    twilioAccountSid: twilio.TWILIO_ACCOUNT_SID,
    twilioApiKeySid: twilio.TWILIO_API_KEY_SID,
    twilioApiKeySecret: twilio.TWILIO_API_KEY_SECRET,
  });
  expect(external.execution.mode).toBe("private-configured-unverified");
  expect(external.relay.mode).toBe("twilio-configured-unverified");
  expect(JSON.stringify(external)).not.toContain(twilio.TWILIO_API_KEY_SECRET);
  expect(JSON.stringify(external)).not.toContain(judge.JUDGE0_URL);
  expect(fetch).not.toHaveBeenCalled();
});
