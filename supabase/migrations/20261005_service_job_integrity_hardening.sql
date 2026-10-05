-- Operations — Milestone 3A1 integrity hardening.
-- Keep service-job source links and audit fields consistent during edits.

create or replace function private.prepare_service_job_update()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.job_number is distinct from old.job_number then
    raise exception 'Service job number cannot be changed';
  end if;

  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Service job creation audit fields cannot be changed';
  end if;

  if not exists(select 1 from public.customers c where c.id=new.customer_id) then
    raise exception 'Selected customer does not exist';
  end if;

  if new.enquiry_id is not null and not exists(
    select 1 from public.enquiries e
    where e.id=new.enquiry_id
      and (e.customer_id is null or e.customer_id=new.customer_id)
  ) then
    raise exception 'Enquiry does not belong to the selected customer';
  end if;

  if new.invoice_id is not null and not exists(
    select 1 from public.invoices i
    where i.id=new.invoice_id and i.customer_id=new.customer_id
  ) then
    raise exception 'Invoice does not belong to the selected customer';
  end if;

  if new.assigned_technician_id is not null and not exists(
    select 1 from public.technicians t
    where t.id=new.assigned_technician_id and t.active=true
  ) then
    raise exception 'Assigned technician is not active or does not exist';
  end if;

  if new.status='scheduled' and new.scheduled_at is null then
    raise exception 'Scheduled jobs require a visit date/time';
  end if;

  new.updated_at:=now();
  new.updated_by:=auth.uid();

  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at:=now();
  elsif old.status='completed' and new.status is distinct from 'completed' then
    new.completed_at:=null;
  elsif new.status='completed' and old.status='completed' then
    new.completed_at:=old.completed_at;
  else
    new.completed_at:=null;
  end if;

  return new;
end;
$$;
