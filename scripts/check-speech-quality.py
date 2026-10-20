"""Check local speech with synthetic audio only; never records or uploads audio.

Uses the already installed model cache, so it cannot download a model. The known
fixture words are checked after inference and are never supplied to the model.
"""
import io
import json
import os
import re
import sys
import time
import wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
from speech_audio import SpeechInputError, recognize_audio

ROOT = Path(__file__).resolve().parent.parent


def wav(samples):
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(16000)
        target.writeframes((samples * 32767).astype("<i2").tobytes())
    return output.getvalue()


def main():
    fixture = ROOT / ".data/speech/check.wav"
    if not fixture.is_file():
        raise SystemExit("Create the documented synthetic check.wav fixture before running this check.")
    model = os.environ.get("HIRELENS_SPEECH_MODEL", "base.en")
    engine = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=4,
                          download_root=str(ROOT / ".data/speech/models"), local_files_only=True)
    results = []
    for name, data in (
        ("synthetic_speech", fixture.read_bytes()),
        ("digital_silence", wav(np.zeros(16000 * 2))),
        ("non_speech_tone", wav(np.sin(np.arange(16000 * 2) * 2 * np.pi * 440 / 16000) * 0.1)),
    ):
        started = time.monotonic()
        try:
            result = recognize_audio(data, engine)
            words = set(re.findall(r"[a-z]+", result["text"].lower()))
            passed = name == "synthetic_speech" and {"interview", "hash"}.issubset(words)
            item = {"fixture": name, "passed": passed, "characters": len(result["text"]),
                    "knownWordsMatched": len(words.intersection({"interview", "hash"})),
                    "diagnostics": result["diagnostics"]}
        except SpeechInputError as exc:
            item = {"fixture": name, "passed": name != "synthetic_speech" and exc.code == "NO_SPEECH_DETECTED",
                    "code": exc.code, "diagnostics": exc.diagnostics}
        item["elapsedSeconds"] = round(time.monotonic() - started, 3)
        results.append(item)
    report = {"syntheticOnly": True, "model": model, "externalUpload": False,
              "accuracyValidated": False, "results": results}
    destination = ROOT / ".data/runtime/speech-quality-check.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
