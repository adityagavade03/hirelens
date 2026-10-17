"""Download small official Sherpa models with pinned hashes; no account or microphone access."""
import hashlib
from pathlib import Path
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent / ".data/diarization"
MODELS = ROOT / "models"
MODELS.mkdir(parents=True, exist_ok=True)
ASSETS = [
    ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2",
     MODELS / "segmentation.tar.bz2", "24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488"),
    ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx",
     MODELS / "nemo_en_titanet_small.onnx", "ad4a1802485d8b34c722d2a9d04249662f2ece5d28a7a039063ca22f515a789e"),
]
if "--sample" in sys.argv:
    ASSETS.append(("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/0-four-speakers-zh.wav",
                   ROOT / "sample-multiple-speakers.wav", "bedf036caed208386c67b4ef4b11f83d74dd0d420b102163a1c33cd09cde7010"))
for url, target, expected in ASSETS:
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
        print(f"Verified {target.name}")
        continue
    request = urllib.request.Request(url, headers={"User-Agent": "HireLens-local-model-setup"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(100 * 1024 * 1024 + 1)
    if len(data) > 100 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError(f"Size or SHA256 mismatch: {target.name}; no model was replaced.")
    target.write_bytes(data)
    print(f"Verified and saved {target.name} ({len(data)} bytes)")

# Never extract arbitrary archive paths, links or executables.
folder = "sherpa-onnx-pyannote-segmentation-3-0"
(MODELS / folder).mkdir(exist_ok=True)
with tarfile.open(MODELS / "segmentation.tar.bz2", "r:bz2") as archive:
    for name in ["model.onnx", "model.int8.onnx", "LICENSE", "README.md"]:
        member = archive.getmember(f"{folder}/{name}")
        if not member.isfile() or member.size > 20 * 1024 * 1024:
            raise RuntimeError("Unexpected archive member")
        source = archive.extractfile(member)
        if source is None:
            raise RuntimeError("Model member is unavailable")
        (MODELS / folder / name).write_bytes(source.read())
print("Models ready. Start scripts/diarization-server.py with the private speech venv. Model licenses remain with the segmentation archive; see docs/ADVANCED-PROCTORING.md for upstream attribution and limits.")
