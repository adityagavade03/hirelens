# Verification record

## Provider setup, speech safeguards and dashboard regression — 19 October 2026

The final production client/server build, TypeScript checks and **423 JavaScript/TypeScript tests in 40 files** passed; **15 Python speech-processing tests** passed separately. Coverage includes staged provider configuration without live activation, redacted provider errors, microphone recording safeguards, gaze-calibration validation, frozen-camera expiry and legacy applications with missing match results. Provider fixtures and synthetic audio do not establish real service delivery or model accuracy. The existing large Monaco bundle warning remains.

The physical gaze trial collected nine fit targets and five independent validation targets, then failed the accuracy gate. The preview remained disabled; this is a verified rejection of an inaccurate calibration, not a gaze-accuracy success. Candidate recording saved and decoded, and the user confirmed clear playback, but recognition failed. The low-confidence guard now rejects this clip's unreliable transcript; the synthetic speech still passes. HR microphone permission timed out, so separate-participant audio remains unverified. Public TURN, private hiring execution, SMS handset receipt and real company verification remain pending because the owner has no provider accounts; no second physical device was available for cross-network checks.

See [current status](PROJECT-STATUS.md), [provider activation](PROVIDER-ACTIVATION.md) and [media verification](MEDIA-VERIFICATION.md). Earlier entries retain their historical test counts and limitations.

## Interview upgrades — 8 October 2026

The latest `npm run check` passed the production client/server build and **185 tests in 18 suites** after the WebRTC track-mapping correction; `.data/runtime/remaining-update-final-check.log` records the result. A subsequent React list-key prefix correction passed another production build (`.data/runtime/remaining-update-final-build.log`) and a browser check without new errors. The existing Monaco chunk-size warning remains.

Actual same-computer browser checks covered both camera directions, a user-selected window share reaching HR, reconnect recovery, C/C++ editor choices/starters, and local forced-relay data exchange. Synthetic playable WebM upload/download/full decode, real Whisper transcription, explicit transcript review, and separately consented speaker-analysis UI were verified. Saved UI screenshots cover light and dark modes; a mobile override did not apply, so no new mobile result is claimed. Devices were stopped afterward, and normal recruitment records were not used as fixtures.

See [INTERVIEW-UPGRADE-VERIFICATION.json](INTERVIEW-UPGRADE-VERIFICATION.json) for exact evidence and limits, [MEDIA-VERIFICATION.md](MEDIA-VERIFICATION.md) for the repeatable synthetic-media check, and [ADVANCED-PROCTORING.md](ADVANCED-PROCTORING.md) for experimental model limitations. Real execution, delivery/registry accounts, audible remote microphone/cross-network media, physical recordings, completed gaze calibration and a trained custom integrity model are still pending. The older entries below are historical.

## Local company signup — 5 October 2026

`npm run check` passed TypeScript, client/server builds and **89 tests in eight suites**, including 11 new isolated company-registration regressions. The unchanged Monaco bundle warning remains. The first full-check session lost its result during a session interruption; the completed rerun is saved in `.data/runtime/local-company-check.log` with exit code 0.

`tests/local-company.test.ts` covers explicit local configuration, production/public-host/origin rejection, identity/password validation, unverified records without receipts or automatic sessions, duplicate rollback, mandatory company OTP, local publishing, existing company/HR session restrictions, pending-code restrictions, hidden local job listings and denied applications/invitation acceptance when local mode is disabled, and upgrade through a real-verification contract fixture. Providers and databases in these tests are synthetic/temporary.

An isolated browser preview completed company details → edit/back with fields preserved → local registration → password sign-in → actual locally generated OTP → company dashboard. The dashboard displayed “Local development · unverified.” Screenshot: `.data/runtime/local-company-signup-verified.jpg`. No provider verification or external email delivery was claimed. The preview was stopped and its generated email preview removed; the normal database had zero users and companies after testing.

The normal local services were restarted after a session interruption. API readiness and `localCompanyRegistration=true`, `messagePreview=true`, `companyOtp=true`, `demo=false` were confirmed. The normal signup page displays **Continue with local setup**; screenshot `.data/runtime/local-company-setup-ready.jpg`. Real company verification still needs an adapter for public deployment. No dummy accounts were restored.

## Finalization and live-code fixes — 5 October 2026

Final `npm run check` passed TypeScript, client/server builds and **78 tests in seven suites**, including 14 new regression tests. A full-suite failure during development caught input validation occurring before the notes permission check; that ordering was corrected and the final suite passed. The large Monaco bundle warning remains.

`tests/finalization.test.ts` covers immutable finalized feedback/notes, completed draft review, late code results after end/finalization, normal live code success, report lease conflicts, delayed manual/adaptive AI feedback, stale/finalized report-generation results, case-normalized lock IDs, idempotent old-round completion, serialized latest drafts and unrelated-HR denial. All provider responses here are synthetic and all databases temporary.

A separate local preview at `hirelens-review.localhost:5174` used its own temporary MongoDB and login cookie hostname. Its assigned HR opened the actual Monaco editor. The candidate's draft was changed through the real test API; the HR editor displayed the new code without reloading. No camera/microphone permission was requested. The test preview and its database were stopped. Screenshot: `.data/runtime/live-editor-verified.jpg`. The normal website renders, API reports ready, demo login is disabled and the normal database still has zero records.

These fixes supersede the defect status in the earlier audit below. Company verification, Judge0, external delivery, TURN/hosting and the previously listed advanced-feature/device-test gaps remain unchanged.


## Full requirements audit — 5 October 2026

The current build and all 64 existing tests passed again. Actual local AI question/feedback and synthetic English transcription checks passed. Website/API/database and model assets are available. Judge0 remains unconfigured; company signup is blocked by its missing verification adapter; messaging uses local previews. The cleaned normal database remains empty.

Two additional isolated reproductions confirmed defects outside the suite: an assigned HR can edit answer feedback after finalization/release (HTTP 200; assessment becomes stale), and delayed Judge0 results can be inserted after end/finalization (HTTP 201; assessment becomes stale). The script `.data/runtime/audit-report-races.mjs` uses a new MongoMemoryServer, synthetic responses and teardown, with no normal-data or real-provider changes.

The full requirement-by-requirement result and source-review findings are in [PROJECT-STATUS.md](PROJECT-STATUS.md). Passing the existing suite does not mean the complete platform is ready.


## Demo data removal — 5 October 2026

At the user's request, the inspected local demo workspace was removed: 8 sample accounts, 1 fictional company, 6 jobs, 6 resumes, 6 applications, 5 interviews, 2 reports, 11 notifications, 1 code revision, 2 sessions and 67 linked audit events (115 records total). No non-demo accounts existed. The API was paused during removal. A BSON-preserving recovery backup was verified before deletion and saved under the ignored `.data/backups` directory; the cleanup receipt is `.data/runtime/demo-cleanup-receipt.json`.

After restarting the API, all database collections had zero documents, the homepage and three role-entry pages returned HTTP 200, `/api/auth/options` returned `demo=false`, and all three former demo credentials returned HTTP 401. The seed command was checked with demo mode disabled and an unreachable test URI: it refused before connecting. Local `.env` and `.env.example` disable demo mode; startup instructions no longer seed records. Earlier sample-account checks below are historical and do not describe the current empty database. Test fixtures and built-in interview exercises remain part of the application and do not populate the user database.

## Local evidence and AI increment — 5 October 2026

Final `npm run check` passed TypeScript, the Vite production client build, compiled Express server and **64 tests in six suites**. Tests use isolated temporary databases and explicitly disable real providers from `.env`. No development database was reset.

The new evidence suite covers recording consent, owner-only uploads, idempotent segment retries, conflicting content, authenticated range playback, private-practice isolation (including company users without a company), malformed files, ended/stopped captures, unavailable speech preserving recordings, reviewed-only transcript evidence and source hashes, stale-edit conflicts, finalized-report locks, normalized/starter-excluded similarity, peer-reference privacy, simultaneous cross-job interviewer bookings, interrupted batch recovery, recording retention, coarse orientation bounds and repeated AI wording.

Real local checks passed: Whisper transcribed synthetic speech; Qwen generated schema-valid questions and answer feedback; the browser sample **Local AI verification — Java practice** saved two synthetic answers and adaptive questions. Its first report attempt rejected invalid evidence references. After constraining references and requiring evidence for scored metrics, regeneration returned HTTP 200, saved the assessment and reported `assessmentStale=false`. No hiring decision was made. All three demo-role logins and application endpoints returned HTTP 200; separate HTTP smoke sessions were logged out.

Browser review covered role entry, candidate sign-in, practice setup, typed AI questions/answers, recording consent controls and report rendering at the narrow panel width and a temporary desktop viewport. Camera/microphone permissions were not requested. Physical recording quality, two-person video, cross-network TURN, gaze/extra-speaker accuracy and production load are **not** verified.

Monaco now loads when opening the coding tab. Room JS is about 110 KB (28 KB gzip); the separate editor remains 2.75 MB (713 KB gzip) with Vite's size warning. The homepage bundle is about 872 KB (203 KB gzip).

Running services: persistent MongoDB 27017, API 4000, Vite 5173, local Ollama 11434 and speech 8765. Judge0 is unconfigured because Docker Desktop fails while initializing its `dockerInference` listener. External delivery/company verification, TURN, hosting and production database/scaling remain unconfigured. See `LOCAL-AI.md`.

The records below describe earlier increments.

## Latest HireLens requirements correction — 2 October 2026

Final `npm run check` passed: TypeScript, Vite client build, compiled Express server, and **53 tests in five suites**. Vite still reports the existing large Monaco room bundle. Test/build execution required access outside the Windows sandbox because esbuild could not read the configuration from the restricted process. Tests used separate temporary MongoDB instances, not the persistent development database.

The new `hirelens.test.ts` suite verifies HR requests before any applications, no applicant/resume access before acceptance, accepted HR shortlisting and scheduling without company distribution, company final decisions and unauthorized decision rejection, private batch appointments, duplicate/overlapping batch rejection, idempotent completed-batch retry, adaptive AI context and provider failure recovery, simultaneous AI turn serialization, assessment of the twelfth answer without a thirteenth question, evidence-reference validation, no automatic hiring decisions, unreleased history privacy, stale assessment protection and human-only fallback, bounded coding snapshots and access isolation, profile field persistence with unchanged application snapshots, weighted resume evidence and multi-signal integrity rules. Old workflow tests were updated where the latest requirements intentionally change HR visibility and company report permissions.

Live local HTTP smoke checks: homepage and API health returned 200; company, HR and candidate demo logins returned 200; each role's applications, performance-history and service-status endpoints returned 200. Smoke-test sessions were logged out. No hiring records, resumes or application statuses were changed in the development database. The running server explicitly reports AI=false, code=false, transcription=false, TURN=false and messagePreview=true.

No new visual browser review or physical media test was performed. AI/report/adaptive tests use synthetic provider-contract fixtures; real AI, STT, Judge0, SMTP/SMS, TURN, Atlas and hardware verification remain pending. See `PROJECT-STATUS.md` for the current flow and limits. The older records below document previous increments and do not override the latest requirements.

---

Date: 2 October 2026. Environment: Windows, Node 24.18.0, real local MongoDB 7.0.24.

Final `npm run check` on 2 October passed the client/server production build and all 43 tests. The existing lazy Monaco chunk warning remains.

## Automated verification

- `npm run typecheck`: passed.
- `npm run build`: passed for the React frontend and compiled Express server.
- `npm test`: 43 passing tests in four files.
- Dependency audit after pinning patched DOMPurify 3.4.16: zero known vulnerabilities reported at verification time.

The workflow suite creates its own isolated real MongoDB instance. It registers company, HR and candidate users; associates HR via invitation; creates and assigns a published job; uploads actual generated test PDFs; applies, preserves snapshots and rejects duplicates; shortlists, schedules and joins; submits an answer and monitoring metadata; handles a Judge0 contract fixture; creates a report; records a human decision; releases feedback; exports a PDF; and checks session expiry/logout. It also verifies that another company/candidate cannot access private data and that unauthorized Socket.IO connections cannot join or signal a room.

Provider tests use deliberately labeled synthetic response fixtures to verify protocol handling, schema validation, timeout/error handling, real-result persistence and hidden-output redaction. These tests do not claim that an external provider has executed code or assessed an answer.

Timezone tests verify India, US summer/winter offsets, round-tripping in Japan, and rejection of nonexistent or repeated daylight-saving wall times.

The company suite additionally checks real backend company verification receipts and duplicate identity, missing/negative/mismatched verification provider responses, confirmed passwords and username login, no session before company OTP, keyed OTP hashes, expiry, five-attempt lockout, resend throttling and invalidation, replay, role-isolated company/HR endpoints, full job fields and status/deadline changes, verified profile protection, PNG logo permissions, company-scoped HR availability, assignment/acceptance/decline notifications and real overview/workload counts. Verification and email responses are explicitly synthetic provider-contract fixtures.

The recruitment update additionally verifies two HRs on one job, required-count limits, rejection/replacement, explicit acceptance before distribution, candidate isolation, duplicate/stale/cross-job rejection, unshortlisting access removal, HR-only interview mutations and feedback, company socket denial, instruction privacy, migration without assumed acceptance, and legacy appointment access only after explicit distribution.

## Remaining-feature verification

The new suite verifies single-use email/phone links and verified notification opt-in, concurrent outbox claims and delivery retry, company-scoped question authoring, immutable interview question snapshots and actual execution-request use of the saved tests, hidden-output redaction, sequential two-round scheduling and per-round feedback, job completion only after the final round, protection against earlier reports overwriting later outcomes, retention preview/confirmation/isolation, password reset replay rejection and revocation of sessions/pending OTP, production-style HR email verification, and real OCR extraction from a generated image-only PDF using the downloaded English language model.

Final local HTTP smoke checks returned 200 for the homepage, company sign-in page, API health, model/WASM assets, existing company demo login, coding-library API, company audit API and services API. An explicit private-file probe confirmed that .data files return 403 through Vite. The database ping passed. No existing application/resume was deleted and no cleanup was run on the development database.

The new forms reused the existing visual components, but were not visually rechecked this turn because the available browser connection had rejected access. API tests and builds do not replace a visual/device review. The earlier browser checks below are historical coverage.

## Browser verification

- Company demo login and dashboard render with counts backed by seeded MongoDB records.
- Candidate demo login, dashboard and practice studio render.
- Created `UI verification — sample practice` through the interface, without granting camera/microphone permission.
- Submitted a clearly labeled test answer and verified the saved answer appeared.
- Verified missing-AI feedback is explicit.
- Opened Monaco, edited Python code, switched languages, and observed the saved draft state.
- Verified missing Judge0 produces a configuration error and no invented execution history.
- Verified the completed practice report appears in the report list and completed-session dashboard count.
- Inspected desktop layout and narrower responsive navigation. Exhaustive device/accessibility testing is not claimed.

- The 2 October browser check confirmed role-based entry and company sign-in, a separate company overview, candidate denial on `/company`, the company registration setup notice, and full job-form draft saving. A clearly labeled `UI verification — sample recruitment draft` was saved in the existing sample company, assigned to the sample HR, and accepted from its actual in-app notification. The assignment page was inspected at a 390 px viewport; no horizontal document overflow was observed.

- Recruitment update: inspected the company job page, existing application table, HR dashboard pending requests and My assignments actions in local browser sessions. Verified that a pending HR can read job instructions but sees no candidates before distribution. No stylesheet changes or new external service integrations were made.

## Still needs configured/manual verification

0. Real company verification and email OTP adapter delivery, from official company details through code receipt and sign-in.
1. Real AI generation/assessment with valid provider credentials, including provider-specific rate limits and structured-output support.
2. Real speech recording/transcription with microphone permission and a configured provider.
3. Actual Java/Python/JavaScript executions against a secured Judge0 service, including compile/runtime/timeout failures and hidden cases.
4. Two independent browser sessions with physical camera/audio, plus a cross-network call through TURN. Socket.IO transport/auth tests do not prove WebRTC media delivery.
5. MediaPipe assets are installed locally; no-face/multiple-face sustained thresholds still require a real camera. Hardware detection was not verified.
6. Docker image/Compose execution and HTTPS/coturn deployment. Docker Desktop was unavailable during this run.

## Practical limitations

- Redis rate-limit and multi-server Socket.IO adapters are implemented. Live Redis/load-balancer validation remains pending.
- Monitoring is fallible browser metadata, not tamper-proof evidence. Unsent events are retained only while the page remains open, up to 200 events; closing the tab while offline can lose them.
- Two supplied practice coding problems; company questions can now be authored through Settings → Manage coding questions.
- Local English OCR is enabled and tested with an actual image-only PDF. Scanned documents are limited to eight pages. Mixed text/image pages may need a cleaner export.
- Recruitment notifications support opt-in email/SMS with verified contacts, durable claims and retries. Local preview is enabled; real delivery is not verified.
- Password reset, HR/candidate email verification, audit records and manually confirmed retention cleanup are implemented. The audit log is best effort, not immutable. Cleanup covers private interview artifacts and old audit rows; resumes/applications/hiring feedback remain. No moderation console or automatic full-account erasure is claimed.
- The interview-room JavaScript chunk includes Monaco and is approximately 2.8 MB before compression (~736 KB gzip). It is loaded lazily when entering a room, but Vite reports a large-chunk warning. Performance optimization is an explicit future improvement.
- Interviews use a visible timer; reaching zero does not automatically submit or reject work. The interviewer ends hiring sessions; candidates end personal practice.
- Draft reports collect current saved evidence. They are not cryptographically signed or immutable audit records.

These limitations are documented so a student demonstration does not present the project as a production-certified recruitment service.
