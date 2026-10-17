import "dotenv/config";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { connect } from "node:net";

// A development relay for this Windows host's browser tests. It accepts only
// peers allocated on this WSL address and is not a public meeting relay.
const directory = resolve(".data/turn");
const distro = process.env.HIRELENS_TURN_WSL_DISTRO || "Ubuntu-24.04";
function wsl(...args: string[]) {
  return execFileSync("wsl.exe", ["-d", distro, "--", ...args], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  }).trim();
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function reachable(host: string) {
  return new Promise<boolean>((done) => {
    const socket = connect({ host, port: 3478 });
    let finished = false;
    const finish = (value: boolean) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      done(value);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
try {
  const automatic = process.argv.includes("--if-enabled");
  if ((process.env.TURN_PROVIDER || "hmac") !== "hmac") {
    if (automatic) process.exit(0);
    throw new Error(
      "A managed TURN provider is selected. The local helper will not start or replace its settings.",
    );
  }
  if (automatic && process.env.TURN_LOCAL_DEV !== "true") process.exit(0);
  if (process.platform !== "win32")
    throw new Error(
      "This local helper requires Windows WSL. See docs/TURN-SETUP.md for a public relay.",
    );
  if (process.env.NODE_ENV === "production")
    throw new Error("A WSL-only relay cannot be enabled in production.");
  if (process.env.TURN_URL && process.env.TURN_LOCAL_DEV !== "true")
    throw new Error(
      "A TURN endpoint already exists. The local helper will not replace it.",
    );
  await mkdir(directory, { recursive: true });
  const linuxRoot = wsl("wslpath", "-a", resolve("."));
  const binary = `${linuxRoot}/.data/turn/runtime/turnserver`;
  wsl("test", "-x", binary);
  const ip = wsl("hostname", "-I")
    .split(/\s+/)
    .find((value) =>
      /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(value),
    );
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
    throw new Error("No private WSL IPv4 address is available.");
  const secretPath = resolve(directory, "secret");
  let secret: string;
  try {
    secret = (await readFile(secretPath, "utf8")).trim();
  } catch {
    secret = randomBytes(32).toString("hex");
    await writeFile(secretPath, secret, { mode: 0o600, flag: "wx" });
  }
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new Error(
      "The local relay secret is invalid; inspect .data/turn/secret privately.",
    );
  const identity = createHash("sha256")
    .update(linuxRoot)
    .digest("hex")
    .slice(0, 12);
  const configuration =
    [
      "listening-port=3478",
      `listening-ip=${ip}`,
      `relay-ip=${ip}`,
      "fingerprint",
      "use-auth-secret",
      `static-auth-secret=${secret}`,
      "realm=hirelens.local",
      "server-name=hirelens.local",
      "min-port=49160",
      "max-port=49200",
      "no-tls",
      "no-multicast-peers",
      "no-tcp-relay",
      "no-stun",
      "stale-nonce=600",
      "total-quota=20",
      "user-quota=4",
      "max-bps=1000000",
      "bps-capacity=4000000",
      "denied-peer-ip=0.0.0.0-255.255.255.255",
      `allowed-peer-ip=${ip}`,
      "denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "relay-threads=1",
      "proc-user=nobody",
      "proc-group=nogroup",
      `pidfile=/tmp/hirelens-turn-${identity}.pid`,
      "log-file=stdout",
      "simple-log",
    ].join("\n") + "\n";
  const configPath = resolve(directory, "turnserver.conf");
  const prior = await readFile(configPath, "utf8").catch(() => "");
  if (await reachable(ip)) {
    if (prior !== configuration)
      throw new Error(
        "Port 3478 is already occupied by a different or outdated relay configuration. It was left untouched.",
      );
    console.log(
      "Local relay listener already running; use the room's relay check to verify authentication and traffic.",
    );
  } else {
    await writeFile(configPath, configuration, { mode: 0o600 });
    const output = await open(resolve(directory, "service.log"), "a");
    const child = spawn(
      "wsl.exe",
      [
        "-d",
        distro,
        "--",
        binary,
        "-c",
        `${linuxRoot}/.data/turn/turnserver.conf`,
      ],
      {
        windowsHide: true,
        detached: true,
        stdio: ["ignore", output.fd, output.fd],
      },
    );
    child.on("error", (error) =>
      console.error(`Local relay could not start: ${error.message}`),
    );
    child.unref();
    await output.close();
    let ready = false;
    for (let n = 0; n < 20; n++) {
      if (await reachable(ip)) {
        ready = true;
        break;
      }
      await pause(500);
    }
    if (!ready)
      throw new Error(
        "Local relay did not become ready. Inspect .data/turn/service.log.",
      );
  }
  let env = await readFile(".env", "utf8");
  const settings = {
    TURN_URL: `turn:${ip}:3478?transport=udp,turn:${ip}:3478?transport=tcp`,
    TURN_SECRET: secret,
    TURN_LOCAL_DEV: "true",
  };
  for (const [key, value] of Object.entries(settings)) {
    const expression = new RegExp(`^${key}=.*$`, "m");
    env = expression.test(env)
      ? env.replace(expression, `${key}=${value}`)
      : `${env.trimEnd()}\n${key}=${value}\n`;
  }
  await writeFile(".env", env);
  console.log(
    "Local WSL TURN relay configured. Restart the API, then use Connection → Test relay connection. Public/cross-network calls still need a public relay.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Local relay setup failed.",
  );
  process.exitCode = 1;
}
