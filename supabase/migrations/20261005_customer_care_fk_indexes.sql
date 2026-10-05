-- Customer Care — Milestone 3B1 performance hardening.
-- Cover foreign-key columns reported by the database advisor.

create index if not exists automated_call_jobs_attempt_idx
  on public.automated_call_jobs(attempt_id)
  where attempt_id is not null;

create index if not exists automated_call_jobs_campaign_member_idx
  on public.automated_call_jobs(campaign_member_id)
  where campaign_member_id is not null;

create index if not exists customer_care_campaigns_created_by_idx
  on public.customer_care_campaigns(created_by)
  where created_by is not null;

create index if not exists customer_contact_outbox_provider_adapter_idx
  on public.customer_contact_outbox(provider_adapter_key)
  where provider_adapter_key is not null;

create index if not exists customer_contact_outbox_route_idx
  on public.customer_contact_outbox(route_id)
  where route_id is not null;

create index if not exists customer_contact_outbox_template_variant_idx
  on public.customer_contact_outbox(template_variant_id)
  where template_variant_id is not null;

create index if not exists customer_contact_preferences_updated_by_idx
  on public.customer_contact_preferences(updated_by)
  where updated_by is not null;

create index if not exists customer_contact_timeline_attempt_idx
  on public.customer_contact_timeline(attempt_id)
  where attempt_id is not null;

create index if not exists customer_contact_timeline_campaign_idx
  on public.customer_contact_timeline(campaign_id)
  where campaign_id is not null;

create index if not exists notification_delivery_attempts_provider_adapter_idx
  on public.notification_delivery_attempts(provider_adapter_key)
  where provider_adapter_key is not null;

create index if not exists notification_delivery_attempts_template_variant_idx
  on public.notification_delivery_attempts(template_variant_id)
  where template_variant_id is not null;

create index if not exists notification_event_routes_provider_adapter_idx
  on public.notification_event_routes(provider_adapter_key)
  where provider_adapter_key is not null;
