-- Billing Foundation — Milestone 2D1
-- Invoice foundation and atomic quotation -> invoice conversion.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  source_quotation_id uuid not null unique references public.quotations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  enquiry_id bigint references public.enquiries(id) on delete set null,
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'issued'
    check (status in ('issued','cancelled')),
  currency text not null default 'INR',
  tax_mode text not null default 'none'
    check (tax_mode in ('none','exclusive','inclusive')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  taxable_amount numeric(14,2) not null default 0 check (taxable_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14,2) generated always as (
    greatest(total_amount - amount_paid, 0::numeric)
  ) stored,
  payment_status text generated always as (
    case
      when total_amount <= 0 then 'paid'
      when amount_paid <= 0 then 'unpaid'
      when amount_paid >= total_amount then 'paid'
      else 'partially_paid'
    end
  ) stored,
  notes text,
  terms text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= invoice_date),
  check (amount_paid <= total_amount)
);

create table if not exists public.invoice_items (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  source_quotation_item_id bigint references public.quotation_items(id) on delete set null,
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
  unique (invoice_id, line_no),
  check (discount_amount <= line_subtotal)
);

create index if not exists invoices_customer_date_idx
  on public.invoices (customer_id, invoice_date desc);

create index if not exists invoices_payment_status_date_idx
  on public.invoices (payment_status, invoice_date desc);

create index if not exists invoices_status_date_idx
  on public.invoices (status, invoice_date desc);

create index if not exists invoices_enquiry_idx
  on public.invoices (enquiry_id)
  where enquiry_id is not null;

create index if not exists invoices_created_by_idx
  on public.invoices (created_by)
  where created_by is not null;

create index if not exists invoice_items_invoice_idx
  on public.invoice_items (invoice_id, line_no);

create index if not exists invoice_items_catalogue_item_idx
  on public.invoice_items (catalogue_item_id)
  where catalogue_item_id is not null;

create index if not exists invoice_items_source_quotation_item_idx
  on public.invoice_items (source_quotation_item_id)
  where source_quotation_item_id is not null;

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at
before update on public.invoices
for each row execute function private.set_updated_at();

drop trigger if exists invoice_items_updated_at on public.invoice_items;
create trigger invoice_items_updated_at
before update on public.invoice_items
for each row execute function private.set_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoices from anon;
revoke all on public.invoice_items from anon;

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant usage, select on sequence public.invoice_items_id_seq to authenticated;

drop policy if exists "active_admin_manage_invoices" on public.invoices;
create policy "active_admin_manage_invoices"
  on public.invoices
  for all
  to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_invoice_items" on public.invoice_items;
create policy "active_admin_manage_invoice_items"
  on public.invoice_items
  for all
  to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

create or replace view public.customer_outstanding_summary
with (security_invoker = true)
as
select
  i.customer_id,
  count(*) filter (where i.status = 'issued') as invoice_count,
  coalesce(sum(i.total_amount) filter (where i.status = 'issued'), 0)::numeric(14,2) as invoiced_total,
  coalesce(sum(i.amount_paid) filter (where i.status = 'issued'), 0)::numeric(14,2) as amount_paid,
  coalesce(sum(i.balance_due) filter (where i.status = 'issued'), 0)::numeric(14,2) as balance_due
from public.invoices i
group by i.customer_id;

revoke all on public.customer_outstanding_summary from anon;
grant select on public.customer_outstanding_summary to authenticated;

create or replace function public.convert_quotation_to_invoice(
  p_quotation_id uuid,
  p_invoice_date date default current_date,
  p_due_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotations%rowtype;
  v_invoice_id uuid;
  v_invoice_no text;
  v_prefix text := 'INV';
  v_company_code text := 'MT';
  v_fy_start_month integer := 4;
  v_invoice_date date := coalesce(p_invoice_date, current_date);
  v_due_date date := p_due_date;
  v_start_year integer;
  v_fy_label text;
  v_seq bigint;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to convert quotations' using errcode = '42501';
  end if;

  select q.*
  into v_quote
  from public.quotations q
  where q.id = p_quotation_id
  for update;

  if not found then
    raise exception 'Quotation not found';
  end if;

  if v_quote.status not in ('sent','accepted') then
    raise exception 'Only Sent or Accepted quotations can be converted to an invoice';
  end if;

  if exists (
    select 1
    from public.invoices i
    where i.source_quotation_id = p_quotation_id
  ) then
    raise exception 'This quotation has already been converted to an invoice';
  end if;

  if not exists (
    select 1
    from public.quotation_items qi
    where qi.quotation_id = p_quotation_id
  ) then
    raise exception 'Quotation has no line items';
  end if;

  if v_due_date is not null and v_due_date < v_invoice_date then
    raise exception 'Due date cannot be before invoice date';
  end if;

  select
    coalesce(nullif(btrim(s.invoice_prefix), ''), 'INV'),
    coalesce(nullif(btrim(s.document_company_code), ''), 'MT'),
    s.financial_year_start_month
  into
    v_prefix,
    v_company_code,
    v_fy_start_month
  from public.business_billing_settings s
  where s.singleton = true;

  v_prefix := regexp_replace(upper(coalesce(v_prefix, 'INV')), '[^A-Z0-9]+', '', 'g');
  v_company_code := regexp_replace(upper(coalesce(v_company_code, 'MT')), '[^A-Z0-9]+', '', 'g');
  if v_prefix = '' then v_prefix := 'INV'; end if;
  if v_company_code = '' then v_company_code := 'MT'; end if;

  if extract(month from v_invoice_date)::integer >= v_fy_start_month then
    v_start_year := extract(year from v_invoice_date)::integer;
  else
    v_start_year := extract(year from v_invoice_date)::integer - 1;
  end if;

  v_fy_label := v_start_year::text || '-' || right((v_start_year + 1)::text, 2);

  insert into private.document_counters(document_type, financial_year, next_number, updated_at)
  values ('invoice', v_fy_label, 2, now())
  on conflict (document_type, financial_year)
  do update set
    next_number = private.document_counters.next_number + 1,
    updated_at = now()
  returning next_number - 1 into v_seq;

  v_invoice_no :=
    v_prefix || '-' || v_company_code || '-' || v_fy_label || '-' || lpad(v_seq::text, 4, '0');

  insert into public.invoices(
    invoice_number,
    source_quotation_id,
    customer_id,
    enquiry_id,
    invoice_date,
    due_date,
    status,
    currency,
    tax_mode,
    subtotal,
    discount_amount,
    taxable_amount,
    tax_amount,
    total_amount,
    amount_paid,
    notes,
    terms,
    created_by
  )
  values (
    v_invoice_no,
    v_quote.id,
    v_quote.customer_id,
    v_quote.enquiry_id,
    v_invoice_date,
    v_due_date,
    'issued',
    v_quote.currency,
    v_quote.tax_mode,
    v_quote.subtotal,
    v_quote.discount_amount,
    v_quote.taxable_amount,
    v_quote.tax_amount,
    v_quote.total_amount,
    0,
    v_quote.notes,
    v_quote.terms,
    auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.invoice_items(
    invoice_id,
    source_quotation_item_id,
    catalogue_item_id,
    line_no,
    item_type,
    description,
    hsn_sac,
    quantity,
    unit,
    unit_price,
    discount_percent,
    discount_amount,
    tax_rate,
    line_subtotal,
    taxable_amount,
    tax_amount,
    line_total
  )
  select
    v_invoice_id,
    qi.id,
    qi.catalogue_item_id,
    qi.line_no,
    qi.item_type,
    qi.description,
    qi.hsn_sac,
    qi.quantity,
    qi.unit,
    qi.unit_price,
    qi.discount_percent,
    qi.discount_amount,
    qi.tax_rate,
    qi.line_subtotal,
    qi.taxable_amount,
    qi.tax_amount,
    qi.line_total
  from public.quotation_items qi
  where qi.quotation_id = p_quotation_id
  order by qi.line_no;

  update public.quotations
  set
    status = 'converted',
    updated_at = now()
  where id = p_quotation_id;

  return jsonb_build_object(
    'id', v_invoice_id,
    'invoice_number', v_invoice_no,
    'source_quotation_id', p_quotation_id,
    'customer_id', v_quote.customer_id,
    'invoice_date', v_invoice_date,
    'due_date', v_due_date,
    'status', 'issued',
    'payment_status', case when v_quote.total_amount <= 0 then 'paid' else 'unpaid' end,
    'total_amount', v_quote.total_amount,
    'amount_paid', 0,
    'balance_due', v_quote.total_amount
  );
end;
$$;

revoke all on function public.convert_quotation_to_invoice(uuid,date,date)
  from public, anon, authenticated;
grant execute on function public.convert_quotation_to_invoice(uuid,date,date)
  to authenticated;
