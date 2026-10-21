# HireLens

## Current status — 21 October 2026

The latest `npm run check` passes **501 automated tests in 48 files**, client/server builds and TypeScript checks. Another **28 Python decoder/evaluator tests** passed. The project includes recruitment, automatic resume screening, HR assignment, interview rooms, coding editors, recordings and optional proctoring. These checks do not establish hiring accuracy or physical-device reliability.

- Optional object detection adds a local **More detail** model and image-quality guidance. The fresh physical check is inconclusive: the active test page/model could not be confirmed, and the user later reported Chrome's New Tab page. Earlier failed checks are preserved. See [object detection](docs/OBJECT-DETECTION.md).
- Pinned multilingual `small` speech recognition is installed and connected locally. Generated Candidate and HR recordings passed authenticated storage, decoding, playback and transcription checks. Fresh physical speech, both microphones and cross-network audio remain unverified. See [recording evidence](docs/MEDIA-TRACKS-VERIFICATION.md) and [speech quality](docs/SPEECH-QUALITY.md).
- The AI quality corpus now contains **26 resume/JD and four report cases**, with repeated-run diagnostics. Latest valid runs cover 12 new resume and two report cases in **28 passing attempts**, with varying scores; the full corpus was not rerun. See [AI quality findings](docs/AI-QUALITY-VALIDATION.md).
- Real hiring execution, cross-network video, SMS, company verification and permanent hosting still require owner-controlled services/accounts. Public Judge0 is limited to local practice. Production configuration and health checks are prepared in the [Linux deployment guide](docs/PRODUCTION-DEPLOYMENT.md).
- Gaze/face/speaker accuracy, a consented trained integrity model, exact theme matching and remaining physical mobile/browser checks are unfinished. See [current project status](docs/PROJECT-STATUS.md).

The implementation was validated locally. Production activation still requires the owner-controlled services and live checks documented below.

This repository contains application source, setup scripts and synthetic tests. Credentials, database records, private resumes, recordings and local runtime files are excluded. After downloading, follow the setup steps below and create your own accounts; integrations need your own configuration. Making the source available does not host the application or include a working production service.

The dated notes below describe earlier milestones; the current status and linked verification records supersede their older test counts and provider results.

**Interview upgrades (8 October 2026):** C/C++ editor and execution integration, a verified local TURN data relay, playable synthetic-media/Whisper checks, optional speaker clustering, and experimental local gaze calibration are documented in [INTERVIEW-UPGRADE-VERIFICATION.json](docs/INTERVIEW-UPGRADE-VERIFICATION.json). Judge0, real delivery/company verification, public cross-network calls and a genuinely trained integrity model still have explicit dependencies; see [PROJECT-STATUS.md](docs/PROJECT-STATUS.md).

**Automatic resume screening (8 October 2026):** see [AI-RESUME-SCREENING.md](docs/AI-RESUME-SCREENING.md) for the guided resume form, LLM match scores and automatic shortlist workflow.

**Local AI and interview evidence update (5 October 2026):** see [LOCAL-AI.md](docs/LOCAL-AI.md) for the installed account-free AI/speech services, recording/playback, reviewed transcripts, similarity checks and restart instructions. Use `npm run local:start` on this Windows checkout. Current limitations are tracked in [PROJECT-STATUS.md](docs/PROJECT-STATUS.md).

A full-stack student project for **company hiring and personal mock-interview practice**, with an original interface inspired by modern interview platforms.

Company → job → HR request and acceptance → automatic LLM resume screening and shortlisting → individual or batch scheduling → human or AI-assisted interview → evidence report → company/HR decision. Candidates apply to published jobs and also have a private practice studio. Company allocation between accepted HRs is optional.

The current requirements and precise limitations are recorded in [Project status](docs/PROJECT-STATUS.md). AI, code execution, speech, outbound delivery and cross-network media require configured services; the local application does not manufacture their results.

The remaining local features now include password recovery, contact verification, email/SMS previews, scanned-resume OCR, a coding-question editor, separate interview rounds, audit/retention controls and optional Redis scaling. Start with [the local testing and provider setup guide](docs/SETUP-REMAINING.md).

## Start on Windows / VS Code

Install Node.js 24 LTS. Open this folder in VS Code and open its terminal. Use `npm.cmd` in PowerShell if your execution policy blocks `npm.ps1`.

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run setup:assets
```

Start a **real local MongoDB process with persistent storage** in terminal 1:

```powershell
npm.cmd run db:local
```

The first run downloads MongoDB 7.0.24. Keep this terminal open. Data is saved under `.data/mongodb`, not in browser storage. This helper uses `mongodb-memory-server` to manage a real `mongod` binary with a persistent WiredTiger directory. Despite the package name, the development data directory is preserved on shutdown. It is a local development helper, not a production database. If you see `Instance failed to start`, allow the database process through your normal local software controls and retry; the startup timeout is 60 seconds.

Alternatively, start Docker Desktop and run `docker compose up -d mongo`. Use only one local MongoDB option at a time because both use port 27017. You can also set `MONGODB_URI` to your own MongoDB installation or Atlas database.

In terminal 2:

```powershell
npm.cmd run dev
```

Open **http://localhost:5173**. The API runs on port 4000. The development proxy connects the interface, API, and Socket.IO. Both `localhost:5173` and `127.0.0.1:5173` are supported for development; their login cookies are separate.

### Start with your own accounts

The local demo workspace was removed on 5 October 2026. Demo login and seeding are disabled by default (`ALLOW_DEMO_LOGIN=false`). Register your own candidate or HR account from the role sign-in page. With explicit localhost-only `ALLOW_LOCAL_COMPANY_REGISTRATION=true`, company signup offers local setup and keeps the company unverified. Verified/production registration requires the real company-verification adapter described below. Starting the application does not create any sample records.

### Optional demo accounts — separate development database only

Only if you deliberately want fictional records again, point `MONGODB_URI` at a separate demonstration database, set `ALLOW_DEMO_LOGIN=true`, and run `npm run seed`. The seed refuses to run with demo mode disabled.

| Role | Email |
| --- | --- |
| Company | `company@demo.hirelens.local` |
| HR / interviewer | `hr@demo.hirelens.local` |
| Candidate | `candidate@demo.hirelens.local` |

The optional seed uses password **`HireLensDemo!2026`** unless `DEMO_PASSWORD` is set. These accounts do not exist in the cleaned local database. The “Explore the demo” shortcut is hidden while demo mode is disabled.

The seed creates a fictional company, sample jobs, sample PDF resumes, applications, and upcoming interviews. It computes skill coverage from those sample profiles. It does **not** manufacture completed interviews, AI feedback, or execution results. Running the seed again preserves existing data. Never seed a production database; the script refuses `NODE_ENV=production`.

## What you can do

- Choose a role-specific entry and dashboard. Company registration verifies official information through a configurable backend adapter; company sign-in supports expiring email OTPs. Candidate/HR registration and existing secure sessions remain available.
- Edit candidate and company profiles. Upload text PDFs or scanned resumes using local English OCR.
- Invite an HR account to a company and accept or decline the invitation.
- Create full job descriptions with rounds, work mode, salary, openings and deadlines; save drafts, publish, unpublish, close, and assign jobs. Search published opportunities and apply once per job.
- Review immutable submitted profiles and resumes, a criterion-by-criterion resume match, and application stages. Profiles include preferred roles and self-reported years of experience; jobs include interview difficulty.
- Company: send job requests before applications arrive, monitor hiring, and optionally allocate candidates between accepted HRs.
- HR: accept/reject requests, review AI screening evidence for accepted jobs and schedule shortlisted candidates directly. Batch scheduling creates consecutive private appointments; each interview round has its own schedule and report. Opt-in email/SMS notifications extend in-app notifications.
- Join authorized interview rooms, check devices, use camera/mic controls, answer technical questions, take private notes, and submit code.
- Start private mock sessions with question templates, technical topics, difficulty, and coding exercises.
- Use configured AI, speech, Judge0, TURN, and MediaPipe integrations. Missing configuration is explicit.
- HR/company: inspect reports, record a human decision and explanation, and release candidate feedback. Export PDF reports and compare performance history. Candidates see only their own released reports.
- Adaptive AI sessions generate a plan and follow-up questions from previous answers. AI reports provide evidence references, rubric-based technical/problem-solving/explanation-clarity assessments, strengths, gaps, improvement suggestions and an advisory recommendation. Coding percentages use actual test results. Integrity review is separate.
- Review saved coding snapshots (at most every 15 seconds; up to 300 per interview), submissions and a contextual integrity timeline. These are not complete recordings or proof of misconduct.

## Configure external services

All secrets belong in `.env` on the **server**. Never put keys into `VITE_` variables. Restart the API after changing environment values. Settings → Integrations reports whether configuration is present, not whether the provider has passed a live health check.

### Company verification and email codes

See [company onboarding](docs/COMPANY-ONBOARDING.md) and [delivery setup](docs/DELIVERY-AND-VERIFICATION.md) for the contracts, environment settings, security controls and no-send `npm run providers:check` command. Verified/production company registration requires a real provider; explicitly enabled localhost development setup creates an unverified company. Company OTP requires SMTP or the email adapter and a secret; development previews save messages locally without sending them. Missing configuration fails explicitly; no company is silently verified and no OTP is displayed in API responses. Production disables sample access and requires company OTP.

### AI technical questions and feedback

Use an API that implements the OpenAI-compatible `POST /chat/completions` JSON protocol, supports `response_format: {type: "json_object"}`, and accepts your chosen model.

```dotenv
LLM_BASE_URL=https://YOUR_PROVIDER/v1
LLM_API_KEY=YOUR_SECRET
LLM_MODEL=YOUR_MODEL_IDENTIFIER
```

`LLM_BASE_URL` is the base URL; do not append `/chat/completions`. HireLens sends technical role requirements, skills/projects, interview topics, and previous answers for question generation. Assessment sends the question, rubric, and submitted answer. It does not send the raw resume or use name, age, gender, religion, caste, appearance, accent, or emotion to assess suitability. User-authored technical text can still contain personal information, so use a provider appropriate for the data you collect.

Responses are schema-validated. Invalid JSON, out-of-range scores, HTTP failures, or timeouts produce a visible error and no fabricated score. Scores are rubric scores from 0–5, with explicit uncertainty; they are not hiring probabilities. HR can add a written override. Configure your provider’s own retention and access settings before handling real applicant data.

### Speech-to-text

Use a provider compatible with multipart `POST /audio/transcriptions`, returning `{ "text": "..." }`:

```dotenv
STT_BASE_URL=https://YOUR_PROVIDER/v1
STT_API_KEY=YOUR_SECRET
STT_MODEL=YOUR_TRANSCRIPTION_MODEL
```

The candidate explicitly clicks **Record spoken answer**. Recordings stop after two minutes, have a 12 MB server limit, and are not saved in MongoDB. The recording is sent to your speech provider. The user must review/correct the transcript before submitting. Without this integration, only typed answers are available.

### Judge0 isolated execution

If you see `Code execution needs a Judge0 service`, follow the [code-execution setup guide](docs/CODE-EXECUTION.md). The new commands are `npm run code:prepare`, `npm run code:local`, and `npm run code:check`.

Use a secured Judge0 CE-compatible service. Candidate code is **never** executed by the HireLens Node server.

```dotenv
JUDGE0_URL=https://YOUR_JUDGE0_HOST
JUDGE0_API_KEY=YOUR_SECRET
JUDGE0_AUTH_HEADER=X-Auth-Token
```

For a RapidAPI deployment, use the base URL provided by that deployment, set `JUDGE0_AUTH_HEADER=X-RapidAPI-Key`, and set `JUDGE0_RAPIDAPI_HOST` to the host supplied in its API console.

HireLens resolves Java, Python 3, and JavaScript IDs from `/languages`, creates asynchronous submissions, and polls their results. It sets 2-second CPU, 5-second wall, 128 MB memory, and 1 MB file limits with network access disabled. The service must support these limits. Provider endpoints have per-user request limits. Hidden test inputs, expected outputs, standard output, and errors remain server-side; only the hidden verdict and resource use are returned. The supplied practice bank contains two problems. Company/HR users can author questions in Settings → Manage coding questions; each scheduled interview keeps its own immutable copy.

### WebRTC / STUN / TURN

Localhost permits browser media access. Deploy over **HTTPS** and serve Socket.IO through the same origin. A public STUN server is configured by default. For reliable calls between different networks, deploy coturn or use a managed TURN service that supports shared-secret, time-limited credentials:

```dotenv
STUN_URL=stun:stun.l.google.com:19302
TURN_URL=turns:turn.example.com:5349?transport=tcp
TURN_SECRET=YOUR_COTURN_SHARED_SECRET
TURN_TTL_SECONDS=3600
```

The server derives temporary per-user credentials; it never sends the TURN shared secret to browsers. `deploy/turnserver.conf.example` is a starting point. Configure public IP mapping, DNS, a valid TLS certificate, 3478/5349 listeners, and the configured UDP relay port range. Restrict private-network peer ranges for your deployment and keep coturn updated. WebRTC connection success cannot be promised from STUN alone.

### Local MediaPipe face-count monitoring

Run `npm run setup:assets` to install the official model, matching package WASM files and local English OCR data. Configure these paths and restart the API:

```dotenv
FACE_MODEL_URL=/vendor/mediapipe/blaze_face_short_range.tflite
MEDIAPIPE_WASM_URL=/vendor/mediapipe/wasm
FACE_EVENT_SECONDS=5
RESUME_OCR_ENABLED=true
```

Detection runs locally at a throttled interval. No-face or multiple-face conditions must persist beyond the threshold; only one alert is emitted per continuous condition. Webcam frames are not stored or sent for this detection. Browser event metadata is recorded only after consent for hiring interviews. Practice sessions do not enable monitoring. No emotion or lie detection is implemented.

## Understanding the score

New applications use transparent evidence coverage: required skills (weight 60), structured experience (20), education keyword overlap (15), and preferred skills (5). Unknown criteria are excluded and remaining weights are normalized. Each component explains its evidence and limits; experience equivalence, other criteria and project quality still need human review. Education overlap does not verify qualifications. Older application snapshots retain their original required-skill coverage. Missing evidence never means incapable. PDF parsing rejects empty, corrupt or encrypted documents; local English OCR can read low-text scanned pages, with review required for OCR errors.

## Verify the project

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd audit
```

Tests start a separate real MongoDB instance and do not clear the demo database. They cover company verification receipts, OTP delivery contracts/expiry/attempt limits/resend/replay, dedicated dashboard permissions, full job fields, HR assignments/availability/notifications, registration, password hashing, cookie sessions, expiry/logout, cross-origin rejection, role and tenant isolation, HR invitations, job visibility, PDF parsing, immutable application snapshots, duplicate applications, scheduling, consent, Socket.IO authorization/signaling/reconnect, submitted answers, monitoring persistence, provider failure/response handling, personal practice, report access/release, human decisions, and PDF output.

Provider responses in automated tests are **explicit contract fixtures**, not live AI or code execution. Actual provider calls, physical microphone/camera capture, sustained face detection, and cross-network two-person WebRTC require a configured manual test. See `docs/TESTING.md` and `PROGRESS.md` for the delivered verification record.

## Deployment

For one server, use `npm run build`, set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain`, and `MONGODB_URI`, then run `npm start` behind a TLS reverse proxy. The production API serves the frontend too. See `deploy/Caddyfile.example`.

For a temporary Windows device test, `npm run preview:private -- --company-email YOUR_COMPANY_EMAIL` starts a separate compiled server and Cloudflare Quick Tunnel. First build with `npm run build` and install the official checksum-verified Windows cloudflared client at `.data/tools/cloudflared.exe`. The preview lasts at most eight hours; its HTTPS link and access details are saved in the ignored `.data/private-preview/access.txt`. By default, visitors enter an additional preview password and then sign in normally. Add `--access account` to open the company login page directly without that extra password screen; normal account sign-in and company OTP remain required. HR and candidate links use `/auth/hr` and `/auth/candidate`. Use `--expires-at ORIGINAL_EXPIRY_ISO_TIMESTAMP` when restarting within an existing authorized window. The preview shares the existing local database, so actions change real local records. Only the selected development company gets temporary remote access, without changing its unverified status; account permissions still apply. New local company registration remains disabled. MongoDB, source code, and the Vite development server are not tunneled. The normal local instance retains ownership of background email/screening workers. Keep the laptop and local services running; stop the preview with `npm run preview:stop`. Public TURN and a private Judge0 service remain separate requirements; a tunnel does not relay WebRTC media or enable the public Judge0 demo for hiring. This mode is for trusted testing and is not permanent hosting.

Use the separate authenticated database/Redis/HTTPS deployment template in `compose.production.yaml` and the instructions in [SETUP-REMAINING.md](docs/SETUP-REMAINING.md). Docker image execution and public deployment still need verification on a running Docker host. Multiple API servers can share Redis rate limits and Socket.IO signaling; sticky proxy routing is required for polling.

For a free provider address, [Render staging setup](docs/RENDER-DEPLOYMENT.md) and `render.yaml` prepare a single free web service. No Render service has been created. A cloud database, compatible HTTPS email delivery and actual company verification are required; the laptop's local accounts and AI services do not transfer automatically.

## Source guide

| Folder | What it does |
| --- | --- |
| `src` | React pages, forms, interview room, browser monitoring, styles |
| `server` | API, MongoDB schemas, permissions, providers, real-time signaling, seed |
| `shared` | Shared TypeScript models |
| `tests` | API, persistence, security, signaling, and provider-contract tests |
| `scripts` | Local development database helper |
| `deploy` | HTTPS reverse proxy and TURN examples |
| `docs` | Architecture, API reference, testing notes, presentation guide |

See [API reference](docs/API.md), [architecture](docs/ARCHITECTURE.md), [presentation and demo](docs/DEMO.md), and [progress](PROGRESS.md).

Official references checked during implementation: [Vite](https://vite.dev/guide/), [Express 5](https://expressjs.com/en/guide/migrating-5/), [Mongoose](https://mongoosejs.com/docs/connections.html), [Socket.IO authentication](https://socket.io/docs/v4/middlewares/), [Judge0](https://ce.judge0.com/), [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js), and [Monaco React](https://github.com/suren-atoyan/monaco-react). Exact installed versions are locked in `package-lock.json`.
