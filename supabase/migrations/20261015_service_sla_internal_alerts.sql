-- Internal service SLA escalation: persisted, deduplicated, auditable alerts.
-- Uses the existing pg_cron extension; no external calls or paid providers.
-- Alerts apply ONLY to deadlines explicitly recorded on service jobs.
begin;

create table if not exists public.service_sla_alerts (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  alert_kind text not null check (
    alert_kind in ('response_breach','resolution_breach','response_due_soon','resolution_due_soon')
  ),
  target_due_at timestamptz not null,
  status text not null default 'open'
    check(status in ('open','acknowledged','resolved')),
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_reason text check (
    resolution_reason is null or resolution_reason='condition_cleared'
  ),
  constraint service_sla_alert_unique_event unique(service_job_id,alert_kind,target_due_at)
);
create index if not exists service_sla_alerts_status_detected_idx
  on public.service_sla_alerts(status,detected_at desc);
create index if not exists service_sla_alerts_job_detected_idx
  on public.service_sla_alerts(service_job_id,detected_at desc);

alter table public.service_sla_alerts enable row level security;
revoke all on public.service_sla_alerts from public,anon,authenticated;
grant select on public.service_sla_alerts to authenticated;
drop policy if exists active_admin_read_service_sla_alerts on public.service_sla_alerts;
create policy active_admin_read_service_sla_alerts on public.service_sla_alerts
  for select to authenticated
  using ((select private.is_active_admin()));

-- Pure database-time condition set. Neither priority nor scheduler invents
-- a missing deadline. Response = arrived_at; resolution = completed_at.
create or replace function private.service_sla_active_alert_conditions(
  p_now timestamptz
)
returns table(service_job_id uuid,alert_kind text,target_due_at timestamptz)
language sql stable security invoker set search_path='' as $$
select j.id, c.kind, c.deadline
from public.service_jobs j
cross join lateral (values
  ('response_breach'::text,j.sla_response_due_at,
    j.status <> 'cancelled'
      and ((j.arrived_at is not null and j.arrived_at > j.sla_response_due_at)
        or (j.arrived_at is null and j.status not in ('completed','cancelled')
          and p_now > j.sla_response_due_at))),
  ('resolution_breach'::text,j.sla_resolution_due_at,
    j.status <> 'cancelled'
      and ((j.completed_at is not null and j.completed_at > j.sla_resolution_due_at)
        or (j.completed_at is null and j.status not in ('completed','cancelled')
          and p_now > j.sla_resolution_due_at))),
  ('response_due_soon'::text,j.sla_response_due_at,
    j.status not in ('completed','cancelled')
      and j.arrived_at is null
      and j.sla_response_due_at > p_now
      and j.sla_response_due_at <= p_now + interval '60 minutes'),
  ('resolution_due_soon'::text,j.sla_resolution_due_at,
    j.status not in ('completed','cancelled')
      and j.completed_at is null
      and j.sla_resolution_due_at > p_now
      and j.sla_resolution_due_at <= p_now + interval '60 minutes')
) as c(kind,deadline,should_alert)
where c.deadline is not null and c.should_alert
$$;
revoke all on function private.service_sla_active_alert_conditions(timestamptz)
  from public,anon,authenticated;

-- The task runs under cron's database role. A unique event key prevents
-- duplicate alerts across retries, schedules, repeated page loads and restarts.
create or replace function private.refresh_service_sla_alerts()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz:=now();
  v_current_count integer:=0;
  v_open_count integer:=0;
begin
  with live as materialized (
    select service_job_id,alert_kind,target_due_at
    from private.service_sla_active_alert_conditions(v_now)
  ), inserted as (
    insert into public.service_sla_alerts(
      service_job_id,alert_kind,target_due_at,detected_at,last_seen_at,status
    )
    select service_job_id,alert_kind,target_due_at,v_now,v_now,'open'
    from live
    on conflict(service_job_id,alert_kind,target_due_at)
      do update set last_seen_at=excluded.last_seen_at
      where public.service_sla_alerts.status in ('open','acknowledged')
    returning 1
  )
  select count(*)::integer into v_current_count from inserted;

  -- Once a deadline changes, a visit completes on time, or a near-due warning
  -- becomes an expired deadline, close the obsolete alert. Historical breach
  -- evidence stays recorded; we never delete it.
  update public.service_sla_alerts a
  set status='resolved',resolved_at=v_now,resolution_reason='condition_cleared'
  where a.status in ('open','acknowledged')
    and not exists (
      select 1
      from private.service_sla_active_alert_conditions(v_now) c
      where c.service_job_id=a.service_job_id
        and c.alert_kind=a.alert_kind
        and c.target_due_at=a.target_due_at
    );

  select count(*)::integer into v_open_count
  from public.service_sla_alerts where status='open';
  return jsonb_build_object(
    'ok',true,'current_events_refreshed',v_current_count,
    'unacknowledged_alerts',v_open_count
  );
end;
$$;
revoke all on function private.refresh_service_sla_alerts()
  from public,anon,authenticated;

-- An authenticated active admin can acknowledge, but cannot fabricate
-- alert events or alter the target due date.
create or replace function public.acknowledge_service_sla_alert(p_alert_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_row public.service_sla_alerts%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into v_row from public.service_sla_alerts
    where id=p_alert_id for update;
  if not found then
    raise exception 'Unknown service SLA alert';
  end if;
  if v_row.status='open' then
    update public.service_sla_alerts
    set status='acknowledged',acknowledged_at=now(),
      acknowledged_by=auth.uid()
    where id=p_alert_id;
  end if;
  return jsonb_build_object(
    'ok',true,'id',p_alert_id,
    'status',(select status from public.service_sla_alerts where id=p_alert_id)
  );
end;
$$;
revoke all on function public.acknowledge_service_sla_alert(uuid)
  from public,anon,authenticated;
grant execute on function public.acknowledge_service_sla_alert(uuid)
  to authenticated;

-- The database already runs pg_cron. No additional infrastructure,
-- webhook, SMS, email, WhatsApp, or telephone integration is created.
select cron.schedule(
  'minarva-service-sla-internal-alerts',
  '*/15 * * * *',
  'select private.refresh_service_sla_alerts();'
);
commit;
