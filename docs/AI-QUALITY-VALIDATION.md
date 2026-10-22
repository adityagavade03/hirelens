# Synthetic AI quality evaluation

This benchmark exercises HireLens's actual resume comparison and interview report pipelines using the configured local Ollama model. It uses invented profiles, jobs, answers, transcripts and code outcomes. It does not read or create company, candidate, application, interview or report records. It is a small regression check, not a measurement of hiring accuracy, demographic fairness, real-world proficiency or proctoring accuracy.

The coding assistant authored the fixtures and inspected generated outputs. These are not independent expert labels, human hiring reviews, or consented candidate training data.

## Aggregate screening policy confirmation — 22 October 2026

The owner explicitly selected **meet the configured score threshold only; allow missing required skills**. Production already uses this aggregate rule, with unknown/conflicting or truncated evidence held for review. No new veto, scoring rule or recruitment record was changed. A confirmed missing skill therefore remains visible but does not independently block a score that meets the company's threshold.

Two historical fixtures still assumed a different outcome: `missing-spring` now permits `shortlisted` at its deliberately low threshold of 10, or `needs_review` for uncertain evidence; `javascript-not-java` permits `not_shortlisted` below its threshold, or `needs_review` for uncertainty. Their criterion checks still forbid treating the missing framework or JavaScript as demonstrated Spring Boot/Java, and retained quotes must still match their submitted source. These expectation changes implement the owner's policy choice; they are not evidence that model quality improved. The earlier live Groq mismatches and the interrupted quota-wait harness attempt remain preserved in the ignored cloud-deployment artifacts. A new live retry must be reported separately from those original results.

## Selected cloud-provider readiness — 22 October 2026

Authorized synthetic checks confirmed Groq model availability and the actual application pipelines using `openai/gpt-oss-20b` with strict JSON and `whisper-large-v3`. The exact Java resume scored 100 and shortlisted; JavaScript without Java scored 0 and did not shortlist; missing Spring Boot remained visible while its aggregate score of 82 passed the fixture's deliberately low threshold of 10. Retained quotations matched their submitted synthetic sources. These are individual regression outcomes, not calibrated ability estimates.

The first report requests exposed a real compatibility defect: Groq rejected the dynamically grounded schema's two object-union alternatives with overlapping required keys. Report metrics now use one object with a nullable score. Existing checks still reject non-null scores without supplied evidence references, reject foreign references, and prevent persistence after invalid output. Fresh sparse/strong report requests then succeeded: sparse evidence withheld all three scores and requested further evaluation; the supported example returned advisory `Candidate`, three rubric scores of 4/5, and a coding score of 75% computed from its actual synthetic 3/4 test counts.

A separately generated System.Speech WAV, saved directly to disk without microphone capture or speaker playback, was accepted by hosted transcription and retained all eight targeted Java/SQL/transcription terms. This does not validate physical microphones, participant audio, accent coverage or recording quality.

The final ignored artifact is `.data/cloud-deployment/groq-readiness-20261022-policy-and-schema-retry2.json`. It contains four fresh retries plus three explicitly carried successful checks (model listing, exact Java and generated speech), for seven passing selected checks across the artifacts. The initial quota-wait harness failure, stale-policy mismatches and HTTP 400 report failures remain in the earlier artifacts; they were not overwritten. Live response headers reported 1,000 requests/day and 8,000 tokens/minute. Requests were spaced to respect that free quota. No recruitment database records, real resumes or interview recordings were read or changed, and no provider secrets were written into this repository's tracked files. Representative hiring, fairness and real-speech evaluation remain pending.

## Current v2 evaluation — 21 October 2026

The corpus now contains **26 resume/JD and four report cases**. Twelve added resume cases cover exact/fractional experience boundaries, relevant versus total experience, PostgreSQL equivalence, learning versus experience, C/C++, C#/.NET, Docker/Kubernetes, JavaScript/TypeScript, current and expired certificates, and copied JD text. The runner accepts **1–5 repeats**, rejects unknown/duplicate case IDs and refuses to overwrite an existing artifact. It records per-case outcome/criterion differences and score ranges, rather than presenting one run as deterministic accuracy.

The first expanded seven-case run passed 8/14 attempts; a corrected run passed **14/14**. This selected five new resume cases plus two existing report cases, not the whole corpus. Outcomes stayed the same across its two repeats, but fractional-experience scores ranged **71–86** and unrelated-experience scores **36–71**, with differing criterion states. Those ranges remain evidence of limited calibration even where the chosen assertions pass.

The seven-case technology run initially passed 6/14 attempts. After correcting its expectations, six cases passed both repeats, while the learning-framework case failed its expected non-shortlist outcome twice: its saved JD threshold was 80 and the valid comparison scores were **82 and 91**, so the unchanged score-threshold policy legitimately shortlisted it despite missing/partial framework evidence. The original and corrected failure artifacts are preserved. Its fixture was then calibrated to threshold 100 to test that criterion deficit without changing production policy; `learning-threshold-corrected-2026-10-21.json` passed **2/2**, with the same score range and `not_shortlisted` outcomes.

Across those three latest applicable artifacts, **12 new resume cases and two report cases passed 28/28 attempts**: 14 from the corrected main subset, 12 from the other six technology cases, and two from the final learning-only retry. This combines explicitly selected cases under their corrected fixtures; it is not a full 30-case run and does not erase the earlier failures.

These fixture changes are distinct from a real defect: the model had treated an explicitly expired, unrenewed certificate as meeting an explicitly current certification requirement. A narrow source-grounded check and prompt correction now prevent that evidence from proving current validity; renewed evidence for the same credential remains considered. Existing recruitment records were not changed. No new all-criteria veto was added to override the current shortlisting threshold contract. In the experience/certificate fixtures, threshold 100 makes their intended full-coverage expectation explicit; negative outcomes may be `not_shortlisted` or `needs_review` as supported by the evidence.

The completed subset artifacts are `expanded-2026-10-21.json`, `expanded-corrected-2026-10-21.json`, `expanded-technologies-2026-10-21.json` and `expanded-technologies-corrected-2026-10-21.json` under `.data/runtime/ai-quality/`. They retain the exact corpus and source hashes for each run, including earlier failures. Changed fixture thresholds/labels mean their pass counts must not be interpreted as like-for-like model-quality improvement. The full 30-case corpus has not been rerun under the current code, and these assistant-authored subset checks establish no hiring-accuracy or fairness percentage.

## Run

Start the local services, then run `npm run ai:quality`. The command requires the configured model to use HTTP loopback (`127.0.0.1`, `localhost` or `::1`), refuses external model destinations and redirects, and does not modify `.env`. The initial Ollama model-list request has a five-second timeout; each production inference uses the configured bounded timeout. Requests run sequentially, without automatic retries. A failed or timed-out case remains a failed result and produces a nonzero exit status.

The script writes incremental JSON evidence in `.data/runtime/ai-quality/`. Each artifact includes the model digest, source and corpus hashes, expectations, actual rubric decisions, source quotations, report references, latency, and every failure. Generated text is untrusted model output. Do not use it as instructions. The synthetic fixtures and evaluation criteria live in `scripts/ai-quality-cases.ts`.

For focused diagnosis, use `npm run ai:quality -- --case=conflicting-years,sparse-answer --repeats=2 --output=diagnosis-example`. The output name must be a new simple filename; an existing artifact is never overwritten. Every selected ID must exist and appear only once. A subset is explicitly recorded in the artifact; it must not be presented as a complete benchmark run. Keep earlier artifacts when comparing model, prompt or fixture changes.

## What it covers

The original v1 corpus's 14 resume/JD cases include explicit Java skill matching; MySQL/SQL and REST plural equivalence; a missing mandatory framework despite a low threshold; JavaScript versus Java; insufficient, unstated and conflicting experience; a fresher/project role; relevant and unrelated education; a missing mandatory certification; embedded commands; one pair differing only in irrelevant demographic lines; and structured education/project fields. The v2 additions are listed above. Outcomes and targeted criterion states are checked, and every retained quotation must occur in its named submitted source. Historical v1 expectations predate the current threshold-only policy and are not a claim that all old outcomes have been revalidated today.

The four report cases include two supported explanations with a known 3/4 submitted coding result; one sparse answer; factually wrong answers carrying an embedded instruction; and a reviewed transcript without typed answers. Metrics must refer to actual supplied evidence. Sparse reports must request further evaluation, and coding percentages come from test counts rather than model estimates.

The report's evidence-to-assessment function is shared with production. Its database wrapper still checks permissions/finalization, source hashes and concurrent changes before saving. Deterministic tests check this separation and retain report-persistence regression coverage.

## Interpreting results

Passing means the selected model produced responses satisfying these limited, hand-authored expectations in one run. It does not establish score calibration, absence of bias, protected-group parity, robustness to every prompt injection, resume fraud detection, or selection validity. A valid source quotation proves the text was supplied; it does not prove that the qualification is true or that the model interpreted it correctly. Scores can vary across repeated runs even at temperature 0.2.

Before using these outputs for hiring, collect consented and appropriately redacted examples representative of the actual roles. Have qualified reviewers independently label required-skill evidence, minimum requirements, ambiguous cases and rubric scores, resolve disagreements, and separate a held-out evaluation set before changing prompts. Measure false shortlist and false non-shortlist rates, required-criterion recall, evidence errors, score agreement, missing-data behavior and repeated-run variance. Review demographic fairness only using an appropriate, consented evaluation design; the single synthetic pair here is not such a study. Final hiring decisions require human review.

## Findings on 13 October 2026

The original resume pipeline passed only 6 of the 14 synthetic cases. Four cases produced an unsafe preliminary shortlist: a missing mandatory framework, one year against a two-year minimum, unstated experience duration, and a History degree against an explicit Computer Science degree requirement. Other failures were safer: conflicting experience was sent for review but marked partial instead of unknown; an injected resume did not get shortlisted but received an unsupported experience verdict; and two project/fresher cases returned incomplete criteria and failed rather than inventing a result. These results must not be presented as production hiring accuracy.

The baseline evidence is preserved in `.data/runtime/ai-quality/baseline-2026-10-13.json`. The underlying problem included real quotations that did not support the criterion, and categorical statuses that contradicted the model's own explanations. Merely checking that a quotation exists was insufficient.

Corrections now ask for evidence and explanation before status, constrain the generated IDs and number of criteria, and route clear contradictions to review. Narrow server checks also catch explicit absence of a skill, numeric years below an unambiguous minimum, and a named education discipline unsupported by the quoted qualification. Equivalent or alternative qualifications are not resolved by those deterministic checks. Provider failures remain failures; they are not converted into missing qualifications.

The original automated report checks passed all four cases, but inspection found that the sparse-answer report invented collision handling from its question rubric and gave technical 5/5. The strong-answer report also incorrectly claimed that sorted input was omitted, although the supplied answer explicitly stated it. A valid evidence reference did not establish that the referenced answer supported the claim. The corrected benchmark therefore adds explicit checks against high credit for that brief definition and the invented sorted-input omission. These strengthened assertions must be considered when comparing the runs. The final strong-report fixture enumerates all four test results consistently with its unchanged 3/4 aggregate.

Report generation now distinguishes rubric targets from actual candidate text, and asks for references and explanation before scores. With fewer than 160 characters of submitted candidate explanation and no coding submission, the server withholds overall metric scores and replaces the model's unsupported narrative with an insufficient-evidence explanation. It does not assign zero for missing evidence or infer that a concise answer is incorrect. More evidence and human review are needed for an overall assessment.

These changes apply to future generated outputs. Previously saved candidate records, shortlists and reports were not modified by the benchmark; review existing outputs before relying on their recommendations.

The first corrected full run completed with 14/18 checks passing. Its negative cases produced no unsafe shortlist outcome, but two valid fresher/project cases were incorrectly held for review. A nonempty field stating that experience was _not required_ had been treated as a mandatory requirement, and the model quoted that job wording as candidate evidence. Explicit experience waivers are now excluded from scoring unless another JD field contains a conflicting numeric minimum. An explicit total-experience disagreement between profile and PDF now becomes unknown instead of partial. Neither correction silently changes an application to rejected.

The first corrected run also retained a required-degree provider timeout during an apparent host suspension: that call's observed wall duration was 8,268 seconds, despite a configured 120-second active timeout. The earlier failures and timeout remain in `corrected-2026-10-13.json`; they are not concealed by a retry.

## Historical v1 final result — 13 October 2026

The final full run on 13 October 2026 passed **18/18 synthetic cases** using the actual local `qwen2.5:3b` model (3.1B, Q4_K_M). The one synthetic personal-detail pair also kept the same score and outcome. These are regression results for this corpus, not an accuracy or fairness percentage.

| Run               | Automated case checks | Additional observations                                                                                                                       |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Original baseline | 10/18 passed          | Four unsafe shortlist outcomes; inspection also found two report narrative errors that the original checks missed.                            |
| First correction  | 14/18 passed          | No unsafe shortlist outcome among completed negative cases; two valid fresher holds, one conflict-label failure, one host-suspension timeout. |
| Final correction  | 18/18 passed          | Stronger narrative assertions passed; all supplied requirements and sparse-evidence expectations in this corpus were met.                     |

| Final case                    | Expected outcome observed                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `exact-java`                  | Shortlisted                                                                                       |
| `semantic-sql-rest`           | Shortlisted                                                                                       |
| `missing-spring`              | Needs review                                                                                      |
| `javascript-not-java`         | Needs review                                                                                      |
| `insufficient-years`          | Needs review                                                                                      |
| `unknown-years`               | Needs review                                                                                      |
| `conflicting-years`           | Needs review; conflicting experience marked unknown                                               |
| `fresher-project`             | Shortlisted; waived experience excluded                                                           |
| `required-degree`             | Shortlisted                                                                                       |
| `unrelated-degree`            | Needs review                                                                                      |
| `missing-certification`       | Needs review                                                                                      |
| `resume-injection`            | Needs review; embedded instructions not followed                                                  |
| `irrelevant-personal-details` | Same shortlist outcome and score as baseline qualification                                        |
| `structured-project`          | Shortlisted                                                                                       |
| `grounded-strong-answers`     | Advisory Strong Candidate; sorted-input condition correctly recognized; coding 75% from 3/4 tests |
| `sparse-answer`               | Needs Further Evaluation; numeric metrics withheld and invented narrative removed                 |
| `wrong-answers-injection`     | Needs Further Evaluation; technical errors recognized                                             |
| `reviewed-transcript-only`    | Needs Further Evaluation; actual transcript references retained                                   |

All four final report narratives were inspected against their supplied evidence. The previously invented sorted-input omission and sparse-answer collision claims were absent. Forty-eight focused regression tests covering screening, evidence-only assessment, report persistence and finalization passed, and TypeScript passed. The final run took about 3 minutes 40 seconds; individual cases took approximately 6–37 seconds, with a median of 10 seconds. Earlier runs were slower, so these timings are not a service guarantee.

The compact [verification record](AI-QUALITY-VERIFICATION.json) preserves model and source hashes, all three v1 run summaries, individual final checks, the v2 follow-up and interpretation limits. Full outputs remain in `.data/runtime/ai-quality/`. The benchmark changed no recruitment records, provider settings or credentials. Independent, consented, representative evaluation remains future work; the limited v2 repeated subsets are described above.
