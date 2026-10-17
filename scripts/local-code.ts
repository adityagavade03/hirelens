import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
import { config } from "../server/config.js";
import { checkCodeExecution } from "./check-code.js";
const root = process.cwd();
const settingsPath = path.join(root, ".data/judge0/judge0.conf");
const compose = [
  "compose",
  "--project-directory",
  root,
  "-f",
  path.join(root, "deploy/compose.judge0.yaml"),
];
function docker(args: string[], capture = false, timeout = 60000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (data) => {
      output += data.toString();
    });
    // Do not echo captured errors, which can include local environment information.
    child.stderr?.resume();
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          "Docker did not respond in time. Open Docker Desktop and resolve its startup error before continuing.",
        ),
      );
    }, timeout);
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Docker is unavailable. Install/start a compatible Docker Linux engine first.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.trim())
        : reject(
            new Error(
              "Docker could not complete the command. Check Docker Desktop or the execution host, then retry.",
            ),
          );
    });
  });
}
async function prepare() {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  try {
    return parse(await readFile(settingsPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const secret = () => randomBytes(32).toString("hex");
  const settings = {
    JUDGE0_TELEMETRY_ENABLE: "false",
    REDIS_HOST: "redis",
    REDIS_PASSWORD: secret(),
    POSTGRES_HOST: "db",
    POSTGRES_DB: "judge0",
    POSTGRES_USER: "judge0",
    POSTGRES_PASSWORD: secret(),
    AUTHN_HEADER: "X-Auth-Token",
    AUTHN_TOKEN: secret(),
    SECRET_KEY_BASE: secret(),
    ENABLE_NETWORK: "false",
    ALLOW_ENABLE_NETWORK: "false",
    ENABLE_CALLBACKS: "false",
    ENABLE_ADDITIONAL_FILES: "false",
    ENABLE_COMPILER_OPTIONS: "false",
    ENABLE_COMMAND_LINE_ARGUMENTS: "false",
    ENABLE_BATCHED_SUBMISSIONS: "false",
    ENABLE_WAIT_RESULT: "false",
    ENABLE_SUBMISSION_DELETE: "false",
    COUNT: "1",
    MAX_QUEUE_SIZE: "20",
    RAILS_MAX_THREADS: "2",
    RAILS_SERVER_PROCESSES: "1",
    CPU_TIME_LIMIT: "2",
    MAX_CPU_TIME_LIMIT: "2",
    WALL_TIME_LIMIT: "5",
    MAX_WALL_TIME_LIMIT: "5",
    MEMORY_LIMIT: "128000",
    MAX_MEMORY_LIMIT: "128000",
    MAX_FILE_SIZE: "1024",
    MAX_MAX_FILE_SIZE: "1024",
  };
  await writeFile(
    settingsPath,
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  return settings;
}
async function checkHost() {
  // A local helper must not create privileged containers on an unexpected
  // remote Docker context or assume that host's loopback belongs to HireLens.
  const endpoint =
    process.env.DOCKER_HOST ||
    (await docker(
      [
        "context",
        "inspect",
        "--format",
        '{{(index .Endpoints "docker").Host}}',
      ],
      true,
      15000,
    ));
  if (!/^(?:npipe:\/\/|unix:\/\/)/.test(endpoint))
    throw new Error(
      "The selected Docker engine is remote or uses a TCP endpoint. This local helper will not start privileged containers there. Select a local Linux engine, or connect a separately managed Judge0 URL.",
    );
  const platform = await docker(
    ["info", "--format", "{{.OSType}} {{.CgroupVersion}}"],
    true,
    15000,
  );
  if (platform !== "linux 1")
    throw new Error(
      `Judge0 CE 1.13.1 needs a compatible Linux cgroup-v1 execution host; Docker reports ${platform || "unknown"}. No host settings were changed. See docs/CODE-EXECUTION.md.`,
    );
  return platform;
}
async function main() {
  if (config.production)
    throw new Error(
      "This helper is for a local execution host. Use docs/CODE-EXECUTION.md for a production deployment.",
    );
  if (process.argv.includes("--check")) {
    console.log(
      `Judge0 endpoint configured: ${config.judgeUrl ? "yes" : "no"}. This check does not submit code, start containers or change configuration.`,
    );
    await checkHost();
    console.log(
      "The selected Docker engine is Linux with cgroup v1. Run npm run code:local to prepare and validate the isolated executor; host compatibility alone does not prove execution works.",
    );
    return;
  }
  const settings = await prepare();
  if (process.argv.includes("--prepare")) {
    console.log(
      "Prepared private Judge0 configuration in .data/judge0. No services started; application configuration unchanged.",
    );
    return;
  }
  const expectedUrl = "http://127.0.0.1:2358";
  if (config.judgeUrl && config.judgeUrl.replace(/\/$/, "") !== expectedUrl)
    throw new Error(
      "A different Judge0 provider is already configured. Run npm run code:check for that provider; this helper will not replace it.",
    );
  await checkHost();
  console.log(
    "Starting the dedicated Judge0 stack. Its first image download can be large.",
  );
  await docker([...compose, "up", "-d"], false, 20 * 60000);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${expectedUrl}/languages`, {
        headers: { "X-Auth-Token": settings.AUTHN_TOKEN },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Service is still starting. */
    }
    if (attempt % 5 === 0)
      console.log("Waiting for Judge0 API initialization…");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!ready)
    throw new Error(
      "Judge0 has not become ready. Inspect its server/worker logs. HireLens configuration was not changed.",
    );
  config.judgeUrl = expectedUrl;
  config.judgeKey = settings.AUTHN_TOKEN;
  config.judgeHeader = "X-Auth-Token";
  config.rapidHost = "";
  await checkCodeExecution();
  const envPath = path.join(root, ".env");
  let env = await readFile(envPath, "utf8");
  for (const [key, value] of Object.entries({
    JUDGE0_URL: expectedUrl,
    JUDGE0_API_KEY: settings.AUTHN_TOKEN,
    JUDGE0_AUTH_HEADER: "X-Auth-Token",
    JUDGE0_RAPIDAPI_HOST: "",
  })) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    env = pattern.test(env)
      ? env.replace(pattern, `${key}=${value}`)
      : `${env}\n${key}=${value}`;
  }
  await writeFile(envPath, env, { mode: 0o600 });
  console.log(
    "Judge0 passed all five language checks and expected error verdicts. HireLens .env is connected. Restart npm run dev and try Run code again.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Judge0 setup failed.",
  );
  process.exitCode = 1;
});
