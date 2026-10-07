#!/usr/bin/env python3
"""
Import a real benchmark artifact into public.voice_benchmark_runs.

Environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_ACCESS_TOKEN  (authenticated admin JWT)

No service-role key is required or accepted by this utility.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def post_rpc(url: str, anon: str, token: str, payload: dict) -> str:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/rpc/customer_care_voice_register_benchmark",
        data=body,
        method="POST",
        headers={
            "apikey": anon,
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase RPC failed: HTTP {exc.code}: {detail}") from exc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", required=True)
    ap.add_argument("--corpus-label", required=True)
    args = ap.parse_args()

    artifact = json.loads(Path(args.artifact).read_text(encoding="utf-8"))
    capability = artifact.get("capability")
    if capability not in ("stt", "tts"):
        raise ValueError("artifact capability must be stt or tts")
    adapter = artifact.get("adapter_key")
    if not adapter:
        raise ValueError("artifact missing adapter_key")

    url = required_env("SUPABASE_URL")
    anon = required_env("SUPABASE_ANON_KEY")
    token = required_env("SUPABASE_ACCESS_TOKEN")

    evidence = {
        "artifact_schema_version": artifact.get("schema_version"),
        "model": artifact.get("model") or artifact.get("voice_model"),
        "generated_at": artifact.get("generated_at"),
        "artifact_file": str(Path(args.artifact).resolve()),
    }

    imported = []
    for language, metrics in artifact.get("languages", {}).items():
        payload = {
            "p_adapter_key": adapter,
            "p_language": language,
            "p_corpus_label": args.corpus_label,
            "p_sample_count": metrics["sample_count"],
            "p_hardware_label": artifact.get("hardware_label") or "unknown",
            "p_runtime_version": artifact.get("runtime_version"),
            "p_median_latency_ms": metrics.get("median_latency_ms"),
            "p_p95_latency_ms": metrics.get("p95_latency_ms"),
            "p_realtime_factor": metrics.get("realtime_factor"),
            "p_word_error_rate": metrics.get("word_error_rate"),
            "p_character_error_rate": metrics.get("character_error_rate"),
            "p_tts_mos_proxy": metrics.get("tts_mos_proxy"),
            "p_memory_peak_mb": metrics.get("memory_peak_mb"),
            "p_notes": "Imported from reproducible local benchmark artifact.",
            "p_evidence": evidence,
        }
        result = post_rpc(url, anon, token, payload)
        imported.append({"language": language, "result": result})

    print(json.dumps({"imported": imported}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
