-- 2026-10-14: Align Platform Health with the database-restore release gate.
-- A successful configuration-only drill must not make the dashboard VERIFIED.
-- Preserve all records and existing active-admin RPC controls.
begin;
do $patch$
declare
  v_source text;
  v_old_var text := '  v_last_recovery timestamptz;';
  v_new_var text := $new$
  v_last_recovery timestamptz;
  v_last_configuration_recovery timestamptz;$new$;
  v_old_query text := $old$
  select max(completed_at) into v_last_recovery
  from public.platform_recovery_drills
  where status='passed';$old$;
  v_new_query text := $new$
  select
    max(completed_at) filter (
      where drill_type in ('database_restore','full_recovery')
        and lower(btrim(environment)) in ('non-production','staging','uat','isolated-restore')
        and completed_at is not null and completed_at > started_at
        and nullif(btrim(coalesce(recovery_point,'')),'') is not null
        and nullif(btrim(coalesce(evidence_reference,'')),'') is not null
    ),
    max(completed_at) filter (where drill_type='configuration_restore')
  into v_last_recovery,v_last_configuration_recovery
  from public.platform_recovery_drills
  where status='passed';$new$;
  v_old_result text := $old$
    'recovery',jsonb_build_object(
      'last_successful_drill_at',v_last_recovery,
      'verified',v_last_recovery is not null
    ),$old$;
  v_new_result text := $new$
    'recovery',jsonb_build_object(
      'last_successful_drill_at',v_last_recovery,
      'last_configuration_drill_at',v_last_configuration_recovery,
      'verification_scope','non_production_database_or_full_restore_record',
      'verified',v_last_recovery is not null
    ),$new$;
begin
  select pg_get_functiondef('public.platform_health_readiness()'::regprocedure)
  into v_source;
  if v_source is null
    or length(v_source)-length(replace(v_source,v_old_var,''))<>length(v_old_var)
    or length(v_source)-length(replace(v_source,v_old_query,''))<>length(v_old_query)
    or length(v_source)-length(replace(v_source,v_old_result,''))<>length(v_old_result)
  then
    raise exception 'Health function has drifted: manual review required';
  end if;
  v_source:=replace(v_source,v_old_var,v_new_var);
  v_source:=replace(v_source,v_old_query,v_new_query);
  v_source:=replace(v_source,v_old_result,v_new_result);
  execute v_source;
end;
$patch$;
-- Maintain authenticated-only SECURITY INVOKER public API boundary.
revoke all on function public.platform_health_readiness() from public,anon,authenticated;
grant execute on function public.platform_health_readiness() to authenticated;
commit;
