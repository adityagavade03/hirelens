import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { config, serviceStatus } from "../server/config";
import { iceConfiguration } from "../server/ice";

const original = { ...config };
const accountSid = `AC${"1".repeat(32)}`;
const apiKeySid = `SK${"2".repeat(32)}`;
let fetchMock: ReturnType<typeof vi.spyOn>;

function token(ttl: number | string = 3600) {
  return {
    account_sid: accountSid,
    ttl,
    password: "provider-top-level-password-is-not-returned",
    ice_servers: [
      { urls: "stun:global.stun.twilio.com:3478" },
      {
        urls: "turn:global.turn.twilio.com:3478?transport=udp",
        username: "temporary-user",
        credential: "temporary-password",
      },
      {
        urls: [
          "turn:global.turn.twilio.com:3478?transport=tcp",
          "turn:global.turn.twilio.com:443?transport=tcp",
        ],
        username: "temporary-user",
        credential: "temporary-password",
      },
    ],
  };
}

beforeEach(() => {
  Object.assign(config, {
    production: false,
    turnProvider: "twilio",
    turnLocalDev: false,
    turnTtl: 3600,
    twilioAccountSid: accountSid,
    twilioApiKeySid: apiKeySid,
    twilioApiKeySecret: "private-api-key-secret",
    twilioAuthToken: "private-auth-token",
    twilioFrom: "",
    twilioMessagingServiceSid: "",
  });
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected real service request in an isolated test");
  });
});

afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("uses fixed HTTPS token creation with API-key auth and returns only temporary ICE fields", async () => {
  fetchMock.mockResolvedValue(Response.json(token("3600")));
  const result = await iceConfiguration("candidate-test-id");
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
  );
  expect(options).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKeySid}:private-api-key-secret`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "Ttl=3600",
  });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(result.iceServers[0]).toEqual({
    urls: ["stun:global.stun.twilio.com:3478"],
  });
  expect(result.iceServers[1].credential).toBe("temporary-password");
  expect(result.iceServers[2].urls).toHaveLength(2);
  const serialized = JSON.stringify(result);
  for (const privateValue of [
    accountSid,
    apiKeySid,
    config.twilioApiKeySecret,
    config.twilioAuthToken,
    token().password,
  ])
    expect(serialized).not.toContain(privateValue);
  expect(serviceStatus()).toMatchObject({ turn: true, turnLocalDev: false });
});

it("allows development Auth Token fallback but requires API keys in production", async () => {
  config.twilioApiKeySid = config.twilioApiKeySecret = "";
  fetchMock.mockResolvedValue(Response.json(token()));
  await iceConfiguration("test-user");
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
    `Basic ${Buffer.from(`${accountSid}:private-auth-token`).toString("base64")}`,
  );
  fetchMock.mockClear();
  config.production = true;
  await expect(iceConfiguration("test-user")).rejects.toMatchObject({
    status: 503,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not fetch with partial API keys even when an Auth Token exists", async () => {
  config.twilioApiKeySecret = "";
  await expect(iceConfiguration("test-user")).rejects.toThrow(
    "incomplete or invalid",
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(serviceStatus().turn).toBe(false);
});

it("normalizes legacy singular provider URLs into browser urls arrays", async () => {
  const data = token();
  const legacy = {
    ...data,
    ice_servers: data.ice_servers.map(({ urls, ...entry }) => ({
      ...entry,
      url: urls,
    })),
  };
  fetchMock.mockResolvedValue(Response.json(legacy));
  const result = await iceConfiguration("test-user");
  expect(result.iceServers[1].urls).toEqual([
    "turn:global.turn.twilio.com:3478?transport=udp",
  ]);
  expect(result.iceServers[2].urls).toHaveLength(2);
});

it.each([
  [1, 60],
  [100000, 86400],
  [Number.NaN, 3600],
  [3599.9, 3599],
])(
  "bounds configured token lifetime %s to %s seconds",
  async (configured, expected) => {
    config.turnTtl = configured;
    fetchMock.mockResolvedValue(Response.json(token(expected)));
    await iceConfiguration("test-user");
    expect(fetchMock.mock.calls[0][1].body).toBe(`Ttl=${expected}`);
  },
);

it.each([
  "https://global.turn.twilio.com/token",
  "turn:global.turn.twilio.com.attacker.test:3478?transport=udp",
  "turn:127.0.0.1:3478?transport=udp",
  "turn:user:password@global.turn.twilio.com:3478",
  "turn:global.turn.twilio.com:0?transport=udp",
  "turn:global.turn.twilio.com:65536?transport=udp",
  "turn:global.turn.twilio.com:3478?transport=udp#secret",
  "turn:global.stun.twilio.com:3478?transport=udp",
  "turns:global.turn.twilio.com:5349?transport=udp",
])("rejects unexpected provider ICE URL %s", async (url) => {
  const data = token();
  data.ice_servers[1].urls = url;
  fetchMock.mockResolvedValue(Response.json(data));
  await expect(iceConfiguration("test-user")).rejects.toThrow(
    "could not issue valid temporary credentials",
  );
});

it("rejects a response without TURN, missing credentials or an excessive returned lifetime", async () => {
  const noTurn = token();
  noTurn.ice_servers = noTurn.ice_servers.slice(0, 1);
  const noCredential = token();
  noCredential.ice_servers[1].credential = "";
  for (const data of [
    noTurn,
    noCredential,
    token(86400),
    { ...token(), account_sid: "different-account" },
  ]) {
    fetchMock.mockResolvedValueOnce(Response.json(data));
    await expect(iceConfiguration("test-user")).rejects.toMatchObject({
      status: 502,
    });
  }
});

it("rejects long-term secrets returned in the temporary credential field", async () => {
  const data = token();
  data.ice_servers[1].credential = config.twilioApiKeySecret;
  fetchMock.mockResolvedValue(Response.json(data));
  await expect(iceConfiguration("test-user")).rejects.toThrow(
    "could not issue valid temporary credentials",
  );
});

it("bounds responses and redacts provider errors", async () => {
  for (const response of [
    new Response("private-api-key-secret rejected", { status: 401 }),
    new Response("x".repeat(65537)),
    new Response("not json"),
  ]) {
    fetchMock.mockResolvedValueOnce(response);
    const error = await iceConfiguration("test-user").catch(
      (error: unknown) => error,
    );
    expect(error).toMatchObject({ status: 502 });
    expect(String(error)).not.toContain("private-api-key-secret");
  }
});

it("aborts a stalled token request after eight seconds without returning transport errors", async () => {
  vi.useFakeTimers();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), milliseconds);
      return controller.signal;
    });
  fetchMock.mockImplementation(
    (_url: RequestInfo | URL, options?: RequestInit) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("transport private error")),
          { once: true },
        );
      }),
  );
  const assertion = expect(iceConfiguration("test-user")).rejects.toThrow(
    "could not issue valid temporary credentials",
  );
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
  expect(timeout).toHaveBeenCalledWith(8000);
});

it("keeps HMAC the explicit legacy mode and rejects unknown provider modes without network access", async () => {
  config.turnProvider = "hmac";
  config.turnUrl = "turn:relay.example.test:3478?transport=udp";
  config.turnSecret = "local-test-shared-secret";
  const result = await iceConfiguration("test-user");
  expect(result.iceServers[1].username).toContain(":test-user");
  expect(fetchMock).not.toHaveBeenCalled();
  config.turnProvider = "unknown";
  await expect(iceConfiguration("test-user")).rejects.toMatchObject({
    status: 503,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reports a local-only HMAC relay unavailable in production, matching the runtime guard", async () => {
  Object.assign(config, {
    production: true,
    turnProvider: "hmac",
    turnLocalDev: true,
    turnUrl: "turn:relay.example.test:3478?transport=udp",
    turnSecret: "local-test-shared-secret",
  });
  expect(serviceStatus().turn).toBe(false);
  await expect(iceConfiguration("test-user")).rejects.toMatchObject({
    status: 503,
  });
  config.production = false;
  expect(serviceStatus().turn).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("skips automatic local relay startup for a managed provider despite a stale local flag", () => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/local-turn.ts", "--if-enabled"],
    {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
      env: { ...process.env, TURN_PROVIDER: "twilio", TURN_LOCAL_DEV: "true" },
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("");
});

it("refuses direct local relay setup while a managed provider is selected", () => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/local-turn.ts"],
    {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
      env: { ...process.env, TURN_PROVIDER: "twilio", TURN_LOCAL_DEV: "true" },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("managed TURN provider is selected");
  expect(result.stdout).toBe("");
});
