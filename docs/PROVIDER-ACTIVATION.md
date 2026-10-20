# Finish real provider setup

Reviewed 19 October 2026. The owner confirmed that provider accounts have not been created yet. HireLens has the integrations, but private hiring execution, public TURN, SMS delivery and real company verification cannot be activated without the corresponding server or approved accounts. Gmail email OTP is separate and has already been received successfully.

## Get the required services

| Feature                     | Account/server to prepare                                                | Information needed privately                                                                         |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Code execution for hiring   | A dedicated Judge0 execution host or authenticated hosted Judge0 service | Base URL, API key, authentication header; RapidAPI host only if applicable                           |
| Video on different networks | Twilio Network Traversal Service **or** your own public Coturn host      | Twilio Account SID and API key/secret, **or** public relay URLs and matching Coturn shared secret    |
| SMS                         | Twilio SMS with an authorized sender or Messaging Service                | Account SID, API key/secret and sender/Service SID; permission for the destination country           |
| Real company verification   | Cashfree Secure ID with production CIN access                            | Production client ID/secret, plus the downloaded RSA public key or server outbound IPv4 allowlisting |

These are the services already supported directly. A different provider requires checking its API contract first. Twilio SMS and TURN share the configured account and API key, so that key must have access to both when both are used. Account approval, sender registration, product eligibility and charges are handled by the provider. No account is purchased or registered by this project.

Official setup references: [Twilio API keys](https://www.twilio.com/docs/iam/api-keys), [Twilio TURN tokens](https://www.twilio.com/docs/stun-turn/api), [Cashfree Secure ID](https://www.cashfree.com/docs/api-reference/vrs/getting-started), [Judge0 API](https://ce.judge0.com/). The public Judge0 demonstration service is not a private hiring executor. See the existing [execution](CODE-EXECUTION.md), [TURN](TURN-SETUP.md), and [SMS/company](SMS-COMPANY-PROVIDERS.md) guides for deployment details.

## Enter settings privately

Once a provider account or server is ready, run in the project terminal:

```powershell
npm run providers:setup
```

Choose the service and enter its actual values. Secret fields are hidden; they are sent to the local validator through standard input, never command-line arguments. Cashfree can read a downloaded **public** PEM file; do not enter a private key.

The prompt validates field structure and writes a unique `.data/provider-setup/<service>-<id>.env` file. This directory is ignored by Git. It is a private plaintext configuration file, not encrypted storage; keep it on the API administrator's machine. The prompt does **not** read or overwrite the live `.env`, change Gmail or `MESSAGE_PREVIEW`, restart services, send SMS, request TURN tokens, submit code or perform company lookups. Repeated runs create separate files so a partial attempt cannot overwrite an earlier configuration.

The helper refuses public Judge0 demo endpoints, missing API credentials, malformed SIDs, insecure remote code URLs, local/private TURN addresses and invalid Cashfree public keys. Passing validation proves formatting only. A hostname still needs real DNS and reachability checks, and a provider can reject a correctly shaped credential.

## Activate deliberately after reviewing the configuration

1. Plan an API restart outside any active interview. Have the server administrator load only the staged service's variables into the deployment secret manager, or merge those assignments into the ignored local `.env`. Do not replace the whole file. Preserve the working Gmail, database, OTP hashing secret and authentication settings.
2. Before activating SMS, review queued notification delivery attempts. The current Gmail setup already uses `MESSAGE_PREVIEW=false`; enabling SMS then allows the notification worker to send eligible pending SMS when the API restarts. Do not toggle global preview mode just to test SMS, because that also changes Gmail behavior. Twilio provider acceptance does not prove handset receipt.
3. If Twilio credentials were previously used for the other service, check that the staged Account SID and key support both services. Do not combine staging files from different Twilio accounts or overwrite working TURN credentials with an SMS-only key.
4. Run `npm run providers:check -- --require-external` before restarting. This reads the environment and reports missing/invalid setup without printing secrets or calling providers. It requires actual provider configuration for email, SMS, company verification, private code execution and public TURN; local relays, public practice execution and Cashfree sandbox do not pass. A pass still says **configured, unverified**.
5. Restart the API once configuration and any pending notifications have been reviewed. Then complete the live checks below. This helper never marks an account verified, changes an application's status or enables real hiring based only on configuration presence.

## What counts as a completed live check

| Service              | Required evidence                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Judge0               | `npm run code:check` passes all 11 synthetic compilation/execution/error checks, followed by Run and Submit in an authorized test interview. The check sends sample source to the configured runner.                                                         |
| Public TURN          | Each device passes the room relay probe; two devices on different internet connections confirm both directions of audio/video, screen sharing and recovery after a short connection interruption. See [TURN checklist](TURN-SETUP.md#verify-two-networks).   |
| SMS                  | With the owner of a phone participating, request its verification from Settings, confirm actual receipt and open the link. Inspect the provider log for uncertain sends before retrying. The public HTTPS application origin must be reachable by the phone. |
| Company verification | An authorized company representative submits the real active Indian CIN, legal name and registry email and receives a successful production verification response. Sandbox fixtures do not count.                                                            |

Keep a dated record of the service mode, test outcome and observed limitation. Do not record API keys, phone verification tokens, private resume content or raw provider responses in committed test evidence. Camera/microphone, transcription and proctoring accuracy checks remain separate from provider activation.
