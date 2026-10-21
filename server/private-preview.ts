import "dotenv/config";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import type { IncomingMessage } from "node:http";

const previewKeys = [
  "PRIVATE_PREVIEW_ACCESS",
  "PRIVATE_PREVIEW_PASSWORD",
  "PRIVATE_PREVIEW_EXPIRES_AT",
  "PRIVATE_PREVIEW_COMPANY_IDS",
  "PRIVATE_PREVIEW_MAX_DAYS",
] as const;
const cookieName = "__Host-hirelens_preview";
const gatePath = "/__private-preview";
const defaultMaximumDuration = 8 * 60 * 60 * 1000;
type PreviewConfiguration = {
  access: "password" | "account";
  password?: string;
  expiresAt: number;
  origin: string;
  companyIds: Set<string>;
};

export function parsePrivatePreviewEnvironment(
  env: NodeJS.ProcessEnv,
  now = Date.now(),
): PreviewConfiguration | null {
  if (!previewKeys.some((key) => env[key] !== undefined)) return null;
  const invalid = () => {
    throw new Error(
      "Private preview requires production mode, a loopback host, an exact HTTPS APP_ORIGIN, access mode password or account, a future expiry within the approved window (eight hours by default; explicit PRIVATE_PREVIEW_MAX_DAYS can be 1–31), and an explicit company ID allowlist. Password mode requires a 32–256 character password.",
    );
  };
  if (
    env.NODE_ENV !== "production" ||
    !["127.0.0.1", "localhost", "::1"].includes(env.HOST || "") ||
    !env.PRIVATE_PREVIEW_EXPIRES_AT ||
    !env.PRIVATE_PREVIEW_COMPANY_IDS
  )
    invalid();
  const access = env.PRIVATE_PREVIEW_ACCESS ?? "password";
  if (access !== "password" && access !== "account") return invalid();
  const password =
    access === "password" ? env.PRIVATE_PREVIEW_PASSWORD : undefined;
  if (
    access === "password" &&
    (!password || password.length < 32 || password.length > 256)
  )
    invalid();
  let origin: URL;
  try {
    origin = new URL(env.APP_ORIGIN || "");
  } catch {
    return invalid();
  }
  if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN)
    invalid();
  const maximumDays = env.PRIVATE_PREVIEW_MAX_DAYS;
  if (maximumDays !== undefined && !/^(?:[1-9]|[12]\d|3[01])$/.test(maximumDays))
    invalid();
  const maximumDuration = maximumDays === undefined
    ? defaultMaximumDuration
    : Number(maximumDays) * 24 * 60 * 60 * 1000;
  const expiry = env.PRIVATE_PREVIEW_EXPIRES_AT!;
  const expiresAt = Date.parse(expiry);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      expiry,
    ) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt - now > maximumDuration
  )
    invalid();
  const ids = env
    .PRIVATE_PREVIEW_COMPANY_IDS!.split(",")
    .map((id) => id.trim());
  if (
    !ids.length ||
    ids.length > 20 ||
    ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))
  )
    invalid();
  return {
    access,
    password,
    expiresAt,
    origin: origin.origin,
    companyIds: new Set(ids.map((id) => id.toLowerCase())),
  };
}

type PreviewSocket = {
  disconnect(close: boolean): unknown;
  once(event: "disconnect", callback: () => void): unknown;
};
const digest = (value: string) => createHash("sha256").update(value).digest();
const htmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function createPrivatePreview(
  configuration: PreviewConfiguration | null,
  now = () => Date.now(),
) {
  const sessions = new Set<string>();
  const failures = new Map<string, { count: number; until: number }>();
  const sockets = new Set<PreviewSocket>();
  const passwordHash =
    configuration?.access === "password"
      ? digest(configuration.password!)
      : null;
  let totalFailures = { count: 0, until: 0 };
  const enabled = () => !!configuration && now() < configuration.expiresAt;
  const expire = () => {
    sessions.clear();
    for (const socket of sockets) socket.disconnect(true);
    sockets.clear();
  };
  // Node timers overflow above ~24.8 days. Recheck the fixed absolute deadline
  // in short chunks, including after sleep or a system-clock adjustment.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleExpiry = () => {
    if (!configuration) return;
    const remaining = configuration.expiresAt - now();
    if (remaining <= 0) { expire(); return; }
    timer = setTimeout(scheduleExpiry, Math.min(remaining, 60000));
    timer.unref();
  };
  scheduleExpiry();
  const authorized = (request: IncomingMessage) => {
    if (!configuration) return true;
    if (!enabled()) return false;
    // This bypasses only the extra preview gate. Normal account authentication
    // remains in the app and Socket.IO middleware, after this guard.
    if (configuration.access === "account") return true;
    const token = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    return (
      !!token &&
      /^[a-f0-9]{64}$/.test(token) &&
      sessions.has(digest(token).toString("hex"))
    );
  };
  const socketOriginAllowed = (request: IncomingMessage) => {
    if (!configuration) return true;
    if (request.headers.origin)
      return request.headers.origin === configuration.origin;
    // Same-origin browser polling GETs can omit Origin. Require browser fetch
    // metadata and the canonical host in that case; never allow an arbitrary
    // missing-Origin websocket or cross-site polling request.
    return (
      request.method === "GET" &&
      request.headers["sec-fetch-site"] === "same-origin" &&
      request.headers.host === new URL(configuration.origin).host
    );
  };
  const page = (
    message = "Enter the private preview password supplied by the project owner.",
  ) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HireLens private preview</title></head><body style="font:16px system-ui;background:#f8f5ef;color:#26231f;padding:40px;max-width:600px;margin:auto"><h1>HireLens private preview</h1><p>${htmlEscape(message)}</p><p>This is a temporary testing workspace connected to the existing project database. Actions here change the existing local project data. Local companies remain unverified. Normal account sign-in is still required.</p>${enabled() ? `<form method="post" action="${gatePath}"><label for="preview-password">Preview password</label><p><input id="preview-password" name="password" type="password" required maxlength="256" autocomplete="off"></p><button type="submit">Open private preview</button></form><p>Access ends ${htmlEscape(new Date(configuration!.expiresAt).toISOString())}.</p>` : ""}</body></html>`;
  const install = (app: Express) => {
    if (!configuration) return;
    const parseForm = express.urlencoded({ extended: false, limit: "2kb" });
    app.use((req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.setHeader(
        "X-HireLens-Private-Preview",
        "temporary; unverified-companies",
      );
      if (!enabled()) {
        expire();
        res
          .status(410)
          .type("html")
          .send(
            page(
              "This private preview has expired. Ask the project owner for a new preview.",
            ),
          );
        return;
      }
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.get("origin") !== configuration.origin
      ) {
        res
          .status(403)
          .json({ error: { message: "Request origin is not allowed." } });
        return;
      }
      if (configuration.access === "account") {
        if (
          req.path === gatePath &&
          ["GET", "HEAD", "POST"].includes(req.method)
        ) {
          res.redirect(req.method === "POST" ? 303 : 302, "/auth/company");
          return;
        }
        if (
          ["GET", "HEAD"].includes(req.method) &&
          ["/", "/index.html"].includes(req.path)
        ) {
          res.redirect(302, "/auth/company");
          return;
        }
        next();
        return;
      }
      if (req.path === gatePath && req.method === "POST") {
        parseForm(req, res, (error) => {
          if (error) {
            res
              .status(400)
              .type("html")
              .send(page("Unable to read this preview sign-in request."));
            return;
          }
          const key = req.ip || req.socket.remoteAddress || "unknown";
          const current = now();
          for (const [address, record] of failures)
            if (record.until <= current) failures.delete(address);
          if (totalFailures.until <= current)
            totalFailures = { count: 0, until: current + 15 * 60000 };
          const attempt = failures.get(key) || {
            count: 0,
            until: current + 15 * 60000,
          };
          if (
            attempt.count >= 5 ||
            totalFailures.count >= 100 ||
            failures.size >= 1000
          ) {
            res.setHeader("Retry-After", "900");
            res
              .status(429)
              .type("html")
              .send(
                page("Too many preview sign-in attempts. Try again later."),
              );
            return;
          }
          const password =
            typeof req.body?.password === "string" ? req.body.password : "";
          if (
            !password ||
            password.length > 256 ||
            !timingSafeEqual(digest(password), passwordHash!)
          ) {
            attempt.count++;
            failures.set(key, attempt);
            totalFailures.count++;
            res
              .status(401)
              .type("html")
              .send(page("The preview password is incorrect."));
            return;
          }
          if (!enabled()) {
            expire();
            res
              .status(410)
              .type("html")
              .send(page("This private preview has expired."));
            return;
          }
          failures.delete(key);
          const token = randomBytes(32).toString("hex");
          if (sessions.size >= 100)
            sessions.delete(sessions.values().next().value!);
          sessions.add(digest(token).toString("hex"));
          res.cookie(cookieName, token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            expires: new Date(configuration.expiresAt),
          });
          res.redirect(303, "/");
        });
        return;
      }
      if (!authorized(req)) {
        if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io"))
          res.status(401).json({
            error: {
              message:
                "Open this website and enter its private preview password first.",
              code: "PRIVATE_PREVIEW_REQUIRED",
            },
          });
        else res.status(401).type("html").send(page());
        return;
      }
      next();
    });
  };
  return {
    enabled,
    configured: !!configuration,
    accessMode: configuration?.access || null,
    expiresAt: configuration?.expiresAt,
    allowsCompany: (companyId?: string | null) =>
      enabled() &&
      !!companyId &&
      configuration!.companyIds.has(companyId.toLowerCase()),
    install,
    socketAllowed: (req: IncomingMessage) =>
      !configuration ||
      (enabled() && socketOriginAllowed(req) && authorized(req)),
    trackSocket: (socket: PreviewSocket) => {
      if (!configuration) return;
      if (!enabled()) {
        socket.disconnect(true);
        return;
      }
      sockets.add(socket);
      socket.once("disconnect", () => sockets.delete(socket));
    },
    decorateHtml: (html: string) =>
      !configuration
        ? html
        : html.replace(
            /<body([^>]*)>/i,
            `$&<aside role="status" style="position:sticky;top:0;z-index:99999;background:#fff0c2;color:#352400;padding:8px 16px;text-align:center;font:13px system-ui">Private testing preview · Changes affect existing project data · Local companies remain unverified · Access ends ${htmlEscape(new Date(configuration.expiresAt).toISOString())}</aside>`,
          ),
    close: () => {
      clearTimeout(timer);
      expire();
    },
  };
}

const preview = createPrivatePreview(
  parsePrivatePreviewEnvironment(process.env),
);
export const privatePreviewEnabled = preview.enabled;
export const privatePreviewConfigured = () => preview.configured;
export const privatePreviewAccessMode = () => preview.accessMode;
export const previewAllowsCompany = preview.allowsCompany;
export const installPrivatePreviewGate = preview.install;
export const privatePreviewSocketAllowed = preview.socketAllowed;
export const trackPrivatePreviewSocket = preview.trackSocket;
export const decoratePrivatePreviewHtml = preview.decorateHtml;
