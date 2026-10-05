-- Billing Foundation — Milestone 2D2 performance cleanup.
-- Cover invoice-payment audit actor foreign keys flagged by the database advisor.

create index if not exists invoice_payments_recorded_by_idx
  on public.invoice_payments (recorded_by)
  where recorded_by is not null;

create index if not exists invoice_payments_voided_by_idx
  on public.invoice_payments (voided_by)
  where voided_by is not null;
