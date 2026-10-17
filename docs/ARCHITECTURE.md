# HireLens implementation plan

Current flow: a company assigns a published job, HR accepts and manages all of that job's applicants, then schedules selected candidates. Company candidate allocation remains optional. Company and assigned HR can finalize report decisions. The latest scope and operational limits are in `PROJECT-STATUS.md`.

`ai-interview.ts` orchestrates one adaptive question at a time with a leased turn lock. `assessment.ts` validates report rubrics/references, separates measured code results, and fingerprints source evidence so stale assessments are visible. `integrity.ts` implements transparent review-priority rules independently of performance scoring. `interview-batches.ts` validates a selected group and creates separate appointments with idempotent request IDs and rollback on caught write failures. CodeRevision stores throttled editor snapshots. None of these modules supplies missing external credentials or claims trained integrity prediction.

React + Vite is the browser application. Express owns authentication, validation, tenant permissions, PDF processing and all provider calls. MongoDB is the source of truth. Socket.IO authenticates the same opaque cookie session and authorizes each interview event. WebRTC carries participant media directly. Judge0 isolates untrusted programs. The browser processes consented webcam frames locally.

Collections: User (role/profile/company), Company (owner/public profile), Session (hashed token/expiry), Invitation (company/HR/status), Resume (owner/immutable PDF/text), Job (company/requirements/HR requests/instructions), Application (unique job + candidate/snapshot/status/match/single assigned HR), Interview (participants/schedule/questions/answers/notes/consent/drafts), Submission (actual provider results), MonitoringEvent (metadata), Report (review/release/decision), Notification (recipient/read state).

Checklist: 1 foundation/auth → 2 profiles/invitations → 3 jobs/applications → 4 resume evidence → 5 scheduling → 6 interview room → 7 coding → 8 AI/STT → 9 consent/monitoring → 10 reports → 11 verification → 12 student documentation.

Security boundaries: server checks role and company/job assignment on every private resource; hidden tests never leave the server; candidates only see explicitly released reports. Cookie tokens are random, stored hashed, HttpOnly and SameSite=Lax; production adds Secure and rejects cross-origin mutations. Passwords use bcrypt. Application snapshots and resume revisions are immutable. AI outputs are advisory and schema-validated; technical evidence and monitoring remain separate.

UI direction: a calm light workspace, forest green primary actions, an interview-focused overview, clear status chips, candidate cards, and a focused two-person interview room. All statistics are derived from database records. Seeded content is marked sample data.

## Company increment — 2 October 2026

`server/onboarding.ts` registers the existing authentication endpoints plus verification/OTP routes; `server/company.ts` extends profile and overview APIs; `server/recruitment.ts` manages multi-HR requests, explicit responses and candidate distribution with per-job database serialization. CompanyVerification stores expiring hashed receipts; OtpChallenge stores keyed code hashes and atomic per-account send/attempt counters. Existing collections retain their relationships. `src/AuthPage.tsx`, `company-fields.tsx`, and `company.tsx` reuse the shared UI/API/auth context. Company routes have a distinct overview and navigation; HR/candidate overviews remain preserved. See `COMPANY-ONBOARDING.md` for contracts and migration behavior.

## Local feature completion

AccountAction stores only hashes of expiring single-use recovery/contact tokens. Notification retains the existing in-app record plus per-channel outbox claims, attempts, leases and delivery states; verified contact preferences determine eligibility. CodingProblem is company-scoped and copied into a select:false Interview.problemSnapshot at scheduling. Interview round indices/counts preserve separate schedules and reports while the job workflow lock serializes advancement and report updates. AuditEvent records authenticated mutation metadata, never request bodies. RetentionPlan scopes an expiring explicit confirmation to exact company artifact IDs. Optional Redis provides shared HTTP rate counters and Socket.IO Streams signaling; sessions and authorization remain in MongoDB. See SETUP-REMAINING.md for the remaining operational validation and retention boundaries.
