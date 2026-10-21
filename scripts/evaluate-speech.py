"""Compare cached speech models on explicitly consented, reviewed local clips.

Never records, uploads media, downloads models, copies clips, exports words, or
uses reference text as a recognition prompt. Requires a private local manifest.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from speech_evaluation import evaluate, load_manifest
from speech_model import local_model_source

ROOT = Path(__file__).resolve().parent.parent


def fraction(value):
    result = float(value)
    if not 0 <= result <= 1:
        raise argparse.ArgumentTypeError("Choose a finite number between zero and one.")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--models", nargs="+", default=["base.en", "small"])
    parser.add_argument("--output", type=Path, default=ROOT / ".data/runtime/speech-held-out-evaluation.json")
    parser.add_argument("--max-wer", type=fraction, default=0.2)
    parser.add_argument("--max-cer", type=fraction, default=0.1)
    parser.add_argument("--max-rejected-fraction", type=fraction, default=0.1)
    args = parser.parse_args()
    clips = load_manifest(args.manifest)
    # Import native/model libraries only after the manifest's consent checks pass.
    from faster_whisper import WhisperModel
    reports = []
    for model in args.models:
        engine = WhisperModel(local_model_source(ROOT, model), device="cpu", compute_type="int8",
                              cpu_threads=4, download_root=str(ROOT / ".data/speech/models"), local_files_only=True)
        reports.append(evaluate(clips, engine, model, max_wer=args.max_wer, max_cer=args.max_cer,
                                max_rejected_fraction=args.max_rejected_fraction))
        del engine
    report = {"schemaVersion": 1, "accuracyClaim": "Local held-out benchmark only; thresholds are project choices, not a population accuracy guarantee.",
              "models": reports}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=True))
    return 0 if all(item["meetsConfiguredBenchmarkThresholds"] for item in reports) else 1


if __name__ == "__main__":
    raise SystemExit(main())
