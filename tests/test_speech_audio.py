"""Local audio contract checks; no microphone, download, or model inference.

Run with .data/speech/venv/Scripts/python.exe -m unittest discover -s tests -p test_speech_audio.py
"""
import io
import sys
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace

import av
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from speech_audio import SpeechInputError, decode_audio, recognize_audio


def wav(samples, rate=48000):
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes((np.asarray(samples) * 32767).astype("<i2").tobytes())
    return output.getvalue()


def tone(seconds=1, rate=48000, gain=0.1):
    return np.sin(np.arange(round(seconds * rate)) * 2 * np.pi * 440 / rate) * gain


class FakeEngine:
    def __init__(self, text="Recognized speech.", speech_seconds=1, segments=None):
        self.text, self.speech_seconds, self.calls = text, speech_seconds, []
        self.segments = segments

    def transcribe(self, samples, **options):
        self.calls.append(options)
        segments = self.segments if self.segments is not None else ([SimpleNamespace(text=self.text, avg_logprob=-0.2)] if self.text else [])
        return iter(segments), SimpleNamespace(duration_after_vad=self.speech_seconds)


class SpeechAudioTests(unittest.TestCase):
    def test_resampling_flush_preserves_final_samples(self):
        result = decode_audio(wav(tone(seconds=0.25)))
        self.assertEqual(result.samples.size, 4000)
        self.assertEqual(result.diagnostics["durationSeconds"], 0.25)
        self.assertEqual(result.diagnostics["sampleRate"], 16000)

    def test_digital_silence_is_never_sent_to_recognizer(self):
        engine = FakeEngine("This must not become a transcript.")
        with self.assertRaises(SpeechInputError) as error:
            recognize_audio(wav(np.zeros(48000)), engine)
        self.assertEqual(error.exception.code, "NO_SPEECH_DETECTED")
        self.assertEqual(error.exception.status, 422)
        self.assertEqual(engine.calls, [])

    def test_low_level_audio_is_diagnosed_but_not_automatically_rejected(self):
        result = recognize_audio(wav(tone(gain=0.001)), FakeEngine())
        self.assertEqual(result["text"], "Recognized speech.")
        self.assertIn("low_audio_level", result["diagnostics"]["warnings"])

    def test_no_vad_speech_returns_specific_retryable_failure(self):
        engine = FakeEngine(text="", speech_seconds=0)
        with self.assertRaises(SpeechInputError) as error:
            recognize_audio(wav(tone()), engine)
        self.assertEqual(error.exception.code, "NO_SPEECH_DETECTED")
        self.assertEqual(len(engine.calls), 1)
        self.assertTrue(engine.calls[0]["vad_filter"])

    def test_detected_but_unrecognized_speech_does_not_return_blank_success(self):
        with self.assertRaises(SpeechInputError) as error:
            recognize_audio(wav(tone()), FakeEngine(text="  ", speech_seconds=0.8))
        self.assertEqual(error.exception.code, "NO_USABLE_TRANSCRIPT")
        self.assertEqual(error.exception.diagnostics["speechSeconds"], 0.8)

    def test_success_does_not_seed_or_change_recognized_words(self):
        engine = FakeEngine(text="  Genuine result only.  ")
        result = recognize_audio(wav(tone()), engine)
        self.assertEqual(result["text"], "Genuine result only.")
        self.assertNotIn("initial_prompt", engine.calls[0])
        self.assertNotIn("hotwords", engine.calls[0])

    def test_uniformly_weak_recognition_is_not_reported_as_ready(self):
        engine = FakeEngine(segments=[SimpleNamespace(text="Uncertain words.", avg_logprob=-1.28),
                                      SimpleNamespace(text="Another guess.", avg_logprob=-1.01)])
        with self.assertRaises(SpeechInputError) as error:
            recognize_audio(wav(tone()), engine)
        self.assertEqual(error.exception.code, "LOW_CONFIDENCE_TRANSCRIPT")
        self.assertEqual(error.exception.status, 422)
        self.assertEqual(error.exception.diagnostics["lowConfidenceSegments"], 2)
        self.assertEqual(engine.calls[0]["log_prob_threshold"], -1.0)
        self.assertEqual(len(engine.calls), 1)

    def test_confident_recognition_is_preserved(self):
        result = recognize_audio(wav(tone()), FakeEngine(segments=[SimpleNamespace(text="Clear words.", avg_logprob=-0.3)]))
        self.assertEqual(result["text"], "Clear words.")
        self.assertEqual(result["diagnostics"]["lowConfidenceSegments"], 0)

    def test_mixed_confidence_is_preserved_with_diagnostic_warning(self):
        result = recognize_audio(wav(tone()), FakeEngine(segments=[SimpleNamespace(text="Clear words.", avg_logprob=-0.3),
                                                                 SimpleNamespace(text="Uncertain words.", avg_logprob=-1.2)]))
        self.assertEqual(result["text"], "Clear words. Uncertain words.")
        self.assertEqual(result["diagnostics"]["lowConfidenceSegments"], 1)
        self.assertIn("low_recognition_confidence", result["diagnostics"]["warnings"])

    def test_threshold_boundary_is_not_rejected(self):
        result = recognize_audio(wav(tone()), FakeEngine(segments=[SimpleNamespace(text="Boundary result.", avg_logprob=-1.0)]))
        self.assertEqual(result["text"], "Boundary result.")

    def test_blank_segment_does_not_mask_weak_recognition(self):
        with self.assertRaises(SpeechInputError) as error:
            recognize_audio(wav(tone()), FakeEngine(segments=[SimpleNamespace(text=" ", avg_logprob=-0.2),
                                                             SimpleNamespace(text="Uncertain words.", avg_logprob=-1.2)]))
        self.assertEqual(error.exception.code, "LOW_CONFIDENCE_TRANSCRIPT")

    def test_clipping_is_diagnosed(self):
        samples = np.tile([0.99999, -0.99999], 8000)
        result = decode_audio(wav(samples, rate=16000))
        self.assertIn("audio_clipping", result.diagnostics["warnings"])

    def test_too_long_audio_is_rejected(self):
        with self.assertRaises(SpeechInputError) as error:
            decode_audio(wav(tone(seconds=120.1, rate=16000), rate=16000))
        self.assertEqual(error.exception.code, "AUDIO_TOO_LONG")
        self.assertEqual(error.exception.status, 413)

    def test_malformed_file_is_rejected(self):
        with self.assertRaises(SpeechInputError) as error:
            decode_audio(b"not a recording")
        self.assertEqual(error.exception.code, "INVALID_AUDIO")

    def test_video_without_microphone_track_is_rejected(self):
        output = io.BytesIO()
        with av.open(output, mode="w", format="webm") as target:
            stream = target.add_stream("libvpx", rate=1)
            stream.width, stream.height, stream.pix_fmt = 16, 16, "yuv420p"
            frame = av.VideoFrame.from_ndarray(np.zeros((16, 16, 3), dtype=np.uint8), format="rgb24")
            for packet in stream.encode(frame):
                target.mux(packet)
            for packet in stream.encode(None):
                target.mux(packet)
        with self.assertRaises(SpeechInputError) as error:
            decode_audio(output.getvalue())
        self.assertEqual(error.exception.code, "NO_AUDIO_TRACK")


if __name__ == "__main__":
    unittest.main()
