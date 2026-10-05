-- Billing Foundation — Milestone 2D2
-- Audit-safe invoice payment ledger, invoice cancellation and collection-reminder foundation.

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','upi','bank_transfer','card','cheque','other')),
  reference text,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references auth.users(id) on delete set null,
  check (
    (voided_at is null and void_reason is null and voided_by is null)
    or
    (voided_at is not null and nullif(btrim(void_reason),'') is not null and voided_by is not null)
  )
);

create index if not exists invoice_payments_invoice_date_idx
  on public.invoice_payments (invoice_id, payment_date desc, created_at desc);

create index if not exists invoice_payments_customer_date_idx
  on public.invoice_payments (customer_id, payment_date desc, created_at desc);

create index if not exists invoice_payments_active_invoice_idx
  on public.invoice_payments (invoice_id)
  where voided_at is null;

alter table public.invoice_payments enable row level security;

revoke all on public.invoice_payments from anon;
grant select, insert, update on public.invoice_payments to authenticated;
revoke delete on public.invoice_payments from authenticated;

drop policy if exists "active_admin_manage_invoice_payments" on public.invoice_payments;
create policy "active_admin_manage_invoice_payments"
  on public.invoice_payments
  for all
  to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

create or replace function private.invoice_payments_audit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payment records are audit history and cannot be deleted';
  end if;

  if old.voided_at is not null then
    raise exception 'A voided payment cannot be modified';
  end if;

  if new.voided_at is null then
    raise exception 'Payment records are immutable; use the void-payment workflow for corrections';
  end if;

  if new.invoice_id is distinct from old.invoice_id
     or new.customer_id is distinct from old.customer_id
     or new.payment_date is distinct from old.payment_date
     or new.amount is distinct from old.amount
     or new.method is distinct from old.method
     or new.reference is distinct from old.reference
     or new.notes is distinct from old.notes
     or new.recorded_by is distinct from old.recorded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Payment financial/history fields cannot be changed';
  end if;

  if nullif(btrim(coalesce(new.void_reason,'')),'') is null then
    raise exception 'Void reason is required';
  end if;

  if new.voided_by is distinct from auth.uid() then
    raise exception 'Void actor must be the current authenticated admin';
  end if;

  return new;
end;
$$;

drop trigger if exists invoice_payments_audit_guard on public.invoice_payments;
create trigger invoice_payments_audit_guard
before update or delete on public.invoice_payments
for each row execute function private.invoice_payments_audit_guard();

create or replace function private.invoice_financial_mutation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_context text := current_setting('app.invoice_rpc_context', true);
begin
  if new.amount_paid is distinct from old.amount_paid
     or new.status is distinct from old.status then
    if v_context not in ('payment','void_payment','cancel_invoice') then
      raise exception 'Invoice payment/status fields must be changed through the approved invoice RPC workflow';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_financial_mutation_guard on public.invoices;
create trigger invoice_financial_mutation_guard
before update on public.invoices
for each row execute function private.invoice_financial_mutation_guard();

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_method text := lower(btrim(coalesce(p_method,'')));
  v_amount numeric(14,2) := round(coalesce(p_amount,0),2);
  v_active_total numeric(14,2);
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to record invoice payments' using errcode='42501';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'Payments can only be recorded against an issued invoice';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  if v_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if v_method not in ('cash','upi','bank_transfer','card','cheque','other') then
    raise exception 'Invalid payment method';
  end if;

  select coalesce(sum(ip.amount),0)::numeric(14,2)
  into v_active_total
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id
    and ip.voided_at is null;

  if v_active_total + v_amount > v_invoice.total_amount then
    raise exception 'Payment would exceed the invoice balance';
  end if;

  insert into public.invoice_payments(
    invoice_id,
    customer_id,
    payment_date,
    amount,
    method,
    reference,
    notes,
    recorded_by
  )
  values(
    v_invoice.id,
    v_invoice.customer_id,
    p_payment_date,
    v_amount,
    v_method,
    nullif(btrim(coalesce(p_reference,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),
    auth.uid()
  )
  returning id into v_payment_id;

  v_active_total := v_active_total + v_amount;

  perform set_config('app.invoice_rpc_context','payment',true);

  update public.invoices
  set
    amount_paid = v_active_total,
    updated_at = now()
  where id = v_invoice.id;

  return jsonb_build_object(
    'payment_id',v_payment_id,
    'invoice_id',v_invoice.id,
    'invoice_number',v_invoice.invoice_number,
    'amount_paid',v_active_total,
    'balance_due',greatest(v_invoice.total_amount-v_active_total,0),
    'payment_status',case
      when v_active_total <= 0 then 'unpaid'
      when v_active_total >= v_invoice.total_amount then 'paid'
      else 'partially_paid'
    end
  );
end;
$$;

revoke all on function public.record_invoice_payment(uuid,date,numeric,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_invoice_payment(uuid,date,numeric,text,text,text)
  to authenticated;

create or replace function public.void_invoice_payment(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.invoice_payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_active_total numeric(14,2);
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to void invoice payments' using errcode='42501';
  end if;

  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Void reason is required';
  end if;

  select *
  into v_payment
  from public.invoice_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'Payment is already voided';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = v_payment.invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  update public.invoice_payments
  set
    voided_at = now(),
    void_reason = btrim(p_reason),
    voided_by = auth.uid()
  where id = v_payment.id;

  select coalesce(sum(ip.amount),0)::numeric(14,2)
  into v_active_total
  from public.invoice_payments ip
  where ip.invoice_id = v_invoice.id
    and ip.voided_at is null;

  perform set_config('app.invoice_rpc_context','void_payment',true);

  update public.invoices
  set
    amount_paid = v_active_total,
    updated_at = now()
  where id = v_invoice.id;

  return jsonb_build_object(
    'payment_id',v_payment.id,
    'invoice_id',v_invoice.id,
    'invoice_number',v_invoice.invoice_number,
    'amount_paid',v_active_total,
    'balance_due',greatest(v_invoice.total_amount-v_active_total,0),
    'payment_status',case
      when v_active_total <= 0 then 'unpaid'
      when v_active_total >= v_invoice.total_amount then 'paid'
      else 'partially_paid'
    end
  );
end;
$$;

revoke all on function public.void_invoice_payment(uuid,text)
  from public, anon, authenticated;
grant execute on function public.void_invoice_payment(uuid,text)
  to authenticated;

create or replace function public.cancel_invoice(
  p_invoice_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_active_payment_count bigint;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to cancel invoices' using errcode='42501';
  end if;

  if v_reason = '' then
    raise exception 'Cancellation reason is required';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status = 'cancelled' then
    raise exception 'Invoice is already cancelled';
  end if;

  select count(*)
  into v_active_payment_count
  from public.invoice_payments ip
  where ip.invoice_id = v_invoice.id
    and ip.voided_at is null;

  if v_active_payment_count > 0 or v_invoice.amount_paid > 0 then
    raise exception 'Invoice has payment history. Void/correct payments before cancellation';
  end if;

  perform set_config('app.invoice_rpc_context','cancel_invoice',true);

  update public.invoices
  set
    status = 'cancelled',
    notes = case
      when nullif(btrim(coalesce(notes,'')),'') is null
        then '[CANCELLED] ' || v_reason
      else notes || E'\n[CANCELLED] ' || v_reason
    end,
    updated_at = now()
  where id = v_invoice.id;

  return jsonb_build_object(
    'id',v_invoice.id,
    'invoice_number',v_invoice.invoice_number,
    'status','cancelled'
  );
end;
$$;

revoke all on function public.cancel_invoice(uuid,text)
  from public, anon, authenticated;
grant execute on function public.cancel_invoice(uuid,text)
  to authenticated;

create or replace view public.invoice_collection_candidates
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.invoice_number,
  i.customer_id,
  c.name as customer_name,
  c.phone,
  c.email,
  c.preferred_language,
  c.preferred_contact_channel,
  c.call_consent,
  c.call_consent_at,
  c.call_consent_source,
  c.do_not_call,
  i.invoice_date,
  i.due_date,
  i.currency,
  i.total_amount,
  i.amount_paid,
  i.balance_due,
  i.payment_status,
  case
    when i.due_date is null then 0
    else greatest(current_date-i.due_date,0)
  end as days_overdue,
  (
    i.status='issued'
    and i.balance_due>0
    and nullif(btrim(coalesce(c.phone,'')),'') is not null
    and c.call_consent=true
    and c.do_not_call=false
  ) as call_eligible
from public.invoices i
join public.customers c on c.id=i.customer_id
where i.status='issued'
  and i.balance_due>0;

revoke all on public.invoice_collection_candidates from anon;
grant select on public.invoice_collection_candidates to authenticated;

create index if not exists invoices_due_balance_idx
  on public.invoices (due_date, customer_id)
  where status='issued';

