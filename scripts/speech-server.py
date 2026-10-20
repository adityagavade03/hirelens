"""Private local transcription adapter. Run with .data/speech/venv/Scripts/python.exe.

Loads a real faster-whisper model; never synthesizes answers or speaker identities.
The API matches the application's existing /v1/audio/transcriptions contract.
"""
import os
import secrets
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

# Explicit sibling import also works with Python -I (no current-directory imports).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from speech_audio import SpeechInputError, recognize_audio
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
    try:
        return recognize_audio(data, engine)
    except SpeechInputError as exc:
        raise HTTPException(exc.status, detail={"code": exc.code, "message": str(exc),
                                               "diagnostics": exc.diagnostics}) from exc


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
