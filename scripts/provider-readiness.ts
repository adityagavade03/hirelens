import type { config } from "../server/config.js";
import { twilioCredentialConfigurationIssues } from "../server/provider-configuration.js";
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
          mode: "public-practice-only",
          configuredForExternalUse: false,
          issues: [
            "The public Judge0 demo does not enable hiring assessments.",
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
