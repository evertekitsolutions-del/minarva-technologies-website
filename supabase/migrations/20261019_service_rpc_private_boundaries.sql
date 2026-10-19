-- Remove publicly exposed SECURITY DEFINER entry points without changing
-- RPC names, payloads, administrator checks, records, or scheduled jobs.
-- The privileged implementations live in a non-API schema.
begin;

create schema if not exists service_ops_private;
revoke all on schema service_ops_private from public, anon, authenticated;
grant usage on schema service_ops_private to authenticated;

create or replace function service_ops_private.acknowledge_service_sla_alert(p_alert_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  v_row public.service_sla_alerts%rowtype;
begin
  if auth.uid() is null or not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into v_row from public.service_sla_alerts
    where id=p_alert_id for update;
  if not found then
    raise exception 'Unknown service SLA alert';
  end if;
  if v_row.status='open' then
    update public.service_sla_alerts
    set status='acknowledged', acknowledged_at=now(),
      acknowledged_by=auth.uid()
    where id=p_alert_id;
  end if;
  return jsonb_build_object(
    'ok',true,'id',p_alert_id,
    'status',(select status from public.service_sla_alerts where id=p_alert_id)
  );
end;
$fn$;

create or replace function service_ops_private.refresh_maintenance_schedule()
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
  if auth.uid() is null or not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  -- Planning is record-only; job creation remains separately admin approved.
  return private.refresh_service_maintenance_visits(current_date);
end;
$fn$;

-- Existing PostgREST RPC names and JSON response shapes remain unchanged.
-- SECURITY INVOKER wrappers have no direct table access or bypass privilege.
create or replace function public.acknowledge_service_sla_alert(p_alert_id uuid)
returns jsonb language sql security invoker set search_path='' as $fn$
  select service_ops_private.acknowledge_service_sla_alert(p_alert_id);
$fn$;

create or replace function public.refresh_maintenance_schedule()
returns jsonb language sql security invoker set search_path='' as $fn$
  select service_ops_private.refresh_maintenance_schedule();
$fn$;

-- Default PUBLIC execution on new functions must be explicitly withdrawn.
revoke all on function
  service_ops_private.acknowledge_service_sla_alert(uuid),
  service_ops_private.refresh_maintenance_schedule(),
  public.acknowledge_service_sla_alert(uuid),
  public.refresh_maintenance_schedule()
  from public, anon, authenticated;

grant execute on function
  service_ops_private.acknowledge_service_sla_alert(uuid),
  service_ops_private.refresh_maintenance_schedule(),
  public.acknowledge_service_sla_alert(uuid),
  public.refresh_maintenance_schedule()
  to authenticated;

-- No grants for anon, no role escalation, no cron replacement, no test data.
commit;
