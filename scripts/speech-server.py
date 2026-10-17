"""Private local transcription adapter. Run with .data/speech/venv/Scripts/python.exe.

Loads a real faster-whisper model; never synthesizes answers or speaker identities.
The API matches the application's existing /v1/audio/transcriptions contract.
"""
import io
import os
import secrets
import threading
from pathlib import Path

import av
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel
from starlette.concurrency import run_in_threadpool
import uvicorn

ROOT = Path(__file__).resolve().parent.parent
KEY_PATH = ROOT / ".data/speech/token"
KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
if not KEY_PATH.exists():
    KEY_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
KEY = KEY_PATH.read_text(encoding="utf-8").strip()
MODEL = os.environ.get("HIRELENS_SPEECH_MODEL", "base.en")
engine = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=4,
                      download_root=str(ROOT / ".data/speech/models"))
gate = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None)


def recognize(data):
    # Decode only the first audio track and stop at a strict two-minute bound.
    pieces, count = [], 0
    try:
        with av.open(io.BytesIO(data)) as source:
            if not source.streams.audio:
                raise HTTPException(400, "This segment contains no microphone track.")
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
            for frame in source.decode(source.streams.audio[0]):
                for converted in resampler.resample(frame):
                    chunk = converted.to_ndarray().flatten()
                    count += chunk.size
                    if count > 16000 * 120:
                        raise HTTPException(413, "Audio is longer than two minutes.")
                    pieces.append(chunk)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "The recording could not be decoded.")
    if not pieces:
        return {"text": ""}
    samples = np.concatenate(pieces)
    segments, _ = engine.transcribe(samples, beam_size=3, vad_filter=True,
                                    condition_on_previous_text=False)
    return {"text": " ".join(s.text.strip() for s in segments).strip()}


@app.get("/health")
def health():
    return {"status": "ready", "model": MODEL, "device": "cpu", "speakerIdentification": False}


@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...), model: str = Form(...),
                     authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization, "Bearer " + KEY):
        raise HTTPException(401, "Authentication required.")
    if model != MODEL:
        raise HTTPException(400, "The requested speech model is not loaded.")
    data = await file.read(6 * 1024 * 1024 + 1)
    await file.close()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(413, "Recording segment exceeds 6 MB.")
    if not gate.acquire(blocking=False):
        raise HTTPException(429, "Local speech is busy. Retry shortly.")
    try:
        return await run_in_threadpool(recognize, data)
    finally:
        gate.release()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False)
