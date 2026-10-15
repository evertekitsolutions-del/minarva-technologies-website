-- Phase 1: consent-gated customer service update lifecycle.
-- Existing sender remains mock-only; no real WhatsApp messages are sent.
begin;

alter table public.service_jobs
  add column if not exists customer_updates_opt_in boolean not null default false,
  add column if not exists customer_updates_opt_in_at timestamptz,
  add column if not exists customer_updates_opt_in_source text,
  add column if not exists customer_updates_opt_out_at timestamptz;

create or replace function private.service_capture_customer_update_consent()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.customer_updates_opt_in is distinct from old.customer_updates_opt_in then
    if new.customer_updates_opt_in then
      new.customer_updates_opt_in_at:=now();
      new.customer_updates_opt_in_source:='admin_confirmed_customer_permission';
    else
      new.customer_updates_opt_in_at:=null;
      new.customer_updates_opt_out_at:=now();
    end if;
  else
    new.customer_updates_opt_in_at:=old.customer_updates_opt_in_at;
    new.customer_updates_opt_in_source:=old.customer_updates_opt_in_source;
    new.customer_updates_opt_out_at:=old.customer_updates_opt_out_at;
  end if;
  return new;
end;
$$;
revoke all on function private.service_capture_customer_update_consent() from public,anon,authenticated;
drop trigger if exists service_capture_customer_update_consent on public.service_jobs;
create trigger service_capture_customer_update_consent
before update of customer_updates_opt_in,customer_updates_opt_in_at,customer_updates_opt_in_source,customer_updates_opt_out_at
on public.service_jobs
for each row execute function private.service_capture_customer_update_consent();

commit;
