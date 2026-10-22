import "dotenv/config";
import { isIP } from "node:net";
import type { Express } from "express";

const keys = ["CLOUD_TEST_COMPANY_IDS", "CLOUD_TEST_EXPIRES_AT"] as const;
const maximumDuration = 31 * 24 * 60 * 60 * 1000;
type CloudTestConfiguration = {
  companyIds: ReadonlySet<string>;
  expiresAt: number;
  origin: string;
};
type CloudTestSocket = {
  disconnect(close: boolean): unknown;
  once(event: "disconnect", callback: () => void): unknown;
};

// This authorizes selected existing companies for a bounded test. It never
// creates companies, verifies them, or changes their authentication requirements.
export function parseCloudTestEnvironment(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
): CloudTestConfiguration | null {
  if (!keys.some((key) => environment[key] !== undefined)) return null;
  const invalid = (): never => {
    throw new Error(
      "Cloud company testing requires production mode, an exact public HTTPS APP_ORIGIN, one or two distinct company IDs, and an explicit future ISO expiry within 31 days. It cannot be combined with PRIVATE_PREVIEW_ settings.",
    );
  };
  if (
    environment.NODE_ENV !== "production" ||
    Object.keys(environment).some((key) =>
      key.startsWith("PRIVATE_PREVIEW_"),
    ) ||
    !environment.CLOUD_TEST_COMPANY_IDS ||
    !environment.CLOUD_TEST_EXPIRES_AT
  )
    invalid();
  let origin: URL;
  try {
    origin = new URL(environment.APP_ORIGIN || "");
  } catch {
    return invalid();
  }
  if (
    origin.protocol !== "https:" ||
    origin.origin !== environment.APP_ORIGIN ||
    origin.username ||
    origin.password ||
    isIP(origin.hostname.replace(/^\[|\]$/g, "")) ||
    origin.hostname === "localhost" ||
    origin.hostname.endsWith(".localhost") ||
    !origin.hostname.includes(".")
  )
    invalid();
  const ids = environment
    .CLOUD_TEST_COMPANY_IDS!.split(",")
    .map((id) => id.trim().toLowerCase());
  if (
    !ids.length ||
    ids.length > 2 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !/^[a-f0-9]{24}$/.test(id))
  )
    invalid();
  const expiry = environment.CLOUD_TEST_EXPIRES_AT!;
  const expiresAt = Date.parse(expiry);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiry) ||
    !Number.isFinite(expiresAt) ||
    new Date(expiresAt).toISOString() !==
      expiry.replace(/Z$/, expiry.includes(".") ? "Z" : ".000Z") ||
    expiresAt <= now ||
    expiresAt - now > maximumDuration
  )
    invalid();
  return { companyIds: new Set(ids), expiresAt, origin: origin.origin };
}

export function createCloudTestAccess(
  configuration: CloudTestConfiguration | null,
  now = () => Date.now(),
) {
  const active = () => !!configuration && now() < configuration.expiresAt;
  const sockets = new Set<CloudTestSocket>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expire = () => {
    for (const socket of sockets) socket.disconnect(true);
    sockets.clear();
  };
  const expired = () => {
    const ended = !!configuration && !active();
    if (ended) expire();
    return ended;
  };
  // A month exceeds Node's maximum timer delay. Recheck the original deadline
  // in short chunks; connected candidates cannot outlive the workspace window.
  const scheduleExpiry = () => {
    if (!configuration) return;
    const remaining = configuration.expiresAt - now();
    if (remaining <= 0) return expire();
    timer = setTimeout(scheduleExpiry, Math.min(remaining, 60000));
    timer.unref();
  };
  scheduleExpiry();
  return {
    configured: !!configuration,
    install: (app: Express) => {
      app.use((_request, response, next) => {
        if (!expired()) return next();
        response
          .set({
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
          })
          .status(410)
          .json({
            error: {
              code: "CLOUD_TEST_EXPIRED",
              message: "This HireLens test workspace has expired.",
            },
          });
      });
    },
    socketAllowed: () => !expired(),
    trackSocket: (socket: CloudTestSocket) => {
      if (!configuration) return;
      if (expired()) {
        socket.disconnect(true);
        return;
      }
      sockets.add(socket);
      socket.once("disconnect", () => sockets.delete(socket));
    },
    allowsCompany: (companyId?: string | null) =>
      active() &&
      !!companyId &&
      configuration!.companyIds.has(companyId.toLowerCase()),
    decorateHtml: (html: string) =>
      !active()
        ? html
        : html.replace(
            /<body([^>]*)>/i,
            `$&<aside role="status" aria-label="Cloud test workspace" style="position:relative;z-index:99999;background:var(--warning-soft,#fff3d9);color:var(--text,#26231f);border-bottom:1px solid var(--warning-border,#e1cca0);padding:8px 16px;text-align:center;font:13px system-ui">Cloud test workspace · Selected companies remain unverified · Workspace access ends <time datetime="${new Date(configuration!.expiresAt).toISOString()}">${new Date(configuration!.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</time> · Normal sign-in and email verification required.</aside>`,
          ),
    close: () => {
      clearTimeout(timer);
      expire();
    },
  };
}

const cloudTest = createCloudTestAccess(parseCloudTestEnvironment(process.env));
export const cloudTestConfigured = () => cloudTest.configured;
export const cloudTestAllowsCompany = cloudTest.allowsCompany;
export const decorateCloudTestHtml = cloudTest.decorateHtml;
export const installCloudTestGate = cloudTest.install;
export const cloudTestSocketAllowed = cloudTest.socketAllowed;
export const trackCloudTestSocket = cloudTest.trackSocket;
