import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "dotenv";
import nodemailer from "nodemailer";
import { gmailSettings, prepareGmail } from "../scripts/setup-gmail";

const password = "abcdefghijklmnop";
const input = {
  email: "  Sender.Example@gmail.com  ",
  appPassword: "abcd efgh ijkl mnop",
};
const secret = "existing-company-otp-secret-with-at-least-32-characters";
const original = [
  "# Preserve this comment and unrelated configuration exactly",
  "NODE_ENV=development",
  "MESSAGE_PREVIEW=true",
  `OTP_HASH_SECRET="${secret}"`,
  'MULTILINE_VALUE="first line',
  "second line with # literal hash",
  'third line"',
  'EMAIL_DELIVERY_URL="https://adapter.example.test/send"',
  'SMTP_HOST="old.example.test"',
  "SMTP_PORT=587",
  "SMTP_SECURE=false",
  'SMTP_USER="old@example.test"',
  'SMTP_PASSWORD="old-synthetic-secret"',
  "CUSTOM_SETTING=preserve-me",
].join("\r\n");
let directory: string;
let envPath: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "hirelens-gmail-setup-"));
  envPath = join(directory, ".env");
  await writeFile(envPath, original);
});
afterEach(async () => {
  vi.restoreAllMocks();
  // Remove only the unique temporary test directory created above.
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !resolve(directory).startsWith(
      join(resolve(tmpdir()), "hirelens-gmail-setup-"),
    )
  )
    throw new Error("Refusing to remove an unexpected test directory");
  await rm(directory, { recursive: true, force: true });
});

it("normalizes a personal Gmail sender and grouped app password without allowing env injection", () => {
  expect(gmailSettings(input.email, input.appPassword)).toEqual({
    user: "sender.example@gmail.com",
    password,
  });
  expect(gmailSettings("sender@googlemail.com", password).user).toBe(
    "sender@googlemail.com",
  );
  for (const email of [
    "sender@company.example",
    "sender@gmail.com\nMESSAGE_PREVIEW=false",
    'sender"@gmail.com',
  ])
    expect(() => gmailSettings(email, password)).toThrow(
      "personal Gmail address",
    );
  for (const value of [
    "normal-password",
    "abc",
    'abcdefghijklmnop"\nVALUE=true',
  ])
    expect(() => gmailSettings("sender@gmail.com", value)).toThrow(
      "16-letter App Password",
    );
});

it("saves authenticated settings while preserving OTP, multiline values, comments and preview mode", async () => {
  const verify = vi.fn().mockResolvedValue(undefined);
  await prepareGmail(input, envPath, verify);
  expect(verify).toHaveBeenCalledExactlyOnceWith({
    user: "sender.example@gmail.com",
    password,
  });
  const saved = await readFile(envPath, "utf8");
  expect(saved.startsWith(original)).toBe(true);
  expect(parse(saved)).toMatchObject({
    ...parse(original),
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "sender.example@gmail.com",
    SMTP_PASSWORD: password,
    EMAIL_FROM: "HireLens <sender.example@gmail.com>",
    OTP_HASH_SECRET: secret,
    MESSAGE_PREVIEW: "true",
  });
  expect(await readdir(join(directory, ".data", "runtime"))).toEqual([]);
});

it("does not verify or change the environment for invalid user input", async () => {
  const verify = vi.fn();
  await expect(
    prepareGmail({ ...input, appPassword: "wrong" }, envPath, verify),
  ).rejects.toThrow("16-letter App Password");
  expect(verify).not.toHaveBeenCalled();
  expect(await readFile(envPath, "utf8")).toBe(original);
});

it("preserves the entire environment when SMTP authentication fails", async () => {
  const verify = vi
    .fn()
    .mockRejectedValue(new Error("synthetic authentication failure"));
  await expect(prepareGmail(input, envPath, verify)).rejects.toThrow(
    "synthetic authentication failure",
  );
  expect(await readFile(envPath, "utf8")).toBe(original);
  expect(await readdir(directory)).toEqual([".env"]);
});

it("does not overwrite a concurrent environment edit made during authentication", async () => {
  const changed = original + "\r\nSOMEONE_ELSES_UPDATE=keep-this\r\n";
  const verify = vi.fn(async () => {
    await writeFile(envPath, changed);
  });
  await expect(prepareGmail(input, envPath, verify)).rejects.toThrow(
    "changed during verification",
  );
  expect(await readFile(envPath, "utf8")).toBe(changed);
  expect(await readdir(directory)).toEqual([".env"]);
});

it.each([
  [
    "production",
    original.replace("NODE_ENV=development", "NODE_ENV=production"),
    "local project",
  ],
  [
    "short OTP secret",
    original.replace(secret, "short"),
    "OTP secret needs setup",
  ],
  [
    "active delivery",
    original.replace("MESSAGE_PREVIEW=true", "MESSAGE_PREVIEW=false"),
    "previews must be enabled",
  ],
])(
  "rejects unsafe setup prerequisites: %s",
  async (_label, content, message) => {
    await writeFile(envPath, content);
    const verify = vi.fn();
    await expect(prepareGmail(input, envPath, verify)).rejects.toThrow(message);
    expect(verify).not.toHaveBeenCalled();
    expect(await readFile(envPath, "utf8")).toBe(content);
  },
);

it("uses TLS and verify only, closes the transport and never sends a message", async () => {
  const verify = vi.fn().mockResolvedValue(true);
  const sendMail = vi.fn();
  const close = vi.fn();
  const create = vi
    .spyOn(nodemailer, "createTransport")
    .mockReturnValue({ verify, sendMail, close } as any);
  await prepareGmail(input, envPath);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "sender.example@gmail.com", pass: password },
    }),
  );
  expect(verify).toHaveBeenCalledOnce();
  expect(sendMail).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(parse(await readFile(envPath, "utf8")).MESSAGE_PREVIEW).toBe("true");
});

it("redacts SMTP failures, closes the transport and leaves credentials unsaved", async () => {
  const close = vi.fn();
  const sendMail = vi.fn();
  vi.spyOn(nodemailer, "createTransport").mockReturnValue({
    verify: vi
      .fn()
      .mockRejectedValue(new Error(`raw SMTP response contains ${password}`)),
    close,
    sendMail,
  } as any);
  await expect(prepareGmail(input, envPath)).rejects.toThrow(
    "Gmail authentication failed. Check the account, App Password and network. No settings were changed.",
  );
  expect(close).toHaveBeenCalledOnce();
  expect(sendMail).not.toHaveBeenCalled();
  expect(await readFile(envPath, "utf8")).toBe(original);
});
