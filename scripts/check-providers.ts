import { config } from "../server/config.js";
import { providerConfiguration } from "../server/provider-configuration.js";
import { verifySmtpConnection } from "../server/delivery.js";
import { interviewProviderReadiness } from "./provider-readiness.js";

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !["--smtp", "--require-external"].includes(arg))) {
  console.error(
    "Usage: npm run providers:check -- [--smtp] [--require-external]",
  );
  process.exit(2);
}

const report = providerConfiguration(config);
const interview = interviewProviderReadiness(config);
console.log(
  "HireLens delivery, verification, code execution and relay configuration",
);
console.log(
  "This command never sends messages, issues codes, verifies companies or modifies accounts.",
);
for (const [label, item] of [
  ["Email", report.email],
  ["SMS", report.sms],
  ["Company verification", report.companyVerification],
  ["Interview code execution", interview.execution],
  ["Public interview relay", interview.relay],
] as const) {
  console.log(`${label}: ${item.mode}`);
  for (const issue of item.issues) console.log(`  Setup: ${issue}`);
  if (item.mode === "invalid") process.exitCode = 1;
}
console.log(
  `Company sign-in OTP: ${report.otpReady ? "configured" : "needs setup"}`,
);
for (const issue of report.otpIssues) console.log(`  Setup: ${issue}`);
if (report.email.mode === "preview")
  console.log(
    "MESSAGE_PREVIEW=true overrides all message providers: messages stay in .data/messages. Switch it off and restart the API only when the provider is ready.",
  );
console.log(
  "Provider configuration does not prove provider availability or successful delivery. No request is made to billing, messaging or company-verification endpoints.",
);

if (args.has("--smtp")) {
  try {
    await verifySmtpConnection();
    console.log(
      "SMTP passed: connected and authenticated where configured; no message sent. This does not prove sender authorization or inbox delivery.",
    );
  } catch (error) {
    // verifySmtpConnection only returns a fixed, redacted message. Do not print
    // the provider's raw SMTP response, endpoint, username or credentials.
    console.error(
      error instanceof Error ? error.message : "SMTP verification failed.",
    );
    process.exitCode = 1;
  }
}
if (
  args.has("--require-external") &&
  (!["smtp", "http"].includes(report.email.mode) ||
    !["http", "twilio"].includes(report.sms.mode) ||
    !["http", "cashfree"].includes(report.companyVerification.mode) ||
    !report.otpReady ||
    !interview.execution.configuredForExternalUse ||
    !interview.relay.configuredForExternalUse)
) {
  console.error(
    "External setup is incomplete. Configure the missing services; preview mode does not pass this check.",
  );
  process.exitCode = 1;
}
console.log(
  "Readiness is configuration only, not confirmed code execution, public media connectivity or delivery.",
);
console.log("Setup guide: docs/PROVIDER-ACTIVATION.md");
