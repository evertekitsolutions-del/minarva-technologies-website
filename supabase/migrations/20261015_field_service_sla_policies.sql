-- Field Service SLA v1: explicit owner-configured targets, OFF by default.
-- No existing job or customer data is backfilled and no external messages fire.
begin;

create table if not exists public.service_sla_policies (
  priority text primary key check(priority in ('low','normal','high','urgent')),
  enabled boolean not null default false,
  response_target_minutes integer check(
    response_target_minutes is null or response_target_minutes between 1 and 525600),
  resolution_target_minutes integer check(
    resolution_target_minutes is null or resolution_target_minutes between 1 and 525600),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint enabled_sla_requires_target check (
    not enabled or response_target_minutes is not null or resolution_target_minutes is not null)
);
alter table public.service_sla_policies enable row level security;
revoke all on public.service_sla_policies from public,anon,authenticated;
grant select,insert,update on public.service_sla_policies to authenticated;
drop policy if exists service_sla_active_admin_manage on public.service_sla_policies;
create policy service_sla_active_admin_manage on public.service_sla_policies
  for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

insert into public.service_sla_policies(priority,enabled,response_target_minutes,resolution_target_minutes)
values ('low',false,null,null),('normal',false,null,null),
  ('high',false,null,null),('urgent',false,null,null)
on conflict(priority) do nothing;

create or replace function private.service_sla_policy_updated()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.priority is distinct from old.priority then
    raise exception 'An SLA priority policy cannot be renamed';
  end if;
  new.updated_at:=now();
  new.updated_by:=auth.uid();
  return new;
end;
$$;
revoke all on function private.service_sla_policy_updated() from public,anon,authenticated;
drop trigger if exists service_sla_policy_updated on public.service_sla_policies;
create trigger service_sla_policy_updated
  before update on public.service_sla_policies
  for each row execute function private.service_sla_policy_updated();

alter table public.service_jobs
  add column if not exists sla_response_due_at timestamptz,
  add column if not exists sla_resolution_due_at timestamptz,
  add column if not exists sla_target_source text
    check(sla_target_source is null or sla_target_source in ('priority_policy','manual')),
  add column if not exists sla_policy_applied_at timestamptz;

-- Snapshot enabled policy only when a NEW job is created. Editing policies
-- never silently rewrites customer commitments on existing jobs.
create or replace function private.service_sla_apply_policy_on_create()
returns trigger language plpgsql set search_path='' as $$
declare
  v_policy public.service_sla_policies%rowtype;
begin
  select * into v_policy from public.service_sla_policies
  where priority=new.priority and enabled=true;
  if found then
    if v_policy.response_target_minutes is not null then
      new.sla_response_due_at:=new.created_at
        + make_interval(mins=>v_policy.response_target_minutes);
    end if;
    if v_policy.resolution_target_minutes is not null then
      new.sla_resolution_due_at:=new.created_at
        + make_interval(mins=>v_policy.resolution_target_minutes);
    end if;
    new.sla_target_source:='priority_policy';
    new.sla_policy_applied_at:=now();
  end if;
  return new;
end;
$$;
revoke all on function private.service_sla_apply_policy_on_create()
  from public,anon,authenticated;
drop trigger if exists service_sla_apply_policy_on_create on public.service_jobs;
create trigger service_sla_apply_policy_on_create
  before insert on public.service_jobs
  for each row execute function private.service_sla_apply_policy_on_create();

create index if not exists service_jobs_sla_response_due_idx
  on public.service_jobs(sla_response_due_at)
  where sla_response_due_at is not null;
create index if not exists service_jobs_sla_resolution_due_idx
  on public.service_jobs(sla_resolution_due_at)
  where sla_resolution_due_at is not null;

commit;
