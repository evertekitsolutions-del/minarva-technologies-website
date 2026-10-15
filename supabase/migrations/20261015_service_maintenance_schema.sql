-- Field Service Maintenance: secure AMC/warranty contracts and planned visits.
begin;
create table if not exists public.service_maintenance_contracts (
 id uuid primary key default gen_random_uuid(),
 contract_number text not null unique default ('MNT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 customer_id uuid not null references public.customers(id) on delete restrict,
 contract_type text not null check(contract_type in ('amc','warranty','combined')),
 service_category text not null check(char_length(btrim(service_category)) between 2 and 200),
 equipment_details text not null check(char_length(btrim(equipment_details)) between 2 and 2000),
 equipment_serial text,
 site_address text,
 assigned_technician_id uuid references public.technicians(id) on delete set null,
 starts_on date not null,
 ends_on date not null,
 warranty_starts_on date,
 warranty_ends_on date,
 maintenance_interval_months integer,
 first_visit_on date,
 active boolean not null default false,
 activated_at timestamptz,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 constraint maintenance_coverage_dates check (
   ends_on>=starts_on and ends_on<=(starts_on+interval '10 years')::date),
 constraint maintenance_warranty_dates check (
  (warranty_starts_on is null and warranty_ends_on is null) or
  (warranty_starts_on is not null and warranty_ends_on>=warranty_starts_on)),
 constraint maintenance_warranty_fields check (
  contract_type not in ('warranty','combined') or warranty_starts_on is not null),
 constraint maintenance_recurring_fields check (
  (contract_type='warranty' and maintenance_interval_months is null and first_visit_on is null)
  or (contract_type in ('amc','combined') and
    maintenance_interval_months in (1,2,3,4,6,12) and
    first_visit_on between starts_on and ends_on))
);
create index if not exists service_maintenance_contracts_customer_idx
 on public.service_maintenance_contracts(customer_id,created_at desc);
create table if not exists public.service_maintenance_visits (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.service_maintenance_contracts(id) on delete restrict,
 due_on date not null,
 service_job_id uuid unique references public.service_jobs(id) on delete set null,
 skipped_at timestamptz,
 skip_reason text,
 generated_at timestamptz not null default now(),
 constraint maintenance_visit_unique_due unique(contract_id,due_on),
 constraint maintenance_visit_no_skipped_job check (service_job_id is null or skipped_at is null),
 constraint maintenance_visit_skip_reason check (
  (skipped_at is null and skip_reason is null) or
  (skipped_at is not null and char_length(btrim(skip_reason)) between 5 and 500))
);
create index if not exists service_maintenance_visits_due_idx
 on public.service_maintenance_visits(due_on,generated_at);
alter table public.service_maintenance_contracts enable row level security;
alter table public.service_maintenance_visits enable row level security;
revoke all on public.service_maintenance_contracts from public,anon,authenticated;
revoke all on public.service_maintenance_visits from public,anon,authenticated;
grant select,insert,update on public.service_maintenance_contracts to authenticated;
grant select on public.service_maintenance_visits to authenticated;
create policy maintenance_contract_admin_select on public.service_maintenance_contracts
 for select to authenticated using ((select private.is_active_admin()));
create policy maintenance_contract_admin_insert on public.service_maintenance_contracts
 for insert to authenticated with check ((select private.is_active_admin()));
create policy maintenance_contract_admin_update on public.service_maintenance_contracts
 for update to authenticated
 using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy maintenance_visit_admin_read on public.service_maintenance_visits
 for select to authenticated using ((select private.is_active_admin()));
commit;
