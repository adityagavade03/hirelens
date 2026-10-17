"""Private CPU speaker clustering for explicitly consented saved recordings.

Requires sherpa-onnx plus the existing speech environment (av/numpy/FastAPI).
No download at startup, identity matching, voice enrollment or raw-media storage.
"""
import io
import os
import secrets
import threading
from pathlib import Path

import av
import numpy as np
import sherpa_onnx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
import uvicorn

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / ".data/diarization"
MODELS = DIRECTORY / "models"
SEGMENTATION = Path(os.environ.get("DIARIZATION_SEGMENTATION_MODEL", str(MODELS / "sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx")))
EMBEDDING = Path(os.environ.get("DIARIZATION_EMBEDDING_MODEL", str(MODELS / "nemo_en_titanet_small.onnx")))
if not SEGMENTATION.is_file() or not EMBEDDING.is_file():
    raise RuntimeError("Install the documented segmentation and embedding models before starting speaker analysis.")
THRESHOLD = float(os.environ.get("DIARIZATION_CLUSTER_THRESHOLD", "0.5"))
if not 0.1 <= THRESHOLD <= 0.95:
    raise RuntimeError("DIARIZATION_CLUSTER_THRESHOLD must be between 0.1 and 0.95.")
config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
    segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
        pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(SEGMENTATION)),
        num_threads=2, provider="cpu",
    ),
    embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(EMBEDDING), num_threads=2, provider="cpu"),
    clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=THRESHOLD),
    min_duration_on=0.3, min_duration_off=0.5,
)
if not config.validate():
    raise RuntimeError("The installed speaker model configuration is invalid.")
engine = sherpa_onnx.OfflineSpeakerDiarization(config)
KEY_PATH = DIRECTORY / "token"
DIRECTORY.mkdir(parents=True, exist_ok=True)
if not KEY_PATH.exists():
    KEY_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
KEY = KEY_PATH.read_text(encoding="utf-8").strip()
MODEL = "sherpa-onnx/pyannote-segmentation-3.0-int8+nemo-en-titanet-small"
gate = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None)


def analyze(data):
    pieces, count = [], 0
    try:
        with av.open(io.BytesIO(data)) as source:
            if not source.streams.audio:
                raise HTTPException(400, "This recording has no microphone track.")
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=engine.sample_rate)
            for frame in source.decode(source.streams.audio[0]):
                for converted in resampler.resample(frame):
                    chunk = converted.to_ndarray().flatten()
                    count += chunk.size
                    if count > engine.sample_rate * 120:
                        raise HTTPException(413, "Audio exceeds two minutes.")
                    pieces.append(chunk)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "The audio could not be decoded.")
    if not pieces or count < engine.sample_rate:
        raise HTTPException(400, "At least one second of decodable audio is required.")
    samples = np.concatenate(pieces).astype(np.float32)
    if not np.isfinite(samples).all():
        raise HTTPException(400, "The audio contains invalid samples.")
    duration = len(samples) / engine.sample_rate
    # num_clusters stays -1: never force a sample's known speaker count.
    result = engine.process(samples).sort_by_start_time()
    segments = [{"start": round(max(0, r.start), 3), "end": round(min(duration, r.end), 3),
                 "speaker": f"speaker_{r.speaker}"} for r in result if r.end > r.start]
    if len(segments) > 2000:
        raise HTTPException(422, "Too many speaker segments; use a shorter clip.")
    return {"model": MODEL, "duration": round(duration, 3), "segments": segments}


@app.get("/health")
def health():
    return {"status": "ready", "model": MODEL, "device": "cpu", "identityRecognition": False,
            "estimatedClustering": True, "clusterThreshold": THRESHOLD}


@app.post("/v1/audio/diarization")
async def diarize(file: UploadFile = File(...), authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization, "Bearer " + KEY):
        raise HTTPException(401, "Authentication required.")
    data = await file.read(6 * 1024 * 1024 + 1)
    await file.close()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(413, "Recording exceeds 6 MB.")
    if not gate.acquire(blocking=False):
        raise HTTPException(429, "Speaker analysis is busy. Retry shortly.")
    try:
        return await run_in_threadpool(analyze, data)
    finally:
        gate.release()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8766, access_log=False)
