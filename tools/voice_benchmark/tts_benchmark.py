#!/usr/bin/env python3
"""
Provider-neutral local TTS benchmark harness.

It deliberately uses a command template instead of hardcoding a specific Piper/Kokoro
CLI, because runtime packaging and voice/model licenses can differ.

The command must generate a WAV file at {output_wav}. Supported placeholders:
{text_file}, {output_wav}, {language}, {voice_model}
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shlex
import statistics
import subprocess
import tempfile
import time
import wave
from pathlib import Path


def wav_duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    if len(values) == 1:
        return values[0]
    rank = (len(values) - 1) * p
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return values[lo]
    f = rank - lo
    return values[lo] * (1 - f) + values[hi] * f


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", required=True, choices=["piper_tts", "kokoro_tts"])
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--command-template", required=True)
    ap.add_argument("--voice-model", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--hardware-label", required=True)
    ap.add_argument("--runtime-version")
    args = ap.parse_args()

    rows = []
    with Path(args.manifest).open("r", encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            row = json.loads(line)
            for key in ("id", "language", "text"):
                if key not in row:
                    raise ValueError(f"manifest line {n}: missing {key}")
            if row["language"] not in ("ml", "en"):
                raise ValueError(f"manifest line {n}: language must be ml or en")
            rows.append(row)
    if not rows:
        raise ValueError("manifest contains no TTS samples")

    report = {
        "schema_version": 1,
        "adapter_key": args.adapter,
        "capability": "tts",
        "voice_model": args.voice_model,
        "hardware_label": args.hardware_label,
        "runtime_version": args.runtime_version,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "languages": {},
        "samples": [],
        "tts_mos_proxy": None,
        "note": "MOS/quality is intentionally null until a real listening evaluation is recorded.",
    }

    with tempfile.TemporaryDirectory(prefix="minarva-tts-bench-") as td:
        work = Path(td)
        for i, row in enumerate(rows, 1):
            text_file = work / f"{i:04d}.txt"
            output_wav = work / f"{i:04d}.wav"
            text_file.write_text(str(row["text"]), encoding="utf-8")
            command = args.command_template.format(
                text_file=str(text_file),
                output_wav=str(output_wav),
                language=row["language"],
                voice_model=args.voice_model,
            )
            started = time.perf_counter()
            subprocess.run(shlex.split(command), check=True)
            latency = time.perf_counter() - started
            if not output_wav.exists():
                raise RuntimeError(f"TTS command did not create {output_wav}")
            duration = wav_duration_seconds(output_wav)
            report["samples"].append({
                "id": row["id"],
                "language": row["language"],
                "text": row["text"],
                "latency_ms": round(latency * 1000, 3),
                "output_duration_ms": round(duration * 1000, 3),
                "realtime_factor": round(latency / duration, 6) if duration > 0 else None,
            })

    for language in ("ml", "en"):
        rs = [r for r in report["samples"] if r["language"] == language]
        if not rs:
            continue
        lats = [r["latency_ms"] for r in rs]
        rtfs = [r["realtime_factor"] for r in rs if r["realtime_factor"] is not None]
        report["languages"][language] = {
            "sample_count": len(rs),
            "median_latency_ms": round(statistics.median(lats), 3),
            "p95_latency_ms": round(percentile(lats, 0.95), 3),
            "realtime_factor": round(statistics.mean(rtfs), 6) if rtfs else None,
            "tts_mos_proxy": None,
        }

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote real TTS benchmark artifact: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
