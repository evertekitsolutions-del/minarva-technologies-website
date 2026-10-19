-- Append-only operator-entered AMC renewal follow-up history.
-- Records are self-reported manual actions, NEVER provider delivery receipts.
-- No customer messages, jobs, invoices or external APIs are created.
begin;

create table public.service_maintenance_followup_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  contract_id uuid not null references public.service_maintenance_contracts(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  event_type text not null check (event_type in (
    'draft_reviewed','manual_attempt_reported','customer_reply_reported'
  )),
  channel text not null check (channel in ('whatsapp','sms','email','phone','other')),
  language text not null check (language in ('en','ml')),
  -- Operator describes where permission was separately established.
  -- This is an attestation, NOT independently validated opt-in evidence.
  consent_reference text,
  summary text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint followup_consent_reference_shape check (
    consent_reference is null or char_length(btrim(consent_reference)) between 10 and 400
  ),
  constraint followup_summary_shape check (
    summary is null or char_length(btrim(summary)) between 3 and 500
  ),
  constraint followup_contact_attestation_required check (
    event_type='customer_reply_reported' or consent_reference is not null
  )
);
create index service_maintenance_followup_history_idx
  on public.service_maintenance_followup_events(contract_id,recorded_at desc,id desc);
create index service_maintenance_followup_customer_idx
  on public.service_maintenance_followup_events(customer_id,recorded_at desc);

alter table public.service_maintenance_followup_events enable row level security;
revoke all on public.service_maintenance_followup_events from public,anon,authenticated;
grant select,insert on public.service_maintenance_followup_events to authenticated;

create policy maintenance_followup_admin_read
  on public.service_maintenance_followup_events for select to authenticated
  using ((select private.is_active_admin()));

create policy maintenance_followup_admin_insert
  on public.service_maintenance_followup_events for insert to authenticated
  with check ((select private.is_active_admin()) and recorded_by = (select auth.uid()));

-- Fail closed on customer mismatches, missing actor, or forbidden phone activity.
-- No SECURITY DEFINER and no exposed admin RPC.
create or replace function private.maintenance_prepare_followup_event()
returns trigger language plpgsql security invoker set search_path='' as $body$
declare
  v_customer_id uuid;
  v_do_not_call boolean;
begin
  if auth.uid() is null or not private.is_active_admin() then
    raise exception 'Active administrator required' using errcode='42501';
  end if;

  select customer_id into v_customer_id
  from public.service_maintenance_contracts
  where id=new.contract_id;
  if not found or new.customer_id is distinct from v_customer_id then
    raise exception 'Follow-up customer does not match the service contract'
      using errcode='23514';
  end if;

  select do_not_call into v_do_not_call
  from public.customers
  where id=v_customer_id;

  if new.channel='phone' and v_do_not_call=true
     and new.event_type in ('draft_reviewed','manual_attempt_reported') then
    raise exception 'Phone follow-up blocked: customer marked do not call'
      using errcode='42501';
  end if;

  new.consent_reference:=nullif(btrim(new.consent_reference),'');
  new.summary:=nullif(btrim(new.summary),'');
  if new.event_type<>'customer_reply_reported'
     and (new.consent_reference is null
       or char_length(new.consent_reference) not between 10 and 400) then
    raise exception 'Document where customer permission was obtained'
      using errcode='23514';
  end if;
  new.recorded_by:=auth.uid();
  new.recorded_at:=now();
  return new;
end;
$body$;

revoke all on function private.maintenance_prepare_followup_event()
  from public,anon,authenticated;
create trigger maintenance_prepare_followup_event
  before insert on public.service_maintenance_followup_events
  for each row execute function private.maintenance_prepare_followup_event();

-- No update/delete policy or grant. Corrections require a new audited entry.
-- No pg_cron, notification outbox, Meta or telephony integration.
commit;
