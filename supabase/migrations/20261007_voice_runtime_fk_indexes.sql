-- Customer Care — 3B4A performance cleanup.
create index if not exists voice_runtime_profiles_primary_stt_idx
  on public.voice_runtime_profiles(primary_stt_adapter_key)
  where primary_stt_adapter_key is not null;
create index if not exists voice_runtime_profiles_fallback_stt_idx
  on public.voice_runtime_profiles(fallback_stt_adapter_key)
  where fallback_stt_adapter_key is not null;
create index if not exists voice_runtime_profiles_primary_tts_idx
  on public.voice_runtime_profiles(primary_tts_adapter_key)
  where primary_tts_adapter_key is not null;
create index if not exists voice_runtime_profiles_fallback_tts_idx
  on public.voice_runtime_profiles(fallback_tts_adapter_key)
  where fallback_tts_adapter_key is not null;
