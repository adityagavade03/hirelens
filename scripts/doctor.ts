import { access } from "node:fs/promises";
import mongoose from "mongoose";
import { config, serviceStatus } from "../server/config.js";
import { emailReady, smsReady } from "../server/delivery.js";
import { twilioCredentialConfigurationIssues } from "../server/provider-configuration.js";
const status = serviceStatus();
console.log(
  `HireLens setup check (${config.production ? "production" : "development"})`,
);
for (const [label, present] of Object.entries({
  "Company verification adapter": status.companyVerification,
  "AI provider": status.ai,
  "Speech transcription": status.transcription,
  "Judge0 execution": status.code,
  "TURN relay": status.turn,
  "Redis scaling": status.multiServer,
}))
  console.log(`${present ? "Configured" : "Needs setup"}: ${label}`);
console.log(
  `TURN mode: ${config.turnProvider}${status.turnLocalDev ? " (same-computer test relay only)" : ""}`,
);
if (config.turnProvider === "twilio")
  for (const issue of twilioCredentialConfigurationIssues(config))
    console.log(`TURN setup: ${issue}`);
else if (config.turnProvider !== "hmac")
  console.log("TURN setup: TURN_PROVIDER must be hmac or twilio.");
console.log(
  "TURN configuration is not a live relay test. Use the interview's Connection checks, then test two devices on different networks.",
);
console.log(
  `Email transport: ${status.delivery.emailMode}${emailReady() ? "" : " (needs setup)"}`,
);
console.log(
  `SMS transport: ${status.delivery.smsMode}${smsReady() ? "" : " (needs setup)"}`,
);
console.log(
  "For redacted email/SMS/company setup details: npm run providers:check",
);
console.log(
  config.messagePreview
    ? "Local preview mode: messages are written to .data/messages; nothing is delivered externally."
    : "Message preview mode is off.",
);
for (const file of [
  ".data/ocr/eng.traineddata.gz",
  "public/vendor/mediapipe/blaze_face_short_range.tflite",
  "public/vendor/mediapipe/wasm/vision_wasm_internal.wasm",
]) {
  try {
    await access(file);
    console.log(`Available: ${file}`);
  } catch {
    console.log(`Missing: ${file} (run npm run setup:assets)`);
  }
}
try {
  await mongoose.connect(config.mongo, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.db!.admin().ping();
  console.log("Passed: database connection and ping");
} catch {
  console.log(
    "Failed: database connection (start npm run db:local or check MONGODB_URI)",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
try {
  const response = await fetch(
    `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}/api/health`,
    { signal: AbortSignal.timeout(5000) },
  );
  console.log(`API health: ${response.status}`);
  if (!response.ok) process.exitCode = 1;
} catch {
  console.log("API is not reachable. Run npm run dev.");
  process.exitCode = 1;
}
console.log(
  "Configuration presence is not a live provider test. See docs/SETUP-REMAINING.md for provider and two-person media checks.",
);
