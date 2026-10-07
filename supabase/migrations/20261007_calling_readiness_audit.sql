-- Customer Care — Milestone 3B5A
-- Production calling readiness audits and dry-run economics. No real dialing.

create table if not exists public.telephony_cost_profiles (
  id uuid primary key default gen_random_uuid(),
  adapter_key text references public.telephony_adapter_contracts(adapter_key) on delete cascade,
  name text not null,
  currency text not null default 'INR',
  connection_fee numeric(14,4) check(connection_fee is null or connection_fee >= 0),
  per_minute_rate numeric(14,4) check(per_minute_rate is null or per_minute_rate >= 0),
  billing_increment_seconds integer check(billing_increment_seconds is null or billing_increment_seconds between 1 and 3600),
  minimum_billable_seconds integer check(minimum_billable_seconds is null or minimum_billable_seconds between 0 and 3600),
  effective_from timestamptz,
  effective_until timestamptz,
  source_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telephony_cost_profiles_adapter_active_idx
  on public.telephony_cost_profiles(adapter_key,active,effective_from desc);
create index if not exists telephony_cost_profiles_effective_until_idx
  on public.telephony_cost_profiles(effective_until)
  where effective_until is not null;

create table if not exists public.telephony_outcome_policies (
  outcome text primary key,
  default_action text not null
    check(default_action in ('complete','retry','callback','escalate','suppress','voicemail','review')),
  retry_delay_minutes integer check(retry_delay_minutes is null or retry_delay_minutes between 1 and 10080),
  max_retries integer not null default 0 check(max_retries between 0 and 20),
  customer_notification_allowed boolean not null default false,
  notes text
);

insert into public.telephony_outcome_policies(
  outcome,default_action,retry_delay_minutes,max_retries,customer_notification_allowed,notes
)
values
  ('answered','complete',null,0,false,'Conversation engine determines the final business outcome after answer.'),
  ('no_answer','retry',120,2,false,'Retry later within consent and quiet-hours rules.'),
  ('busy','retry',30,2,false,'Retry later within consent and quiet-hours rules.'),
  ('voicemail','voicemail',null,0,false,'Do not leave automated voicemail until a provider/legal policy is explicitly approved.'),
  ('hangup','review',null,0,false,'Review whether the call ended before a meaningful outcome.'),
  ('failed','review',null,0,false,'Technical/provider failure; inspect error and retry policy.'),
  ('wrong_number','suppress',null,0,false,'Stop future automated calling and require customer record correction.'),
  ('opt_out','suppress',null,0,false,'Immediately suppress future automated calls.'),
  ('callback_requested','callback',null,0,false,'Use explicit callback time when available.'),
  ('human_requested','escalate',null,0,false,'Escalate to human customer care.')
on conflict(outcome) do update set
  default_action=excluded.default_action,
  retry_delay_minutes=excluded.retry_delay_minutes,
  max_retries=excluded.max_retries,
  customer_notification_allowed=excluded.customer_notification_allowed,
  notes=excluded.notes;

create table if not exists public.call_readiness_dry_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null default 'manual'
    check(source_type in ('manual','campaign','invoice','service_job')),
  source_id text,
  assumed_duration_seconds integer not null default 90
    check(assumed_duration_seconds between 5 and 7200),
  currency text not null default 'INR',
  assumed_cost_per_minute numeric(14,4)
    check(assumed_cost_per_minute is null or assumed_cost_per_minute >= 0),
  total_customers integer not null default 0,
  eligible_customers integer not null default 0,
  blocked_customers integer not null default 0,
  warning_customers integer not null default 0,
  estimated_total_minutes numeric(14,2),
  estimated_cost numeric(14,4),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists call_readiness_dry_runs_created_by_idx
  on public.call_readiness_dry_runs(created_by,created_at desc)
  where created_by is not null;
create index if not exists call_readiness_dry_runs_source_idx
  on public.call_readiness_dry_runs(source_type,source_id)
  where source_id is not null;

drop trigger if exists telephony_cost_profiles_updated_at on public.telephony_cost_profiles;
create trigger telephony_cost_profiles_updated_at
before update on public.telephony_cost_profiles
for each row execute function private.set_updated_at();

alter table public.telephony_cost_profiles enable row level security;
alter table public.telephony_outcome_policies enable row level security;
alter table public.call_readiness_dry_runs enable row level security;

revoke all on public.telephony_cost_profiles from anon;
revoke all on public.telephony_outcome_policies from anon;
revoke all on public.call_readiness_dry_runs from anon;

grant select,insert,update,delete on public.telephony_cost_profiles to authenticated;
grant select,insert,update,delete on public.telephony_outcome_policies to authenticated;
grant select,insert,update,delete on public.call_readiness_dry_runs to authenticated;

drop policy if exists "active_admin_manage_telephony_cost_profiles" on public.telephony_cost_profiles;
create policy "active_admin_manage_telephony_cost_profiles"
on public.telephony_cost_profiles for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_telephony_outcome_policies" on public.telephony_outcome_policies;
create policy "active_admin_manage_telephony_outcome_policies"
on public.telephony_outcome_policies for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_call_readiness_dry_runs" on public.call_readiness_dry_runs;
create policy "active_admin_manage_call_readiness_dry_runs"
on public.call_readiness_dry_runs for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create or replace function private.call_phone_assessment(
  p_phone text,
  p_country text default 'India'
)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_raw text:=btrim(coalesce(p_phone,''));
  v_digits text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_country text:=lower(btrim(coalesce(p_country,'')));
  v_e164 text;
  v_status text;
  v_reason text;
begin
  if v_raw='' or v_digits='' then
    return jsonb_build_object('status','missing','e164',null,'reason','Phone number is missing');
  end if;

  if left(v_raw,1)='+' and char_length(v_digits) between 8 and 15 then
    v_e164:='+'||v_digits;
    v_status:='valid';
    v_reason:='Explicit international-format number';
  elsif left(v_digits,2)='00' and char_length(v_digits)-2 between 8 and 15 then
    v_e164:='+'||substr(v_digits,3);
    v_status:='valid';
    v_reason:='International 00-prefix normalized';
  elsif v_country in ('india','in','ind') and char_length(v_digits)=10 and left(v_digits,1) between '6' and '9' then
    v_e164:='+91'||v_digits;
    v_status:='valid';
    v_reason:='Indian 10-digit mobile normalized to +91';
  elsif v_country in ('india','in','ind') and char_length(v_digits)=12 and left(v_digits,2)='91' and substr(v_digits,3,1) between '6' and '9' then
    v_e164:='+'||v_digits;
    v_status:='valid';
    v_reason:='Indian country-code number normalized';
  elsif char_length(v_digits) between 8 and 15 then
    v_e164:=null;
    v_status:='review';
    v_reason:='Plausible digits but country code cannot be safely inferred';
  else
    v_e164:=null;
    v_status:='invalid';
    v_reason:='Phone length/format is not callable';
  end if;

  return jsonb_build_object(
    'status',v_status,
    'e164',v_e164,
    'digits',v_digits,
    'reason',v_reason
  );
end;
$$;

create or replace function public.customer_care_call_readiness_audit(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_settings public.customer_care_settings%rowtype;
  v_local_now timestamp;
  v_quiet boolean:=false;
  v_rows jsonb;
  v_summary jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to view calling readiness' using errcode='42501';
  end if;

  select * into v_settings
  from public.customer_care_settings
  where singleton=true;

  v_local_now:=now() at time zone coalesce(v_settings.timezone,'Asia/Kolkata');

  if v_settings.quiet_start>v_settings.quiet_end then
    v_quiet:=v_local_now::time>=v_settings.quiet_start or v_local_now::time<v_settings.quiet_end;
  else
    v_quiet:=v_local_now::time>=v_settings.quiet_start and v_local_now::time<v_settings.quiet_end;
  end if;

  with assessed as (
    select
      c.id,c.customer_code,c.name,c.phone,c.country,c.preferred_language,
      c.call_consent,c.call_consent_at,c.call_consent_source,c.do_not_call,
      coalesce(cp.opted_out,false) as call_opted_out,
      private.call_phone_assessment(c.phone,c.country) as phone_assessment
    from public.customers c
    left join public.customer_contact_preferences cp
      on cp.customer_id=c.id and cp.channel='call'
    order by c.name,c.id
    limit greatest(1,least(coalesce(p_limit,5000),10000))
  ),
  normalized as (
    select a.*,
      a.phone_assessment->>'status' as phone_status,
      a.phone_assessment->>'e164' as phone_e164
    from assessed a
  ),
  duplicates as (
    select phone_e164,count(*) as duplicate_count
    from normalized
    where phone_e164 is not null
    group by phone_e164
  ),
  final_rows as (
    select n.*,
      coalesce(d.duplicate_count,0) as duplicate_count,
      case
        when n.call_consent<>true then 'blocked'
        when n.do_not_call=true then 'blocked'
        when n.call_opted_out=true then 'blocked'
        when n.phone_status in ('missing','invalid') then 'blocked'
        when n.phone_status='review' then 'review'
        when coalesce(d.duplicate_count,0)>1 then 'review'
        else 'eligible'
      end as readiness_status,
      array_remove(array[
        case when n.call_consent<>true then 'No explicit call consent' end,
        case when n.do_not_call=true then 'Do Not Call enabled' end,
        case when n.call_opted_out=true then 'Call channel opted out' end,
        case when n.phone_status='missing' then 'Phone missing' end,
        case when n.phone_status='invalid' then 'Phone invalid' end,
        case when n.phone_status='review' then 'Phone needs country-code review' end,
        case when coalesce(d.duplicate_count,0)>1 then 'Duplicate callable number' end
      ],null) as reasons
    from normalized n
    left join duplicates d on d.phone_e164=n.phone_e164
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'customer_id',f.id,
      'customer_code',f.customer_code,
      'name',f.name,
      'phone',f.phone,
      'phone_e164',f.phone_e164,
      'phone_status',f.phone_status,
      'phone_reason',f.phone_assessment->>'reason',
      'duplicate_count',f.duplicate_count,
      'preferred_language',f.preferred_language,
      'call_consent',f.call_consent,
      'call_consent_at',f.call_consent_at,
      'call_consent_source',f.call_consent_source,
      'do_not_call',f.do_not_call,
      'call_opted_out',f.call_opted_out,
      'readiness_status',f.readiness_status,
      'reasons',to_jsonb(f.reasons)
    ) order by f.name),'[]'::jsonb),
    jsonb_build_object(
      'total',count(*),
      'eligible',count(*) filter(where readiness_status='eligible'),
      'review',count(*) filter(where readiness_status='review'),
      'blocked',count(*) filter(where readiness_status='blocked'),
      'duplicate_number_customers',count(*) filter(where duplicate_count>1),
      'missing_or_invalid_phone',count(*) filter(where phone_status in ('missing','invalid')),
      'no_consent',count(*) filter(where call_consent<>true),
      'do_not_call',count(*) filter(where do_not_call=true),
      'call_opted_out',count(*) filter(where call_opted_out=true),
      'quiet_hours_now',v_quiet,
      'timezone',coalesce(v_settings.timezone,'Asia/Kolkata'),
      'quiet_start',v_settings.quiet_start,
      'quiet_end',v_settings.quiet_end,
      'live_telephony_adapters',(
        select count(*) from public.telephony_adapter_contracts t
        where t.enabled=true and t.live_enabled=true
      ),
      'live_telephony_enabled',(
        select coalesce(live_telephony_enabled,false)
        from public.ai_voice_engine_settings where singleton=true
      )
    )
  into v_rows,v_summary
  from final_rows f;

  return jsonb_build_object('summary',v_summary,'customers',v_rows);
end;
$$;

revoke all on function public.customer_care_call_readiness_audit(integer)
from public,anon,authenticated;
grant execute on function public.customer_care_call_readiness_audit(integer)
to authenticated;

create or replace function public.customer_care_call_dry_run(
  p_name text,
  p_assumed_duration_seconds integer default 90,
  p_cost_per_minute numeric default null,
  p_currency text default 'INR',
  p_customer_ids uuid[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_audit jsonb;
  v_customers jsonb;
  v_filtered jsonb;
  v_total integer;
  v_eligible integer;
  v_blocked integer;
  v_review integer;
  v_minutes numeric(14,2);
  v_cost numeric(14,4);
  v_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to run calling dry-run' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Dry-run name is required'; end if;
  if p_assumed_duration_seconds<5 or p_assumed_duration_seconds>7200 then raise exception 'Invalid assumed duration'; end if;
  if p_cost_per_minute is not null and p_cost_per_minute<0 then raise exception 'Cost per minute cannot be negative'; end if;

  v_audit:=public.customer_care_call_readiness_audit(10000);
  v_customers:=coalesce(v_audit->'customers','[]'::jsonb);

  if p_customer_ids is null then
    v_filtered:=v_customers;
  else
    select coalesce(jsonb_agg(x.value),'[]'::jsonb)
    into v_filtered
    from jsonb_array_elements(v_customers) x
    where (x.value->>'customer_id')::uuid=any(p_customer_ids);
  end if;

  select
    count(*),
    count(*) filter(where value->>'readiness_status'='eligible'),
    count(*) filter(where value->>'readiness_status'='blocked'),
    count(*) filter(where value->>'readiness_status'='review')
  into v_total,v_eligible,v_blocked,v_review
  from jsonb_array_elements(v_filtered);

  v_minutes:=round((v_eligible*p_assumed_duration_seconds/60.0)::numeric,2);
  v_cost:=case
    when p_cost_per_minute is null then null
    else round(v_minutes*p_cost_per_minute,4)
  end;

  insert into public.call_readiness_dry_runs(
    name,source_type,assumed_duration_seconds,currency,assumed_cost_per_minute,
    total_customers,eligible_customers,blocked_customers,warning_customers,
    estimated_total_minutes,estimated_cost,summary,created_by
  )
  values(
    btrim(p_name),'manual',p_assumed_duration_seconds,coalesce(nullif(btrim(p_currency),''),'INR'),
    p_cost_per_minute,v_total,v_eligible,v_blocked,v_review,v_minutes,v_cost,
    jsonb_build_object(
      'quiet_hours_now',v_audit#>'{summary,quiet_hours_now}',
      'live_telephony_adapters',v_audit#>'{summary,live_telephony_adapters}',
      'live_telephony_enabled',v_audit#>'{summary,live_telephony_enabled}',
      'customer_ids_filter_applied',p_customer_ids is not null
    ),
    auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'dry_run_id',v_id,
    'name',btrim(p_name),
    'total_customers',v_total,
    'eligible_customers',v_eligible,
    'blocked_customers',v_blocked,
    'review_customers',v_review,
    'assumed_duration_seconds',p_assumed_duration_seconds,
    'estimated_total_minutes',v_minutes,
    'currency',coalesce(nullif(btrim(p_currency),''),'INR'),
    'cost_per_minute',p_cost_per_minute,
    'estimated_cost',v_cost,
    'live_dialing_performed',false,
    'customers',v_filtered
  );
end;
$$;

revoke all on function public.customer_care_call_dry_run(text,integer,numeric,text,uuid[])
from public,anon,authenticated;
grant execute on function public.customer_care_call_dry_run(text,integer,numeric,text,uuid[])
to authenticated;

create or replace function public.customer_care_webhook_idempotency_readiness()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_unique boolean;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to inspect webhook readiness' using errcode='42501';
  end if;

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
  ) into v_unique;

  return jsonb_build_object(
    'idempotency_constraint_present',v_unique,
    'event_table','telephony_webhook_events',
    'duplicate_key','adapter_key + provider_event_id',
    'live_webhooks_enabled',exists(
      select 1 from public.telephony_adapter_contracts t
      where t.enabled=true and t.live_enabled=true and t.webhook_enabled=true
    )
  );
end;
$$;

revoke all on function public.customer_care_webhook_idempotency_readiness()
from public,anon,authenticated;
grant execute on function public.customer_care_webhook_idempotency_readiness()
to authenticated;
