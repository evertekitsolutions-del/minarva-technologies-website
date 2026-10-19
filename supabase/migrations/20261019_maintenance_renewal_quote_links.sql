-- Explicit AMC renewal -> existing quotation reference.
-- No amount generation, invoice mutation, or customer messaging.
begin;

create table public.service_maintenance_quotation_links (
  contract_id uuid primary key
    references public.service_maintenance_contracts(id) on delete restrict,
  quotation_id uuid not null unique
    references public.quotations(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users(id) on delete set null
);

alter table public.service_maintenance_quotation_links enable row level security;
revoke all on public.service_maintenance_quotation_links from public,anon,authenticated;
grant select,insert on public.service_maintenance_quotation_links to authenticated;

create policy maintenance_quotation_links_admin_select
 on public.service_maintenance_quotation_links for select to authenticated
 using ((select private.is_active_admin()));

create policy maintenance_quotation_links_admin_insert
 on public.service_maintenance_quotation_links for insert to authenticated
 with check ((select private.is_active_admin()));

create or replace function private.maintenance_validate_quote_link()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare
  v_customer uuid;
  v_predecessor uuid;
  v_quote_customer uuid;
  v_quote_status text;
begin
  if auth.uid() is null or not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select customer_id,renewed_from_contract_id
    into v_customer,v_predecessor
    from public.service_maintenance_contracts where id=new.contract_id;
  if not found or v_predecessor is null then
    raise exception 'Only existing AMC/Warranty renewal successors may be linked'
      using errcode='23514';
  end if;

  select customer_id,status into v_quote_customer,v_quote_status
    from public.quotations where id=new.quotation_id;
  if not found or v_quote_customer is distinct from v_customer then
    raise exception 'Quotation customer must match the renewal contract'
      using errcode='23514';
  end if;

  if v_quote_status not in ('draft','sent','accepted','converted') then
    raise exception 'Cannot link a rejected, expired or cancelled quotation'
      using errcode='23514';
  end if;

  new.linked_at:=now();
  new.linked_by:=auth.uid();
  return new;
end;
$fn$;
revoke all on function private.maintenance_validate_quote_link()
 from public,anon,authenticated;

create trigger maintenance_validate_quote_link
 before insert on public.service_maintenance_quotation_links
 for each row execute function private.maintenance_validate_quote_link();

-- The quotation editor normally permits editing a draft's customer.
-- Preserve authoritative identity after it is associated with a renewal.
create or replace function private.maintenance_guard_linked_quote_customer()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
  if new.customer_id is distinct from old.customer_id
     and exists (
       select 1 from public.service_maintenance_quotation_links
        where quotation_id=old.id
     ) then
    raise exception 'Unlinking a renewal requires an auditable correction workflow'
      using errcode='23514';
  end if;
  return new;
end;
$fn$;
revoke all on function private.maintenance_guard_linked_quote_customer()
 from public,anon,authenticated;

create trigger maintenance_guard_linked_quote_customer
 before update of customer_id on public.quotations
 for each row execute function private.maintenance_guard_linked_quote_customer();

-- No UPDATE/DELETE grant on the association: links are append-only.
-- Existing quotation -> invoice and invoice payment RPCs remain authoritative.
commit;
