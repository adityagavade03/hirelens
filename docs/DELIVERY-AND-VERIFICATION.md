# Real email, SMS and company verification

**Email receipt confirmed — 13 October 2026:** The user confirmed that the actual company sign-in code arrived in their inbox. Gmail SMTP delivery and receipt are now verified for that sign-in. The earlier 8 October activation passed SMTP authentication, disabled preview mode and restarted the API; eligible queued email/SMS notifications were both zero before activation. No sender address, credential or code is recorded here.

Native Twilio SMS and Cashfree Indian CIN connectors are implemented, but remain unconfigured until provider accounts and live access are supplied. [Follow the provider setup guide](SMS-COMPANY-PROVIDERS.md). Turning off the shared preview flag also disabled SMS previews. Existing company accounts remain unchanged and unverified until real business verification succeeds. Historical preview checks remain valid for their date and stage. No provider account or paid plan was created automatically.

## Check configuration without sending anything

```powershell
npm run providers:check
```

This prints only modes and names of missing/invalid settings, never secret values. Modes include `preview`, `smtp`, `http`, `brevo`, `twilio`, `cashfree`, `sandbox`, `unconfigured` and `invalid`. Public `/api/services` also includes the selected modes under `delivery`. A configured provider is not proof it works. Messaging and company-verification endpoints are not called by this check because a POST could send a message, incur a charge or create a record. Cashfree `sandbox` does not enable verified signup or pass the external-provider check.

To require all three external providers and OTP configuration in a deployment check:

```powershell
npm run providers:check -- --require-external
```

That command exits with code 1 if email, SMS or company verification is missing/invalid, preview mode remains active, or the OTP secret is too short. It still does not make external requests.

## Email and company login codes through Brevo HTTPS

The native Brevo adapter is implemented and tested with mocked responses. Its account, approved sender and real inbox delivery must still be configured and checked for each deployment. It uses HTTPS rather than SMTP, which is suitable for [Free Render's blocked SMTP ports](https://render.com/docs/free#outbound-port-traffic).

Create or use your own Brevo account, enable transactional sending, and [verify a sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email). Sender verification and domain authentication are separate: a free Gmail address cannot authenticate the Gmail domain. Review Brevo's sender warnings and verify actual inbox delivery. Keep the API key only in the hosting service's secret environment settings or a private server environment file:

```dotenv
EMAIL_PROVIDER=brevo
BREVO_API_KEY=your-private-brevo-api-key
EMAIL_FROM=HireLens <your-verified-sender@example.org>
MESSAGE_PREVIEW=false
```

The From address must match your approved sender; the sample above is a placeholder. `EMAIL_PROVIDER=brevo` chooses Brevo explicitly, so stale SMTP settings cannot silently take precedence. The key is not a Gmail App Password or Brevo SMTP key. Run `npm run providers:check` for a no-send configuration check, restart the application, then request a fresh sign-in code for an account you own. The returned message ID means accepted for processing, not delivered to an inbox. Check the transactional logs and the recipient's inbox/Spam folder.

The adapter follows [Brevo's transactional endpoint](https://developers.brevo.com/reference/send-transac-email): one structured sender/recipient, plain text, server-side `api-key` authentication, no redirects and a 15-second timeout. Errors never include provider response bodies or credentials. Durable recruitment updates map their outbox key to a stable UUID following the [idempotency guide](https://developers.brevo.com/docs/heterogenous-versions-batch-emails). Its documented window is only 30 minutes. Ambiguous sends, malformed acceptance and expired in-flight claims therefore stop automatic retries; check the Brevo log before retrying manually. Explicit HTTP 429 rate limits can retry with backoff. This avoids treating finite provider deduplication as a guarantee against all duplicate sends.

## Email and company login codes through SMTP

### Guided Gmail setup on this Windows computer

Use a Gmail account you own as the sender. Enable 2-Step Verification in that Google account, then create an App Password named HireLens at [Google App Passwords](https://myaccount.google.com/apppasswords). Some managed or protected accounts do not offer App Passwords; see [Google's eligibility instructions](https://support.google.com/accounts/answer/185833). Do not use your normal Google password or paste either password into chat.

From the project terminal, run:

```powershell
npm run email:setup:gmail
```

Enter the sender Gmail address and the hidden 16-letter App Password. The helper connects to `smtp.gmail.com:465` with certificate-validated TLS, checks authentication without sending mail, and saves credentials in the ignored local `.env` only after success. Existing settings and the company OTP secret are preserved. It does not change any account's login email. Previews remain enabled so setup cannot release queued notifications. After setup, review pending delivery state, disable `MESSAGE_PREVIEW` and restart the API to activate real email; then request a fresh OTP through normal company sign-in. Authentication success alone does not prove inbox delivery. Use the manual SMTP path below for other providers or Google Workspace custom-domain addresses.

### Manual SMTP configuration

Obtain SMTP credentials and an approved sender from your chosen email provider. Store them only in the server `.env`; do not use `VITE_` variables or paste credentials in chat.

```dotenv
EMAIL_FROM=HireLens <your-approved-sender@your-domain.example>
SMTP_HOST=your-provider-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-provider-smtp-user
SMTP_PASSWORD=your-provider-smtp-password
COMPANY_LOGIN_OTP_REQUIRED=true
OTP_HASH_SECRET=your-existing-random-secret-of-at-least-32-characters
```

Keep the existing strong OTP secret; replacing it invalidates pending company codes. Do not paste the placeholder above as a real secret. For providers using implicit TLS on port 465, set `SMTP_PORT=465` and `SMTP_SECURE=true`. Public SMTP hosts require TLS, including in development; only a loopback development relay can omit it. User and password must either both be present or both absent for a relay that explicitly allows unauthenticated access. Certificate validation remains enabled.

Before changing preview mode, check the SMTP connection and authentication without sending a message:

```powershell
npm run providers:check -- --smtp
```

This calls Nodemailer's `verify()` and closes the connection. It checks connectivity/TLS/authentication but cannot confirm an authorized From address, spam placement or inbox delivery. [Nodemailer SMTP documentation](https://nodemailer.com/smtp).

When ready for actual delivery, set `MESSAGE_PREVIEW=false` and restart the API (`npm run local:start` starts stopped services; restart an already-running API to reload changed environment settings). Then use **Forgot password**, **Settings → Account security & notifications → Send email verification**, or normal company sign-in with an account you own. Open the received link or enter the code in HireLens. Company sign-in still requires the password and the single-use code; there is no bypass or fixed OTP. No code is exposed by these checks.

An alternative email adapter uses `EMAIL_PROVIDER=http`, `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_API_KEY` and `EMAIL_FROM`. HireLens POSTs `{from,to,subject,text}` using Bearer authorization. Return `{ "accepted": true, "messageId": "actual-provider-id" }` only after provider acceptance. Errors and blank IDs fail closed. These are adapter contracts, not universal provider APIs. Existing installations with no `EMAIL_PROVIDER` keep `auto` selection: SMTP takes precedence when `SMTP_HOST` is set, otherwise the HTTP adapter is selected. Explicit `smtp`, `http` and `brevo` choices never silently fall back to another provider.

## SMS

Use the native **Twilio** connector with `SMS_PROVIDER=twilio` and the credentials/sender settings in [SMS-COMPANY-PROVIDERS.md](SMS-COMPANY-PROVIDERS.md). It calls Twilio directly; no separate adapter server is needed. API acceptance is not handset delivery.

Alternatively, keep the existing custom HTTP adapter with:

```dotenv
SMS_PROVIDER=http
SMS_DELIVERY_URL=https://your-adapter.example/sms
SMS_DELIVERY_API_KEY=your-adapter-secret
MESSAGE_PREVIEW=false
```

The adapter accepts `{ "to": "+country-code-and-number", "text": "message" }` with Bearer authorization and returns `{ "accepted": true, "messageId": "actual-provider-id" }` after acceptance. Recruitment notifications include an `Idempotency-Key`; the adapter must deduplicate retries using it. A provider's ordinary API URL is usable only if it matches this contract. The chosen provider determines country availability, sender registration and pricing.

In **Settings → Account security & notifications**, enter your own number in international format, request verification, open the received SMS link, then explicitly enable SMS recruitment updates. The profile's phone field alone does not prove ownership or opt in. Phone verification currently uses a single-use link; company login uses an emailed six-digit code. A public HTTPS `APP_ORIGIN` is needed for links opened on another device; localhost links point to that device itself. No real SMS was sent during this implementation or its automated tests.

## Real company verification

Email possession and a matching website do not establish legal business identity. The native **Cashfree CIN** connector supports active Indian companies with a CIN and registry email. Set `COMPANY_VERIFICATION_PROVIDER=cashfree` and follow [the live account setup](SMS-COMPANY-PROVIDERS.md). Only a live, matching registry result can create a verification receipt; sandbox data cannot. Other countries and registration types continue to use the existing `COMPANY_VERIFICATION_PROVIDER=http`, `COMPANY_VERIFICATION_URL` / `COMPANY_VERIFICATION_API_KEY` adapter contract. That adapter must verify identity and matching official contacts. See [the complete contract](COMPANY-ONBOARDING.md#verification-adapter).

Run the configuration check, then use **Company profile → Verify company** with the registered owner's actual company details. A verified result is accepted only from the configured service and must match those details. Negative, malformed and mismatched results remain unverified. Local development accounts keep their explicit unverified status until this succeeds. Do not implement an adapter that unconditionally returns `verified: true`.

## Delivery behavior and verification evidence

- Preview mode overrides SMTP, Brevo, HTTP messaging and Twilio SMS. Turning it off affects new sends; old preview files are not resent. Keep the already working email preview setting unchanged when configuring SMS.
- HTTP endpoints require HTTPS, with development-only loopback HTTP. URLs with embedded credentials or fragments are rejected, and redirects are disabled.
- SMTP/Brevo/HTTP/Twilio acceptance is recorded as `accepted`, never `delivered`. A successful send request is not proof of inbox or handset receipt.
- The notification worker uses atomic claims, verified contacts, explicit channel opt-in and up to five attempts with backoff. SMTP may duplicate a message if a process stops after provider acceptance but before saving the result. HTTP adapters can deduplicate with the supplied idempotency key.
- Twilio timeouts, malformed responses and expired in-flight sends stop automatic retry because an SMS may already have been sent. Check Twilio's message log before manually retrying. Explicit rate limits can retry; rejected requests stop. This prioritizes avoiding duplicate SMS over guaranteed delivery after an ambiguous failure.
- Automated tests cover provider modes, preview isolation from production, safe URL validation, TLS, no-send SMTP checks, secret-safe errors, acceptance validation, OTP/verification security and durable retries using mocked providers and isolated databases. They do not prove real provider delivery or registry accuracy.

Email delivery and the user's company OTP inbox receipt are confirmed. Native SMS/company connectors have mocked contract tests; their real account credentials, service activation and successful handset/registry results are still pending. Provider accounts, paid plans, assistant-initiated SMS sending and verification purchases have not been performed automatically.
