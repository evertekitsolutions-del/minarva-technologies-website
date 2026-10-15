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

-- Pre-designed Malayalam and English messages; these are NOT Meta-approved.
insert into public.notification_template_variants
(template_key,channel,language,subject_template,body_template,variables) values
('service_registered','whatsapp','en','Registered: {{job_number}}',
 'Hello {{customer_name}}, Minarva Technologies registered your {{service_category}} service request {{job_number}}. We will update you as work progresses.',
 '["customer_name","service_category","job_number"]'::jsonb),
('service_registered','whatsapp','ml','സർവീസ് രജിസ്റ്റർ ചെയ്തു: {{job_number}}',
 'നമസ്കാരം {{customer_name}}, നിങ്ങളുടെ {{service_category}} സർവീസ് {{job_number}} എന്ന നമ്പറിൽ Minarva Technologies രജിസ്റ്റർ ചെയ്തു. തുടർവിവരങ്ങൾ അറിയിക്കും.',
 '["customer_name","service_category","job_number"]'::jsonb),
('service_engineer_assigned','whatsapp','en','Engineer assigned: {{job_number}}',
 'Hello {{customer_name}}, our engineer {{engineer_name}} has been assigned to your service request {{job_number}}.',
 '["customer_name","engineer_name","job_number"]'::jsonb),
('service_engineer_assigned','whatsapp','ml','എൻജിനീയറെ നിയോഗിച്ചു: {{job_number}}',
 'നമസ്കാരം {{customer_name}}, {{job_number}} സർവീസിനായി {{engineer_name}} എന്ന എൻജിനീയറെ നിയോഗിച്ചിട്ടുണ്ട് — Minarva Technologies.',
 '["customer_name","engineer_name","job_number"]'::jsonb),
('service_visit_scheduled','whatsapp','en','Visit scheduled: {{job_number}}',
 'Hello {{customer_name}}, the visit for {{job_number}} has been scheduled for {{scheduled_at}}. — Minarva Technologies',
 '["customer_name","job_number","scheduled_at"]'::jsonb),
('service_visit_scheduled','whatsapp','ml','സർവീസ് സന്ദർശനം: {{job_number}}',
 'നമസ്കാരം {{customer_name}}, {{job_number}} സർവീസ് സന്ദർശനം {{scheduled_at}} സമയത്തേക്ക് നിശ്ചയിച്ചു — Minarva Technologies.',
 '["customer_name","job_number","scheduled_at"]'::jsonb),
('service_visit_rescheduled','whatsapp','en','Visit rescheduled: {{job_number}}',
 'Hello {{customer_name}}, the visit for {{job_number}} has changed to {{scheduled_at}}. Contact Minarva Technologies if the new time is unsuitable.',
 '["customer_name","job_number","scheduled_at"]'::jsonb),
('service_visit_rescheduled','whatsapp','ml','സർവീസ് സമയം മാറ്റി: {{job_number}}',
 'നമസ്കാരം {{customer_name}}, {{job_number}} സർവീസ് സന്ദർശനം {{scheduled_at}} സമയത്തേക്ക് മാറ്റി. ബുദ്ധിമുട്ടുണ്ടെങ്കിൽ Minarva Technologies-നെ അറിയിക്കുക.',
 '["customer_name","job_number","scheduled_at"]'::jsonb)
on conflict(template_key,channel,language) do nothing;

-- Mock provider only. Do not enable an external WhatsApp adapter here.
insert into public.notification_event_routes
(event_type,channel,template_key,enabled,provider_adapter_key,fallback_channels)
select event_type,'whatsapp',template_key,true,
 (select adapter_key from public.customer_care_provider_adapters
   where adapter_key='mock_whatsapp' and runtime_mode='test' and config->>'mock'='true'),
 '[]'::jsonb
from (values
 ('service_registered','service_registered'),
 ('service_engineer_assigned','service_engineer_assigned'),
 ('service_visit_scheduled','service_visit_scheduled'),
 ('service_visit_rescheduled','service_visit_rescheduled')
) as service_routes(event_type,template_key)
on conflict(event_type,channel) do nothing;

-- Enqueue only when the service customer explicitly opted into WhatsApp updates
-- and has not since opted out. Never bypass Customer Care consent controls.
create or replace function private.queue_service_lifecycle_whatsapp(
  p_job_id uuid,p_event_type text
)
returns void language plpgsql security definer set search_path='' as $
declare
  v_job public.service_jobs%rowtype;
  v_customer public.customers%rowtype;
begin
  select * into v_job from public.service_jobs where id=p_job_id;
  if not found or v_job.customer_updates_opt_in is distinct from true
    or v_job.customer_updates_opt_in_at is null then return; end if;
  select * into v_customer from public.customers where id=v_job.customer_id;
  if not found or nullif(btrim(coalesce(v_customer.phone,'')),'') is null then return; end if;
  if exists(select 1 from public.customer_contact_preferences p
    where p.customer_id=v_job.customer_id and p.channel='whatsapp'
      and p.opted_out=true) then return; end if;
  insert into public.customer_contact_outbox(
    customer_id,source_type,source_id,source_event_key,event_type,
    requested_channel,language,recipient,payload,status)
  values(
    v_job.customer_id,'service_job',v_job.id::text,
    'service-lifecycle:'||v_job.id::text||':'||p_event_type||':'||gen_random_uuid()::text,
    p_event_type,'whatsapp',
    case when v_customer.preferred_language='en' then 'en' else 'ml' end,
    btrim(v_customer.phone),
    jsonb_build_object(
      'job_number',v_job.job_number,'service_category',v_job.service_category,
      'engineer_name',coalesce((select name from public.technicians
        where id=v_job.assigned_technician_id),''),
      'scheduled_at',coalesce(
        to_char(v_job.scheduled_at at time zone 'Asia/Kolkata','DD Mon YYYY HH12:MI AM'),'')
    ),'pending');
end;
$;
revoke all on function private.queue_service_lifecycle_whatsapp(uuid,text) from public,anon,authenticated;

create or replace function private.capture_service_lifecycle_messages()
returns trigger language plpgsql security definer set search_path='' as $
begin
  if old.customer_updates_opt_in=true and new.customer_updates_opt_in=false then
    update public.customer_contact_outbox
    set status='suppressed',suppression_reason='Customer withdrew service WhatsApp consent'
    where source_type='service_job' and source_id=new.id::text
      and requested_channel='whatsapp' and status in ('pending','ready');
    return new;
  end if;
  if new.customer_updates_opt_in is distinct from true
    or new.status in ('cancelled','completed') then return new; end if;

  if old.customer_updates_opt_in is distinct from true then
    perform private.queue_service_lifecycle_whatsapp(new.id,'service_registered');
    if new.assigned_technician_id is not null then
      perform private.queue_service_lifecycle_whatsapp(new.id,'service_engineer_assigned');
    end if;
    if new.scheduled_at is not null then
      perform private.queue_service_lifecycle_whatsapp(new.id,'service_visit_scheduled');
    end if;
    return new;
  end if;
  if new.assigned_technician_id is distinct from old.assigned_technician_id
    and new.assigned_technician_id is not null then
    perform private.queue_service_lifecycle_whatsapp(new.id,'service_engineer_assigned');
  end if;
  if new.scheduled_at is distinct from old.scheduled_at
    and new.scheduled_at is not null then
    perform private.queue_service_lifecycle_whatsapp(new.id,
      case when old.scheduled_at is null then 'service_visit_scheduled'
           else 'service_visit_rescheduled' end);
  end if;
  return new;
end;
$;
revoke all on function private.capture_service_lifecycle_messages() from public,anon,authenticated;
drop trigger if exists service_lifecycle_customer_messages on public.service_jobs;
create trigger service_lifecycle_customer_messages
after update of customer_updates_opt_in,assigned_technician_id,scheduled_at,status
on public.service_jobs
for each row execute function private.capture_service_lifecycle_messages();

-- Atomic wrapper reuses validated numbering, customer, assignment and billing
-- semantics of the existing create_service_job. No partial registration on error.
create or replace function public.create_service_job_with_updates(
  p_customer_id uuid,p_enquiry_id bigint default null,p_invoice_id uuid default null,
  p_service_category text default null,p_site_address text default null,
  p_equipment_details text default null,p_complaint text default null,
  p_requested_work text default null,p_priority text default 'normal',
  p_assigned_technician_id uuid default null,p_scheduled_at timestamptz default null,
  p_follow_up_at timestamptz default null,p_internal_notes text default null,
  p_customer_notes text default null,p_service_charge_estimate numeric default 0,
  p_parts_estimate numeric default 0,p_customer_updates_opt_in boolean default false
)
returns jsonb language plpgsql security invoker set search_path='' as $
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Only an active admin may register customer service notification permission'
      using errcode='42501';
  end if;
  v_result:=public.create_service_job(
    p_customer_id=>p_customer_id,p_enquiry_id=>p_enquiry_id,
    p_invoice_id=>p_invoice_id,p_service_category=>p_service_category,
    p_site_address=>p_site_address,p_equipment_details=>p_equipment_details,
    p_complaint=>p_complaint,p_requested_work=>p_requested_work,
    p_priority=>p_priority,p_assigned_technician_id=>p_assigned_technician_id,
    p_scheduled_at=>p_scheduled_at,p_follow_up_at=>p_follow_up_at,
    p_internal_notes=>p_internal_notes,p_customer_notes=>p_customer_notes,
    p_service_charge_estimate=>p_service_charge_estimate,p_parts_estimate=>p_parts_estimate
  );
  if p_customer_updates_opt_in then
    update public.service_jobs set customer_updates_opt_in=true
      where id=(v_result->>'id')::uuid;
    if not found then raise exception 'Failed to record service communication permission'; end if;
  end if;
  return v_result||jsonb_build_object('customer_updates_opt_in',p_customer_updates_opt_in);
end;
$;
revoke all on function public.create_service_job_with_updates(
 uuid,bigint,uuid,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,numeric,numeric,boolean
) from public,anon,authenticated;
grant execute on function public.create_service_job_with_updates(
 uuid,bigint,uuid,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,numeric,numeric,boolean
) to authenticated;

commit;
