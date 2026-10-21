# Optional camera object detection

## Local improvements on 21 October 2026

The balanced EfficientDet-Lite0 profile remains the default. An optional **More
detail** profile now uses the official EfficientDet-Lite2 float16 model with a
448 × 448 model input. Google's [official model comparison](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector#models)
describes Lite2 as generally more accurate, slower and more memory intensive than
Lite0. This is an upstream model tradeoff, not evidence that HireLens now detects
phones or books reliably on this laptop. The failed Lite0 checks below are retained
as historical results; the inconclusive later device-check attempt is recorded
separately.

Install both assets with `npm run setup:assets`, then add this optional setting and
restart the server:

```dotenv
OBJECT_ACCURACY_MODEL_URL=/vendor/mediapipe/efficientdet_lite2.tflite
```

Select **Devices → Phones, books & objects → Local model → More detail**. Changing
the profile clears pending estimates and sustained-observation timers. It does not
grant object consent or start a camera. The profile stays local to the mounted
room; the default is restored after reopening it. There is no silent model
downgrade if a configured detail model fails. Leave the feature off or select
Balanced if it is too slow.

The worker now checks a 96 × 72 exposure sample before inference. Only bounded
brightness metadata leaves the worker. Very dark or washed-out frames clear boxes,
pause phone/book observations, and show a lighting explanation. A usable frame
starts a new observation interval. These conservative image-quality checks do not
assess skin tone, attention, cheating, or hiring suitability and are not calibrated
accuracy measurements. A low camera resolution produces guidance without blocking
the interview. Frozen/stale cameras retain their separate freshness checks; a
static photograph in the developer tool is not evidence of live-camera freshness.

| Optional model | Verified value                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model          | EfficientDet-Lite2, float16, version 1                                                                                                           |
| Official asset | [Versioned Google model](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite) |
| Local file     | `public/vendor/mediapipe/efficientdet_lite2.tflite`                                                                                              |
| Size           | 12,138,859 bytes                                                                                                                                 |
| SHA-256        | `5d4ebec1029bc9907aeadb9e7b4ac9cb1da6a19d01ad375210a9ae18ba173302`                                                                               |

## Inconclusive device check on 21 October 2026

The participant was instructed to open the temporary Candidate preflight page at
`127.0.0.1:5174`, enable the separate optional object consent, select **More detail**
(Lite2), hold a phone in view for five seconds, and then hold a book for five
seconds. They initially reported that camera and microphone worked and answered
**“Both phone and book identified correctly.”** This quotation is retained as an
unverified report, not a successful physical test.

Subsequent checks contradicted the assumed navigation state. The server showed
object consent as false and no Candidate waiting-room entry; an HR admission
attempt returned HTTP 409. When asked to inspect the address bar, the participant
reported a **Chrome New Tab / Google page**, rather than the Candidate test URL.
Therefore the intended test page, selected profile and running object model were
not established. The earlier report cannot confirm actual phone/book detection.

The UI automation helper also repeatedly reported a minimized window, preventing
independent inspection of labels, boxes, model scores or inference timings. No
successful screenshot or model-metadata capture is claimed. Admission did not
complete, and active-room timeline events were not verified. No interview recording
had been started for this object-check attempt, and no training images were
collected. The physical result is **INCONCLUSIVE**.

The new object-focused automated checks passed **32 tests in three files**,
including model switching, stopping for unusable exposure, discarding stale
results, and consent behavior. These tests verify software behavior; they do not
independently corroborate the participant's report. This attempt establishes no
physical detection success or broader accuracy across devices, lighting, object
sizes or angles. The feature remains experimental and does not change candidate
scores or determine cheating. See the [structured check record](OBJECT-DETECTION-DEVICE-CHECK-2026-10-21.json).

## Manual local comparison tool

Run `npm run setup:assets`, start `npm run dev:web`, and open
`http://127.0.0.1:5173/tools/object-validation/index.html` (use Vite's displayed port
if different). This development page does not need an API/database or a provider
account, and is not included in the production application build.

1. Load one of the two pinned official public sample photos, or choose a consented
   JPEG/PNG/WebP from this device. No photo is uploaded.
2. Enter an anonymous case ID and manually reviewed visible COCO labels before
   running. An empty label list is an engine check only.
3. Choose **Compare both local models**. Each model processes the same photo with
   the same score threshold (0.5), maximum results (8), frame-size bound (640) and
   exposure gate. The report shows labels, boxes, inference time, and which entered
   labels were found or missed. Boxes display the last model's estimates.
4. Download the metadata report if desired. It contains no pixels or local file
   name. **Clear photo and results** removes the selected photo and report from
   the page. The tool does not open a camera, record, call interview APIs, or send
   review events.

The tool does not calculate calibrated precision/recall or fill in missing
ground truth. Review negative examples and wrong extra labels as well as expected
label matches. A phone/book accuracy claim needs consented reviewed examples over
multiple cameras, lighting levels, object sizes and angles. Official desk/pet
examples only verify model execution, not phone/book accuracy.

HireLens uses the pretrained MediaPipe EfficientDet-Lite0 float16 model for local
object estimates. The model covers 80 COCO object categories, including `cell phone`,
`book`, `laptop`, `keyboard`, `mouse`, `bottle`, `cup` and `chair`. It does not recognize
every object, read book content, or determine whether a person is using an object.
See the [official task guide](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector)
and [supported label map](https://storage.googleapis.com/mediapipe-tasks/object_detector/labelmap.txt).

## Setup

Run `npm run setup:assets`, then configure the server and restart it:

```dotenv
OBJECT_MODEL_URL=/vendor/mediapipe/efficientdet_lite0.tflite
OBJECT_EVENT_SECONDS=3
MEDIAPIPE_WASM_URL=/vendor/mediapipe/wasm
```

The model is served from the same application origin. No API key or paid provider
is required. `OBJECT_EVENT_SECONDS` controls the sustained-observation interval;
the server constrains it to 3–30 seconds. A shorter glimpse does not produce an
interviewer event. Leaving `OBJECT_MODEL_URL` empty makes this optional check
unavailable without blocking the interview.

Pinned model installed on 19 October 2026:

| Item            | Value                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model           | EfficientDet-Lite0, float16, version 1                                                                                                                |
| Download        | [Official Google model asset](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite) |
| Local file      | `public/vendor/mediapipe/efficientdet_lite0.tflite`                                                                                                   |
| Verified size   | 7,254,339 bytes                                                                                                                                       |
| Verified format | TensorFlow Lite `TFL3`                                                                                                                                |
| SHA-256         | `4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993`                                                                                    |

The versioned URL and checksum are pinned in `scripts/setup-assets.ts`. The binary
and browser WASM assets are ignored by Git and installed using the setup command.

## Consent, preview and event sharing

Object detection starts off each time the room opens. The candidate explicitly
enables this optional check; saving consent alone does not automatically enable it
after a refresh. Disabling it stops local inference. Camera access is also required.
In the Candidate room, open **Devices** and find **Phones, books & objects** (also
shown during device preparation). Select the camera, allow camera access, and use
the separate object-detection consent checkbox. Leaving the checkbox off does not
block the interview.

The object detector processes camera frames in a browser worker. Its temporary
analysis frames are not uploaded or saved by this feature. The interview's ordinary
video call and separately consented recording retain their existing behavior.
Boxes and supported labels appear in the candidate's local preview. In private
practice, all results remain in that preview.

During an active online hiring interview, only sustained phone or book estimates
produce observation metadata for authorized interviewer review. In a human room,
this starts after admission; preview observations before admission are not shared.
An event contains its time, duration and a short estimated-object description, not
image pixels. Other object labels remain local. Consent must cover the whole
observed interval; withdrawing consent ends event sharing.

These estimates do not determine cheating, reject a candidate, or change a score.
A phone or book may be permitted, may belong to another person in view, or may be
misidentified. The interviewer must consider the interview rules and candidate's
explanation before interpreting an observation.

## Validation and limits

The downloaded binary's size, format and checksum were verified, and
`npm run setup:assets` completed. This confirms installation, not detection accuracy.

On 19 October 2026, a consenting participant tested the feature in an isolated
Candidate/HR room. The model loaded and displayed real boxes and a `person` label
with model scores around 81–85%. The phone/book checks did **not** validate accuracy:

| Physical check      | Observed result                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Phone held in view  | No `cell phone` label was observed. Lighting was dark and could not be improved during the test.                                     |
| Book held in view   | The model estimated `laptop` at approximately 63%; no sustained book event appeared. One angle retry still produced no review event. |
| HR activity         | The actual activity summary showed zero phone/book observations; ordinary monitoring events continued.                               |
| Camera switched off | Estimates cleared and object processing showed a paused state.                                                                       |
| Consent withdrawn   | The checkbox was off and the status read `Object detection is off`.                                                                  |

No recording was started. The object feature did not save or upload raw analysis
frames. The room used synthetic accounts in an isolated test database. A read-only
database check confirmed object consent withdrawn, zero captures and zero recording
clips. Its only events were `monitoring-started`, `connection-restored`,
`microphone-off` and `camera-off`; no phone/book observation was recorded. The
temporary fixture and test tabs were closed afterward. See the
[device check record](OBJECT-DETECTION-DEVICE-CHECK-2026-10-19.json) for the limited
scope and results.

`npm run check` passed the production client/server build, TypeScript checks and
**479 tests in 45 files**. A final wording-only update also passed `npm run build`.
These automated checks verify software behavior, not physical detection accuracy.

These observations verify that local inference and the visible stop controls ran,
while phone/book detection failed or remained uncertain under the tested lighting.
Zero HR observations do not mean no phone or book was present. Accuracy remains
experimental and needs further consented tests across cameras, lighting, object
sizes and occlusion. Small, covered or out-of-frame objects can be missed; ordinary
desk objects can be misclassified. A model score is not proof that an object is
present or used. No performance guarantee, cheating conclusion or hiring-score
change follows from these checks.

Two official public sample photos were also downloaded for local browser inference
checks. Their upstream checksums matched the [MediaPipe test asset manifest](https://github.com/google-ai-edge/mediapipe/blob/master/third_party/external_files.bzl):

| Local test photo                                          | SHA-256                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `public/vendor/mediapipe/test-fixtures/multi_objects.jpg` | `ada6e36b40519cf0a4fbdf1b535de7fa7d0c472f2c0a08ada8ee5728e16c0c68` |
| `public/vendor/mediapipe/test-fixtures/cats_and_dogs.jpg` | `a2eaa7ad3a1aae4e623dd362a5f737e8a88d122597ecd1a02b3e1444db56df9c` |

These are public sample images, not participant recordings. Model inference on
these photos was not run during this check. Their download is not evidence of
successful object detection. No detection result is prefilled or substituted when
model loading or inference fails.
