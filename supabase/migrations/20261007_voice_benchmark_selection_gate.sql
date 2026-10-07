-- Customer Care — Milestone 3B4B
-- Benchmark evidence selection gate. Prevents enabling speech engines without measured bilingual evidence.

create or replace function private.validate_voice_adapter_selection(
  p_adapter_key text,
  p_capability text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_adapter public.ai_speech_adapters%rowtype;
  v_ml integer;
  v_en integer;
begin
  if p_adapter_key is null then return; end if;

  select * into v_adapter
  from public.ai_speech_adapters
  where adapter_key=p_adapter_key;

  if not found then
    raise exception 'Speech adapter % does not exist',p_adapter_key;
  end if;

  if v_adapter.capability<>p_capability then
    raise exception 'Speech adapter % is %, not %',p_adapter_key,v_adapter.capability,p_capability;
  end if;

  if v_adapter.production_approved<>true then
    raise exception 'Speech adapter % is not production-approved',p_adapter_key;
  end if;

  select
    count(*) filter (
      where language='ml'
        and (
          (p_capability='stt' and word_error_rate is not null and character_error_rate is not null)
          or
          (p_capability='tts' and tts_mos_proxy is not null)
        )
    ),
    count(*) filter (
      where language='en'
        and (
          (p_capability='stt' and word_error_rate is not null and character_error_rate is not null)
          or
          (p_capability='tts' and tts_mos_proxy is not null)
        )
    )
  into v_ml,v_en
  from public.voice_benchmark_runs
  where adapter_key=p_adapter_key
    and capability=p_capability;

  if coalesce(v_ml,0)=0 or coalesce(v_en,0)=0 then
    raise exception 'Speech adapter % requires real Malayalam and English benchmark evidence before selection',p_adapter_key;
  end if;
end;
$$;

revoke all on function private.validate_voice_adapter_selection(text,text)
from public,anon,authenticated;

create or replace function private.validate_voice_runtime_profile()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.primary_stt_adapter_key is not null
     and new.primary_stt_adapter_key=new.fallback_stt_adapter_key then
    raise exception 'Primary and fallback STT adapters must be different';
  end if;

  if new.primary_tts_adapter_key is not null
     and new.primary_tts_adapter_key=new.fallback_tts_adapter_key then
    raise exception 'Primary and fallback TTS adapters must be different';
  end if;

  perform private.validate_voice_adapter_selection(new.primary_stt_adapter_key,'stt');
  perform private.validate_voice_adapter_selection(new.fallback_stt_adapter_key,'stt');
  perform private.validate_voice_adapter_selection(new.primary_tts_adapter_key,'tts');
  perform private.validate_voice_adapter_selection(new.fallback_tts_adapter_key,'tts');

  return new;
end;
$$;

revoke all on function private.validate_voice_runtime_profile()
from public,anon,authenticated;

drop trigger if exists validate_voice_runtime_profile on public.voice_runtime_profiles;
create trigger validate_voice_runtime_profile
before insert or update of
  primary_stt_adapter_key,
  fallback_stt_adapter_key,
  primary_tts_adapter_key,
  fallback_tts_adapter_key
on public.voice_runtime_profiles
for each row execute function private.validate_voice_runtime_profile();

create or replace function public.customer_care_voice_select_adapters(
  p_primary_stt text default null,
  p_fallback_stt text default null,
  p_primary_tts text default null,
  p_fallback_tts text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_profile public.voice_runtime_profiles%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to select speech adapters' using errcode='42501';
  end if;

  update public.voice_runtime_profiles
  set
    primary_stt_adapter_key=nullif(btrim(coalesce(p_primary_stt,'')),''),
    fallback_stt_adapter_key=nullif(btrim(coalesce(p_fallback_stt,'')),''),
    primary_tts_adapter_key=nullif(btrim(coalesce(p_primary_tts,'')),''),
    fallback_tts_adapter_key=nullif(btrim(coalesce(p_fallback_tts,'')),''),
    updated_at=now()
  where singleton=true
  returning * into v_profile;

  return jsonb_build_object(
    'primary_stt_adapter_key',v_profile.primary_stt_adapter_key,
    'fallback_stt_adapter_key',v_profile.fallback_stt_adapter_key,
    'primary_tts_adapter_key',v_profile.primary_tts_adapter_key,
    'fallback_tts_adapter_key',v_profile.fallback_tts_adapter_key
  );
end;
$$;

revoke all on function public.customer_care_voice_select_adapters(text,text,text,text)
from public,anon,authenticated;
grant execute on function public.customer_care_voice_select_adapters(text,text,text,text)
to authenticated;

create or replace function public.customer_care_voice_runtime_readiness()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to read voice runtime readiness' using errcode='42501';
  end if;

  select jsonb_build_object(
    'profile',(
      select to_jsonb(p)
      from public.voice_runtime_profiles p
      where p.singleton=true
    ),
    'adapters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'adapter_key',a.adapter_key,
        'capability',a.capability,
        'display_name',a.display_name,
        'runtime',a.runtime,
        'enabled',a.enabled,
        'production_approved',a.production_approved,
        'license',a.license,
        'ml_benchmark_count',(
          select count(*) from public.voice_benchmark_runs b
          where b.adapter_key=a.adapter_key and b.language='ml'
        ),
        'en_benchmark_count',(
          select count(*) from public.voice_benchmark_runs b
          where b.adapter_key=a.adapter_key and b.language='en'
        ),
        'ml_measured_ready',exists(
          select 1 from public.voice_benchmark_runs b
          where b.adapter_key=a.adapter_key and b.language='ml'
            and (
              (a.capability='stt' and b.word_error_rate is not null and b.character_error_rate is not null)
              or
              (a.capability='tts' and b.tts_mos_proxy is not null)
            )
        ),
        'en_measured_ready',exists(
          select 1 from public.voice_benchmark_runs b
          where b.adapter_key=a.adapter_key and b.language='en'
            and (
              (a.capability='stt' and b.word_error_rate is not null and b.character_error_rate is not null)
              or
              (a.capability='tts' and b.tts_mos_proxy is not null)
            )
        )
      ) order by a.capability,a.adapter_key)
      from public.ai_speech_adapters a
      where a.capability in ('stt','tts')
    ),'[]'::jsonb),
    'live_audio_streaming_enabled',(
      select p.live_audio_streaming_enabled
      from public.voice_runtime_profiles p where p.singleton=true
    ),
    'live_telephony_adapter_count',(
      select count(*) from public.telephony_adapter_contracts t
      where t.live_enabled=true
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.customer_care_voice_runtime_readiness()
from public,anon,authenticated;
grant execute on function public.customer_care_voice_runtime_readiness()
to authenticated;
