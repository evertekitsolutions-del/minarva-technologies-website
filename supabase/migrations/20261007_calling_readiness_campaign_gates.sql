-- Customer Care — Milestone 3B5A2
-- Campaign dry-run, go-live gate matrix and emergency stop. Real dialing remains disabled.

alter table public.ai_voice_engine_settings
  add column if not exists telephony_emergency_stop boolean not null default true;

create table if not exists public.telephony_go_live_checklist (
  check_key text primary key,
  category text not null,
  title text not null,
  blocking boolean not null default true,
  required_state text not null,
  notes text,
  sort_order integer not null default 100
);

insert into public.telephony_go_live_checklist(check_key,category,title,blocking,required_state,notes,sort_order)
values
  ('emergency_stop_review','Safety','Emergency stop reviewed',true,'Must remain ON until final explicit go-live approval','Current milestone intentionally keeps emergency stop ON.',10),
  ('call_consent_rules','Compliance','Consent / Do Not Call enforcement verified',true,'Audit RPC present and campaign filters applied','Outbound calls must never bypass consent, DNC or call opt-out.',20),
  ('quiet_hours','Compliance','Quiet-hours policy configured',true,'Timezone + quiet start/end configured','Calls outside the permitted contact window must be deferred.',30),
  ('phone_validation','Data Quality','Phone validation and duplicate screening complete',true,'Campaign dry-run must exclude blocked/review records','Wrong or duplicate numbers require review before calling.',40),
  ('stt_benchmark','Speech','Primary STT selected from real bilingual benchmarks',true,'Primary STT must be non-null','Selection gate already requires production approval + Malayalam/English evidence.',50),
  ('tts_benchmark','Speech','Primary TTS selected from real bilingual benchmarks',true,'Primary TTS must be non-null','Selection gate already requires production approval + Malayalam/English quality evidence.',60),
  ('provider_contract','Provider','Real telephony adapter configured',true,'Exactly reviewed live adapter before go-live','No live adapter is configured in this milestone.',70),
  ('cost_profile','Commercial','Real provider cost profile recorded',true,'Active rate profile required','No fake provider rate should be entered.',80),
  ('webhook_idempotency','Reliability','Webhook replay/idempotency protection present',true,'Unique adapter_key + provider_event_id gate','Prevents duplicate provider events from being processed twice.',90),
  ('outcome_policy','Reliability','Busy/no-answer/voicemail/callback/opt-out policies verified',true,'Policy matrix present','Default state policy must be reviewed before provider go-live.',100),
  ('security_advisors','Security','Security advisor warnings reviewed',true,'No unresolved critical/high-risk production blockers','Leaked Password Protection warning must be resolved before final go-live.',110),
  ('uat','Release','End-to-end production UAT complete',true,'Explicit final UAT sign-off required','Must cover invoice/service/callback/opt-out/escalation and provider webhook replay.',120)
on conflict(check_key) do update set
  category=excluded.category,
  title=excluded.title,
  blocking=excluded.blocking,
  required_state=excluded.required_state,
  notes=excluded.notes,
  sort_order=excluded.sort_order;

alter table public.telephony_go_live_checklist enable row level security;
revoke all on public.telephony_go_live_checklist from anon;
grant select,insert,update,delete on public.telephony_go_live_checklist to authenticated;

drop policy if exists "active_admin_manage_telephony_go_live_checklist" on public.telephony_go_live_checklist;
create policy "active_admin_manage_telephony_go_live_checklist"
on public.telephony_go_live_checklist for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create or replace function public.customer_care_campaign_call_dry_run(
  p_campaign_id uuid,
  p_assumed_duration_seconds integer default 90,
  p_cost_per_minute numeric default null,
  p_currency text default 'INR'
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_campaign public.customer_care_campaigns%rowtype;
  v_customer_ids uuid[];
  v_result jsonb;
  v_run_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to run campaign calling dry-run' using errcode='42501';
  end if;

  select * into v_campaign
  from public.customer_care_campaigns
  where id=p_campaign_id;

  if not found then raise exception 'Campaign not found'; end if;
  if v_campaign.channel<>'call' then
    raise exception 'Campaign channel is %, not call',v_campaign.channel;
  end if;

  select coalesce(array_agg(distinct m.customer_id),'{}'::uuid[])
  into v_customer_ids
  from public.customer_care_campaign_members m
  where m.campaign_id=v_campaign.id
    and m.status not in ('cancelled','sent','suppressed');

  v_result:=public.customer_care_call_dry_run(
    'Campaign Dry Run — '||v_campaign.name,
    p_assumed_duration_seconds,
    p_cost_per_minute,
    p_currency,
    v_customer_ids
  );

  v_run_id:=(v_result->>'dry_run_id')::uuid;

  update public.call_readiness_dry_runs
  set source_type='campaign',source_id=v_campaign.id::text
  where id=v_run_id;

  return v_result||jsonb_build_object(
    'campaign_id',v_campaign.id,
    'campaign_name',v_campaign.name,
    'campaign_member_count',coalesce(array_length(v_customer_ids,1),0)
  );
end;
$$;

revoke all on function public.customer_care_campaign_call_dry_run(uuid,integer,numeric,text)
from public,anon,authenticated;
grant execute on function public.customer_care_campaign_call_dry_run(uuid,integer,numeric,text)
to authenticated;

create or replace function public.customer_care_telephony_policy_matrix()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to view telephony policy matrix' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'outcome',p.outcome,
      'default_action',p.default_action,
      'retry_delay_minutes',p.retry_delay_minutes,
      'max_retries',p.max_retries,
      'customer_notification_allowed',p.customer_notification_allowed,
      'notes',p.notes
    ) order by p.outcome)
    from public.telephony_outcome_policies p
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.customer_care_telephony_policy_matrix()
from public,anon,authenticated;
grant execute on function public.customer_care_telephony_policy_matrix()
to authenticated;

create or replace function public.customer_care_telephony_go_live_readiness()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_profile public.voice_runtime_profiles%rowtype;
  v_voice public.ai_voice_engine_settings%rowtype;
  v_care public.customer_care_settings%rowtype;
  v_webhook_unique boolean;
  v_live_adapters integer;
  v_cost_profiles integer;
  v_policy_count integer;
  v_gates jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to view telephony go-live readiness' using errcode='42501';
  end if;

  select * into v_profile from public.voice_runtime_profiles where singleton=true;
  select * into v_voice from public.ai_voice_engine_settings where singleton=true;
  select * into v_care from public.customer_care_settings where singleton=true;

  select count(*) into v_live_adapters
  from public.telephony_adapter_contracts
  where enabled=true and live_enabled=true;

  select count(*) into v_cost_profiles
  from public.telephony_cost_profiles
  where active=true
    and per_minute_rate is not null
    and (effective_from is null or effective_from<=now())
    and (effective_until is null or effective_until>now());

  select count(*) into v_policy_count
  from public.telephony_outcome_policies
  where outcome in ('no_answer','busy','voicemail','callback_requested','opt_out','human_requested');

  select exists(
    select 1
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='telephony_webhook_events'
      and c.contype='u'
      and pg_get_constraintdef(c.oid) ilike '%adapter_key%'
      and pg_get_constraintdef(c.oid) ilike '%provider_event_id%'
  ) into v_webhook_unique;

  v_gates:=jsonb_build_array(
    jsonb_build_object('key','emergency_stop','passed',v_voice.telephony_emergency_stop=false,'current',v_voice.telephony_emergency_stop,'required','OFF only after explicit final go-live approval'),
    jsonb_build_object('key','live_telephony_flag','passed',v_voice.live_telephony_enabled=true,'current',v_voice.live_telephony_enabled,'required','ON only after explicit final go-live approval'),
    jsonb_build_object('key','primary_stt','passed',v_profile.primary_stt_adapter_key is not null,'current',v_profile.primary_stt_adapter_key,'required','Benchmark-approved Primary STT'),
    jsonb_build_object('key','primary_tts','passed',v_profile.primary_tts_adapter_key is not null,'current',v_profile.primary_tts_adapter_key,'required','Benchmark-approved Primary TTS'),
    jsonb_build_object('key','live_adapter','passed',v_live_adapters>0,'current',v_live_adapters,'required','At least one reviewed live telephony adapter'),
    jsonb_build_object('key','cost_profile','passed',v_cost_profiles>0,'current',v_cost_profiles,'required','At least one real active provider rate'),
    jsonb_build_object('key','webhook_idempotency','passed',v_webhook_unique,'current',v_webhook_unique,'required','Unique adapter + provider event key'),
    jsonb_build_object('key','outcome_policy_matrix','passed',v_policy_count>=6,'current',v_policy_count,'required','Required outcome policies present'),
    jsonb_build_object('key','quiet_hours','passed',v_care.quiet_start is not null and v_care.quiet_end is not null and v_care.timezone is not null,'current',jsonb_build_object('timezone',v_care.timezone,'start',v_care.quiet_start,'end',v_care.quiet_end),'required','Configured contact window')
  );

  return jsonb_build_object(
    'ready_for_live_dialing',false,
    'reason','Live calling is intentionally locked pending explicit approval, real speech benchmarks, provider configuration, security remediation and UAT.',
    'gates',v_gates,
    'blocking_checklist',(
      select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order),'[]'::jsonb)
      from public.telephony_go_live_checklist c
      where c.blocking=true
    )
  );
end;
$$;

revoke all on function public.customer_care_telephony_go_live_readiness()
from public,anon,authenticated;
grant execute on function public.customer_care_telephony_go_live_readiness()
to authenticated;
