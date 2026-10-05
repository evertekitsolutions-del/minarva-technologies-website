-- Billing Foundation — Milestone 2C2
-- Atomic quotation creation, professional numbering, and tax-mode persistence.

alter table public.business_billing_settings
  add column if not exists document_company_code text not null default 'MT';

alter table public.quotations
  add column if not exists tax_mode text not null default 'none'
  check (tax_mode in ('none','exclusive','inclusive'));

create table if not exists private.document_counters (
  document_type text not null,
  financial_year text not null,
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now(),
  primary key (document_type, financial_year)
);

revoke all on table private.document_counters from public, anon, authenticated;

create or replace function public.create_quotation(
  p_customer_id uuid,
  p_enquiry_id bigint default null,
  p_quotation_date date default current_date,
  p_valid_until date default null,
  p_status text default 'draft',
  p_currency text default null,
  p_tax_mode text default null,
  p_notes text default null,
  p_terms text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_quote_no text;
  v_prefix text := 'QT';
  v_company_code text := 'MT';
  v_fy_start_month integer := 4;
  v_default_valid_days integer := 15;
  v_default_currency text := 'INR';
  v_default_tax_mode text := 'none';
  v_default_terms text := null;
  v_quote_date date := coalesce(p_quotation_date, current_date);
  v_valid_until date;
  v_status text := lower(coalesce(p_status, 'draft'));
  v_currency text;
  v_tax_mode text;
  v_start_year integer;
  v_fy_label text;
  v_seq bigint;
  v_item jsonb;
  v_line_no integer := 0;
  v_catalogue_id uuid;
  v_item_type text;
  v_description text;
  v_hsn_sac text;
  v_unit text;
  v_qty numeric;
  v_unit_price numeric;
  v_discount_pct numeric;
  v_tax_rate numeric;
  v_line_subtotal numeric;
  v_line_discount numeric;
  v_after_discount numeric;
  v_taxable numeric;
  v_tax numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_discount_total numeric := 0;
  v_taxable_total numeric := 0;
  v_tax_total numeric := 0;
  v_total numeric := 0;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to create quotations' using errcode = '42501';
  end if;

  if p_customer_id is null or not exists (
    select 1 from public.customers c where c.id = p_customer_id
  ) then
    raise exception 'A valid customer is required';
  end if;

  if p_enquiry_id is not null and not exists (
    select 1 from public.enquiries e where e.id = p_enquiry_id
  ) then
    raise exception 'Source enquiry does not exist';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'Quotation must contain between 1 and 100 line items';
  end if;

  select
    coalesce(nullif(btrim(s.quotation_prefix), ''), 'QT'),
    coalesce(nullif(btrim(s.document_company_code), ''), 'MT'),
    s.financial_year_start_month,
    s.default_quotation_valid_days,
    coalesce(nullif(upper(btrim(s.default_currency)), ''), 'INR'),
    s.default_tax_mode,
    s.default_terms
  into
    v_prefix,
    v_company_code,
    v_fy_start_month,
    v_default_valid_days,
    v_default_currency,
    v_default_tax_mode,
    v_default_terms
  from public.business_billing_settings s
  where s.singleton = true;

  v_prefix := regexp_replace(upper(coalesce(v_prefix, 'QT')), '[^A-Z0-9]+', '', 'g');
  v_company_code := regexp_replace(upper(coalesce(v_company_code, 'MT')), '[^A-Z0-9]+', '', 'g');
  if v_prefix = '' then v_prefix := 'QT'; end if;
  if v_company_code = '' then v_company_code := 'MT'; end if;

  v_currency := upper(coalesce(nullif(btrim(p_currency), ''), v_default_currency, 'INR'));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter code';
  end if;

  v_tax_mode := lower(coalesce(nullif(btrim(p_tax_mode), ''), v_default_tax_mode, 'none'));
  if v_tax_mode not in ('none','exclusive','inclusive') then
    raise exception 'Invalid tax mode';
  end if;

  if v_status not in ('draft','sent') then
    raise exception 'New quotation status must be draft or sent';
  end if;

  v_valid_until := coalesce(p_valid_until, v_quote_date + v_default_valid_days);
  if v_valid_until < v_quote_date then
    raise exception 'Valid-until date cannot be before quotation date';
  end if;

  if extract(month from v_quote_date)::integer >= v_fy_start_month then
    v_start_year := extract(year from v_quote_date)::integer;
  else
    v_start_year := extract(year from v_quote_date)::integer - 1;
  end if;

  v_fy_label := v_start_year::text || '-' || right((v_start_year + 1)::text, 2);

  insert into private.document_counters(document_type, financial_year, next_number, updated_at)
  values ('quotation', v_fy_label, 2, now())
  on conflict (document_type, financial_year)
  do update set
    next_number = private.document_counters.next_number + 1,
    updated_at = now()
  returning next_number - 1 into v_seq;

  v_quote_no := v_prefix || '-' || v_company_code || '-' || v_fy_label || '-' || lpad(v_seq::text, 4, '0');

  insert into public.quotations(
    quotation_number,
    customer_id,
    enquiry_id,
    quotation_date,
    valid_until,
    status,
    currency,
    tax_mode,
    subtotal,
    discount_amount,
    taxable_amount,
    tax_amount,
    total_amount,
    notes,
    terms,
    created_by
  )
  values (
    v_quote_no,
    p_customer_id,
    p_enquiry_id,
    v_quote_date,
    v_valid_until,
    v_status,
    v_currency,
    v_tax_mode,
    0, 0, 0, 0, 0,
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_terms, v_default_terms),
    auth.uid()
  )
  returning id into v_quote_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;
    v_catalogue_id := nullif(v_item->>'catalogue_item_id', '')::uuid;
    v_item_type := lower(coalesce(nullif(btrim(v_item->>'item_type'), ''), 'service'));
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_hsn_sac := nullif(btrim(coalesce(v_item->>'hsn_sac', '')), '');
    v_unit := coalesce(nullif(btrim(v_item->>'unit'), ''), 'Nos');
    v_qty := coalesce(nullif(v_item->>'quantity', '')::numeric, 1);
    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);
    v_discount_pct := coalesce(nullif(v_item->>'discount_percent', '')::numeric, 0);
    v_tax_rate := coalesce(nullif(v_item->>'tax_rate', '')::numeric, 0);

    if v_item_type not in ('product','service') then
      raise exception 'Invalid item type on line %', v_line_no;
    end if;

    if char_length(v_description) < 1 or char_length(v_description) > 1000 then
      raise exception 'Description is required on line %', v_line_no;
    end if;

    if v_catalogue_id is not null and not exists (
      select 1 from public.catalogue_items ci
      where ci.id = v_catalogue_id
    ) then
      raise exception 'Catalogue item not found on line %', v_line_no;
    end if;

    if v_qty <= 0 then
      raise exception 'Quantity must be greater than zero on line %', v_line_no;
    end if;

    if v_unit_price < 0 then
      raise exception 'Unit price cannot be negative on line %', v_line_no;
    end if;

    if v_discount_pct < 0 or v_discount_pct > 100 then
      raise exception 'Discount must be between 0 and 100 on line %', v_line_no;
    end if;

    if v_tax_rate < 0 or v_tax_rate > 100 then
      raise exception 'Tax rate must be between 0 and 100 on line %', v_line_no;
    end if;

    if v_tax_mode = 'none' then
      v_tax_rate := 0;
    end if;

    v_line_subtotal := round(v_qty * v_unit_price, 2);
    v_line_discount := round(v_line_subtotal * v_discount_pct / 100, 2);
    v_after_discount := greatest(v_line_subtotal - v_line_discount, 0);

    if v_tax_mode = 'inclusive' and v_tax_rate > 0 then
      v_line_total := round(v_after_discount, 2);
      v_taxable := round(v_after_discount / (1 + (v_tax_rate / 100)), 2);
      v_tax := round(v_line_total - v_taxable, 2);
    elsif v_tax_mode = 'exclusive' and v_tax_rate > 0 then
      v_taxable := round(v_after_discount, 2);
      v_tax := round(v_taxable * v_tax_rate / 100, 2);
      v_line_total := round(v_taxable + v_tax, 2);
    else
      v_taxable := round(v_after_discount, 2);
      v_tax := 0;
      v_line_total := round(v_after_discount, 2);
    end if;

    insert into public.quotation_items(
      quotation_id,
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
    values (
      v_quote_id,
      v_catalogue_id,
      v_line_no,
      v_item_type,
      v_description,
      v_hsn_sac,
      v_qty,
      v_unit,
      round(v_unit_price, 2),
      round(v_discount_pct, 2),
      v_line_discount,
      round(v_tax_rate, 2),
      v_line_subtotal,
      v_taxable,
      v_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount_total := v_discount_total + v_line_discount;
    v_taxable_total := v_taxable_total + v_taxable;
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_line_total;
  end loop;

  update public.quotations
  set
    subtotal = round(v_subtotal, 2),
    discount_amount = round(v_discount_total, 2),
    taxable_amount = round(v_taxable_total, 2),
    tax_amount = round(v_tax_total, 2),
    total_amount = round(v_total, 2),
    updated_at = now()
  where id = v_quote_id;

  return jsonb_build_object(
    'id', v_quote_id,
    'quotation_number', v_quote_no,
    'quotation_date', v_quote_date,
    'valid_until', v_valid_until,
    'status', v_status,
    'currency', v_currency,
    'tax_mode', v_tax_mode,
    'subtotal', round(v_subtotal, 2),
    'discount_amount', round(v_discount_total, 2),
    'taxable_amount', round(v_taxable_total, 2),
    'tax_amount', round(v_tax_total, 2),
    'total_amount', round(v_total, 2)
  );
end;
$$;

revoke all on function public.create_quotation(uuid,bigint,date,date,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_quotation(uuid,bigint,date,date,text,text,text,text,text,jsonb)
  to authenticated;
