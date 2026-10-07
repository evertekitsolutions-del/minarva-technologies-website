-- Customer Care — Milestone 3B4A
-- Self-hosted speech runtime contracts, benchmark registry and telephony adapter contract.
-- No real telephony or external speech provider is enabled.

insert into public.ai_speech_adapters(
  adapter_key,capability,display_name,runtime,enabled,production_approved,license,notes
)
values
  ('piper_tts','tts','Piper TTS','local',false,false,'MIT','Local TTS candidate. Individual voice/model licenses must be reviewed before bundling.'),
  ('kokoro_tts','tts','Kokoro TTS','local',false,false,'Apache-2.0 core; runtime dependencies vary','Local TTS candidate. Review the exact runtime and selected voice/model licenses before commercial distribution.'),
  ('mimic3_tts','tts','Mimic 3','local',false,false,'AGPL-3.0','Local TTS candidate with copyleft obligations; lower-priority candidate for commercial packaging.')
on conflict(adapter_key) do update set
  display_name=excluded.display_name,
  runtime=excluded.runtime,
  license=excluded.license,
  notes=excluded.notes,
  updated_at=now();

create table if not exists public.voice_runtime_profiles (
  singleton boolean primary key default true check(singleton),
  primary_stt_adapter_key text references public.ai_speech_adapters(adapter_key) on delete set null,
  fallback_stt_adapter_key text references public.ai_speech_adapters(adapter_key) on delete set null,
  primary_tts_adapter_key text references public.ai_speech_adapters(adapter_key) on delete set null,
  fallback_tts_adapter_key text references public.ai_speech_adapters(adapter_key) on delete set null,
  input_encoding text not null default 'pcm_s16le',
  input_container text not null default 'wav',
  sample_rate_hz integer not null default 16000 check(sample_rate_hz between 8000 and 48000),
  channels integer not null default 1 check(channels in (1,2)),
  max_audio_seconds integer not null default 120 check(max_audio_seconds between 5 and 900),
  vad_enabled boolean not null default true,
  vad_min_speech_ms integer not null default 250 check(vad_min_speech_ms between 50 and 5000),
  vad_silence_ms integer not null default 800 check(vad_silence_ms between 100 and 10000),
  request_timeout_ms integer not null default 30000 check(request_timeout_ms between 1000 and 180000),
  max_retries integer not null default 2 check(max_retries between 0 and 10),
  live_audio_streaming_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.voice_runtime_profiles(singleton)
values(true)
on conflict(singleton) do nothing;

create table if not exists public.voice_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null references public.ai_speech_adapters(adapter_key) on delete restrict,
  capability text not null check(capability in ('stt','tts')),
  language text not null check(language in ('ml','en')),
  corpus_label text not null,
  sample_count integer not null check(sample_count > 0),
  hardware_label text not null,
  runtime_version text,
  median_latency_ms numeric(12,2) check(median_latency_ms is null or median_latency_ms >= 0),
  p95_latency_ms numeric(12,2) check(p95_latency_ms is null or p95_latency_ms >= 0),
  realtime_factor numeric(12,4) check(realtime_factor is null or realtime_factor >= 0),
  word_error_rate numeric(8,4) check(word_error_rate is null or (word_error_rate >= 0 and word_error_rate <= 1)),
  character_error_rate numeric(8,4) check(character_error_rate is null or (character_error_rate >= 0 and character_error_rate <= 1)),
  tts_mos_proxy numeric(5,2) check(tts_mos_proxy is null or (tts_mos_proxy >= 1 and tts_mos_proxy <= 5)),
  memory_peak_mb numeric(12,2) check(memory_peak_mb is null or memory_peak_mb >= 0),
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists voice_benchmark_runs_adapter_language_idx
  on public.voice_benchmark_runs(adapter_key,language,created_at desc);
create index if not exists voice_benchmark_runs_created_by_idx
  on public.voice_benchmark_runs(created_by)
  where created_by is not null;

create table if not exists public.voice_runtime_requests (
  id uuid primary key,
  session_id uuid references public.ai_call_sessions(id) on delete set null,
  capability text not null check(capability in ('stt','tts')),
  adapter_key text references public.ai_speech_adapters(adapter_key) on delete set null,
  language text not null check(language in ('ml','en')),
  status text not null default 'queued'
    check(status in ('queued','processing','completed','failed','cancelled')),
  request_payload_redacted jsonb not null default '{}'::jsonb,
  response_payload_redacted jsonb,
  input_duration_ms integer check(input_duration_ms is null or input_duration_ms >= 0),
  output_duration_ms integer check(output_duration_ms is null or output_duration_ms >= 0),
  latency_ms integer check(latency_ms is null or latency_ms >= 0),
  retry_count integer not null default 0 check(retry_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(id,capability)
);

create index if not exists voice_runtime_requests_status_created_idx
  on public.voice_runtime_requests(status,created_at);
create index if not exists voice_runtime_requests_session_idx
  on public.voice_runtime_requests(session_id,created_at desc)
  where session_id is not null;
create index if not exists voice_runtime_requests_adapter_idx
  on public.voice_runtime_requests(adapter_key,created_at desc)
  where adapter_key is not null;

create table if not exists public.telephony_adapter_contracts (
  adapter_key text primary key,
  display_name text not null,
  provider_family text not null default 'unconfigured',
  enabled boolean not null default false,
  live_enabled boolean not null default false,
  webhook_enabled boolean not null default false,
  supports_outbound boolean not null default true,
  supports_inbound boolean not null default false,
  supports_dtmf boolean not null default true,
  supports_recording boolean not null default false,
  supports_streaming_audio boolean not null default false,
  supports_voicemail_detection boolean not null default false,
  currency text not null default 'INR',
  endpoint_ref text,
  secret_ref text,
  config_schema jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.telephony_adapter_contracts(
  adapter_key,display_name,provider_family,enabled,live_enabled,webhook_enabled,
  supports_outbound,supports_inbound,supports_dtmf,supports_recording,
  supports_streaming_audio,supports_voicemail_detection,notes
)
values(
  'telephony_unconfigured',
  'Telephony Provider — Not Connected',
  'unconfigured',
  false,false,false,
  true,false,true,false,false,false,
  'Contract placeholder only. Real dialing remains disabled.'
)
on conflict(adapter_key) do nothing;

create table if not exists public.telephony_webhook_events (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null references public.telephony_adapter_contracts(adapter_key) on delete restrict,
  provider_event_id text not null,
  event_type text not null,
  call_leg_id text,
  ai_session_id uuid references public.ai_call_sessions(id) on delete set null,
  received_at timestamptz not null default now(),
  payload_redacted jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  processing_error text,
  unique(adapter_key,provider_event_id)
);

create index if not exists telephony_webhook_events_processed_idx
  on public.telephony_webhook_events(processed,received_at);
create index if not exists telephony_webhook_events_session_idx
  on public.telephony_webhook_events(ai_session_id,received_at desc)
  where ai_session_id is not null;

create table if not exists public.telephony_call_usage (
  id uuid primary key default gen_random_uuid(),
  ai_session_id uuid references public.ai_call_sessions(id) on delete set null,
  adapter_key text references public.telephony_adapter_contracts(adapter_key) on delete set null,
  provider_call_id text,
  call_leg_id text,
  sandbox boolean not null default true,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check(duration_seconds is null or duration_seconds >= 0),
  billable_seconds integer check(billable_seconds is null or billable_seconds >= 0),
  currency text not null default 'INR',
  cost_amount numeric(14,4) check(cost_amount is null or cost_amount >= 0),
  outcome text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists telephony_call_usage_session_idx
  on public.telephony_call_usage(ai_session_id,created_at desc)
  where ai_session_id is not null;
create index if not exists telephony_call_usage_provider_call_idx
  on public.telephony_call_usage(adapter_key,provider_call_id)
  where provider_call_id is not null;

drop trigger if exists voice_runtime_profiles_updated_at on public.voice_runtime_profiles;
create trigger voice_runtime_profiles_updated_at
before update on public.voice_runtime_profiles
for each row execute function private.set_updated_at();

drop trigger if exists telephony_adapter_contracts_updated_at on public.telephony_adapter_contracts;
create trigger telephony_adapter_contracts_updated_at
before update on public.telephony_adapter_contracts
for each row execute function private.set_updated_at();

alter table public.voice_runtime_profiles enable row level security;
alter table public.voice_benchmark_runs enable row level security;
alter table public.voice_runtime_requests enable row level security;
alter table public.telephony_adapter_contracts enable row level security;
alter table public.telephony_webhook_events enable row level security;
alter table public.telephony_call_usage enable row level security;

revoke all on public.voice_runtime_profiles from anon;
revoke all on public.voice_benchmark_runs from anon;
revoke all on public.voice_runtime_requests from anon;
revoke all on public.telephony_adapter_contracts from anon;
revoke all on public.telephony_webhook_events from anon;
revoke all on public.telephony_call_usage from anon;

grant select,insert,update,delete on public.voice_runtime_profiles to authenticated;
grant select,insert,update,delete on public.voice_benchmark_runs to authenticated;
grant select,insert,update,delete on public.voice_runtime_requests to authenticated;
grant select,insert,update,delete on public.telephony_adapter_contracts to authenticated;
grant select,insert,update,delete on public.telephony_webhook_events to authenticated;
grant select,insert,update,delete on public.telephony_call_usage to authenticated;

drop policy if exists "active_admin_manage_voice_runtime_profiles" on public.voice_runtime_profiles;
create policy "active_admin_manage_voice_runtime_profiles"
on public.voice_runtime_profiles for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_voice_benchmark_runs" on public.voice_benchmark_runs;
create policy "active_admin_manage_voice_benchmark_runs"
on public.voice_benchmark_runs for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_voice_runtime_requests" on public.voice_runtime_requests;
create policy "active_admin_manage_voice_runtime_requests"
on public.voice_runtime_requests for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_telephony_adapter_contracts" on public.telephony_adapter_contracts;
create policy "active_admin_manage_telephony_adapter_contracts"
on public.telephony_adapter_contracts for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_telephony_webhook_events" on public.telephony_webhook_events;
create policy "active_admin_manage_telephony_webhook_events"
on public.telephony_webhook_events for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_telephony_call_usage" on public.telephony_call_usage;
create policy "active_admin_manage_telephony_call_usage"
on public.telephony_call_usage for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create or replace function public.customer_care_voice_register_benchmark(
  p_adapter_key text,
  p_language text,
  p_corpus_label text,
  p_sample_count integer,
  p_hardware_label text,
  p_runtime_version text default null,
  p_median_latency_ms numeric default null,
  p_p95_latency_ms numeric default null,
  p_realtime_factor numeric default null,
  p_word_error_rate numeric default null,
  p_character_error_rate numeric default null,
  p_tts_mos_proxy numeric default null,
  p_memory_peak_mb numeric default null,
  p_notes text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_adapter public.ai_speech_adapters%rowtype;
  v_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to register voice benchmarks' using errcode='42501';
  end if;

  select * into v_adapter
  from public.ai_speech_adapters
  where adapter_key=p_adapter_key;

  if not found then raise exception 'Speech adapter not found'; end if;
  if v_adapter.capability not in ('stt','tts') then raise exception 'Adapter is not STT/TTS'; end if;
  if p_language not in ('ml','en') then raise exception 'Invalid benchmark language'; end if;
  if coalesce(p_sample_count,0)<=0 then raise exception 'Sample count must be positive'; end if;

  insert into public.voice_benchmark_runs(
    adapter_key,capability,language,corpus_label,sample_count,hardware_label,
    runtime_version,median_latency_ms,p95_latency_ms,realtime_factor,
    word_error_rate,character_error_rate,tts_mos_proxy,memory_peak_mb,
    notes,evidence,created_by
  )
  values(
    v_adapter.adapter_key,v_adapter.capability,p_language,btrim(p_corpus_label),
    p_sample_count,btrim(p_hardware_label),nullif(btrim(coalesce(p_runtime_version,'')),''),
    p_median_latency_ms,p_p95_latency_ms,p_realtime_factor,p_word_error_rate,
    p_character_error_rate,p_tts_mos_proxy,p_memory_peak_mb,
    nullif(btrim(coalesce(p_notes,'')),''),coalesce(p_evidence,'{}'::jsonb),auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.customer_care_voice_register_benchmark(
  text,text,text,integer,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb
) from public,anon,authenticated;
grant execute on function public.customer_care_voice_register_benchmark(
  text,text,text,integer,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb
) to authenticated;

create or replace function public.customer_care_telephony_runtime_state(
  p_adapter_key text,
  p_enabled boolean,
  p_live_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_row public.telephony_adapter_contracts%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to change telephony runtime state' using errcode='42501';
  end if;

  if coalesce(p_live_enabled,false)=true then
    raise exception 'Live telephony is intentionally locked until a provider/cost milestone is explicitly approved';
  end if;

  update public.telephony_adapter_contracts
  set enabled=coalesce(p_enabled,false),
      live_enabled=false,
      updated_at=now()
  where adapter_key=p_adapter_key
  returning * into v_row;

  if not found then raise exception 'Telephony adapter not found'; end if;

  return jsonb_build_object(
    'adapter_key',v_row.adapter_key,
    'enabled',v_row.enabled,
    'live_enabled',v_row.live_enabled
  );
end;
$$;

revoke all on function public.customer_care_telephony_runtime_state(text,boolean,boolean)
from public,anon,authenticated;
grant execute on function public.customer_care_telephony_runtime_state(text,boolean,boolean)
to authenticated;
