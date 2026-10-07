-- Platform — Milestone 4A2A
-- Non-destructive structural smoke verification + release-control FK indexes.

create index if not exists platform_release_checklist_updated_by_idx
  on public.platform_release_checklist(updated_by)
  where updated_by is not null;

create index if not exists platform_uat_runs_created_by_idx
  on public.platform_uat_runs(created_by)
  where created_by is not null;

insert into public.platform_release_checklist(
  check_key,category,title,blocking,automated,status,notes,sort_order
)
values(
  'structural_smoke',
  'Verification',
  'Cross-module structural smoke checks pass',
  true,
  true,
  'pending',
  'Checks required tables/functions, RLS, grants, referential integrity and telephony safety locks without creating test business data.',
  80
)
on conflict(check_key) do update set
  category=excluded.category,
  title=excluded.title,
  blocking=excluded.blocking,
  automated=excluded.automated,
  notes=excluded.notes,
  sort_order=excluded.sort_order;

create or replace function public.platform_structural_smoke_check()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_checks jsonb:='[]'::jsonb;
  v_pass boolean:=true;
  v_ok boolean;
  v_count bigint;
  v_required_tables text[]:=array[
    'enquiries','customers','catalogue_items','quotations','quotation_items',
    'invoices','invoice_items','invoice_payments','service_jobs',
    'service_job_materials','service_job_attachments','technicians',
    'customer_contact_outbox','customer_contact_timeline','ai_call_sessions',
    'automated_call_jobs','telephony_adapter_contracts',
    'platform_audit_log','platform_release_checklist','platform_uat_runs','platform_uat_steps'
  ];
  v_required_functions text[]:=array[
    'technician_get_queue',
    'technician_get_job',
    'technician_apply_mobile_action',
    'customer_care_prepare_dispatch',
    'customer_care_call_readiness_audit',
    'platform_health_readiness',
    'platform_release_readiness'
  ];
  v_name text;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to run structural smoke checks' using errcode='42501';
  end if;

  foreach v_name in array v_required_tables loop
    select exists(
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_name
    ) into v_ok;
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
      'key','table:'||v_name,'passed',v_ok,'detail',
      case when v_ok then 'Present' else 'Missing required table' end
    ));
    v_pass:=v_pass and v_ok;
  end loop;

  foreach v_name in array v_required_functions loop
    select exists(
      select 1 from information_schema.routines
      where routine_schema='public' and routine_name=v_name
    ) into v_ok;
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
      'key','function:'||v_name,'passed',v_ok,'detail',
      case when v_ok then 'Present' else 'Missing required function' end
    ));
    v_pass:=v_pass and v_ok;
  end loop;

  select not has_table_privilege('anon','public.enquiries','INSERT')
    into v_ok;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','security:anon_enquiry_insert_disabled','passed',v_ok,
    'detail',case when v_ok then 'Anonymous direct INSERT disabled' else 'Anonymous direct INSERT still allowed' end
  ));
  v_pass:=v_pass and v_ok;

  select not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='enquiries'
      and policyname='website_create_enquiry'
  ) into v_ok;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','security:legacy_website_insert_policy_removed','passed',v_ok,
    'detail',case when v_ok then 'Legacy anonymous insert policy absent' else 'Legacy anonymous insert policy still exists' end
  ));
  v_pass:=v_pass and v_ok;

  select count(*)=0 into v_ok
  from (
    values
      ('enquiries'),
      ('customers'),
      ('quotations'),
      ('quotation_items'),
      ('invoices'),
      ('invoice_items'),
      ('invoice_payments'),
      ('service_jobs'),
      ('service_job_materials'),
      ('technicians'),
      ('customer_contact_outbox'),
      ('platform_audit_log'),
      ('platform_release_checklist'),
      ('platform_uat_runs'),
      ('platform_uat_steps')
  ) as req(table_name)
  where not exists(
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname=req.table_name
      and c.relrowsecurity=true
  );
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','security:core_rls_enabled','passed',v_ok,
    'detail',case when v_ok then 'RLS enabled on checked core tables' else 'One or more checked core tables lacks RLS' end
  ));
  v_pass:=v_pass and v_ok;

  select count(*) into v_count
  from public.quotation_items qi
  left join public.quotations q on q.id=qi.quotation_id
  where q.id is null;
  v_ok:=v_count=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','integrity:quotation_items','passed',v_ok,'detail','Orphan rows: '||v_count
  ));
  v_pass:=v_pass and v_ok;

  select count(*) into v_count
  from public.invoice_items ii
  left join public.invoices i on i.id=ii.invoice_id
  where i.id is null;
  v_ok:=v_count=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','integrity:invoice_items','passed',v_ok,'detail','Orphan rows: '||v_count
  ));
  v_pass:=v_pass and v_ok;

  select count(*) into v_count
  from public.invoice_payments p
  left join public.invoices i on i.id=p.invoice_id
  where i.id is null;
  v_ok:=v_count=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','integrity:invoice_payments','passed',v_ok,'detail','Orphan rows: '||v_count
  ));
  v_pass:=v_pass and v_ok;

  select count(*) into v_count
  from public.service_job_materials m
  left join public.service_jobs j on j.id=m.service_job_id
  where j.id is null;
  v_ok:=v_count=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','integrity:service_job_materials','passed',v_ok,'detail','Orphan rows: '||v_count
  ));
  v_pass:=v_pass and v_ok;

  select count(*) into v_count
  from public.service_job_attachments a
  left join public.service_jobs j on j.id=a.service_job_id
  where j.id is null;
  v_ok:=v_count=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','integrity:service_job_attachments','passed',v_ok,'detail','Orphan rows: '||v_count
  ));
  v_pass:=v_pass and v_ok;

  select
    coalesce((select telephony_emergency_stop from public.ai_voice_engine_settings where singleton=true),false)=true
    and
    coalesce((select live_telephony_enabled from public.ai_voice_engine_settings where singleton=true),false)=false
    and
    (select count(*) from public.telephony_adapter_contracts where enabled=true and live_enabled=true)=0
  into v_ok;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','safety:telephony_locked','passed',v_ok,
    'detail',case when v_ok then 'Emergency stop ON; live calling OFF; no live adapters' else 'Telephony safety lock mismatch' end
  ));
  v_pass:=v_pass and v_ok;

  return jsonb_build_object(
    'passed',v_pass,
    'checked_at',now(),
    'checks',v_checks
  );
end;
$$;

revoke all on function public.platform_structural_smoke_check()
from public,anon,authenticated;
grant execute on function public.platform_structural_smoke_check()
to authenticated;

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
  v_smoke jsonb;
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

  v_smoke:=public.platform_structural_smoke_check();

  update public.platform_release_checklist
  set status=case when not v_direct_anon and not v_anon_policy then 'pass' else 'fail' end,
      evidence=jsonb_build_object('anon_insert_grant',v_direct_anon,'anon_insert_policy',v_anon_policy)::text,
      updated_by=auth.uid()
  where check_key='security_no_direct_anon_enquiry';

  update public.platform_release_checklist
  set status=case when v_rate_service_only and v_cleanup then 'pass' else 'fail' end,
      evidence=jsonb_build_object('service_only_quota',v_rate_service_only,'cleanup_cron',v_cleanup)::text,
      updated_by=auth.uid()
  where check_key='security_rate_limit';

  update public.platform_release_checklist
  set status=case when v_audit_trigger_count>=8 then 'pass' else 'fail' end,
      evidence=jsonb_build_object('audit_trigger_count',v_audit_trigger_count)::text,
      updated_by=auth.uid()
  where check_key='audit_coverage';

  update public.platform_release_checklist
  set status=case when v_last_recovery is not null then 'pass' else 'fail' end,
      evidence=jsonb_build_object('last_successful_recovery_drill',v_last_recovery)::text,
      updated_by=auth.uid()
  where check_key='recovery_drill';

  update public.platform_release_checklist
  set status=case when v_failed_outbox=0 and v_dead_letters=0 and v_unlinked=0 then 'pass' else 'fail' end,
      evidence=jsonb_build_object(
        'failed_outbox',v_failed_outbox,
        'open_dead_letters',v_dead_letters,
        'unlinked_mobile_technicians',v_unlinked
      )::text,
      updated_by=auth.uid()
  where check_key='monitoring_health';

  update public.platform_release_checklist
  set status=case when coalesce((v_smoke->>'passed')::boolean,false) then 'pass' else 'fail' end,
      evidence=v_smoke::text,
      updated_by=auth.uid()
  where check_key='structural_smoke';

  return jsonb_build_object(
    'direct_anon_enquiry_insert',v_direct_anon,
    'anonymous_website_insert_policy',v_anon_policy,
    'rate_limit_service_only',v_rate_service_only,
    'cleanup_cron',v_cleanup,
    'audit_trigger_count',v_audit_trigger_count,
    'last_recovery_drill',v_last_recovery,
    'failed_outbox',v_failed_outbox,
    'open_dead_letters',v_dead_letters,
    'unlinked_mobile_technicians',v_unlinked,
    'structural_smoke',v_smoke
  );
end;
$$;

revoke all on function public.platform_refresh_automated_release_checks()
from public,anon,authenticated;
grant execute on function public.platform_refresh_automated_release_checks()
to authenticated;
