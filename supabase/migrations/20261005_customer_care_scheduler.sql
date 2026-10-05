-- Customer Care — Milestone 3B1 scheduler.
-- Runs provider-neutral reminder generation + dispatch preparation every 15 minutes.
-- No external provider is called here.

create extension if not exists pg_cron;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='minarva-customer-care-tick'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'minarva-customer-care-tick',
    '*/15 * * * *',
    $cron$select private.customer_care_scheduler_tick();$cron$
  );
end;
$$;
