# Device validation for optional visual and speaker observations

## Current status

The optional face model and speaker service run, but running a model is not an accuracy validation. Earlier physical gaze attempts could not gather enough eye images; the earlier public four-speaker audio example produced seven raw cluster labels. No calibrated gaze, face-detection or speaker-count accuracy claim follows from those results.

The 19 October code changes improve the gaze test itself:

- The worker reports why it skipped a frame: absent/multiple faces, small eye patches, closed eye openings, clipping, low contrast, or an unreadable image.
- Calibration becomes available after three consecutive usable images and requires a recent camera frame. A stopped preview cannot reuse its earlier readiness.
- Capture preserves the camera's available resolution up to 1280 pixels on its longest edge. Small images are never enlarged to pretend they contain more detail. The previous fixed 640-pixel downsample could unnecessarily reduce an otherwise usable eye patch.
- Every target shows its accepted-image count. A timeout identifies the dominant observed rejection reason. The instruction panel moves to the opposite part of the screen so it does not cover the current target.
- Existing image-quality thresholds and independent validation thresholds are unchanged. Eight usable samples are collected for each of nine training targets and five separate validation targets; the fitting/validation routines still enforce their existing minimum of six. Samples captured during target settling, after its deadline, on an earlier target/camera, or during an active interview are excluded.

These are reliability and usability changes. They do not establish that gaze estimates are accurate. Eye images and calibration stay in the tab. Gaze and speaker estimates do not contribute integrity points or hiring scores.

## Local gaze check

1. Use a temporary interview with a consenting test participant. In Candidate device setup, check that the camera preview is advancing. Do not run this calibration during a live interview.
2. Place light in front of the face. Both eyes should be visible. Use a comfortable, steady distance; reduce glare where possible. Choose the intended physical camera before calibrating.
3. Enable the separate optional local eye-image consent. Read the frame-quality message before starting. If images are too small, move a little closer or choose a higher-resolution camera. If no camera can pass the quality check comfortably, leave the feature off.
4. Click **Calibrate before interview** when available. Follow each target with the eyes, keeping the head reasonably still. Ordinary blinks are skipped. The target moves after eight usable images. Each target has a twelve-second deadline; cancelling is always allowed.
5. Record whether the five-target independent check passed and its displayed error. A pass applies to this one check in this position/lighting only. Resizing, hiding the page, changing the camera or losing the camera invalidates calibration.
6. If it fails, retain only the displayed reason, device/browser version and broad lighting conditions in the test log. Do not relax thresholds to turn a failed attempt into a pass. Eye images need not be saved or sent anywhere.

## Face-presence validation

Use a separate consenting test participant and an observer with a clock, or label consented test video independently. The observer records the actual transitions; do not infer ground truth from the model's own status. Face monitoring requires its own consent and a successful one-face preflight. Actual interview observations begin only after admission.

| Controlled condition | Expected application behavior | What to record |
| --- | --- | --- |
| One visible face, good light | Working local processing; no sustained absence event | False absence/multiple-face events and elapsed time |
| Face leaves frame longer than configured threshold | A sustained no-face observation may be recorded after the threshold | Misses, event delay, actual start/end and model result |
| Two consenting people visible longer than threshold | A sustained multiple-face observation may be recorded | Misses, delay, and false positives after the second person leaves |
| Camera disabled, disconnected, frozen or page hidden | Unavailable/paused coverage, not fabricated absence evidence | Recovery behavior and whether unavailable coverage is visible |
| Return to a single visible face | Fresh frame processing resumes | Recovery delay and any stale observations |

Repeat under different lighting, cameras, camera positions, glasses where applicable and browser/device combinations. A single successful demonstration does not establish sensitivity or false-positive rates. Report counts, denominators, failures and conditions, not just a pass label. Do not collect demographic traits or make unsupported demographic accuracy claims.

## Speaker validation

The optional saved-clip analysis needs separate candidate consent. Its labels are anonymous within one clip and cannot identify people or be compared across clips. Use headphones during capture to distinguish actual nearby speech from interviewer playback.

Collect separately consented, short test clips for one speaker, two speakers taking turns, overlapping speech, silence, background noise and interviewer playback. An independent listener labels actual speech intervals and overlap before seeing the model output. Use the unchanged model and threshold for the evaluation set; do not force an expected speaker count or tune on the same examples used to claim success. Record raw cluster counts, sustained displayed counts, missed speech and false splits/merges. Two seconds is a display filter, not a probability of another person.

With only one laptop and one speaker, software paths and a single-speaker clip can be exercised. Multiple physical speakers, cross-device audio separation and wider accuracy evaluation remain pending. Speech transcription quality is a separate measurement; successful transcription does not establish speaker detection accuracy.

## Evidence record

Keep a dated local test log with: test identifier; consent confirmation; device/browser; model/version and unchanged configuration; scenario and independent ground truth; app result; elapsed time; failures; participant playback confirmation where relevant; and remaining limitations. Store no passwords or raw private media in Git. Never replace a pending physical check with an automated fixture result.

Automated regression checks:

```powershell
npx vitest run tests/gaze-quality.test.ts tests/gaze-calibration-ui.test.ts tests/advanced-proctoring.test.ts
```

These tests check image-quality gates, target timing, camera freshness, UI recovery, independent validation and exclusion of gaze/speaker estimates from integrity points. They are simulated inputs, not physical-device accuracy measurements. See [Advanced observations and research limits](ADVANCED-PROCTORING.md) for the existing local models, consent and retention behavior.
