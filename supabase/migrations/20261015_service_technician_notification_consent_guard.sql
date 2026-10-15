-- Default-deny service update messages from the existing technician outbox
-- unless explicit job-level permission is recorded. No live provider enabled.
begin;
create or replace function private.service_technician_notification_consent_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(
    select 1 from public.service_jobs j
    where j.id=new.service_job_id
      and j.customer_updates_opt_in=true
      and j.customer_updates_opt_in_at is not null
  ) then
    new.status:='suppressed';
    new.suppression_reason:='Customer did not opt in to service notifications';
  end if;
  return new;
end;
$$;
revoke all on function private.service_technician_notification_consent_guard()
from public,anon,authenticated;
drop trigger if exists service_technician_notification_consent_guard
on public.service_job_notification_outbox;
create trigger service_technician_notification_consent_guard
before insert on public.service_job_notification_outbox
for each row execute function private.service_technician_notification_consent_guard();
commit;
