# Minarva Technologies — Voice Engine Research

Updated: 2026-10-07

## Goal

Build the customer-care voice layer so that the core conversation engine is provider-neutral, portable and testable without paid telephony or paid AI APIs. Real phone dialing remains disabled until a separate provider milestone is explicitly approved.

## Current 3B3 decision

- Conversation/NLU: deterministic project-owned state machine for the sandbox.
- TTS in the browser sandbox: optional Web Speech `speechSynthesis`; this is only a convenience preview and is not treated as a production voice provider.
- STT in the browser sandbox: optional browser SpeechRecognition/WebKit SpeechRecognition when the device provides it; the text simulator remains authoritative because browser STT availability varies.
- No external LLM, TTS, STT or telephony credential is required for 3B3.

## Local / open-source candidates reviewed

### whisper.cpp
Official repository: https://github.com/ggml-org/whisper.cpp

- License: MIT.
- Portable C/C++ implementation.
- Supports CPU-only inference and multiple desktop/mobile platforms, including Windows, Android and WebAssembly.
- Strong candidate for future offline/on-premise STT where portability is more important than a Python stack.
- Not bundled yet; model licensing and the exact model artifact must still be reviewed separately before commercial redistribution.

### faster-whisper
Official repository: https://github.com/SYSTRAN/faster-whisper

- License: MIT.
- Python/server-oriented Whisper implementation using CTranslate2.
- Strong candidate for a self-hosted STT service on Minarva-owned infrastructure.
- Not bundled yet; model artifact licensing and hardware sizing must be reviewed before production selection.

### Vosk
Official repository: https://github.com/alphacep/vosk-api

- Core API source is Apache-2.0 licensed.
- Lightweight/offline speech-recognition option.
- Candidate for lower-resource deployments.
- Language/model quality for Malayalam must be benchmarked before selection; code license does not automatically establish every downloadable acoustic model's license.

## TTS note

A production local TTS engine is intentionally not locked in during 3B3. TTS projects and voice-model licenses can differ, so code license and individual voice/model license must both be verified before bundling or commercial distribution.

## Security / privacy design

- Sandbox conversations do not dial customers.
- Every outbound simulated call rechecks explicit call consent, Do Not Call and call-channel opt-out.
- Transcript storage is text-only and PII-redacted; raw audio is not stored by 3B3.
- A customer saying “do not call” immediately updates call opt-out and Do Not Call.
- “Already paid” does not silently change invoice/payment accounting; it becomes a verification outcome only.
- Disputes, wrong-number reports, unresolved service issues and human requests are escalated.
- Callback requests receive a scheduled callback timestamp.
- Conversation outcomes are written to the customer contact timeline.

## Portability

The conversation state machine lives in the JWT-protected Supabase Edge Function and database tables rather than a telephony provider. STT/TTS/telephony can therefore be replaced later without redesigning CRM, invoice, service-job, consent, callback or outcome logic.
