// Normal tests never invoke configured real services. Live checks are separate scripts.
for (const key of [
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "STT_BASE_URL",
  "STT_API_KEY",
  "STT_MODEL",
  "JUDGE0_URL",
  "COMPANY_VERIFICATION_URL",
  "EMAIL_DELIVERY_URL",
  "EMAIL_PROVIDER",
  "BREVO_API_KEY",
  "SMS_DELIVERY_URL",
  "SMS_PROVIDER",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "COMPANY_VERIFICATION_PROVIDER",
  "CASHFREE_CLIENT_ID",
  "CASHFREE_CLIENT_SECRET",
  "CASHFREE_PUBLIC_KEY",
  "CASHFREE_ENVIRONMENT",
  "SMTP_HOST",
  "REDIS_URL",
  "TURN_URL",
  "TURN_PROVIDER",
  "TURN_SECRET",
  "TURN_LOCAL_DEV",
  "DIARIZATION_URL",
  "DIARIZATION_API_KEY",
  "STORAGE_BUDGET_MB",
  "STORAGE_BUDGET_SCOPE",
])
  process.env[key] = "";
process.env.LLM_JSON_SCHEMA = "false";
process.env.LLM_TIMEOUT_MS = "30000";
process.env.ALLOW_LOCAL_COMPANY_REGISTRATION = "false";
// Cloud test access is opt-in per isolated test, never inherited from hosting.
delete process.env.CLOUD_TEST_COMPANY_IDS;
delete process.env.CLOUD_TEST_EXPIRES_AT;
