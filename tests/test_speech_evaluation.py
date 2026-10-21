"""Evaluation semantics only: no device capture, inference or private audio."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from speech_audio import SpeechInputError
from speech_evaluation import error_counts, evaluate, load_manifest, normalize


class SpeechEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "clip.wav").write_bytes(b"dummy test input, never decoded")
        self.clip = {"id": "clip_1", "speakerGroup": "speaker_1", "path": "clip.wav",
                     "source": "human", "consented": True, "consentPurpose": "transcription-evaluation",
                     "heldOut": True, "reviewed": True, "reference": "Java uses classes.", "language": "en"}

    def manifest(self, clips=None):
        destination = self.root / "manifest.json"
        destination.write_text(json.dumps({"schemaVersion": 1, "clips": clips or [self.clip]}), encoding="utf-8")
        return destination

    def test_unicode_reference_is_not_erased_by_english_only_normalization(self):
        self.assertEqual(normalize("ನಮಸ್ಕಾರ! हिंदी, JAVA."), "ನಮಸ್ಕಾರ हिंदी java")
        self.assertGreater(error_counts("ನಮಸ್ಕಾರ", "")["referenceCharacters"], 0)

    def test_insertions_deletions_substitutions_count_without_rate_clamping(self):
        counts = error_counts("Java uses classes", "Python uses objects now")
        self.assertEqual(counts["referenceWords"], 3)
        self.assertEqual(counts["wordEdits"], 3)
        self.assertEqual(error_counts("one", "two three four")["wordEdits"], 3)

    def test_missing_evaluation_consent_review_or_holdout_is_rejected(self):
        for key, value in (("consented", False), ("reviewed", False), ("heldOut", False),
                           ("source", "synthetic"), ("consentPurpose", "interview-recording")):
            with self.subTest(key=key):
                item = {**self.clip, key: value}
                with self.assertRaises(ValueError):
                    load_manifest(self.manifest([item]))

    def test_duplicate_ids_and_path_escape_are_rejected_before_reading_clips(self):
        with self.assertRaises(ValueError):
            load_manifest(self.manifest([self.clip, self.clip]))
        with self.assertRaises(ValueError):
            load_manifest(self.manifest([{**self.clip, "path": "../clip.wav"}]))

    def test_reference_never_reaches_recognizer_and_report_does_not_export_words(self):
        clips = load_manifest(self.manifest())
        with patch("speech_evaluation.recognize_audio", return_value={"text": "Java uses classes."}) as recognize:
            report = evaluate(clips, object(), "fake")
        call = recognize.call_args
        self.assertEqual(len(call.args), 3)
        self.assertEqual(call.args[0], b"dummy test input, never decoded")
        self.assertNotIn("Java", repr(call))
        self.assertNotIn("Java", json.dumps(report))
        self.assertEqual(report["totals"]["wer"], 0)
        self.assertFalse(report["meetsConfiguredBenchmarkThresholds"])
        self.assertFalse(report["enoughSamplesForConfiguredGate"])

    def test_rejected_clips_are_full_deletions_not_dropped_from_error_rates(self):
        clips = load_manifest(self.manifest())
        with patch("speech_evaluation.recognize_audio", side_effect=SpeechInputError("NO_USABLE_TRANSCRIPT", "Retry.")):
            report = evaluate(clips, object(), "fake")
        self.assertEqual(report["clipCount"], 1)
        self.assertEqual(report["totals"]["wer"], 1)
        self.assertEqual(report["totals"]["cer"], 1)
        self.assertEqual(report["totals"]["rejectedFraction"], 1)

    def test_error_rates_weight_by_reference_words_not_clip_means(self):
        second = {**self.clip, "id": "clip_2", "reference": "one two three four five six seven", "speakerGroup": "speaker_2"}
        clips = load_manifest(self.manifest([self.clip, second]))
        with patch("speech_evaluation.recognize_audio", side_effect=[{"text": "Java uses classes."}, {"text": ""}]):
            report = evaluate(clips, object(), "fake")
        self.assertEqual(report["totals"]["wer"], 0.7)


if __name__ == "__main__":
    unittest.main()
