import "dotenv/config";
// Validate an explicitly requested preview before connecting any normal services.
import "./private-preview.js";
import {
  parseStorageBudget,
  parseStorageScope,
} from "./storage-budget-configuration.js";
import "./cloud-test-companies.js";
import {
  providerConfiguration,
  twilioCredentialConfigurationIssues,
} from "./provider-configuration.js";
const objectEventSeconds = Number(process.env.OBJECT_EVENT_SECONDS);
export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "127.0.0.1",
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  mongo: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hirelens",
  storageBudgetBytes: parseStorageBudget(process.env.STORAGE_BUDGET_MB),
  storageBudgetScope: parseStorageScope(process.env.STORAGE_BUDGET_SCOPE),
  production: process.env.NODE_ENV === "production",
  sessionHours: Number(process.env.SESSION_HOURS || 24),
  verificationUrl: process.env.COMPANY_VERIFICATION_URL || "",
  verificationKey: process.env.COMPANY_VERIFICATION_API_KEY || "",
  verificationProvider: process.env.COMPANY_VERIFICATION_PROVIDER || "http",
  cashfreeEnvironment: process.env.CASHFREE_ENVIRONMENT || "sandbox",
  cashfreeClientId: process.env.CASHFREE_CLIENT_ID || "",
  cashfreeClientSecret: process.env.CASHFREE_CLIENT_SECRET || "",
  cashfreePublicKey: (process.env.CASHFREE_PUBLIC_KEY || "").replace(
    /\\n/g,
    "\n",
  ),
  localCompanyRegistration:
    process.env.ALLOW_LOCAL_COMPANY_REGISTRATION === "true",
  emailUrl: process.env.EMAIL_DELIVERY_URL || "",
  emailKey: process.env.EMAIL_DELIVERY_API_KEY || "",
  emailProvider: process.env.EMAIL_PROVIDER || "auto",
  brevoApiKey: process.env.BREVO_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "",
  messagePreview:
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_ENV !== "test" &&
    process.env.MESSAGE_PREVIEW === "true",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  smsUrl: process.env.SMS_DELIVERY_URL || "",
  smsKey: process.env.SMS_DELIVERY_API_KEY || "",
  smsProvider: process.env.SMS_PROVIDER || "http",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID || "",
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioFrom: process.env.TWILIO_FROM || "",
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
  emailVerificationRequired:
    process.env.NODE_ENV === "production" ||
    process.env.EMAIL_VERIFICATION_REQUIRED === "true",
  redisUrl: process.env.REDIS_URL || "",
  ocrPath: process.env.OCR_LANGUAGE_PATH || ".data/ocr",
  ocrEnabled: process.env.RESUME_OCR_ENABLED === "true",
  otpSecret: process.env.OTP_HASH_SECRET || "",
  companyOtpRequired:
    process.env.NODE_ENV === "production" ||
    process.env.COMPANY_LOGIN_OTP_REQUIRED !== "false",
  demoLogin:
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEMO_LOGIN === "true",
  llmUrl: process.env.LLM_BASE_URL || "",
  llmKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "",
  llmTimeout: Math.min(
    120000,
    Math.max(10000, Number(process.env.LLM_TIMEOUT_MS || 30000)),
  ),
  llmSchema: process.env.LLM_JSON_SCHEMA === "true",
  sttUrl: process.env.STT_BASE_URL || "",
  sttKey: process.env.STT_API_KEY || "",
  sttModel: process.env.STT_MODEL || "",
  judgeUrl: process.env.JUDGE0_URL || "",
  judgeKey: process.env.JUDGE0_API_KEY || "",
  judgeHeader: process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token",
  rapidHost: process.env.JUDGE0_RAPIDAPI_HOST || "",
  stunUrl: process.env.STUN_URL || "stun:stun.l.google.com:19302",
  turnUrl: process.env.TURN_URL || "",
  turnProvider: process.env.TURN_PROVIDER || "hmac",
  turnSecret: process.env.TURN_SECRET || "",
  turnLocalDev: process.env.TURN_LOCAL_DEV === "true",
  turnTtl: Number(process.env.TURN_TTL_SECONDS || 3600),
  faceThreshold: Math.max(3, Number(process.env.FACE_EVENT_SECONDS || 5)),
  objectThreshold: Math.min(
    30,
    Math.max(
      3,
      Math.trunc(Number.isFinite(objectEventSeconds) ? objectEventSeconds : 3),
    ),
  ),
  tabSwitchWarningThreshold: Math.min(
    20,
    Math.max(
      1,
      Math.trunc(Number(process.env.TAB_SWITCH_WARNING_THRESHOLD) || 3),
    ),
  ),
  faceModel: process.env.FACE_MODEL_URL || "",
  faceWasm: process.env.MEDIAPIPE_WASM_URL || "",
  faceLandmarkModel: process.env.FACE_LANDMARK_MODEL_URL || "",
  objectModel: process.env.OBJECT_MODEL_URL || "",
  objectAccuracyModel: process.env.OBJECT_ACCURACY_MODEL_URL || "",
};
export function publicJudge0Configured() {
  try {
    return ["ce.judge0.com", "extra-ce.judge0.com"].includes(
      new URL(config.judgeUrl).hostname.toLowerCase().replace(/\.$/, ""),
    );
  } catch {
    return false;
  }
}
export function codeExecutionConfigured() {
  if (!config.judgeUrl) return false;
  if (!publicJudge0Configured()) return true;
  if (config.production) return false;
  const loopback = (host: string) =>
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
  try {
    const origin = new URL(config.origin);
    return (
      new URL(config.judgeUrl).protocol === "https:" &&
      loopback(config.host) &&
      ["http:", "https:"].includes(origin.protocol) &&
      (loopback(origin.hostname) || origin.hostname.endsWith(".localhost"))
    );
  } catch {
    return false;
  }
}
// Local onboarding is an explicit development capability, never a verification result.
export function localCompanyRegistrationEnabled() {
  if (config.production || !config.localCompanyRegistration) return false;
  const loopback = (hostname: string) =>
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
  try {
    const origin = new URL(config.origin);
    return (
      loopback(config.host) &&
      ["http:", "https:"].includes(origin.protocol) &&
      (loopback(origin.hostname) || origin.hostname.endsWith(".localhost"))
    );
  } catch {
    return false;
  }
}
export const allowedOrigins = new Set([config.origin]);
if (!config.production) {
  const local = new URL(config.origin);
  if (["localhost", "127.0.0.1"].includes(local.hostname)) {
    local.hostname = local.hostname === "localhost" ? "127.0.0.1" : "localhost";
    allowedOrigins.add(local.origin);
  }
}
export const serviceStatus = () => {
  const providers = providerConfiguration(config);
  return {
    companyVerification: ["http", "cashfree"].includes(
      providers.companyVerification.mode,
    ),
    localCompanyRegistration: localCompanyRegistrationEnabled(),
    email: providers.otpReady,
    messagePreview: config.messagePreview && !config.production,
    sms: ["preview", "http", "twilio"].includes(providers.sms.mode),
    delivery: {
      emailMode: providers.email.mode,
      smsMode: providers.sms.mode,
      companyVerificationMode: providers.companyVerification.mode,
    },
    ocr: config.ocrEnabled,
    multiServer: !!config.redisUrl,
    companyOtp: config.companyOtpRequired,
    ai: !!(config.llmUrl && config.llmKey && config.llmModel),
    transcription: !!(config.sttUrl && config.sttKey && config.sttModel),
    code: codeExecutionConfigured(),
    codePublicDemo: publicJudge0Configured(),
    face: !!(config.faceModel && config.faceWasm),
    objects: !!(config.objectModel && config.faceWasm),
    turn:
      config.turnProvider === "twilio"
        ? twilioCredentialConfigurationIssues(config).length === 0
        : config.turnProvider === "hmac" &&
          !(config.production && config.turnLocalDev) &&
          !!(config.turnUrl && config.turnSecret),
    turnLocalDev: config.turnProvider === "hmac" && config.turnLocalDev,
    faceThresholdSeconds: config.faceThreshold,
    objectThresholdSeconds: config.objectThreshold,
    tabSwitchWarningThreshold: config.tabSwitchWarningThreshold,
    faceModelUrl: config.faceModel,
    mediapipeWasmUrl: config.faceWasm,
    faceLandmarkModelUrl: config.faceLandmarkModel,
    objectModelUrl: config.objectModel,
    objectAccuracyModelUrl: config.objectAccuracyModel,
  };
};
