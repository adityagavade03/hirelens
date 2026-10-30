import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
export function executorDomain(value: string) {
  if (!value) return "";
  const host = value.toLowerCase();
  if (
    host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|test|invalid|example)$/.test(host) ||
    /(?:^|\.)example\.(com|net|org)$/.test(host)
  )
    throw new Error(
      "Use a real DNS hostname without a URL scheme, port or path.",
    );
  return host;
}
async function main() {
  const supplied =
    process.argv.find((v) => v.startsWith("--domain="))?.slice(9) || "";
  const domain = executorDomain(supplied);
  // Reuse the idempotent existing private-secret generator; it starts no Docker services.
  const generated = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/local-code.ts", "--prepare"],
    { stdio: "pipe", windowsHide: true },
  );
  if (generated.status !== 0)
    throw new Error(
      "Private Judge0 configuration could not be prepared. No server was started.",
    );
  const settings = parse(
    await readFile(resolve(".data/judge0/judge0.conf"), "utf8"),
  );
  if (!/^[0-9a-f]{64}$/.test(settings.AUTHN_TOKEN || ""))
    throw new Error(
      "Existing private executor credentials are invalid; review the protected configuration.",
    );
  const dir = resolve(".data/private-executor");
  await mkdir(dir, { recursive: true });
  const hostPath = resolve(dir, "host.env");
  let savedDomain = "";
  try {
    savedDomain = parse(await readFile(hostPath, "utf8")).JUDGE0_DOMAIN || "";
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (savedDomain && domain && domain !== savedDomain)
    throw new Error(
      "A different private hostname is already prepared. Review host.env before replacing it.",
    );
  const activeDomain = executorDomain(domain || savedDomain);
  await writeFile(hostPath, `JUDGE0_DOMAIN=${activeDomain}\n`, { mode: 0o600 });
  await writeFile(
    resolve(dir, "render.env"),
    `JUDGE0_URL=${activeDomain ? `https://${activeDomain}` : ""}\nJUDGE0_API_KEY=${settings.AUTHN_TOKEN}\nJUDGE0_AUTH_HEADER=X-Auth-Token\nJUDGE0_RAPIDAPI_HOST=\n`,
    { mode: 0o600 },
  );
  await writeFile(
    resolve(dir, "readiness.json"),
    JSON.stringify(
      {
        preparedAt: new Date().toISOString(),
        privateConfigurationPrepared: true,
        hostnameConfigured: !!activeDomain,
        serverStarted: false,
        codeExecutionVerified: false,
        applicationConfigured: false,
        guide: "docs/PRIVATE-EXECUTION-SETUP.md",
      },
      null,
      2,
    ),
  );
  console.log(
    "Private Judge0 setup prepared in .data/private-executor. Secrets were not printed. No containers or servers started, and the hosted application configuration is unchanged.",
  );
  if (!activeDomain)
    console.log(
      "Next: provide an owner-controlled compatible Linux execution host and DNS name, then follow docs/PRIVATE-EXECUTION-SETUP.md.",
    );
}
if (
  process.argv[1]?.replace(/\\/g, "/").endsWith("/prepare-private-executor.ts")
)
  void main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Private setup failed.");
    process.exitCode = 1;
  });
