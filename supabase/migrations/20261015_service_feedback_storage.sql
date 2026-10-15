-- Post-service feedback and unbiased Google review settings.
-- No public customer PII or raw feedback bearer token is stored.
begin;

create table if not exists public.service_feedback_settings (
  singleton boolean primary key default true check(singleton=true),
  google_review_url text
    check (google_review_url is null or
      google_review_url ~* '^https://(g\.page|search\.google\.com|www\.google\.com|maps\.app\.goo\.gl)/[^[:space:]]+$'),
  updated_at timestamptz not null default now()
);
insert into public.service_feedback_settings(singleton) values(true)
on conflict(singleton) do nothing;
alter table public.service_feedback_settings enable row level security;
revoke all on public.service_feedback_settings from anon,authenticated;
grant select,insert,update on public.service_feedback_settings to authenticated;
drop policy if exists active_admin_service_feedback_settings on public.service_feedback_settings;
create policy active_admin_service_feedback_settings
on public.service_feedback_settings for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create table if not exists public.service_feedback_requests (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null unique references public.service_jobs(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  revoked_at timestamptz,
  check(expires_at>issued_at)
);
create index if not exists service_feedback_requests_expires_idx
on public.service_feedback_requests(expires_at);
alter table public.service_feedback_requests enable row level security;
revoke all on public.service_feedback_requests from anon,authenticated;

create table if not exists public.service_feedback (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null unique references public.service_jobs(id) on delete cascade,
  request_id uuid not null unique references public.service_feedback_requests(id) on delete restrict,
  rating integer not null check(rating between 1 and 5),
  comments text check(comments is null or char_length(comments)<=2000),
  callback_requested boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists service_feedback_rating_idx on public.service_feedback(rating);
alter table public.service_feedback enable row level security;
revoke all on public.service_feedback from anon,authenticated;
grant select on public.service_feedback to authenticated;
drop policy if exists active_admin_read_service_feedback on public.service_feedback;
create policy active_admin_read_service_feedback
on public.service_feedback for select to authenticated
using ((select private.is_active_admin()));

commit;
