-- Atomic and repeat-safe conversion of a planned AMC visit into a Service Job.
-- The public endpoints are SECURITY INVOKER wrappers; private implementation
-- enforces active administrator access and locks the visit row.
begin;
create or replace function private.create_maintenance_service_job_impl(
 p_visit_id uuid,p_scheduled_at timestamptz,p_technician_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_visit public.service_maintenance_visits%rowtype;
 v_contract public.service_maintenance_contracts%rowtype;
 v_job jsonb;
begin
 if not private.is_active_admin() then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 select * into v_visit from public.service_maintenance_visits
  where id=p_visit_id for update;
 if not found then raise exception 'Unknown scheduled maintenance visit'; end if;
 if v_visit.service_job_id is not null then
   return jsonb_build_object('id',v_visit.service_job_id,
    'already_created',true,'contract_id',v_visit.contract_id);
 end if;
 if v_visit.skipped_at is not null then
   raise exception 'Skipped visits cannot create service jobs';
 end if;
 select * into v_contract from public.service_maintenance_contracts
  where id=v_visit.contract_id;
 if not found or not v_contract.active or
    v_contract.contract_type not in ('amc','combined') then
   raise exception 'A current, active AMC contract is required';
 end if;
 v_job:=public.create_service_job(
  p_customer_id=>v_contract.customer_id,
  p_service_category=>v_contract.service_category,
  p_site_address=>v_contract.site_address,
  p_equipment_details=>v_contract.equipment_details,
  p_complaint=>'Planned preventive maintenance due '||v_visit.due_on::text,
  p_requested_work=>'AMC preventive inspection and maintenance',
  p_priority=>'normal',
  p_assigned_technician_id=>coalesce(p_technician_id,v_contract.assigned_technician_id),
  p_scheduled_at=>p_scheduled_at,
  p_internal_notes=>'Generated from service contract '||v_contract.contract_number
    ||'; maintenance due '||v_visit.due_on::text
 );
 update public.service_jobs set
   amc_reference=v_contract.contract_number,
   warranty_reference=case when v_contract.warranty_ends_on is not null
     then v_contract.contract_number else null end
 where id=(v_job->>'id')::uuid;
 update public.service_maintenance_visits
   set service_job_id=(v_job->>'id')::uuid
 where id=p_visit_id and service_job_id is null;
 if not found then raise exception 'Maintenance link was not saved'; end if;
 return v_job||jsonb_build_object('already_created',false,
   'contract_id',v_contract.id,'visit_id',v_visit.id);
end;
$$;
revoke all on function private.create_maintenance_service_job_impl(uuid,timestamptz,uuid)
 from public,anon,authenticated;
grant execute on function private.create_maintenance_service_job_impl(uuid,timestamptz,uuid)
 to authenticated;

create or replace function public.create_maintenance_service_job(
 p_visit_id uuid,
 p_scheduled_at timestamptz default null,
 p_technician_id uuid default null
)
returns jsonb language sql security invoker set search_path='' as $$
 select private.create_maintenance_service_job_impl(
  p_visit_id,p_scheduled_at,p_technician_id
 );
$$;
revoke all on function public.create_maintenance_service_job(uuid,timestamptz,uuid)
 from public,anon,authenticated;
grant execute on function public.create_maintenance_service_job(uuid,timestamptz,uuid)
 to authenticated;

create or replace function private.skip_maintenance_visit_impl(
 p_visit_id uuid,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.service_maintenance_visits%rowtype;
begin
 if not private.is_active_admin() then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 5 and 500 then
   raise exception 'Provide a skip reason (5-500 characters)';
 end if;
 select * into v from public.service_maintenance_visits
   where id=p_visit_id for update;
 if not found then raise exception 'Unknown maintenance visit'; end if;
 if v.service_job_id is not null then
   raise exception 'Linked maintenance visits cannot be skipped';
 end if;
 if v.skipped_at is not null then
   return jsonb_build_object('ok',true,'already_skipped',true);
 end if;
 update public.service_maintenance_visits
 set skipped_at=now(),skip_reason=btrim(p_reason)
 where id=p_visit_id;
 return jsonb_build_object('ok',true,'already_skipped',false);
end;
$$;
revoke all on function private.skip_maintenance_visit_impl(uuid,text)
 from public,anon,authenticated;
grant execute on function private.skip_maintenance_visit_impl(uuid,text)
 to authenticated;

create or replace function public.skip_maintenance_visit(
 p_visit_id uuid,p_reason text
)
returns jsonb language sql security invoker set search_path='' as $$
 select private.skip_maintenance_visit_impl(p_visit_id,p_reason);
$$;
revoke all on function public.skip_maintenance_visit(uuid,text)
 from public,anon,authenticated;
grant execute on function public.skip_maintenance_visit(uuid,text)
 to authenticated;
commit;
