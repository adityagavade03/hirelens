import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { writeFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import mongoose from "mongoose";
import { z } from "zod";

// Explicitly launched, time-limited preview. Normal account authentication always applies.
const args = process.argv.slice(2);
const usage =
  "Usage: npm run preview:private -- --company-email YOUR_COMPANY_EMAIL [--expires-at ISO_TIMESTAMP] [--access password|account] [--public-origin HTTPS_ORIGIN]\nDefaults to eight hours and an extra preview password. --access account opens company login directly with normal account authentication. --expires-at must be a future ISO timestamp no more than eight hours away; use the original expiry when restarting an existing authorization. --public-origin sets the canonical origin of an owner-controlled HTTPS gateway; the underlying tunnel remains private-preview scoped and keeps the same expiry.";
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log(usage);
  process.exit(0);
}
const options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  const key = args[index],
    value = args[index + 1];
  if (
    !["--company-email", "--expires-at", "--access", "--public-origin"].includes(key) ||
    !value ||
    options.has(key)
  ) {
    console.error(usage);
    process.exit(1);
  }
  options.set(key, value);
}
const companyEmail = options.get("--company-email")?.trim().toLowerCase();
const accessMode = options.get("--access") || "password";
const requestedPublicOrigin = options.get("--public-origin");
if (requestedPublicOrigin) {
  try {
    const parsed = new URL(requestedPublicOrigin);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== requestedPublicOrigin ||
      parsed.username || parsed.password || parsed.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(parsed.hostname) ||
      parsed.hostname.endsWith(".localhost")
    ) throw new Error("invalid origin");
  } catch {
    console.error("--public-origin must be the exact HTTPS origin of an owner-controlled public gateway, with no credentials, port, path or query.");
    process.exit(1);
  }
}
if (!["password", "account"].includes(accessMode)) {
  console.error("--access must be password or account.");
  process.exit(1);
}
if (!companyEmail) {
  console.error(usage);
  process.exit(1);
}
const now = Date.now(),
  maxDuration = 8 * 60 * 60 * 1000;
const requestedExpiry = options.get("--expires-at");
if (
  requestedExpiry &&
  (!z.iso.datetime({ offset: true }).safeParse(requestedExpiry).success ||
    Date.parse(requestedExpiry) <= now ||
    Date.parse(requestedExpiry) > now + maxDuration)
) {
  console.error(
    "--expires-at must be a valid future ISO timestamp no more than eight hours from now.",
  );
  process.exit(1);
}
const root = process.cwd();
const runtime = path.join(root, ".data", "private-preview");
const binary = path.join(root, ".data", "tools", "cloudflared.exe");
const stopFile = path.join(runtime, "stop");
const lockFile = path.join(runtime, "launcher.lock");
const port = 4003;
const expiresAt = new Date(requestedExpiry || now + maxDuration).toISOString();
const password =
  accessMode === "password" ? randomBytes(24).toString("base64url") : "";
let tunnel: ChildProcess | undefined;
let app: ChildProcess | undefined;
let stopping = false;
let ownsRuntime = false;
let interval: ReturnType<typeof setInterval> | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;

function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  clearTimeout(deadline);
  tunnel?.kill();
  app?.kill();
  if (ownsRuntime) {
    try {
      unlinkSync(path.join(runtime, "access.txt"));
    } catch {
      /* It may not have been issued yet. */
    }
    writeFileSync(
      path.join(runtime, "state.json"),
      JSON.stringify({ running: false, stoppedAt: new Date().toISOString() }),
    );
    try {
      unlinkSync(lockFile);
    } catch {
      /* Preserve other workspace files. */
    }
    ownsRuntime = false;
  }
  console.log(
    "Private preview stopped. The normal local website is unchanged.",
  );
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  await mkdir(runtime, { recursive: true });
  if (stopping) throw new Error("Preview was cancelled.");
  // Only the invocation holding this exclusive lock may change access/state files.
  try {
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, expiresAt }), {
      flag: "wx",
      mode: 0o600,
    });
    ownsRuntime = true;
  } catch {
    throw new Error(
      "Another private preview owns this workspace. Stop that preview before starting another.",
    );
  }
  await access(binary);
  await access(path.join(root, "dist", "index.html"));
  await access(path.join(root, "dist-server", "server", "private-preview.js"));
  // Do not create a second tunnel pointing at an old/unrelated service.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
  const db = await mongoose
    .createConnection(
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hirelens",
      { serverSelectionTimeoutMS: 5000 },
    )
    .asPromise();
  let companyId: string;
  try {
    const owner = await db
      .collection("users")
      .findOne(
        { email: companyEmail, role: "company" },
        { projection: { _id: 1, companyId: 1 } },
      );
    if (!owner?.companyId || !mongoose.isValidObjectId(owner.companyId))
      throw new Error("The selected company account does not exist.");
    companyId = String(owner.companyId);
    const company = await db.collection("companies").findOne(
      {
        _id: new mongoose.Types.ObjectId(companyId),
        ownerId: String(owner._id),
      },
      { projection: { _id: 1 } },
    );
    if (!company) throw new Error("The account does not own that company.");
  } finally {
    await db.close();
  }
  if (stopping) throw new Error("Preview was cancelled.");
  await unlink(stopFile).catch(() => {});
  // Do not pass application/provider credentials to the tunnel executable.
  const tunnelEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      [
        "systemroot",
        "windir",
        "path",
        "pathext",
        "temp",
        "tmp",
        "userprofile",
        "appdata",
        "localappdata",
        "programdata",
        "programfiles",
        "programfiles(x86)",
      ].includes(key.toLowerCase()),
    ),
  );
  if (stopping) throw new Error("Preview was cancelled.");
  tunnel = spawn(
    binary,
    [
      "tunnel",
      "--url",
      `http://127.0.0.1:${port}`,
      "--no-autoupdate",
      "--protocol",
      "http2",
    ],
    {
      cwd: root,
      windowsHide: true,
      env: tunnelEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  // Observe the whole lifetime, including the gap between URL discovery and readiness.
  tunnel.once("exit", () => {
    if (!stopping) {
      console.error("The tunnel stopped.");
      stop();
    }
  });
  const url = await new Promise<string>((resolve, reject) => {
    let tail = "";
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Cloudflare did not provide a preview URL within 60 seconds.",
          ),
        ),
      60000,
    );
    const receive = (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-20000);
      const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    tunnel!.stdout!.on("data", receive);
    tunnel!.stderr!.on("data", receive);
    tunnel!.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not start the Cloudflare client."));
    });
    tunnel!.once("exit", () => {
      clearTimeout(timer);
      reject(
        new Error("The Cloudflare client exited before the preview was ready."),
      );
    });
  });
  if (stopping) throw new Error("Preview was cancelled.");
  const publicOrigin = requestedPublicOrigin || url;
  const appEnv = {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    APP_ORIGIN: publicOrigin,
    PRIVATE_PREVIEW_ACCESS: accessMode,
    PRIVATE_PREVIEW_PASSWORD: password,
    PRIVATE_PREVIEW_EXPIRES_AT: expiresAt,
    PRIVATE_PREVIEW_COMPANY_IDS: companyId,
    ALLOW_DEMO_LOGIN: "false",
    ALLOW_LOCAL_COMPANY_REGISTRATION: "false",
    MESSAGE_PREVIEW: "false",
    REDIS_URL: "", // The existing local instance remains the background-worker owner.
  };
  if (
    process.env.TURN_LOCAL_DEV === "true" &&
    (process.env.TURN_PROVIDER || "hmac") === "hmac"
  ) {
    Object.assign(appEnv, {
      TURN_URL: "",
      TURN_SECRET: "",
      TURN_LOCAL_DEV: "false",
    });
  }
  if (stopping) throw new Error("Preview was cancelled.");
  if (Date.now() >= Date.parse(expiresAt))
    throw new Error("The authorized preview expiry passed during startup.");
  app = spawn(process.execPath, ["dist-server/server/index.js"], {
    cwd: root,
    windowsHide: true,
    env: appEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childFailed = false;
  // Application errors can contain provider information; only print a fixed message.
  app.once("error", () => {
    childFailed = true;
    console.error("Preview server could not start.");
    void stop();
  });
  app.once("exit", () => {
    childFailed = true;
    if (!stopping) {
      console.error("Preview server stopped.");
      void stop();
    }
  });
  app.stdout!.on("data", () => {});
  app.stderr!.on("data", () => {});
  let ready = false;
  for (let attempt = 0; attempt < 40 && !childFailed && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { Host: new URL(publicOrigin).host },
        signal: AbortSignal.timeout(1500),
        redirect: "manual",
      });
      const html = await response.text();
      if (
        accessMode === "account" &&
        response.status === 302 &&
        response.headers.get("location") === "/auth/company"
      ) {
        const login = await fetch(`http://127.0.0.1:${port}/auth/company`, {
          headers: { Host: new URL(publicOrigin).host },
          signal: AbortSignal.timeout(1500),
        });
        if (
          login.status === 200 &&
          (await login.text()).includes('id="root"')
        ) {
          ready = true;
          break;
        }
      }
      if (
        accessMode === "password" &&
        response.status === 401 &&
        html.includes("HireLens private preview") &&
        html.includes("password")
      ) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for database connection and the protected listener. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready || stopping || tunnel.exitCode !== null || app.exitCode !== null)
    throw new Error(
      "The protected preview did not become ready. No preview credentials were released.",
    );
  writeFileSync(
    path.join(runtime, "access.txt"),
    `HireLens temporary preview\n\nURL: ${publicOrigin}\nAccess: ${accessMode === "account" ? "Direct account sign-in; no extra preview password" : "Preview password plus account sign-in"}\n${accessMode === "password" ? `Preview access password: ${password}\n` : ""}Expires: ${expiresAt}\n\n${accessMode === "account" ? "Open the link and sign in with your existing HireLens account." : "First enter this preview password, then sign in with your existing HireLens account."}\nCompany: ${publicOrigin}/auth/company\nHR: ${publicOrigin}/auth/hr\nCandidate: ${publicOrigin}/auth/candidate\nBoth interviewer and candidate must use this public URL, not localhost.\nThis shares your local workspace; changes here are real changes to local data.\nCompanies remain unverified. Use this only with trusted testers.\nKeep this laptop and its local services running.\nPublic TURN is still needed for reliable media between different networks.\nStop: npm run preview:stop\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    path.join(runtime, "state.json"),
    JSON.stringify(
      {
        running: true,
        pid: process.pid,
        appPid: app.pid,
        tunnelPid: tunnel.pid,
        url: publicOrigin,
        tunnelUrl: url,
        expiresAt,
        accessMode,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ready: true,
      url: publicOrigin,
      tunnelUrl: url,
      expiresAt,
      accessMode,
      accessFile: path.join(runtime, "access.txt"),
    }),
  );
  interval = setInterval(() => {
    void access(stopFile)
      .then(stop)
      .catch(() => {});
  }, 1000);
  deadline = setTimeout(
    () => void stop(),
    Math.max(1, Date.parse(expiresAt) - Date.now()),
  );
} catch (error) {
  console.error(
    error instanceof Error &&
      !/mongodb|password|token|secret|uri/i.test(error.message)
      ? error.message
      : "Private preview startup failed. Check local services and configuration.",
  );
  await stop();
  process.exitCode = 1;
}
