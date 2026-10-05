-- Minarva Technologies own-business system
-- Billing Foundation — Milestone 1
-- Secure customer/catalogue/quotation foundation with voice-customer-care readiness.

create schema if not exists private;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.active = true
  );
$$;

revoke all on function private.is_active_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create table if not exists public.business_billing_settings (
  singleton boolean primary key default true check (singleton = true),
  business_name text not null default 'Minarva Technologies',
  legal_name text,
  gstin text,
  pan text,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  district text,
  state text,
  state_code text,
  pincode text,
  country text not null default 'India',
  default_currency text not null default 'INR',
  default_tax_mode text not null default 'none'
    check (default_tax_mode in ('none','exclusive','inclusive')),
  quotation_prefix text not null default 'QT',
  invoice_prefix text not null default 'INV',
  financial_year_start_month smallint not null default 4
    check (financial_year_start_month between 1 and 12),
  default_quotation_valid_days smallint not null default 15
    check (default_quotation_valid_days between 1 and 365),
  default_terms text,
  bank_details jsonb not null default '{}'::jsonb,
  upi_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  phone text,
  phone_normalized text,
  email text,
  gstin text,
  billing_address_line1 text,
  billing_address_line2 text,
  city text,
  district text,
  state text,
  state_code text,
  pincode text,
  country text not null default 'India',
  site_address text,
  source_enquiry_id bigint references public.enquiries(id) on delete set null,
  preferred_language text not null default 'ml',
  preferred_contact_channel text not null default 'whatsapp'
    check (preferred_contact_channel in ('call','whatsapp','email','sms','none')),
  call_consent boolean not null default false,
  call_consent_at timestamptz,
  call_consent_source text,
  do_not_call boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or char_length(email) <= 320),
  check (
    call_consent = false
    or call_consent_at is not null
  )
);

create table if not exists public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('product','service')),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  description text,
  sku text unique,
  hsn_sac text,
  unit text not null default 'Nos',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  enquiry_id bigint references public.enquiries(id) on delete set null,
  quotation_date date not null default current_date,
  valid_until date,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','rejected','expired','converted','cancelled')),
  currency text not null default 'INR',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  taxable_amount numeric(14,2) not null default 0 check (taxable_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  notes text,
  terms text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= quotation_date),
  check (discount_amount <= subtotal)
);

create table if not exists public.quotation_items (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  catalogue_item_id uuid references public.catalogue_items(id) on delete set null,
  line_no integer not null check (line_no > 0),
  item_type text not null check (item_type in ('product','service')),
  description text not null check (char_length(btrim(description)) between 1 and 1000),
  hsn_sac text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'Nos',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(14,2) not null default 0 check (line_subtotal >= 0),
  taxable_amount numeric(14,2) not null default 0 check (taxable_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id, line_no),
  check (discount_amount <= line_subtotal)
);

create index if not exists customers_phone_normalized_idx
  on public.customers (phone_normalized)
  where phone_normalized is not null;

create index if not exists customers_email_lower_idx
  on public.customers (lower(email))
  where email is not null;

create index if not exists customers_source_enquiry_idx
  on public.customers (source_enquiry_id)
  where source_enquiry_id is not null;

create index if not exists catalogue_items_type_active_name_idx
  on public.catalogue_items (item_type, active, name);

create index if not exists quotations_customer_date_idx
  on public.quotations (customer_id, quotation_date desc);

create index if not exists quotations_status_date_idx
  on public.quotations (status, quotation_date desc);

create index if not exists quotations_enquiry_idx
  on public.quotations (enquiry_id)
  where enquiry_id is not null;

create index if not exists quotation_items_quotation_idx
  on public.quotation_items (quotation_id, line_no);

create or replace function private.set_customer_phone_normalized()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.phone_normalized := case
    when new.phone is null then null
    else private.normalize_phone_text(new.phone)
  end;
  return new;
end;
$$;

revoke all on function private.set_customer_phone_normalized() from public, anon, authenticated;

drop trigger if exists customers_phone_normalized_trigger on public.customers;
create trigger customers_phone_normalized_trigger
before insert or update of phone on public.customers
for each row
execute function private.set_customer_phone_normalized();

drop trigger if exists business_billing_settings_updated_at on public.business_billing_settings;
create trigger business_billing_settings_updated_at
before update on public.business_billing_settings
for each row execute function private.set_updated_at();

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at
before update on public.customers
for each row execute function private.set_updated_at();

drop trigger if exists catalogue_items_updated_at on public.catalogue_items;
create trigger catalogue_items_updated_at
before update on public.catalogue_items
for each row execute function private.set_updated_at();

drop trigger if exists quotations_updated_at on public.quotations;
create trigger quotations_updated_at
before update on public.quotations
for each row execute function private.set_updated_at();

drop trigger if exists quotation_items_updated_at on public.quotation_items;
create trigger quotation_items_updated_at
before update on public.quotation_items
for each row execute function private.set_updated_at();

alter table public.business_billing_settings enable row level security;
alter table public.customers enable row level security;
alter table public.catalogue_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

revoke all on public.business_billing_settings from anon;
revoke all on public.customers from anon;
revoke all on public.catalogue_items from anon;
revoke all on public.quotations from anon;
revoke all on public.quotation_items from anon;

grant select, insert, update, delete on public.business_billing_settings to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.catalogue_items to authenticated;
grant select, insert, update, delete on public.quotations to authenticated;
grant select, insert, update, delete on public.quotation_items to authenticated;
grant usage, select on sequence public.quotation_items_id_seq to authenticated;

drop policy if exists "active_admin_manage_business_billing_settings" on public.business_billing_settings;
create policy "active_admin_manage_business_billing_settings"
  on public.business_billing_settings
  for all
  to authenticated
  using (private.is_active_admin())
  with check (private.is_active_admin());

drop policy if exists "active_admin_manage_customers" on public.customers;
create policy "active_admin_manage_customers"
  on public.customers
  for all
  to authenticated
  using (private.is_active_admin())
  with check (private.is_active_admin());

drop policy if exists "active_admin_manage_catalogue_items" on public.catalogue_items;
create policy "active_admin_manage_catalogue_items"
  on public.catalogue_items
  for all
  to authenticated
  using (private.is_active_admin())
  with check (private.is_active_admin());

drop policy if exists "active_admin_manage_quotations" on public.quotations;
create policy "active_admin_manage_quotations"
  on public.quotations
  for all
  to authenticated
  using (private.is_active_admin())
  with check (private.is_active_admin());

drop policy if exists "active_admin_manage_quotation_items" on public.quotation_items;
create policy "active_admin_manage_quotation_items"
  on public.quotation_items
  for all
  to authenticated
  using (private.is_active_admin())
  with check (private.is_active_admin());
