-- Administrator can safely refresh the visit PLANNER, never create jobs.
begin;
create or replace function public.refresh_maintenance_schedule()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_admin() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 return private.refresh_service_maintenance_visits(current_date);
end;
$$;
revoke all on function public.refresh_maintenance_schedule() from public,anon,authenticated;
grant execute on function public.refresh_maintenance_schedule() to authenticated;
commit;
