import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isIP } from "node:net";
import { parse } from "dotenv";

type Fields = Record<string, string>;
const secretNames = [
  "MONGO_ROOT_PASSWORD",
  "MONGO_APP_PASSWORD",
  "REDIS_PASSWORD",
  "OTP_HASH_SECRET",
] as const;
const httpServices = [
  ["JUDGE0_URL", "JUDGE0_API_KEY", ""],
  ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"],
  ["STT_BASE_URL", "STT_API_KEY", "STT_MODEL"],
  ["DIARIZATION_URL", "DIARIZATION_API_KEY", ""],
] as const;

// This validator reads the deployment file, never the developer's .env. Its
// messages deliberately contain field names only, not endpoints or secret values.
export function productionDeploymentIssues(fields: Fields) {
  const issues: string[] = [];
  const domain = fields.SITE_DOMAIN || "";
  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    isIP(domain) ||
    !labels.every((part) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part),
    ) ||
    /(?:^|\.)(?:localhost|local|test|invalid|example)$/i.test(domain) ||
    /(?:^|\.)example\.(?:com|net|org)$/i.test(domain)
  )
    issues.push(
      "SITE_DOMAIN must be a real public DNS hostname without a scheme, port or path.",
    );
  for (const name of secretNames) {
    if (
      !/^[a-f0-9]{64,128}$/i.test(fields[name] || "") ||
      /^([a-f0-9])\1+$/i.test(fields[name] || "")
    )
      issues.push(
        `${name} needs an independently generated 64–128 character hex secret.`,
      );
  }
  const presentSecrets = secretNames
    .map((name) => fields[name])
    .filter(Boolean);
  if (new Set(presentSecrets).size !== presentSecrets.length)
    issues.push(
      "MONGO_ROOT_PASSWORD, MONGO_APP_PASSWORD, REDIS_PASSWORD and OTP_HASH_SECRET must be different.",
    );
  for (const name of [
    "ALLOW_DEMO_LOGIN",
    "ALLOW_LOCAL_COMPANY_REGISTRATION",
    "MESSAGE_PREVIEW",
    "TURN_LOCAL_DEV",
  ])
    if (fields[name] && fields[name] !== "false")
      issues.push(`${name} must be false or omitted for this deployment.`);
  for (const name of [
    "COMPANY_LOGIN_OTP_REQUIRED",
    "EMAIL_VERIFICATION_REQUIRED",
  ])
    if (fields[name] && fields[name] !== "true")
      issues.push(`${name} must be true or omitted in production.`);
  if (
    Object.keys(fields).some(
      (name) => name.startsWith("PRIVATE_PREVIEW_") && fields[name],
    )
  )
    issues.push(
      "PRIVATE_PREVIEW_ settings belong to temporary previews and must be omitted.",
    );
  if (fields.NODE_ENV && fields.NODE_ENV !== "production")
    issues.push(
      "NODE_ENV must be production or omitted; Compose sets production.",
    );
  for (const name of [
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
    "PATH",
    "Path",
  ])
    if (fields[name])
      issues.push(
        `${name} must be omitted from this deployment environment file.`,
      );
  if (fields.APP_ORIGIN && fields.APP_ORIGIN !== `https://${domain}`)
    issues.push(
      "APP_ORIGIN must match https://SITE_DOMAIN or be omitted; Compose derives it.",
    );
  for (const [endpoint, key, model] of httpServices) {
    if (![endpoint, key, model].some((name) => name && fields[name])) continue;
    if (!fields[key]?.trim())
      issues.push(`${key} is missing for the configured service.`);
    if (model && !fields[model]?.trim())
      issues.push(`${model} is missing for the configured service.`);
    try {
      const url = new URL(fields[endpoint]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname) ||
        url.hostname.endsWith(".localhost")
      )
        throw new Error("Invalid provider endpoint");
    } catch {
      issues.push(
        `${endpoint} must be authenticated HTTPS outside the app container, without URL credentials, a query or fragment. Container localhost does not reach this laptop's services.`,
      );
    }
  }
  for (const [name, value] of Object.entries(fields)) {
    if (
      value.includes("\0") ||
      (name !== "CASHFREE_PUBLIC_KEY" && /[\r\n]/.test(value))
    )
      issues.push(`${name} must be a single-line environment value.`);
  }
  return issues;
}

// Compose expands $ in unquoted/double-quoted .env values, while dotenv does
// not. Require literal dollar values to be single quoted so the checker and
// actual containers use the same credentials. Hex database secrets avoid this.
export function productionFileIssues(source: string) {
  return source.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    return match && match[2].includes("$") && !match[2].startsWith("'")
      ? [
          `${match[1]} contains a dollar sign; use a single-quoted literal value to avoid Compose interpolation.`,
        ]
      : [];
  });
}

export function productionChildEnvironment(
  fields: Fields,
  envPath: string,
  inherited: NodeJS.ProcessEnv = process.env,
) {
  const environment: NodeJS.ProcessEnv = {};
  // Preserve only operating-system paths. Never merge unrelated local provider
  // keys or NODE_OPTIONS into a production check and report them as configured.
  for (const name of [
    "PATH",
    "Path",
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "TEMP",
    "TMP",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "windir",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "ProgramData",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "SystemDrive",
    "COMSPEC",
    "ComSpec",
  ])
    if (inherited[name]) environment[name] = inherited[name];
  return {
    ...environment,
    ...fields,
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "4000",
    APP_ORIGIN: `https://${fields.SITE_DOMAIN}`,
    MESSAGE_PREVIEW: "false",
    ALLOW_DEMO_LOGIN: "false",
    DOTENV_CONFIG_PATH: envPath,
    HIRELENS_PRODUCTION_ENV_FILE: envPath,
  };
}

function command(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
) {
  return new Promise<{ ok: boolean; output: string }>((accept) => {
    const child = spawn(executable, args, {
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      if (output.length < 65536) output += chunk.toString();
    });
    // Docker errors can echo interpolated credentials. Never forward stderr.
    child.stderr.resume();
    const timer = setTimeout(() => {
      child.kill();
      accept({ ok: false, output: "" });
    }, 30000);
    child.on("error", () => {
      clearTimeout(timer);
      accept({ ok: false, output: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      accept({ ok: code === 0, output });
    });
  });
}

async function main() {
  let envFile = ".env.production";
  let compose = false;
  let requireIntegrations = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--env-file" && args[index + 1])
      envFile = args[++index];
    else if (args[index] === "--compose") compose = true;
    else if (args[index] === "--require-integrations")
      requireIntegrations = true;
    else
      throw new Error(
        "Usage: npx tsx scripts/production-preflight.ts [--env-file FILE] [--compose] [--require-integrations]",
      );
  }
  const envPath = resolve(envFile);
  let source: string;
  try {
    source = await readFile(envPath, "utf8");
  } catch {
    throw new Error(
      "Could not read the production environment file. Copy .env.production.example and fill in your own deployment settings.",
    );
  }
  if (source.length > 65536)
    throw new Error("Production environment file is too large.");
  const fields = parse(source);
  const issues = [
    ...productionFileIssues(source),
    ...productionDeploymentIssues(fields),
  ];
  console.log(
    "HireLens production preflight — no services are started, no messages sent, and no files changed.",
  );
  if (issues.length) {
    for (const issue of issues) console.error(`Setup: ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    "Domain, independent secrets and container endpoint configuration passed.",
  );
  const environment = productionChildEnvironment(fields, envPath);
  const providers = await command(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("scripts/check-providers.ts"),
      ...(requireIntegrations ? ["--require-external"] : []),
    ],
    environment,
  );
  // This existing checker prints fixed, redacted status messages only.
  if (providers.output) console.log(providers.output.trim());
  if (!providers.ok) {
    console.error(
      "Provider configuration check failed. Review the listed setup fields; no provider was activated.",
    );
    process.exitCode = 1;
  }
  if (requireIntegrations) {
    for (const [endpoint, , model] of httpServices.filter(
      ([name]) => name !== "JUDGE0_URL",
    ))
      if (!fields[endpoint] || (model && !fields[model])) {
        console.error(
          `Setup: Configure ${endpoint}${model ? ` and ${model}` : ""} to enable all AI/media features.`,
        );
        process.exitCode = 1;
      }
  }
  if (compose) {
    const result = await command(
      "docker",
      [
        "compose",
        "--env-file",
        envPath,
        "-f",
        "compose.production.yaml",
        "config",
        "--quiet",
      ],
      environment,
    );
    if (!result.ok) {
      console.error(
        "Compose validation failed or Docker Compose is unavailable. Check the private file and run config --quiet on the Linux deployment host; resolved configuration may contain secrets.",
      );
      process.exitCode = 1;
    } else
      console.log(
        "Compose configuration passed without starting containers or contacting a Docker daemon.",
      );
  }
  console.log(
    "This is configuration validation only. Container execution, DNS, trusted HTTPS, provider delivery and two-network interviews still require actual deployment tests. Guide: docs/PRODUCTION-DEPLOYMENT.md",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Production preflight failed.",
    );
    process.exitCode = 1;
  });
