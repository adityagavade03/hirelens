"""Local held-out transcription evaluation, without reference prompts or text logs."""
import json
import re
import time
import unicodedata
from pathlib import Path

from speech_audio import SpeechInputError, recognition_options, recognize_audio

MAX_CLIPS = 100
MAX_BYTES = 6 * 1024 * 1024
MAX_REFERENCE_CHARACTERS = 12000


def normalize(text):
    # Keep Unicode letters and combining marks: Latin-only tokenization would
    # silently erase Hindi/Kannada references. No phonetic/semantic substitutions.
    folded = unicodedata.normalize("NFC", text).casefold()
    return " ".join("".join(" " if unicodedata.category(char)[0] in "PS" else char
                            for char in folded).split())


def edit_distance(reference, hypothesis):
    previous = list(range(len(hypothesis) + 1))
    for index, expected in enumerate(reference, 1):
        current = [index]
        for column, observed in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, previous[column] + 1,
                               previous[column - 1] + (expected != observed)))
        previous = current
    return previous[-1]


def error_counts(reference, hypothesis):
    expected, observed = normalize(reference), normalize(hypothesis)
    words, characters = expected.split(), "".join(expected.split())
    return {"referenceWords": len(words), "wordEdits": edit_distance(words, observed.split()),
            "referenceCharacters": len(characters),
            "characterEdits": edit_distance(characters, "".join(observed.split()))}


def load_manifest(path):
    path = Path(path).resolve()
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Speech evaluation manifest exceeds 2 MB.")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    clips = manifest.get("clips")
    if manifest.get("schemaVersion") != 1 or not isinstance(clips, list) or not 1 <= len(clips) <= MAX_CLIPS:
        raise ValueError("Use schemaVersion 1 and between 1 and 100 evaluation clips.")
    ids, result = set(), []
    for clip in clips:
        if not isinstance(clip, dict):
            raise ValueError("Every evaluation clip must be an object.")
        item_id = clip.get("id", "")
        speaker = clip.get("speakerGroup", "")
        if not isinstance(item_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", item_id) or item_id in ids:
            raise ValueError("Every clip needs a unique opaque id (letters, digits, underscore or hyphen).")
        if not isinstance(speaker, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", speaker):
            raise ValueError("Every clip needs an opaque speakerGroup; do not put personal names here.")
        if (clip.get("consented") is not True or clip.get("reviewed") is not True
                or clip.get("heldOut") is not True or clip.get("source") != "human"
                or clip.get("consentPurpose") != "transcription-evaluation"):
            raise ValueError("Use consented human clips with reviewed references, explicit transcription-evaluation consent and heldOut=true. Old interview/test consent is insufficient.")
        reference = clip.get("reference")
        if not isinstance(reference, str) or len(reference) > MAX_REFERENCE_CHARACTERS or not normalize(reference):
            raise ValueError("Every clip needs a nonempty reviewed reference of at most 12000 characters.")
        relative = clip.get("path")
        if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
            raise ValueError("Clip paths must be relative to the private manifest directory.")
        source = (path.parent / relative).resolve()
        if not source.is_relative_to(path.parent) or not source.is_file() or not 0 < source.stat().st_size <= MAX_BYTES:
            raise ValueError("A clip is missing, outside its manifest directory, empty, or larger than 6 MB.")
        language = clip.get("language", "auto")
        if not isinstance(language, str):
            raise ValueError("Clip language must be auto or a supported language code.")
        options = recognition_options(language)
        ids.add(item_id)
        result.append({"id": item_id, "speakerGroup": speaker, "path": source,
                       "reference": reference, "options": options})
    return result


def evaluate(clips, engine, model, *, min_clips=10, min_speakers=3, max_wer=0.2,
             max_cer=0.1, max_rejected_fraction=0.1):
    rows = []
    for clip in clips:
        started = time.monotonic()
        try:
            prediction = recognize_audio(clip["path"].read_bytes(), engine, clip["options"])
            hypothesis, code = prediction["text"], None
        except SpeechInputError as exc:
            # Rejections count as full deletions; never remove them from WER/CER.
            hypothesis, code = "", exc.code
        counts = error_counts(clip["reference"], hypothesis)
        rows.append({"id": clip["id"], "rejected": code is not None, "code": code,
                     "language": clip["options"].language or "auto", **counts,
                     "elapsedSeconds": round(time.monotonic() - started, 3)})
    def aggregate(items):
        counts = {key: sum(row[key] for row in items) for key in
                  ("referenceWords", "wordEdits", "referenceCharacters", "characterEdits")}
        counts["wer"] = counts["wordEdits"] / counts["referenceWords"] if counts["referenceWords"] else None
        counts["cer"] = counts["characterEdits"] / counts["referenceCharacters"] if counts["referenceCharacters"] else None
        counts["rejectedFraction"] = sum(row["rejected"] for row in items) / len(items)
        return {"clipCount": len(items), **counts}

    totals = aggregate(rows)
    by_language = {language: aggregate([row for row in rows if row["language"] == language])
                   for language in sorted({row["language"] for row in rows})}
    speakers = len({clip["speakerGroup"] for clip in clips})
    enough = len(clips) >= min_clips and speakers >= min_speakers
    passed = (enough and totals["wer"] is not None and totals["cer"] is not None
              and totals["wer"] <= max_wer and totals["cer"] <= max_cer
              and totals["rejectedFraction"] <= max_rejected_fraction)
    return {"model": model, "clipCount": len(rows), "speakerCount": speakers,
            "localOnly": True, "externalUpload": False, "referenceSuppliedToModel": False,
            "mediaCopied": False, "recognizedTextExported": False,
            "normalization": "Unicode NFC, casefold, punctuation/symbols to spaces; CER excludes whitespace",
            "deploymentAccuracyValidated": False, "enoughSamplesForConfiguredGate": enough,
            "meetsConfiguredBenchmarkThresholds": passed,
            "thresholds": {"minClips": min_clips, "minSpeakers": min_speakers, "maxWer": max_wer,
                           "maxCer": max_cer, "maxRejectedFraction": max_rejected_fraction},
            "totals": totals, "byRequestedLanguage": by_language, "clips": rows}
