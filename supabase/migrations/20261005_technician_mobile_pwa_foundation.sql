-- Operations — Milestone 3A3
-- Technician mobile/PWA access control, idempotent weak-network actions,
-- notification hooks and schedule-feed foundation.

alter table public.technicians
  add column if not exists mobile_access_enabled boolean not null default true,
  add column if not exists last_mobile_seen_at timestamptz;

alter table public.service_jobs
  add column if not exists technician_eta_at timestamptz,
  add column if not exists technician_eta_note text;

create index if not exists technicians_auth_mobile_idx
  on public.technicians(auth_user_id,active,mobile_access_enabled)
  where auth_user_id is not null;

create index if not exists service_jobs_technician_schedule_idx
  on public.service_jobs(assigned_technician_id,scheduled_at,status)
  where assigned_technician_id is not null;

create table if not exists public.technician_mobile_actions (
  id uuid primary key,
  technician_id uuid not null references public.technicians(id) on delete restrict,
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  action_type text not null
    check (action_type in (
      'visit_start','arrival','work_start','work_complete',
      'save_execution','replace_materials','set_eta',
      'register_attachment','complete_job'
    )),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists technician_mobile_actions_technician_created_idx
  on public.technician_mobile_actions(technician_id,created_at desc);
create index if not exists technician_mobile_actions_job_created_idx
  on public.technician_mobile_actions(service_job_id,created_at desc);
create index if not exists technician_mobile_actions_created_by_idx
  on public.technician_mobile_actions(created_by);

create table if not exists public.service_job_notification_outbox (
  id bigint generated always as identity primary key,
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_action_id uuid references public.technician_mobile_actions(id) on delete set null,
  event_type text not null
    check (event_type in ('technician_eta','visit_started','arrived','work_started','work_completed','job_completed')),
  channel text not null
    check (channel in ('whatsapp','sms','email','call')),
  language text not null default 'ml',
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','suppressed','sent','failed')),
  suppression_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(source_action_id,event_type)
);

create index if not exists service_job_notification_outbox_status_created_idx
  on public.service_job_notification_outbox(status,created_at);
create index if not exists service_job_notification_outbox_job_idx
  on public.service_job_notification_outbox(service_job_id,created_at desc);
create index if not exists service_job_notification_outbox_customer_idx
  on public.service_job_notification_outbox(customer_id,created_at desc);

alter table public.technician_mobile_actions enable row level security;
alter table public.service_job_notification_outbox enable row level security;

revoke all on public.technician_mobile_actions from anon;
revoke all on public.service_job_notification_outbox from anon;
grant select on public.technician_mobile_actions to authenticated;
grant select,insert,update,delete on public.service_job_notification_outbox to authenticated;
grant usage,select on sequence public.service_job_notification_outbox_id_seq to authenticated;

create or replace function private.current_technician_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select t.id
  from public.technicians t
  where t.auth_user_id=(select auth.uid())
    and t.active=true
    and t.mobile_access_enabled=true
  limit 1;
$$;

revoke all on function private.current_technician_id() from public,anon;
grant execute on function private.current_technician_id() to authenticated;

create or replace function private.is_current_technician_for_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.service_jobs j
    where j.id=p_job_id
      and j.assigned_technician_id=private.current_technician_id()
  );
$$;

revoke all on function private.is_current_technician_for_job(uuid) from public,anon;
grant execute on function private.is_current_technician_for_job(uuid) to authenticated;

drop policy if exists "technician_select_self" on public.technicians;
create policy "technician_select_self"
  on public.technicians for select to authenticated
  using (
    auth_user_id=(select auth.uid())
    and active=true
    and mobile_access_enabled=true
  );

drop policy if exists "technician_select_assigned_jobs" on public.service_jobs;
create policy "technician_select_assigned_jobs"
  on public.service_jobs for select to authenticated
  using (
    assigned_technician_id=(select private.current_technician_id())
  );

drop policy if exists "technician_select_assigned_materials" on public.service_job_materials;
create policy "technician_select_assigned_materials"
  on public.service_job_materials for select to authenticated
  using (
    private.is_current_technician_for_job(service_job_id)
  );

drop policy if exists "technician_select_assigned_attachments" on public.service_job_attachments;
create policy "technician_select_assigned_attachments"
  on public.service_job_attachments for select to authenticated
  using (
    private.is_current_technician_for_job(service_job_id)
  );

drop policy if exists "technician_select_assigned_events" on public.service_job_events;
create policy "technician_select_assigned_events"
  on public.service_job_events for select to authenticated
  using (
    private.is_current_technician_for_job(service_job_id)
  );

drop policy if exists "technician_select_own_mobile_actions" on public.technician_mobile_actions;
create policy "technician_select_own_mobile_actions"
  on public.technician_mobile_actions for select to authenticated
  using (
    technician_id=(select private.current_technician_id())
  );

drop policy if exists "active_admin_manage_technician_mobile_actions" on public.technician_mobile_actions;
create policy "active_admin_manage_technician_mobile_actions"
  on public.technician_mobile_actions for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_service_job_notification_outbox" on public.service_job_notification_outbox;
create policy "active_admin_manage_service_job_notification_outbox"
  on public.service_job_notification_outbox for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

create or replace function private.queue_service_job_notification(
  p_job_id uuid,
  p_event_type text,
  p_source_action_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_customer public.customers%rowtype;
  v_channel text;
  v_recipient text;
  v_status text:='pending';
  v_reason text;
begin
  select c.*
  into v_customer
  from public.service_jobs j
  join public.customers c on c.id=j.customer_id
  where j.id=p_job_id;

  if not found then return; end if;

  v_channel:=lower(coalesce(nullif(btrim(v_customer.preferred_contact_channel),''),'whatsapp'));
  if v_channel not in ('whatsapp','sms','email','call') then v_channel:='whatsapp'; end if;

  if v_channel='email' then
    v_recipient:=nullif(btrim(coalesce(v_customer.email,'')),'');
    if v_recipient is null then v_status:='suppressed';v_reason:='Customer email is missing'; end if;
  else
    v_recipient:=nullif(btrim(coalesce(v_customer.phone,'')),'');
    if v_recipient is null then v_status:='suppressed';v_reason:='Customer phone is missing'; end if;
  end if;

  if v_channel='call' and v_status='pending' then
    if v_customer.call_consent<>true then
      v_status:='suppressed';v_reason:='Call consent is not recorded';
    elsif v_customer.do_not_call=true then
      v_status:='suppressed';v_reason:='Customer is marked Do Not Call';
    end if;
  end if;

  insert into public.service_job_notification_outbox(
    service_job_id,customer_id,source_action_id,event_type,channel,language,
    recipient,payload,status,suppression_reason
  )
  values(
    p_job_id,v_customer.id,p_source_action_id,p_event_type,v_channel,
    coalesce(nullif(btrim(v_customer.preferred_language),''),'ml'),
    v_recipient,coalesce(p_payload,'{}'::jsonb),v_status,v_reason
  )
  on conflict(source_action_id,event_type) do nothing;
end;
$$;

revoke all on function private.queue_service_job_notification(uuid,text,uuid,jsonb)
  from public,anon,authenticated;

create or replace function public.technician_claim_profile()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_existing public.technicians%rowtype;
  v_match_count integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select lower(btrim(coalesce(u.email,'')))
  into v_email
  from auth.users u
  where u.id=v_uid;

  if coalesce(v_email,'')='' then
    raise exception 'Your authenticated account has no email address';
  end if;

  select * into v_existing
  from public.technicians t
  where t.auth_user_id=v_uid
  limit 1;

  if found then
    if v_existing.active<>true or v_existing.mobile_access_enabled<>true then
      raise exception 'Technician mobile access is disabled';
    end if;
    update public.technicians set last_mobile_seen_at=now() where id=v_existing.id;
    return jsonb_build_object(
      'id',v_existing.id,'name',v_existing.name,'email',v_existing.email,'phone',v_existing.phone
    );
  end if;

  select count(*) into v_match_count
  from public.technicians t
  where t.active=true
    and t.mobile_access_enabled=true
    and t.auth_user_id is null
    and lower(btrim(coalesce(t.email,'')))=v_email;

  if v_match_count=0 then
    raise exception 'No approved technician record matches this email. Ask the administrator to add the same email to Technician Master';
  elsif v_match_count>1 then
    raise exception 'Multiple technician records match this email. Ask the administrator to resolve the duplicate';
  end if;

  update public.technicians
  set auth_user_id=v_uid,last_mobile_seen_at=now()
  where active=true
    and mobile_access_enabled=true
    and auth_user_id is null
    and lower(btrim(coalesce(email,'')))=v_email
  returning * into v_existing;

  return jsonb_build_object(
    'id',v_existing.id,'name',v_existing.name,'email',v_existing.email,'phone',v_existing.phone
  );
end;
$$;

revoke all on function public.technician_claim_profile() from public,anon,authenticated;
grant execute on function public.technician_claim_profile() to authenticated;

create or replace function public.technician_get_profile()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tech public.technicians%rowtype;
begin
  select * into v_tech
  from public.technicians t
  where t.id=private.current_technician_id();

  if not found then raise exception 'Technician mobile access is not linked to this account' using errcode='42501'; end if;

  update public.technicians set last_mobile_seen_at=now() where id=v_tech.id;

  return jsonb_build_object(
    'id',v_tech.id,
    'name',v_tech.name,
    'phone',v_tech.phone,
    'email',v_tech.email,
    'mobile_access_enabled',v_tech.mobile_access_enabled
  );
end;
$$;

revoke all on function public.technician_get_profile() from public,anon,authenticated;
grant execute on function public.technician_get_profile() to authenticated;

create or replace function public.technician_get_queue()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tech_id uuid:=private.current_technician_id();
  v_result jsonb;
begin
  if v_tech_id is null then raise exception 'Technician mobile access is not linked to this account' using errcode='42501'; end if;

  update public.technicians set last_mobile_seen_at=now() where id=v_tech_id;

  select coalesce(jsonb_agg(row_data order by
    case row_data->>'queue_group' when 'overdue' then 1 when 'today' then 2 when 'upcoming' then 3 else 4 end,
    coalesce((row_data->>'scheduled_at')::timestamptz,'infinity'::timestamptz)
  ),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',j.id,
      'job_number',j.job_number,
      'service_category',j.service_category,
      'site_address',j.site_address,
      'equipment_details',j.equipment_details,
      'complaint',j.complaint,
      'priority',j.priority,
      'status',j.status,
      'scheduled_at',j.scheduled_at,
      'follow_up_at',j.follow_up_at,
      'technician_eta_at',j.technician_eta_at,
      'technician_eta_note',j.technician_eta_note,
      'visit_started_at',j.visit_started_at,
      'arrived_at',j.arrived_at,
      'work_started_at',j.work_started_at,
      'work_completed_at',j.work_completed_at,
      'resolution_status',j.resolution_status,
      'callback_required',j.callback_required,
      'callback_at',j.callback_at,
      'customer',jsonb_build_object(
        'name',c.name,
        'phone',c.phone
      ),
      'queue_group',case
        when j.status in ('completed','cancelled') then 'closed'
        when j.scheduled_at is not null and j.scheduled_at<now() then 'overdue'
        when j.scheduled_at is not null and j.scheduled_at::date=current_date then 'today'
        when j.scheduled_at is not null and j.scheduled_at::date>current_date then 'upcoming'
        else 'open'
      end
    ) as row_data
    from public.service_jobs j
    join public.customers c on c.id=j.customer_id
    where j.assigned_technician_id=v_tech_id
      and j.status<>'cancelled'
      and (
        j.status<>'completed'
        or j.completed_at>=now()-interval '7 days'
      )
  ) s;

  return v_result;
end;
$$;

revoke all on function public.technician_get_queue() from public,anon,authenticated;
grant execute on function public.technician_get_queue() to authenticated;

create or replace function public.technician_get_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tech_id uuid:=private.current_technician_id();
  v_result jsonb;
begin
  if v_tech_id is null then raise exception 'Technician mobile access is not linked to this account' using errcode='42501'; end if;

  select jsonb_build_object(
    'id',j.id,
    'job_number',j.job_number,
    'service_category',j.service_category,
    'site_address',j.site_address,
    'equipment_details',j.equipment_details,
    'complaint',j.complaint,
    'requested_work',j.requested_work,
    'priority',j.priority,
    'status',j.status,
    'scheduled_at',j.scheduled_at,
    'follow_up_at',j.follow_up_at,
    'technician_eta_at',j.technician_eta_at,
    'technician_eta_note',j.technician_eta_note,
    'visit_started_at',j.visit_started_at,
    'arrived_at',j.arrived_at,
    'work_started_at',j.work_started_at,
    'work_completed_at',j.work_completed_at,
    'diagnosis',j.diagnosis,
    'work_performed',j.work_performed,
    'resolution_status',j.resolution_status,
    'unresolved_reason',j.unresolved_reason,
    'next_visit_at',j.next_visit_at,
    'callback_required',j.callback_required,
    'callback_at',j.callback_at,
    'completion_checklist',j.completion_checklist,
    'warranty_reference',j.warranty_reference,
    'amc_reference',j.amc_reference,
    'customer_acknowledged_by',j.customer_acknowledged_by,
    'customer_acknowledgement',j.customer_acknowledgement,
    'customer_acknowledged_at',j.customer_acknowledged_at,
    'billing_prepared',j.billing_quotation_id is not null,
    'customer',jsonb_build_object(
      'name',c.name,
      'phone',c.phone,
      'email',c.email
    ),
    'materials',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'line_no',m.line_no,'description',m.description,
        'quantity',m.quantity,'unit',m.unit,'unit_price',m.unit_price,'line_total',m.line_total,'notes',m.notes
      ) order by m.line_no)
      from public.service_job_materials m
      where m.service_job_id=j.id
    ),'[]'::jsonb),
    'attachments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'attachment_type',a.attachment_type,'storage_path',a.storage_path,
        'original_name',a.original_name,'mime_type',a.mime_type,'size_bytes',a.size_bytes,'created_at',a.created_at
      ) order by a.created_at desc)
      from public.service_job_attachments a
      where a.service_job_id=j.id
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(x.obj order by x.created_at desc)
      from (
        select e.created_at,
          jsonb_build_object(
            'id',e.id,'event_type',e.event_type,'from_status',e.from_status,
            'to_status',e.to_status,'note',e.note,'created_at',e.created_at
          ) as obj
        from public.service_job_events e
        where e.service_job_id=j.id
        order by e.created_at desc
        limit 50
      ) x
    ),'[]'::jsonb)
  )
  into v_result
  from public.service_jobs j
  join public.customers c on c.id=j.customer_id
  where j.id=p_job_id
    and j.assigned_technician_id=v_tech_id;

  if v_result is null then raise exception 'Assigned service job not found' using errcode='42501'; end if;

  return v_result;
end;
$$;

revoke all on function public.technician_get_job(uuid) from public,anon,authenticated;
grant execute on function public.technician_get_job(uuid) to authenticated;

create or replace function public.technician_apply_mobile_action(
  p_client_action_id uuid,
  p_service_job_id uuid,
  p_action_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_tech_id uuid:=private.current_technician_id();
  v_job public.service_jobs%rowtype;
  v_action_type text:=lower(btrim(coalesce(p_action_type,'')));
  v_existing public.technician_mobile_actions%rowtype;
  v_result jsonb;
  v_now timestamptz:=now();
  v_resolution text;
  v_eta timestamptz;
  v_material jsonb;
  v_line integer:=0;
  v_desc text;
  v_qty numeric;
  v_unit text;
  v_price numeric;
  v_path text;
  v_attachment_type text;
  v_mime text;
  v_size bigint;
begin
  if v_uid is null or v_tech_id is null then
    raise exception 'Technician mobile access is not linked to this account' using errcode='42501';
  end if;

  if p_client_action_id is null then raise exception 'Client action ID is required'; end if;

  select * into v_existing
  from public.technician_mobile_actions a
  where a.id=p_client_action_id;

  if found then
    if v_existing.technician_id<>v_tech_id
       or v_existing.service_job_id<>p_service_job_id
       or v_existing.action_type<>v_action_type then
      raise exception 'Client action ID is already used for a different operation';
    end if;
    return coalesce(v_existing.result,jsonb_build_object('idempotent',true,'pending',true));
  end if;

  select * into v_job
  from public.service_jobs j
  where j.id=p_service_job_id
    and j.assigned_technician_id=v_tech_id
  for update;

  if not found then raise exception 'Assigned service job not found' using errcode='42501'; end if;
  if v_job.status='cancelled' then raise exception 'Cancelled jobs cannot be updated'; end if;
  if v_job.billing_quotation_id is not null and v_action_type in ('save_execution','replace_materials','complete_job') then
    raise exception 'Execution details are locked after billing preparation';
  end if;

  insert into public.technician_mobile_actions(
    id,technician_id,service_job_id,action_type,payload,created_by
  )
  values(
    p_client_action_id,v_tech_id,p_service_job_id,v_action_type,coalesce(p_payload,'{}'::jsonb),v_uid
  );

  if v_action_type='visit_start' then
    if v_job.visit_started_at is null then
      update public.service_jobs
      set visit_started_at=v_now,
          status=case when status in ('open','scheduled') then 'in_progress' else status end
      where id=v_job.id;
    end if;
    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'visit_stage','Technician mobile: visit started',v_uid);
    perform private.queue_service_job_notification(v_job.id,'visit_started',p_client_action_id,jsonb_build_object('recorded_at',v_now));
    v_result:=jsonb_build_object('action','visit_start','recorded_at',coalesce(v_job.visit_started_at,v_now));

  elsif v_action_type='arrival' then
    if v_job.visit_started_at is null then raise exception 'Record Visit Start first'; end if;
    if v_job.arrived_at is null then update public.service_jobs set arrived_at=v_now where id=v_job.id; end if;
    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'visit_stage','Technician mobile: arrived at customer site',v_uid);
    perform private.queue_service_job_notification(v_job.id,'arrived',p_client_action_id,jsonb_build_object('recorded_at',v_now));
    v_result:=jsonb_build_object('action','arrival','recorded_at',coalesce(v_job.arrived_at,v_now));

  elsif v_action_type='work_start' then
    if v_job.arrived_at is null then raise exception 'Record Arrival first'; end if;
    if v_job.work_started_at is null then update public.service_jobs set work_started_at=v_now where id=v_job.id; end if;
    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'visit_stage','Technician mobile: work started',v_uid);
    perform private.queue_service_job_notification(v_job.id,'work_started',p_client_action_id,jsonb_build_object('recorded_at',v_now));
    v_result:=jsonb_build_object('action','work_start','recorded_at',coalesce(v_job.work_started_at,v_now));

  elsif v_action_type='work_complete' then
    if v_job.work_started_at is null then raise exception 'Record Work Start first'; end if;
    if v_job.work_completed_at is null then update public.service_jobs set work_completed_at=v_now where id=v_job.id; end if;
    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'visit_stage','Technician mobile: work completed',v_uid);
    perform private.queue_service_job_notification(v_job.id,'work_completed',p_client_action_id,jsonb_build_object('recorded_at',v_now));
    v_result:=jsonb_build_object('action','work_complete','recorded_at',coalesce(v_job.work_completed_at,v_now));

  elsif v_action_type='set_eta' then
    v_eta:=nullif(p_payload->>'eta_at','')::timestamptz;
    if v_eta is null then raise exception 'ETA date/time is required'; end if;
    update public.service_jobs
    set technician_eta_at=v_eta,
        technician_eta_note=nullif(btrim(coalesce(p_payload->>'note','')),'')
    where id=v_job.id;
    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'schedule_change','Technician ETA updated from mobile',v_uid);
    perform private.queue_service_job_notification(v_job.id,'technician_eta',p_client_action_id,jsonb_build_object(
      'eta_at',v_eta,'note',nullif(btrim(coalesce(p_payload->>'note','')),'')
    ));
    v_result:=jsonb_build_object('action','set_eta','eta_at',v_eta);

  elsif v_action_type='save_execution' then
    v_resolution:=nullif(lower(btrim(coalesce(p_payload->>'resolution_status',''))),'');
    if v_resolution is not null and v_resolution not in (
      'resolved','partially_resolved','unresolved','awaiting_parts','return_visit_required'
    ) then raise exception 'Invalid resolution status'; end if;

    if v_resolution in ('unresolved','awaiting_parts','return_visit_required')
       and nullif(btrim(coalesce(p_payload->>'unresolved_reason','')),'') is null then
      raise exception 'Unresolved / return-visit reason is required';
    end if;

    update public.service_jobs
    set
      diagnosis=nullif(btrim(coalesce(p_payload->>'diagnosis','')),''),
      work_performed=nullif(btrim(coalesce(p_payload->>'work_performed','')),''),
      resolution_status=v_resolution,
      unresolved_reason=nullif(btrim(coalesce(p_payload->>'unresolved_reason','')),''),
      next_visit_at=nullif(p_payload->>'next_visit_at','')::timestamptz,
      callback_required=coalesce((p_payload->>'callback_required')::boolean,false),
      callback_at=case
        when coalesce((p_payload->>'callback_required')::boolean,false)
          then nullif(p_payload->>'callback_at','')::timestamptz
        else null
      end,
      completion_checklist=coalesce(p_payload->'completion_checklist','{}'::jsonb),
      warranty_reference=nullif(btrim(coalesce(p_payload->>'warranty_reference','')),''),
      amc_reference=nullif(btrim(coalesce(p_payload->>'amc_reference','')),''),
      customer_acknowledged_by=nullif(btrim(coalesce(p_payload->>'customer_acknowledged_by','')),''),
      customer_acknowledgement=nullif(btrim(coalesce(p_payload->>'customer_acknowledgement','')),''),
      customer_acknowledged_at=nullif(p_payload->>'customer_acknowledged_at','')::timestamptz
    where id=v_job.id;

    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'execution_update','Technician mobile execution notes saved',v_uid);
    v_result:=jsonb_build_object('action','save_execution','saved_at',v_now);

  elsif v_action_type='replace_materials' then
    if jsonb_typeof(coalesce(p_payload->'materials','[]'::jsonb)) is distinct from 'array'
       or jsonb_array_length(coalesce(p_payload->'materials','[]'::jsonb))>100 then
      raise exception 'Materials must be an array with at most 100 lines';
    end if;

    create temporary table if not exists pg_temp.old_mobile_material_prices(
      description_key text primary key,
      unit_price numeric(14,2)
    ) on commit drop;
    truncate pg_temp.old_mobile_material_prices;
    insert into pg_temp.old_mobile_material_prices(description_key,unit_price)
    select lower(btrim(m.description)),max(m.unit_price)
    from public.service_job_materials m
    where m.service_job_id=v_job.id
    group by lower(btrim(m.description));

    delete from public.service_job_materials where service_job_id=v_job.id;

    for v_material in select value from jsonb_array_elements(coalesce(p_payload->'materials','[]'::jsonb))
    loop
      v_line:=v_line+1;
      v_desc:=btrim(coalesce(v_material->>'description',''));
      v_qty:=coalesce(nullif(v_material->>'quantity','')::numeric,1);
      v_unit:=coalesce(nullif(btrim(v_material->>'unit'),''),'Nos');
      if v_desc='' then raise exception 'Material description is required on line %',v_line; end if;
      if v_qty<=0 then raise exception 'Material quantity must be greater than zero on line %',v_line; end if;
      select coalesce(max(p.unit_price),0) into v_price
      from pg_temp.old_mobile_material_prices p
      where p.description_key=lower(v_desc);

      insert into public.service_job_materials(
        service_job_id,line_no,description,quantity,unit,unit_price,notes,created_by
      )
      values(
        v_job.id,v_line,v_desc,v_qty,v_unit,coalesce(v_price,0),
        nullif(btrim(coalesce(v_material->>'notes','')),''),v_uid
      );
    end loop;

    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'material_change','Technician mobile materials list updated',v_uid);
    v_result:=jsonb_build_object('action','replace_materials','line_count',v_line);

  elsif v_action_type='register_attachment' then
    v_path:=btrim(coalesce(p_payload->>'storage_path',''));
    v_attachment_type:=lower(btrim(coalesce(p_payload->>'attachment_type','')));
    v_mime:=lower(btrim(coalesce(p_payload->>'mime_type','')));
    v_size:=nullif(p_payload->>'size_bytes','')::bigint;

    if v_path='' or v_path not like v_job.id::text||'/mobile/%' then
      raise exception 'Invalid technician attachment path';
    end if;
    if v_attachment_type not in ('before_photo','after_photo','signature','other') then
      raise exception 'Invalid attachment type';
    end if;
    if v_mime not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Invalid attachment MIME type';
    end if;
    if v_size is not null and (v_size<0 or v_size>10485760) then
      raise exception 'Attachment exceeds the 10 MB limit';
    end if;

    insert into public.service_job_attachments(
      service_job_id,attachment_type,storage_bucket,storage_path,original_name,mime_type,size_bytes,uploaded_by
    )
    values(
      v_job.id,v_attachment_type,'service-job-media',v_path,
      nullif(btrim(coalesce(p_payload->>'original_name','')),''),
      v_mime,v_size,v_uid
    )
    on conflict(storage_path) do nothing;

    insert into public.service_job_events(service_job_id,event_type,note,actor_user_id)
    values(v_job.id,'attachment_added','Technician mobile attachment added',v_uid);
    v_result:=jsonb_build_object('action','register_attachment','storage_path',v_path);

  elsif v_action_type='complete_job' then
    select * into v_job from public.service_jobs where id=v_job.id for update;
    if v_job.work_completed_at is null then raise exception 'Record Work Complete first'; end if;
    if v_job.resolution_status is null then raise exception 'Save a Resolution before completing the job'; end if;
    if v_job.status<>'completed' then
      update public.service_jobs set status='completed' where id=v_job.id;
    end if;
    perform private.queue_service_job_notification(v_job.id,'job_completed',p_client_action_id,jsonb_build_object('completed_at',now()));
    v_result:=jsonb_build_object('action','complete_job','status','completed');

  else
    raise exception 'Unsupported technician mobile action';
  end if;

  update public.technician_mobile_actions
  set result=v_result,applied_at=now()
  where id=p_client_action_id;

  update public.technicians set last_mobile_seen_at=now() where id=v_tech_id;

  return v_result;
end;
$$;

revoke all on function public.technician_apply_mobile_action(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.technician_apply_mobile_action(uuid,uuid,text,jsonb)
  to authenticated;

-- Technician Storage access: only assigned jobs and the /mobile/ subfolder.
drop policy if exists "service_job_media_technician_select" on storage.objects;
create policy "service_job_media_technician_select"
on storage.objects for select to authenticated
using (
  bucket_id='service-job-media'
  and (storage.foldername(name))[2]='mobile'
  and exists(
    select 1
    from public.service_jobs j
    where j.id::text=(storage.foldername(name))[1]
      and j.assigned_technician_id=private.current_technician_id()
  )
);

drop policy if exists "service_job_media_technician_insert" on storage.objects;
create policy "service_job_media_technician_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='service-job-media'
  and (storage.foldername(name))[2]='mobile'
  and exists(
    select 1
    from public.service_jobs j
    where j.id::text=(storage.foldername(name))[1]
      and j.assigned_technician_id=private.current_technician_id()
  )
);

drop policy if exists "service_job_media_technician_delete_own" on storage.objects;
create policy "service_job_media_technician_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id='service-job-media'
  and (storage.foldername(name))[2]='mobile'
  and owner_id=(select auth.uid()::text)
  and exists(
    select 1
    from public.service_jobs j
    where j.id::text=(storage.foldername(name))[1]
      and j.assigned_technician_id=private.current_technician_id()
  )
);
