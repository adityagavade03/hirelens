"""Install/verify the pinned public multilingual model. Never sends audio.

Without --download this command is offline and exits unsuccessfully if files are
missing. --download fetches only four pinned official files (~486 MB); it does not
edit .env, start/stop services, or alter authentication secrets.
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from speech_model import FILES, REPOSITORY, REVISION, model_directory, save_receipt, verify_file, verify_model

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download missing or invalid pinned model files.")
    args = parser.parse_args()
    destination = model_directory(ROOT)
    if args.download:
        destination.mkdir(parents=True, exist_ok=True)
        for name, expected in FILES.items():
            target = destination / name
            if verify_file(target, expected):
                continue
            temporary = target.with_name(name + ".download")
            url = f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{name}"
            print(f"Downloading {name} ({expected['bytes']} bytes)", flush=True)
            request = urllib.request.Request(url, headers={"User-Agent": "HireLens-local-speech-setup/1"})
            try:
                count = 0
                with urllib.request.urlopen(request, timeout=30) as source, temporary.open("wb") as output:
                    while chunk := source.read(1024 * 1024):
                        count += len(chunk)
                        if count > expected["bytes"]:
                            raise ValueError(f"Unexpected size for pinned model file {name}.")
                        output.write(chunk)
                if not verify_file(temporary, expected):
                    raise ValueError(f"Pinned model checksum or size failed for {name}.")
                os.replace(temporary, target)
            finally:
                # A failed partial download is never loaded as a model.
                if temporary.exists():
                    temporary.unlink()
    result = verify_model(ROOT)
    if result["ready"]:
        save_receipt(ROOT, result)
    print(json.dumps(result, indent=2))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
