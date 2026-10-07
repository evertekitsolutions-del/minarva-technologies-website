-- Platform release-control integrity hardening.
-- Prevent direct table writes from bypassing evidence-backed release/UAT gates.

revoke insert, update, delete, truncate, references, trigger
on table public.platform_release_checklist from authenticated;

drop policy if exists "active_admin_manage_platform_release_checklist"
on public.platform_release_checklist;

drop policy if exists "active_admin_read_platform_release_checklist"
on public.platform_release_checklist;
create policy "active_admin_read_platform_release_checklist"
on public.platform_release_checklist
for select to authenticated
using ((select private.is_active_admin()));

create or replace function public.platform_update_manual_release_check(
  p_check_key text,
  p_status text,
  p_evidence text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_check public.platform_release_checklist%rowtype;
  v_evidence text:=nullif(btrim(coalesce(p_evidence,'')),'');
  v_uat_key boolean;
  v_security_warning boolean;
  v_all_other_pass boolean;
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

  v_uat_key:=p_check_key like 'uat_%' or p_check_key='responsive';
  if v_uat_key then
    raise exception 'UAT and responsive gates must be updated through evidence-backed UAT steps';
  end if;

  if p_status in ('pass','waived','not_applicable') and v_evidence is null then
    raise exception 'Passing or waiving a release check requires evidence';
  end if;

  if p_check_key='security_leaked_passwords' and p_status='pass' then
    select exists(
      select 1 from public.platform_release_checklist
      where check_key='security_leaked_passwords'
        and status='pass'
        and evidence is not null
    ) into v_security_warning;
    -- This gate is external Auth configuration. It must not be self-certified
    -- through this generic manual RPC.
    raise exception 'Leaked-password protection PASS must come from verified Auth/Security Advisor evidence';
  end if;

  if p_check_key='release_freeze' and p_status='pass' then
    select not exists(
      select 1 from public.platform_release_checklist
      where blocking=true and check_key<>'release_freeze' and status<>'pass'
    ) into v_all_other_pass;
    if not v_all_other_pass then
      raise exception 'Release freeze cannot pass while another blocking gate is unresolved';
    end if;
  end if;

  update public.platform_release_checklist
  set status=p_status,
      evidence=case when p_status='pending' then null else v_evidence end,
      notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),
      updated_by=auth.uid()
  where check_key=p_check_key
  returning * into v_check;

  return jsonb_build_object('check_key',v_check.check_key,'status',v_check.status,'evidence',v_check.evidence);
end;
$$;

revoke all on function public.platform_update_manual_release_check(text,text,text,text)
from public,anon,authenticated;
grant execute on function public.platform_update_manual_release_check(text,text,text,text)
to authenticated;

create or replace function public.platform_verify_leaked_password_gate(
  p_advisor_clear boolean,
  p_evidence text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_evidence text:=nullif(btrim(coalesce(p_evidence,'')),'');
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to verify security gate' using errcode='42501';
  end if;
  if v_evidence is null then raise exception 'Security Advisor evidence is required'; end if;

  update public.platform_release_checklist
  set status=case when p_advisor_clear then 'pass' else 'pending' end,
      evidence=v_evidence,
      updated_by=auth.uid()
  where check_key='security_leaked_passwords';

  return jsonb_build_object('check_key','security_leaked_passwords','status',case when p_advisor_clear then 'pass' else 'pending' end);
end;
$$;

revoke all on function public.platform_verify_leaked_password_gate(boolean,text)
from public,anon,authenticated;
grant execute on function public.platform_verify_leaked_password_gate(boolean,text)
to authenticated;
