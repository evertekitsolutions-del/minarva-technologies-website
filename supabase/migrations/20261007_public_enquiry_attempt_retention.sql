-- Platform — Milestone 4A1
-- Make the anti-abuse table's deny-all browser posture explicit and prune short-lived hashes.

drop policy if exists "deny_browser_access_public_enquiry_attempts"
  on public.public_enquiry_submission_attempts;

create policy "deny_browser_access_public_enquiry_attempts"
on public.public_enquiry_submission_attempts
for all
to anon,authenticated
using (false)
with check (false);

create or replace function private.prune_public_enquiry_submission_attempts()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_deleted integer;
begin
  delete from public.public_enquiry_submission_attempts
  where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.prune_public_enquiry_submission_attempts()
from public,anon,authenticated;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='prune-public-enquiry-attempts') then
      perform cron.unschedule('prune-public-enquiry-attempts');
    end if;
    perform cron.schedule(
      'prune-public-enquiry-attempts',
      '17 * * * *',
      'select private.prune_public_enquiry_submission_attempts();'
    );
  end if;
end
$$;
