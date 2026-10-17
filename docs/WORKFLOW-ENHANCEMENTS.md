# HireLens recruitment workflow enhancements

Implementation date: 17 October 2026. This work extends the existing React/TypeScript, Express, MongoDB and Socket.IO application. It does not create a replacement project, add demonstration accounts to the real workspace, change passwords, or mark company/email verification as complete.

## Implemented workflow

1. A company publishes a job with its own match threshold (80% by default), requirements, interview instructions and interviewer invitations.
2. The candidate opens **Apply**, reviews a separate application form, and uploads a PDF for that job or explicitly confirms the saved profile PDF. Required contact, location, education and skills fields are validated. Editing these fields does not change the account identity or profile.
3. HireLens saves the application, selected resume and job requirements as separate screening evidence. Later profile or JD edits do not rewrite that evidence. Duplicate applications are rejected; another candidate's resume or a resume uploaded for another job cannot be substituted.
4. The screening worker uses the configured LLM to compare the submitted evidence. Validated scores at or above the job threshold shortlist the applicant. Confirmed gaps reduce the weighted score and remain visible. A reliable result below the threshold is `not_shortlisted` in the existing Rejected stage. Uncertain, conflicting or truncated evidence stays under review. Provider failures remain queued/retryable and never become fabricated scores or automatic rejections.
5. Shortlisted candidates are automatically assigned to available company HR members who accepted that job. Assignment considers active workload across company jobs and capacity. With equal workloads, ten candidates and five eligible HRs result in two candidates per HR. Ties use per-job workload and stable HR IDs. Busy/unavailable HRs do not receive new automatic assignments.
6. If no eligible HR has space, the application remains shortlisted with a pending-assignment reason and the company receives an in-app notification. Allocation retries on HR acceptance, availability/capacity changes and every 15 seconds in the existing screening worker. Pending invitations do not block HRs who already accepted. Existing assignments never move automatically when another HR joins; company reviewers can manually reassign before an interview exists.
7. The assigned HR reviews the submitted application and schedules a video or in-person interview, individually or in a batch. Calendar checks cover the interviewer and candidate across jobs. Existing calendar/job locks protect concurrent creation, and batch request IDs provide safe retries. HR can reschedule or cancel eligible appointments. Cancellation preserves the assigned HR and returns the candidate to the shortlist.
8. Video interviews retain device checks, waiting/admission, consent, coding and media flows. In-person appointments show the venue, schedule and private notes; only the assigned HR can start/end them, without requesting camera/microphone or browser-monitoring consent. An in-person interview creates a manual report rather than generating an AI assessment of an empty online interview.
9. After completion, authorized reviewers record notes, nullable integer ratings from 1 to 5, and a final decision. Releasing a finalized report makes the permitted feedback available to the candidate. Shortlist/assignment notifications describe the interview stage, not a job offer.

HR application lists, resume downloads, application detail/actions and scheduling require the current HR assignment as well as accepted job access. Reassignment immediately removes the previous HR's application access. Company reviewers retain company-wide oversight; candidates retain access only to their own submissions.

## Monitoring and human review

- Candidate-side visibility and focus events record departures, returns, timestamps and duration. Visibility and focus can describe the same incident; summaries keep their counts separate instead of adding them together.
- The candidate sees a warning after returning to the interview. `TAB_SWITCH_WARNING_THRESHOLD` defaults to 3 and is bounded to 1–20 for repeated-event guidance. The configured value is available to the client through service status.
- Browser activity and optional face monitoring have separate consent. Expected browser permission dialogs are distinguished from ordinary tab/focus transitions where feasible. Metadata delivery queues tolerate temporary network errors, and HR views show recorded observations and delivery/status information.
- Existing face-presence/multiple-face/head-position checks now provide clearer sustained-event warnings and camera/monitoring-unavailable states. Model or stream failures are disclosed rather than interpreted as misconduct.
- HR/company reviewers can annotate observations as reviewed, explained or requiring follow-up, with notes and audit history. Finalized report evidence cannot be silently edited.
- An optional LLM observation summary cites saved event IDs, includes limitations and becomes stale when observations/reviews change. It requires a completed, consented online interview and is separate from technical assessment and hiring decisions. It does not provide a cheating verdict or rejection trigger.

## Main files

| Area                        | Files                                                                                                                                                                                                                               | Purpose                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Reviewed application        | `shared/application.ts`, `src/ApplicationForm.tsx`, `src/application-form.css`, `server/app.ts`                                                                                                                                     | Shared validation, explicit resume choice, job-scoped upload and immutable application submission                             |
| Stored records              | `server/models.ts`, `shared/types.ts`                                                                                                                                                                                               | Additive application/contact/pending-assignment fields, HR capacity, interview mode/venue, ratings and monitoring review data |
| Screening                   | `server/screening.ts`, `src/ResumeScreening.tsx`, `docs/AI-RESUME-SCREENING.md`                                                                                                                                                     | Evidence-backed threshold outcomes, assignment handoff and clear result display                                               |
| Allocation                  | `server/recruitment.ts`, `src/recruitment.tsx`, `src/HrWorkload.tsx`                                                                                                                                                                | Company-wide workload/capacity, pending queue, automatic/manual assignment and management UI                                  |
| Scheduling and feedback     | `server/app.ts`, `server/interview-batches.ts`, `server/security.ts`, `src/workflows.tsx`, `src/InterviewBatches.tsx`, `src/InPersonRoom.tsx`                                                                                       | Assigned-HR scheduling, mode/venue, in-person lifecycle and manual feedback                                                   |
| Browser/device observations | `shared/monitoring.ts`, `src/monitoring.ts`, `src/monitoring-queue.ts`, `src/HumanRoom.tsx`, `src/Room.tsx`, `src/MonitoringReview.tsx`                                                                                             | Consent-aware browser monitoring, warnings, event delivery and reviewer views                                                 |
| Observation summaries       | `server/proctoring-review.ts`, `src/ProctoringSummary.tsx`                                                                                                                                                                          | Reviewed event annotations and referenced AI summaries with stale-result checks                                               |
| Temporary hosting lifetime  | `scripts/start-private-preview.ts`                                                                                                                                                                                                  | Optional fixed expiry when restarting an already-authorized preview                                                           |
| Regression tests            | `tests/application-form*.test.ts`, `tests/auto-distribution.test.ts`, `tests/resume-screening.test.ts`, `tests/interview-scheduling.test.ts`, `tests/proctoring-review.test.ts`, monitoring/room tests and existing workflow suites | Validation, permissions, real isolated database integration and browser-event/component regression checks                     |

## Data compatibility and migration

No destructive migration, reseed, password reset or account rewrite is required. The model additions are optional or have defaults:

- HR `profile.interviewCapacity` defaults to 20 (range 1–500). Capacity counts Shortlisted, Interview Scheduled and Interview Completed applications awaiting a final decision. Lowering capacity does not remove existing assignments; it pauses new allocations until space is available.
- Applications add submitted contact details, resume name, submission timestamp, assigned HR name and pending-assignment metadata. Old snapshots remain readable. New submissions are constructed from reviewed form fields, without copying stale structured profile entries over the candidate's edits.
- Company allocation lease fields serialize workload decisions across jobs and API processes. They are internal, excluded from normal model selection, and expire after an interrupted process.
- Interview mode defaults to `video`; existing appointments therefore retain their video behavior. In-person mode requires a venue and human facilitator. Ratings and evidence-review fields are additive.
- Index initialization remains part of `connectDatabase`; the existing legacy assignment migration is retained. New pending-allocation indexes support the saved queue. No historical AI results are recomputed automatically solely because of this release.
- When the ordinary API worker starts, existing unassigned shortlisted applications become eligible for the same allocation rules. This is intended processing of saved work; no fake applicants are added.

## Configuration and running

Use the existing `.env` and keep credentials outside source control. No new provider account is required for the form, allocation, scheduling, manual reports or browser-event logging.

Existing runtime configuration remains necessary for its associated services:

| Capability                                                           | Configuration/dependency                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Database and web origin                                              | `MONGODB_URI`, `APP_ORIGIN`, existing Node/MongoDB setup                                                          |
| AI resume comparison, interview evaluation and observation summaries | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`; optional existing timeout/schema settings                             |
| Repeated tab-switch guidance                                         | Optional `TAB_SWITCH_WARNING_THRESHOLD`, default 3                                                                |
| Face detection                                                       | Existing browser model/WASM assets and configured face-model URLs; camera permission and sufficient image quality |
| Transcription                                                        | Existing `STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL` configuration                                                 |
| Inbox/phone notifications                                            | Existing SMTP/email delivery and SMS provider settings; in-app notifications work independently                   |
| Remote media relay                                                   | Public TURN configuration suitable for the participants' networks; a local TURN process is not a public relay     |
| Hiring code execution                                                | A supported private/authorized Judge0 service. The public practice-only demo is not enabled for production hiring |

On the existing prepared Windows laptop, start local services without reseeding:

```powershell
npm run local:start
npm run doctor
```

For development on an already-configured database, `npm run dev` starts the API and Vite application. Install project dependencies first with `npm ci` when setting up a new checkout. For compilation and regression verification:

```powershell
npm run build
npm test
```

Tests use isolated temporary MongoDB databases and test provider stubs. They do not send real emails/SMS or validate real camera hardware. Test startup needs permission to run the temporary MongoDB executable.

### Preserve an authorized temporary preview deadline

The preview launcher continues to default to a maximum of eight hours. To rebuild/restart within an existing authorization, pass its original expiry rather than starting a new eight-hour window:

```powershell
npm run preview:private -- --company-email YOUR_COMPANY_EMAIL --expires-at ORIGINAL_EXPIRY_ISO_TIMESTAMP
```

`--expires-at` must be a valid future ISO timestamp no more than eight hours away. The launcher normalizes it to UTC and uses that same deadline for the app gate, access file, state and shutdown timer. Invalid/past/over-limit values fail before starting any service. `npm run preview:private -- --help` describes the options. The original preview must be stopped through its normal lifecycle before a replacement can acquire the launcher lock; this flag does not bypass that protection or authorize additional hosting time.

This remains a temporary Cloudflare URL, not permanent hosting. The default `--access password` requires an extra preview password. With explicit `--access account`, the root address opens `/auth/company` directly and the extra preview-password screen is removed. Normal account sign-in, company OTP, origin checks, company scope and the original expiry remain enforced. HR and candidate sign-in pages remain available at `/auth/hr` and `/auth/candidate`. Both participants must use the same public URL, and the laptop and ordinary API worker must stay running. Provider secrets are not passed to the tunnel process. The current URL and access mode are recorded in `.data/private-preview/access.txt`.

## Completion and remaining verification

Implemented in code: reviewed job applications, inclusive configurable screening threshold, automatic HR allocation, workload/capacity controls, persistent pending assignment, individual/batch scheduling in both modes, interview feedback, candidate warnings, observation review and optional referenced AI summaries.

Configuration/hardware limitations remain:

- Different-network camera/audio success still depends on device permission, working hardware, reachable public TURN and the browsers/networks involved. Passing application/Socket.IO tests does not prove end-to-end media quality.
- Browser visibility/focus APIs cannot identify every external application, off-screen device or form of misconduct. Client events can be incomplete and must be reviewed in context.
- Face/head/gaze and speaker signals are not validated cheating detectors. Calibration, lighting, glasses, accessibility needs, device quality and false positives require real-device checks. No automatic rejection is based solely on these signals.
- A trained integrity model with consented, independently reviewed training/evaluation data has not been produced by this change. Existing integrity scoring remains rule-based/research-oriented.
- Recording playback, participant-audio capture and transcription accuracy require separate physical-device checks; this work does not claim a new audio-quality validation.
- LLM quality depends on the configured model and evidence. Automated fixtures verify policy, grounding checks and error paths, not real-world screening accuracy or absence of bias.
- Public TURN, production Judge0, SMS/business verification, provider delivery and permanent hosting remain dependent on their actual configured services. Existing email/company verification checks remain enforced.

Integration evidence:

- `npm run build` passed, including frontend/backend TypeScript checks. Vite reports the existing large Monaco editor bundle warning; it does not fail compilation.
- After the final report-history changes, frontend/backend typechecks and a production frontend build passed again using `.data/runtime/workflow-build/` as a separate output folder, preserving the running preview during this final check. See `.data/runtime/workflow-isolated-build.log`.
- Final full `npm test` passed **371 tests across 35 files**, including the report-history changes, persisted human ratings and candidate release permissions. Logs: `.data/runtime/workflow-final-build.log` and `.data/runtime/workflow-final-tests.log`.
- Browser checks used an isolated temporary database with synthetic accounts, clearly labeled sample evidence and disabled external providers. Verified editable application submission and explicit saved-resume confirmation, persisted submitted details without changing the profile, HR assignment dashboard, scheduling an in-person interview, opening/starting the appointment, saved draft feedback and human ratings, and company workload distribution of one candidate per eligible HR.
- Checked HR/company mobile layouts at 390×844 and the company dashboard at 1280×900, in light and dark themes; no horizontal page overflow was observed. Application and report forms were also inspected at the browser's normal narrow viewport. Screenshots are saved in `.data/runtime/workflow-review/`. This is targeted UI verification, not a claim that every browser/device combination was tested.
- AI screening in the browser fixture intentionally remained queued because providers were disabled. Integration tests exercise the LLM adapter with controlled responses; no new live-model accuracy validation is claimed.
- After initially deferring the restart, the user explicitly requested the hosted update. The tested frontend and backend were deployed on 17 October 2026; all 80 copied build files matched the staged build hashes. The user then requested removal of the additional preview-password screen. The deployment uses `--access account`, with its original expiry unchanged. Its root opens company login directly. Company, HR and candidate login pages work without a preview cookie; private API data and WebSockets still require normal account authentication. No account passwords or OTP settings were changed. The access-mode change passed 13 focused preview tests, 48 company/local-company/live-interview regressions, eight isolated launcher checks, whole-project typecheck and backend compilation. All 50 compiled backend files were hash-verified after deployment. Public checks passed and are recorded in `.data/private-preview/direct-login-verification.json`. Temporary URLs, expiry and access details are kept only in the ignored `.data/private-preview/access.txt` and `state.json`. A rollback copy is retained in `.data/runtime/preview-rollback-20261017-1236/`, with the former password-gate module in `.data/runtime/private-preview-gated-20261017.js`. Keep the laptop and local services running. Do not extend the expiry without renewed authorization.
- No new physical camera, microphone, gaze-calibration, two-device or cross-network media checks were performed in this enhancement task. Existing device findings and limitations remain separate from the automated workflow results.
