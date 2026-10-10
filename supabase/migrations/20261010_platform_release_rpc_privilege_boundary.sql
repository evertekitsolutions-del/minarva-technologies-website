-- Release-control API privilege boundary, October 2026.
-- Keep exposed RPCs SECURITY INVOKER; all writes flow through private
-- SECURITY DEFINER implementations which enforce private.is_active_admin().
-- No new records, approvals, credentials or telephony settings are created.

begin;

-- A caller-supplied advisor boolean was not trustworthy evidence. Remove it.
revoke all on function public.platform_verify_leaked_password_gate(boolean,text)
  from public, anon, authenticated;
drop function public.platform_verify_leaked_password_gate(boolean,text);

-- Preserve the existing audited business logic exactly for the three RPCs.
-- The existing public definitions are cloned to an unexposed private schema.
do $clone$
declare
  v_name text;
  v_oid oid;
  v_def text;
begin
  foreach v_name in array array[
    'platform_create_uat_run',
    'platform_update_uat_step',
    'platform_refresh_automated_release_checks'
  ] loop
    select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name;
    if v_oid is null then
      raise exception 'Required release function missing: %',v_name;
    end if;
    v_def:=pg_get_functiondef(v_oid);
    v_def:=replace(v_def,'FUNCTION public.'||v_name||'(','FUNCTION private.'||v_name||'(');
    v_def:=replace(v_def,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
    execute v_def;
  end loop;
end;
$clone$;

-- A dedicated implementation is necessary because this function must never
-- allow a signed-in user to certify or waive an external Supabase Auth finding.
create or replace function private.platform_update_manual_release_check(
  p_check_key text, p_status text, p_evidence text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  v_check public.platform_release_checklist%rowtype;
  v_evidence text:=nullif(btrim(coalesce(p_evidence,'')),'');
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to update release checks' using errcode='42501';
  end if;
  if p_status not in ('pending','pass','fail','waived','not_applicable') then
    raise exception 'Invalid release-check status';
  end if;
  select * into v_check from public.platform_release_checklist where check_key=p_check_key;
  if not found then raise exception 'Release check not found'; end if;
  if v_check.automated then raise exception 'Automated release checks cannot be manually changed'; end if;
  if p_check_key like 'uat_%' or p_check_key='responsive' then
    raise exception 'UAT and responsive gates must be updated through evidence-backed UAT steps';
  end if;
  if p_check_key='security_leaked_passwords'
      and p_status in ('pass','waived','not_applicable') then
    raise exception 'External leaked-password gate cannot be self-certified or waived';
  end if;
  if p_status in ('pass','waived','not_applicable') and v_evidence is null then
    raise exception 'Passing or waiving a release check requires evidence';
  end if;
  if p_check_key='release_freeze' and p_status='pass' and exists (
    select 1 from public.platform_release_checklist
    where blocking=true and check_key<>'release_freeze' and status<>'pass'
  ) then
    raise exception 'Release freeze cannot pass while another blocking gate is unresolved';
  end if;
  update public.platform_release_checklist
    set status=p_status,
        evidence=case when p_status='pending' then null else v_evidence end,
        notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),
        updated_by=auth.uid()
    where check_key=p_check_key returning * into v_check;
  return jsonb_build_object('check_key',v_check.check_key,'status',v_check.status,'evidence',v_check.evidence);
end;
$fn$;

-- Remove public SECURITY DEFINER exposure. External RPC signatures stay stable.
create or replace function public.platform_update_manual_release_check(
  p_check_key text,p_status text,p_evidence text default null,p_notes text default null
) returns jsonb language sql security invoker set search_path='' as $fn$
  select private.platform_update_manual_release_check(p_check_key,p_status,p_evidence,p_notes);
$fn$;

create or replace function public.platform_update_uat_step(
  p_step_id uuid,p_status text,p_evidence text default null,p_notes text default null
) returns jsonb language sql security invoker set search_path='' as $fn$
  select private.platform_update_uat_step(p_step_id,p_status,p_evidence,p_notes);
$fn$;

create or replace function public.platform_create_uat_run(
  p_name text default 'Production Release UAT',
  p_environment text default 'production-like'
) returns uuid language sql security invoker set search_path='' as $fn$
  select private.platform_create_uat_run(p_name,p_environment);
$fn$;

create or replace function public.platform_refresh_automated_release_checks()
returns jsonb language sql security invoker set search_path='' as $fn$
  select private.platform_refresh_automated_release_checks();
$fn$;

-- Deny direct UAT tampering; preserve active-admin read access.
revoke insert,update,delete,truncate,references,trigger
  on table public.platform_uat_runs,public.platform_uat_steps from authenticated;

drop policy if exists "active_admin_manage_platform_uat_runs" on public.platform_uat_runs;
drop policy if exists "active_admin_manage_platform_uat_steps" on public.platform_uat_steps;
drop policy if exists "active_admin_read_platform_uat_runs" on public.platform_uat_runs;
drop policy if exists "active_admin_read_platform_uat_steps" on public.platform_uat_steps;

create policy "active_admin_read_platform_uat_runs" on public.platform_uat_runs
  for select to authenticated using ((select private.is_active_admin()));
create policy "active_admin_read_platform_uat_steps" on public.platform_uat_steps
  for select to authenticated using ((select private.is_active_admin()));

-- Explicitly lock down all private worker defaults and exposed wrappers.
revoke all on function private.platform_create_uat_run(text,text),
  private.platform_update_uat_step(uuid,text,text,text),
  private.platform_refresh_automated_release_checks(),
  private.platform_update_manual_release_check(text,text,text,text)
  from public,anon,authenticated;
grant execute on function private.platform_create_uat_run(text,text),
  private.platform_update_uat_step(uuid,text,text,text),
  private.platform_refresh_automated_release_checks(),
  private.platform_update_manual_release_check(text,text,text,text)
  to authenticated;

revoke all on function public.platform_create_uat_run(text,text),
  public.platform_update_uat_step(uuid,text,text,text),
  public.platform_refresh_automated_release_checks(),
  public.platform_update_manual_release_check(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.platform_create_uat_run(text,text),
  public.platform_update_uat_step(uuid,text,text,text),
  public.platform_refresh_automated_release_checks(),
  public.platform_update_manual_release_check(text,text,text,text)
  to authenticated;

-- Keep externally reported warning pending: an admin-supplied claim is not evidence.
update public.platform_release_checklist
set status='pending',evidence=null,notes='Supabase Security Advisor leaked-password warning remains unresolved'
where check_key='security_leaked_passwords' and status<>'pending';

commit;
