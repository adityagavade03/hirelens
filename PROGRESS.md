# HireLens progress

## Provider connections — 13 October 2026

One authorized company-login OTP was sent through Gmail and the user confirmed receipt. Added direct Twilio SMS and public TURN integrations, Cashfree Indian CIN verification, bounded provider responses and sanitized errors. Native provider behavior is checked with fixtures; the user has not created the required external accounts. Existing Gmail settings, accounts and local TURN remain unchanged.

The official public Judge0 service passed all 11 synthetic diagnostics across Java, Python, JavaScript, C and C++. Public code retention and availability limits are documented; real hiring still needs a suitable execution service. No paid signup, SMS, live registry query, public deployment or destructive Docker repair was performed. Current evidence: [PROVIDER-CONNECTION-VERIFICATION.json](docs/PROVIDER-CONNECTION-VERIFICATION.json). Account/setup instructions: [SMS-COMPANY-PROVIDERS.md](docs/SMS-COMPANY-PROVIDERS.md) and [TURN-SETUP.md](docs/TURN-SETUP.md).

Earlier sections are historical and do not describe today's provider configuration or account data.

## Finalization and live-code fixes — 5 October 2026

Final `npm run check` passed TypeScript, client/server builds and **78 tests in seven suites**, including 14 new regression tests. A full-suite failure during development caught input validation occurring before the notes permission check; that ordering was corrected and the final suite passed. The large Monaco bundle warning remains.

`tests/finalization.test.ts` covers immutable finalized feedback/notes, completed draft review, late code results after end/finalization, normal live code success, report lease conflicts, delayed manual/adaptive AI feedback, stale/finalized report-generation results, case-normalized lock IDs, idempotent old-round completion, serialized latest drafts and unrelated-HR denial. All provider responses here are synthetic and all databases temporary.

A separate local preview at `hirelens-review.localhost:5174` used its own temporary MongoDB and login cookie hostname. Its assigned HR opened the actual Monaco editor. The candidate's draft was changed through the real test API; the HR editor displayed the new code without reloading. No camera/microphone permission was requested. The test preview and its database were stopped. Screenshot: `.data/runtime/live-editor-verified.jpg`. The normal website renders, API reports ready, demo login is disabled and the normal database still has zero records.

These fixes supersede the defect status in the earlier audit below. Company verification, Judge0, external delivery, TURN/hosting and the previously listed advanced-feature/device-test gaps remain unchanged.


## Demo data removal — 5 October 2026

At the user's request, the inspected local demo workspace was removed: 8 sample accounts, 1 fictional company, 6 jobs, 6 resumes, 6 applications, 5 interviews, 2 reports, 11 notifications, 1 code revision, 2 sessions and 67 linked audit events (115 records total). No non-demo accounts existed. The API was paused during removal. A BSON-preserving recovery backup was verified before deletion and saved under the ignored `.data/backups` directory; the cleanup receipt is `.data/runtime/demo-cleanup-receipt.json`.

After restarting the API, all database collections had zero documents, the homepage and three role-entry pages returned HTTP 200, `/api/auth/options` returned `demo=false`, and all three former demo credentials returned HTTP 401. The seed command was checked with demo mode disabled and an unreachable test URI: it refused before connecting. Local `.env` and `.env.example` disable demo mode; startup instructions no longer seed records. Earlier sample-account checks below are historical and do not describe the current empty database. Test fixtures and built-in interview exercises remain part of the application and do not populate the user database.

## Remaining local work implemented — 5 October

Added consented per-participant recording and authenticated segmented playback; local background speech transcription and reviewed transcript evidence; company-scoped normalized code similarity; local face-landmark head-turn metadata; shared calendar conflict guards; persisted batch rollback/recovery and notification repair; and deferred Monaco loading until the coding tab is opened. Recordings and transcript text participate in authorized retention cleanup. Practice access now explicitly excludes company/HR accounts without a hiring company, including detached company accounts.

Installed and connected project-local Ollama 0.35.1 with Qwen 2.5 3B, and faster-whisper 1.2.1 with the English base model. Real synthetic audio, AI questions and answer feedback checks passed. Browser verification created the clearly named **Local AI verification — Java practice** sample, submitted two synthetic technical answers, generated adaptive questions, and saved an evidence-referenced assessment. Invalid references were initially rejected; the provider schema now permits only existing references and requires at least one reference for scored metrics. Unverifiable answer quotations are omitted; repeated AI question wording is rejected after one regeneration attempt.

`npm run local:start` restarts the persistent database, API, website, and installed local model services. Current setup and remaining external/hardware limits are documented in [LOCAL-AI.md](docs/LOCAL-AI.md) and [PROJECT-STATUS.md](docs/PROJECT-STATUS.md). Judge0 is still blocked by Docker Desktop's `dockerInference` startup failure; no factory reset or WSL kernel change was performed. No email/SMS, cloud account, public deployment or external verification was fabricated.

The sections below are historical records.

## Current requirements correction

The latest HireLens description supersedes the older company-shortlisting workflow recorded below. HR requests no longer require a shortlist. After accepting a job, HR can see its applicants/resumes, shortlist and schedule directly. Company distribution is optional; company and assigned HR can make final report decisions. Added preferred roles, structured experience, job difficulty, criterion-level resume matching, private batch scheduling, adaptive AI interview mode, evidence-referenced AI reports, separate integrity review rules, coding snapshots and performance history. Provider and hardware dependencies remain explicitly unverified. See [current project status](docs/PROJECT-STATUS.md) for the current flow and precise limits. Earlier sections are historical implementation records, not a claim that the full vision is operational.

Verification: final `npm run check` passed the client/server production build, typecheck and 53 tests. Local homepage, API health, all three demo logins, applications, performance history and service-status checks passed. No live provider results were fabricated; no deployment, cloud migration or development-data reset was performed. The existing Monaco bundle-size warning remains. Detailed evidence is in `docs/TESTING.md`.

Implemented from an empty workspace. User confirmed **both company hiring and personal mock-interview practice**.

## Company increment completed on 2 October 2026

- Professional three-role entry, named sign-in/sign-up flows, and separate protected dashboard routes.
- Official company information, backend verification receipts and duplicate checks, secure username/email sign-in, email OTP adapter, expiry/attempt/send limits and replay prevention.
- Dedicated company overview with database aggregates, verified profile editing, PNG/JPEG logo upload and company identity re-verification.
- Full job requirements, draft/publish/unpublish/close, salary/deadline validation, per-job applications and interview progress.
- Company HR directory with actual workload, self-declared availability, assignment acceptance/decline, and persistent in-app notifications. Existing application stages and interview participants are preserved.
- New providers are deliberately unconfigured locally. Real company registration/OTP requires the adapters described in `docs/COMPANY-ONBOARDING.md`; no fake verification or frontend OTP. Development sample accounts remain usable and are not labeled verified.

## Implemented and verified locally

- [x] React/TypeScript/Vite/Tailwind frontend and Express/TypeScript API.
- [x] Real MongoDB/Mongoose persistence, indexes, persistent development database helper, and sample seed.
- [x] Candidate, company and HR registration/login, bcrypt passwords, opaque hashed cookie sessions, logout, expiry, role permissions, tenant/job isolation and origin checks.
- [x] Profiles, immutable PDF resume revisions, text extraction/error handling, company profiles and HR invitations.
- [x] Jobs, assignment, search, application snapshots, duplicate prevention, transparent skill-coverage evidence and controlled stages.
- [x] Scheduling, rescheduling/cancellation endpoints, explicit timezone UI, UTC conversion and daylight-saving validation, in-app notifications.
- [x] Authorized Socket.IO signaling and reconnect tests; interview preflight/room interface and private interviewer notes.
- [x] Personal mock interviews, question templates, typed answer submission, local Monaco editor, language switching and code drafts.
- [x] Server integration adapters for AI, speech and Judge0; structured validation, limits, error states, and hidden-result redaction. Provider behavior verified with explicit contract fixtures only.
- [x] Consent-gated browser monitoring metadata; monitoring persistence and permissions verified at the API layer.
- [x] Reports, human decision/explanation, feedback release controls and PDF output.
- [x] README, environment example, API documentation, architecture, deployment examples, demonstration script and student module explanations.

## Implemented but awaiting configuration / hardware verification

- [ ] Live AI generation and assessment with valid provider credentials.
- [ ] Actual Judge0 execution for Java, Python and JavaScript.
- [ ] Physical microphone capture plus live speech transcription.
- [ ] Two independent camera/audio sessions and cross-network WebRTC/TURN test.
- [ ] Verify sustained face-count events with a camera. Official model/WASM assets are now installed locally.
- [ ] Docker Compose build/run and real HTTPS/TURN deployment. Docker Desktop was not running during implementation.

## Verification

43 automated tests across company onboarding/OTP/assignment, workflow/security/provider-contract, remaining-feature and timezone suites passed. Typecheck and production build passed. Dependency audit reported zero known vulnerabilities after pinning the patched sanitizer. Final regression rerun is recorded in `docs/TESTING.md`.

Browser checks covered company and candidate login/dashboards, practice creation, submitted-answer persistence, Monaco editing, explicit missing-provider errors, report-list completion and responsive navigation. A clearly labeled `UI verification — sample practice` record was created in the sample candidate account. No AI feedback or code execution result was fabricated.

## Known incomplete extras / limits

Password recovery, HR/candidate email verification, verified SMS opt-in, durable notification delivery, English scanned-resume OCR, coding-question authoring, independent interview rounds, company audit logs, manual retention cleanup and Redis adapters are implemented. Live external services, physical media checks, Docker/HTTPS hosting and a live Redis multi-server test remain pending. Local messages are previews, not delivery. Retention currently covers monitoring, code submissions/drafts, private notes and old audit events; application/resume and hiring-feedback retention is unchanged. Browser metadata is not tamper-proof; offline events can be lost if the page closes. The room includes a sizeable lazily loaded Monaco bundle. See `docs/TESTING.md` for precise limitations.

## Remaining features completed — local scope

Added password recovery with single-use links and session/OTP revocation; HR/candidate email verification; verified SMS opt-in; SMTP/HTTP email and SMS adapters with clearly labeled local previews; durable notification claims/retries; actual English scanned-PDF OCR; company coding-question authoring and immutable interview test snapshots; separate sequential interview rounds and reports; company audit views and preview/confirm retention cleanup; optional Redis Streams signaling/shared rate limits; model download and environment health-check commands; and a separate authenticated production database/Redis/HTTPS Compose template.

The final production build, typecheck and all 43 tests passed. Local homepage/company-login/API/asset checks passed, sample company sign-in succeeded, and private preview-file access was denied. MediaPipe assets are installed. Production Docker execution, live Redis scaling, external accounts/services and physical media tests remain unverified. No public deployment was made. See [local testing and remaining setup](docs/SETUP-REMAINING.md).

## Continue later

1. `npm ci` and copy `.env.example` to `.env` if necessary.
2. Run `npm run db:local` (or Docker MongoDB), then `npm run seed` only for initial sample data.
3. Run `npm run dev`; open http://localhost:5173.
4. Configure provider keys and TURN/MediaPipe assets using README instructions.
5. Execute the manual tests above; do not relabel fixture tests as live-provider verification.

Current development data lives in `.data/mongodb`; secrets and generated database/runtime files are ignored by Git. No commit or public deployment was created.

## Recruitment workflow update — 2 October 2026

Implemented the requested company job → shortlist → multiple HR requests → explicit acceptance → manual candidate distribution → HR interview/feedback flow. Reused Job, Application, Notification, authentication and existing UI components; no stylesheet or navigation redesign. Company interview mutations, room entry and feedback writes are forbidden on the server and removed from company controls. HR application/resume access is limited to explicitly distributed candidates for accepted jobs. Job instructions and real counts appear in the new job details route.

Final npm run check passed: client/server build, typecheck and 34 tests. Coverage includes two-HR distribution, stale/duplicate and cross-job assignments, unshortlisting access removal, request rejection/replacement, company API/socket denials, instruction privacy and legacy migration/appointment gates. Existing completed history is preserved; old scheduled appointments require acceptance and explicit distribution to their original HR. Browser checks confirmed company controls and HR pending requests/instructions without candidate access before distribution. External provider/hardware limitations above remain unchanged.
