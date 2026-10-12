-- 2026-10-12: A configuration-only rehearsal must not count as a database restore.
-- This repairs the existing private refresh function in-place without rebuilding
-- release controls, changing telephony, or altering any recovery drill records.
begin;

do $migration$
declare
  v_definition text;
  v_old_query text := $old$
  select max(completed_at) into v_last_recovery
  from public.platform_recovery_drills
  where status='passed';$old$;
  v_new_query text := $new$
  select max(completed_at) into v_last_recovery
  from public.platform_recovery_drills
  where status='passed'
    and drill_type in ('database_restore','full_recovery')
    and lower(btrim(environment)) in ('non-production','staging','uat','isolated-restore')
    and completed_at is not null and completed_at > started_at
    and nullif(btrim(coalesce(recovery_point,'')),'') is not null
    and nullif(btrim(coalesce(evidence_reference,'')),'') is not null;$new$;
  v_old_status text := 'status=case when v_last_recovery is not null then ''pass'' else ''fail'' end';
  v_new_status text := 'status=case when v_last_recovery is not null then ''pass'' else ''pending'' end';
  v_old_evidence text := 'evidence=jsonb_build_object(''last_successful_recovery_drill'',v_last_recovery)::text';
  v_new_evidence text := 'evidence=case when v_last_recovery is not null then jsonb_build_object(''last_qualifying_database_restore'',v_last_recovery)::text else null end';
begin
  select pg_get_functiondef('private.platform_refresh_automated_release_checks()'::regprocedure)
  into v_definition;
  if v_definition is null
     or length(v_definition)-length(replace(v_definition,v_old_query,''))<>length(v_old_query)
     or length(v_definition)-length(replace(v_definition,v_old_status,''))<>length(v_old_status)
     or length(v_definition)-length(replace(v_definition,v_old_evidence,''))<>length(v_old_evidence)
  then
    raise exception 'Recovery gate function has drifted: review implementation before updating';
  end if;
  v_definition:=replace(v_definition,v_old_query,v_new_query);
  v_definition:=replace(v_definition,v_old_status,v_new_status);
  v_definition:=replace(v_definition,v_old_evidence,v_new_evidence);
  execute v_definition;
end;
$migration$;

-- Keep the existing SECURITY DEFINER implementation in the unexposed schema,
-- and the public wrapper SECURITY INVOKER. No new public privileges.
revoke all on function private.platform_refresh_automated_release_checks()
  from public,anon,authenticated;
grant execute on function private.platform_refresh_automated_release_checks()
  to authenticated;

-- Correct the pre-existing false-positive gate immediately; do not wait for a
-- signed-in administrator to click Refresh. Non-qualifying config drill stays
-- in historical evidence but does not meet this release gate.
with qualified as (
  select completed_at
  from public.platform_recovery_drills
  where status='passed'
    and drill_type in ('database_restore','full_recovery')
    and lower(btrim(environment)) in ('non-production','staging','uat','isolated-restore')
    and completed_at is not null and completed_at > started_at
    and nullif(btrim(coalesce(recovery_point,'')),'') is not null
    and nullif(btrim(coalesce(evidence_reference,'')),'') is not null
  order by completed_at desc limit 1
)
update public.platform_release_checklist as gate
set status=case when (select completed_at from qualified) is not null then 'pass' else 'pending' end,
    evidence=case when (select completed_at from qualified) is not null
      then jsonb_build_object('last_qualifying_database_restore',(select completed_at from qualified))::text
      else null end,
    notes='Require real non-production database_restore/full_recovery with recovery point, start/end timestamps and evidence; configuration_only is not sufficient.'
where gate.check_key='recovery_drill';

commit;
