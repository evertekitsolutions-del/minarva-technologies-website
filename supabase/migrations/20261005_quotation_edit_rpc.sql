-- Billing Foundation — Milestone 2C3
-- Safe atomic editing for Draft quotations. Existing quotation number is preserved.

create or replace function public.update_quotation(
  p_quotation_id uuid,
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
security invoker
set search_path = ''
as $$
declare
  v_existing_status text;
  v_quote_no text;
  v_status text := lower(coalesce(p_status, 'draft'));
  v_currency text := upper(coalesce(nullif(btrim(p_currency), ''), 'INR'));
  v_tax_mode text := lower(coalesce(nullif(btrim(p_tax_mode), ''), 'none'));
  v_quote_date date := coalesce(p_quotation_date, current_date);
  v_valid_until date := p_valid_until;
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
    raise exception 'Not authorized to update quotations' using errcode = '42501';
  end if;

  select q.status, q.quotation_number
  into v_existing_status, v_quote_no
  from public.quotations q
  where q.id = p_quotation_id
  for update;

  if not found then
    raise exception 'Quotation not found';
  end if;

  if v_existing_status <> 'draft' then
    raise exception 'Only Draft quotations can be edited';
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

  if v_status not in ('draft','sent') then
    raise exception 'Edited quotation status must be draft or sent';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter code';
  end if;

  if v_tax_mode not in ('none','exclusive','inclusive') then
    raise exception 'Invalid tax mode';
  end if;

  if v_valid_until is null then
    v_valid_until := v_quote_date;
  end if;

  if v_valid_until < v_quote_date then
    raise exception 'Valid-until date cannot be before quotation date';
  end if;

  delete from public.quotation_items qi
  where qi.quotation_id = p_quotation_id;

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
      select 1 from public.catalogue_items ci where ci.id = v_catalogue_id
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
      p_quotation_id,
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
    customer_id = p_customer_id,
    enquiry_id = p_enquiry_id,
    quotation_date = v_quote_date,
    valid_until = v_valid_until,
    status = v_status,
    currency = v_currency,
    tax_mode = v_tax_mode,
    subtotal = round(v_subtotal, 2),
    discount_amount = round(v_discount_total, 2),
    taxable_amount = round(v_taxable_total, 2),
    tax_amount = round(v_tax_total, 2),
    total_amount = round(v_total, 2),
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    terms = nullif(btrim(coalesce(p_terms, '')), ''),
    updated_at = now()
  where id = p_quotation_id;

  return jsonb_build_object(
    'id', p_quotation_id,
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

revoke all on function public.update_quotation(uuid,uuid,bigint,date,date,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.update_quotation(uuid,uuid,bigint,date,date,text,text,text,text,text,jsonb)
  to authenticated;
