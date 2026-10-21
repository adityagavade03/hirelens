import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createGateway, parseEnvironment } from "./server.mjs";

const publicOrigin = "https://hirelens-gateway-test.onrender.com";
const upstreamOrigin = "https://hirelens-gateway-test.trycloudflare.com";
function environment(overrides = {}) {
  return { PUBLIC_ORIGIN: publicOrigin, HIRELENS_PREVIEW_UPSTREAM: upstreamOrigin, HIRELENS_PREVIEW_EXPIRES_AT: new Date(Date.now() + 60000).toISOString(), ...overrides };
}
function request(port, path = "/", options = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ hostname: "127.0.0.1", port, path, method: options.method || "GET", headers: { host: new URL(publicOrigin).host, ...options.headers }, agent: false }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.once("error", reject);
    outgoing.setTimeout(2500, () => outgoing.destroy(new Error("Test request timed out")));
    if (options.chunks) for (const chunk of options.chunks) outgoing.write(chunk);
    outgoing.end(options.body);
  });
}
async function fixture(t, handler, { upgrade, env, gatewayOptions } = {}) {
  const upstreamSockets = new Set();
  const upstream = createServer(handler);
  upstream.on("connection", (socket) => { upstreamSockets.add(socket); socket.once("close", () => upstreamSockets.delete(socket)); socket.on("error", () => {}); });
  if (upgrade) upstream.on("upgrade", upgrade);
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const configuration = parseEnvironment(environment(env));
  const transport = (options, callback) => httpRequest({ ...options, protocol: "http:", hostname: "127.0.0.1", port: upstream.address().port, agent: false }, callback);
  const gateway = createGateway(configuration, { request: transport, ...gatewayOptions });
  gateway.server.listen(0, "127.0.0.1");
  await once(gateway.server, "listening");
  t.after(async () => {
    await gateway.close();
    for (const socket of upstreamSockets) socket.destroy();
    await new Promise((resolve) => upstream.close(resolve));
  });
  return { gateway, port: gateway.server.address().port, configuration };
}
function raw(port, target, options = {}) {
  const { headers = {}, method = "GET" } = options;
  const origin = Object.hasOwn(options, "origin") ? options.origin : publicOrigin;
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.on("error", () => {});
  const data = { bytes: Buffer.alloc(0) };
  socket.on("data", (chunk) => { data.bytes = Buffer.concat([data.bytes, chunk]); });
  socket.once("connect", () => {
    const fields = { Host: new URL(publicOrigin).host, ...(origin === undefined ? {} : { Origin: origin }), ...headers };
    socket.write(`${method} ${target} HTTP/1.1\r\n${Object.entries(fields).map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n`);
  });
  return { socket, data };
}
async function until(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const wsHeaders = { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" };
function accept(socket, request, extra = "", frame = Buffer.alloc(0)) {
  const key = createHash("sha1").update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(Buffer.concat([Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${key}\r\n${extra}\r\n`), frame]));
}

test("production environment requires fixed HTTPS provider origins and bounded original expiry", () => {
  const configuration = parseEnvironment(environment());
  assert.equal(configuration.backendOrigin, upstreamOrigin);
  assert.equal(configuration.publicOrigin, publicOrigin);
  assert.equal(configuration.host, "0.0.0.0");
  assert.equal(parseEnvironment(environment({ PUBLIC_ORIGIN: undefined, RENDER_EXTERNAL_URL: publicOrigin })).publicOrigin, publicOrigin);
  assert.equal(parseEnvironment(environment({ HIRELENS_BACKEND_ORIGIN: publicOrigin })).backendOrigin, publicOrigin);
  for (const value of ["http://relay.trycloudflare.com", "https://localhost", "https://127.0.0.1:5174", "https://relay.trycloudflare.com/path", "https://relay.trycloudflare.com?x=1", "https://relay.trycloudflare.com#x", "https://user@relay.trycloudflare.com", "https://relay.trycloudflare.com:444", "https://relay.trycloudflare.com.evil.example"]) {
    assert.throws(() => parseEnvironment(environment({ HIRELENS_PREVIEW_UPSTREAM: value })), /HIRELENS_PREVIEW_UPSTREAM/);
  }
  for (const value of [undefined, "http://review.onrender.com", "https://evil.example", "https://review.onrender.com/path", "https://user@review.onrender.com"]) assert.throws(() => parseEnvironment(environment({ PUBLIC_ORIGIN: value })), /PUBLIC_ORIGIN/);
  assert.throws(() => parseEnvironment(environment({ HIRELENS_BACKEND_ORIGIN: "https://other.onrender.com" })), /HIRELENS_BACKEND_ORIGIN/);
  const base = Date.now();
  assert.equal(parseEnvironment(environment({ HIRELENS_PREVIEW_EXPIRES_AT: new Date(base + 9 * 3600000).toISOString() }), base).expiresAt, base + 9 * 3600000);
  assert.equal(parseEnvironment(environment({ HIRELENS_PREVIEW_EXPIRES_AT: new Date(base + 31 * 86400000).toISOString() }), base).expiresAt, base + 31 * 86400000);
  assert.throws(() => parseEnvironment(environment({ HIRELENS_PREVIEW_EXPIRES_AT: new Date(base + 31 * 86400000 + 1).toISOString() }), base), /original ISO expiry/);
  assert.throws(() => parseEnvironment(environment({ HIRELENS_PREVIEW_EXPIRES_AT: undefined })), /original ISO expiry/);
  assert.throws(() => parseEnvironment(environment({ HIRELENS_PREVIEW_EXPIRES_AT: "tomorrow" })), /original ISO expiry/);
  assert.throws(() => parseEnvironment(environment({ PORT: "0" })), /PORT/);
});

test("gateway health is independent liveness and explicitly does not claim backend readiness", async (t) => {
  let calls = 0;
  const { port } = await fixture(t, (_req, res) => { calls++; res.end(); });
  const result = await request(port, "/__gateway/health", { headers: { host: "internal-health-probe" } });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).backend, "not checked");
  assert.equal(JSON.parse(result.body).preview, "active");
  assert.equal(calls, 0);
  assert.equal(result.headers["cache-control"], "no-store");
});

test("unsafe and cross-origin requests fail before any upstream Origin rewrite", async (t) => {
  const origins = [];
  const { port } = await fixture(t, (req, res) => { origins.push(req.headers.origin); req.resume(); res.end("ok"); }, { env: { HIRELENS_BACKEND_ORIGIN: publicOrigin } });
  for (const headers of [{}, { origin: "https://evil.example" }, { origin: "null" }]) assert.equal((await request(port, "/api/auth/login", { method: "POST", headers, body: "{}" })).status, 403);
  assert.equal((await request(port, "/api/auth/me", { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await request(port, "/api/auth/login", { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal(origins.length, 0);
  assert.equal((await request(port, "/api/auth/login", { method: "POST", headers: { origin: publicOrigin }, body: "{}" })).status, 200);
  assert.deepEqual(origins, [publicOrigin]);
});

test("same-origin polling without Origin is supported only with canonical Host and browser metadata", async (t) => {
  const origins = [];
  const { port } = await fixture(t, (req, res) => { origins.push(req.headers.origin); res.end("0{}"); }, { env: { HIRELENS_BACKEND_ORIGIN: publicOrigin } });
  assert.equal((await request(port, "/socket.io/?EIO=4&transport=polling")).status, 403);
  assert.equal((await request(port, "/socket.io/?EIO=4&transport=polling", { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await request(port, "/socket.io/?EIO=4&transport=polling", { headers: { "sec-fetch-site": "same-origin", host: "evil.example" } })).status, 400);
  assert.equal((await request(port, "/socket.io/?EIO=4&transport=polling", { headers: { "sec-fetch-site": "same-origin" } })).status, 200);
  assert.deepEqual(origins, [publicOrigin]);
});

test("binary multipart uploads, account cookies, redirects and CSP survive the relay", async (t) => {
  const binary = Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256));
  const multipart = Buffer.concat([Buffer.from("--test-boundary\r\nContent-Disposition: form-data; name=\"clip\"; filename=\"clip.webm\"\r\nContent-Type: video/webm\r\n\r\n"), binary, Buffer.from("\r\n--test-boundary--\r\n")]);
  let received;
  const cookies = ["hirelens_session=synthetic-session; Path=/; HttpOnly; Secure; SameSite=Lax", "other=synthetic; Path=/; Secure"];
  const { port } = await fixture(t, (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received = { body: Buffer.concat(chunks), headers: req.headers };
      res.writeHead(201, { "content-type": "application/octet-stream", "content-length": binary.length, "set-cookie": cookies, "content-security-policy": `default-src 'self'; connect-src 'self' https: ${upstreamOrigin.replace("https:", "wss:")}; media-src 'self' blob:`, location: `${upstreamOrigin}/auth/company?next=jobs`, "access-control-allow-origin": upstreamOrigin, connection: "close, x-private-hop", "x-private-hop": "remove-response" });
      res.end(binary);
    });
  });
  const result = await request(port, "/api/media/upload", { method: "POST", headers: { origin: publicOrigin, cookie: "hirelens_session=synthetic-session", "content-type": "multipart/form-data; boundary=test-boundary", "content-length": multipart.length, "x-forwarded-for": "attacker", forwarded: "for=attacker", "cf-connecting-ip": "attacker", "x-real-ip": "attacker", connection: "keep-alive, x-private-hop", "x-private-hop": "remove-request" }, body: multipart });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, binary);
  assert.deepEqual(received.body, multipart);
  assert.equal(received.headers.cookie, "hirelens_session=synthetic-session");
  assert.equal(received.headers.origin, upstreamOrigin);
  assert.equal(received.headers.host, new URL(upstreamOrigin).host);
  for (const name of ["x-forwarded-for", "forwarded", "cf-connecting-ip", "x-real-ip", "x-private-hop"]) assert.equal(received.headers[name], undefined);
  assert.deepEqual(result.headers["set-cookie"], cookies);
  assert.equal(result.headers.location, `${publicOrigin}/auth/company?next=jobs`);
  assert.equal(result.headers["access-control-allow-origin"], publicOrigin);
  assert(result.headers["content-security-policy"].includes(publicOrigin.replace("https:", "wss:")));
  assert(!result.headers["content-security-policy"].includes(upstreamOrigin.replace("https:", "wss:")));
  assert.equal(result.headers["x-private-hop"], undefined);
});

test("root redirect and unauthenticated API failures remain application responses", async (t) => {
  const { port } = await fixture(t, (req, res) => {
    if (req.url === "/") { res.writeHead(302, { location: "/auth/company" }); res.end(); }
    else { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Please sign in." } })); }
  });
  const root = await request(port);
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, "/auth/company");
  const result = await request(port, "/api/auth/me");
  assert.equal(result.status, 401);
  assert.equal(JSON.parse(result.body).error.code, "UNAUTHENTICATED");
  assert.equal(result.headers["set-cookie"], undefined);
});

test("absolute URLs, fixture bootstrap paths and CONNECT cannot select another target", async (t) => {
  let calls = 0;
  const { port } = await fixture(t, (_req, res) => { calls++; res.end(); });
  for (const path of ["https://evil.example/api/auth/me", "//evil.example/api/auth/me", "/\\evil.example/api/auth/me"]) assert.equal((await request(port, path)).status, 400);
  for (const path of ["/api/_fixture/candidate", "/_fixture/hr", "/api/../api/_fixture/hr", "/api/%5ffixture/candidate"]) assert.equal((await request(port, path)).status, 404);
  const attempt = raw(port, "evil.example:443", { method: "CONNECT", origin: undefined });
  await until(() => attempt.socket.destroyed);
  assert.match(attempt.data.bytes.toString(), /^HTTP\/1\.1 405/);
  assert.equal(calls, 0);
});

test("declared and chunked oversized bodies stop with a bounded upload error", async (t) => {
  const { port } = await fixture(t, (req, res) => { req.resume(); req.on("end", () => res.end("ok")); }, { gatewayOptions: { maximumBodyBytes: 64 } });
  const declared = await request(port, "/api/media/upload", { method: "POST", headers: { origin: publicOrigin, "content-length": "65" }, body: Buffer.alloc(65) });
  assert.equal(declared.status, 413);
  const streamed = await request(port, "/api/media/upload", { method: "POST", headers: { origin: publicOrigin }, chunks: [Buffer.alloc(40), Buffer.alloc(40)] });
  assert.equal(streamed.status, 413);
  assert.equal(JSON.parse(streamed.body).error.code, "UPLOAD_TOO_LARGE");
});

test("upstream failures expose a clear error without exception details", async (t) => {
  const { port } = await fixture(t, (_req, res) => res.end(), { gatewayOptions: { request: () => { throw new Error("private transport details must not appear"); } } });
  const result = await request(port, "/api/health");
  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.body).error.code, "PREVIEW_UNAVAILABLE");
  assert(!result.body.includes(Buffer.from("private transport")));
});

test("WebSocket Origin and path checks run before any upstream handshake", async (t) => {
  let calls = 0;
  const { port } = await fixture(t, (_req, res) => res.end(), { upgrade: (req, socket) => { calls++; accept(socket, req); } });
  for (const origin of ["https://evil.example", "null", undefined]) {
    const attempt = raw(port, "/socket.io/?EIO=4&transport=websocket", { origin, headers: wsHeaders });
    await until(() => attempt.socket.destroyed);
    assert.match(attempt.data.bytes.toString(), /^HTTP\/1\.1 403/);
  }
  const wrongPath = raw(port, "/other-websocket", { headers: wsHeaders });
  await until(() => wrongPath.socket.destroyed);
  assert.match(wrongPath.data.bytes.toString(), /^HTTP\/1\.1 400/);
  assert.equal(calls, 0);
});

test("WebSockets preserve authenticated headers, binary frames and Socket.IO auth errors", async (t) => {
  let received;
  const reply = Buffer.from('44{"message":"Please sign in."}');
  const replyFrame = Buffer.concat([Buffer.from([0x81, reply.length]), reply]);
  const clientFrame = Buffer.from([0x82, 0x84, 1, 2, 3, 4, 8, 8, 8, 8]);
  const { port } = await fixture(t, (_req, res) => res.end(), { env: { HIRELENS_BACKEND_ORIGIN: publicOrigin }, upgrade: (req, socket) => {
    received = { headers: req.headers, frame: undefined };
    accept(socket, req, "Set-Cookie: websocket-test=synthetic; Path=/; Secure\r\n", replyFrame);
    socket.once("data", (chunk) => { received.frame = chunk; socket.write(chunk); });
  } });
  const attempt = raw(port, "/socket.io/?EIO=4&transport=websocket", { headers: { ...wsHeaders, Cookie: "hirelens_session=synthetic-session", "X-Forwarded-For": "attacker" } });
  t.after(() => attempt.socket.destroy());
  await until(() => attempt.data.bytes.includes(reply));
  assert.match(attempt.data.bytes.toString(), /^HTTP\/1\.1 101/);
  assert(attempt.data.bytes.includes(Buffer.from("set-cookie: websocket-test=synthetic; Path=/; Secure")));
  assert.equal(received.headers.origin, publicOrigin);
  assert.equal(received.headers.host, new URL(upstreamOrigin).host);
  assert.equal(received.headers.cookie, "hirelens_session=synthetic-session");
  assert.equal(received.headers["x-forwarded-for"], undefined);
  attempt.socket.write(clientFrame);
  await until(() => received.frame && attempt.data.bytes.includes(clientFrame));
  assert.deepEqual(received.frame, clientFrame);
});

test("original expiry closes existing WebSockets, stops pending HTTP and stays expired after restart", async (t) => {
  let pending = false;
  const expiresAt = new Date(Date.now() + 450).toISOString();
  const { port } = await fixture(t, (req, res) => {
    if (req.url === "/pending") pending = true;
    else res.end("ok");
  }, { env: { HIRELENS_PREVIEW_EXPIRES_AT: expiresAt }, upgrade: (req, socket) => accept(socket, req) });
  const attempt = raw(port, "/socket.io/?EIO=4&transport=websocket", { headers: wsHeaders });
  t.after(() => attempt.socket.destroy());
  await until(() => attempt.data.bytes.includes(Buffer.from("101 Switching Protocols")));
  const waiting = request(port, "/pending");
  await until(() => pending);
  assert.equal((await waiting).status, 410);
  await until(() => attempt.socket.destroyed);
  assert(attempt.data.bytes.includes(Buffer.from([0x88, 0x02, 0x03, 0xe9])));
  assert.equal((await request(port, "/api/auth/me")).status, 410);
  const health = await request(port, "/__gateway/health");
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).preview, "expired");
  const restarted = await fixture(t, (_req, res) => res.end("must not reach"), { env: { HIRELENS_PREVIEW_EXPIRES_AT: expiresAt } });
  assert.equal((await request(restarted.port)).status, 410);
});

test("a 31-day window uses bounded timer chunks and closes live traffic only at its absolute deadline", async (t) => {
  let clock = Date.now();
  const absoluteDeadline = clock + 31 * 86400000;
  const timers = [];
  const gatewayOptions = {
    now: () => clock,
    setTimer(callback, delay) {
      const timer = { delay, unreferenced: false, cleared: false, fire: callback, unref() { this.unreferenced = true; } };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) { if (timer) timer.cleared = true; },
  };
  let pendingSeen = false;
  let pendingResolved = false;
  const env = { HIRELENS_PREVIEW_EXPIRES_AT: new Date(absoluteDeadline).toISOString() };
  const { port } = await fixture(t, (req, res) => {
    if (req.url === "/pending") pendingSeen = true;
    else res.end("ok");
  }, { env, gatewayOptions, upgrade: (req, socket) => accept(socket, req) });
  assert.equal(timers[0].delay, 2_147_483_647);
  assert.equal(timers[0].unreferenced, true);
  assert.equal((await request(port, "/api/health")).status, 200);

  const attempt = raw(port, "/socket.io/?EIO=4&transport=websocket", { headers: wsHeaders });
  t.after(() => attempt.socket.destroy());
  await until(() => attempt.data.bytes.includes(Buffer.from("101 Switching Protocols")));
  const pending = request(port, "/pending").then((result) => { pendingResolved = true; return result; });
  await until(() => pendingSeen);

  // An early timer wake must re-arm rather than expire the interview.
  timers.at(-1).fire();
  assert.equal(timers.at(-1).delay, 2_147_483_647);
  assert.equal(JSON.parse((await request(port, "/__gateway/health")).body).preview, "active");
  assert.equal(attempt.socket.destroyed, false);
  assert.equal(pendingResolved, false);

  clock += 2_147_483_647;
  timers.at(-1).fire();
  assert.equal(timers.at(-1).delay, absoluteDeadline - clock);
  assert(timers.at(-1).delay > 0 && timers.at(-1).delay <= 2_147_483_647);
  assert.equal((await request(port, "/api/health")).status, 200);
  assert.equal(attempt.socket.destroyed, false);
  assert.equal(pendingResolved, false);

  clock = absoluteDeadline - 1;
  timers.at(-1).fire();
  assert.equal(timers.at(-1).delay, 1);
  assert.equal((await request(port, "/api/health")).status, 200);
  clock = absoluteDeadline;
  timers.at(-1).fire();
  assert.equal((await pending).status, 410);
  await until(() => attempt.socket.destroyed);
  assert(attempt.data.bytes.includes(Buffer.from([0x88, 0x02, 0x03, 0xe9])));
  assert.equal((await request(port, "/api/health")).status, 410);

  const timerCount = timers.length;
  const restarted = await fixture(t, (_req, res) => res.end("must not reach"), { env, gatewayOptions });
  assert.equal((await request(restarted.port)).status, 410);
  assert.equal(timers.length, timerCount);
});
