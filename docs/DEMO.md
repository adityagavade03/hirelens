# Five-minute project demonstration

This is an optional demonstration guide. The local fictional workspace was removed on 5 October 2026, and demo mode is disabled by default. These sample-account steps apply only to a separate database explicitly seeded in demo mode; normal startup does not recreate them.

1. **Company workspace:** sign in with the sample company account. Point out that the counts come from MongoDB and that sample records are labeled. Open Jobs and show a published role, skills and assigned interviewer.
2. **Candidate application:** in a separate browser/profile, register a candidate, complete Profile, and upload a text-readable PDF. Browse jobs and apply. Show the saved application stage. Apply again to demonstrate duplicate prevention.
3. **Evidence review:** sign in as HR after accepting the job and receiving an assigned candidate. Open Applications, review the AI evidence, weighted score and automatic shortlist result. A validated score meeting the job threshold qualifies even with confirmed skill gaps; review those gaps before interviewing. Explain that the score is not a probability of hiring success.
4. **Interview:** schedule the candidate within the next 15 minutes. Open the room in two separate browser sessions for the candidate and assigned HR account. The candidate reviews monitoring consent, both check devices, and both join. Camera/microphone tests require available hardware and browser permission. Cross-network calls require TURN.
5. **Answer and code:** submit a typed technical answer. Show its rubric. Generate AI feedback only if a provider is connected. Enter a complete solution in the coding exercise. Execute only when Judge0 is configured; otherwise demonstrate the honest configuration state. Show submission history.
6. **Human report:** HR saves private notes and ends the session. Review answers, feedback, coding results, and the separate monitoring timeline. Record a human decision and explanation, finalize and release the report. Download the PDF. The candidate sees released feedback but not private notes or monitoring events.
7. **Personal practice:** open Practice studio as the candidate. Choose a track, difficulty and topics. Submit a practice answer and finish the session. Show that it has its own private report and does not affect any hiring application.

## Simple module explanations for a presentation

| Module | Explain it like this |
| --- | --- |
| React frontend | This is what users see and click. It sends requests to the server. |
| Express API | This is the gatekeeper. It validates inputs, checks permissions and performs actions. |
| MongoDB + Mongoose | MongoDB stores our records. Mongoose defines the shape of each record and important indexes. |
| Authentication | A random session cookie proves the user signed in. The server stores a hash of it and checks its expiry. Passwords are hashed, never stored as plain text. |
| Company isolation | Each private resource belongs to a company and authorized job. Knowing another record’s ID does not grant access. |
| Resume processing | We preserve the submitted PDF and application details, compare their evidence with the JD using an LLM, and show the weighted score and skill gaps. |
| Interview scheduling | We store one UTC time and an IANA timezone. The browser displays the time locally. |
| Socket.IO | It exchanges authorized connection messages between the two participants. |
| WebRTC | It carries the audio and video. TURN is a relay when a direct connection fails. |
| Monaco + Judge0 | Monaco edits the code. Judge0 executes it in a separate sandbox and returns test results. |
| AI adapter | It sends technical context to a chosen provider and validates the response before saving it. No credentials are in browser code. |
| Speech adapter | It turns an explicit audio recording into editable text. The user reviews the text before submission. |
| Monitoring | With consent, it records browser-event metadata and local face counts. It provides context, not proof of cheating. |
| Reports | They collect evidence. HR adds the final decision, and decides what feedback to release. |

## Good answers to common examiner questions

**Is the AI deciding whom to hire?** No. A staff member records the decision and explanation. AI feedback is advisory.

**Is the resume score a prediction?** No. Current applications use a weighted LLM evidence comparison against the saved JD. Validated scores at or above the company threshold qualify for automatic shortlisting even with confirmed missing skills, which remain visible for HR review. Uncertain evidence needs review. Older keyword results are labeled separately.

**What happens without API keys?** Core hiring and typed practice still work. The missing integration displays a configuration message. No output or assessment is invented.

**Can the app prove cheating?** No. Browser focus cannot identify other apps. Face-count and focus events are fallible context for human review.

**What did you actually test?** Read `docs/TESTING.md`. Automated tests use real MongoDB and test isolation. External provider tests use explicitly labeled contract fixtures. Do not claim those are live-provider or hardware tests.

**What would you improve next?** Add more curated coding questions, HR/candidate email verification and password reset, audit logs, an accessible scheduling calendar, retention controls, OCR, live verification/email adapter validation, and multi-server deployment support. Each should have its own tests before being called complete.

## Company workflow added 2 October

Choose Company at entry and use the sample sign-in for an unverified, clearly labeled demonstration. Open the dedicated overview and Company profile; create a full job description as draft; publish after confirmation; view its applications; shortlist; choose HR & assignments; assign an available team member. Sign in as HR, open the assignment notification and accept it. Candidate applications, scheduled interviews and reports still use their existing workflows. For real company onboarding, configure the verification and email adapters, verify official details, register, sign in, enter the emailed code and open the company overview. Never present the sample shortcut or contract fixtures as a successful live company check.

## Current walkthrough — latest HireLens requirements

Use this flow instead of any historical company-shortlist-first sequence above. Company creates/publishes a job and requests HR before any candidates are needed. HR accepts from My assignments; applicants for that job then become visible. HR reviews resumes and the matching breakdown, shortlists, and schedules directly or uses Interview batches on job details. Each candidate gets a separate room. Choose human or AI-assisted facilitation; AI functionality requires a configured provider. Reports combine the saved evidence, actual code pass rate, optional AI assessment, and a separate integrity review. Company or assigned HR makes the final decision. Candidates see only released feedback and their own performance history. See PROJECT-STATUS.md for operational limits.
