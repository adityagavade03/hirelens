import { createServer, STATUS_CODES } from "node:http";
import { request as httpsRequest } from "node:https";
import { pathToFileURL } from "node:url";
import path from "node:path";

const eightHours = 8 * 60 * 60 * 1000;
const healthPath = "/__gateway/health";
const securityHeaders = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-content-type-options": "nosniff",
  "x-hirelens-gateway": "temporary-laptop-preview",
};
const hopHeaders = new Set([
  "connection", "proxy-connection", "keep-alive", "transfer-encoding", "te",
  "trailer", "upgrade", "proxy-authenticate", "proxy-authorization", "alt-svc",
]);

function exactOrigin(value, suffix, setting) {
  let parsed;
  try { parsed = new URL(value); } catch { /* Report the setting, never its value. */ }
  if (!parsed || parsed.protocol !== "https:" || parsed.origin !== value ||
      parsed.username || parsed.password || parsed.port ||
      !parsed.hostname.endsWith(suffix) ||
      !/^[a-z0-9][a-z0-9-]*$/.test(parsed.hostname.slice(0, -suffix.length))) {
    throw new Error(`${setting} must be an exact HTTPS ${suffix.slice(1)} origin.`);
  }
  return parsed.origin;
}

export function parseEnvironment(env, now = Date.now()) {
  const upstreamOrigin = exactOrigin(env.HIRELENS_PREVIEW_UPSTREAM, ".trycloudflare.com", "HIRELENS_PREVIEW_UPSTREAM");
  const publicOrigin = exactOrigin(env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL, ".onrender.com", "PUBLIC_ORIGIN");
  const backendOrigin = env.HIRELENS_BACKEND_ORIGIN || upstreamOrigin;
  if (![upstreamOrigin, publicOrigin].includes(backendOrigin)) {
    throw new Error("HIRELENS_BACKEND_ORIGIN must equal the configured upstream or public origin.");
  }
  const expiry = env.HIRELENS_PREVIEW_EXPIRES_AT || "";
  const expiresAt = Date.parse(expiry);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) ||
      !Number.isFinite(expiresAt) || expiresAt > now + eightHours) {
    throw new Error("HIRELENS_PREVIEW_EXPIRES_AT must be the original ISO expiry, no more than eight hours ahead.");
  }
  // Expired configuration remains fail-closed after a Render restart. It never
  // silently starts a fresh eight-hour session or creates another tunnel.
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");
  return Object.freeze({ upstreamOrigin, publicOrigin, backendOrigin, expiresAt, port, host: "0.0.0.0" });
}

function cleanHeaders(headers, request = false) {
  const omitted = new Set(hopHeaders);
  for (const value of String(headers.connection || "").split(",")) omitted.add(value.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    value !== undefined && !omitted.has(name.toLowerCase()) &&
    !(request && /^(?:forwarded$|x-forwarded-|x-real-ip$|true-client-ip$|x-client-ip$|cf-|x-original-|x-rewrite-url$)/i.test(name))));
}

function targetFor(request) {
  const target = request.url;
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") || /[\\#\x00-\x20\x7f]/.test(target)) return null;
  try {
    const parsed = new URL(target, "https://gateway.invalid");
    const decodedPath = decodeURIComponent(parsed.pathname).toLowerCase();
    return { path: target, pathname: parsed.pathname, decodedPath };
  } catch { return null; }
}

function forbiddenFixture(target) {
  return /^\/(?:api\/)?_fixture(?:\/|$)/.test(target.decodedPath);
}

function htmlEscape(text) {
  return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function errorBody(request, code, message) {
  if (!request.url?.startsWith("/api/") && request.headers.accept?.includes("text/html")) {
    return { type: "text/html; charset=utf-8", body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HireLens test preview</title><body><h1>HireLens test preview</h1><p>${htmlEscape(message)}</p></body></html>` };
  }
  return { type: "application/json; charset=utf-8", body: JSON.stringify({ error: { code, message } }) };
}

function sendError(request, response, status, code, message) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  const { type, body } = errorBody(request, code, message);
  response.writeHead(status, { ...securityHeaders, "content-type": type, "content-length": Buffer.byteLength(body), connection: "close" });
  response.end(request.method === "HEAD" ? undefined : body);
}

function rejectUpgrade(socket, status, code, message) {
  if (socket.destroyed || !socket.writable) return;
  const body = JSON.stringify({ error: { code, message } });
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nCache-Control: no-store\r\nX-Robots-Tag: noindex, nofollow, noarchive\r\n\r\n${body}`);
}

// Only the transport and clock are injectable for local tests. The executable
// entry point always uses validated environment settings and ordinary HTTPS.
export function createGateway(configuration, {
  request: requestUpstream = httpsRequest,
  now = Date.now,
  maximumBodyBytes = 16 * 1024 * 1024,
  upstreamTimeoutMs = 180000,
} = {}) {
  const { publicOrigin, upstreamOrigin, backendOrigin, expiresAt } = configuration;
  const upstream = new URL(upstreamOrigin);
  const canonicalHost = new URL(publicOrigin).host;
  const activeHttp = new Set();
  const upgrades = new Set();
  const connections = new Set();
  let closed = false;
  let expired = now() >= expiresAt;

  const expiredMessage = "Temporary HireLens access has ended. Ask the owner to start a new authorised preview.";
  const unavailableMessage = "The HireLens test preview is unavailable. The owner's laptop and temporary preview must stay running.";

  function finishUpgrade(record) {
    if (record.finished) return;
    record.finished = true;
    upgrades.delete(record);
    record.client.unpipe();
    record.remote?.unpipe();
    record.request?.destroy();
    record.remote?.destroy();
  }
  function expire() {
    if (expired) return;
    expired = true;
    for (const record of activeHttp) {
      record.client.unpipe();
      record.upstream?.destroy();
      sendError(record.client, record.response, 410, "PREVIEW_EXPIRED", expiredMessage);
    }
    for (const record of [...upgrades]) {
      if (record.established) record.client.end(Buffer.from([0x88, 0x02, 0x03, 0xe9]), () => record.client.destroy());
      else rejectUpgrade(record.client, 410, "PREVIEW_EXPIRED", expiredMessage);
      finishUpgrade(record);
    }
  }
  const deadline = setTimeout(expire, Math.max(1, expiresAt - now()));
  deadline.unref();

  function validate(request, websocket = false) {
    const target = targetFor(request);
    if (!target) return { status: 400, code: "INVALID_REQUEST_TARGET", message: "Use an application path on this website." };
    // Render's own health probe can use an internal Host. No application data or
    // upstream request is available through this independent liveness route.
    const health = !websocket && target.pathname === healthPath && ["GET", "HEAD"].includes(request.method);
    if (!health && request.headers.host?.toLowerCase() !== canonicalHost) return { status: 400, code: "INVALID_HOST", message: "Use this preview's public website address." };
    const origin = request.headers.origin;
    if ((origin !== undefined && origin !== publicOrigin) ||
        ((websocket || !["GET", "HEAD", "OPTIONS"].includes(request.method)) && origin !== publicOrigin)) {
      return { status: 403, code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." };
    }
    if (forbiddenFixture(target) || (target.pathname.startsWith("/__gateway") && !health)) return { status: 404, code: "NOT_FOUND", message: "Page not found." };
    const socketPath = ["/socket.io", "/socket.io/"].includes(target.pathname);
    if (socketPath && origin === undefined && request.headers["sec-fetch-site"] !== "same-origin") return { status: 403, code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." };
    if (websocket && (request.method !== "GET" || request.headers.upgrade?.toLowerCase() !== "websocket" || !socketPath)) return { status: 400, code: "INVALID_UPGRADE", message: "Only interview WebSocket connections are supported." };
    if (now() >= expiresAt) expire();
    if (!health && expired) return { status: 410, code: "PREVIEW_EXPIRED", message: expiredMessage };
    return { target, health };
  }
  function outgoingHeaders(request, websocket = false) {
    return {
      ...cleanHeaders(request.headers, true),
      host: upstream.host,
      // The incoming public Origin has already been checked. Supplying the
      // backend's canonical Origin also supports same-origin polling GETs.
      origin: backendOrigin,
      ...(websocket ? { connection: "Upgrade", upgrade: "websocket" } : {}),
    };
  }
  function rewriteUrl(value) {
    if (typeof value !== "string") return value;
    try {
      const parsed = new URL(value);
      if ([upstreamOrigin, backendOrigin].includes(parsed.origin)) return publicOrigin + parsed.pathname + parsed.search + parsed.hash;
    } catch { /* Relative redirects stay relative. */ }
    return value;
  }
  function responseHeaders(headers) {
    const result = { ...cleanHeaders(headers), ...securityHeaders };
    for (const key of ["location", "content-location"]) if (result[key]) result[key] = rewriteUrl(result[key]);
    if ([upstreamOrigin, backendOrigin].includes(result["access-control-allow-origin"])) result["access-control-allow-origin"] = publicOrigin;
    for (const key of ["content-security-policy", "content-security-policy-report-only"]) {
      if (typeof result[key] !== "string") continue;
      for (const origin of new Set([upstreamOrigin, backendOrigin])) {
        for (const [from, to] of [[origin, publicOrigin], [origin.replace(/^https:/, "wss:"), publicOrigin.replace(/^https:/, "wss:")]]) {
          const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          result[key] = result[key].replace(new RegExp(`${escaped}(?=[;\\s]|$)`, "g"), () => to);
        }
      }
    }
    return result;
  }
  function options(request, target, websocket = false) {
    return { protocol: "https:", hostname: upstream.hostname, port: 443, method: request.method, path: target.path, headers: outgoingHeaders(request, websocket) };
  }

  const server = createServer((request, response) => {
    const checked = validate(request);
    if (checked.status) { request.resume(); sendError(request, response, checked.status, checked.code, checked.message); return; }
    if (checked.health) {
      const body = JSON.stringify({ status: "gateway running", preview: expired ? "expired" : "active", backend: "not checked", expiresAt: new Date(expiresAt).toISOString() });
      response.writeHead(200, { ...securityHeaders, "content-type": "application/json", "content-length": Buffer.byteLength(body) });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    const length = request.headers["content-length"];
    if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maximumBodyBytes)) {
      request.resume(); sendError(request, response, 413, "UPLOAD_TOO_LARGE", "The request is too large for this test preview."); return;
    }
    const record = { client: request, response, upstream: undefined };
    activeHttp.add(record);
    let bytes = 0;
    const fail = () => sendError(request, response, 502, "PREVIEW_UNAVAILABLE", unavailableMessage);
    try {
      record.upstream = requestUpstream(options(request, checked.target), (remoteResponse) => {
        if (expired || now() >= expiresAt) { expire(); remoteResponse.destroy(); return; }
        if (response.destroyed || response.writableEnded) { remoteResponse.destroy(); return; }
        response.writeHead(remoteResponse.statusCode || 502, responseHeaders(remoteResponse.headers));
        remoteResponse.on("error", () => response.destroy());
        remoteResponse.pipe(response);
      });
      record.upstream.on("error", () => { if (!expired) fail(); });
      record.upstream.setTimeout(upstreamTimeoutMs, () => record.upstream.destroy(new Error("Upstream timeout")));
      request.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maximumBodyBytes) {
          request.unpipe(record.upstream);
          sendError(request, response, 413, "UPLOAD_TOO_LARGE", "The request is too large for this test preview.");
          record.upstream.destroy();
          request.resume();
        }
      });
      request.once("aborted", () => record.upstream.destroy());
      response.once("close", () => { activeHttp.delete(record); record.upstream.destroy(); });
      request.pipe(record.upstream);
    } catch {
      activeHttp.delete(record);
      record.upstream?.destroy();
      request.resume();
      fail();
    }
  });

  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
    socket.on("error", () => {});
  });
  server.on("connect", (_request, socket) => rejectUpgrade(socket, 405, "CONNECT_NOT_ALLOWED", "CONNECT is not supported."));
  server.on("clientError", (_error, socket) => rejectUpgrade(socket, 400, "INVALID_REQUEST", "Invalid HTTP request."));
  server.on("upgrade", (request, client, head) => {
    const checked = validate(request, true);
    if (checked.status) { rejectUpgrade(client, checked.status, checked.code, checked.message); return; }
    const record = { client, request: undefined, remote: undefined, established: false, finished: false };
    upgrades.add(record);
    client.once("close", () => finishUpgrade(record));
    const fail = () => {
      if (!record.finished && !record.established) rejectUpgrade(client, expired ? 410 : 502, expired ? "PREVIEW_EXPIRED" : "PREVIEW_UNAVAILABLE", expired ? expiredMessage : unavailableMessage);
      else if (record.established) client.destroy();
      finishUpgrade(record);
    };
    try {
      record.request = requestUpstream(options(request, checked.target, true));
      record.request.setTimeout(upstreamTimeoutMs, fail);
      record.request.once("error", () => { if (!record.finished) fail(); });
      record.request.once("upgrade", (remoteResponse, remote, remoteHead) => {
        if (now() >= expiresAt) expire();
        if (record.finished || expired || client.destroyed) { remote.destroy(); finishUpgrade(record); return; }
        record.established = true;
        record.remote = remote;
        remote.setTimeout(0);
        remote.once("close", () => { client.destroy(); finishUpgrade(record); });
        remote.on("error", () => { client.destroy(); finishUpgrade(record); });
        const headers = { ...responseHeaders(remoteResponse.headers), connection: "Upgrade", upgrade: "websocket" };
        delete headers["content-length"];
        const lines = Object.entries(headers).flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map((part) => `${name}: ${part}`));
        client.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join("\r\n")}\r\n\r\n`);
        if (remoteHead.length) client.write(remoteHead);
        if (head.length) remote.write(head);
        client.pipe(remote);
        remote.pipe(client);
      });
      record.request.once("response", (remoteResponse) => {
        if (record.finished) { remoteResponse.destroy(); return; }
        if (now() >= expiresAt) { expire(); remoteResponse.destroy(); return; }
        const headers = { ...responseHeaders(remoteResponse.headers), connection: "close" };
        const lines = Object.entries(headers).flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map((part) => `${name}: ${part}`));
        client.write(`HTTP/1.1 ${remoteResponse.statusCode || 502} ${STATUS_CODES[remoteResponse.statusCode] || "Error"}\r\n${lines.join("\r\n")}\r\n\r\n`);
        remoteResponse.on("error", () => { client.destroy(); finishUpgrade(record); });
        remoteResponse.pipe(client);
      });
      record.request.end();
    } catch { fail(); }
  });
  server.headersTimeout = 70000;
  // This limits receiving the client request, not the backend response. AI and
  // speech responses get the separate three-minute upstream inactivity budget.
  server.requestTimeout = 120000;
  server.keepAliveTimeout = 65000;

  return {
    server,
    async close() {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      for (const record of activeHttp) record.upstream?.destroy();
      for (const record of [...upgrades]) { record.client.destroy(); finishUpgrade(record); }
      for (const socket of connections) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const configuration = parseEnvironment(process.env);
    const gateway = createGateway(configuration);
    gateway.server.listen(configuration.port, configuration.host, () => console.log(JSON.stringify({ gateway: "running", port: configuration.port, expiresAt: new Date(configuration.expiresAt).toISOString(), laptopRequired: true })));
    gateway.server.on("error", () => { console.error("The preview gateway could not listen on its configured port."); process.exitCode = 1; void gateway.close(); });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void gateway.close().then(() => process.exit(0)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "The preview gateway configuration is invalid.");
    process.exitCode = 1;
  }
}
