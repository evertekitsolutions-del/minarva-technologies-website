-- Platform 4A2B2: production health snapshot monitoring.
create table if not exists public.platform_health_snapshots (
 id bigint generated always as identity primary key,
 captured_at timestamptz not null default now(),
 failed_outbox bigint not null,
 open_dead_letters bigint not null,
 unlinked_mobile_technicians bigint not null,
 anon_enquiry_insert_enabled boolean not null,
 legacy_public_enquiry_policy_present boolean not null,
 audit_trigger_count integer not null,
 live_telephony_enabled boolean not null,
 telephony_emergency_stop boolean not null,
 live_adapter_count integer not null,
 healthy boolean not null
);
create index if not exists platform_health_snapshots_captured_idx on public.platform_health_snapshots(captured_at desc);
alter table public.platform_health_snapshots enable row level security;
revoke all on public.platform_health_snapshots from public,anon,authenticated;
grant select on public.platform_health_snapshots to authenticated;
drop policy if exists "active_admin_read_platform_health_snapshots" on public.platform_health_snapshots;
create policy "active_admin_read_platform_health_snapshots" on public.platform_health_snapshots for select to authenticated using ((select private.is_active_admin()));

create or replace function private.capture_platform_health_snapshot()
returns bigint language plpgsql security definer set search_path='' as $$
declare
 v_id bigint; o bigint; d bigint; u bigint; a boolean; p boolean; t integer;
 l boolean; s boolean; x integer;
begin
 select count(*) into o from public.customer_contact_outbox where status='failed';
 select count(*) into d from public.customer_care_dead_letters where status='open';
 select count(*) into u from public.technicians where active=true and mobile_access_enabled=true and auth_user_id is null;
 a:=has_table_privilege('anon','public.enquiries','INSERT');
 select exists(select 1 from pg_policies where schemaname='public' and tablename='enquiries' and policyname='website_create_enquiry') into p;
 select count(*) into t from information_schema.triggers where trigger_schema='public' and trigger_name='platform_audit_change';
 select live_telephony_enabled,telephony_emergency_stop into l,s from public.ai_voice_engine_settings where singleton=true;
 select count(*) into x from public.telephony_adapter_contracts where enabled=true and live_enabled=true;
 insert into public.platform_health_snapshots(failed_outbox,open_dead_letters,unlinked_mobile_technicians,anon_enquiry_insert_enabled,legacy_public_enquiry_policy_present,audit_trigger_count,live_telephony_enabled,telephony_emergency_stop,live_adapter_count,healthy)
 values(o,d,u,a,p,t,coalesce(l,false),coalesce(s,true),x,o=0 and d=0 and u=0 and not a and not p and t>=8 and coalesce(l,false)=false and coalesce(s,true)=true and x=0)
 returning id into v_id;
 delete from public.platform_health_snapshots where captured_at < now()-interval '90 days';
 return v_id;
end $$;
revoke all on function private.capture_platform_health_snapshot() from public,anon,authenticated;
select private.capture_platform_health_snapshot();
do $$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if exists(select 1 from cron.job where jobname='capture-platform-health') then perform cron.unschedule('capture-platform-health'); end if;
  perform cron.schedule('capture-platform-health','*/15 * * * *','select private.capture_platform_health_snapshot();');
 end if;
end $$;