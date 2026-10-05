-- Operations — Milestone 3A2
-- Job-sheet execution, materials, private media, customer acknowledgement and billing preparation.

alter table public.quotations
  add column if not exists source_service_job_id uuid;

create unique index if not exists quotations_source_service_job_uidx
  on public.quotations(source_service_job_id)
  where source_service_job_id is not null;

alter table public.service_jobs
  add column if not exists visit_started_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists work_started_at timestamptz,
  add column if not exists work_completed_at timestamptz,
  add column if not exists diagnosis text,
  add column if not exists work_performed text,
  add column if not exists resolution_status text
    check (resolution_status is null or resolution_status in ('resolved','partially_resolved','unresolved','awaiting_parts','return_visit_required')),
  add column if not exists unresolved_reason text,
  add column if not exists next_visit_at timestamptz,
  add column if not exists callback_required boolean not null default false,
  add column if not exists callback_at timestamptz,
  add column if not exists completion_checklist jsonb not null default '{}'::jsonb,
  add column if not exists warranty_reference text,
  add column if not exists amc_reference text,
  add column if not exists service_charge_actual numeric(14,2) not null default 0
    check (service_charge_actual >= 0),
  add column if not exists parts_actual numeric(14,2) not null default 0
    check (parts_actual >= 0),
  add column if not exists customer_acknowledged_by text,
  add column if not exists customer_acknowledgement text,
  add column if not exists customer_acknowledged_at timestamptz,
  add column if not exists billing_quotation_id uuid unique references public.quotations(id) on delete set null,
  add column if not exists billing_prepared_at timestamptz;

alter table public.service_jobs
  add column if not exists total_actual numeric(14,2)
  generated always as (service_charge_actual + parts_actual) stored;

create table if not exists public.service_job_materials (
  id bigint generated always as identity primary key,
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  catalogue_item_id uuid references public.catalogue_items(id) on delete set null,
  line_no integer not null check (line_no > 0),
  description text not null check (char_length(btrim(description)) between 1 and 1000),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'Nos',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_job_id,line_no)
);

create table if not exists public.service_job_attachments (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  attachment_type text not null
    check (attachment_type in ('before_photo','after_photo','signature','other')),
  storage_bucket text not null default 'service-job-media',
  storage_path text not null unique,
  original_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  notes text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists service_job_materials_job_line_idx
  on public.service_job_materials(service_job_id,line_no);
create index if not exists service_job_materials_catalogue_idx
  on public.service_job_materials(catalogue_item_id)
  where catalogue_item_id is not null;
create index if not exists service_job_materials_created_by_idx
  on public.service_job_materials(created_by)
  where created_by is not null;
create index if not exists service_job_attachments_job_type_idx
  on public.service_job_attachments(service_job_id,attachment_type,created_at desc);
create index if not exists service_job_attachments_uploaded_by_idx
  on public.service_job_attachments(uploaded_by)
  where uploaded_by is not null;
create index if not exists service_jobs_billing_quote_idx
  on public.service_jobs(billing_quotation_id)
  where billing_quotation_id is not null;

drop trigger if exists service_job_materials_updated_at on public.service_job_materials;
create trigger service_job_materials_updated_at
before update on public.service_job_materials
for each row execute function private.set_updated_at();

alter table public.service_job_materials enable row level security;
alter table public.service_job_attachments enable row level security;

revoke all on public.service_job_materials from anon;
revoke all on public.service_job_attachments from anon;

grant select,insert,update,delete on public.service_job_materials to authenticated;
grant select,insert,update,delete on public.service_job_attachments to authenticated;
grant usage,select on sequence public.service_job_materials_id_seq to authenticated;

drop policy if exists "active_admin_manage_service_job_materials" on public.service_job_materials;
create policy "active_admin_manage_service_job_materials"
  on public.service_job_materials for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_service_job_attachments" on public.service_job_attachments;
create policy "active_admin_manage_service_job_attachments"
  on public.service_job_attachments for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

alter table public.service_job_events
  drop constraint if exists service_job_events_event_type_check;

alter table public.service_job_events
  add constraint service_job_events_event_type_check
  check (event_type in (
    'created','status_change','assignment_change','schedule_change',
    'visit_stage','execution_update','material_change','attachment_added','billing_prepared'
  ));

create or replace function private.recalculate_service_job_parts_actual()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job_id uuid;
  v_total numeric(14,2);
begin
  v_job_id := coalesce(new.service_job_id, old.service_job_id);

  select coalesce(sum(m.line_total),0)::numeric(14,2)
  into v_total
  from public.service_job_materials m
  where m.service_job_id=v_job_id;

  update public.service_jobs
  set parts_actual=v_total
  where id=v_job_id;

  return coalesce(new,old);
end;
$$;

revoke all on function private.recalculate_service_job_parts_actual()
  from public,anon,authenticated;

drop trigger if exists service_job_materials_recalculate on public.service_job_materials;
create trigger service_job_materials_recalculate
after insert or update or delete on public.service_job_materials
for each row execute function private.recalculate_service_job_parts_actual();

create or replace function private.prepare_service_job_update()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.job_number is distinct from old.job_number then
    raise exception 'Service job number cannot be changed';
  end if;

  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Service job creation audit fields cannot be changed';
  end if;

  if not exists(select 1 from public.customers c where c.id=new.customer_id) then
    raise exception 'Selected customer does not exist';
  end if;

  if new.enquiry_id is not null and not exists(
    select 1 from public.enquiries e
    where e.id=new.enquiry_id
      and (e.customer_id is null or e.customer_id=new.customer_id)
  ) then
    raise exception 'Enquiry does not belong to the selected customer';
  end if;

  if new.invoice_id is not null and not exists(
    select 1 from public.invoices i
    where i.id=new.invoice_id and i.customer_id=new.customer_id
  ) then
    raise exception 'Invoice does not belong to the selected customer';
  end if;

  if new.assigned_technician_id is not null and not exists(
    select 1 from public.technicians t
    where t.id=new.assigned_technician_id and t.active=true
  ) then
    raise exception 'Assigned technician is not active or does not exist';
  end if;

  if new.status='scheduled' and new.scheduled_at is null then
    raise exception 'Scheduled jobs require a visit date/time';
  end if;

  if new.arrived_at is not null and new.visit_started_at is null then
    raise exception 'Arrival requires Visit Start first';
  end if;
  if new.work_started_at is not null and new.arrived_at is null then
    raise exception 'Work Start requires Arrival first';
  end if;
  if new.work_completed_at is not null and new.work_started_at is null then
    raise exception 'Work Complete requires Work Start first';
  end if;
  if new.visit_started_at is not null and new.arrived_at is not null
     and new.arrived_at < new.visit_started_at then
    raise exception 'Arrival cannot be before Visit Start';
  end if;
  if new.arrived_at is not null and new.work_started_at is not null
     and new.work_started_at < new.arrived_at then
    raise exception 'Work Start cannot be before Arrival';
  end if;
  if new.work_started_at is not null and new.work_completed_at is not null
     and new.work_completed_at < new.work_started_at then
    raise exception 'Work Complete cannot be before Work Start';
  end if;

  if new.status='completed' then
    if new.work_completed_at is null then
      raise exception 'Complete the Work Complete stage before closing the job';
    end if;
    if new.resolution_status is null then
      raise exception 'Resolution status is required before closing the job';
    end if;
  end if;

  if old.billing_quotation_id is not null then
    if new.customer_id is distinct from old.customer_id
       or new.enquiry_id is distinct from old.enquiry_id
       or new.invoice_id is distinct from old.invoice_id
       or new.service_category is distinct from old.service_category
       or new.service_charge_actual is distinct from old.service_charge_actual
       or new.parts_actual is distinct from old.parts_actual then
      raise exception 'Billing-sensitive job fields are locked after billing preparation';
    end if;
  end if;

  new.updated_at:=now();
  new.updated_by:=auth.uid();

  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at:=coalesce(new.completed_at,now());
  elsif old.status='completed' and new.status is distinct from 'completed' then
    new.completed_at:=null;
  elsif new.status='completed' and old.status='completed' then
    new.completed_at:=old.completed_at;
  else
    new.completed_at:=null;
  end if;

  return new;
end;
$$;

create or replace function public.mark_service_job_stage(
  p_service_job_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.service_jobs%rowtype;
  v_stage text:=lower(btrim(coalesce(p_stage,'')));
  v_now timestamptz:=now();
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to update service-job visit stages' using errcode='42501';
  end if;

  select * into v_job
  from public.service_jobs
  where id=p_service_job_id
  for update;

  if not found then raise exception 'Service job not found'; end if;
  if v_job.status in ('completed','cancelled') then
    raise exception 'Completed or cancelled jobs cannot start a new visit stage';
  end if;

  if v_stage='visit_start' then
    if v_job.visit_started_at is not null then raise exception 'Visit Start is already recorded'; end if;
    update public.service_jobs
    set visit_started_at=v_now,
        status=case when status in ('open','scheduled') then 'in_progress' else status end
    where id=v_job.id;
  elsif v_stage='arrival' then
    if v_job.visit_started_at is null then raise exception 'Record Visit Start first'; end if;
    if v_job.arrived_at is not null then raise exception 'Arrival is already recorded'; end if;
    update public.service_jobs set arrived_at=v_now where id=v_job.id;
  elsif v_stage='work_start' then
    if v_job.arrived_at is null then raise exception 'Record Arrival first'; end if;
    if v_job.work_started_at is not null then raise exception 'Work Start is already recorded'; end if;
    update public.service_jobs set work_started_at=v_now where id=v_job.id;
  elsif v_stage='work_complete' then
    if v_job.work_started_at is null then raise exception 'Record Work Start first'; end if;
    if v_job.work_completed_at is not null then raise exception 'Work Complete is already recorded'; end if;
    update public.service_jobs set work_completed_at=v_now where id=v_job.id;
  else
    raise exception 'Invalid visit stage';
  end if;

  insert into public.service_job_events(
    service_job_id,event_type,note,actor_user_id
  )
  values(
    v_job.id,'visit_stage','Visit stage recorded: '||replace(v_stage,'_',' '),auth.uid()
  );

  return jsonb_build_object('id',v_job.id,'stage',v_stage,'recorded_at',v_now);
end;
$$;

revoke all on function public.mark_service_job_stage(uuid,text)
  from public,anon,authenticated;
grant execute on function public.mark_service_job_stage(uuid,text)
  to authenticated;

create or replace function public.save_service_job_execution(
  p_service_job_id uuid,
  p_diagnosis text,
  p_work_performed text,
  p_resolution_status text,
  p_unresolved_reason text,
  p_next_visit_at timestamptz,
  p_callback_required boolean,
  p_callback_at timestamptz,
  p_completion_checklist jsonb,
  p_warranty_reference text,
  p_amc_reference text,
  p_service_charge_actual numeric,
  p_customer_acknowledged_by text,
  p_customer_acknowledgement text,
  p_customer_acknowledged_at timestamptz,
  p_materials jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.service_jobs%rowtype;
  v_resolution text:=nullif(lower(btrim(coalesce(p_resolution_status,''))),'');
  v_service_actual numeric(14,2):=round(coalesce(p_service_charge_actual,0),2);
  v_material jsonb;
  v_line integer:=0;
  v_desc text;
  v_qty numeric;
  v_unit text;
  v_price numeric;
  v_catalogue uuid;
  v_parts numeric(14,2);
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to save service-job execution' using errcode='42501';
  end if;

  select * into v_job
  from public.service_jobs
  where id=p_service_job_id
  for update;

  if not found then raise exception 'Service job not found'; end if;
  if v_job.status='cancelled' then raise exception 'Cancelled jobs cannot be executed'; end if;
  if v_job.billing_quotation_id is not null then
    raise exception 'Execution financial details are locked after billing preparation';
  end if;

  if v_resolution is not null and v_resolution not in (
    'resolved','partially_resolved','unresolved','awaiting_parts','return_visit_required'
  ) then
    raise exception 'Invalid resolution status';
  end if;

  if v_service_actual<0 then raise exception 'Actual service charge cannot be negative'; end if;
  if jsonb_typeof(coalesce(p_materials,'[]'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_materials,'[]'::jsonb))>100 then
    raise exception 'Materials must be a JSON array with at most 100 lines';
  end if;

  if coalesce(p_callback_required,false)=true and p_callback_at is null then
    raise exception 'Callback date/time is required when callback is requested';
  end if;

  if v_resolution in ('unresolved','awaiting_parts','return_visit_required')
     and nullif(btrim(coalesce(p_unresolved_reason,'')),'') is null then
    raise exception 'Unresolved / return-visit reason is required';
  end if;

  update public.service_jobs
  set
    diagnosis=nullif(btrim(coalesce(p_diagnosis,'')),''),
    work_performed=nullif(btrim(coalesce(p_work_performed,'')),''),
    resolution_status=v_resolution,
    unresolved_reason=nullif(btrim(coalesce(p_unresolved_reason,'')),''),
    next_visit_at=p_next_visit_at,
    callback_required=coalesce(p_callback_required,false),
    callback_at=case when coalesce(p_callback_required,false) then p_callback_at else null end,
    completion_checklist=coalesce(p_completion_checklist,'{}'::jsonb),
    warranty_reference=nullif(btrim(coalesce(p_warranty_reference,'')),''),
    amc_reference=nullif(btrim(coalesce(p_amc_reference,'')),''),
    service_charge_actual=v_service_actual,
    customer_acknowledged_by=nullif(btrim(coalesce(p_customer_acknowledged_by,'')),''),
    customer_acknowledgement=nullif(btrim(coalesce(p_customer_acknowledgement,'')),''),
    customer_acknowledged_at=p_customer_acknowledged_at
  where id=v_job.id;

  delete from public.service_job_materials
  where service_job_id=v_job.id;

  for v_material in
    select value from jsonb_array_elements(coalesce(p_materials,'[]'::jsonb))
  loop
    v_line:=v_line+1;
    v_desc:=btrim(coalesce(v_material->>'description',''));
    v_qty:=coalesce(nullif(v_material->>'quantity','')::numeric,1);
    v_unit:=coalesce(nullif(btrim(v_material->>'unit'),''),'Nos');
    v_price:=coalesce(nullif(v_material->>'unit_price','')::numeric,0);
    v_catalogue:=nullif(v_material->>'catalogue_item_id','')::uuid;

    if v_desc='' then raise exception 'Material description is required on line %',v_line; end if;
    if v_qty<=0 then raise exception 'Material quantity must be greater than zero on line %',v_line; end if;
    if v_price<0 then raise exception 'Material unit price cannot be negative on line %',v_line; end if;
    if v_catalogue is not null and not exists(select 1 from public.catalogue_items c where c.id=v_catalogue) then
      raise exception 'Catalogue item not found on material line %',v_line;
    end if;

    insert into public.service_job_materials(
      service_job_id,catalogue_item_id,line_no,description,quantity,unit,unit_price,notes,created_by
    )
    values(
      v_job.id,v_catalogue,v_line,v_desc,v_qty,v_unit,round(v_price,2),
      nullif(btrim(coalesce(v_material->>'notes','')),''),auth.uid()
    );
  end loop;

  select parts_actual into v_parts
  from public.service_jobs
  where id=v_job.id;

  insert into public.service_job_events(
    service_job_id,event_type,note,actor_user_id
  )
  values(
    v_job.id,'execution_update','Job-sheet execution details saved',auth.uid()
  );

  return jsonb_build_object(
    'id',v_job.id,
    'service_charge_actual',v_service_actual,
    'parts_actual',coalesce(v_parts,0),
    'total_actual',v_service_actual+coalesce(v_parts,0),
    'resolution_status',v_resolution
  );
end;
$$;

revoke all on function public.save_service_job_execution(
  uuid,text,text,text,text,timestamptz,boolean,timestamptz,jsonb,text,text,numeric,text,text,timestamptz,jsonb
) from public,anon,authenticated;
grant execute on function public.save_service_job_execution(
  uuid,text,text,text,text,timestamptz,boolean,timestamptz,jsonb,text,text,numeric,text,text,timestamptz,jsonb
) to authenticated;

create or replace function public.prepare_service_job_billing(
  p_service_job_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.service_jobs%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_material record;
  v_quote jsonb;
  v_quote_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to prepare service-job billing' using errcode='42501';
  end if;

  select * into v_job
  from public.service_jobs
  where id=p_service_job_id
  for update;

  if not found then raise exception 'Service job not found'; end if;
  if v_job.status<>'completed' then
    raise exception 'Only Completed service jobs can be prepared for billing';
  end if;

  if v_job.billing_quotation_id is not null then
    return jsonb_build_object(
      'quotation_id',v_job.billing_quotation_id,
      'already_prepared',true
    );
  end if;

  v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'item_type','service',
    'description','Service work - '||v_job.service_category,
    'quantity',1,
    'unit','Job',
    'unit_price',v_job.service_charge_actual,
    'discount_percent',0,
    'tax_rate',0,
    'hsn_sac',null
  ));

  for v_material in
    select * from public.service_job_materials
    where service_job_id=v_job.id
    order by line_no
  loop
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'catalogue_item_id',v_material.catalogue_item_id,
      'item_type','product',
      'description',v_material.description,
      'quantity',v_material.quantity,
      'unit',v_material.unit,
      'unit_price',v_material.unit_price,
      'discount_percent',0,
      'tax_rate',0,
      'hsn_sac',null
    ));
  end loop;

  v_quote:=public.create_quotation(
    p_customer_id=>v_job.customer_id,
    p_enquiry_id=>v_job.enquiry_id,
    p_quotation_date=>current_date,
    p_valid_until=>null,
    p_status=>'draft',
    p_currency=>null,
    p_tax_mode=>null,
    p_notes=>'Prepared from service job '||v_job.job_number||
      case when v_job.work_performed is not null then E'\nWork performed: '||v_job.work_performed else '' end,
    p_terms=>null,
    p_items=>v_items
  );

  v_quote_id:=(v_quote->>'id')::uuid;

  update public.quotations
  set source_service_job_id=v_job.id
  where id=v_quote_id;

  update public.service_jobs
  set billing_quotation_id=v_quote_id,
      billing_prepared_at=now()
  where id=v_job.id;

  insert into public.service_job_events(
    service_job_id,event_type,note,actor_user_id
  )
  values(
    v_job.id,'billing_prepared','Draft quotation prepared for billing: '||(v_quote->>'quotation_number'),auth.uid()
  );

  return jsonb_build_object(
    'quotation_id',v_quote_id,
    'quotation_number',v_quote->>'quotation_number',
    'already_prepared',false
  );
end;
$$;

revoke all on function public.prepare_service_job_billing(uuid)
  from public,anon,authenticated;
grant execute on function public.prepare_service_job_billing(uuid)
  to authenticated;

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'service-job-media','service-job-media',false,10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update
set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "service_job_media_admin_select" on storage.objects;
create policy "service_job_media_admin_select"
on storage.objects for select to authenticated
using (
  bucket_id='service-job-media'
  and (select private.is_active_admin())
);

drop policy if exists "service_job_media_admin_insert" on storage.objects;
create policy "service_job_media_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='service-job-media'
  and (select private.is_active_admin())
);

drop policy if exists "service_job_media_admin_update" on storage.objects;
create policy "service_job_media_admin_update"
on storage.objects for update to authenticated
using (
  bucket_id='service-job-media'
  and (select private.is_active_admin())
)
with check (
  bucket_id='service-job-media'
  and (select private.is_active_admin())
);

drop policy if exists "service_job_media_admin_delete" on storage.objects;
create policy "service_job_media_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='service-job-media'
  and (select private.is_active_admin())
);
