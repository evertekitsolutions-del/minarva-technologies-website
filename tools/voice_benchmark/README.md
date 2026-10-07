# Local Speech Benchmark Harness

This folder benchmarks speech engines **without inventing results** and without enabling real customer calling.

## Requirements

- Python 3.10+
- `ffmpeg` in PATH for STT corpus normalization
- candidate runtime/model installed locally
- real Malayalam / English audio corpus with permission to use it

No customer production audio should be used unless consent, privacy, and retention rules explicitly allow it.

## STT corpus manifest

JSONL, one object per line:

```json
{"id":"ml-001","language":"ml","audio_path":"audio/ml-001.wav","reference_text":"നമസ്കാരം ഇത് ഒരു ടെസ്റ്റ് വാചകമാണ്"}
{"id":"en-001","language":"en","audio_path":"audio/en-001.wav","reference_text":"Hello this is a test sentence"}
```

Required fields:
- `id`
- `language`: `ml` or `en`
- `audio_path`
- `reference_text`

The harness normalizes every sample to **16 kHz, mono, PCM16 WAV** before inference.

## STT engines

### whisper.cpp

Use the current official `whisper-cli` binary and a separately reviewed model artifact.

```bash
python tools/voice_benchmark/benchmark.py \
  --adapter whisper_cpp_stt \
  --manifest /data/corpus.jsonl \
  --model /models/ggml-model.bin \
  --whisper-cpp-bin /opt/whisper.cpp/build/bin/whisper-cli \
  --runtime-version "whisper.cpp <commit-or-release>" \
  --hardware-label "CPU/GPU description" \
  --output /data/results/whisper-cpp.json
```

### faster-whisper

Install `faster-whisper` in an isolated benchmark environment first.

```bash
python tools/voice_benchmark/benchmark.py \
  --adapter faster_whisper_stt \
  --manifest /data/corpus.jsonl \
  --model large-v3 \
  --device cpu \
  --compute-type int8 \
  --runtime-version "faster-whisper <version>" \
  --hardware-label "CPU/GPU description" \
  --output /data/results/faster-whisper.json
```

### Vosk

Vosk support depends on an appropriate language model. Do **not** claim Malayalam support unless the selected model actually supports Malayalam and its license is reviewed.

```bash
python tools/voice_benchmark/benchmark.py \
  --adapter vosk_stt \
  --manifest /data/corpus.jsonl \
  --model /models/vosk-model-path \
  --runtime-version "vosk <version>" \
  --hardware-label "CPU description" \
  --output /data/results/vosk.json
```

## Metrics

The harness records, per sample and per language:

- latency
- realtime factor
- WER
- CER
- observed process/child max RSS
- transcript hypothesis

Aggregate results use median latency and p95 latency.

### Important comparability rule

Benchmark the same corpus, same hardware, same normalization, and explicitly record model/runtime versions. Otherwise engine-to-engine comparisons are not valid.

## TTS corpus

TTS JSONL:

```json
{"id":"ml-tts-001","language":"ml","text":"നമസ്കാരം. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്."}
{"id":"en-tts-001","language":"en","text":"Hello. This is Minarva Technologies calling."}
```

TTS execution is intentionally command-template based because Piper/Kokoro package interfaces and model licensing can differ by deployment.

```bash
python tools/voice_benchmark/tts_benchmark.py \
  --adapter piper_tts \
  --manifest /data/tts.jsonl \
  --voice-model /models/voice.onnx \
  --command-template '/opt/my-tts-wrapper --text-file {text_file} --output {output_wav} --voice {voice_model} --lang {language}' \
  --hardware-label "CPU description" \
  --runtime-version "runtime version" \
  --output /data/results/piper.json
```

The harness **does not invent a MOS score**. `tts_mos_proxy` remains null until a real listening evaluation is performed.

## Import into Supabase

The artifact importer requires an authenticated **admin user token**, not a service-role secret.

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<publishable/anon key>"
export SUPABASE_ACCESS_TOKEN="<current admin access token>"

python tools/voice_benchmark/import_result.py \
  --artifact /data/results/whisper-cpp.json \
  --corpus-label "Minarva bilingual benchmark v1"
```

The server RPC validates the adapter/language and stores only real measured metrics in `voice_benchmark_runs`.

## Selection gate

Do not enable a primary STT/TTS engine until:

1. Malayalam and English are both measured where relevant.
2. Exact model/voice licenses are reviewed.
3. Hardware cost and latency are acceptable.
4. Accuracy/quality evidence is recorded.
5. No benchmark numbers were manually fabricated.
6. Real telephony is still disabled until a separate go-live approval.
