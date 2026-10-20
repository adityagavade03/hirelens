# Speech recording and transcription checks

The local adapter uses the installed faster-whisper model. It does not substitute
fixed text when recognition fails, disable voice activity detection to force words,
or provide the test script to the model as a prompt. The model can still produce
incorrect words, including results that pass its decoding thresholds. Recordings require a
reviewer to correct and approve the transcript before it is used as interview evidence.

## Changes checked on 19 October 2026

- Audio resampling now flushes buffered final samples instead of dropping the end
  of a clip. The 120-second decoded duration limit also applies to these samples.
- Missing microphone tracks, empty decoded audio, malformed media, and invalid
  samples have explicit failures. Quiet audio is diagnosed, not automatically rejected.
- Digital silence and voice-activity-detection results with no speech return
  `NO_SPEECH_DETECTED`. Detected speech with no usable text returns
  `NO_USABLE_TRANSCRIPT`. Neither is reported as a successful blank transcript.
- If every nonblank segment falls below faster-whisper's existing default log
  probability threshold of `-1.0`, the adapter returns
  `LOW_CONFIDENCE_TRANSCRIPT` instead of marking uncertain guesses as ready.
  Confident and mixed-confidence results are preserved; mixed results carry a
  diagnostic warning. This threshold is a decoding-quality guard, not a calibrated
  probability of correctness.
- Successful results include recording diagnostics: decoded duration/sample count,
  RMS and peak levels, clipping fraction, and VAD speech duration. These are signal
  measurements, not accuracy scores or candidate assessment metrics. The adapter
  does not write recordings or recognized words to diagnostic logs.

## Repeatable local checks

Use the private speech environment described in [LOCAL-AI.md](LOCAL-AI.md):

```powershell
.data/speech/venv/Scripts/python.exe -I -m unittest discover -s tests -p test_speech_audio.py
.data/speech/venv/Scripts/python.exe -I scripts/check-speech-quality.py
```

The first command checks real WAV/WebM decoding and recognition error handling
without downloading or loading a speech model. The second uses the already cached
model and existing computer-generated `.data/speech/check.wav`, plus generated
silence and a tone. It does not capture devices, upload audio, download models, or
save recognized text. The output is `.data/runtime/speech-quality-check.json`.

On 19 October, 15 decoder/contract checks passed. The real `base.en` model recognized
both expected fixture keywords in 5.8336 seconds of generated speech; inference took
0.984 seconds in the final check. Silence and the non-speech tone produced no transcript. These results
verify the local processing path and silence handling, not human speech accuracy.
The isolated `-I` interpreter invocation completed; normal-mode native-library
imports stalled in this machine's environment during the check. No Windows security
setting or dependency version was changed.

## Physical validation still required

The earlier consented device test detected voice activity but produced little or
no usable transcript. A fresh test on 19 October reproduced the problem: the user
confirmed that the full script was clear in playback, and the complete 25.14-second
mono Opus track decoded successfully, but `base.en` recognized only one unrelated
word. No reference-script words were recovered. The decoded signal was not digital
silence and showed no sample clipping after resampling.

The default VAD retained 5.584 seconds. Diagnostic comparisons that retained the
entire audio, or reduced the VAD threshold, also failed to recover the script. This
rules out VAD removal alone as a sufficient explanation for this test. Every
comparison reached the model's final temperature fallback with low segment log
probabilities. Only `base.en` was cached, so no stronger model was tested. No VAD
threshold was changed in the application, no expected words were supplied to the
model, and no media or raw transcript was saved in diagnostic files. The sanitized
local evidence is `.data/runtime/physical-speech-20261019.json`.

The real recording/playback path therefore works for this clip, while recognition
accuracy remains a failed physical check. These observations do not establish
whether acoustic conditions or the small English-only model is the primary cause.
The resampler fix alone did not resolve it. After adding the quality guard, a direct
check of this clip returned HTTP 422 `LOW_CONFIDENCE_TRANSCRIPT`; the synthetic speech
still returned HTTP 200. Application-level retries were not consistent: one produced
HTTP 200 and a 38-character unreviewed transcript, while the next returned HTTP 422
and preserved that unreviewed text. Recognition uses nonzero-temperature sampling
on its fallback ladder, so repeated attempts can differ. The guard rejects uniformly
weak decoding scores; it does not guarantee accuracy, nor does it guarantee that
this clip will always return 422. No retry was counted as successful physical speech
recognition. Diagnostic checks did not manually replace the saved text, and unreviewed
transcripts remain excluded from assessment evidence.

For a fresh test, both participants should select their actual microphones, verify
changing input levels, speak separately in a quiet room, and save their own recording
segments. Play both saved segments through headphones and compare each transcript
against what was actually spoken. Include pauses, quiet speech and technical terms.
Keep test recordings separate from recruitment records and do not use them as model
training data. Review any uncertain words manually; a stronger or multilingual
model should be evaluated against held-out consented samples before replacing the
current model. The presence of text or a healthy service is not an accuracy result.

The upstream [faster-whisper documentation](https://github.com/SYSTRAN/faster-whisper)
describes VAD, model selection and CPU inference; [its audio decoder](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/audio.py)
also flushes resampler output. HireLens retains a bounded decoder to enforce upload
and decoded-duration limits.
