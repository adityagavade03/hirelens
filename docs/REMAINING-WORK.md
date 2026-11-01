# Remaining work and activation order

Reviewed **1 November 2026**. The hosted application, Atlas database, Brevo email
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
  replay. New report safeguards require exact candidate quotations for weaknesses,
  separate clarity from technical correctness, and reject unsupported absence
  claims. The bounded follow-up preserved three rejected generations and one
  transport failure; the final schema passed one fresh strong-answer case.
  A separate final-schema stage passed sparse and transcript-only cases; a real
  concession-guard false rejection in the incorrect-answer case was corrected
  and its exact retained response passed offline replay. Fresh repeated cloud
  checks and broader independent reviews remain. No
  benchmark pass percentage is a hiring-accuracy or fairness percentage.
  [Current evidence](AI-QUALITY-VALIDATION.md).
- **UI:** both direct 7Heven/Amber previews were inspected on 31 October. The
  app adapts their direction; the requested amber accents differ from Amber's
  red-orange actions, and exact reproduction is not claimed. Finish complete
  route comparison, Firefox/Safari, physical mobile and screen-reader checks.
  Targeted Chromium and simulated UI tests do not replace that coverage.

## Reliability fixes verified on 1 November

The complete software check passed **1,055 tests in 72 files** and the production
build. These checks establish software behavior, not real-device accuracy or
provider activation.

- Face processing now discards results captured across a hidden page, admission
  change or camera change. Slower advancing cameras can accumulate a sustained
  observation without duplicate polls repeatedly resetting it. Gaze calibration
  requires fresh images after a hide/resize.
- One rejected queued ICE candidate no longer prevents the valid video offer's
  answer or discards other available network routes. This does not replace TURN.
- Background transcription preserves unsaved corrections and requires an explicit
  conflict choice. Failed spoken-answer startup releases microphone tracks;
  error audio and late results after a question/session change are discarded.
- Settings accurately distinguish local detection from separately consented,
  server-stored interview recordings and configured cloud AI processing.
- Phone verification stays disabled while SMS is missing or its configuration
  status cannot be checked, with a clear explanation instead of a failing send.

These checks need real devices, appropriate participants/reviewers or reference
access. Existing recruitment records and ordinary interview consent are not
training-data consent. Nothing is marked complete solely because an integration
or test harness exists.
