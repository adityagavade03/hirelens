"""Pinned optional multilingual model files; no microphone or network on import."""
import hashlib
import json
from pathlib import Path

REPOSITORY = "Systran/faster-whisper-small"
REVISION = "536b0662742c02347bc0e980a01041f333bce120"
FILES = {
    "config.json": {"bytes": 2370, "gitBlob": "e5047537059bd8f182d9ca64c470201585015187"},
    "model.bin": {"bytes": 483546902, "sha256": "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671"},
    "tokenizer.json": {"bytes": 2203239, "gitBlob": "7818adb6de9fa3064d3ff81226fdd675be1f6344"},
    "vocabulary.txt": {"bytes": 459861, "gitBlob": "c9074644d9d1205686f16d411564729461324b75"},
}


def model_directory(root):
    return Path(root) / ".data/speech/models/hirelens-small"


def verify_file(path, expected):
    if not path.is_file() or path.stat().st_size != expected["bytes"]:
        return None
    sha256 = hashlib.sha256()
    git_blob = hashlib.sha1(f"blob {expected['bytes']}\0".encode("ascii"))
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            sha256.update(chunk)
            git_blob.update(chunk)
    digest = sha256.hexdigest()
    if expected.get("sha256", digest) != digest or expected.get("gitBlob", git_blob.hexdigest()) != git_blob.hexdigest():
        return None
    return digest


def verify_model(root):
    target = model_directory(root)
    digests = {name: verify_file(target / name, expected) for name, expected in FILES.items()}
    return {"ready": all(digests.values()), "repository": REPOSITORY,
            "revision": REVISION, "model": "small", "files": digests,
            "downloadBytes": sum(item["bytes"] for item in FILES.values()),
            "accuracyValidated": False}


def local_model_source(root, model):
    # Only this explicit model name opts in. Existing base.en installations keep
    # their existing cache and process; setup does not switch a running service.
    if model == "small":
        if not verify_model(root)["ready"]:
            raise ValueError("Pinned multilingual small model is not installed or failed verification. Run scripts/setup-speech-model.py --download first.")
        return str(model_directory(root))
    return model


def save_receipt(root, result):
    destination = model_directory(root) / "hirelens-model-receipt.json"
    destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
