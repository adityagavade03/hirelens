import nodemailer from "nodemailer";
import { parse } from "dotenv";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

export function gmailSettings(email: string, appPassword: string) {
  const user = email.trim().toLowerCase();
  const password = appPassword.replace(/\s/g, "");
  if (!/^[a-z0-9][a-z0-9._+\-]*@(gmail|googlemail)\.com$/.test(user))
    throw new Error("Enter the personal Gmail address you want HireLens to send from.");
  if (!/^[a-z]{16}$/.test(password))
    throw new Error("Enter Google's 16-letter App Password, not your normal Google password.");
  return { user, password };
}

async function verifyGmail(settings: ReturnType<typeof gmailSettings>) {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dnsTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    if (!(await transport.verify())) throw new Error();
  } catch {
    // SMTP errors can contain account information; never print the raw response.
    throw new Error("Gmail authentication failed. Check the account, App Password and network. No settings were changed.");
  } finally {
    transport.close();
  }
}

export async function prepareGmail(
  input: { email: string; appPassword: string },
  envPath: string,
  verify = verifyGmail,
) {
  const settings = gmailSettings(input.email, input.appPassword);
  const original = await readFile(envPath, "utf8");
  const existing = parse(original);
  if (existing.NODE_ENV === "production")
    throw new Error("This helper is for the local project. Configure production through its secret manager.");
  if ((existing.OTP_HASH_SECRET || "").length < 32)
    throw new Error("The existing company OTP secret needs setup first. It has not been replaced.");
  if (existing.MESSAGE_PREVIEW !== "true")
    throw new Error("Email previews must be enabled before this setup helper can change the sender.");
  await verify(settings);
  if ((await readFile(envPath, "utf8")) !== original)
    throw new Error("The environment file changed during verification. Run setup again; no settings were overwritten.");

  // Appending valid dotenv assignments preserves every existing value/comment,
  // including multiline secrets. dotenv uses the last assignment for each key.
  // Keep previews active until the administrator reviews the outbox and restarts.
  const block = [
    "", "# HireLens Gmail setup: verified credentials; delivery is still in preview mode.",
    'SMTP_HOST="smtp.gmail.com"', 'SMTP_PORT="465"', 'SMTP_SECURE="true"',
    `SMTP_USER="${settings.user}"`, `SMTP_PASSWORD="${settings.password}"`,
    `EMAIL_FROM="HireLens <${settings.user}>"`, 'MESSAGE_PREVIEW="true"', "",
  ].join("\n");
  const tempDir = resolve(dirname(envPath), ".data", "runtime");
  await mkdir(tempDir, { recursive: true });
  const temporary = resolve(tempDir, `gmail-setup-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, original + block, { flag: "wx", mode: 0o600 });
    await rename(temporary, envPath);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function main() {
  if (process.stdin.isTTY)
    throw new Error("Use npm run email:setup:gmail for hidden password entry.");
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 4096) throw new Error("Setup input is too large.");
  }
  let input: { email: string; appPassword: string };
  try {
    input = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (typeof input.email !== "string" || typeof input.appPassword !== "string")
      throw new Error();
  } catch {
    throw new Error("Use the Gmail setup prompt to enter your account details.");
  }
  await prepareGmail(input, resolve(".env"));
  console.log("Gmail connection and authentication passed. Credentials were saved privately in .env.");
  console.log("No email was sent. Preview mode remains ON; no pending notifications were released.");
  console.log("Return to Codex and say 'Gmail setup is done' so delivery can be activated and the API restarted.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error instanceof Error && !('code' in error)
      ? error.message
      : "Gmail setup could not access the local configuration. Check the project folder and permissions.");
    process.exitCode = 1;
  });
