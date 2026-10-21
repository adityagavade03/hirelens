import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import mongoose from "mongoose";
import {
  productionChildEnvironment,
  productionDeploymentIssues,
  productionFileIssues,
} from "../scripts/production-preflight";

const scaling = vi.hoisted(() => ({ redis: { isReady: false } }));
vi.mock("../server/scaling", () => ({
  redis: scaling.redis,
  rateStore: () => undefined,
}));
import { config } from "../server/config";
import { createApp } from "../server/app";

const original = { ...config };
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
const secret = (label: string) =>
  createHash("sha256").update(`synthetic-deployment-${label}`).digest("hex");
function fields() {
  return {
    SITE_DOMAIN: "recruitment.hirelens-demo.com",
    MONGO_ROOT_PASSWORD: secret("root"),
    MONGO_APP_PASSWORD: secret("app"),
    REDIS_PASSWORD: secret("redis"),
    OTP_HASH_SECRET: secret("otp"),
  };
}

it("accepts independent deployment secrets while rejecting missing, repeated and unsafe URI passwords without echoing values", () => {
  expect(productionDeploymentIssues(fields())).toEqual([]);
  const invalid = {
    ...fields(),
    MONGO_APP_PASSWORD: "private/password?$must-not-print",
  };
  const issues = productionDeploymentIssues(invalid);
  expect(issues).toEqual(
    expect.arrayContaining([expect.stringContaining("MONGO_APP_PASSWORD")]),
  );
  expect(JSON.stringify(issues)).not.toContain(invalid.MONGO_APP_PASSWORD);
  expect(
    productionDeploymentIssues({
      ...fields(),
      OTP_HASH_SECRET: fields().MONGO_ROOT_PASSWORD,
    }),
  ).toEqual(
    expect.arrayContaining([expect.stringContaining("must be different")]),
  );
  expect(
    productionDeploymentIssues({ ...fields(), REDIS_PASSWORD: "a".repeat(64) })
      .length,
  ).toBeGreaterThan(0);
});

it("rejects Caddyfile injection, local/reserved domains and mismatched origin", () => {
  for (const domain of [
    "localhost",
    "127.0.0.1",
    "service.local",
    "hirelens.example.com",
    "app.example",
    "https://hirelens-demo.com",
    "app.hirelens-demo.com { respond private }",
    "*.hirelens-demo.com",
    "app.hirelens-demo.com:443",
    "app.hirelens-demo.com/path",
  ])
    expect(
      productionDeploymentIssues({ ...fields(), SITE_DOMAIN: domain }),
    ).toEqual(expect.arrayContaining([expect.stringContaining("SITE_DOMAIN")]));
  expect(
    productionDeploymentIssues({
      ...fields(),
      APP_ORIGIN: "http://localhost:5173",
    }),
  ).toEqual(expect.arrayContaining([expect.stringContaining("APP_ORIGIN")]));
});

it("blocks accidental development/preview modes and container-local service URLs", () => {
  for (const name of [
    "ALLOW_DEMO_LOGIN",
    "ALLOW_LOCAL_COMPANY_REGISTRATION",
    "MESSAGE_PREVIEW",
    "TURN_LOCAL_DEV",
  ])
    expect(productionDeploymentIssues({ ...fields(), [name]: "true" })).toEqual(
      expect.arrayContaining([expect.stringContaining(name)]),
    );
  expect(
    productionDeploymentIssues({
      ...fields(),
      PRIVATE_PREVIEW_PASSWORD: "private-test-preview-value",
    }),
  ).toEqual(
    expect.arrayContaining([expect.stringContaining("PRIVATE_PREVIEW_")]),
  );
  for (const name of ["NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "PATH"])
    expect(
      productionDeploymentIssues({
        ...fields(),
        [name]: "unsafe-runtime-value",
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining(name)]));
  for (const endpoint of [
    "http://127.0.0.1:8765/v1",
    "https://localhost/v1",
    "https://user:private@ai.hirelens-demo.com/v1",
    "https://ai.hirelens-demo.com/v1?key=private",
  ])
    expect(
      productionDeploymentIssues({
        ...fields(),
        STT_BASE_URL: endpoint,
        STT_API_KEY: "fixture-key",
        STT_MODEL: "fixture-model",
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("STT_BASE_URL")]),
    );
  expect(
    productionDeploymentIssues({
      ...fields(),
      STT_BASE_URL: "https://speech.hirelens-demo.com/v1",
      STT_API_KEY: "fixture-key",
      STT_MODEL: "fixture-model",
    }),
  ).toEqual([]);
});

it("detects credentials that Compose would interpolate differently from the existing provider checker", () => {
  expect(productionFileIssues("SMTP_PASSWORD=private$VALUE\n")).toEqual([
    expect.stringContaining("SMTP_PASSWORD"),
  ]);
  expect(productionFileIssues('SMTP_PASSWORD="private$VALUE"\n')).toEqual([
    expect.stringContaining("SMTP_PASSWORD"),
  ]);
  expect(
    productionFileIssues("SMTP_PASSWORD='private$VALUE'\n# a $comment\n"),
  ).toEqual([]);
});

it("isolates production checks from working local credentials and uses Compose's exact origin and port", () => {
  const env = productionChildEnvironment(fields(), "/fixture/production.env", {
    PATH: "/fixture/bin",
    SMTP_HOST: "local-private-smtp",
    TWILIO_API_KEY_SECRET: "local-private-key",
    NODE_OPTIONS: "--require local-script",
    DOTENV_CONFIG_PATH: "/local/.env",
    APP_ORIGIN: "http://localhost:5173",
  });
  expect(env).toMatchObject({
    PATH: "/fixture/bin",
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "4000",
    APP_ORIGIN: "https://recruitment.hirelens-demo.com",
    DOTENV_CONFIG_PATH: "/fixture/production.env",
  });
  expect(env).not.toHaveProperty("SMTP_HOST");
  expect(env).not.toHaveProperty("TWILIO_API_KEY_SECRET");
  expect(env).not.toHaveProperty("NODE_OPTIONS");
});

it("keeps the existing database health contract when Redis is not configured", async () => {
  config.redisUrl = "";
  scaling.redis.isReady = false;
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  const response = await request(createApp()).get("/api/health");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: "ready" });
});

it("reports unavailable shared services when configured Redis is not ready and recovers when it becomes ready", async () => {
  config.redisUrl = "redis://private:secret@private-fixture:6379";
  scaling.redis.isReady = false;
  const state = vi
    .spyOn(mongoose.connection, "readyState", "get")
    .mockReturnValue(1);
  const app = createApp();
  const unavailable = await request(app).get("/api/health");
  expect(unavailable.status).toBe(503);
  expect(unavailable.body).toEqual({ status: "shared services unavailable" });
  expect(JSON.stringify(unavailable.body)).not.toContain("private-fixture");
  scaling.redis.isReady = true;
  expect((await request(app).get("/api/health")).status).toBe(200);
  state.mockReturnValue(0);
  const databaseDown = await request(app).get("/api/health");
  expect(databaseDown.status).toBe(503);
  expect(databaseDown.body).toEqual({ status: "database unavailable" });
});
