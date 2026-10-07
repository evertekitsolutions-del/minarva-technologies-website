-- Platform — Milestone 4A1B
-- Release-readiness and end-to-end UAT control plane.
-- This does not fabricate a passed UAT run; evidence must be recorded explicitly.

create table if not exists public.platform_release_checklist (
  check_key text primary key,
  category text not null,
  title text not null,
  blocking boolean not null default true,
  automated boolean not null default false,
  status text not null default 'pending'
    check(status in ('pending','pass','fail','waived','not_applicable')),
  evidence text,
  notes text,
  sort_order integer not null default 100,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists platform_release_checklist_status_idx
  on public.platform_release_checklist(status,blocking,sort_order);

drop trigger if exists platform_release_checklist_updated_at on public.platform_release_checklist;
create trigger platform_release_checklist_updated_at
before update on public.platform_release_checklist
for each row execute function private.set_updated_at();

alter table public.platform_release_checklist enable row level security;
revoke all on public.platform_release_checklist from anon;
grant select,insert,update,delete on public.platform_release_checklist to authenticated;

drop policy if exists "active_admin_manage_platform_release_checklist" on public.platform_release_checklist;
create policy "active_admin_manage_platform_release_checklist"
on public.platform_release_checklist
for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create table if not exists public.platform_uat_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  environment text not null default 'production-like'
    check(environment in ('local','staging','production-like','production')),
  status text not null default 'planned'
    check(status in ('planned','running','passed','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  summary text,
  evidence_reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_uat_runs_status_created_idx
  on public.platform_uat_runs(status,created_at desc);

drop trigger if exists platform_uat_runs_updated_at on public.platform_uat_runs;
create trigger platform_uat_runs_updated_at
before update on public.platform_uat_runs
for each row execute function private.set_updated_at();

alter table public.platform_uat_runs enable row level security;
revoke all on public.platform_uat_runs from anon;
grant select,insert,update,delete on public.platform_uat_runs to authenticated;

drop policy if exists "active_admin_manage_platform_uat_runs" on public.platform_uat_runs;
create policy "active_admin_manage_platform_uat_runs"
on public.platform_uat_runs
for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create table if not exists public.platform_uat_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.platform_uat_runs(id) on delete cascade,
  step_key text not null,
  area text not null,
  title text not null,
  blocking boolean not null default true,
  status text not null default 'pending'
    check(status in ('pending','pass','fail','blocked','not_applicable')),
  evidence text,
  notes text,
  tested_by uuid references auth.users(id) on delete set null,
  tested_at timestamptz,
  sort_order integer not null default 100,
  unique(run_id,step_key)
);

create index if not exists platform_uat_steps_run_status_idx
  on public.platform_uat_steps(run_id,status,sort_order);
create index if not exists platform_uat_steps_tested_by_idx
  on public.platform_uat_steps(tested_by,tested_at desc)
  where tested_by is not null;

alter table public.platform_uat_steps enable row level security;
revoke all on public.platform_uat_steps from anon;
grant select,insert,update,delete on public.platform_uat_steps to authenticated;

drop policy if exists "active_admin_manage_platform_uat_steps" on public.platform_uat_steps;
create policy "active_admin_manage_platform_uat_steps"
on public.platform_uat_steps
for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

insert into public.platform_release_checklist(check_key,category,title,blocking,automated,status,notes,sort_order)
values
  ('security_no_direct_anon_enquiry','Security','Direct anonymous enquiry INSERT disabled',true,true,'pending','Automated from database grants/policies.',10),
  ('security_rate_limit','Security','Public enquiry anti-abuse/rate-limit enabled',true,true,'pending','Automated from service-only anti-abuse RPC and retention cron.',20),
  ('security_headers','Security','Production security headers reviewed',true,false,'pending','Verify CSP/HSTS/X-Content-Type-Options/X-Frame-Options/Referrer/Permissions policy on production deployment.',30),
  ('security_leaked_passwords','Security','Supabase leaked-password protection enabled',true,false,'pending','Current Supabase advisor warning must be cleared before release sign-off.',40),
  ('audit_coverage','Audit','Cross-module audit triggers installed',true,true,'pending','Automated trigger coverage check.',50),
  ('recovery_drill','Recovery','Successful restore/recovery drill recorded',true,true,'pending','Must have a real passed recovery drill; feature existence alone is insufficient.',60),
  ('monitoring_health','Operations','Platform health checks reviewed',true,true,'pending','Failed outbox/dead letters/technician linkage should be clear before release.',70),
  ('uat_enquiry_customer','UAT','Enquiry → Customer flow passed',true,false,'pending',null,100),
  ('uat_quote_invoice','UAT','Quotation → Invoice flow passed',true,false,'pending',null,110),
  ('uat_payment','UAT','Invoice payment flow passed',true,false,'pending',null,120),
  ('uat_service_job','UAT','Service Job → Job Sheet flow passed',true,false,'pending',null,130),
  ('uat_technician','UAT','Technician PWA assigned-job flow passed',true,false,'pending',null,140),
  ('uat_customer_care','UAT','Customer Care notification/callback flow passed',true,false,'pending',null,150),
  ('uat_ai_voice','UAT','AI Voice Sandbox flow passed',true,false,'pending',null,160),
  ('uat_calling_readiness','UAT','Calling Readiness dry-run flow passed',true,false,'pending',null,170),
  ('responsive','UX','Mobile/responsive regression passed',true,false,'pending',null,180),
  ('release_freeze','Release','Final release freeze approved',true,false,'pending','No new feature work after approval except release blockers.',190)
on conflict(check_key) do update set
  category=excluded.category,
  title=excluded.title,
  blocking=excluded.blocking,
  automated=excluded.automated,
  notes=excluded.notes,
  sort_order=excluded.sort_order;

create or replace function public.platform_refresh_automated_release_checks()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_direct_anon boolean;
  v_anon_policy boolean;
  v_rate_service_only boolean;
  v_cleanup boolean:=false;
  v_audit_trigger_count integer;
  v_last_recovery timestamptz;
  v_failed_outbox bigint;
  v_dead_letters bigint;
  v_unlinked bigint;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to refresh release checks' using errcode='42501';
  end if;

  v_direct_anon:=has_table_privilege('anon','public.enquiries','INSERT');
  select exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='enquiries' and policyname='website_create_enquiry'
  ) into v_anon_policy;

  v_rate_service_only:=
    has_function_privilege('service_role','public.consume_public_enquiry_quota(text,text)','EXECUTE')
    and not has_function_privilege('anon','public.consume_public_enquiry_quota(text,text)','EXECUTE');

  if exists(select 1 from pg_extension where extname='pg_cron') then
    select exists(select 1 from cron.job where jobname='prune-public-enquiry-attempts')
      into v_cleanup;
  end if;

  select count(*) into v_audit_trigger_count
  from information_schema.triggers
  where trigger_schema='public' and trigger_name='platform_audit_change';

  select max(completed_at) into v_last_recovery
  from public.platform_recovery_drills
  where status='passed';

  select count(*) into v_failed_outbox
  from public.customer_contact_outbox where status='failed';

  select count(*) into v_dead_letters
  from public.customer_care_dead_letters where status='open';

  select count(*) into v_unlinked
  from public.technicians
  where active=true and mobile_access_enabled=true and auth_user_id is null;

  update public.platform_release_checklist
  set
    status=case when not v_direct_anon and not v_anon_policy then 'pass' else 'fail' end,
    evidence=jsonb_build_object('anon_insert_grant',v_direct_anon,'anon_insert_policy',v_anon_policy)::text,
    updated_by=auth.uid()
  where check_key='security_no_direct_anon_enquiry';

  update public.platform_release_checklist
  set
    status=case when v_rate_service_only and v_cleanup then 'pass' else 'fail' end,
    evidence=jsonb_build_object('service_only_quota',v_rate_service_only,'cleanup_cron',v_cleanup)::text,
    updated_by=auth.uid()
  where check_key='security_rate_limit';

  update public.platform_release_checklist
  set
    status=case when v_audit_trigger_count>=8 then 'pass' else 'fail' end,
    evidence=jsonb_build_object('audit_trigger_count',v_audit_trigger_count)::text,
    updated_by=auth.uid()
  where check_key='audit_coverage';

  update public.platform_release_checklist
  set
    status=case when v_last_recovery is not null then 'pass' else 'fail' end,
    evidence=jsonb_build_object('last_successful_recovery_drill',v_last_recovery)::text,
    updated_by=auth.uid()
  where check_key='recovery_drill';

  update public.platform_release_checklist
  set
    status=case when v_failed_outbox=0 and v_dead_letters=0 and v_unlinked=0 then 'pass' else 'fail' end,
    evidence=jsonb_build_object(
      'failed_outbox',v_failed_outbox,
      'open_dead_letters',v_dead_letters,
      'unlinked_mobile_technicians',v_unlinked
    )::text,
    updated_by=auth.uid()
  where check_key='monitoring_health';

  return jsonb_build_object(
    'direct_anon_enquiry_insert',v_direct_anon,
    'anonymous_website_insert_policy',v_anon_policy,
    'rate_limit_service_only',v_rate_service_only,
    'cleanup_cron',v_cleanup,
    'audit_trigger_count',v_audit_trigger_count,
    'last_recovery_drill',v_last_recovery,
    'failed_outbox',v_failed_outbox,
    'open_dead_letters',v_dead_letters,
    'unlinked_mobile_technicians',v_unlinked
  );
end;
$$;

revoke all on function public.platform_refresh_automated_release_checks()
from public,anon,authenticated;
grant execute on function public.platform_refresh_automated_release_checks()
to authenticated;

create or replace function public.platform_create_uat_run(
  p_name text default 'Production Release UAT',
  p_environment text default 'production-like'
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to create UAT runs' using errcode='42501';
  end if;
  if p_environment not in ('local','staging','production-like','production') then
    raise exception 'Invalid UAT environment';
  end if;

  insert into public.platform_uat_runs(
    name,environment,status,started_at,created_by
  )
  values(
    coalesce(nullif(btrim(p_name),''),'Production Release UAT'),
    p_environment,
    'running',
    now(),
    auth.uid()
  )
  returning id into v_id;

  insert into public.platform_uat_steps(run_id,step_key,area,title,blocking,status,sort_order)
  values
    (v_id,'enquiry_customer','CRM','Enquiry → Customer conversion',true,'pending',10),
    (v_id,'quotation_invoice','Billing','Quotation → Invoice conversion',true,'pending',20),
    (v_id,'invoice_payment','Billing','Invoice payment / balance update',true,'pending',30),
    (v_id,'service_job_sheet','Service','Service Job → Job Sheet execution',true,'pending',40),
    (v_id,'technician_pwa','Technician','Assigned job → technician PWA execution',true,'pending',50),
    (v_id,'customer_care','Customer Care','Notification / callback orchestration',true,'pending',60),
    (v_id,'ai_voice','AI Voice','AI Voice Sandbox intent/callback/escalation',true,'pending',70),
    (v_id,'calling_readiness','Calling','Calling Readiness dry-run / consent gates',true,'pending',80),
    (v_id,'responsive_mobile','UX','Mobile/responsive regression',true,'pending',90),
    (v_id,'recovery','Recovery','Recovery drill evidence reviewed',true,'pending',100);

  return v_id;
end;
$$;

revoke all on function public.platform_create_uat_run(text,text)
from public,anon,authenticated;
grant execute on function public.platform_create_uat_run(text,text)
to authenticated;

create or replace function public.platform_update_uat_step(
  p_step_id uuid,
  p_status text,
  p_evidence text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_step public.platform_uat_steps%rowtype;
  v_run public.platform_uat_runs%rowtype;
  v_blocking_fail integer;
  v_pending integer;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to update UAT steps' using errcode='42501';
  end if;
  if p_status not in ('pending','pass','fail','blocked','not_applicable') then
    raise exception 'Invalid UAT status';
  end if;

  update public.platform_uat_steps
  set
    status=p_status,
    evidence=nullif(btrim(coalesce(p_evidence,'')),''),
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    tested_by=auth.uid(),
    tested_at=case when p_status='pending' then null else now() end
  where id=p_step_id
  returning * into v_step;

  if not found then raise exception 'UAT step not found'; end if;

  select
    count(*) filter(where blocking=true and status in ('fail','blocked')),
    count(*) filter(where blocking=true and status='pending')
  into v_blocking_fail,v_pending
  from public.platform_uat_steps
  where run_id=v_step.run_id;

  update public.platform_uat_runs
  set
    status=case
      when v_blocking_fail>0 then 'failed'
      when v_pending=0 then 'passed'
      else 'running'
    end,
    completed_at=case
      when v_blocking_fail>0 or v_pending=0 then now()
      else null
    end
  where id=v_step.run_id
  returning * into v_run;

  return jsonb_build_object(
    'step_id',v_step.id,
    'step_status',v_step.status,
    'run_id',v_run.id,
    'run_status',v_run.status
  );
end;
$$;

revoke all on function public.platform_update_uat_step(uuid,text,text,text)
from public,anon,authenticated;
grant execute on function public.platform_update_uat_step(uuid,text,text,text)
to authenticated;

create or replace function public.platform_release_readiness()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_total integer;
  v_pass integer;
  v_fail integer;
  v_pending integer;
  v_latest_uat public.platform_uat_runs%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to view release readiness' using errcode='42501';
  end if;

  perform public.platform_refresh_automated_release_checks();

  select
    count(*) filter(where blocking=true),
    count(*) filter(where blocking=true and status='pass'),
    count(*) filter(where blocking=true and status='fail'),
    count(*) filter(where blocking=true and status='pending')
  into v_total,v_pass,v_fail,v_pending
  from public.platform_release_checklist;

  select * into v_latest_uat
  from public.platform_uat_runs
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'ready_for_release',v_total>0 and v_pass=v_total,
    'blocking_total',v_total,
    'blocking_pass',v_pass,
    'blocking_fail',v_fail,
    'blocking_pending',v_pending,
    'latest_uat',case when v_latest_uat.id is null then null else to_jsonb(v_latest_uat) end,
    'automated_calling_live_enabled',(select live_telephony_enabled from public.ai_voice_engine_settings where singleton=true),
    'telephony_emergency_stop',(select telephony_emergency_stop from public.ai_voice_engine_settings where singleton=true)
  );
end;
$$;

revoke all on function public.platform_release_readiness()
from public,anon,authenticated;
grant execute on function public.platform_release_readiness()
to authenticated;
