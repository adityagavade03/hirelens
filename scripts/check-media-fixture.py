"""Generate/decode synthetic media for check-media.ts. Never captures devices."""
import json
import hashlib
import math
import sys
from fractions import Fraction
from pathlib import Path

import av
import numpy as np


def inspect(path):
    info = {"videoFrames": 0, "audioFrames": 0, "audioSamples": 0, "audioSeconds": 0.0}
    audio_digest = hashlib.sha256()
    with av.open(path) as source:
        info["codecs"] = {stream.type: stream.codec_context.name for stream in source.streams}
        info["durationMs"] = round((source.duration or 0) / 1000)
        for frame in source.decode():
            if isinstance(frame, av.VideoFrame):
                info["videoFrames"] += 1
                info["width"], info["height"] = frame.width, frame.height
                # Force complete pixel decoding, not merely header parsing.
                if frame.to_ndarray(format="rgb24").size != frame.width * frame.height * 3:
                    raise RuntimeError("Video pixel decode failed")
            elif isinstance(frame, av.AudioFrame):
                info["audioFrames"] += 1
                info["audioSamples"] += frame.samples
                info["audioSeconds"] += frame.samples / frame.sample_rate
                samples = frame.to_ndarray()
                info["audioPeak"] = max(info.get("audioPeak", 0), float(np.max(np.abs(samples))))
                audio_digest.update(samples.astype("<f4").tobytes())
    info["audioSeconds"] = round(info["audioSeconds"], 4)
    info["decodedAudioSha256"] = audio_digest.hexdigest()
    return info


def generate(wav, target, participant="candidate"):
    if participant not in ("candidate", "hr"):
        raise ValueError("Choose candidate or hr for the synthetic participant variant.")
    with av.open(wav) as source:
        duration = (source.duration or 0) / 1_000_000
        if duration <= 0 or duration > 8:
            raise RuntimeError("Expected the existing synthetic speech sample, between 0 and 8 seconds")
        audio_frames = list(source.decode(audio=0))
    packets = []
    with av.open(target, mode="w", format="webm") as output:
        output.metadata["title"] = f"HireLens synthetic {participant} media check - no camera or microphone"
        video = output.add_stream("libvpx", rate=12)
        video.width, video.height, video.pix_fmt = 320, 180, "yuv420p"
        video.bit_rate = 150_000
        audio = output.add_stream("libopus", rate=48000)
        audio.layout = "mono"
        audio.bit_rate = 48_000
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=48000)
        for index in range(math.ceil(duration * 12)):
            pixels = np.zeros((180, 320, 3), dtype=np.uint8)
            pixels[:, :, :] = (25, 32, 48)
            pixels[25:155, (index * 7) % 240:(index * 7) % 240 + 80, :] = (235, 168, 55) if participant == "candidate" else (78, 154, 235)
            pixels[165:175, : max(1, round(320 * index / (duration * 12))), :] = (96, 185, 140)
            frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
            frame.pts, frame.time_base = index, Fraction(1, 12)
            packets.extend(video.encode(frame))
        packets.extend(video.encode(None))
        position = 0
        for original in audio_frames + [None]:
            for frame in resampler.resample(original):
                if participant == "hr":
                    # A distinct synthetic waveform detects cross-track mixups;
                    # it is not a different human voice or a speaker-ID test.
                    frame = av.AudioFrame.from_ndarray(frame.to_ndarray() * np.float32(0.65),
                                                       format="fltp", layout="mono")
                    frame.sample_rate = 48000
                frame.pts, frame.time_base = position, Fraction(1, 48000)
                position += frame.samples
                packets.extend(audio.encode(frame))
        packets.extend(audio.encode(None))
        packets.sort(key=lambda packet: float((packet.dts or 0) * packet.time_base))
        for packet in packets:
            output.mux(packet)
    return inspect(target)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "generate" and len(sys.argv) in (4, 5):
        result = generate(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4] if len(sys.argv) == 5 else "candidate")
    elif mode == "inspect" and len(sys.argv) == 3:
        result = inspect(Path(sys.argv[2]))
    else:
        raise SystemExit("Usage: check-media-fixture.py generate source.wav target.webm [candidate|hr] | inspect file.webm")
    print(json.dumps(result))
