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

commit;
