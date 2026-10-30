# Remaining work and activation order

Reviewed **30 October 2026**. The hosted application, Atlas database, Brevo email
and Groq AI/transcription are configured. The existing Render Free cloud test
workspace was extended by the owner through **1 February 2027, 11:59 pm IST**.
Free hosting may sleep when idle.
The app's configuration is separate from proof that every integration works.

## External services

| Order | Service               | Preparation already present                                                                                         | Completion evidence needed                                                                                                                                                |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Private Judge0        | Authenticated dedicated-host/TLS configuration; five languages; sample/custom/all-case adapter; hidden-case privacy | Working owner-controlled endpoint and private credentials, eleven real diagnostic outcomes, then correct/incorrect Run/Submit tests. [Setup](PRIVATE-EXECUTION-SETUP.md). |
| 2     | Public TURN           | HMAC and Twilio relay adapters; local relay checks                                                                  | Public relay credentials and two actual devices on different networks with confirmed two-way media, sharing and reconnects. [Setup](TURN-SETUP.md).                       |
| 3     | SMS                   | Twilio/HTTP adapters, outbox and contact verification                                                               | Account/sender activation and an explicitly authorized successful handset delivery. [Setup](SMS-COMPANY-PROVIDERS.md).                                                    |
| 4     | Business verification | Cashfree/HTTP adapters and matching receipt checks                                                                  | Live provider account and eligible genuine business identity. Local test access does not verify a business. [Setup](SMS-COMPANY-PROVIDERS.md).                            |

The owner currently has no accounts/server for these four services and selected
private execution. No public Judge0 fallback, paid plan, invented endpoint or
provider credential is enabled to bypass the missing setup. Store actual keys in
private provider/Render configuration, never in chat or Git.

`npm run providers:check -- --require-external` reports setup gaps without sending
messages or changing accounts. It must fail while external requirements are
missing. A configured endpoint still needs its corresponding live check.

## Device and quality work

- **Recordings and transcription:** fresh separately consented Candidate and HR
  microphone capture, saved playback and word-level human review. The earlier
  Candidate clip was audible, but physical transcription failed; HR microphone
  capture was not verified. Generated two-track tests check software plumbing.
- **Face/object/gaze/speaker:** run controlled tests with independently observed
  ground truth on representative devices. The physical gaze accuracy gate failed,
  earlier phone/book checks failed or were inconclusive, and a known speaker
  example over-segmented. Do not lower thresholds or mark these passed using
  synthetic tests. [Protocol](PROCTORING-DEVICE-VALIDATION.md).
- **Trained integrity model:** obtain separate research consent and independently
  reviewed data before training. The existing protocol requires at least 100
  interviews and 20 participants, but those minimums do not establish sufficient
  accuracy. Current operational scoring remains rule-based. [Protocol](INTEGRITY-RESEARCH-PROTOCOL.md).
- **AI quality:** the 30-case current-provider synthetic run is complete, with
  original outcome-expectation failures preserved and a separate offline policy
  replay. Three qualitative report-narrative concerns and broader independent reviews remain. No
  benchmark pass percentage is a hiring-accuracy or fairness percentage.
  [Current evidence](AI-QUALITY-VALIDATION.md).
- **UI:** compare accessible exact 7Heven/Amber previews, finish Firefox/Safari,
  physical mobile and screen-reader checks. Targeted Chromium and simulated UI
  tests do not replace that coverage.

These checks need real devices, appropriate participants/reviewers or reference
access. Existing recruitment records and ordinary interview consent are not
training-data consent. Nothing is marked complete solely because an integration
or test harness exists.
