-- Platform — Milestone 4A1
-- Cross-module audit trail, health/readiness RPC and recovery-drill registry.

create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  source text not null default 'database',
  action text not null check(action in ('insert','update','delete')),
  entity_type text not null,
  entity_id text,
  changed_fields text[] not null default '{}'::text[],
  old_status text,
  new_status text,
  reference text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists platform_audit_log_occurred_idx
  on public.platform_audit_log(occurred_at desc);
create index if not exists platform_audit_log_entity_idx
  on public.platform_audit_log(entity_type,entity_id,occurred_at desc);
create index if not exists platform_audit_log_actor_idx
  on public.platform_audit_log(actor_user_id,occurred_at desc)
  where actor_user_id is not null;

alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon,authenticated;
grant select on public.platform_audit_log to authenticated;
grant usage,select on sequence public.platform_audit_log_id_seq to authenticated;

drop policy if exists "active_admin_read_platform_audit_log" on public.platform_audit_log;
create policy "active_admin_read_platform_audit_log"
on public.platform_audit_log
for select to authenticated
using ((select private.is_active_admin()));

create table if not exists public.platform_recovery_drills (
  id uuid primary key default gen_random_uuid(),
  drill_type text not null
    check(drill_type in ('database_restore','storage_restore','configuration_restore','full_recovery')),
  environment text not null default 'non-production',
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null
    check(status in ('planned','running','passed','failed','cancelled')),
  recovery_point text,
  recovery_time_minutes numeric(12,2)
    check(recovery_time_minutes is null or recovery_time_minutes >= 0),
  evidence_reference text,
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_recovery_drills_status_started_idx
  on public.platform_recovery_drills(status,started_at desc);
create index if not exists platform_recovery_drills_performed_by_idx
  on public.platform_recovery_drills(performed_by,started_at desc)
  where performed_by is not null;

drop trigger if exists platform_recovery_drills_updated_at on public.platform_recovery_drills;
create trigger platform_recovery_drills_updated_at
before update on public.platform_recovery_drills
for each row execute function private.set_updated_at();

alter table public.platform_recovery_drills enable row level security;
revoke all on public.platform_recovery_drills from anon;
grant select,insert,update,delete on public.platform_recovery_drills to authenticated;

drop policy if exists "active_admin_manage_platform_recovery_drills" on public.platform_recovery_drills;
create policy "active_admin_manage_platform_recovery_drills"
on public.platform_recovery_drills
for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create or replace function private.capture_platform_audit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_entity_id text;
  v_changed text[];
  v_claims text;
  v_role text;
  v_reference text;
begin
  v_entity_id:=coalesce(v_new->>'id',v_old->>'id');
  v_claims:=nullif(current_setting('request.jwt.claims',true),'');
  if v_claims is not null then
    begin
      v_role:=v_claims::jsonb->>'role';
    exception when others then
      v_role:=current_user;
    end;
  else
    v_role:=current_user;
  end if;

  if tg_op='UPDATE' then
    select coalesce(array_agg(k order by k),'{}'::text[])
    into v_changed
    from (
      select key as k
      from jsonb_object_keys(v_old||v_new) key
      where (v_old->key) is distinct from (v_new->key)
        and key not in ('updated_at','updated_by')
    ) s;
  elsif tg_op='INSERT' then
    v_changed:=array['record_created'];
  else
    v_changed:=array['record_deleted'];
  end if;

  v_reference:=coalesce(
    v_new->>'job_number',v_old->>'job_number',
    v_new->>'invoice_number',v_old->>'invoice_number',
    v_new->>'quotation_number',v_old->>'quotation_number',
    v_new->>'customer_code',v_old->>'customer_code'
  );

  insert into public.platform_audit_log(
    actor_user_id,actor_role,source,action,entity_type,entity_id,
    changed_fields,old_status,new_status,reference,metadata
  )
  values(
    auth.uid(),
    v_role,
    case
      when auth.uid() is not null then 'authenticated'
      when v_role='service_role' then 'service_role'
      else 'database'
    end,
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    v_changed,
    nullif(v_old->>'status',''),
    nullif(v_new->>'status',''),
    v_reference,
    jsonb_strip_nulls(jsonb_build_object(
      'schema',tg_table_schema,
      'trigger',tg_name
    ))
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.capture_platform_audit()
from public,anon,authenticated;

do $$
declare
  v_table text;
  v_tables text[]:=array[
    'enquiries',
    'customers',
    'catalogue_items',
    'quotations',
    'invoices',
    'invoice_payments',
    'service_jobs',
    'service_job_materials',
    'technicians',
    'customer_care_campaigns',
    'customer_contact_preferences',
    'telephony_adapter_contracts',
    'business_billing_settings'
  ];
begin
  foreach v_table in array v_tables loop
    if exists(
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_table
    ) then
      execute format('drop trigger if exists platform_audit_change on public.%I',v_table);
      execute format(
        'create trigger platform_audit_change after insert or update or delete on public.%I for each row execute function private.capture_platform_audit()',
        v_table
      );
    end if;
  end loop;
end
$$;

create or replace function public.platform_health_readiness()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_last_recovery timestamptz;
  v_audit_count bigint;
  v_failed_outbox bigint;
  v_open_dead_letters bigint;
  v_unlinked_techs bigint;
  v_cleanup_cron boolean:=false;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to view platform health' using errcode='42501';
  end if;

  select max(completed_at) into v_last_recovery
  from public.platform_recovery_drills
  where status='passed';

  select count(*) into v_audit_count
  from public.platform_audit_log;

  select count(*) into v_failed_outbox
  from public.customer_contact_outbox
  where status='failed';

  select count(*) into v_open_dead_letters
  from public.customer_care_dead_letters
  where status='open';

  select count(*) into v_unlinked_techs
  from public.technicians
  where active=true and mobile_access_enabled=true and auth_user_id is null;

  if exists(select 1 from pg_extension where extname='pg_cron') then
    select exists(
      select 1 from cron.job
      where jobname='prune-public-enquiry-attempts'
    ) into v_cleanup_cron;
  end if;

  return jsonb_build_object(
    'checked_at',now(),
    'database','ok',
    'security',jsonb_build_object(
      'direct_anon_enquiry_insert',has_table_privilege('anon','public.enquiries','INSERT'),
      'website_anon_insert_policy_exists',exists(
        select 1 from pg_policies
        where schemaname='public' and tablename='enquiries'
          and policyname='website_create_enquiry'
      ),
      'public_enquiry_rate_limit_service_only',
        has_function_privilege('service_role','public.consume_public_enquiry_quota(text,text)','EXECUTE')
        and not has_function_privilege('anon','public.consume_public_enquiry_quota(text,text)','EXECUTE'),
      'public_enquiry_submit_service_only',
        has_function_privilege('service_role','public.submit_public_enquiry(text,text,text,text,text)','EXECUTE')
        and not has_function_privilege('anon','public.submit_public_enquiry(text,text,text,text,text)','EXECUTE'),
      'anti_abuse_hash_cleanup_scheduled',v_cleanup_cron,
      'leaked_password_protection','external_auth_setting_check_required'
    ),
    'audit',jsonb_build_object(
      'event_count',v_audit_count,
      'covered_trigger_count',(
        select count(*)
        from information_schema.triggers
        where trigger_schema='public'
          and trigger_name='platform_audit_change'
      )
    ),
    'recovery',jsonb_build_object(
      'last_successful_drill_at',v_last_recovery,
      'verified',v_last_recovery is not null
    ),
    'operations',jsonb_build_object(
      'failed_customer_contact_outbox',v_failed_outbox,
      'open_customer_care_dead_letters',v_open_dead_letters,
      'active_mobile_technicians_unlinked',v_unlinked_techs
    ),
    'automated_calling',jsonb_build_object(
      'emergency_stop',(select telephony_emergency_stop from public.ai_voice_engine_settings where singleton=true),
      'live_telephony_enabled',(select live_telephony_enabled from public.ai_voice_engine_settings where singleton=true),
      'live_adapter_count',(select count(*) from public.telephony_adapter_contracts where enabled=true and live_enabled=true)
    )
  );
end;
$$;

revoke all on function public.platform_health_readiness()
from public,anon,authenticated;
grant execute on function public.platform_health_readiness()
to authenticated;
