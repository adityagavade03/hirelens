"""Bounded audio decoding and diagnostics shared by the local speech adapter/checks.

Metrics describe the recording, not a person's speaking ability or ASR accuracy.
No media or transcript is written to disk by these helpers.
"""
import io
import math
from dataclasses import dataclass

import av
import numpy as np

SAMPLE_RATE = 16000
MAX_SECONDS = 120
# Same threshold used by faster-whisper's decoding fallback. Reaching the final
# fallback does not make uniformly failing segments reliable interview evidence.
MIN_SEGMENT_LOG_PROBABILITY = -1.0


class SpeechInputError(ValueError):
    def __init__(self, code, message, status=422, diagnostics=None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.diagnostics = diagnostics


@dataclass
class DecodedAudio:
    samples: np.ndarray
    diagnostics: dict


def decode_audio(data):
    pieces, count = [], 0

    def append(converted):
        nonlocal count
        chunk = converted.to_ndarray().reshape(-1).astype(np.float32)
        count += chunk.size
        if count > SAMPLE_RATE * MAX_SECONDS:
            raise SpeechInputError("AUDIO_TOO_LONG", "Audio is longer than two minutes.", 413)
        if not np.isfinite(chunk).all():
            raise SpeechInputError("INVALID_AUDIO", "The recording contains invalid audio samples.", 400)
        pieces.append(chunk)

    try:
        with av.open(io.BytesIO(data)) as source:
            if not source.streams.audio:
                raise SpeechInputError("NO_AUDIO_TRACK", "The recording has no microphone track. Check the selected microphone and record again.")
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)
            for frame in source.decode(source.streams.audio[0]):
                for converted in resampler.resample(frame):
                    append(converted)
            # The resampler buffers the last samples when converting sample rates.
            # Flushing preserves short utterance endings and enforces the same limit.
            for converted in resampler.resample(None):
                append(converted)
    except SpeechInputError:
        raise
    except Exception as exc:
        raise SpeechInputError("INVALID_AUDIO", "The recording could not be decoded. Record a new segment.", 400) from exc
    if not pieces or count == 0:
        raise SpeechInputError("NO_AUDIO_SAMPLES", "The recording contains no decodable microphone audio. Check the microphone and record again.")
    samples = np.concatenate(pieces)
    rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
    peak = float(np.max(np.abs(samples)))
    clipped_fraction = float(np.mean(np.abs(samples) >= 0.999))
    diagnostics = {
        "durationSeconds": round(count / SAMPLE_RATE, 4),
        "sampleRate": SAMPLE_RATE,
        "sampleCount": count,
        # A finite floor keeps exact digital silence valid JSON.
        "rmsDbfs": round(20 * math.log10(max(rms, 1e-6)), 2),
        "peakDbfs": round(20 * math.log10(max(peak, 1e-6)), 2),
        "clippedFraction": round(clipped_fraction, 6),
        "warnings": [],
    }
    if rms < 0.01:
        diagnostics["warnings"].append("low_audio_level")
    if clipped_fraction > 0.01:
        diagnostics["warnings"].append("audio_clipping")
    # Reject only effectively digital silence; quiet speech is still passed to VAD.
    if peak <= 1e-6:
        raise SpeechInputError("NO_SPEECH_DETECTED", "No speech was detected. Check that the microphone is unmuted, speak near it, and record again.", diagnostics=diagnostics)
    return DecodedAudio(samples, diagnostics)


def recognize_audio(data, engine):
    decoded = decode_audio(data)
    segments, info = engine.transcribe(decoded.samples, beam_size=3, vad_filter=True,
                                      log_prob_threshold=MIN_SEGMENT_LOG_PROBABILITY,
                                      condition_on_previous_text=False)
    segments = list(segments)
    speech_seconds = float(info.duration_after_vad)
    decoded.diagnostics["speechSeconds"] = round(speech_seconds, 4)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    # Do not disable VAD or seed expected words to force a nonempty result.
    # A blank result is a retryable failure, not a successful transcript.
    if not text:
        if speech_seconds <= 0:
            raise SpeechInputError("NO_SPEECH_DETECTED", "No speech was detected. Check that the microphone is unmuted, speak near it, and record again.", diagnostics=decoded.diagnostics)
        raise SpeechInputError("NO_USABLE_TRANSCRIPT", "Speech was detected but could not be transcribed reliably. Retry or enter and review the transcript manually.", diagnostics=decoded.diagnostics)
    recognized_segments = [segment for segment in segments if segment.text.strip()]
    low_confidence = [segment for segment in recognized_segments
                      if getattr(segment, "avg_logprob", 0) < MIN_SEGMENT_LOG_PROBABILITY]
    decoded.diagnostics["recognizedSegments"] = len(recognized_segments)
    decoded.diagnostics["lowConfidenceSegments"] = len(low_confidence)
    if low_confidence:
        decoded.diagnostics["warnings"].append("low_recognition_confidence")
    if len(low_confidence) == len(recognized_segments):
        raise SpeechInputError("LOW_CONFIDENCE_TRANSCRIPT", "Speech recognition was too uncertain to use. Review the recording and enter the transcript manually, record again, or use another speech model.", diagnostics=decoded.diagnostics)
    return {"text": text, "diagnostics": decoded.diagnostics}
