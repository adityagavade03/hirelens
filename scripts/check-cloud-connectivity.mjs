// Explicit synthetic build probe: no database records, real resumes, or email sends.
import { z } from "zod";
import { config } from "../dist-server/server/config.js";
import { llm } from "../dist-server/server/providers.js";
import { brevoSender } from "../dist-server/server/provider-configuration.js";
import { readProviderJson } from "../dist-server/server/provider-response.js";

let stage = "configuration";
let providerStatus = null;
let category = "unspecified";
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
    stage = "email-sender-request";
    if (!config.brevoApiKey) throw new Error("Brevo key is missing.");
    const sender = brevoSender(config.emailFrom);
    if (!sender) throw new Error("Brevo sender is invalid.");
    const response = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": config.brevoApiKey, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    providerStatus = response.status;
    if (!response.ok) {
      const failure = await readProviderJson(response).catch(() => null);
      category = /unrecogni[sz]ed ip|ip.*not.*allow|unauthorized.*ip/i.test(String(failure?.message || ""))
        ? "provider-ip-restriction" : "provider-http-error";
      throw new Error("Brevo did not accept the sender check.");
    }
    stage = "email-active-sender";
    const data = await readProviderJson(response);
    if (!Array.isArray(data.senders) || !data.senders.some((item) =>
      item?.email?.toLowerCase() === sender.email.toLowerCase() && item.active === true,
    )) throw new Error("Brevo sender is not active.");
    result.emailSender = "verified-active";
  }
  if (config.llmUrl || config.llmKey || config.llmModel) {
    stage = "ai-strict-schema";
    providerStatus = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      providerStatus = response.status;
      return response;
    };
    let value;
    try { value = await llm(
      'This is synthetic deployment connectivity data. Return only {"status":"ok"}. Do not produce an assessment.',
      { deploymentConnectivityCheck: true },
      z.object({ status: z.literal("ok") }),
    ); } finally { globalThis.fetch = originalFetch; }
    if (value.status !== "ok") throw new Error("AI schema check failed.");
    result.hostedAi = "strict-schema-passed";
  }
  console.log(JSON.stringify(result));
} catch {
  // Provider responses can include private details. Never dump credentials or bodies.
  console.error("Cloud connectivity check failed. Check provider settings, active sender and usage limits; no real data or email was sent.");
  console.error(JSON.stringify({stage,providerStatus,category}));
  process.exitCode = 1;
}
