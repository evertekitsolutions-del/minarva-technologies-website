-- Platform 4A2B: make UAT evidence enforceable and synchronize real UAT outcomes to release gates.

create or replace function public.platform_update_uat_step(
  p_step_id uuid,
  p_status text,
  p_evidence text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_step public.platform_uat_steps%rowtype;
  v_run public.platform_uat_runs%rowtype;
  v_blocking_fail integer;
  v_pending integer;
  v_check_key text;
  v_evidence text;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to update UAT steps' using errcode='42501';
  end if;
  if p_status not in ('pending','pass','fail','blocked','not_applicable') then
    raise exception 'Invalid UAT status';
  end if;

  v_evidence:=nullif(btrim(coalesce(p_evidence,'')),'');
  if p_status='pass' and v_evidence is null then
    raise exception 'Passing a UAT step requires real evidence';
  end if;

  update public.platform_uat_steps
  set
    status=p_status,
    evidence=v_evidence,
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    tested_by=auth.uid(),
    tested_at=case when p_status='pending' then null else now() end
  where id=p_step_id
  returning * into v_step;

  if not found then raise exception 'UAT step not found'; end if;

  v_check_key:=case v_step.step_key
    when 'enquiry_customer' then 'uat_enquiry_customer'
    when 'quotation_invoice' then 'uat_quote_invoice'
    when 'invoice_payment' then 'uat_payment'
    when 'service_job_sheet' then 'uat_service_job'
    when 'technician_pwa' then 'uat_technician'
    when 'customer_care' then 'uat_customer_care'
    when 'ai_voice' then 'uat_ai_voice'
    when 'calling_readiness' then 'uat_calling_readiness'
    when 'responsive_mobile' then 'responsive'
    else null
  end;

  if v_check_key is not null then
    update public.platform_release_checklist
    set
      status=case p_status
        when 'pass' then 'pass'
        when 'fail' then 'fail'
        when 'blocked' then 'fail'
        when 'not_applicable' then 'not_applicable'
        else 'pending'
      end,
      evidence=case
        when p_status='pending' then null
        else concat('UAT run ',v_step.run_id,': ',coalesce(v_evidence,'No evidence supplied; non-pass outcome'))
      end,
      notes=case
        when p_status='blocked' then coalesce(nullif(btrim(coalesce(p_notes,'')),''),'UAT step blocked')
        else notes
      end,
      updated_by=auth.uid()
    where check_key=v_check_key and automated=false;
  end if;

  select
    count(*) filter(where blocking=true and status in ('fail','blocked')),
    count(*) filter(where blocking=true and status in ('pending','not_applicable'))
  into v_blocking_fail,v_pending
  from public.platform_uat_steps
  where run_id=v_step.run_id;

  update public.platform_uat_runs
  set
    status=case
      when v_blocking_fail>0 then 'failed'
      when v_pending=0 then 'passed'
      else 'running'
    end,
    completed_at=case
      when v_blocking_fail>0 or v_pending=0 then now()
      else null
    end,
    evidence_reference=case
      when v_blocking_fail=0 and v_pending=0 then concat('Per-step evidence recorded for UAT run ',v_step.run_id)
      else evidence_reference
    end
  where id=v_step.run_id
  returning * into v_run;

  return jsonb_build_object(
    'step_id',v_step.id,
    'step_status',v_step.status,
    'release_check_key',v_check_key,
    'run_id',v_run.id,
    'run_status',v_run.status
  );
end;
$$;

revoke all on function public.platform_update_uat_step(uuid,text,text,text)
from public,anon,authenticated;
grant execute on function public.platform_update_uat_step(uuid,text,text,text)
to authenticated;
