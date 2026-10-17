# Local testing and service setup

**Provider update — 13 October 2026:** A real company sign-in OTP was sent with permission through Gmail, and the user confirmed receipt. Native Twilio SMS and TURN connections and Cashfree Indian CIN verification are implemented; their live activation still needs provider accounts and credentials. Public Judge0 passed all 11 synthetic diagnostic programs, but no public endpoint has been enabled for real hiring. See [PROVIDER-CONNECTION-VERIFICATION.json](PROVIDER-CONNECTION-VERIFICATION.json), [SMS-COMPANY-PROVIDERS.md](SMS-COMPANY-PROVIDERS.md), and [CODE-EXECUTION.md](CODE-EXECUTION.md). Dated entries below describe their original verification stage.

**Latest interview upgrade — 8 October:** [INTERVIEW-UPGRADE-VERIFICATION.json](INTERVIEW-UPGRADE-VERIFICATION.json) supersedes the earlier room baseline below. C/C++ UI support, same-computer camera/window sharing and reconnect recovery, a local TURN data relay, synthetic playable-media/Whisper processing, optional speaker clustering and experimental gaze calibration have been added or checked. See [TURN-SETUP.md](TURN-SETUP.md), [MEDIA-VERIFICATION.md](MEDIA-VERIFICATION.md), and [ADVANCED-PROCTORING.md](ADVANCED-PROCTORING.md). Public/cross-network media, physical recordings, real delivery/registry services, actual Judge0 execution and a genuinely trained custom integrity model remain subject to the documented dependencies.

Email/SMS and real business verification setup have a focused guide: [DELIVERY-AND-VERIFICATION.md](DELIVERY-AND-VERIFICATION.md). Run `npm run providers:check` for redacted configuration modes and missing settings, or add `-- --smtp` for a no-send SMTP connection/authentication check. This workspace now has Gmail delivery enabled and preview mode disabled; SMS still requires its own provider setup.

**8 October interview-room update:** Human interviews use the meeting workspace at `/room/:id`. Current checks and limitations are in [REMAINING-PARTS-VERIFICATION.json](REMAINING-PARTS-VERIFICATION.json). Face presence is off by default and now has a separate optional consent control under the camera preview and in Devices. It processes frames locally in a worker, first requires three one-face frames, and records only sustained observations after admission. Withdrawal stops processing immediately on that device; the server records consent intervals. Refreshing the room requires opting in again. Actual face-detection accuracy still needs a physical-camera test.

To try the room, use separate Candidate and assigned HR browser profiles and open the same interview from **Interviews → Open room**. The candidate checks selected devices, selects or uploads a PDF, accepts monitoring and enters the waiting room. HR opens the room and selects **Admit candidate**. The candidate then uses **Share screen** and **Resume → Share Resume with Interviewer**. HR uses **Coding → Send a coding question**; candidate code updates appear in HR's read-only editor. Run/Submit stay unavailable until a real Judge0 service is configured and its language list succeeds. HR can request screen sharing, send instructions, review activity and private notes, then choose **End / leave → End for everyone**. Leaving alone keeps the meeting open.

Use `npm run local:start` to restart local services. The persistent MongoDB launcher now stays alive, and startup waits for the API and website ports. Database ping and API health pass. An initial speech startup hit Windows Application Control, but a normal restart succeeded; fresh synthetic transcription and local AI checks passed without changing security policy. Browser access is restored: room flow, shared PDF, Java draft synchronization, direct transport without physical media, and responsive light/dark layouts were verified using isolated data. A subsequent interviewer microphone check showed ready status and changing input levels. Camera capture, screen capture, remote playback and cross-network media remain unverified. No demo accounts were added to your database.

Device requests show a waiting message, can be cancelled, and time out after 30 seconds if the browser does not respond. A late permission grant is discarded and its tracks stopped. If the in-app browser leaves the request unresolved, open the normal app in a supported desktop browser, check site camera/microphone permissions, and use **Check selected devices** again. A browser capability label is not proof that physical capture succeeded.

Use **Connection** in the live room (or **Connection checks** during setup) for browser capabilities, selected ICE route, round-trip time, and actual media-byte counters. **Test relay connection** creates two temporary peers forced through TURN, exchanges a small data message, and closes them. A successful check proves only relay data connectivity on that device; it does not prove that another participant can see or hear you. **Check code service** checks the execution API language list, not the worker; use `npm run code:check` for execution validation. Temporary draft-save failures now retry automatically while the room stays open.

**5 October update:** local AI and English speech are now installed and connected. Recording, reviewed transcripts, code similarity, calendar conflict guards and batch recovery are implemented. Follow [LOCAL-AI.md](LOCAL-AI.md) for current restart instructions and remaining limits; older setup examples below remain relevant for external providers.

The local features reuse HireLens's existing roles, screens, database and recruitment workflow. The company manages recruitment; accepted and assigned HR conducts human interviews. The company or assigned HR can finalize hiring feedback and decisions.

## What you can test now

1. Open **http://localhost:5173** and register your own account. The local sample workspace was removed on 5 October 2026; demo sign-in is disabled. **Company → Sign up → Continue with local setup** now permits an unverified development company without a provider. `ALLOW_LOCAL_COMPANY_REGISTRATION=true` is explicitly enabled here and only works on localhost outside production. Real company verification still requires the adapter. See [COMPANY-ONBOARDING.md](COMPANY-ONBOARDING.md).
2. **Forgot password / Resend verification** are on each sign-in page. HR and candidate email verification is available in **Profile → Account security & notifications**. Verification is mandatory on production login; local development permits unverified login for testing.
3. This workspace uses `MESSAGE_PREVIEW=false` and Gmail SMTP. Company sign-in codes arrive in the account's inbox; actual receipt was confirmed on 13 October. SMS remains unavailable until its provider is configured. A fresh checkout's `.env.example` defaults to previews: with `MESSAGE_PREVIEW=true`, messages stay in private **`.data/messages`** JSON files instead of being delivered. Never share these temporary links/codes. Preview mode is forcibly disabled in production. A received email does not verify a legal company; local companies remain explicitly unverified.
4. Verify your email or SMS number, then explicitly enable recruitment notifications in **Profile**. Every new in-app notification is also considered by a durable delivery worker. Unverified or opted-out channels are skipped. Old notifications are not resent. The worker runs every 10 seconds and retries provider failures up to five times with backoff. A provider's acceptance does not prove inbox/handset delivery. SMTP can deliver a duplicate if the process crashes after acceptance; HTTP adapters receive an `Idempotency-Key` for provider-side deduplication.
5. **Settings → Manage coding questions** is available to company members and HR. Write the statement, examples, starter code and public/hidden tests. HR can select the question while scheduling. The interview stores an immutable question/test copy. Editing the library does not change scheduled interviews. Only built-in questions appear in personal practice. Actual execution still requires Judge0.
6. Define rounds in the existing job editor. In **Applications → Review → Interview rounds**, assigned HR schedules the first round. End it and finalize its report as **Advance to next round**. HR can then schedule the next round. Each round has its own time, room, answers, submissions and report. A hold/rejection blocks advancement; the final successful round marks the application Selected. Earlier reports lock once a later round begins. Cancelled rounds can be rescheduled. The same accepted, assigned HR owns the process; concurrent panel interviews and per-round HR reassignment are not added.
7. Scanned resumes use **local English OCR**. Upload a clear PDF of at most 5 MB; scanned documents are limited to 8 pages, text PDFs to 30. Text extraction runs first, then pages with little text are rendered and read locally. No resume is sent to an OCR provider. OCR can misread text; inspect application evidence and correct the source PDF if needed. Text plus a large scanned image on the same page can still need a cleaner export.
8. **Settings → Audit log & retention** is company-only. The audit log records authenticated mutation route, actor, resource ID, timestamp and HTTP status; it excludes request bodies and secrets. It is a database activity log, not a tamper-proof compliance ledger. Recording is best effort after HTTP completion. Retention first previews counts and creates a five-minute, single-use confirmation. Cleanup removes old completed/finalized interviews' monitoring events, coding submissions, private notes and code drafts, and old company audit records. It retains resumes, applications, questions, answers, feedback and hiring decisions. No automatic deletion policy is enabled. Back up before using it; larger/full account erasure requests require an explicit data migration.

## Starting a fresh local checkout

```powershell
npm ci
# Copy .env.example to .env only if .env does not already exist.
npm run setup:assets
npm run db:local
# In another terminal:
npm run dev
# In another terminal:
npm run doctor
```

Keep `ALLOW_DEMO_LOGIN=false` to start without sample data. Seeding is optional and requires explicitly enabling demo mode in a separate demonstration database. Generate an OTP secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and save it in `.env`. Do not paste secrets into chat or commit them. The present local workspace already has a generated OTP secret and assets installed.

`setup:assets` downloads a pinned Google BlazeFace model and English Tesseract language file and copies the installed MediaPipe WASM files. Set:

```dotenv
MESSAGE_PREVIEW=true
RESUME_OCR_ENABLED=true
OCR_LANGUAGE_PATH=.data/ocr
FACE_MODEL_URL=/vendor/mediapipe/blaze_face_short_range.tflite
MEDIAPIPE_WASM_URL=/vendor/mediapipe/wasm
```

Restart the API after changing `.env`. The development watcher ignores generated model and database files to avoid Windows/OneDrive file-lock crashes. Generated assets are ignored by Git and installed explicitly; the Docker build runs asset setup before compiling.

## Connecting real services later

| Feature | Configuration | Proof that it works |
| --- | --- | --- |
| Company identity | `COMPANY_VERIFICATION_PROVIDER=cashfree` with live `CASHFREE_*` settings, or the generic HTTP adapter | Submit a real eligible company and verify matched legal identity. Cashfree currently supports active Indian companies with a CIN and matching registry name/email. |
| Email | Turn preview off, set `EMAIL_FROM` plus SMTP host/port/user/password, or the existing email HTTP adapter URL/key | Receive a password-reset email and a company sign-in OTP in an actual inbox; check expiry and replay rejection. |
| SMS | `SMS_PROVIDER=twilio` with `TWILIO_*` credentials/sender, or the generic HTTP adapter; preview must be off | Receive the phone-verification link on the device, opt in, then receive a recruitment notification. |
| AI questions/feedback | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Generate questions, assess a technical answer and check its saved rubric-based feedback. |
| Speech | `STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL` | Record with explicit microphone permission, transcribe and review the transcript before submission. |
| Code execution | `JUDGE0_URL`, optional API key/header/RapidAPI host | Run Python, JavaScript, Java, C and C++, including accepted, wrong-answer, compilation-error and timeout cases. Public demo validation does not establish a private hiring service. |
| WebRTC relay | `TURN_PROVIDER=twilio` with `TWILIO_*` credentials, or public Coturn with `TURN_URL` and `TURN_SECRET` | Two independent devices on different networks must exchange camera and microphone media through a relay candidate. |
| Face detection | Local model and WASM paths above | With consent and camera permission, test sustained no-face and multiple-face events; brief transitions should not be flagged. |

The email and SMS HTTP adapters use HTTPS in production, accept JSON and return `{ "accepted": true, "messageId": "provider-id" }`. Email input is `{from,to,subject,text}`; SMS input is `{to,text}`. Both use `Authorization: Bearer <key>`. The adapter must apply the `Idempotency-Key` header for retry-safe recruitment notifications. They are contracts for your chosen provider, not universal third-party API endpoints. SMTP offers a direct email connection without an adapter. Production SMTP requires TLS and validates certificates.

Judge0 must run on a separate, secured execution host or a hosted service. Do not execute submitted code in the application process. The existing client disables network access and requests CPU, wall-time and memory limits; verify these limits on the execution service. Self-hosting Judge0 and coturn does not require a commercial account but still requires a properly isolated Linux host and infrastructure configuration.

No live company registry, email/SMS, AI, speech, Judge0 or TURN service was used in the automated regression tests. Separate local AI/speech checks passed on 8 October; see `.data/runtime/remaining-parts-ai-check.log` and LOCAL-AI.md. Test fixtures validate contracts and permissions; they are not real provider results. There is no automatic hiring decision from AI or monitoring.

## Multiple servers

Set the same private authenticated `REDIS_URL` on every API instance. Startup connects Redis before accepting traffic. Rate limits use shared Redis counters; Socket.IO uses the Redis Streams adapter. Browser sessions, interview authorization, notifications, round state and workflow locks stay in MongoDB. Authentication tokens remain in a local server closure and are not copied into shared Socket.IO metadata. Do not expose Redis or MongoDB publicly; use TLS URLs across hosts.

Keep sticky sessions at the reverse proxy for Socket.IO HTTP polling. For two explicit server addresses, Caddy supports:

```caddy
interviews.example.com {
  reverse_proxy 127.0.0.1:4000 127.0.0.1:4001 {
    lb_policy cookie hirelens_node REPLACE_WITH_A_RANDOM_SECRET
  }
}
```

Use the same `APP_ORIGIN` and database on both instances. Verify two signed-in participants attached to different instances, process restart/reconnect, session revocation, and shared rate limits before production. Redis multi-server integration is implemented but a live Redis cluster/load-balancer test has not been performed in this workspace. A process-local OCR concurrency limit permits one OCR job per API instance; size the deployment accordingly.

## Hosting and HTTPS

The separate `compose.production.yaml` template creates authenticated private MongoDB, password-protected private Redis, the application and Caddy TLS proxy. It uses separate production volumes and does not reuse the development database. Copy `.env.production.example` to `.env.production`, fill in a real domain and independent random hex database/Redis/OTP secrets, and configure real email/company-verification services. DNS must point to your server and ports 80/443 must be reachable.

```powershell
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

The app database user has `readWrite` only on HireLens. Initialization scripts run only for a fresh volume; changing the password environment variable does not rotate an existing MongoDB user. Rotate credentials through MongoDB explicitly. Never use `down -v` to update a deployment. Establish encrypted database backups and test restoring a backup before retention cleanup. Use server resource limits, log monitoring and an access policy appropriate to the real deployment.

Docker Desktop/daemon was unavailable here, so the production image and HTTPS deployment remain unexecuted. No hosting account, domain or public URL has been created. See `TESTING.md` for the checks actually run.

## Primary implementation references

- [Nodemailer SMTP transport](https://nodemailer.com/smtp)
- [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [Google MediaPipe Face Detector model](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector)
- [Socket.IO Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/)
- [Redis rate-limit store](https://github.com/express-rate-limit/rate-limit-redis)

- [Caddy reverse proxy and sticky cookies](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Official MongoDB container initialization](https://hub.docker.com/_/mongo)
