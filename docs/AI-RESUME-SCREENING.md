# Automatic resume screening

Implemented for the 8 October 2026 HireLens requirements. New applications use the configured LLM, not the previous keyword matcher.

## Candidate workflow

1. Open **Resume & profile**. Enter skills, relevant experience years and separate education, employment, project and certification entries. Achievements are optional. Existing free-text details are retained in the corresponding entry's details field.
2. Upload a PDF up to 5 MB. Uploading extracts PDF text (or uses the existing OCR service) but does not overwrite form entries. Save form changes before applying.
3. Open a job and apply. The application immediately saves a profile snapshot, PDF reference, job requirements and the company's threshold. Applications shows **Queued**, **Screening**, **AI resume match**, or **Unavailable**. It refreshes while screening is pending.
4. A completed result shows criterion explanations, verified source quotations, the match score and the shortlist outcome. Later profile/job edits do not change an existing result.

## Company workflow

Set **Minimum AI match score (%)** when creating or editing a job; the default is 80. Put the job's main skills in Required skills and optional skills in Preferred skills. These labels affect the weighted comparison, not a separate all-skills gate: confirmed missing required skills lower the overall score but do not block shortlisting when the validated score still meets the threshold. HR can review each gap. State experience, education, certifications and other job-relevant requirements clearly in the JD. The saved threshold and requirements apply to new applications.

The LLM compares skills semantically, evaluates relevant experience, reads education, projects and certifications, and checks the remaining JD requirements. It receives named evidence sources, with contact details reduced and instructions to ignore personal/protected characteristics and embedded commands.

The server validates the response and calculates the score: met = 100%, partial = 50%, missing/unknown = 0%. Weights are required skills 50, experience 20, education 10, projects 5, certifications 5, preferred skills 5 and other JD requirements 5. Categories not requested in the JD are excluded and weights are normalized. Source quotes must contain text and occur in the actual submitted evidence; a real quote attributed to the wrong field is associated with its actual source. Blank quotations fail response validation. Invented quotations become uncertain evidence.

The live synthetic benchmark exposed positive statuses inconsistent with the quoted evidence. Structured generation now places evidence and explanation before the status, and constrains the response to actual criterion IDs and count. Conservative server guards route contradictory explanations, explicit absence of a skill, an impossible explicit numeric experience minimum, and unsupported named education disciplines to further review. These guards do not reject applicants or establish general semantic correctness. Broader cases, observed failures and remaining limits are documented in [AI quality validation](AI-QUALITY-VALIDATION.md).

An application becomes **Shortlisted** automatically when its evidence-validated weighted score is at least the saved job threshold (80% by default), no criterion is uncertain, and the input was not truncated. Confirmed missing criteria reduce the score and remain visible; they do not add an undisclosed veto above the configured threshold. A reliable result below the threshold has the `not_shortlisted` outcome and the existing **Rejected** application stage. Uncertain or conflicting evidence stays **Under Review**; unavailable AI retries without rejecting the candidate. Shortlisting is preliminary and is not a job offer.

Shortlisted applications enter automatic interviewer allocation. Eligible HRs must belong to the company, accept the job invitation, be available, and have spare active candidate capacity. The least-loaded HR across company jobs receives the next applicant; ties use the job workload and stable HR ID. Capacity defaults to 20 and is adjustable from 1 to 500. Shortlisted, scheduled, and completed applications awaiting a final decision count toward capacity. Existing assignments and interviews never move automatically. If no eligible HR has capacity, the saved application remains in a pending queue, with a reason and an administrator notification. Allocation retries when an HR accepts, changes availability/capacity, or every 15 seconds in the existing screening worker. Company reviewers can retry or manually reassign unscheduled candidates. Both the candidate and assigned HR receive in-app notifications; external delivery still depends on configured providers and account preferences.

## Reliability and existing applications

Screening is a MongoDB-backed queue, started by `server/index.ts`. Workers atomically lease one application at a time; expired leases are reclaimed after a restart. Provider failures retry automatically up to three attempts, with delays. After a failed result, the candidate or authorized hiring team can select **Retry AI screening**. No keyword result is substituted as an AI result. A late result cannot overwrite a reviewer change or a scheduled interview.

Older applications are labeled **Legacy keyword match** and are not silently rescored. Eligible older applications can use **Run AI screening**, which saves the current JD for their first LLM assessment. Completed or interviewing applications cannot be automatically rescored by that endpoint.

Long evidence is bounded for the local model. If any resume section exceeds the input allowance, automatic shortlisting is disabled and the result explains the need for complete review. AI extraction, semantic judgments and self-reported qualifications can be wrong; a verified quotation is not independent verification of proficiency.

## Setup and verification

The existing `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` configuration is reused. This laptop uses local Ollama/Qwen. Run `npm run local:start` after a restart. Production must run the API entry point so the screening worker is active.

- `npm run check`: build, TypeScript and regression tests, including durable queue behavior, cross-account access, status races, snapshots, unsupported evidence and structured resume validation.
- `npm run resume:check`: calls the configured real model with a synthetic Java developer profile. It checks MySQL/SQL and REST APIs/REST API equivalence and three years against a two-year requirement. It creates no application or account.
- Browser verification uses a separate temporary database and port 5174. Normal company, candidate and recruitment records remain unchanged.

Account security now lives in Settings. The application detail view has one screening explanation and one interview-rounds section. Job editing has one interview-criteria field. The guided resume form shares the existing light/dark tokens and adapts to mobile and tablet widths.
