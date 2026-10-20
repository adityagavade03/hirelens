# Account-free local AI and speech

Prepared on 5 October 2026 for this Windows project. The project-local services are **Ollama 0.35.1 / Qwen 2.5 3B** and **faster-whisper 1.2.1 / base.en**. No paid account is needed. They bind to loopback; do not expose these development services publicly.

## Start again after restarting the computer

From the project folder run `npm run local:start`. It starts the persistent MongoDB database, API, website, and the installed local AI/speech services in hidden windows. Existing port listeners are left alone. Logs and process IDs are in `.data/runtime`. Open http://localhost:5173/.

This command does not reinstall models, reset the database, seed demo records, or start Judge0. If a port belongs to an unrelated app, inspect it before stopping anything. After editing `.env`, restart the API process; model services can stay running.

## What is installed

- `.data/ollama/runtime`: portable official Ollama runtime. SHA256 of the downloaded v0.35.1 archive: `dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93`.
- `.data/ollama/models`: the downloaded `qwen2.5:3b` model; about 1.9 GB. Set `OLLAMA_MODELS` to this directory when starting the server.
- `.data/speech/venv`: isolated Python environment. Dependencies are declared in `scripts/speech-requirements.txt`.
- `.data/speech/models`: pretrained Whisper model. Inference runs locally on CPU with INT8; silence is filtered with the included VAD model.
- `.data/speech/token`: randomly generated local speech authentication secret. Never copy this into frontend code, screenshots, or chat.
- `scripts/speech-server.py`: bounded audio decoding (6 MB / 120 seconds), one inference request at a time, model-name validation, authenticated transcription endpoint.
- `scripts/speech_audio.py`: complete resampler output, signal diagnostics, and explicit retryable failures for missing microphone audio or unusable speech. See [SPEECH-QUALITY.md](SPEECH-QUALITY.md) for repeatable checks and physical-test limits.

The `.env` connection is enabled only after `scripts/check-local-ai.ts --configure` successfully transcribes a synthetic spoken sample, generates an interview question, and produces schema-validated answer feedback. `npm run ai:check` repeats those checks. The synthetic fixture is `.data/speech/check.wav`; it contains no personal microphone recording.

Local model cold starts can be slow. The API allows up to 120 seconds per AI call, and the adaptive-interview lock covers answer evaluation plus question generation and one duplicate-question retry. Qwen is a compact development model: successful JSON validation does not validate the quality of its assessment. Report references are constrained to existing evidence; scored metrics require a reference. Review technical evidence and its limitations before making a human decision. The speech model is English-only. `scripts/speech-lock.txt` records the exact installed dependency versions.

## Recreating the local setup on another Windows machine

1. Download the standalone runtime from the [official Ollama releases](https://github.com/ollama/ollama/releases), verify its published digest, and extract it into `.data/ollama/runtime`. Follow [Ollama's Windows documentation](https://docs.ollama.com/windows). Do not copy an old machine's private keys.
2. Set `OLLAMA_HOST=127.0.0.1:11434`, `OLLAMA_MODELS` to this project's `.data/ollama/models`, `OLLAMA_CONTEXT_LENGTH=8192`, and `OLLAMA_NUM_PARALLEL=1`. Run `ollama serve`, then `ollama pull qwen2.5:3b`.
3. Create a Python 3.12 virtual environment at `.data/speech/venv`; install `scripts/speech-requirements.txt` with that environment's pip. Run `scripts/speech-server.py`. The first launch downloads the public model. [faster-whisper documentation](https://github.com/SYSTRAN/faster-whisper) explains CPU INT8 inference and model downloads.
4. Configure `LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL=qwen2.5:3b`, `LLM_API_KEY=local-development-placeholder`, `LLM_JSON_SCHEMA=true`, and `LLM_TIMEOUT_MS=120000`. The local Ollama API ignores the API-key value; it is not an authentication mechanism. See [Ollama API compatibility](https://docs.ollama.com/api/openai-compatibility).
5. Configure `STT_BASE_URL=http://127.0.0.1:8765/v1`, `STT_MODEL=base.en`, and `STT_API_KEY` using the generated `.data/speech/token`. Restart HireLens and test with non-personal audio before real interviews.

## Using the new interview evidence

In a live room, open **Recording**. Check the separate recording notice and click **Start my recording** after checking devices. Each participant saves their own webcam/microphone track; the other person's track is not silently captured. **Stop & save / retry** flushes pending segments. Finish session also waits for local recording uploads. Keep the page open if an upload fails. Uploads are buffered in memory (up to three waiting segments), not guaranteed to survive a browser crash.

Recordings are approximately 30-second independent WebM/MP4 clips, with possible gaps between clips or interruptions. The server caps each participant at 360 segments or 512 MB per interview. Playback supports authenticated byte-range requests. Candidates access their own track; the assigned HR and owning company can access hiring tracks. Other candidates, companies, and HRs cannot access them. Practice tracks remain private.

Local Whisper transcribes saved clips while recording continues. **Recording & transcript** in the report lets a reviewer play a clip, retry transcription, correct its text, and save a reviewed transcript. Only reviewed candidate text is available to the AI report. Finalized reports lock transcript changes; concurrent edits produce a conflict instead of silently overwriting work. Existing approved retention cleanup includes recordings, capture metadata, and transcript text.

**Code similarity review** compares same-language submitted code for the same company and problem. It removes comments, normalizes identifiers/literals and excludes starter patterns before comparing 9-token patterns. Short solutions are marked insufficient. A 70% overlap creates a review lead, not a plagiarism verdict. It checks neither the public internet nor other companies. Other interviewers' candidate identities and code are not exposed.

Optional head-orientation monitoring uses Google's locally downloaded [Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js). It records only sustained, coarse camera-relative head-turn events. It does not identify gaze targets, attention, emotions, or intent, and adds no integrity points for head turns. No hardware accuracy claim is made until it is tested with consenting participants.

## Still requires further setup or validation

The 8 October interview upgrade supersedes the earlier service/device baseline; see [INTERVIEW-UPGRADE-VERIFICATION.json](INTERVIEW-UPGRADE-VERIFICATION.json). Judge0 remains blocked by the Docker/runtime environment; no execution success is simulated. A restricted local WSL TURN relay and same-computer bidirectional camera/window sharing have been verified, but public/cross-network media remains pending. Real delivery/registry verification and production hosting/database/scaling still require providers or a deployment environment. Whisper itself does not distinguish speakers. A separate optional local speaker-clustering service and experimental local gaze calibration are now implemented, with unvalidated accuracy and no score contribution; see [ADVANCED-PROCTORING.md](ADVANCED-PROCTORING.md). Real saved WebM/Whisper processing passed with synthetic media; physical participant recordings, remote microphone audibility and a trained custom integrity model remain unverified or unavailable.
