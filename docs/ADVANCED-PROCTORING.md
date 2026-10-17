# Advanced observations and research limits

## Experimental calibrated gaze preview

Candidate device setup now offers a separate opt-in eye-image calibration. It uses the existing local MediaPipe Face Landmarker to locate eye image patches, then fits ridge regressions to nine screen targets. Five additional target presentations validate predictions after fitting; those samples are never added to training. At least six clear samples per target are required. The preview is enabled only when median validation error is at most 8% of the normalized screen diagonal and every target's median error is at most 15%. These are conservative engineering gates, not validated clinical or research accuracy specifications.

Only a broad screen region is shown to the candidate. Images, learned weights and validation samples stay in the browser tab. No images, coordinates, gaze events or scores are uploaded. Out-of-bounds predictions are unavailable, not evidence of looking away: calibration covers only the screen. Camera loss/change, resizing and hiding the page invalidate calibration. Stopping the optional feature or leaving removes the worker and model. Calibration cannot start during a live interview.

This is an experimental local preview, not production gaze proctoring. Lighting, glasses, eye movement, camera quality, head movement and changed posture may invalidate predictions without being detected. Physical-device accuracy and independent usability validation remain pending. It is not attention, emotion, identity or cheating detection. It contributes no integrity points and cannot affect technical scores or shortlisting.

The approach uses eye appearance and calibrated target observations; it does not relabel head direction or iris position as gaze. [MediaPipe's documentation](https://chuoling.github.io/mediapipe/solutions/iris.html) explicitly distinguishes iris tracking from looking-location inference. The [WebGazer research implementation](https://webgazer.cs.brown.edu/) describes eye-image regression against screen locations; HireLens's small implementation is experimental and is not a claim to reproduce WebGazer's measured results. The existing [Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) is used only to locate eye patches, with processing in a worker and expression outputs disabled.

## Local speaker clustering

The optional speaker service uses actual pretrained Sherpa ONNX segmentation and speaker embeddings on CPU. It estimates clusters within one saved clip; it never enrolls voices or identifies people. Whisper silence filtering remains independent and is never described as speaker detection.

Install into the existing private speech environment:

```powershell
.data/speech/venv/Scripts/python.exe -m pip install -r scripts/diarization-requirements.txt
.data/speech/venv/Scripts/python.exe scripts/setup-diarization.py --sample
.data/speech/venv/Scripts/python.exe scripts/diarization-server.py
```

The setup script pins SHA256 values, extracts only named regular files, and downloads no large general-purpose model. The server binds only `127.0.0.1:8766`; a private token is created in `.data/diarization/token`. Set `DIARIZATION_URL=http://127.0.0.1:8766/v1/audio/diarization` and `DIARIZATION_API_KEY` to that token in the server environment, without printing or committing it. Restart the API afterward. No access key belongs in a `VITE_` variable.

The [official Sherpa documentation](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html) supplies the segmentation model, English NeMo TitaNet small embedding model and public multiple-speaker audio example. Their upstream licenses and attribution remain applicable; the segmentation license is retained in the extracted directory. The [Python API example](https://github.com/k2-fsa/sherpa-onnx/blob/master/python-api-examples/offline-speaker-diarization.py) documents the segmentation/embedding/clustering API. HireLens always leaves the number of clusters unknown; it does not force a test sample's expected speaker count. `DIARIZATION_CLUSTER_THRESHOLD` defaults to 0.5 and is an engineering parameter, not a probability.

The authenticated adapter accepts one multipart `file` with a maximum of 6 MB and two minutes of decoded microphone audio. It holds audio only in memory, processes one request at a time and does not log or persist uploaded media. Results contain `model`, `duration`, and bounded `segments` with anonymous `speaker_0` style labels and start/end seconds. The HireLens server validates bounds and names, merges overlapping spans, and displays clusters with at least two seconds of support. Labels are local to one clip, never a stable identity. A second cluster can reflect the interviewer's playback, television, noise or an incorrect split of the candidate's voice.

In saved candidate recordings, the candidate separately consents and clicks **Analyze this clip**. Recording consent alone never starts speaker analysis. Authorized interview reviewers can read the result; only the candidate owner can consent or remove it. Removing a pending analysis prevents its late result being saved, although it cannot undo processing already underway. Results expire after seven days and are removed with interview retention cleanup. No new analysis can be saved after report finalization. Transcripts, recordings and technical scoring work independently.

**8 October live check:** the actual service returned one cluster for synthetic single-voice speech. The official four-speaker Chinese example produced seven raw cluster labels with the unchanged default threshold—an observed over-segmentation, not an exact speaker-count success. This proves that the actual models run and produce multiple-speaker estimates; it does not validate their accuracy for interviews. No physical interview audio was recorded for this check. Do not tune the threshold merely to make that known example pass. Real consented interview clips, overlap, noise and language coverage still need evaluation.

## Training an integrity review model

No custom trained integrity model is active. The application continues to use transparent review rules, separate from technical scores and hiring. Speaker and gaze observations contribute no integrity points.

The offline research workflow is usable when a legitimately collected dataset exists. The [collection and evaluation protocol](INTEGRITY-RESEARCH-PROTOCOL.md) provides the actual operator steps, consent notice requirements, review rubric guidance and limitations. Schema version 2 requires dated, unexpired, unwithdrawn research consent and preserves the two original independent labels; legacy consent-only rows cannot be used without their real supporting evidence.

```powershell
npx tsx scripts/train-integrity.ts --schema
npx tsx scripts/train-integrity.ts --template empty-collection.json
npx tsx scripts/train-integrity.ts --validate consented-reviewed-dataset.json new-preflight-report.json
npx tsx scripts/train-integrity.ts consented-reviewed-dataset.json new-research-model.json
```

The template command creates an empty versioned JSON envelope, not invented participants or consent. The schema command prints the complete dataset schema. Supply pseudonymous participant-group and interview references, a reference to actual research consent under the named protocol, collection/review timestamps, initial independent labels, permitted evidence references and the final label `needs-follow-up` or `no-follow-up`. Labels describe justified human follow-up, never an inferred cheating fact or a hiring outcome. Disagreement or an `insufficient-evidence` review requires a distinct third adjudicator or exclusion, preserving the original labels for reliability analysis. The software validates structure and consistency; a human must verify source consent, current withdrawal status and reviewer independence.

The model consumes only the specified event rates and monitoring coverage. Broad device/browser categories are retained for descriptive evaluation, alongside pseudonymous consent/review provenance. Raw names, resumes, media, demographic fields, gaze, speaker clusters and hiring outcomes are excluded. There is no automatic export or reuse of recruitment records for research, and no fabricated dataset is bundled. Prepare de-identified records under the stated consent protocol. At least 100 reviewed interviews, 20 participant groups, and ten examples of each label in both splits are required; these minima prevent trivial runs, not guarantee statistical validity.

Preflight reports split and class counts, initial annotation agreement and reviewer-pair Cohen kappa, with warnings for limited monitoring and device/browser coverage. Training fits a regularized logistic model on a deterministic participant-disjoint split with training-only normalization. Held-out outputs include precision, recall, false-positive rate, balanced accuracy, F1, Brier score, calibration bins, confusion counts, a training-prevalence baseline and 95% participant-cluster bootstrap intervals. Device/browser slices remain descriptive, especially when samples are small. Undefined rates are null. File order does not change the model. Do not tune on this holdout or interpret labels as ground-truth cheating.

Outputs include dataset and implementation hashes and `deploymentApproved: false`; files cannot overwrite an existing artifact. HireLens does not load these research artifacts. The empty-template preflight and synthetic regression tests verify software behavior only. As of 13 October 2026, a real consented labeled dataset is still absent; actual collection, provenance review, model training on real data and independent prospective/population validation remain outstanding.
