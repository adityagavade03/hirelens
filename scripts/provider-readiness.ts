import type { config } from "../server/config.js";
import {
  twilioCredentialConfigurationIssues,
  validProviderUrl,
} from "../server/provider-configuration.js";
import {
  validateJudgeSettings,
  validatePublicTurnSettings,
} from "./setup-providers.js";

type Configuration = typeof config;
type Item = {
  mode: string;
  configuredForExternalUse: boolean;
  issues: string[];
};

// Configuration only: no network requests, credential printing or live-state claims.
export function interviewProviderReadiness(settings: Configuration): {
  execution: Item;
  relay: Item;
} {
  let publicDemo = false;
  try {
    publicDemo = ["ce.judge0.com", "extra-ce.judge0.com"].includes(
      new URL(settings.judgeUrl).hostname.toLowerCase().replace(/\.$/, ""),
    );
  } catch {
    /* Validated below. */
  }
  const judgeIssues = validateJudgeSettings({
    JUDGE0_URL: settings.judgeUrl,
    JUDGE0_API_KEY: settings.judgeKey,
    JUDGE0_AUTH_HEADER: settings.judgeHeader,
    JUDGE0_RAPIDAPI_HOST: settings.rapidHost,
  });
  // Setup can stage a local HTTP executor, but a production server cannot use
  // it. Apply the runtime transport and credential guards to readiness too.
  const runtimeIssues: string[] = [];
  if (
    settings.judgeUrl &&
    !validProviderUrl(settings.judgeUrl, settings.production)
  )
    runtimeIssues.push(
      "JUDGE0_URL must use HTTPS in production without embedded credentials or a fragment.",
    );
  try {
    if (new URL(settings.judgeUrl).search)
      runtimeIssues.push("JUDGE0_URL must not contain a query.");
  } catch {
    if (settings.judgeUrl)
      runtimeIssues.push("JUDGE0_URL must be a valid service endpoint.");
  }
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(settings.judgeHeader))
    runtimeIssues.push("JUDGE0_AUTH_HEADER must be a valid HTTP header name.");
  if (
    settings.judgeKey.length > 4096 ||
    /[\x00-\x1f\x7f]/.test(settings.judgeKey)
  )
    runtimeIssues.push(
      "JUDGE0_API_KEY must contain at most 4096 characters and no control characters.",
    );
  judgeIssues.push(...runtimeIssues);
  const execution = !settings.judgeUrl
    ? {
        mode: "unconfigured",
        configuredForExternalUse: false,
        issues: [
          "Connect an authenticated Judge0 service for hiring interviews.",
        ],
      }
    : publicDemo
      ? {
          mode: runtimeIssues.length ? "invalid" : "public-practice-only",
          configuredForExternalUse: false,
          issues: [
            "The public Judge0 demo does not enable hiring assessments.",
            ...runtimeIssues,
          ],
        }
      : {
          mode: judgeIssues.length
            ? "invalid"
            : "private-configured-unverified",
          configuredForExternalUse: !judgeIssues.length,
          issues: judgeIssues,
        };
  let relay: Item;
  if (settings.turnProvider === "twilio") {
    const issues = twilioCredentialConfigurationIssues(settings);
    relay = {
      mode: issues.length ? "invalid" : "twilio-configured-unverified",
      configuredForExternalUse: !issues.length,
      issues,
    };
  } else if (settings.turnProvider !== "hmac") {
    relay = {
      mode: "invalid",
      configuredForExternalUse: false,
      issues: ["TURN_PROVIDER must be hmac or twilio."],
    };
  } else if (settings.turnLocalDev) {
    relay = {
      mode: "local-test-only",
      configuredForExternalUse: false,
      issues: [
        "Replace the same-computer test relay with a public TURN service.",
      ],
    };
  } else {
    const issues = validatePublicTurnSettings({
      TURN_URL: settings.turnUrl,
      TURN_SECRET: settings.turnSecret,
      TURN_LOCAL_DEV: String(settings.turnLocalDev),
    });
    relay = {
      mode:
        !settings.turnUrl && !settings.turnSecret
          ? "unconfigured"
          : issues.length
            ? "invalid"
            : "public-configured-unverified",
      configuredForExternalUse: !issues.length,
      issues,
    };
  }
  return { execution, relay };
}
