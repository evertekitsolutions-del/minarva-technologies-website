-- Billing Foundation — Milestone 2C2 security cleanup
-- Keep quotation creation atomic while removing exposed SECURITY DEFINER execution.

alter table private.document_counters enable row level security;

revoke all on table private.document_counters from public, anon;
grant select, insert, update on table private.document_counters to authenticated;

drop policy if exists "active_admin_manage_document_counters" on private.document_counters;
create policy "active_admin_manage_document_counters"
  on private.document_counters
  for all
  to authenticated
  using (private.is_active_admin())
  with check (private.is_active_admin());

alter function public.create_quotation(
  uuid,bigint,date,date,text,text,text,text,text,jsonb
) security invoker;
