-- A contract must be explicitly activated; never silently reassign customers
-- or revise coverage/recurrence after creation.
begin;
create or replace function private.service_maintenance_prepare_contract()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.customer_id is distinct from old.customer_id
      or new.contract_number is distinct from old.contract_number
      or new.starts_on is distinct from old.starts_on
      or new.ends_on is distinct from old.ends_on
      or new.first_visit_on is distinct from old.first_visit_on
      or new.maintenance_interval_months is distinct from old.maintenance_interval_months
      or new.contract_type is distinct from old.contract_type then
     raise exception 'Create a new contract to change customer, coverage or recurrence';
   end if;
   if new.active and not old.active then new.activated_at:=now();
   elsif not new.active then new.activated_at:=null;
   else new.activated_at:=old.activated_at; end if;
   new.created_at:=old.created_at;
   new.created_by:=old.created_by;
 else
   if new.active then new.activated_at:=now(); end if;
   new.created_by:=auth.uid();
 end if;
 new.updated_at:=now();
 new.updated_by:=auth.uid();
 return new;
end;
$$;
revoke all on function private.service_maintenance_prepare_contract()
 from public,anon,authenticated;
create trigger service_maintenance_prepare_contract
 before insert or update on public.service_maintenance_contracts
 for each row execute function private.service_maintenance_prepare_contract();

-- Generate visit records only; customer contact and service job creation
-- require separate explicit authenticated administrative actions.
create or replace function private.refresh_service_maintenance_visits(
 p_as_of date default current_date
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inserted integer:=0;
begin
 if p_as_of is null then raise exception 'Date required'; end if;
 with potential as (
   select c.id as contract_id,
     (c.first_visit_on::timestamp
       + make_interval(months=>(n * c.maintenance_interval_months)))::date as due_on,
     c.starts_on,c.ends_on,c.activated_at
   from public.service_maintenance_contracts c
   cross join lateral generate_series(0,120) n
   where c.active=true
     and c.activated_at is not null
     and c.contract_type in ('amc','combined')
 ), eligible as (
   select contract_id,due_on from potential
   where due_on between greatest(starts_on,activated_at::date,p_as_of)
     and least(ends_on,p_as_of+45)
 ), created as (
   insert into public.service_maintenance_visits(contract_id,due_on)
   select contract_id,due_on from eligible
   on conflict(contract_id,due_on) do nothing
   returning id
 )
 select count(*)::integer into v_inserted from created;
 return jsonb_build_object('ok',true,'created_visit_records',v_inserted);
end;
$$;
revoke all on function private.refresh_service_maintenance_visits(date)
 from public,anon,authenticated;
-- Existing free-tier database already has pg_cron enabled.
select cron.schedule('minarva-maintenance-visits-daily','22 2 * * *',
 'select private.refresh_service_maintenance_visits();');
commit;
