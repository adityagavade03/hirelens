# HireLens API reference

## Interview completion and feedback conflicts (5 October 2026)

Interview completion, report finalization and evidence writes use a shared short report lease. `PATCH /interviews/:id/notes`, answer override and answer assessment return 409 if the report is finalized; reopen it through the authorized report review before editing. Earlier-round feedback stays locked after a later round begins. Slow answer/report AI responses are rechecked before persistence; report generation also rejects evidence changed while the provider was running.

`POST /interviews/:id/code` returns 409 without inserting a result if execution finishes after the interview ends. Retry a transient concurrent-update conflict only while the interview is still live. Completion retries return the existing report and do not complete a later scheduled round or repeat the completion notification. Parsed ObjectIds are case-normalized before constructing lock keys.

`GET /interviews/:id` returns saved drafts as an ordinary language-to-code JSON object for authorized participants. The HR editor and execution history poll every eight seconds; candidate unsaved edits are not part of the saved snapshot.


## Interview evidence additions (5 October 2026)

All paths below include `/api` and require a signed-in session.

| Method and path | Purpose |
| --- | --- |
| `POST /interviews/:id/captures` | Participant opts in with `{accepted:true}` during a live session. |
| `POST /captures/:id/clips` | Owner uploads multipart `clip`, `sequence`, `offsetMs`, `durationMs`; 6 MB / 120 seconds per WebM/MP4 segment, bounded total quota, idempotent identical retries. |
| `POST /captures/:id/stop` | Owner closes the capture after uploads finish. |
| `GET /interviews/:id/media` | Authorized segment metadata and transcripts; binary data and internal tokens are excluded. Candidates see only their own track. |
| `GET /media/:id/play` | Authenticated playback with byte ranges and private/no-store caching. |
| `POST /media/:id/transcribe` | Transcribe stored media through the configured speech service; overlapping requests are leased. |
| `PATCH /media/:id/transcript` | Save `{transcript,reviewed:true,expectedUpdatedAt}` with conflict detection. Finalized reports prohibit editing. |
| `GET /interviews/:id/similarity` | Company or assigned HR compares company/problem-scoped submitted code; unauthorized peer references are hidden. |
| `POST /interview-batches/:id/recover` | Owning HR restores incomplete scheduling after two minutes, or repairs notifications for a ready batch. |

Reviewed candidate transcript excerpts contribute to AI evidence hashes and PDF exports. Similarity and head-turn observations do not alter technical scores or hiring decisions. Ordinary tests isolate provider credentials; live model checks are separate. See `LOCAL-AI.md` for limits and local startup.

Base path: `/api`. JSON requests and responses except multipart upload and PDF downloads. Same-origin cookies authenticate requests. Mutations require the configured browser Origin in production. Never pass a user ID to choose the current user; identity always comes from the session.

Errors use `{ "error": { "code": "CODE", "message": "Human-readable explanation" } }`. Common statuses: 400 validation, 401 login required, 403 role/origin/consent restriction, 404 absent or inaccessible record, 409 duplicate or state conflict, 422 unreadable PDF, 429 rate limit, 502 invalid/provider failure, 503 provider not configured, 504 execution still queued.

## Accounts and profiles

| Method and route | Request / result |
| --- | --- |
| GET `/health` | Database readiness; public |
| GET `/auth/options` | Public configuration booleans, including `localCompanyRegistration` and `messagePreview`; no secrets or codes |
| POST `/auth/company/verify` | Official company details → single-use verification receipt; see COMPANY-ONBOARDING.md |
| POST `/auth/register` | `{name,email,password,confirmPassword?,role,username?,verificationToken?,localCompanyDetails?}`; company requires username and matching confirmation. Use a valid verification receipt, or explicit localhost development details when `localCompanyRegistration` is enabled. Modes cannot be combined; local details must match email and create an unverified company. Company result asks user to sign in. |
| POST `/auth/login` | `{identifier?,email?,password,role?}` → `{user}` and HttpOnly cookie, or HTTP 202 `{otpRequired,challengeToken,expiresAt,destination}` for company |
| POST `/auth/otp/verify` | `{challengeToken,code}` → `{user}` and existing session cookie |
| POST `/auth/otp/resend` | `{challengeToken}` → new challenge; invalidates the previous one |
| GET `/auth/me` | `{user}`; never includes passwordHash |
| POST `/auth/logout` | Revokes current session and clears cookie |
| PATCH `/profile` | `{name,phone,location,headline,education,skills:string[],experience,projects,certifications,expertise}` |
| POST `/profile/resume` | Candidate; multipart field `resume`, PDF ≤5 MB |
| GET `/resumes/:id` | Immutable PDF, owner or authorized job reviewer only |
| GET `/company` | Company/HR; `{company,members}` |
| PATCH `/company` | Owner; permitted name/website, description, industry, companyType, address, phone, location; verified identity edits require re-verification |
| POST `/company/verify` | Owner; official details → provider verification; email must match registered owner |
| POST `/company/logo` | Owner; multipart `logo`, PNG/JPEG ≤1 MB |
| GET `/company/logo` | Company/HR; own company image |
| GET `/company/overview` | Owner; database aggregates, company, recent jobs and applications |
| GET `/company/interviewers` | Owner; company HR profiles, availability, actual workload |
| GET `/hr/assignments` | HR only; job requests with `myRequest` and `assignedCandidateCount` |
| PATCH `/hr/assignments/:id` | Requested HR; pending request → `{status:"accepted"|"declined"}`; declined is displayed as rejected |
| PATCH `/hr/availability` | HR only; `{availability:"available"|"busy"|"unavailable",availabilityNote}` |
| GET `/invitations` | Company’s invitations or HR’s matching email invitations |
| POST `/invitations` | Owner; `{email}`; in-app invitation |
| PATCH `/invitations/:id` | Invited HR; `{status:"accepted"|"rejected"}` |

Sessions are stored as SHA-256 hashes of random 256-bit tokens. Passwords use bcrypt cost 12. Session validity is checked explicitly against expiry, independently of MongoDB TTL cleanup. HR can belong to one company in this version. Owners request HR members; accepted HR can review and shortlist job applicants. Company allocation is optional. Company and assigned HR can finalize reports; only interview participants can enter the room.

## Jobs and applications

| Method and route | Request / result |
| --- | --- |
| GET `/jobs?q=text` | Published jobs for candidates; company/assigned jobs for staff |
| POST `/jobs` | Owner; job fields below |
| PATCH `/jobs/:id` | Owner of job; partial job fields merged with current values |
| GET `/jobs/:id` | Company job detail; requested HR sees instructions, and all job applicants after acceptance |
| PATCH `/jobs/:id/hr-count` | Owner; {requiredHrCount:1..100}, cannot undercut pending + accepted requests |
| POST `/jobs/:id/hr-requests` | Owner; {hrIds:string[]}; published job, company HR availability and capacity checked; no shortlist prerequisite |
| PATCH `/jobs/:id/distribution` | Owner; `{assignments:[{applicationId,hrId,expectedHrId}]}` (HR IDs may be null); only accepted HRs; validates whole batch before write; stale assignments return 409 |
| POST `/jobs/:id/apply` | Candidate; snapshots current profile and resume, rejects duplicates |
| GET `/applications` | Own applications, company applications, or applications to HR's accepted jobs; optional `?jobId=` |
| PATCH `/applications/:id/status` | Company or accepted HR; `{status:"Under Review"|"Shortlisted"|"Rejected"}`; HR may not change another interviewer's assigned candidate |

Job fields: `{title,role?,department?,description,skills:string[],preferredSkills?:string[],experience,education?,location,employment,workMode?,salaryMin?,salaryMax?,salaryCurrency?,openings?,deadline?,rounds?:string[],criteria,additionalRequirements?,interviewInstructions?,status}`. Salary is an optional annual range; deadline is an ISO datetime or null. Publishing requires company verification (development sample exception); applying after the deadline is rejected. Employment: Full-time / Part-time / Internship / Contract. Status: draft / published / closed. A MongoDB unique index on jobId + candidateId prevents concurrent duplicate applications.

Application transitions: Applied → Under Review / Shortlisted / Rejected; Under Review → Shortlisted / Rejected; Shortlisted → Under Review / Rejected / Interview Scheduled. Scheduling, cancellation, completion, and finalized reports own later transitions. Accepted HR or company performs shortlisting. HR shortlisting assigns the candidate to that HR; scheduling can claim an unassigned shortlist. Removing a candidate from the shortlist clears their HR assignment. Optional company allocation sets one `assignedHrId` without scheduling. Cancellation retains assignment. A per-job database lock serializes requests, shortlisting, allocation and scheduling.

Interview instructions: `{type:"technical"|"behavioral",skills:string[],topics:string[],criteria,duration:10..180,special}` plus the ordered `rounds` list. Instructions and HR requests are omitted from candidate job listings. `GET /jobs/:id` computes recruitment progress from stored applications, distribution and interviews.

## Interviews and practice

| Method and route | Request / result |
| --- | --- |
| GET `/interviews` | Authorized hiring sessions and own personal practice |
| POST `/interviews` | Assigned HR only; `applicationId` plus schedule fields |
| GET `/interviews/:id` | Authorized session; private notes and unreleased AI feedback stripped for hiring candidates |
| PATCH `/interviews/:id/schedule` | Assigned HR only; schedule fields, while scheduled |
| POST `/interviews/:id/cancel` | Assigned HR only; cancellation returns application to Shortlisted |
| POST `/practice` | Candidate; `{jobTitle,topics,difficulty,duration,problemId}` |
| POST `/interviews/:id/consent` | Candidate; `{accepted:true}` |
| POST `/interviews/:id/start` | Authorized participant; requires consent for hiring candidate, opens 15 minutes early |
| GET `/interviews/:id/ice` | Authorized STUN and temporary TURN credentials |
| PATCH `/interviews/:id/notes` | Interviewer or practice owner; `{notes}` |
| POST `/interviews/:id/end` | Interviewer/practice owner; marks complete and creates one report idempotently |

Schedule fields: `{scheduledAt,timezone,duration,type,topics,difficulty,problemId,interviewerId}`. `scheduledAt` must be ISO 8601 with a timezone offset; MongoDB stores the UTC instant. `timezone` is a valid IANA name such as Asia/Kolkata. Duration is 10–180 minutes. Difficulty: Beginner / Intermediate / Advanced. Type: technical / behavioral. Candidates see browser-local date/time.

## Technical questions and answers

| Method and route | Request / result |
| --- | --- |
| POST `/interviews/:id/questions` | Interviewer/practice owner; generates validated AI questions with rubrics, max 20 per session |
| POST `/interviews/:id/answers` | Candidate; `{questionId,text,mode,transcriptionReviewed}`; one submission per question |
| POST `/interviews/:id/answers/:questionId/assess` | Interviewer/practice owner; validated advisory feedback |
| PATCH `/interviews/:id/answers/:questionId/override` | Assigned HR only; `{override}` human correction |
| POST `/interviews/:id/transcribe` | Candidate; multipart field `audio` ≤12 MB, returns editable `{text}` |

Feedback schema: `{correctness:number|null,completeness:number|null,feedback:string,evidence:string[],missingConcepts:string[],followUp:string,uncertainty:string}`. Numeric values range from 0 to 5. Invalid responses are never persisted. No aggregate hireability score.

## Coding and monitoring

| Method and route | Request / result |
| --- | --- |
| GET `/problems` | Public problem statements, constraints, examples and starter templates; no hidden cases |
| GET `/languages` | Actual configured Judge0 language IDs mapped to python/javascript/java |
| PATCH `/interviews/:id/draft` | Candidate; `{language,code}` saved draft during live session |
| POST `/interviews/:id/code` | Candidate; `{language,code,mode:"run"|"submit",stdin?}`; actual execution results |
| GET `/interviews/:id/submissions` | Authorized code history |
| POST `/interviews/:id/events` | Consented candidate during live session; metadata below |
| GET `/interviews/:id/events` | Reviewer; chronological event metadata |

Event fields: `{kind,occurredAt,durationMs,detail?}`. Kinds: hidden, visible, blur, focus, fullscreen-exit, copy, paste, connection-interrupted, connection-restored, no-face, multiple-faces, monitoring-unavailable. The server adds receivedAt. Client-provided timestamps are not tamper-proof. No raw webcam video is stored.

## Reports and notifications

| Method and route | Request / result |
| --- | --- |
| GET `/reports` | Staff’s authorized reports; candidates see only released reports |
| GET `/reports/:id` | `{report,interview,application,submissions,events}`; candidate view excludes private notes and monitoring |
| PATCH `/reports/:id` | Assigned HR or company owner; `{summary,decision,explanation,finalized,released}`; records reviewer/time, refuses stale AI assessment on finalization |
| GET `/reports/:id/pdf` | PDF generated with the same permissions and visibility rules |
| GET `/notifications` | Current user’s latest 50 in-app notifications |
| PATCH `/notifications/read` | Mark current user’s notifications as read |
| GET `/services` | Configuration flags and public MediaPipe asset paths; never secrets |

Decision: pending / selected / rejected / hold. Finalization requires a non-pending decision and explanation of at least 10 characters. Release requires finalization. Only a human staff member can set the decision for a hiring assessment.

## Socket.IO

Socket path `/socket.io`; cookies use the same origin. A database session is checked at connection and before every incoming event.

- `room:join` with `{interviewId}` → acknowledgement `{ok,peers,error?}`. Only candidate and assigned interviewer can join a live session; candidate hiring consent is enforced. One active connection per participant per room.
- `signal` with `{interviewId,description?:{type:"offer"|"answer",sdp},candidate?:RTCIceCandidateInit}` → relay only within the joined authorized room.
- Server emits `peer:joined`, `peer:left`, and `signal`. Client reconnects and reauthorizes room membership; failed ICE can restart.

Signaling payloads and per-socket event counts are limited. No client may broadcast to an arbitrary company or room.
# Remaining-feature APIs

All authenticated routes use the existing HttpOnly session. Mutations keep the origin and role checks. These routes extend the original API below.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/forgot-password` | `{email}`; neutral response; single-use 15-minute reset link. |
| POST | `/api/auth/reset-password` | `{token,password,confirmPassword}`; consumes token and revokes sessions/pending company OTP. |
| POST | `/api/auth/resend-verification` | `{email}`; neutral response and per-account cooldown. |
| POST | `/api/auth/verify-contact` | `{token}`; confirms email or SMS ownership; does not opt into notifications. |
| POST | `/api/account/verify-email` | Signed-in account requests its email link. |
| POST | `/api/account/verify-phone` | `{phone}` in international E.164 format; sends a phone verification link. |
| PATCH | `/api/account/notifications` | `{email:boolean,sms:boolean}`; enabled channels require verified contacts. |
| GET, POST | `/api/problem-library` | Company/HR list private company question content or create a question. |
| PUT | `/api/problem-library/:id` | Company-scoped edit; scheduled interview snapshots stay unchanged. |
| GET | `/api/interviews/:id/problem` | Authorized participant/company receives the public snapshot, without hidden tests. |
| GET | `/api/applications/:id/rounds` | Authorized scope; round history, visible reports and HR scheduling eligibility. |
| GET | `/api/company/audit?before=ISO_DATE` | Company owner activity log, newest 100 records, optional cursor. |
| POST | `/api/company/retention/preview` | `{days:30..3650,auditDays:365..3650}`; counts and five-minute preview token, no deletion. |
| POST | `/api/company/retention/apply` | `{previewToken,confirmation:"DELETE PRIVATE INTERVIEW DATA"}`; owner-scoped, single-use cleanup. |

`GET /api/problems` includes built-in public questions plus the company library for company/HR users. Candidates see built-ins; their assigned questions come through the interview-specific route. A custom question contains `title`, `difficulty`, `description`, `constraints`, `examples:[{input,output}]`, `starter:{python,javascript,java}`, and `tests:[{input,output,hidden}]`. At least one public and one hidden test are required.

Scheduling uses the existing endpoint and automatically selects the next eligible round. Completed prior rounds must have a finalized `selected` report to advance. The final successful round alone changes the application to Selected. `roundIndex` is zero-based; `roundName` and `roundCount` describe the saved interview. Earlier reports cannot be changed after a later round starts.

Retention removes monitoring events, coding submissions, private notes/drafts for completed/finalized interviews and old company audit rows. It does not delete resumes, applications, answers, feedback or decisions. Preview/apply uses an explicit snapshot; no automatic cleanup is enabled. See `SETUP-REMAINING.md` for exact boundaries and setup.


## HireLens ecosystem additions

Profile updates also accept `preferredRoles:string[]` and `experienceYears:number|null` (0–80). Jobs accept `difficulty:Beginner|Intermediate|Advanced`. New resume snapshots include a transparent weighted component breakdown; older matching snapshots stay unchanged.

| Method and route | Request / result |
| --- | --- |
| GET `/jobs/:id/interview-batches` | Company or accepted HR; HR sees own batches |
| POST `/jobs/:id/interview-batches` | Accepted HR; `{requestId:UUID,name,applicationIds,startsAt,timezone,duration,gap,problemId,facilitator?}`; 1–20 candidates, separate consecutive appointments, same request ID recovers completed batch |
| POST `/interviews/:id/ai/next` | Participant of live AI session; generates plan/one next question, assesses previous answer, validates result, max 12 questions; returns existing unanswered question on retry |
| GET `/interviews/:id/code-history` | Authorized participant/company; editor snapshot metadata |
| GET `/interviews/:id/code-history/:revision` | Authorized snapshot content scoped to that interview |
| POST `/reports/:id/assessment` | Company/assigned HR or practice owner; bounded evidence-based AI report; cannot change a finalized report |
| DELETE `/reports/:id/assessment` | Same permissions; removes draft AI assessment so staff can proceed with human review |
| GET `/analytics/performance` | Up to 100 completed authorized sessions; candidates only see released reports; stale/missing AI scores are null |

Scheduling and practice accept `facilitator:human|ai` (default human). Candidate participants can finish their AI sessions; hiring feedback still requires staff finalization/release. Browser speech synthesis can read questions aloud; speech-to-text still requires a provider. Report responses add `integrity`, `coding` and `assessmentStale`. Integrity is never returned to hiring candidates. AI scores refer to source answers/submissions and never set a hiring decision. End-of-session generation failures are recorded without losing the completed interview. Code snapshot retention is included in company retention previews and cleanup.
