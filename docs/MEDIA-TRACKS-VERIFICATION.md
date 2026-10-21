# Candidate and HR recording-track verification

Checked on **21 October 2026** using generated media, an isolated temporary
MongoDB, and the local multilingual `small` speech service. No device was captured,
no old private recording was reused, and no normal recruitment data was changed.

`npm run media:check` now exercises both authenticated participants. Each
independently accepts recording consent, creates a capture, uploads its own
VP8/Opus segment, and stops that capture. The HR fixture uses a different audio
gain and video color to detect track swaps; it is generated speech rather than a
different human voice or a speaker-identification test.

| Check | Observed result |
| --- | --- |
| Candidate encoded clip | 50,265 bytes; 71 video frames; 293 audio frames; 5.8336 seconds audio |
| HR encoded clip | 49,023 bytes; 71 video frames; 293 audio frames; 5.8336 seconds audio |
| Distinct audio waveforms | Different decoded PCM checksums |
| Full authenticated playback | Exact uploaded bytes returned; both downloaded clips fully decoded identically |
| Seek/range playback | Candidate and HR byte-range responses preserved the requested bytes |
| Participant privacy | Candidate listed only its own track; HR and company listed both |
| Cross-track access | Candidate could not upload, play or transcribe the HR track; unrelated Candidate could not play it |
| Capture closure | Each participant's post-stop upload was rejected |
| Local transcription | Both generated tracks were recognized by `small`; both transcript reviews saved |
| Assessment separation | Reviewed HR speech remained excluded; only reviewed Candidate text entered candidate transcript evidence |

The detailed local receipt is `.data/runtime/media-check-result.json`, with
generated clips in the corresponding ignored `media-check-*` folder. The
temporary MongoDB was stopped after the check. The existing frontend recorder,
transcript review and server evidence suites also passed **29 tests**; these use
test doubles or synthetic data and do not prove physical microphone quality.

To repeat against the isolated upgraded local speech service:

```powershell
$env:STT_BASE_URL = 'http://127.0.0.1:8767/v1'
$env:STT_MODEL = 'small'
npm run media:check
```

Keep the existing local `STT_API_KEY` in private configuration. The checker refuses
production mode and speech endpoints outside loopback. It creates a fresh
temporary database rather than using configured recruitment records. It requires
the documented Python environment, cached MongoDB binary and synthetic
`.data/speech/check.wav` fixture. The test uses no camera/microphone APIs.

## Physical verification remains separate

Each participant records only their own device with separate consent. The other
participant's remote audio is not mixed into that recording automatically. Both
tracks can be reviewed separately by the assigned HR and owning company; the
Candidate cannot access the HR's private track.

The generated-media check verifies storage, role authorization, encoded audio,
playback bytes, decoding, local transcription plumbing and assessment separation.
It does **not** establish physical capture, browser MediaRecorder behavior,
human-speech transcription accuracy, remote microphone audibility, synchronized
continuous meeting recording or cross-network WebRTC. A fresh consenting
Candidate and HR must still speak into their actual selected microphones, save
their own tracks, listen to both with headphones, and check the words against
the saved clips. Short recording gaps between independent segments remain a
documented limitation.
