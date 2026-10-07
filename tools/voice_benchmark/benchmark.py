#!/usr/bin/env python3
"""
Minarva Technologies - local STT benchmark harness.

Reproducible, dependency-light benchmark runner for:
- whisper.cpp
- faster-whisper
- Vosk

Input: JSONL corpus manifest.
Output: JSON benchmark artifact compatible with voice_benchmark_runs import.

No benchmark values are fabricated. The script exits if required binaries,
models, packages, or audio files are missing.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import platform
import resource
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


def normalize_text(text: str) -> str:
    return " ".join(
        text.casefold()
        .replace("\n", " ")
        .replace("\t", " ")
        .split()
    )


def levenshtein(ref: list[str], hyp: list[str]) -> int:
    if len(ref) < len(hyp):
        ref, hyp = hyp, ref
    previous = list(range(len(hyp) + 1))
    for i, a in enumerate(ref, 1):
        current = [i]
        for j, b in enumerate(hyp, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + (a != b),
                )
            )
        previous = current
    return previous[-1]


def wer(reference: str, hypothesis: str) -> float:
    r = normalize_text(reference).split()
    h = normalize_text(hypothesis).split()
    if not r:
        return 0.0 if not h else 1.0
    return levenshtein(r, h) / len(r)


def cer(reference: str, hypothesis: str) -> float:
    r = list(normalize_text(reference).replace(" ", ""))
    h = list(normalize_text(hypothesis).replace(" ", ""))
    if not r:
        return 0.0 if not h else 1.0
    return levenshtein(r, h) / len(r)


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return ordered[lo]
    frac = rank - lo
    return ordered[lo] * (1 - frac) + ordered[hi] * frac


def max_rss_mb_self() -> float:
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return rss / (1024 * 1024)
    return rss / 1024


def max_rss_mb_children() -> float:
    rss = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    if sys.platform == "darwin":
        return rss / (1024 * 1024)
    return rss / 1024


def wav_duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def ensure_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise RuntimeError("ffmpeg is required for normalization but was not found in PATH")
    return exe


def normalize_audio(src: Path, dst: Path) -> None:
    ffmpeg = ensure_ffmpeg()
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    subprocess.run(cmd, check=True)


@dataclass
class Sample:
    sample_id: str
    language: str
    audio_path: Path
    reference_text: str


def load_manifest(path: Path, root: Path | None) -> list[Sample]:
    samples: list[Sample] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            row = json.loads(line)
            for key in ("id", "language", "audio_path", "reference_text"):
                if key not in row:
                    raise ValueError(f"{path}:{line_no}: missing {key}")
            if row["language"] not in ("ml", "en"):
                raise ValueError(f"{path}:{line_no}: language must be ml or en")
            audio = Path(row["audio_path"])
            if not audio.is_absolute():
                audio = (root or path.parent) / audio
            audio = audio.resolve()
            if not audio.exists():
                raise FileNotFoundError(f"{path}:{line_no}: audio not found: {audio}")
            samples.append(
                Sample(
                    sample_id=str(row["id"]),
                    language=row["language"],
                    audio_path=audio,
                    reference_text=str(row["reference_text"]),
                )
            )
    if not samples:
        raise ValueError("Manifest contains no benchmark samples")
    return samples


def transcribe_whisper_cpp(audio: Path, language: str, args: argparse.Namespace) -> str:
    exe = Path(args.whisper_cpp_bin).expanduser().resolve()
    model = Path(args.model).expanduser().resolve()
    if not exe.exists():
        raise FileNotFoundError(f"whisper.cpp executable not found: {exe}")
    if not model.exists():
        raise FileNotFoundError(f"whisper.cpp model not found: {model}")
    cmd = [
        str(exe),
        "-m",
        str(model),
        "-f",
        str(audio),
        "-l",
        language,
        "-np",
        "-nt",
    ]
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return proc.stdout.strip()


_fw_models: dict[tuple[str, str, str], object] = {}


def transcribe_faster_whisper(audio: Path, language: str, args: argparse.Namespace) -> str:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Install it in the benchmark environment first."
        ) from exc
    key = (args.model, args.device, args.compute_type)
    model = _fw_models.get(key)
    if model is None:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        _fw_models[key] = model
    segments, _info = model.transcribe(
        str(audio),
        language=language,
        beam_size=args.beam_size,
        vad_filter=args.vad_filter,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()


_vosk_models: dict[str, object] = {}


def transcribe_vosk(audio: Path, language: str, args: argparse.Namespace) -> str:
    del language
    try:
        from vosk import KaldiRecognizer, Model
    except ImportError as exc:
        raise RuntimeError(
            "vosk is not installed. Install it in the benchmark environment first."
        ) from exc
    model_path = str(Path(args.model).expanduser().resolve())
    if not Path(model_path).exists():
        raise FileNotFoundError(f"Vosk model not found: {model_path}")
    model = _vosk_models.get(model_path)
    if model is None:
        model = Model(model_path)
        _vosk_models[model_path] = model

    with wave.open(str(audio), "rb") as wf:
        if wf.getnchannels() != 1 or wf.getframerate() != 16000 or wf.getsampwidth() != 2:
            raise RuntimeError("Vosk input must be normalized 16 kHz mono PCM16 WAV")
        rec = KaldiRecognizer(model, wf.getframerate())
        parts: list[str] = []
        while True:
            data = wf.readframes(4000)
            if not data:
                break
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if result.get("text"):
                    parts.append(result["text"])
        final = json.loads(rec.FinalResult())
        if final.get("text"):
            parts.append(final["text"])
    return " ".join(parts).strip()


def transcribe(audio: Path, language: str, args: argparse.Namespace) -> str:
    if args.adapter == "whisper_cpp_stt":
        return transcribe_whisper_cpp(audio, language, args)
    if args.adapter == "faster_whisper_stt":
        return transcribe_faster_whisper(audio, language, args)
    if args.adapter == "vosk_stt":
        return transcribe_vosk(audio, language, args)
    raise ValueError(f"Unsupported adapter: {args.adapter}")


def hardware_label() -> str:
    return f"{platform.system()} {platform.release()} | {platform.machine()} | {platform.processor() or 'unknown-cpu'}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", required=True, choices=[
        "whisper_cpp_stt", "faster_whisper_stt", "vosk_stt"
    ])
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--corpus-root")
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--hardware-label", default=hardware_label())
    parser.add_argument("--runtime-version")
    parser.add_argument("--whisper-cpp-bin", default="./whisper-cli")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--vad-filter", action="store_true")
    parser.add_argument("--keep-normalized", action="store_true")
    args = parser.parse_args()

    manifest = Path(args.manifest).resolve()
    root = Path(args.corpus_root).resolve() if args.corpus_root else None
    samples = load_manifest(manifest, root)

    by_language: dict[str, list[Sample]] = {"ml": [], "en": []}
    for sample in samples:
        by_language[sample.language].append(sample)

    report = {
        "schema_version": 1,
        "adapter_key": args.adapter,
        "capability": "stt",
        "model": args.model,
        "hardware_label": args.hardware_label,
        "runtime_version": args.runtime_version,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "languages": {},
        "samples": [],
    }

    with tempfile.TemporaryDirectory(prefix="minarva-voice-bench-") as td:
        temp = Path(td)
        for idx, sample in enumerate(samples, 1):
            normalized = temp / f"{idx:04d}-{sample.sample_id}.wav"
            normalize_audio(sample.audio_path, normalized)
            duration = wav_duration_seconds(normalized)

            rss_before = max(max_rss_mb_self(), max_rss_mb_children())
            started = time.perf_counter()
            hypothesis = transcribe(normalized, sample.language, args)
            latency = time.perf_counter() - started
            rss_after = max(max_rss_mb_self(), max_rss_mb_children())

            row = {
                "id": sample.sample_id,
                "language": sample.language,
                "audio_path": str(sample.audio_path),
                "reference_text": sample.reference_text,
                "hypothesis_text": hypothesis,
                "duration_seconds": round(duration, 6),
                "latency_ms": round(latency * 1000, 3),
                "realtime_factor": round(latency / duration, 6) if duration > 0 else None,
                "wer": round(wer(sample.reference_text, hypothesis), 6),
                "cer": round(cer(sample.reference_text, hypothesis), 6),
                "memory_peak_mb_observed": round(max(rss_before, rss_after), 3),
            }
            report["samples"].append(row)

            if args.keep_normalized:
                keep = Path(args.output).resolve().parent / "normalized_audio"
                keep.mkdir(parents=True, exist_ok=True)
                shutil.copy2(normalized, keep / normalized.name)

    for language in ("ml", "en"):
        rows = [r for r in report["samples"] if r["language"] == language]
        if not rows:
            continue
        latencies = [r["latency_ms"] for r in rows]
        rtfs = [r["realtime_factor"] for r in rows if r["realtime_factor"] is not None]
        report["languages"][language] = {
            "sample_count": len(rows),
            "median_latency_ms": round(statistics.median(latencies), 3),
            "p95_latency_ms": round(percentile(latencies, 0.95), 3),
            "realtime_factor": round(statistics.mean(rtfs), 6) if rtfs else None,
            "word_error_rate": round(statistics.mean(r["wer"] for r in rows), 6),
            "character_error_rate": round(statistics.mean(r["cer"] for r in rows), 6),
            "memory_peak_mb": round(max(r["memory_peak_mb_observed"] for r in rows), 3),
        }

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote real benchmark artifact: {output}")
    for language, metrics in report["languages"].items():
        print(language, json.dumps(metrics, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
