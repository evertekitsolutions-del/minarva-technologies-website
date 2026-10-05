-- Customer Care — Milestone 3B1
-- Provider-neutral notification dispatcher + automated-calling orchestration foundation.
-- No external provider is called by this migration.

create table if not exists public.customer_care_settings (
  singleton boolean primary key default true check (singleton),
  timezone text not null default 'Asia/Kolkata',
  quiet_start time not null default '20:00',
  quiet_end time not null default '09:00',
  default_max_attempts integer not null default 3 check (default_max_attempts between 1 and 20),
  default_retry_base_minutes integer not null default 15 check (default_retry_base_minutes between 1 and 1440),
  invoice_due_soon_days integer not null default 2 check (invoice_due_soon_days between 0 and 30),
  invoice_overdue_schedule integer[] not null default array[1,3,7,14,30],
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.customer_care_settings(singleton)
values(true)
on conflict(singleton) do nothing;

create table if not exists public.customer_care_provider_adapters (
  adapter_key text primary key,
  channel text not null check (channel in ('whatsapp','sms','email','call')),
  display_name text not null,
  adapter_type text not null default 'external'
    check (adapter_type in ('external','edge_function','webhook','manual')),
  enabled boolean not null default false,
  endpoint_ref text,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.customer_care_provider_adapters(adapter_key,channel,display_name,adapter_type,enabled,notes)
values
  ('whatsapp_unconfigured','whatsapp','WhatsApp — provider not connected','external',false,'Placeholder only; no credentials stored.'),
  ('sms_unconfigured','sms','SMS — provider not connected','external',false,'Placeholder only; no credentials stored.'),
  ('email_unconfigured','email','Email — provider not connected','external',false,'Placeholder only; no credentials stored.'),
  ('call_unconfigured','call','Automated Call — provider not connected','external',false,'Placeholder only; no credentials stored.')
on conflict(adapter_key) do nothing;

create table if not exists public.notification_template_variants (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  channel text not null default 'any'
    check (channel in ('any','whatsapp','sms','email','call')),
  language text not null check (language in ('ml','en')),
  subject_template text,
  body_template text not null,
  call_script_template text,
  variables jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_key,channel,language)
);

insert into public.notification_template_variants(
  template_key,channel,language,subject_template,body_template,call_script_template,variables
)
values
('service_eta','any','en','Service ETA — {{job_number}}',
 'Hello {{customer_name}}, our Minarva Technologies technician is expected for {{job_number}} around {{eta_at}}. {{eta_note}}',
 'Hello {{customer_name}}. This is Minarva Technologies regarding service job {{job_number}}. Our technician is expected around {{eta_at}}. {{eta_note}}',
 '["customer_name","job_number","eta_at","eta_note"]'::jsonb),
('service_eta','any','ml','സർവീസ് ETA — {{job_number}}',
 'നമസ്കാരം {{customer_name}}, Minarva Technologies-ന്റെ {{job_number}} സർവീസിനായി ടെക്നീഷ്യൻ ഏകദേശം {{eta_at}} സമയത്ത് എത്തും. {{eta_note}}',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. {{job_number}} സർവീസിനായി ഞങ്ങളുടെ ടെക്നീഷ്യൻ ഏകദേശം {{eta_at}} സമയത്ത് എത്തും. {{eta_note}}',
 '["customer_name","job_number","eta_at","eta_note"]'::jsonb),
('service_status','any','en','Service update — {{job_number}}',
 'Hello {{customer_name}}, update for {{job_number}}: {{event_label}}. Service: {{service_category}}.',
 'Hello {{customer_name}}. This is Minarva Technologies with an update for service job {{job_number}}. {{event_label}}. The service is {{service_category}}.',
 '["customer_name","job_number","event_label","service_category"]'::jsonb),
('service_status','any','ml','സർവീസ് അപ്ഡേറ്റ് — {{job_number}}',
 'നമസ്കാരം {{customer_name}}, {{job_number}}-ന്റെ അപ്ഡേറ്റ്: {{event_label}}. സർവീസ്: {{service_category}}.',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. {{job_number}} സർവീസിന്റെ ഇപ്പോഴത്തെ അപ്ഡേറ്റ്: {{event_label}}. സർവീസ്: {{service_category}}.',
 '["customer_name","job_number","event_label","service_category"]'::jsonb),
('service_job_completed','any','en','Service completed — {{job_number}}',
 'Hello {{customer_name}}, service job {{job_number}} has been completed. Thank you for choosing Minarva Technologies.',
 'Hello {{customer_name}}. This is Minarva Technologies. Your service job {{job_number}} has been completed. Thank you.',
 '["customer_name","job_number"]'::jsonb),
('service_job_completed','any','ml','സർവീസ് പൂർത്തിയായി — {{job_number}}',
 'നമസ്കാരം {{customer_name}}, നിങ്ങളുടെ {{job_number}} സർവീസ് പൂർത്തിയായി. Minarva Technologies തിരഞ്ഞെടുക്കിയതിന് നന്ദി.',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. നിങ്ങളുടെ {{job_number}} സർവീസ് പൂർത്തിയായി. നന്ദി.',
 '["customer_name","job_number"]'::jsonb),
('invoice_due','any','en','Payment reminder — {{invoice_number}}',
 'Hello {{customer_name}}, a payment of {{balance_due}} for invoice {{invoice_number}} is due on {{due_date}}. Please ignore this reminder if already paid.',
 'Hello {{customer_name}}. This is Minarva Technologies with a payment reminder. {{balance_due}} is due for invoice {{invoice_number}} on {{due_date}}. Please ignore this reminder if already paid.',
 '["customer_name","invoice_number","balance_due","due_date"]'::jsonb),
('invoice_due','any','ml','പേയ്മെന്റ് ഓർമ്മപ്പെടുത്തൽ — {{invoice_number}}',
 'നമസ്കാരം {{customer_name}}, {{invoice_number}} ഇൻവോയ്സിലെ {{balance_due}} തുക {{due_date}}-ന് അടയ്ക്കാനുണ്ട്. ഇതിനകം അടച്ചിട്ടുണ്ടെങ്കിൽ ഈ സന്ദേശം അവഗണിക്കാം.',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നുള്ള പേയ്മെന്റ് ഓർമ്മപ്പെടുത്തലാണ്. {{invoice_number}} ഇൻവോയ്സിലെ {{balance_due}} തുക {{due_date}}-ന് അടയ്ക്കാനുണ്ട്. ഇതിനകം അടച്ചിട്ടുണ്ടെങ്കിൽ അവഗണിക്കാം.',
 '["customer_name","invoice_number","balance_due","due_date"]'::jsonb),
('invoice_overdue','any','en','Overdue payment reminder — {{invoice_number}}',
 'Hello {{customer_name}}, {{balance_due}} for invoice {{invoice_number}} is overdue by {{days_overdue}} day(s). Please contact Minarva Technologies if you need assistance.',
 'Hello {{customer_name}}. This is Minarva Technologies. {{balance_due}} for invoice {{invoice_number}} is overdue by {{days_overdue}} days. Please contact us if you need assistance.',
 '["customer_name","invoice_number","balance_due","days_overdue"]'::jsonb),
('invoice_overdue','any','ml','കുടിശ്ശിക പേയ്മെന്റ് — {{invoice_number}}',
 'നമസ്കാരം {{customer_name}}, {{invoice_number}} ഇൻവോയ്സിലെ {{balance_due}} തുക {{days_overdue}} ദിവസം കുടിശ്ശികയിലാണ്. സഹായം ആവശ്യമെങ്കിൽ Minarva Technologies-നെ ബന്ധപ്പെടുക.',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. {{invoice_number}} ഇൻവോയ്സിലെ {{balance_due}} തുക {{days_overdue}} ദിവസം കുടിശ്ശികയിലാണ്. സഹായം ആവശ്യമെങ്കിൽ ഞങ്ങളെ ബന്ധപ്പെടുക.',
 '["customer_name","invoice_number","balance_due","days_overdue"]'::jsonb),
('service_followup','any','en','Service follow-up — {{job_number}}',
 'Hello {{customer_name}}, this is a follow-up regarding service job {{job_number}}. Please let us know if you need any further assistance.',
 'Hello {{customer_name}}. This is Minarva Technologies following up on service job {{job_number}}. Please let us know if you need any further assistance.',
 '["customer_name","job_number"]'::jsonb),
('service_followup','any','ml','സർവീസ് ഫോളോ-അപ്പ് — {{job_number}}',
 'നമസ്കാരം {{customer_name}}, {{job_number}} സർവീസിനെക്കുറിച്ചുള്ള ഫോളോ-അപ്പാണ്. കൂടുതൽ സഹായം ആവശ്യമുണ്ടെങ്കിൽ അറിയിക്കൂ.',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. {{job_number}} സർവീസിനെക്കുറിച്ചുള്ള ഫോളോ-അപ്പാണ്. കൂടുതൽ സഹായം ആവശ്യമുണ്ടെങ്കിൽ അറിയിക്കൂ.',
 '["customer_name","job_number"]'::jsonb),
('callback_reminder','any','en','Requested callback',
 'Hello {{customer_name}}, Minarva Technologies is following up on your requested callback. {{reason}}',
 'Hello {{customer_name}}. This is Minarva Technologies calling back as requested. {{reason}}',
 '["customer_name","reason"]'::jsonb),
('callback_reminder','any','ml','അഭ്യർത്ഥിച്ച കോൾബാക്ക്',
 'നമസ്കാരം {{customer_name}}, നിങ്ങൾ അഭ്യർത്ഥിച്ച കോൾബാക്കിനായുള്ള Minarva Technologies ഫോളോ-അപ്പാണ്. {{reason}}',
 'നമസ്കാരം {{customer_name}}. നിങ്ങൾ അഭ്യർത്ഥിച്ച കോൾബാക്കിനായി Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. {{reason}}',
 '["customer_name","reason"]'::jsonb),
('manual_campaign','any','en','Minarva Technologies update',
 'Hello {{customer_name}}, {{message}}',
 'Hello {{customer_name}}. This is Minarva Technologies. {{message}}',
 '["customer_name","message"]'::jsonb),
('manual_campaign','any','ml','Minarva Technologies അപ്ഡേറ്റ്',
 'നമസ്കാരം {{customer_name}}, {{message}}',
 'നമസ്കാരം {{customer_name}}. Minarva Technologies-ൽ നിന്നാണ് വിളിക്കുന്നത്. {{message}}',
 '["customer_name","message"]'::jsonb)
on conflict(template_key,channel,language)
do update set
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  call_script_template=excluded.call_script_template,
  variables=excluded.variables,
  active=true,
  updated_at=now();

create table if not exists public.notification_event_routes (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  channel text not null check (channel in ('whatsapp','sms','email','call')),
  template_key text not null,
  enabled boolean not null default true,
  provider_adapter_key text references public.customer_care_provider_adapters(adapter_key) on delete set null,
  quiet_hours_exempt boolean not null default false,
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  retry_base_minutes integer not null default 15 check (retry_base_minutes between 1 and 1440),
  fallback_channels jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_type,channel)
);

with events(event_type,template_key) as (
  values
    ('technician_eta','service_eta'),
    ('visit_started','service_status'),
    ('arrived','service_status'),
    ('work_started','service_status'),
    ('work_completed','service_status'),
    ('job_completed','service_job_completed'),
    ('invoice_due_soon','invoice_due'),
    ('invoice_due_today','invoice_due'),
    ('invoice_overdue','invoice_overdue'),
    ('service_follow_up','service_followup'),
    ('callback_reminder','callback_reminder'),
    ('manual_campaign','manual_campaign')
),
channels(channel) as (
  values ('whatsapp'),('sms'),('email'),('call')
)
insert into public.notification_event_routes(
  event_type,channel,template_key,max_attempts,retry_base_minutes,fallback_channels
)
select
  e.event_type,
  c.channel,
  e.template_key,
  case when c.channel='call' then 2 else 3 end,
  case when c.channel='call' then 120 else 15 end,
  case
    when c.channel='whatsapp' then '["sms","email"]'::jsonb
    when c.channel='sms' then '["whatsapp","email"]'::jsonb
    when c.channel='email' then '["whatsapp","sms"]'::jsonb
    else '[]'::jsonb
  end
from events e cross join channels c
on conflict(event_type,channel)
do update set
  template_key=excluded.template_key,
  max_attempts=excluded.max_attempts,
  retry_base_minutes=excluded.retry_base_minutes,
  fallback_channels=excluded.fallback_channels,
  updated_at=now();

create table if not exists public.customer_contact_preferences (
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','sms','email','call')),
  opted_out boolean not null default false,
  opt_out_reason text,
  opted_out_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(customer_id,channel)
);

create table if not exists public.customer_care_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  campaign_type text not null
    check (campaign_type in ('service_follow_up','invoice_reminder','automated_call','manual')),
  event_type text not null default 'manual_campaign',
  channel text not null check (channel in ('whatsapp','sms','email','call')),
  template_key text,
  language text check (language is null or language in ('ml','en')),
  call_reason text,
  script_override text,
  scheduled_for timestamptz not null default now(),
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_contact_outbox (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_type text not null
    check (source_type in ('service_job','invoice','campaign','manual')),
  source_id text,
  source_event_key text not null unique,
  event_type text not null,
  requested_channel text check (requested_channel is null or requested_channel in ('whatsapp','sms','email','call')),
  resolved_channel text check (resolved_channel is null or resolved_channel in ('whatsapp','sms','email','call')),
  language text check (language is null or language in ('ml','en')),
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  template_key_override text,
  route_id uuid references public.notification_event_routes(id) on delete set null,
  template_variant_id uuid references public.notification_template_variants(id) on delete set null,
  provider_adapter_key text references public.customer_care_provider_adapters(adapter_key) on delete set null,
  scheduled_for timestamptz not null default now(),
  next_attempt_at timestamptz,
  priority integer not null default 100,
  status text not null default 'pending'
    check (status in ('pending','ready','sent','failed','suppressed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  suppression_reason text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_contact_outbox_status_schedule_idx
  on public.customer_contact_outbox(status,scheduled_for,next_attempt_at,priority);
create index if not exists customer_contact_outbox_customer_created_idx
  on public.customer_contact_outbox(customer_id,created_at desc);
create index if not exists customer_contact_outbox_source_idx
  on public.customer_contact_outbox(source_type,source_id);

create table if not exists public.customer_care_campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.customer_care_campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_type text,
  source_id text,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','queued','sent','failed','suppressed','callback_required','escalated','cancelled')),
  outbox_id uuid unique references public.customer_contact_outbox(id) on delete set null,
  outcome text,
  callback_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,customer_id,source_type,source_id)
);

create index if not exists customer_care_campaign_members_campaign_status_idx
  on public.customer_care_campaign_members(campaign_id,status);
create index if not exists customer_care_campaign_members_customer_idx
  on public.customer_care_campaign_members(customer_id,created_at desc);

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.customer_contact_outbox(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  channel text not null check (channel in ('whatsapp','sms','email','call')),
  provider_adapter_key text references public.customer_care_provider_adapters(adapter_key) on delete set null,
  template_variant_id uuid references public.notification_template_variants(id) on delete set null,
  recipient text,
  subject text,
  body text,
  call_script text,
  status text not null default 'ready'
    check (status in ('ready','sending','sent','failed','suppressed','cancelled')),
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  unique(outbox_id,attempt_no)
);

create index if not exists notification_delivery_attempts_status_created_idx
  on public.notification_delivery_attempts(status,created_at);
create index if not exists notification_delivery_attempts_outbox_idx
  on public.notification_delivery_attempts(outbox_id,attempt_no desc);

create table if not exists public.customer_contact_timeline (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  outbox_id uuid references public.customer_contact_outbox(id) on delete set null,
  attempt_id uuid references public.notification_delivery_attempts(id) on delete set null,
  campaign_id uuid references public.customer_care_campaigns(id) on delete set null,
  source_type text,
  source_id text,
  event_type text not null,
  channel text check (channel is null or channel in ('whatsapp','sms','email','call')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound','internal')),
  status text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_contact_timeline_customer_created_idx
  on public.customer_contact_timeline(customer_id,created_at desc);
create index if not exists customer_contact_timeline_outbox_idx
  on public.customer_contact_timeline(outbox_id,created_at desc);

create table if not exists public.automated_call_jobs (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique references public.customer_contact_outbox(id) on delete cascade,
  attempt_id uuid references public.notification_delivery_attempts(id) on delete set null,
  campaign_member_id uuid references public.customer_care_campaign_members(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  call_reason text not null,
  language text not null check (language in ('ml','en')),
  phone text,
  script text not null,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'ready'
    check (status in ('ready','calling','completed','failed','callback_required','escalated','opted_out','suppressed','cancelled')),
  attempt_count integer not null default 0,
  provider_call_id text,
  outcome text,
  callback_at timestamptz,
  escalated_at timestamptz,
  escalation_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automated_call_jobs_status_callback_idx
  on public.automated_call_jobs(status,callback_at,created_at);
create index if not exists automated_call_jobs_customer_created_idx
  on public.automated_call_jobs(customer_id,created_at desc);

-- Standard updated_at triggers.
drop trigger if exists customer_care_settings_updated_at on public.customer_care_settings;
create trigger customer_care_settings_updated_at
before update on public.customer_care_settings
for each row execute function private.set_updated_at();

drop trigger if exists customer_care_provider_adapters_updated_at on public.customer_care_provider_adapters;
create trigger customer_care_provider_adapters_updated_at
before update on public.customer_care_provider_adapters
for each row execute function private.set_updated_at();

drop trigger if exists notification_template_variants_updated_at on public.notification_template_variants;
create trigger notification_template_variants_updated_at
before update on public.notification_template_variants
for each row execute function private.set_updated_at();

drop trigger if exists notification_event_routes_updated_at on public.notification_event_routes;
create trigger notification_event_routes_updated_at
before update on public.notification_event_routes
for each row execute function private.set_updated_at();

drop trigger if exists customer_contact_preferences_updated_at on public.customer_contact_preferences;
create trigger customer_contact_preferences_updated_at
before update on public.customer_contact_preferences
for each row execute function private.set_updated_at();

drop trigger if exists customer_care_campaigns_updated_at on public.customer_care_campaigns;
create trigger customer_care_campaigns_updated_at
before update on public.customer_care_campaigns
for each row execute function private.set_updated_at();

drop trigger if exists customer_contact_outbox_updated_at on public.customer_contact_outbox;
create trigger customer_contact_outbox_updated_at
before update on public.customer_contact_outbox
for each row execute function private.set_updated_at();

drop trigger if exists customer_care_campaign_members_updated_at on public.customer_care_campaign_members;
create trigger customer_care_campaign_members_updated_at
before update on public.customer_care_campaign_members
for each row execute function private.set_updated_at();

drop trigger if exists automated_call_jobs_updated_at on public.automated_call_jobs;
create trigger automated_call_jobs_updated_at
before update on public.automated_call_jobs
for each row execute function private.set_updated_at();

-- RLS: customer-care operational data is admin-only from the browser.
alter table public.customer_care_settings enable row level security;
alter table public.customer_care_provider_adapters enable row level security;
alter table public.notification_template_variants enable row level security;
alter table public.notification_event_routes enable row level security;
alter table public.customer_contact_preferences enable row level security;
alter table public.customer_care_campaigns enable row level security;
alter table public.customer_contact_outbox enable row level security;
alter table public.customer_care_campaign_members enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.customer_contact_timeline enable row level security;
alter table public.automated_call_jobs enable row level security;

revoke all on public.customer_care_settings from anon;
revoke all on public.customer_care_provider_adapters from anon;
revoke all on public.notification_template_variants from anon;
revoke all on public.notification_event_routes from anon;
revoke all on public.customer_contact_preferences from anon;
revoke all on public.customer_care_campaigns from anon;
revoke all on public.customer_contact_outbox from anon;
revoke all on public.customer_care_campaign_members from anon;
revoke all on public.notification_delivery_attempts from anon;
revoke all on public.customer_contact_timeline from anon;
revoke all on public.automated_call_jobs from anon;

grant select,insert,update,delete on public.customer_care_settings to authenticated;
grant select,insert,update,delete on public.customer_care_provider_adapters to authenticated;
grant select,insert,update,delete on public.notification_template_variants to authenticated;
grant select,insert,update,delete on public.notification_event_routes to authenticated;
grant select,insert,update,delete on public.customer_contact_preferences to authenticated;
grant select,insert,update,delete on public.customer_care_campaigns to authenticated;
grant select,insert,update,delete on public.customer_contact_outbox to authenticated;
grant select,insert,update,delete on public.customer_care_campaign_members to authenticated;
grant select,insert,update,delete on public.notification_delivery_attempts to authenticated;
grant select,insert,update,delete on public.customer_contact_timeline to authenticated;
grant select,insert,update,delete on public.automated_call_jobs to authenticated;
grant usage,select on sequence public.customer_contact_timeline_id_seq to authenticated;

drop policy if exists "active_admin_manage_customer_care_settings" on public.customer_care_settings;
create policy "active_admin_manage_customer_care_settings"
on public.customer_care_settings for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_care_provider_adapters" on public.customer_care_provider_adapters;
create policy "active_admin_manage_customer_care_provider_adapters"
on public.customer_care_provider_adapters for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_notification_template_variants" on public.notification_template_variants;
create policy "active_admin_manage_notification_template_variants"
on public.notification_template_variants for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_notification_event_routes" on public.notification_event_routes;
create policy "active_admin_manage_notification_event_routes"
on public.notification_event_routes for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_contact_preferences" on public.customer_contact_preferences;
create policy "active_admin_manage_customer_contact_preferences"
on public.customer_contact_preferences for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_care_campaigns" on public.customer_care_campaigns;
create policy "active_admin_manage_customer_care_campaigns"
on public.customer_care_campaigns for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_contact_outbox" on public.customer_contact_outbox;
create policy "active_admin_manage_customer_contact_outbox"
on public.customer_contact_outbox for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_care_campaign_members" on public.customer_care_campaign_members;
create policy "active_admin_manage_customer_care_campaign_members"
on public.customer_care_campaign_members for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_notification_delivery_attempts" on public.notification_delivery_attempts;
create policy "active_admin_manage_notification_delivery_attempts"
on public.notification_delivery_attempts for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_contact_timeline" on public.customer_contact_timeline;
create policy "active_admin_manage_customer_contact_timeline"
on public.customer_contact_timeline for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_automated_call_jobs" on public.automated_call_jobs;
create policy "active_admin_manage_automated_call_jobs"
on public.automated_call_jobs for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create or replace function private.render_contact_template(
  p_template text,
  p_variables jsonb
)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_result text:=coalesce(p_template,'');
  v_key text;
  v_value text;
begin
  for v_key,v_value in
    select key,value
    from jsonb_each_text(coalesce(p_variables,'{}'::jsonb))
  loop
    v_result:=replace(v_result,'{{'||v_key||'}}',coalesce(v_value,''));
  end loop;
  return regexp_replace(v_result,'[[:space:]]+',' ','g');
end;
$$;

create or replace function private.mirror_service_job_notification_to_contact_outbox()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.service_jobs%rowtype;
  v_event_label text;
  v_payload jsonb;
begin
  select * into v_job
  from public.service_jobs
  where id=new.service_job_id;

  v_event_label:=case new.event_type
    when 'visit_started' then 'Technician visit started'
    when 'arrived' then 'Technician arrived at the service location'
    when 'work_started' then 'Service work started'
    when 'work_completed' then 'Service work completed'
    when 'job_completed' then 'Service job completed'
    when 'technician_eta' then 'Technician ETA updated'
    else replace(new.event_type,'_',' ')
  end;

  v_payload:=coalesce(new.payload,'{}'::jsonb)||jsonb_build_object(
    'job_number',v_job.job_number,
    'service_category',v_job.service_category,
    'event_label',v_event_label,
    'eta_at',coalesce(new.payload->>'eta_at',v_job.technician_eta_at::text),
    'eta_note',coalesce(new.payload->>'note',v_job.technician_eta_note,'')
  );

  insert into public.customer_contact_outbox(
    customer_id,source_type,source_id,source_event_key,event_type,requested_channel,
    language,recipient,payload,scheduled_for,status,suppression_reason
  )
  values(
    new.customer_id,'service_job',new.service_job_id::text,
    'service-job-hook:'||new.id::text,new.event_type,new.channel,
    case when new.language in ('ml','en') then new.language else null end,
    new.recipient,v_payload,coalesce(new.created_at,now()),
    case when new.status='suppressed' then 'suppressed' else 'pending' end,
    new.suppression_reason
  )
  on conflict(source_event_key) do nothing;

  update public.service_job_notification_outbox
  set processed_at=coalesce(processed_at,now())
  where id=new.id;

  return new;
end;
$$;

revoke all on function private.mirror_service_job_notification_to_contact_outbox()
from public,anon,authenticated;

drop trigger if exists mirror_service_job_notification_to_contact_outbox on public.service_job_notification_outbox;
create trigger mirror_service_job_notification_to_contact_outbox
after insert on public.service_job_notification_outbox
for each row execute function private.mirror_service_job_notification_to_contact_outbox();

-- Backfill already-existing durable service hooks without inventing new customer data.
insert into public.customer_contact_outbox(
  customer_id,source_type,source_id,source_event_key,event_type,requested_channel,
  language,recipient,payload,scheduled_for,status,suppression_reason
)
select
  o.customer_id,'service_job',o.service_job_id::text,
  'service-job-hook:'||o.id::text,o.event_type,o.channel,
  case when o.language in ('ml','en') then o.language else null end,
  o.recipient,
  coalesce(o.payload,'{}'::jsonb)||jsonb_build_object(
    'job_number',j.job_number,
    'service_category',j.service_category,
    'event_label',case o.event_type
      when 'visit_started' then 'Technician visit started'
      when 'arrived' then 'Technician arrived at the service location'
      when 'work_started' then 'Service work started'
      when 'work_completed' then 'Service work completed'
      when 'job_completed' then 'Service job completed'
      when 'technician_eta' then 'Technician ETA updated'
      else replace(o.event_type,'_',' ')
    end,
    'eta_at',coalesce(o.payload->>'eta_at',j.technician_eta_at::text),
    'eta_note',coalesce(o.payload->>'note',j.technician_eta_note,'')
  ),
  o.created_at,
  case when o.status='suppressed' then 'suppressed' else 'pending' end,
  o.suppression_reason
from public.service_job_notification_outbox o
join public.service_jobs j on j.id=o.service_job_id
on conflict(source_event_key) do nothing;

create or replace function private.enqueue_invoice_reminders_worker(
  p_as_of date default null
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_settings public.customer_care_settings%rowtype;
  v_date date;
  v_row record;
  v_event text;
  v_days integer;
  v_inserted integer:=0;
begin
  select * into v_settings
  from public.customer_care_settings
  where singleton=true;

  v_date:=coalesce(p_as_of,(now() at time zone coalesce(v_settings.timezone,'Asia/Kolkata'))::date);

  for v_row in
    select
      i.id,i.invoice_number,i.customer_id,i.due_date,i.currency,i.balance_due,
      c.name as customer_name,c.preferred_language
    from public.invoices i
    join public.customers c on c.id=i.customer_id
    where i.status='issued'
      and i.balance_due>0
      and i.due_date is not null
  loop
    v_event:=null;
    v_days:=v_date-v_row.due_date;

    if v_row.due_date=v_date+coalesce(v_settings.invoice_due_soon_days,2) then
      v_event:='invoice_due_soon';
    elsif v_row.due_date=v_date then
      v_event:='invoice_due_today';
    elsif v_days>0 and v_days=any(coalesce(v_settings.invoice_overdue_schedule,array[1,3,7,14,30])) then
      v_event:='invoice_overdue';
    end if;

    if v_event is not null then
      insert into public.customer_contact_outbox(
        customer_id,source_type,source_id,source_event_key,event_type,language,payload,scheduled_for
      )
      values(
        v_row.customer_id,'invoice',v_row.id::text,
        'invoice:'||v_row.id::text||':'||v_event||':'||v_date::text,
        v_event,
        case when v_row.preferred_language in ('ml','en') then v_row.preferred_language else null end,
        jsonb_build_object(
          'customer_name',v_row.customer_name,
          'invoice_number',v_row.invoice_number,
          'due_date',v_row.due_date::text,
          'balance_due',v_row.currency||' '||to_char(v_row.balance_due,'FM999999990.00'),
          'currency',v_row.currency,
          'days_overdue',greatest(v_days,0)
        ),
        now()
      )
      on conflict(source_event_key) do nothing;

      if found then v_inserted:=v_inserted+1; end if;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function private.enqueue_invoice_reminders_worker(date)
from public,anon,authenticated;

create or replace function private.customer_care_prepare_dispatch_worker(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_settings public.customer_care_settings%rowtype;
  v_o public.customer_contact_outbox%rowtype;
  v_c public.customers%rowtype;
  v_route public.notification_event_routes%rowtype;
  v_template public.notification_template_variants%rowtype;
  v_pref public.customer_contact_preferences%rowtype;
  v_channel text;
  v_language text;
  v_recipient text;
  v_variables jsonb;
  v_subject text;
  v_body text;
  v_script text;
  v_attempt_id uuid;
  v_campaign_member_id uuid;
  v_local_now timestamp;
  v_local_time time;
  v_next_local timestamp;
  v_next_allowed timestamptz;
  v_ready integer:=0;
  v_suppressed integer:=0;
  v_deferred integer:=0;
begin
  select * into v_settings from public.customer_care_settings where singleton=true;
  if coalesce(v_settings.active,false)=false then
    return jsonb_build_object('ready',0,'suppressed',0,'deferred',0,'inactive',true);
  end if;

  for v_o in
    select *
    from public.customer_contact_outbox o
    where o.status='pending'
      and o.scheduled_for<=now()
      and (o.next_attempt_at is null or o.next_attempt_at<=now())
    order by o.priority asc,o.scheduled_for asc,o.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    select * into v_c from public.customers where id=v_o.customer_id;
    if not found then
      update public.customer_contact_outbox
      set status='suppressed',suppression_reason='Customer record not found',processed_at=now()
      where id=v_o.id;
      v_suppressed:=v_suppressed+1;
      continue;
    end if;

    v_channel:=coalesce(v_o.requested_channel,nullif(lower(btrim(v_c.preferred_contact_channel)),''),'whatsapp');
    if v_channel not in ('whatsapp','sms','email','call') then v_channel:='whatsapp'; end if;
    v_language:=coalesce(v_o.language,case when v_c.preferred_language in ('ml','en') then v_c.preferred_language else 'ml' end);

    select * into v_route
    from public.notification_event_routes r
    where r.event_type=v_o.event_type
      and r.channel=v_channel
      and r.enabled=true
    limit 1;

    if not found then
      update public.customer_contact_outbox
      set status='suppressed',resolved_channel=v_channel,
          suppression_reason='No enabled event/channel route',processed_at=now()
      where id=v_o.id;
      insert into public.customer_contact_timeline(
        customer_id,outbox_id,source_type,source_id,event_type,channel,direction,status,summary
      ) values(
        v_c.id,v_o.id,v_o.source_type,v_o.source_id,v_o.event_type,v_channel,'internal','suppressed',
        'No enabled event/channel route'
      );
      v_suppressed:=v_suppressed+1;
      continue;
    end if;

    select * into v_pref
    from public.customer_contact_preferences p
    where p.customer_id=v_c.id and p.channel=v_channel;

    if found and v_pref.opted_out=true then
      update public.customer_contact_outbox
      set status='suppressed',resolved_channel=v_channel,
          suppression_reason='Customer opted out of this channel',processed_at=now()
      where id=v_o.id;
      insert into public.customer_contact_timeline(
        customer_id,outbox_id,source_type,source_id,event_type,channel,direction,status,summary
      ) values(
        v_c.id,v_o.id,v_o.source_type,v_o.source_id,v_o.event_type,v_channel,'internal','suppressed',
        'Customer opted out of this channel'
      );
      v_suppressed:=v_suppressed+1;
      continue;
    end if;

    if v_channel='call' and (v_c.call_consent<>true or v_c.do_not_call=true) then
      update public.customer_contact_outbox
      set status='suppressed',resolved_channel=v_channel,
          suppression_reason=case
            when v_c.do_not_call then 'Do Not Call is enabled'
            else 'Explicit call consent is not recorded'
          end,
          processed_at=now()
      where id=v_o.id;
      insert into public.customer_contact_timeline(
        customer_id,outbox_id,source_type,source_id,event_type,channel,direction,status,summary
      ) values(
        v_c.id,v_o.id,v_o.source_type,v_o.source_id,v_o.event_type,v_channel,'internal','suppressed',
        case when v_c.do_not_call then 'Do Not Call is enabled' else 'Explicit call consent is not recorded' end
      );
      v_suppressed:=v_suppressed+1;
      continue;
    end if;

    v_recipient:=case when v_channel='email'
      then nullif(btrim(coalesce(v_c.email,'')),'')
      else nullif(btrim(coalesce(v_c.phone,'')),'')
    end;

    if v_recipient is null then
      update public.customer_contact_outbox
      set status='suppressed',resolved_channel=v_channel,
          suppression_reason=case when v_channel='email' then 'Customer email is missing' else 'Customer phone is missing' end,
          processed_at=now()
      where id=v_o.id;
      v_suppressed:=v_suppressed+1;
      continue;
    end if;

    if v_route.quiet_hours_exempt=false then
      v_local_now:=now() at time zone coalesce(v_settings.timezone,'Asia/Kolkata');
      v_local_time:=v_local_now::time;

      if v_settings.quiet_start>v_settings.quiet_end then
        if v_local_time>=v_settings.quiet_start or v_local_time<v_settings.quiet_end then
          if v_local_time>=v_settings.quiet_start then
            v_next_local:=(v_local_now::date+1)+v_settings.quiet_end;
          else
            v_next_local:=v_local_now::date+v_settings.quiet_end;
          end if;
          v_next_allowed:=v_next_local at time zone coalesce(v_settings.timezone,'Asia/Kolkata');
          update public.customer_contact_outbox
          set scheduled_for=v_next_allowed,next_attempt_at=v_next_allowed
          where id=v_o.id;
          v_deferred:=v_deferred+1;
          continue;
        end if;
      elsif v_local_time>=v_settings.quiet_start and v_local_time<v_settings.quiet_end then
        v_next_local:=v_local_now::date+v_settings.quiet_end;
        if v_next_local<=v_local_now then v_next_local:=v_next_local+interval '1 day'; end if;
        v_next_allowed:=v_next_local at time zone coalesce(v_settings.timezone,'Asia/Kolkata');
        update public.customer_contact_outbox
        set scheduled_for=v_next_allowed,next_attempt_at=v_next_allowed
        where id=v_o.id;
        v_deferred:=v_deferred+1;
        continue;
      end if;
    end if;

    select * into v_template
    from public.notification_template_variants t
    where t.template_key=coalesce(v_o.template_key_override,v_route.template_key)
      and t.active=true
      and t.language=v_language
      and t.channel in (v_channel,'any')
    order by case when t.channel=v_channel then 0 else 1 end
    limit 1;

    if not found then
      select * into v_template
      from public.notification_template_variants t
      where t.template_key=coalesce(v_o.template_key_override,v_route.template_key)
        and t.active=true
        and t.language='en'
        and t.channel in (v_channel,'any')
      order by case when t.channel=v_channel then 0 else 1 end
      limit 1;
    end if;

    if not found then
      update public.customer_contact_outbox
      set status='suppressed',resolved_channel=v_channel,
          suppression_reason='No active template variant',processed_at=now()
      where id=v_o.id;
      v_suppressed:=v_suppressed+1;
      continue;
    end if;

    v_variables:=coalesce(v_o.payload,'{}'::jsonb)||jsonb_build_object(
      'customer_name',v_c.name,
      'customer_phone',coalesce(v_c.phone,''),
      'customer_email',coalesce(v_c.email,''),
      'event_type',v_o.event_type,
      'source_id',coalesce(v_o.source_id,'')
    );

    v_subject:=private.render_contact_template(v_template.subject_template,v_variables);
    v_body:=private.render_contact_template(v_template.body_template,v_variables);
    v_script:=private.render_contact_template(coalesce(v_template.call_script_template,v_template.body_template),v_variables);

    insert into public.notification_delivery_attempts(
      outbox_id,attempt_no,channel,provider_adapter_key,template_variant_id,recipient,
      subject,body,call_script,status
    )
    values(
      v_o.id,v_o.attempt_count+1,v_channel,v_route.provider_adapter_key,v_template.id,v_recipient,
      nullif(v_subject,''),v_body,v_script,'ready'
    )
    returning id into v_attempt_id;

    update public.customer_contact_outbox
    set
      resolved_channel=v_channel,
      language=v_language,
      recipient=v_recipient,
      route_id=v_route.id,
      template_variant_id=v_template.id,
      provider_adapter_key=v_route.provider_adapter_key,
      status='ready',
      attempt_count=attempt_count+1,
      max_attempts=v_route.max_attempts,
      suppression_reason=null,
      last_error=null,
      processed_at=now()
    where id=v_o.id;

    select m.id into v_campaign_member_id
    from public.customer_care_campaign_members m
    where m.outbox_id=v_o.id
    limit 1;

    if v_channel='call' then
      insert into public.automated_call_jobs(
        outbox_id,attempt_id,campaign_member_id,customer_id,call_reason,language,phone,script,variables,status
      )
      values(
        v_o.id,v_attempt_id,v_campaign_member_id,v_c.id,
        coalesce(v_o.payload->>'call_reason',v_o.event_type),
        v_language,v_recipient,v_script,v_variables,'ready'
      )
      on conflict(outbox_id) do update set
        attempt_id=excluded.attempt_id,
        language=excluded.language,
        phone=excluded.phone,
        script=excluded.script,
        variables=excluded.variables,
        status=case
          when public.automated_call_jobs.status in ('completed','opted_out','cancelled') then public.automated_call_jobs.status
          else 'ready'
        end,
        updated_at=now();
    end if;

    insert into public.customer_contact_timeline(
      customer_id,outbox_id,attempt_id,source_type,source_id,event_type,channel,direction,status,summary,metadata
    )
    values(
      v_c.id,v_o.id,v_attempt_id,v_o.source_type,v_o.source_id,v_o.event_type,v_channel,'outbound','ready',
      case
        when v_route.provider_adapter_key is null then 'Prepared; provider not connected'
        else 'Prepared for provider dispatch'
      end,
      jsonb_build_object('provider_adapter_key',v_route.provider_adapter_key,'template_key',v_template.template_key)
    );

    v_ready:=v_ready+1;
  end loop;

  return jsonb_build_object('ready',v_ready,'suppressed',v_suppressed,'deferred',v_deferred);
end;
$$;

revoke all on function private.customer_care_prepare_dispatch_worker(integer)
from public,anon,authenticated;

create or replace function public.customer_care_generate_invoice_reminders(
  p_as_of date default null
)
returns integer
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to generate customer-care reminders' using errcode='42501';
  end if;
  return private.enqueue_invoice_reminders_worker(p_as_of);
end;
$$;

revoke all on function public.customer_care_generate_invoice_reminders(date)
from public,anon,authenticated;
grant execute on function public.customer_care_generate_invoice_reminders(date)
to authenticated;

create or replace function public.customer_care_prepare_dispatch(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to prepare customer-care dispatch' using errcode='42501';
  end if;
  return private.customer_care_prepare_dispatch_worker(p_limit);
end;
$$;

revoke all on function public.customer_care_prepare_dispatch(integer)
from public,anon,authenticated;
grant execute on function public.customer_care_prepare_dispatch(integer)
to authenticated;

create or replace function public.customer_care_enqueue_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_campaign public.customer_care_campaigns%rowtype;
  v_member public.customer_care_campaign_members%rowtype;
  v_outbox uuid;
  v_count integer:=0;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to enqueue campaigns' using errcode='42501';
  end if;

  select * into v_campaign
  from public.customer_care_campaigns
  where id=p_campaign_id
  for update;

  if not found then raise exception 'Campaign not found'; end if;
  if v_campaign.status not in ('draft','active','paused') then
    raise exception 'Campaign cannot be enqueued in its current state';
  end if;

  for v_member in
    select *
    from public.customer_care_campaign_members
    where campaign_id=v_campaign.id
      and status='pending'
    for update
  loop
    insert into public.customer_contact_outbox(
      customer_id,source_type,source_id,source_event_key,event_type,requested_channel,
      language,payload,template_key_override,scheduled_for
    )
    values(
      v_member.customer_id,'campaign',v_member.id::text,
      'campaign-member:'||v_member.id::text,
      v_campaign.event_type,
      v_campaign.channel,
      v_campaign.language,
      coalesce(v_member.variables,'{}'::jsonb)||jsonb_build_object(
        'call_reason',coalesce(v_campaign.call_reason,''),
        'message',coalesce(v_campaign.script_override,'')
      ),
      v_campaign.template_key,
      v_campaign.scheduled_for
    )
    on conflict(source_event_key) do update set
      scheduled_for=excluded.scheduled_for,
      requested_channel=excluded.requested_channel,
      language=excluded.language,
      payload=excluded.payload,
      template_key_override=excluded.template_key_override
    returning id into v_outbox;

    update public.customer_care_campaign_members
    set status='queued',outbox_id=v_outbox
    where id=v_member.id;

    v_count:=v_count+1;
  end loop;

  update public.customer_care_campaigns
  set status='active'
  where id=v_campaign.id and status='draft';

  return jsonb_build_object('campaign_id',v_campaign.id,'queued',v_count);
end;
$$;

revoke all on function public.customer_care_enqueue_campaign(uuid)
from public,anon,authenticated;
grant execute on function public.customer_care_enqueue_campaign(uuid)
to authenticated;

create or replace function public.customer_care_record_attempt_result(
  p_attempt_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error_message text default null,
  p_provider_response jsonb default null,
  p_call_outcome text default null,
  p_callback_at timestamptz default null,
  p_escalate boolean default false,
  p_escalation_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_attempt public.notification_delivery_attempts%rowtype;
  v_outbox public.customer_contact_outbox%rowtype;
  v_route public.notification_event_routes%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_retry_at timestamptz;
  v_final_status text;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to record delivery results' using errcode='42501';
  end if;

  if v_status not in ('sent','failed','suppressed','cancelled') then
    raise exception 'Invalid delivery result status';
  end if;

  select * into v_attempt
  from public.notification_delivery_attempts
  where id=p_attempt_id
  for update;
  if not found then raise exception 'Delivery attempt not found'; end if;

  select * into v_outbox
  from public.customer_contact_outbox
  where id=v_attempt.outbox_id
  for update;
  if not found then raise exception 'Outbox item not found'; end if;

  if v_outbox.route_id is not null then
    select * into v_route from public.notification_event_routes where id=v_outbox.route_id;
  end if;

  update public.notification_delivery_attempts
  set
    status=v_status,
    provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),
    provider_response=coalesce(p_provider_response,provider_response),
    error_message=nullif(btrim(coalesce(p_error_message,'')),''),
    completed_at=now()
  where id=v_attempt.id;

  if v_status='sent' then
    v_final_status:='sent';
    update public.customer_contact_outbox
    set status='sent',last_error=null,processed_at=now()
    where id=v_outbox.id;
  elsif v_status='failed' and v_outbox.attempt_count<v_outbox.max_attempts then
    v_retry_at:=now()+make_interval(mins=>coalesce(v_route.retry_base_minutes,15)*power(2,greatest(v_outbox.attempt_count-1,0))::integer);
    v_final_status:='pending';
    update public.customer_contact_outbox
    set status='pending',last_error=p_error_message,next_attempt_at=v_retry_at,processed_at=now()
    where id=v_outbox.id;
    update public.notification_delivery_attempts
    set next_retry_at=v_retry_at
    where id=v_attempt.id;
  else
    v_final_status:=case when v_status='failed' then 'failed' else v_status end;
    update public.customer_contact_outbox
    set status=v_final_status,last_error=p_error_message,processed_at=now()
    where id=v_outbox.id;
  end if;

  if v_attempt.channel='call' then
    update public.automated_call_jobs
    set
      status=case
        when p_escalate then 'escalated'
        when p_call_outcome='opted_out' then 'opted_out'
        when p_callback_at is not null then 'callback_required'
        when v_status='sent' then 'completed'
        when v_status='failed' then 'failed'
        when v_status='suppressed' then 'suppressed'
        else status
      end,
      attempt_count=greatest(attempt_count,v_attempt.attempt_no),
      provider_call_id=coalesce(nullif(btrim(coalesce(p_provider_message_id,'')),''),provider_call_id),
      outcome=coalesce(nullif(btrim(coalesce(p_call_outcome,'')),''),outcome),
      callback_at=coalesce(p_callback_at,callback_at),
      escalated_at=case when p_escalate then now() else escalated_at end,
      escalation_reason=case when p_escalate then nullif(btrim(coalesce(p_escalation_reason,'')),'') else escalation_reason end,
      last_error=case when v_status='failed' then p_error_message else null end,
      updated_at=now()
    where outbox_id=v_outbox.id;

    if p_call_outcome='opted_out' then
      insert into public.customer_contact_preferences(
        customer_id,channel,opted_out,opt_out_reason,opted_out_at,updated_by
      )
      values(
        v_outbox.customer_id,'call',true,'Customer opted out during call',now(),auth.uid()
      )
      on conflict(customer_id,channel) do update set
        opted_out=true,
        opt_out_reason=excluded.opt_out_reason,
        opted_out_at=excluded.opted_out_at,
        updated_by=excluded.updated_by,
        updated_at=now();

      update public.customers
      set do_not_call=true
      where id=v_outbox.customer_id;
    end if;
  end if;

  insert into public.customer_contact_timeline(
    customer_id,outbox_id,attempt_id,source_type,source_id,event_type,channel,direction,status,summary,metadata
  )
  values(
    v_outbox.customer_id,v_outbox.id,v_attempt.id,v_outbox.source_type,v_outbox.source_id,
    v_outbox.event_type,v_attempt.channel,'outbound',v_final_status,
    coalesce(p_call_outcome,p_error_message,v_final_status),
    jsonb_build_object(
      'provider_message_id',p_provider_message_id,
      'callback_at',p_callback_at,
      'escalated',p_escalate,
      'escalation_reason',p_escalation_reason,
      'next_retry_at',v_retry_at
    )
  );

  update public.customer_care_campaign_members m
  set
    status=case
      when p_escalate then 'escalated'
      when p_callback_at is not null then 'callback_required'
      when v_final_status='sent' then 'sent'
      when v_final_status='failed' then 'failed'
      when v_final_status='suppressed' then 'suppressed'
      else m.status
    end,
    outcome=coalesce(p_call_outcome,m.outcome),
    callback_at=coalesce(p_callback_at,m.callback_at),
    escalated_at=case when p_escalate then now() else m.escalated_at end,
    updated_at=now()
  where m.outbox_id=v_outbox.id;

  return jsonb_build_object(
    'attempt_id',v_attempt.id,
    'outbox_id',v_outbox.id,
    'status',v_final_status,
    'next_retry_at',v_retry_at
  );
end;
$$;

revoke all on function public.customer_care_record_attempt_result(
  uuid,text,text,text,jsonb,text,timestamptz,boolean,text
) from public,anon,authenticated;
grant execute on function public.customer_care_record_attempt_result(
  uuid,text,text,text,jsonb,text,timestamptz,boolean,text
) to authenticated;

create or replace function public.customer_care_set_opt_out(
  p_customer_id uuid,
  p_channel text,
  p_opted_out boolean,
  p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_channel text:=lower(btrim(coalesce(p_channel,'')));
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to update contact preferences' using errcode='42501';
  end if;
  if v_channel not in ('whatsapp','sms','email','call') then
    raise exception 'Invalid contact channel';
  end if;

  insert into public.customer_contact_preferences(
    customer_id,channel,opted_out,opt_out_reason,opted_out_at,updated_by
  )
  values(
    p_customer_id,v_channel,coalesce(p_opted_out,false),
    case when p_opted_out then nullif(btrim(coalesce(p_reason,'')),'') else null end,
    case when p_opted_out then now() else null end,
    auth.uid()
  )
  on conflict(customer_id,channel) do update set
    opted_out=excluded.opted_out,
    opt_out_reason=excluded.opt_out_reason,
    opted_out_at=excluded.opted_out_at,
    updated_by=excluded.updated_by,
    updated_at=now();

  if v_channel='call' then
    update public.customers
    set do_not_call=coalesce(p_opted_out,false)
    where id=p_customer_id;
  end if;

  insert into public.customer_contact_timeline(
    customer_id,event_type,channel,direction,status,summary
  )
  values(
    p_customer_id,'contact_preference',v_channel,'internal',
    case when p_opted_out then 'opted_out' else 'opted_in' end,
    coalesce(p_reason,case when p_opted_out then 'Customer opted out' else 'Customer opt-out cleared' end)
  );
end;
$$;

revoke all on function public.customer_care_set_opt_out(uuid,text,boolean,text)
from public,anon,authenticated;
grant execute on function public.customer_care_set_opt_out(uuid,text,boolean,text)
to authenticated;

create or replace function private.customer_care_scheduler_tick()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invoice_count integer;
  v_dispatch jsonb;
begin
  v_invoice_count:=private.enqueue_invoice_reminders_worker(null);
  v_dispatch:=private.customer_care_prepare_dispatch_worker(200);
  return jsonb_build_object(
    'invoice_reminders_created',v_invoice_count,
    'dispatch',v_dispatch,
    'ran_at',now()
  );
end;
$$;

revoke all on function private.customer_care_scheduler_tick()
from public,anon,authenticated;
