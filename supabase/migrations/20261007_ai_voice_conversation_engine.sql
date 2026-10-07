-- Customer Care — Milestone 3B3
-- AI voice conversation engine, sandbox first. No real telephony is enabled.

create table if not exists public.ai_voice_engine_settings (
  singleton boolean primary key default true check (singleton),
  sandbox_enabled boolean not null default true,
  live_telephony_enabled boolean not null default false,
  default_language text not null default 'ml' check (default_language in ('ml','en')),
  max_turns integer not null default 12 check (max_turns between 2 and 50),
  default_callback_delay_minutes integer not null default 120 check (default_callback_delay_minutes between 15 and 10080),
  quiet_start time not null default '20:00',
  quiet_end time not null default '09:00',
  timezone text not null default 'Asia/Kolkata',
  pii_redaction_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.ai_voice_engine_settings(singleton)
values(true)
on conflict(singleton) do nothing;

create table if not exists public.ai_speech_adapters (
  adapter_key text primary key,
  capability text not null check (capability in ('nlu','stt','tts')),
  display_name text not null,
  runtime text not null check (runtime in ('built_in','browser','local','external')),
  enabled boolean not null default false,
  production_approved boolean not null default false,
  license text,
  endpoint_ref text,
  config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_speech_adapters(
  adapter_key,capability,display_name,runtime,enabled,production_approved,license,notes
)
values
  ('rules_nlu','nlu','Deterministic Rules NLU','built_in',true,true,'Proprietary project code','Current sandbox intent/state engine. No external AI API.'),
  ('browser_speech_tts','tts','Browser Speech Synthesis','browser',true,false,null,'Optional browser TTS for sandbox playback. Availability/voice quality varies by device.'),
  ('whisper_cpp_stt','stt','whisper.cpp','local',false,false,'MIT','Candidate local/offline STT. Not bundled in this milestone.'),
  ('faster_whisper_stt','stt','faster-whisper','local',false,false,'MIT','Candidate server/local STT. Not bundled in this milestone.'),
  ('vosk_stt','stt','Vosk','local',false,false,'Apache-2.0','Candidate lightweight offline STT. Not bundled in this milestone.')
on conflict(adapter_key) do update set
  display_name=excluded.display_name,
  runtime=excluded.runtime,
  license=excluded.license,
  notes=excluded.notes,
  updated_at=now();

create table if not exists public.ai_call_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  automated_call_job_id uuid references public.automated_call_jobs(id) on delete set null,
  outbox_id uuid references public.customer_contact_outbox(id) on delete set null,
  source_type text not null default 'manual'
    check (source_type in ('invoice','service_job','campaign','manual','callback')),
  source_id text,
  direction text not null default 'outbound'
    check (direction in ('outbound','inbound')),
  goal text not null
    check (goal in (
      'invoice_payment_reminder',
      'service_follow_up',
      'technician_eta_update',
      'callback_handling',
      'general_customer_care'
    )),
  language text not null check (language in ('ml','en')),
  sandbox boolean not null default true,
  status text not null default 'active'
    check (status in (
      'active','completed','blocked','callback_required',
      'escalated','opted_out','abandoned'
    )),
  current_state text not null default 'opening',
  detected_intent text,
  outcome text,
  summary text,
  structured_outcome jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  consent_snapshot boolean not null,
  do_not_call_snapshot boolean not null,
  call_opt_out_snapshot boolean not null default false,
  pii_redaction_applied boolean not null default true,
  callback_at timestamptz,
  escalation_reason text,
  turn_count integer not null default 0 check (turn_count >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_call_sessions_customer_created_idx
  on public.ai_call_sessions(customer_id,created_at desc);
create index if not exists ai_call_sessions_status_created_idx
  on public.ai_call_sessions(status,created_at desc);
create index if not exists ai_call_sessions_call_job_idx
  on public.ai_call_sessions(automated_call_job_id)
  where automated_call_job_id is not null;
create index if not exists ai_call_sessions_outbox_idx
  on public.ai_call_sessions(outbox_id)
  where outbox_id is not null;
create index if not exists ai_call_sessions_created_by_idx
  on public.ai_call_sessions(created_by)
  where created_by is not null;

create table if not exists public.ai_call_turns (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.ai_call_sessions(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  speaker text not null check (speaker in ('system','assistant','customer')),
  text_redacted text not null,
  detected_intent text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id,sequence_no)
);

create index if not exists ai_call_turns_session_sequence_idx
  on public.ai_call_turns(session_id,sequence_no);
create index if not exists ai_call_turns_intent_idx
  on public.ai_call_turns(detected_intent)
  where detected_intent is not null;

create table if not exists public.ai_call_outcome_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.ai_call_sessions(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  outcome text not null,
  callback_at timestamptz,
  escalation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_call_outcome_events_session_idx
  on public.ai_call_outcome_events(session_id,created_at desc);
create index if not exists ai_call_outcome_events_customer_idx
  on public.ai_call_outcome_events(customer_id,created_at desc);

alter table public.automated_call_jobs
  add column if not exists latest_ai_session_id uuid references public.ai_call_sessions(id) on delete set null;

create index if not exists automated_call_jobs_latest_ai_session_idx
  on public.automated_call_jobs(latest_ai_session_id)
  where latest_ai_session_id is not null;

drop trigger if exists ai_voice_engine_settings_updated_at on public.ai_voice_engine_settings;
create trigger ai_voice_engine_settings_updated_at
before update on public.ai_voice_engine_settings
for each row execute function private.set_updated_at();

drop trigger if exists ai_speech_adapters_updated_at on public.ai_speech_adapters;
create trigger ai_speech_adapters_updated_at
before update on public.ai_speech_adapters
for each row execute function private.set_updated_at();

drop trigger if exists ai_call_sessions_updated_at on public.ai_call_sessions;
create trigger ai_call_sessions_updated_at
before update on public.ai_call_sessions
for each row execute function private.set_updated_at();

alter table public.ai_voice_engine_settings enable row level security;
alter table public.ai_speech_adapters enable row level security;
alter table public.ai_call_sessions enable row level security;
alter table public.ai_call_turns enable row level security;
alter table public.ai_call_outcome_events enable row level security;

revoke all on public.ai_voice_engine_settings from anon;
revoke all on public.ai_speech_adapters from anon;
revoke all on public.ai_call_sessions from anon;
revoke all on public.ai_call_turns from anon;
revoke all on public.ai_call_outcome_events from anon;

grant select,insert,update,delete on public.ai_voice_engine_settings to authenticated;
grant select,insert,update,delete on public.ai_speech_adapters to authenticated;
grant select,insert,update,delete on public.ai_call_sessions to authenticated;
grant select,insert,update,delete on public.ai_call_turns to authenticated;
grant select,insert,update,delete on public.ai_call_outcome_events to authenticated;
grant usage,select on sequence public.ai_call_turns_id_seq to authenticated;
grant usage,select on sequence public.ai_call_outcome_events_id_seq to authenticated;

drop policy if exists "active_admin_manage_ai_voice_engine_settings" on public.ai_voice_engine_settings;
create policy "active_admin_manage_ai_voice_engine_settings"
on public.ai_voice_engine_settings for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_ai_speech_adapters" on public.ai_speech_adapters;
create policy "active_admin_manage_ai_speech_adapters"
on public.ai_speech_adapters for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_ai_call_sessions" on public.ai_call_sessions;
create policy "active_admin_manage_ai_call_sessions"
on public.ai_call_sessions for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_ai_call_turns" on public.ai_call_turns;
create policy "active_admin_manage_ai_call_turns"
on public.ai_call_turns for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_ai_call_outcome_events" on public.ai_call_outcome_events;
create policy "active_admin_manage_ai_call_outcome_events"
on public.ai_call_outcome_events for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create or replace function public.customer_care_ai_worker_start_session(
  p_customer_id uuid,
  p_goal text,
  p_language text,
  p_direction text default 'outbound',
  p_source_type text default 'manual',
  p_source_id text default null,
  p_automated_call_job_id uuid default null,
  p_outbox_id uuid default null,
  p_context jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_customer public.customers%rowtype;
  v_goal text:=lower(btrim(coalesce(p_goal,'')));
  v_language text:=lower(btrim(coalesce(p_language,'')));
  v_direction text:=lower(btrim(coalesce(p_direction,'outbound')));
  v_source_type text:=lower(btrim(coalesce(p_source_type,'manual')));
  v_call_opt_out boolean:=false;
  v_session_id uuid;
  v_settings public.ai_voice_engine_settings%rowtype;
begin
  select * into v_settings
  from public.ai_voice_engine_settings
  where singleton=true;

  if coalesce(v_settings.sandbox_enabled,false)=false then
    raise exception 'AI voice sandbox is disabled';
  end if;

  if v_goal not in (
    'invoice_payment_reminder','service_follow_up','technician_eta_update',
    'callback_handling','general_customer_care'
  ) then raise exception 'Invalid conversation goal'; end if;

  if v_language not in ('ml','en') then raise exception 'Invalid conversation language'; end if;
  if v_direction not in ('outbound','inbound') then raise exception 'Invalid conversation direction'; end if;
  if v_source_type not in ('invoice','service_job','campaign','manual','callback') then
    raise exception 'Invalid source type';
  end if;

  select * into v_customer
  from public.customers
  where id=p_customer_id;

  if not found then raise exception 'Customer not found'; end if;

  select coalesce(p.opted_out,false)
  into v_call_opt_out
  from public.customer_contact_preferences p
  where p.customer_id=v_customer.id and p.channel='call';

  v_call_opt_out:=coalesce(v_call_opt_out,false);

  if v_direction='outbound' then
    if v_customer.call_consent<>true then
      raise exception 'Explicit customer call consent is not recorded' using errcode='42501';
    end if;
    if v_customer.do_not_call=true then
      raise exception 'Customer is marked Do Not Call' using errcode='42501';
    end if;
    if v_call_opt_out=true then
      raise exception 'Customer has opted out of calls' using errcode='42501';
    end if;
    if nullif(btrim(coalesce(v_customer.phone,'')),'') is null then
      raise exception 'Customer phone is missing';
    end if;
  end if;

  if p_automated_call_job_id is not null and not exists(
    select 1 from public.automated_call_jobs a
    where a.id=p_automated_call_job_id and a.customer_id=v_customer.id
  ) then
    raise exception 'Automated call job does not belong to customer';
  end if;

  if p_outbox_id is not null and not exists(
    select 1 from public.customer_contact_outbox o
    where o.id=p_outbox_id and o.customer_id=v_customer.id
  ) then
    raise exception 'Outbox item does not belong to customer';
  end if;

  insert into public.ai_call_sessions(
    customer_id,automated_call_job_id,outbox_id,source_type,source_id,
    direction,goal,language,sandbox,status,current_state,context,
    consent_snapshot,do_not_call_snapshot,call_opt_out_snapshot,
    pii_redaction_applied,created_by
  )
  values(
    v_customer.id,p_automated_call_job_id,p_outbox_id,v_source_type,
    nullif(btrim(coalesce(p_source_id,'')),''),
    v_direction,v_goal,v_language,true,'active','opening',coalesce(p_context,'{}'::jsonb),
    coalesce(v_customer.call_consent,false),coalesce(v_customer.do_not_call,false),v_call_opt_out,
    coalesce(v_settings.pii_redaction_enabled,true),p_created_by
  )
  returning id into v_session_id;

  if p_automated_call_job_id is not null then
    update public.automated_call_jobs
    set latest_ai_session_id=v_session_id,updated_at=now()
    where id=p_automated_call_job_id;
  end if;

  return jsonb_build_object(
    'session_id',v_session_id,
    'customer_id',v_customer.id,
    'customer_name',v_customer.name,
    'goal',v_goal,
    'language',v_language,
    'direction',v_direction,
    'sandbox',true,
    'max_turns',v_settings.max_turns
  );
end;
$$;

revoke all on function public.customer_care_ai_worker_start_session(
  uuid,text,text,text,text,text,uuid,uuid,jsonb,uuid
) from public,anon,authenticated;
grant execute on function public.customer_care_ai_worker_start_session(
  uuid,text,text,text,text,text,uuid,uuid,jsonb,uuid
) to service_role;

create or replace function public.customer_care_ai_worker_add_turn(
  p_session_id uuid,
  p_speaker text,
  p_text_redacted text,
  p_detected_intent text default null,
  p_confidence numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.ai_call_sessions%rowtype;
  v_seq integer;
  v_turn_id bigint;
begin
  select * into v_session
  from public.ai_call_sessions
  where id=p_session_id
  for update;

  if not found then raise exception 'AI call session not found'; end if;
  if v_session.status<>'active' then raise exception 'AI call session is not active'; end if;
  if p_speaker not in ('system','assistant','customer') then raise exception 'Invalid turn speaker'; end if;
  if nullif(btrim(coalesce(p_text_redacted,'')),'') is null then raise exception 'Turn text is required'; end if;

  select coalesce(max(sequence_no),0)+1
  into v_seq
  from public.ai_call_turns
  where session_id=v_session.id;

  insert into public.ai_call_turns(
    session_id,sequence_no,speaker,text_redacted,detected_intent,confidence,metadata
  )
  values(
    v_session.id,v_seq,p_speaker,btrim(p_text_redacted),
    nullif(btrim(coalesce(p_detected_intent,'')),''),
    p_confidence,coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_turn_id;

  update public.ai_call_sessions
  set
    turn_count=case when p_speaker='customer' then turn_count+1 else turn_count end,
    detected_intent=case
      when p_speaker='customer' and nullif(btrim(coalesce(p_detected_intent,'')),'') is not null
      then p_detected_intent
      else detected_intent
    end,
    current_state=coalesce(nullif(p_metadata->>'next_state',''),current_state),
    updated_at=now()
  where id=v_session.id;

  return jsonb_build_object('turn_id',v_turn_id,'sequence_no',v_seq);
end;
$$;

revoke all on function public.customer_care_ai_worker_add_turn(
  uuid,text,text,text,numeric,jsonb
) from public,anon,authenticated;
grant execute on function public.customer_care_ai_worker_add_turn(
  uuid,text,text,text,numeric,jsonb
) to service_role;

create or replace function public.customer_care_ai_worker_finish_session(
  p_session_id uuid,
  p_status text,
  p_outcome text,
  p_summary text,
  p_structured_outcome jsonb default '{}'::jsonb,
  p_callback_at timestamptz default null,
  p_escalation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.ai_call_sessions%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_outcome text:=lower(btrim(coalesce(p_outcome,'')));
begin
  if v_status not in ('completed','blocked','callback_required','escalated','opted_out','abandoned') then
    raise exception 'Invalid session completion status';
  end if;

  select * into v_session
  from public.ai_call_sessions
  where id=p_session_id
  for update;

  if not found then raise exception 'AI call session not found'; end if;

  update public.ai_call_sessions
  set
    status=v_status,
    outcome=nullif(v_outcome,''),
    summary=nullif(btrim(coalesce(p_summary,'')),''),
    structured_outcome=coalesce(p_structured_outcome,'{}'::jsonb),
    callback_at=p_callback_at,
    escalation_reason=nullif(btrim(coalesce(p_escalation_reason,'')),''),
    current_state='closed',
    ended_at=coalesce(ended_at,now()),
    updated_at=now()
  where id=v_session.id;

  insert into public.ai_call_outcome_events(
    session_id,customer_id,outcome,callback_at,escalation_reason,metadata
  )
  values(
    v_session.id,v_session.customer_id,coalesce(nullif(v_outcome,''),v_status),
    p_callback_at,nullif(btrim(coalesce(p_escalation_reason,'')),''),
    coalesce(p_structured_outcome,'{}'::jsonb)
  );

  if v_status='opted_out' or v_outcome='opt_out' then
    insert into public.customer_contact_preferences(
      customer_id,channel,opted_out,opt_out_reason,opted_out_at,updated_at
    )
    values(
      v_session.customer_id,'call',true,'Customer opted out during AI sandbox conversation',now(),now()
    )
    on conflict(customer_id,channel) do update set
      opted_out=true,
      opt_out_reason=excluded.opt_out_reason,
      opted_out_at=excluded.opted_out_at,
      updated_at=now();

    update public.customers
    set do_not_call=true
    where id=v_session.customer_id;
  end if;

  if v_session.automated_call_job_id is not null then
    update public.automated_call_jobs
    set
      status=case
        when v_status='callback_required' then 'callback_required'
        when v_status='escalated' then 'escalated'
        when v_status='opted_out' then 'opted_out'
        when v_status='blocked' then 'suppressed'
        else 'completed'
      end,
      outcome=coalesce(nullif(v_outcome,''),v_status),
      callback_at=coalesce(p_callback_at,callback_at),
      escalated_at=case when v_status='escalated' then now() else escalated_at end,
      escalation_reason=case when v_status='escalated' then p_escalation_reason else escalation_reason end,
      updated_at=now()
    where id=v_session.automated_call_job_id;
  end if;

  insert into public.customer_contact_timeline(
    customer_id,outbox_id,source_type,source_id,event_type,channel,
    direction,status,summary,metadata
  )
  values(
    v_session.customer_id,v_session.outbox_id,v_session.source_type,v_session.source_id,
    'ai_voice_conversation','call',
    v_session.direction,
    v_status,
    coalesce(nullif(btrim(coalesce(p_summary,'')),''),coalesce(nullif(v_outcome,''),v_status)),
    jsonb_build_object(
      'ai_session_id',v_session.id,
      'goal',v_session.goal,
      'language',v_session.language,
      'sandbox',true,
      'outcome',v_outcome,
      'callback_at',p_callback_at,
      'escalation_reason',p_escalation_reason,
      'structured_outcome',coalesce(p_structured_outcome,'{}'::jsonb)
    )
  );

  return jsonb_build_object(
    'session_id',v_session.id,
    'status',v_status,
    'outcome',v_outcome,
    'callback_at',p_callback_at,
    'escalation_reason',p_escalation_reason
  );
end;
$$;

revoke all on function public.customer_care_ai_worker_finish_session(
  uuid,text,text,text,jsonb,timestamptz,text
) from public,anon,authenticated;
grant execute on function public.customer_care_ai_worker_finish_session(
  uuid,text,text,text,jsonb,timestamptz,text
) to service_role;
