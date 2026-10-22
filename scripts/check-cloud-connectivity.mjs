// Explicit synthetic build probe: no database records, real resumes, or email sends.
import { z } from "zod";
import { config } from "../dist-server/server/config.js";
import { llm } from "../dist-server/server/providers.js";
import { brevoSender } from "../dist-server/server/provider-configuration.js";
import { readProviderJson } from "../dist-server/server/provider-response.js";

try {
  if (process.env.NODE_ENV !== "production" || !process.argv.includes("--synthetic"))
    throw new Error("Use production configuration and --synthetic explicitly.");
  const result = {
    check: "cloud-connectivity",
    fromRender: !!process.env.RENDER_SERVICE_ID,
    emailSender: "unconfigured",
    hostedAi: "unconfigured",
    realDataSent: false,
    emailsSent: 0,
  };
  if (config.emailProvider === "brevo") {
    if (!config.brevoApiKey) throw new Error("Brevo key is missing.");
    const sender = brevoSender(config.emailFrom);
    if (!sender) throw new Error("Brevo sender is invalid.");
    const response = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": config.brevoApiKey, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Brevo did not accept the sender check.");
    const data = await readProviderJson(response);
    if (!Array.isArray(data.senders) || !data.senders.some((item) =>
      item?.email?.toLowerCase() === sender.email.toLowerCase() && item.active === true,
    )) throw new Error("Brevo sender is not active.");
    result.emailSender = "verified-active";
  }
  if (config.llmUrl || config.llmKey || config.llmModel) {
    const value = await llm(
      'This is synthetic deployment connectivity data. Return only {"status":"ok"}. Do not produce an assessment.',
      { deploymentConnectivityCheck: true },
      z.object({ status: z.literal("ok") }),
    );
    if (value.status !== "ok") throw new Error("AI schema check failed.");
    result.hostedAi = "strict-schema-passed";
  }
  console.log(JSON.stringify(result));
} catch {
  // Provider responses can include private details. Never dump credentials or bodies.
  console.error("Cloud connectivity check failed. Check provider settings, active sender and usage limits; no real data or email was sent.");
  process.exitCode = 1;
}
