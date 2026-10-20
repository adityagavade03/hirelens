# Saved recording and speech verification

## Current physical check — 19 October 2026

A consented 25-second Candidate recording saved successfully in the isolated local test workspace. It contains 640 × 480 VP8 video and mono Opus microphone audio; all 379 video frames and 419 audio frames decoded. The participant confirmed that the full spoken script was clear in browser playback. The local `base.en` model nevertheless returned only one unrelated word, including on a repeated request. Full-audio and alternative-VAD diagnostic runs also failed to recover the script. Physical recognition accuracy therefore failed; recording and playback passed for this clip.

Recording now checks microphone availability and shows input state; local speech errors distinguish missing audio, unusable samples, absent clear speech, low-confidence recognition and decoding/length failures. The exact physical clip returned `LOW_CONFIDENCE_TRANSCRIPT` in the final API check, with its saved bytes preserved and actionable guidance visible to HR. An earlier application attempt produced 38 characters of inaccurate text instead. The guard rejects uniformly low-confidence output; it does not guarantee accurate text or consistent rejection. Automated coverage passed, including 15 Python speech-processing tests. Manual review is still required.

The Interviewer microphone request timed out twice, so no separate HR audio recording or two-device result was obtained. Both test participants left the room afterward. Normal recruitment data was untouched, media was processed locally, and the clip is not training data. See [the device check record](DEVICE-CHECK-2026-10-19.json) and [speech diagnostics](SPEECH-QUALITY.md).

The synthetic result below remains historical evidence only. See [current project status](PROJECT-STATUS.md) for the latest complete verification summary.

## Synthetic result — 8 October 2026

`npm run media:check` passed against the real media APIs and the installed local Whisper `base.en` model. The test used a separate temporary MongoDB with synthetic candidate/HR accounts. It did not connect to the normal recruitment database or use any camera or microphone.

The fixture is a genuine 50,255-byte WebM containing 320 × 180 moving color bars encoded with VP8 and 5.8336 seconds of computer-generated speech encoded with Opus. After upload and authenticated download, PyAV decoded all **71 video frames and 293 audio frames / 280,011 audio samples**. The downloaded bytes and decoded output exactly matched the source.

Actual API checks passed:

| Check | Result |
| --- | --- |
| Recording without explicit consent | Rejected, HTTP 400 |
| Consented capture and clip upload | Created, HTTP 201 |
| Retry of the same segment | Same saved clip; no duplicate |
| Unauthenticated playback | Rejected, HTTP 401 |
| Unrelated candidate playback | Rejected, HTTP 404 |
| Candidate full playback | HTTP 200, private/no-store, exact file bytes |
| Assigned HR byte-range playback | HTTP 206, correct Content-Range and bytes |
| Suffix range and invalid range | Correct partial bytes / HTTP 416 |
| Stop capture, then upload another segment | Stop succeeded / upload rejected, HTTP 409 |
| Local Whisper transcription of saved WebM | HTTP 200, actual transcript below |
| Transcript review | Unreviewed text excluded from report evidence; explicit review included it |

Whisper returned:

> This is an interview practice session. A hash map provides fast key lookup.

Verification evidence is written to `.data/runtime/media-check-result.json`. Each run also creates a unique `.data/runtime/media-check-*` directory containing `synthetic-source.webm`, the actual downloaded `api-playback.webm`, and `result.json`. These are synthetic artifacts that can be played locally; they contain no recruitment or device data. The temporary database is stopped in a `finally` block.

## Repeat the check

Prerequisites are the existing local speech environment (`.data/speech/venv` with PyAV and NumPy), the generated speech sample `.data/speech/check.wav`, the local Whisper service, and the cached MongoMemoryServer binary. See [LOCAL-AI.md](LOCAL-AI.md) for speech setup. No new dependency or paid provider was installed for this check.

```powershell
npm run media:check
```

The command generates a real WebM, uploads it through an in-process instance of the application, checks authentication and byte-range behavior, fully decodes the downloaded file, transcribes it through the configured **loopback-only** speech service, and reviews the transcript through the normal endpoint. It refuses production mode and external speech-provider URLs. It does not start the notification/screening workers or send messages. The normal `MONGODB_URI` is not used.

## What this result does not establish

This verifies saved-media integrity, decodability, API access, playback HTTP behavior and real local transcription. It does **not** establish physical camera/microphone capture, browser MediaRecorder behavior, simultaneous participant tracks, remote audio over WebRTC, screen sharing, cross-network TURN connectivity or transcription accuracy for other languages/accents/noisy rooms. Those require separate browser and physical-device checks. No recording or transcript from a real participant was created.
