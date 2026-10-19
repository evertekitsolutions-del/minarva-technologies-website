-- Renewal links are explicit admin-only successor contracts, not amendments.
-- No automatic invoicing, scheduling, customer messages, or activation.
begin;

alter table public.service_maintenance_contracts
  add column if not exists renewed_from_contract_id uuid
  references public.service_maintenance_contracts(id) on delete restrict;

create unique index if not exists maintenance_one_successor_per_contract_idx
  on public.service_maintenance_contracts(renewed_from_contract_id)
  where renewed_from_contract_id is not null;

create index if not exists maintenance_contract_expiry_idx
  on public.service_maintenance_contracts(ends_on,id);

-- Existing admin-only RLS remains the authority for reading a predecessor.
-- A successor cannot overlap or move to another customer.
create or replace function private.service_maintenance_validate_renewal()
returns trigger language plpgsql security invoker set search_path='' as $renewal$
declare
  v_prior_customer uuid;
  v_prior_ends date;
begin
  if tg_op='UPDATE'
     and new.renewed_from_contract_id is distinct from old.renewed_from_contract_id then
    raise exception 'Renewal ancestry is immutable; create another contract'
      using errcode='23514';
  end if;

  if new.renewed_from_contract_id is null then
    return new;
  end if;

  if new.id = new.renewed_from_contract_id then
    raise exception 'A contract cannot renew itself' using errcode='23514';
  end if;

  select customer_id,ends_on
    into v_prior_customer,v_prior_ends
    from public.service_maintenance_contracts
   where id=new.renewed_from_contract_id;

  if not found then
    raise exception 'Source contract missing or inaccessible'
      using errcode='23503';
  end if;

  if new.customer_id is distinct from v_prior_customer then
    raise exception 'Renewal must retain the same customer'
      using errcode='23514';
  end if;

  if new.starts_on <= v_prior_ends then
    raise exception 'Renewal coverage must start after the previous coverage ends'
      using errcode='23514';
  end if;

  if tg_op='INSERT' and new.active then
    raise exception 'Renewal must be reviewed and activated separately'
      using errcode='23514';
  end if;
  return new;
end;
$renewal$;

revoke all on function private.service_maintenance_validate_renewal()
  from public,anon,authenticated;

drop trigger if exists service_maintenance_validate_renewal
  on public.service_maintenance_contracts;
create trigger service_maintenance_validate_renewal
  before insert or update on public.service_maintenance_contracts
  for each row execute function private.service_maintenance_validate_renewal();

-- The existing admin RLS, immutable coverage trigger, and explicit
-- activation workflow remain unchanged.
commit;
