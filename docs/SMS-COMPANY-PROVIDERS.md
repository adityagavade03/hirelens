# Connect real SMS and Indian company verification

HireLens includes direct Twilio SMS and Cashfree CIN connectors. No middleware adapter is needed for these providers. Neither service is activated in this workspace: the user has no provider accounts yet. Existing Gmail email and company login OTP remain enabled; actual inbox receipt was confirmed on 13 October 2026.

## Twilio SMS

1. Create your own account through the [Twilio Console](https://console.twilio.com/). Obtain an Account SID and an API key SID/secret. Trial SMS can reach only verified recipients and has other account restrictions; review [Twilio trial limitations](https://help.twilio.com/hc/en-us/articles/360036052753-Twilio-Free-Trial-Limitations).
2. Configure an SMS-capable sender or a Messaging Service with an authorized sender. Enable the destination country for your account and confirm the account supports your use case. This project does not provision numbers or buy credit.
3. Put the following in the ignored **server** `.env`, not chat or `VITE_` variables. Replace placeholders privately.

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_API_KEY_SID=your-api-key-sid
TWILIO_API_KEY_SECRET=your-api-key-secret
TWILIO_FROM=your-authorized-international-number-or-sender
# Alternatively set this instead of TWILIO_FROM:
TWILIO_MESSAGING_SERVICE_SID=
```

API keys take precedence. An incomplete pair fails validation even if an Auth Token is also present. Outside production, `TWILIO_AUTH_TOKEN` may be used with the Account SID when both API-key variables are empty. Production requires an API key. [Twilio authentication and request format](https://www.twilio.com/docs/usage/requests-to-twilio).

The connector uses the fixed [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource) with form-encoded `To`, `Body` and `From` or `MessagingServiceSid`. It returns acceptance only after receiving the expected account, Message SID and an accepted/queued/sending/sent/delivered status. Redirects, oversized responses and raw provider error output are rejected. Carrier delivery receipts are not currently synchronized into HireLens.

For Indian recipients, Twilio distinguishes international routing (no DLT registration on that route; sender rewriting applies) from domestic routing (company and sender DLT registration required). Confirm the route your account can use before selecting a sender. [Twilio India SMS guidelines](https://www.twilio.com/en-us/guidelines/in/sms).

Run `npm run providers:check` and restart the API after environment changes. This check makes no SMS request. Keep `MESSAGE_PREVIEW=false` for actual delivery; setting it true would also revert the working Gmail channel to local previews. Before activating an outbox in an existing deployment, review any queued notifications.

Use **Settings → Account security & notifications** to verify a number you own, then opt in to recruitment updates. Phone verification uses a single-use SMS link, not a numeric SMS OTP. Use a public HTTPS `APP_ORIGIN` before opening those links on another phone; `localhost` points to the phone itself. Public deployment must first complete real verification of any local-development company accounts, because the localhost-only account exception is deliberately disabled for public origins.

Twilio does not implement HireLens's custom adapter idempotency contract. Timeouts, uncertain responses and expired in-flight notification claims are marked failed for review, without automatic retransmission. Explicit rate limiting can retry. Inspect the Twilio message log before manually resending an uncertain message; otherwise the recipient could receive duplicates.

## Cashfree CIN verification for India

This connector covers active Indian companies with a **21-character CIN**. It does not verify other countries, GSTIN, Udyam, sole proprietorships without a CIN or an arbitrary company name.

1. Create a Cashfree account and enable **Secure ID** with live CIN access. Obtain production client ID/client secret from its dashboard. Test keys alone cannot enable real company verification.
2. Configure one production authentication method: whitelist the server's outbound IPv4 address, or download Cashfree's RSA public key and use signature authentication. Public-key authentication suits a server without a fixed outbound IP. Follow the [Cashfree Secure ID setup guide](https://www.cashfree.com/docs/api-reference/vrs/getting-started) for account activation, keys and 2FA. Account approval, enabled products and any required balance are provider-controlled.
3. Configure the ignored server `.env` privately:

```dotenv
COMPANY_VERIFICATION_PROVIDER=cashfree
CASHFREE_ENVIRONMENT=production
CASHFREE_CLIENT_ID=your-live-client-id
CASHFREE_CLIENT_SECRET=your-live-client-secret
# Empty only when the server IPv4 is allowlisted in Cashfree:
CASHFREE_PUBLIC_KEY=
```

For public-key authentication, paste the downloaded **public** PEM value as a quoted multiline environment value or use literal `\n` between its lines. Never enter a private key. HireLens generates a fresh RSA-OAEP SHA-1 `x-cf-signature` for each request. This is Cashfree's documented algorithm.

Run `npm run providers:check` and restart the API. Configuration validation does not perform a billable registry lookup, validate account balance or prove Cashfree has enabled your account. `CASHFREE_ENVIRONMENT=sandbox` explicitly disables real verified signup and never issues verified receipts.

In **Company profile → Verify company**, enter the CIN, registered legal name and the official email recorded in the registry. The connector calls the live [Cashfree CIN endpoint](https://www.cashfree.com/docs/api-reference/vrs/v2/cin/verify-cin), requires `VALID` and `ACTIVE`, checks the returned request ID, CIN and country, and matches the registry email plus normalized legal name. Missing or mismatched data leaves the company unverified. Use the actual registry spelling; punctuation and letter case are normalized, but alternative company-name abbreviations are not guessed. The registry's legal name and provider reference become the existing verification receipt; directors' personal details are not stored.

Company login still verifies possession of the registered email through the existing password and emailed OTP. Entering someone else's CIN, a website address or a working email address does not establish authorization. A company whose registry email differs from its intended recruiting email needs its official record/contact process resolved before this connector can approve it.

## Verification completed in this implementation

Mocked tests cover native request contracts, credential selection, provider errors, ambiguous SMS recovery, sandbox isolation, active status, CIN/country/name/email binding and Cashfree signature encryption. No real SMS, company lookup, account creation, number purchase or paid subscription was performed. Live handset receipt and a genuine company verification remain the activation checks after the accounts are ready.
