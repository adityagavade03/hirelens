import express from "express";
import request from "supertest";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { io as connectSocket } from "socket.io-client";
import { afterEach, expect, it, vi } from "vitest";
import {
  createPrivatePreview,
  parsePrivatePreviewEnvironment,
} from "../server/private-preview.js";
import {
  config,
  localCompanyRegistrationEnabled,
  allowedOrigins,
} from "../server/config.js";
import { localCompanyAccessAllowed } from "../server/security.js";
import { CompanyModel } from "../server/models.js";
import { createApp } from "../server/app.js";
import { attachRealtime } from "../server/realtime.js";

const companyId = "1234567890abcdef12345678";
const origin = "https://private-preview.example.test";
const password = "isolated-preview-test-password-not-a-real-secret";
const previews: ReturnType<typeof createPrivatePreview>[] = [];
const original = { ...config };
const originalOrigins = new Set(allowedOrigins);
const environment = (overrides: NodeJS.ProcessEnv = {}) => ({
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  APP_ORIGIN: origin,
  PRIVATE_PREVIEW_PASSWORD: password,
  PRIVATE_PREVIEW_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
  PRIVATE_PREVIEW_COMPANY_IDS: companyId,
  ...overrides,
});
function fixture(overrides: NodeJS.ProcessEnv = {}) {
  const guard = createPrivatePreview(
    parsePrivatePreviewEnvironment(environment(overrides)),
  );
  previews.push(guard);
  const app = express();
  guard.install(app);
  app.all("/{*path}", (_req, res) => res.json({ reachedApplication: true }));
  return { app, guard };
}
async function enter(app: ReturnType<typeof express>) {
  const response = await request(app)
    .post("/__private-preview")
    .set("Origin", origin)
    .type("form")
    .send({ password });
  expect(response.status).toBe(303);
  const cookie = response.headers["set-cookie"][0] as string;
  return { response, cookie, token: cookie.split(";")[0] };
}
function socketRequest(
  token?: string,
  requestOrigin: string | undefined = origin,
) {
  return {
    headers: { cookie: token, origin: requestOrigin },
  } as IncomingMessage;
}
afterEach(() => {
  for (const guard of previews.splice(0)) guard.close();
  Object.assign(config, original);
  allowedOrigins.clear();
  for (const value of originalOrigins) allowedOrigins.add(value);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("leaves an ordinary installation disabled, but fails closed for partial or unsafe preview configuration", () => {
  expect(parsePrivatePreviewEnvironment({ NODE_ENV: "production" })).toBeNull();
  for (const changes of [
    { PRIVATE_PREVIEW_PASSWORD: undefined },
    { PRIVATE_PREVIEW_ACCESS: "" },
    { PRIVATE_PREVIEW_ACCESS: "public" },
    { PRIVATE_PREVIEW_PASSWORD: "too-short" },
    { PRIVATE_PREVIEW_EXPIRES_AT: undefined },
    { PRIVATE_PREVIEW_COMPANY_IDS: "" },
    { PRIVATE_PREVIEW_COMPANY_IDS: `${companyId},*` },
    { NODE_ENV: "development" },
    { HOST: "0.0.0.0" },
    { APP_ORIGIN: "http://preview.example.test" },
    { APP_ORIGIN: `${origin}/` },
    { APP_ORIGIN: `${origin}/path` },
    { PRIVATE_PREVIEW_EXPIRES_AT: new Date(Date.now() - 1).toISOString() },
    {
      PRIVATE_PREVIEW_EXPIRES_AT: new Date(
        Date.now() + 9 * 3600000,
      ).toISOString(),
    },
  ])
    expect(() => parsePrivatePreviewEnvironment(environment(changes))).toThrow(
      "Private preview requires",
    );
});

it("requires explicit valid account mode and keeps its production, origin, company and expiry boundaries", () => {
  const account = {
    PRIVATE_PREVIEW_ACCESS: "account",
    PRIVATE_PREVIEW_PASSWORD: undefined,
  };
  const parsed = parsePrivatePreviewEnvironment(environment(account));
  expect(parsed?.access).toBe("account");
  expect(parsed?.password).toBeUndefined();
  expect(parsePrivatePreviewEnvironment(environment())?.access).toBe(
    "password",
  );
  expect(() =>
    parsePrivatePreviewEnvironment({ PRIVATE_PREVIEW_ACCESS: "account" }),
  ).toThrow("Private preview requires");
  for (const invalid of [
    { NODE_ENV: "development" },
    { HOST: "0.0.0.0" },
    { APP_ORIGIN: "http://preview.example.test" },
    { APP_ORIGIN: `${origin}/path` },
    { PRIVATE_PREVIEW_COMPANY_IDS: "*" },
    { PRIVATE_PREVIEW_COMPANY_IDS: undefined },
    { PRIVATE_PREVIEW_EXPIRES_AT: undefined },
    { PRIVATE_PREVIEW_EXPIRES_AT: new Date(Date.now() - 1).toISOString() },
    {
      PRIVATE_PREVIEW_EXPIRES_AT: new Date(
        Date.now() + 9 * 3600000,
      ).toISOString(),
    },
  ])
    expect(() =>
      parsePrivatePreviewEnvironment(environment({ ...account, ...invalid })),
    ).toThrow("Private preview requires");
});

it("keeps the eight-hour default and only permits a longer window with an explicit valid day limit", () => {
  const now = Date.now();
  const day = 24 * 3600000;
  const expiry = (offset: number) => new Date(now + offset).toISOString();
  expect(() =>
    parsePrivatePreviewEnvironment(
      environment({ PRIVATE_PREVIEW_EXPIRES_AT: expiry(9 * 3600000) }),
      now,
    ),
  ).toThrow("Private preview requires");
  const extended = parsePrivatePreviewEnvironment(
    environment({
      PRIVATE_PREVIEW_ACCESS: "account",
      PRIVATE_PREVIEW_PASSWORD: undefined,
      PRIVATE_PREVIEW_MAX_DAYS: "31",
      PRIVATE_PREVIEW_EXPIRES_AT: expiry(31 * day),
    }),
    now,
  );
  expect(extended?.expiresAt).toBe(now + 31 * day);
  expect(extended?.companyIds).toEqual(new Set([companyId]));
  expect(extended?.origin).toBe(origin);
  expect(extended?.access).toBe("account");
  expect(
    parsePrivatePreviewEnvironment(
      environment({
        PRIVATE_PREVIEW_MAX_DAYS: "1",
        PRIVATE_PREVIEW_EXPIRES_AT: expiry(day),
      }),
      now,
    )?.expiresAt,
  ).toBe(now + day);
  for (const overrides of [
    { PRIVATE_PREVIEW_MAX_DAYS: "1", PRIVATE_PREVIEW_EXPIRES_AT: expiry(day + 1) },
    { PRIVATE_PREVIEW_MAX_DAYS: "31", PRIVATE_PREVIEW_EXPIRES_AT: expiry(31 * day + 1) },
    { PRIVATE_PREVIEW_MAX_DAYS: "31", PRIVATE_PREVIEW_EXPIRES_AT: undefined },
    { PRIVATE_PREVIEW_MAX_DAYS: "31", HOST: "0.0.0.0" },
    { PRIVATE_PREVIEW_MAX_DAYS: "31", PRIVATE_PREVIEW_COMPANY_IDS: "*" },
  ]) {
    expect(() => parsePrivatePreviewEnvironment(environment(overrides), now)).toThrow("Private preview requires");
  }
});

it("fails closed for invalid or partial explicit preview day-limit configuration", () => {
  for (const days of ["0", "32", "-1", "1.5", "garbage", "", "Infinity", "NaN"]) {
    expect(() =>
      parsePrivatePreviewEnvironment(environment({ PRIVATE_PREVIEW_MAX_DAYS: days })),
    ).toThrow("Private preview requires");
  }
  expect(() =>
    parsePrivatePreviewEnvironment({ NODE_ENV: "production", PRIVATE_PREVIEW_MAX_DAYS: "31" }),
  ).toThrow("Private preview requires");
});

it("opens normal role sign-in routes directly in account mode without minting a preview cookie", async () => {
  const { app, guard } = fixture({
    PRIVATE_PREVIEW_ACCESS: "account",
    PRIVATE_PREVIEW_PASSWORD: undefined,
  });
  expect(guard.accessMode).toBe("account");
  for (const path of [
    "/",
    "/index.html",
    "/__private-preview",
    "/__private-preview?password=ignored",
  ]) {
    const response = await request(app).get(path);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/auth/company");
    expect(response.headers["set-cookie"]).toBeUndefined();
  }
  for (const path of [
    "/auth/company",
    "/auth/hr",
    "/auth/candidate",
    "/auth/verify-contact",
    "/assets/main.js",
  ]) {
    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.body.reachedApplication).toBe(true);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-robots-tag"]).toContain("noindex");
  }
  const legacyPost = await request(app)
    .post("/__private-preview")
    .set("Origin", origin)
    .type("form")
    .send({ password: "anything" });
  expect(legacyPost.status).toBe(303);
  expect(legacyPost.headers.location).toBe("/auth/company");
  expect(legacyPost.headers["set-cookie"]).toBeUndefined();
});

it("keeps real API account authentication and same-origin mutation checks after removing the extra gate", async () => {
  const guard = createPrivatePreview(
    parsePrivatePreviewEnvironment(
      environment({
        PRIVATE_PREVIEW_ACCESS: "account",
        PRIVATE_PREVIEW_PASSWORD: undefined,
      }),
    ),
  );
  previews.push(guard);
  Object.assign(config, { production: true, origin });
  allowedOrigins.add(origin);
  const app = express();
  guard.install(app);
  app.use(createApp());
  for (const path of [
    "/api/auth/me",
    "/api/applications",
    "/api/hr/workloads",
  ]) {
    const response = await request(app).get(path);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.headers["set-cookie"]).toBeUndefined();
  }
  for (const invalidOrigin of [
    undefined,
    "null",
    "https://other.example.test",
  ]) {
    const mutation = request(app).post("/api/interviews");
    if (invalidOrigin !== undefined) mutation.set("Origin", invalidOrigin);
    expect((await mutation.send({})).status).toBe(403);
  }
  expect(
    (await request(app).post("/api/interviews").set("Origin", origin).send({}))
      .status,
  ).toBe(401);
  expect((await request(app).post("/__private-preview").send({})).status).toBe(
    403,
  );
  expect(guard.allowsCompany(companyId)).toBe(true);
  expect(guard.allowsCompany("abcdef1234567890abcdef12")).toBe(false);
});

it("allows account-mode socket transport only from the configured origin and still rejects a missing account session", async () => {
  const { app, guard } = fixture({
    PRIVATE_PREVIEW_ACCESS: "account",
    PRIVATE_PREVIEW_PASSWORD: undefined,
  });
  expect(guard.socketAllowed(socketRequest())).toBe(true);
  expect(guard.socketAllowed(socketRequest(undefined, "null"))).toBe(false);
  expect(
    guard.socketAllowed(socketRequest(undefined, "https://other.example.test")),
  ).toBe(false);
  expect(guard.socketAllowed({ headers: {} } as IncomingMessage)).toBe(false);
  const polling = {
    method: "GET",
    headers: { host: new URL(origin).host, "sec-fetch-site": "same-origin" },
  } as IncomingMessage;
  expect(guard.socketAllowed(polling)).toBe(true);
  expect(
    guard.socketAllowed({
      ...polling,
      headers: { ...polling.headers, host: "other.example.test" },
    } as IncomingMessage),
  ).toBe(false);
  expect(
    guard.socketAllowed({
      ...polling,
      headers: { ...polling.headers, "sec-fetch-site": "cross-site" },
    } as IncomingMessage),
  ).toBe(false);
  allowedOrigins.add(origin);
  const server = createServer(app),
    realtime = attachRealtime(server);
  realtime.engine.use(
    (
      req: IncomingMessage,
      _res: ServerResponse,
      next: (error?: Error) => void,
    ) =>
      next(
        guard.socketAllowed(req)
          ? undefined
          : new Error("Preview origin rejected"),
      ),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const socket = connectSocket(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    extraHeaders: { Origin: origin },
    reconnection: false,
    timeout: 3000,
  });
  try {
    const result = await new Promise<string>((resolve, reject) => {
      socket.once("connect", () =>
        reject(new Error("Account authentication was bypassed")),
      );
      socket.once("connect_error", (error) => resolve(error.message));
    });
    expect(result).toBe("Please sign in.");
  } finally {
    socket.disconnect();
    await new Promise<void>((resolve) => realtime.close(() => resolve()));
  }
});

it("expires account-mode HTTP access and disconnects tracked sockets without a gate cookie", async () => {
  vi.useFakeTimers();
  const { app, guard } = fixture({
    PRIVATE_PREVIEW_ACCESS: "account",
    PRIVATE_PREVIEW_PASSWORD: undefined,
    PRIVATE_PREVIEW_EXPIRES_AT: new Date(Date.now() + 1000).toISOString(),
  });
  const socket = { disconnect: vi.fn(), once: vi.fn() };
  guard.trackSocket(socket);
  await vi.advanceTimersByTimeAsync(1001);
  expect(socket.disconnect).toHaveBeenCalledWith(true);
  expect(guard.socketAllowed(socketRequest())).toBe(false);
  expect(guard.allowsCompany(companyId)).toBe(false);
  const expiredNow = Date.now();
  vi.useRealTimers();
  vi.spyOn(Date, "now").mockReturnValue(expiredNow);
  for (const path of [
    "/",
    "/auth/company",
    "/auth/hr",
    "/api/auth/me",
    "/__private-preview",
  ]) {
    const response = await request(app).get(path);
    expect(response.status).toBe(410);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.text).not.toContain("preview-password");
  }
});

it("does not overflow a 31-day timer and disconnects tracked sockets at the original absolute deadline", async () => {
  vi.useFakeTimers();
  const start = Date.now();
  let clock = start;
  const expiresAt = start + 31 * 24 * 3600000;
  const parsed = parsePrivatePreviewEnvironment(
    environment({
      PRIVATE_PREVIEW_ACCESS: "account",
      PRIVATE_PREVIEW_PASSWORD: undefined,
      PRIVATE_PREVIEW_MAX_DAYS: "31",
      PRIVATE_PREVIEW_EXPIRES_AT: new Date(expiresAt).toISOString(),
    }),
    start,
  );
  const guard = createPrivatePreview(parsed, () => clock);
  previews.push(guard);
  const app = express();
  guard.install(app);
  app.all("/{*path}", (_req, res) => res.json({ reachedApplication: true }));
  const socket = { disconnect: vi.fn(), once: vi.fn() };
  guard.trackSocket(socket);
  expect(guard.enabled()).toBe(true);
  expect(guard.socketAllowed(socketRequest())).toBe(true);

  // A raw 31-day Node timer overflows and fires at 1 ms. This must stay live.
  await vi.advanceTimersByTimeAsync(1);
  expect(socket.disconnect).not.toHaveBeenCalled();
  expect(guard.enabled()).toBe(true);

  // Advance the injected wall clock without waiting through every minute tick.
  clock = start + 25 * 24 * 3600000;
  await vi.advanceTimersByTimeAsync(60000);
  expect(socket.disconnect).not.toHaveBeenCalled();
  expect(guard.allowsCompany(companyId)).toBe(true);
  clock = expiresAt - 1;
  await vi.advanceTimersByTimeAsync(60000);
  expect(socket.disconnect).not.toHaveBeenCalled();
  expect(guard.enabled()).toBe(true);
  clock = expiresAt;
  await vi.advanceTimersByTimeAsync(1);
  expect(socket.disconnect).toHaveBeenCalledExactlyOnceWith(true);
  expect(guard.enabled()).toBe(false);
  expect(guard.socketAllowed(socketRequest())).toBe(false);
  expect(guard.allowsCompany(companyId)).toBe(false);
  vi.useRealTimers();
  const denied = await request(app).get("/api/auth/me");
  expect(denied.status).toBe(410);
  expect(denied.body.reachedApplication).toBeUndefined();
  expect(denied.headers["set-cookie"]).toBeUndefined();
});

it("protects the frontend, static files, API, source-like paths and socket handshake without a gate cookie", async () => {
  const { app, guard } = fixture();
  for (const path of [
    "/",
    "/candidate",
    "/index.html",
    "/assets/main.js",
    "/.env",
    "/src/App.tsx",
    "/api/health",
    "/socket.io/",
  ]) {
    const denied = await request(app).get(path);
    expect(denied.status, path).toBe(401);
    expect(denied.body.reachedApplication).toBeUndefined();
    expect(denied.headers["cache-control"]).toBe("no-store");
    expect(denied.headers["x-robots-tag"]).toContain("noindex");
    expect(denied.text).not.toContain(password);
  }
  expect(guard.socketAllowed(socketRequest())).toBe(false);
  expect(
    guard.socketAllowed(
      socketRequest(`__Host-hirelens_preview=${"a".repeat(64)}`),
    ),
  ).toBe(false);
});

it("preserves the Origin of native form submissions through the production response policy", async () => {
  Object.assign(config, { production: true, origin });
  // No database access is needed: health reports connection state only. Use the
  // actual application's Helmet configuration, not a duplicated test policy.
  const response = await request(createApp()).get("/api/health");
  expect(response.headers["referrer-policy"]).toBe("same-origin");
  expect(response.headers["content-security-policy"]).toContain(
    "form-action 'self'",
  );
});

it("requires same-origin password submission and sets a separate secure expiring opaque cookie", async () => {
  const { app, guard } = fixture();
  for (const invalidOrigin of [
    undefined,
    "null",
    "https://other.example.test",
  ]) {
    const submission = request(app).post("/__private-preview").type("form");
    if (invalidOrigin !== undefined) submission.set("Origin", invalidOrigin);
    const rejected = await submission.send({ password });
    expect(rejected.status).toBe(403);
    expect(rejected.headers["set-cookie"]).toBeUndefined();
  }
  expect(
    (await request(app).get(`/__private-preview?password=${password}`)).status,
  ).toBe(401);
  const { cookie, token } = await enter(app);
  expect(cookie).toMatch(/^__Host-hirelens_preview=[a-f0-9]{64};/);
  for (const attribute of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Expires=",
    "Path=/",
  ])
    expect(cookie).toContain(attribute);
  expect(cookie).not.toContain(password);
  expect(
    (await request(app).get("/api/health").set("Cookie", token)).body
      .reachedApplication,
  ).toBe(true);
  expect(
    (await request(app).post("/api/example").set("Cookie", token)).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/example")
        .set("Cookie", token)
        .set("Origin", origin)
    ).status,
  ).toBe(200);
  expect(guard.socketAllowed(socketRequest(token))).toBe(true);
  expect(guard.socketAllowed(socketRequest(token, "null"))).toBe(false);
  expect(
    guard.socketAllowed({ headers: { cookie: token } } as IncomingMessage),
  ).toBe(false);
  expect(
    guard.socketAllowed(socketRequest(token, "https://other.example.test")),
  ).toBe(false);
  const polling = {
    method: "GET",
    headers: {
      cookie: token,
      host: new URL(origin).host,
      "sec-fetch-site": "same-origin",
    },
  } as IncomingMessage;
  expect(guard.socketAllowed(polling)).toBe(true);
  expect(
    guard.socketAllowed({
      ...polling,
      headers: { ...polling.headers, "sec-fetch-site": "cross-site" },
    } as IncomingMessage),
  ).toBe(false);
  expect(
    guard.socketAllowed({
      ...polling,
      headers: { ...polling.headers, host: "other.example.test" },
    } as IncomingMessage),
  ).toBe(false);
});

it("limits failed preview password attempts without issuing a cookie", async () => {
  const { app } = fixture();
  for (let index = 0; index < 5; index++) {
    const response = await request(app)
      .post("/__private-preview")
      .set("Origin", origin)
      .type("form")
      .send({ password: "incorrect" });
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  }
  const blocked = await request(app)
    .post("/__private-preview")
    .set("Origin", origin)
    .type("form")
    .send({ password });
  expect(blocked.status).toBe(429);
  expect(blocked.headers["set-cookie"]).toBeUndefined();
});

it("only allows listed companies during the preview and adds a visible unverified-company notice", () => {
  const { guard } = fixture();
  expect(guard.allowsCompany(companyId.toUpperCase())).toBe(true);
  expect(guard.allowsCompany("abcdef1234567890abcdef12")).toBe(false);
  expect(guard.allowsCompany(undefined)).toBe(false);
  const html = guard.decorateHtml(
    '<html><body><div id="root"></div></body></html>',
  );
  expect(html).toContain("Private testing preview");
  expect(html).toContain("Local companies remain unverified");
  expect(html).not.toContain(password);
});

it("expires existing HTTP and socket access and disconnects active socket clients", async () => {
  const { app, guard } = fixture();
  const { token } = await enter(app);
  vi.useFakeTimers();
  // Create a short-lived guard after installing fake timers so expiry itself is exercised.
  const config = parsePrivatePreviewEnvironment(
    environment({
      PRIVATE_PREVIEW_EXPIRES_AT: new Date(Date.now() + 1000).toISOString(),
    }),
  );
  const short = createPrivatePreview(config);
  previews.push(short);
  const socket = { disconnect: vi.fn(), once: vi.fn() };
  short.trackSocket(socket);
  await vi.advanceTimersByTimeAsync(1001);
  expect(socket.disconnect).toHaveBeenCalledWith(true);
  expect(short.enabled()).toBe(false);
  expect(short.allowsCompany(companyId)).toBe(false);
  expect(short.socketAllowed(socketRequest(token))).toBe(false);
  // The original guard also rejects an already-issued cookie past its own deadline.
  const expiredNow = Date.now() + 3600000;
  vi.useRealTimers();
  vi.spyOn(Date, "now").mockReturnValue(expiredNow);
  expect(guard.socketAllowed(socketRequest(token))).toBe(false);
  const expired = await request(app).get("/api/health").set("Cookie", token);
  expect(expired.status).toBe(410);
});

it("does not enable local-company access or registration in ordinary production", async () => {
  Object.assign(config, {
    production: true,
    localCompanyRegistration: true,
    host: "127.0.0.1",
    origin,
  });
  vi.spyOn(CompanyModel, "exists").mockResolvedValue({ _id: companyId } as any);
  expect(localCompanyRegistrationEnabled()).toBe(false);
  expect(await localCompanyAccessAllowed({ companyId })).toBe(false);
  expect(await localCompanyAccessAllowed({})).toBe(true);
});
