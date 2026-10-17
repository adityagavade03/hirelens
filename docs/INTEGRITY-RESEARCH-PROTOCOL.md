# Integrity research collection and evaluation

Status on 13 October 2026: the offline collection validator, trainer and evaluation workflow are implemented. **No real consented, independently reviewed training dataset was found. No custom model has been trained on real interviews or activated.** HireLens still uses its existing transparent review rules, separately from technical scoring. Unit-test examples are synthetic and establish software behavior only.

## Before collecting a session

Name a responsible researcher, two independent reviewers and a third adjudicator. Write and approve a versioned collection protocol before inviting participants. Specify the study purpose, observation procedure, voluntary recruitment, eligibility, device/browser coverage, retention dates, access controls, withdrawal contact and procedure, and the evidence available to reviewers. Freeze the labeling rubric and analysis plan before examining held-out results.

Use volunteers for a separate research exercise. A job application, interview recording consent, speaker-analysis consent or permission to test a laptop's camera is **not** research consent. Refusal or withdrawal must not influence recruitment. Do not import existing interviews, resumes, recordings or proctoring events into this workflow automatically.

Give each participant a clear notice, in a language they understand, covering:

- Who is responsible and how to contact them.
- That this is optional research into whether an observation needs human follow-up; it will not determine cheating or employment suitability.
- Which event rates and monitoring coverage will be retained and why; whether original evidence is separately collected for independent review; who may access it.
- The distinction between this feature-only dataset and any separately consented recording or source evidence. This dataset cannot contain audio, video, face images, gaze coordinates, speaker embeddings, resumes, names, email addresses, demographic attributes or hiring outcomes.
- The retention deadline, local storage location, access controls, deletion process, permitted research uses, and any planned transfers. Do not promise anonymization: pseudonymous records may still be linkable through a separately protected key.
- How to withdraw, how sessions and derived artifacts will be removed or rebuilt, and any genuine limits on undoing already published aggregate findings. Do not promise unqualified deletion if the actual protocol cannot provide it.

Record a real affirmative consent with the notice/protocol version and timestamp **before** collection. Keep the actual consent record and participant-reference mapping in separately access-controlled storage. The dataset contains only a pseudonymous consent reference, purpose scope, timestamps and withdrawal status. A typed `true` or generated ID is not evidence of real consent. Before every validation/training run, a human must reconcile the current consent register, expiry, withdrawals and permitted uses.

## Recording observations and review labels

1. Assign stable pseudonymous participant and interview references before observing outcomes. Every session from the same person must keep the same `participantGroup`, including sessions on different devices. Never change IDs to improve a split or a score.
2. Follow the same versioned observation procedure. Record the complete session duration (60 seconds to four hours), monitoring availability and only the six allowed features. Use the fixed whole-session duration as the denominator for event rates; `coverageFraction` records the fraction of that duration during which the **required monitoring channels were all available**. Keep the same definition across sessions. Missing or unmeasured counts cannot be represented as observed zero; exclude incomplete measurements and record the exclusion outside the training table. The validator rejects zero coverage and flags coverage below 80% for review; 80% is an engineering prompt, not an accuracy claim or misconduct threshold.
3. Keep a recruitment/collection log containing invitations, participation, exclusions and reasons in protected study records. This allows a human to inspect selection bias, withdrawal and missingness. The JSON schema cannot establish whether a dataset is representative or a source record is genuine.
4. Give the two reviewers the same permitted evidence and rubric. They submit labels independently, before seeing the other's label or any model/rule score. Record each original label, pseudonymous reviewer ID, timestamp and evidence references. Never rewrite original disagreement as agreement.
5. Use `needs-follow-up` only when the pre-written rubric supports a concrete unresolved observation requiring human clarification. Use `no-follow-up` when adequate evidence supports no such follow-up. Reviewers can select `insufficient-evidence`; missing camera coverage, an unfamiliar environment or a face/gaze/speaker estimate alone does not establish misconduct.
6. A distinct third reviewer adjudicates disagreement or insufficient evidence after reading both reviews and supporting context. Record their result and references. If evidence is still inadequate, exclude the session rather than invent a binary label. The training row must contain a final binary label consistent with agreement or adjudication.

Consent expiry and withdrawals apply to every session covered by that record. Keep an artifact-to-dataset provenance log; delete/rebuild affected research artifacts after a withdrawal, and retain only the minimum permitted administrative audit evidence. The software cannot discover withdrawals in a separate register by itself.

## Prepare and inspect the dataset

Run these commands in the project directory. Store real data under a private ignored directory, not in source control or chat. Review the machine's filesystem permissions; a requested private file mode alone is not a substitute for Windows access controls.

```powershell
npm run integrity:research -- --template .data/research/collection.json
npm run integrity:research -- --schema
npm run integrity:research -- --validate .data/research/collection.json .data/research/preflight-001.json
```

Create the private parent directory first. The template deliberately has **zero rows and no invented consent**. Replace its protocol placeholders with your real approved procedure, then populate records using the complete schema from `--schema`. A zero-row template validates structurally but reports `readyToTrain: false` and exits with code 2. Legacy version-1 rows are not silently upgraded: supply the actual original consent and independent review evidence under schema version 2.

Preflight checks schema allowlists, duplicate interviews, consent status/scope/protocol/dates, reused consent identities, review chronology, distinct reviewers, independent adjudication, label consistency and monitoring coverage. It reports label counts, participant counts, split sizes, initial reviewer agreement and Cohen's kappa separately for each reviewer pair. Undefined kappa is `null`, not an invented zero. Reviewer agreement is not proof of label truth.

At least 100 reviewed interviews and 20 participants, with at least ten examples of both labels in each partition, are required to run. These are safeguards against trivial runs, **not a sample-size justification or sufficient accuracy validation**. The report may be structurally ready while raising important quality warnings. Review those warnings and source provenance before fitting anything.

## Train and evaluate after legitimate collection

```powershell
npm run integrity:research -- .data/research/collection.json .data/research/model-001.json
```

The script refuses to overwrite output files. It records the dataset and implementation SHA256 values, protocol reference, current consent-check time, fixed hyperparameters and preflight results. Archive the corresponding protocol, dependency lockfile, code version and protected source/consent audit with the artifact for reproducibility.

The split sorts participant IDs by a fixed versioned SHA256 hash, allocating 25% of participants to the holdout. File ordering cannot alter the split or training order. All of a participant's sessions stay together. Normalization is fitted only on training sessions. Threshold 0.5, regularization, iterations and learning rate are fixed before evaluation. Do not reroll participant IDs, collect selectively to force a desired result, choose a threshold on the holdout, or repeatedly alter the model against these results. Lock the dataset/version and use a fresh prospective study after changes motivated by this holdout.

The artifact reports confusion counts, precision, recall, false-positive rate, balanced accuracy, F1, Brier score and five fixed calibration bins. A constant training-prevalence predictor provides a baseline on the same holdout. Undefined metrics are `null`, never reported as success or zero error. Probability estimates are model outputs about follow-up labels, not probabilities that someone cheated.

Uncertainty uses 1,000 deterministic bootstrap resamples of **participants**, preserving each participant's sessions together, with 95% percentile intervals and a defined-replicate count for each metric. This reflects variability in the observed held-out participants; it does not include training, label, selection or deployment uncertainty. Few participants can produce unstable or zero-width intervals even when real-world accuracy is unknown.

Device and browser slices include counts and descriptive metrics, with small-sample warnings. They are not evidence of fairness or accuracy across populations. Demographic data is excluded from this schema; any legally and ethically appropriate fairness study needs a separately designed protocol and controlled analysis. Independent prospective evaluation, source/annotation audits and realistic device/environment coverage remain necessary.

Every artifact has `deploymentApproved: false`. HireLens does not load these files. Do not connect a research artifact to hiring decisions, technical scores or automatic accusations. A human research review and separate deployment design would be required before considering any operational use.

## What remains human work

Recruit volunteers, provide the actual notice, obtain and maintain real consent, run diverse real-device exercises, capture permitted source evidence, perform two independent reviews and any adjudication, inspect exclusions and disagreement, and reconcile withdrawals. Once a legitimate dataset exists, run preflight and address blockers before training. No script can replace these steps or establish them from a Boolean field.
