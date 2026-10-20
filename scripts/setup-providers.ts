import { randomUUID, createPublicKey } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

const services = [
  "judge0",
  "turn-hmac",
  "twilio-turn",
  "twilio-sms",
  "twilio-both",
  "cashfree",
] as const;
export type SetupService = (typeof services)[number];
type Fields = Record<string, string>;
class SetupError extends Error {}
const fail = (message: string): never => {
  throw new SetupError(message);
};

function field(input: Record<string, unknown>, name: string, optional = false) {
  const value = input[name];
  if ((value === undefined || value === "") && optional) return "";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 16384 ||
    /[\r\n\0]/.test(value)
  )
    fail(name + " must be a nonempty, single-line value.");
  return (value as string).trim();
}

function hostname(value: string) {
  if (isIP(value.replace(/^\[|\]$/g, ""))) return true;
  return (
    value.length <= 253 &&
    value
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}

function localAddress(value: string) {
  let host = value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  // URL parsing normalizes IPv4 aliases such as 127.0.0.01 before classification.
  if (!host.includes(":")) {
    try {
      host = new URL("https://" + host).hostname;
    } catch {
      return true;
    }
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (!host.includes(":") && !host.includes("."))
  )
    return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (isIP(host) === 6)
    return (
      host === "::" ||
      host === "::1" ||
      /^(?:fc|fd|fe[89ab]|ff)/i.test(host) ||
      host.startsWith("::ffff:")
    );
  return false;
}

export function validateJudgeSettings(input: Fields) {
  const issues: string[] = [];
  let url: URL | undefined;
  try {
    url = new URL(input.JUDGE0_URL);
  } catch {
    /* Report only field names. */
  }
  if (
    !url ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !hostname(url.hostname) ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
  )
    issues.push(
      "JUDGE0_URL must be authenticated HTTPS without URL credentials, query or fragment; loopback HTTP is allowed for a local executor.",
    );
  if (
    url &&
    ["ce.judge0.com", "extra-ce.judge0.com"].includes(
      url.hostname.toLowerCase().replace(/\.$/, ""),
    )
  )
    issues.push(
      "The public Judge0 demonstration endpoint cannot be staged for hiring interviews.",
    );
  if (!input.JUDGE0_API_KEY?.trim())
    issues.push(
      "JUDGE0_API_KEY is required for the private execution service.",
    );
  if (!["X-Auth-Token", "X-RapidAPI-Key"].includes(input.JUDGE0_AUTH_HEADER))
    issues.push("JUDGE0_AUTH_HEADER must be X-Auth-Token or X-RapidAPI-Key.");
  if (
    input.JUDGE0_AUTH_HEADER === "X-RapidAPI-Key" &&
    (!input.JUDGE0_RAPIDAPI_HOST ||
      input.JUDGE0_RAPIDAPI_HOST !== url?.hostname)
  )
    issues.push(
      "JUDGE0_RAPIDAPI_HOST must match the supplied RapidAPI endpoint hostname.",
    );
  if (
    input.JUDGE0_AUTH_HEADER !== "X-RapidAPI-Key" &&
    input.JUDGE0_RAPIDAPI_HOST
  )
    issues.push("Leave JUDGE0_RAPIDAPI_HOST empty when using X-Auth-Token.");
  return issues;
}

export function validatePublicTurnSettings(input: Fields) {
  const issues: string[] = [];
  const urls = (input.TURN_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (!urls.length || urls.length > 8)
    issues.push("TURN_URL needs 1 to 8 relay URLs.");
  for (const url of urls) {
    const match =
      /^(turns?):(\[[^\]]+\]|[a-z0-9.-]+):([0-9]{1,5})(?:\?transport=(udp|tcp))?$/i.exec(
        url,
      );
    if (
      !match ||
      !hostname(match[2]) ||
      localAddress(match[2]) ||
      +match[3] < 1 ||
      +match[3] > 65535 ||
      (match[1].toLowerCase() === "turns" && match[4]?.toLowerCase() === "udp")
    ) {
      issues.push(
        "TURN_URL must use public turn:/turns: hostnames or addresses with a valid port; TLS relays use TCP.",
      );
      break;
    }
  }
  if ((input.TURN_SECRET || "").length < 32)
    issues.push(
      "TURN_SECRET needs at least 32 characters and must match Coturn static-auth-secret.",
    );
  if (input.TURN_LOCAL_DEV === "true")
    issues.push("A same-computer test relay cannot serve public interviews.");
  return issues;
}

export function prepareProviderFields(raw: unknown): {
  service: SetupService;
  fields: Fields;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail("Use the provider setup prompt.");
  const input = raw as Record<string, unknown>;
  if (!services.includes(input.service as SetupService))
    fail("Choose Judge0, public Coturn, Twilio SMS/TURN or Cashfree.");
  const service = input.service as SetupService;
  const fields: Fields = {};
  if (service === "judge0") {
    for (const name of ["JUDGE0_URL", "JUDGE0_API_KEY"])
      fields[name] = field(input, name);
    fields.JUDGE0_AUTH_HEADER =
      field(input, "JUDGE0_AUTH_HEADER", true) || "X-Auth-Token";
    fields.JUDGE0_RAPIDAPI_HOST = field(input, "JUDGE0_RAPIDAPI_HOST", true);
    const issues = validateJudgeSettings(fields);
    if (issues.length) fail(issues.join(" "));
  } else if (service === "turn-hmac") {
    fields.TURN_PROVIDER = "hmac";
    fields.TURN_URL = field(input, "TURN_URL");
    fields.TURN_SECRET = field(input, "TURN_SECRET");
    fields.TURN_LOCAL_DEV = "false";
    fields.TURN_TTL_SECONDS = "3600";
    const issues = validatePublicTurnSettings(fields);
    if (issues.length) fail(issues.join(" "));
  } else if (service.startsWith("twilio-")) {
    for (const name of [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",
    ])
      fields[name] = field(input, name);
    if (!/^AC[0-9a-f]{32}$/i.test(fields.TWILIO_ACCOUNT_SID))
      fail("TWILIO_ACCOUNT_SID must be a valid Account SID.");
    if (!/^SK[0-9a-f]{32}$/i.test(fields.TWILIO_API_KEY_SID))
      fail("TWILIO_API_KEY_SID must be a valid API Key SID.");
    // The shared API key replaces the development fallback explicitly.
    fields.TWILIO_AUTH_TOKEN = "";
    if (service !== "twilio-turn") {
      fields.SMS_PROVIDER = "twilio";
      fields.TWILIO_FROM = field(input, "TWILIO_FROM", true);
      fields.TWILIO_MESSAGING_SERVICE_SID = field(
        input,
        "TWILIO_MESSAGING_SERVICE_SID",
        true,
      );
      if (fields.TWILIO_MESSAGING_SERVICE_SID) {
        if (!/^MG[0-9a-f]{32}$/i.test(fields.TWILIO_MESSAGING_SERVICE_SID))
          fail(
            "TWILIO_MESSAGING_SERVICE_SID must be a valid Messaging Service SID.",
          );
        fields.TWILIO_FROM = "";
      } else if (
        !/^\+[1-9]\d{6,14}$/.test(fields.TWILIO_FROM) &&
        !/^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/.test(fields.TWILIO_FROM)
      )
        fail(
          "Enter an authorized TWILIO_FROM sender or a Messaging Service SID.",
        );
    }
    if (service !== "twilio-sms") {
      fields.TURN_PROVIDER = "twilio";
      fields.TURN_LOCAL_DEV = "false";
      fields.TURN_TTL_SECONDS = "3600";
    }
  } else {
    fields.COMPANY_VERIFICATION_PROVIDER = "cashfree";
    fields.CASHFREE_ENVIRONMENT = field(input, "CASHFREE_ENVIRONMENT");
    if (!["production", "sandbox"].includes(fields.CASHFREE_ENVIRONMENT))
      fail("CASHFREE_ENVIRONMENT must be production or sandbox.");
    fields.CASHFREE_CLIENT_ID = field(input, "CASHFREE_CLIENT_ID");
    fields.CASHFREE_CLIENT_SECRET = field(input, "CASHFREE_CLIENT_SECRET");
    fields.CASHFREE_PUBLIC_KEY = field(input, "CASHFREE_PUBLIC_KEY", true);
    if (fields.CASHFREE_PUBLIC_KEY) {
      if (fields.CASHFREE_PUBLIC_KEY.includes("PRIVATE KEY"))
        fail("Enter the Cashfree RSA public key, never a private key.");
      try {
        if (
          createPublicKey(fields.CASHFREE_PUBLIC_KEY.replace(/\\n/g, "\n"))
            .asymmetricKeyType !== "rsa"
        )
          throw new Error();
      } catch {
        fail(
          "CASHFREE_PUBLIC_KEY must be a valid RSA public key from Cashfree.",
        );
      }
    } else if (
      fields.CASHFREE_ENVIRONMENT === "production" &&
      input.CASHFREE_IP_ALLOWLIST_CONFIRMED !== "yes"
    )
      fail(
        "Provide Cashfree's RSA public key or confirm the server outbound IPv4 is allowlisted.",
      );
  }
  return { service, fields };
}

function dotenvLine(key: string, value: string) {
  // dotenv has several quote forms; verify lossless parsing without inventing escapes.
  for (const quote of ["'", '"', String.fromCharCode(96)]) {
    if (value.includes(quote)) continue;
    const line = key + "=" + quote + value + quote;
    if (parse(line)[key] === value) return line;
  }
  return fail(
    key +
      " contains unsupported quoting. Configure that value through the server secret manager.",
  );
}

export async function stageProviderSettings(raw: unknown, projectRoot: string) {
  const { service, fields } = prepareProviderFields(raw);
  const contents = [
    "# PRIVATE, UNVERIFIED provider configuration. Not loaded by HireLens.",
    "# Merge only the selected settings into the API environment after the activation review.",
    "# This file does not change Gmail, MESSAGE_PREVIEW, company records or running services.",
    ...Object.entries(fields).map(([key, value]) => dotenvLine(key, value)),
    "",
  ].join("\n");
  const directory = resolve(projectRoot, ".data", "provider-setup");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = resolve(directory, service + "-" + randomUUID() + ".env");
  await writeFile(destination, contents, { flag: "wx", mode: 0o600 });
  return { destination, service, keys: Object.keys(fields) };
}

async function main() {
  if (process.stdin.isTTY || process.argv.length > 2)
    fail(
      "Use npm run providers:setup for hidden credential entry; never pass keys as command arguments.",
    );
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 32768) fail("Setup input is too large.");
  }
  let input: unknown;
  try {
    input = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    fail("Use the provider setup prompt to enter settings.");
  }
  const result = await stageProviderSettings(input, process.cwd());
  console.log(
    "Staged " + result.service + " settings privately in " + result.destination,
  );
  console.log(
    "Validated field structure only (" +
      result.keys.length +
      " settings). No provider connection or live delivery was tested.",
  );
  console.log(
    "The running application and .env are unchanged. No messages, tokens, code submissions or company lookups were sent.",
  );
  console.log(
    "Next: docs/PROVIDER-ACTIVATION.md. Do not paste or upload the staged credentials.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      error instanceof SetupError
        ? error.message
        : "Provider setup could not write its private configuration. Check folder permissions; no live settings were changed.",
    );
    process.exitCode = 1;
  });
