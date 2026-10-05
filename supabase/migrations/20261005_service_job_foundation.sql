-- Operations — Milestone 3A1
-- Service job / ticket foundation with secure numbering, lifecycle history and AI follow-up readiness.

create or replace function private.allocate_document_sequence(
  p_document_type text,
  p_financial_year text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to allocate document numbers' using errcode='42501';
  end if;

  if nullif(btrim(coalesce(p_document_type,'')),'') is null
     or nullif(btrim(coalesce(p_financial_year,'')),'') is null then
    raise exception 'Document type and financial year are required';
  end if;

  insert into private.document_counters(document_type,financial_year,next_number,updated_at)
  values (lower(btrim(p_document_type)),btrim(p_financial_year),2,now())
  on conflict (document_type,financial_year)
  do update set
    next_number=private.document_counters.next_number+1,
    updated_at=now()
  returning next_number-1 into v_seq;

  return v_seq;
end;
$$;

revoke all on function private.allocate_document_sequence(text,text)
  from public, anon, authenticated;
grant execute on function private.allocate_document_sequence(text,text)
  to authenticated;

-- Fix invoice conversion so SECURITY INVOKER no longer needs direct table privileges
-- on the private document counter.
create or replace function public.convert_quotation_to_invoice(
  p_quotation_id uuid,
  p_invoice_date date default current_date,
  p_due_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotations%rowtype;
  v_invoice_id uuid;
  v_invoice_no text;
  v_prefix text := 'INV';
  v_company_code text := 'MT';
  v_fy_start_month integer := 4;
  v_invoice_date date := coalesce(p_invoice_date,current_date);
  v_due_date date := p_due_date;
  v_start_year integer;
  v_fy_label text;
  v_seq bigint;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to convert quotations' using errcode='42501';
  end if;

  select q.* into v_quote
  from public.quotations q
  where q.id=p_quotation_id
  for update;

  if not found then raise exception 'Quotation not found'; end if;
  if v_quote.status not in ('sent','accepted') then
    raise exception 'Only Sent or Accepted quotations can be converted to an invoice';
  end if;
  if exists(select 1 from public.invoices i where i.source_quotation_id=p_quotation_id) then
    raise exception 'This quotation has already been converted to an invoice';
  end if;
  if not exists(select 1 from public.quotation_items qi where qi.quotation_id=p_quotation_id) then
    raise exception 'Quotation has no line items';
  end if;
  if v_due_date is not null and v_due_date<v_invoice_date then
    raise exception 'Due date cannot be before invoice date';
  end if;

  select
    coalesce(nullif(btrim(s.invoice_prefix),''),'INV'),
    coalesce(nullif(btrim(s.document_company_code),''),'MT'),
    s.financial_year_start_month
  into v_prefix,v_company_code,v_fy_start_month
  from public.business_billing_settings s
  where s.singleton=true;

  v_prefix := regexp_replace(upper(coalesce(v_prefix,'INV')),'[^A-Z0-9]+','','g');
  v_company_code := regexp_replace(upper(coalesce(v_company_code,'MT')),'[^A-Z0-9]+','','g');
  if v_prefix='' then v_prefix:='INV'; end if;
  if v_company_code='' then v_company_code:='MT'; end if;

  if extract(month from v_invoice_date)::integer>=v_fy_start_month then
    v_start_year:=extract(year from v_invoice_date)::integer;
  else
    v_start_year:=extract(year from v_invoice_date)::integer-1;
  end if;
  v_fy_label:=v_start_year::text||'-'||right((v_start_year+1)::text,2);

  v_seq:=private.allocate_document_sequence('invoice',v_fy_label);
  v_invoice_no:=v_prefix||'-'||v_company_code||'-'||v_fy_label||'-'||lpad(v_seq::text,4,'0');

  insert into public.invoices(
    invoice_number,source_quotation_id,customer_id,enquiry_id,invoice_date,due_date,status,
    currency,tax_mode,subtotal,discount_amount,taxable_amount,tax_amount,total_amount,
    amount_paid,notes,terms,created_by
  )
  values(
    v_invoice_no,v_quote.id,v_quote.customer_id,v_quote.enquiry_id,v_invoice_date,v_due_date,'issued',
    v_quote.currency,v_quote.tax_mode,v_quote.subtotal,v_quote.discount_amount,v_quote.taxable_amount,
    v_quote.tax_amount,v_quote.total_amount,0,v_quote.notes,v_quote.terms,auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.invoice_items(
    invoice_id,source_quotation_item_id,catalogue_item_id,line_no,item_type,description,hsn_sac,
    quantity,unit,unit_price,discount_percent,discount_amount,tax_rate,line_subtotal,
    taxable_amount,tax_amount,line_total
  )
  select
    v_invoice_id,qi.id,qi.catalogue_item_id,qi.line_no,qi.item_type,qi.description,qi.hsn_sac,
    qi.quantity,qi.unit,qi.unit_price,qi.discount_percent,qi.discount_amount,qi.tax_rate,
    qi.line_subtotal,qi.taxable_amount,qi.tax_amount,qi.line_total
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id
  order by qi.line_no;

  update public.quotations
  set status='converted',updated_at=now()
  where id=p_quotation_id;

  return jsonb_build_object(
    'id',v_invoice_id,
    'invoice_number',v_invoice_no,
    'source_quotation_id',p_quotation_id,
    'customer_id',v_quote.customer_id,
    'invoice_date',v_invoice_date,
    'due_date',v_due_date,
    'status','issued',
    'payment_status',case when v_quote.total_amount<=0 then 'paid' else 'unpaid' end,
    'total_amount',v_quote.total_amount,
    'amount_paid',0,
    'balance_due',v_quote.total_amount
  );
end;
$$;

revoke all on function public.convert_quotation_to_invoice(uuid,date,date)
  from public, anon, authenticated;
grant execute on function public.convert_quotation_to_invoice(uuid,date,date)
  to authenticated;

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  phone text,
  email text,
  active boolean not null default true,
  notes text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  enquiry_id bigint references public.enquiries(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  service_category text not null check (char_length(btrim(service_category)) between 2 and 200),
  site_address text,
  equipment_details text,
  complaint text not null check (char_length(btrim(complaint)) between 2 and 5000),
  requested_work text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'open'
    check (status in ('open','scheduled','in_progress','on_hold','completed','cancelled')),
  assigned_technician_id uuid references public.technicians(id) on delete set null,
  scheduled_at timestamptz,
  follow_up_at timestamptz,
  completed_at timestamptz,
  internal_notes text,
  customer_notes text,
  service_charge_estimate numeric(14,2) not null default 0 check (service_charge_estimate>=0),
  parts_estimate numeric(14,2) not null default 0 check (parts_estimate>=0),
  total_estimate numeric(14,2) generated always as (
    service_charge_estimate+parts_estimate
  ) stored,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_job_events (
  id bigint generated always as identity primary key,
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  event_type text not null
    check (event_type in ('created','status_change','assignment_change','schedule_change')),
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists technicians_active_name_idx
  on public.technicians(active,name);
create index if not exists technicians_created_by_idx
  on public.technicians(created_by) where created_by is not null;
create index if not exists technicians_auth_user_idx
  on public.technicians(auth_user_id) where auth_user_id is not null;

create index if not exists service_jobs_customer_created_idx
  on public.service_jobs(customer_id,created_at desc);
create index if not exists service_jobs_status_priority_idx
  on public.service_jobs(status,priority,created_at desc);
create index if not exists service_jobs_scheduled_idx
  on public.service_jobs(scheduled_at) where scheduled_at is not null;
create index if not exists service_jobs_follow_up_idx
  on public.service_jobs(follow_up_at) where follow_up_at is not null;
create index if not exists service_jobs_enquiry_idx
  on public.service_jobs(enquiry_id) where enquiry_id is not null;
create index if not exists service_jobs_invoice_idx
  on public.service_jobs(invoice_id) where invoice_id is not null;
create index if not exists service_jobs_technician_idx
  on public.service_jobs(assigned_technician_id) where assigned_technician_id is not null;
create index if not exists service_jobs_created_by_idx
  on public.service_jobs(created_by) where created_by is not null;
create index if not exists service_jobs_updated_by_idx
  on public.service_jobs(updated_by) where updated_by is not null;
create index if not exists service_job_events_job_created_idx
  on public.service_job_events(service_job_id,created_at desc);
create index if not exists service_job_events_actor_idx
  on public.service_job_events(actor_user_id) where actor_user_id is not null;

drop trigger if exists technicians_updated_at on public.technicians;
create trigger technicians_updated_at
before update on public.technicians
for each row execute function private.set_updated_at();

create or replace function private.prepare_service_job_update()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.job_number is distinct from old.job_number then
    raise exception 'Service job number cannot be changed';
  end if;

  new.updated_at:=now();
  new.updated_by:=auth.uid();

  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at:=coalesce(new.completed_at,now());
  elsif old.status='completed' and new.status is distinct from 'completed' then
    new.completed_at:=null;
  end if;

  return new;
end;
$$;

drop trigger if exists service_jobs_prepare_update on public.service_jobs;
create trigger service_jobs_prepare_update
before update on public.service_jobs
for each row execute function private.prepare_service_job_update();

create or replace function private.log_service_job_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.service_job_events(
      service_job_id,event_type,to_status,note,actor_user_id
    )
    values(
      new.id,'created',new.status,'Service job created',new.created_by
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.service_job_events(
      service_job_id,event_type,from_status,to_status,note,actor_user_id
    )
    values(
      new.id,'status_change',old.status,new.status,'Status changed',coalesce(new.updated_by,auth.uid())
    );
  end if;

  if new.assigned_technician_id is distinct from old.assigned_technician_id then
    insert into public.service_job_events(
      service_job_id,event_type,note,actor_user_id
    )
    values(
      new.id,'assignment_change','Technician assignment changed',coalesce(new.updated_by,auth.uid())
    );
  end if;

  if new.scheduled_at is distinct from old.scheduled_at then
    insert into public.service_job_events(
      service_job_id,event_type,note,actor_user_id
    )
    values(
      new.id,'schedule_change','Visit schedule changed',coalesce(new.updated_by,auth.uid())
    );
  end if;

  return new;
end;
$$;

revoke all on function private.log_service_job_event() from public,anon,authenticated;

drop trigger if exists service_jobs_event_log on public.service_jobs;
create trigger service_jobs_event_log
after insert or update on public.service_jobs
for each row execute function private.log_service_job_event();

alter table public.technicians enable row level security;
alter table public.service_jobs enable row level security;
alter table public.service_job_events enable row level security;

revoke all on public.technicians from anon;
revoke all on public.service_jobs from anon;
revoke all on public.service_job_events from anon;

grant select,insert,update,delete on public.technicians to authenticated;
grant select,insert,update,delete on public.service_jobs to authenticated;
grant select on public.service_job_events to authenticated;
grant usage,select on sequence public.service_job_events_id_seq to authenticated;

drop policy if exists "active_admin_manage_technicians" on public.technicians;
create policy "active_admin_manage_technicians"
  on public.technicians for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_service_jobs" on public.service_jobs;
create policy "active_admin_manage_service_jobs"
  on public.service_jobs for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists "active_admin_read_service_job_events" on public.service_job_events;
create policy "active_admin_read_service_job_events"
  on public.service_job_events for select to authenticated
  using ((select private.is_active_admin()));

create or replace function public.create_service_job(
  p_customer_id uuid,
  p_enquiry_id bigint default null,
  p_invoice_id uuid default null,
  p_service_category text default null,
  p_site_address text default null,
  p_equipment_details text default null,
  p_complaint text default null,
  p_requested_work text default null,
  p_priority text default 'normal',
  p_assigned_technician_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_follow_up_at timestamptz default null,
  p_internal_notes text default null,
  p_customer_notes text default null,
  p_service_charge_estimate numeric default 0,
  p_parts_estimate numeric default 0
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_customer public.customers%rowtype;
  v_company_code text:='MT';
  v_fy_start_month integer:=4;
  v_today date:=current_date;
  v_start_year integer;
  v_fy_label text;
  v_seq bigint;
  v_job_no text;
  v_job_id uuid;
  v_priority text:=lower(coalesce(nullif(btrim(p_priority),''),'normal'));
  v_status text:=case when p_scheduled_at is null then 'open' else 'scheduled' end;
  v_site_address text;
  v_service_charge numeric(14,2):=round(coalesce(p_service_charge_estimate,0),2);
  v_parts_estimate numeric(14,2):=round(coalesce(p_parts_estimate,0),2);
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to create service jobs' using errcode='42501';
  end if;

  select * into v_customer
  from public.customers
  where id=p_customer_id;

  if not found then raise exception 'A valid customer is required'; end if;

  if nullif(btrim(coalesce(p_service_category,'')),'') is null then
    raise exception 'Service category is required';
  end if;
  if nullif(btrim(coalesce(p_complaint,'')),'') is null then
    raise exception 'Complaint / requested service is required';
  end if;
  if v_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid priority';
  end if;
  if v_service_charge<0 or v_parts_estimate<0 then
    raise exception 'Estimate values cannot be negative';
  end if;

  if p_enquiry_id is not null then
    if not exists(
      select 1 from public.enquiries e
      where e.id=p_enquiry_id
        and (e.customer_id is null or e.customer_id=p_customer_id)
    ) then
      raise exception 'Enquiry does not belong to the selected customer';
    end if;
  end if;

  if p_invoice_id is not null then
    if not exists(
      select 1 from public.invoices i
      where i.id=p_invoice_id and i.customer_id=p_customer_id
    ) then
      raise exception 'Invoice does not belong to the selected customer';
    end if;
  end if;

  if p_assigned_technician_id is not null and not exists(
    select 1 from public.technicians t
    where t.id=p_assigned_technician_id and t.active=true
  ) then
    raise exception 'Assigned technician is not active or does not exist';
  end if;

  v_site_address:=coalesce(
    nullif(btrim(coalesce(p_site_address,'')),''),
    nullif(btrim(coalesce(v_customer.site_address,'')),''),
    nullif(concat_ws(', ',
      nullif(btrim(coalesce(v_customer.billing_address_line1,'')),''),
      nullif(btrim(coalesce(v_customer.billing_address_line2,'')),''),
      nullif(btrim(coalesce(v_customer.city,'')),''),
      nullif(btrim(coalesce(v_customer.district,'')),''),
      nullif(btrim(coalesce(v_customer.state,'')),''),
      nullif(btrim(coalesce(v_customer.pincode,'')),'')
    ),'')
  );

  select
    coalesce(nullif(btrim(s.document_company_code),''),'MT'),
    s.financial_year_start_month
  into v_company_code,v_fy_start_month
  from public.business_billing_settings s
  where s.singleton=true;

  v_company_code:=regexp_replace(upper(coalesce(v_company_code,'MT')),'[^A-Z0-9]+','','g');
  if v_company_code='' then v_company_code:='MT'; end if;

  if extract(month from v_today)::integer>=v_fy_start_month then
    v_start_year:=extract(year from v_today)::integer;
  else
    v_start_year:=extract(year from v_today)::integer-1;
  end if;
  v_fy_label:=v_start_year::text||'-'||right((v_start_year+1)::text,2);

  v_seq:=private.allocate_document_sequence('service_job',v_fy_label);
  v_job_no:='JOB-'||v_company_code||'-'||v_fy_label||'-'||lpad(v_seq::text,4,'0');

  insert into public.service_jobs(
    job_number,customer_id,enquiry_id,invoice_id,service_category,site_address,
    equipment_details,complaint,requested_work,priority,status,assigned_technician_id,
    scheduled_at,follow_up_at,internal_notes,customer_notes,
    service_charge_estimate,parts_estimate,created_by,updated_by
  )
  values(
    v_job_no,p_customer_id,p_enquiry_id,p_invoice_id,btrim(p_service_category),v_site_address,
    nullif(btrim(coalesce(p_equipment_details,'')),''),
    btrim(p_complaint),
    nullif(btrim(coalesce(p_requested_work,'')),''),
    v_priority,v_status,p_assigned_technician_id,p_scheduled_at,p_follow_up_at,
    nullif(btrim(coalesce(p_internal_notes,'')),''),
    nullif(btrim(coalesce(p_customer_notes,'')),''),
    v_service_charge,v_parts_estimate,auth.uid(),auth.uid()
  )
  returning id into v_job_id;

  return jsonb_build_object(
    'id',v_job_id,
    'job_number',v_job_no,
    'customer_id',p_customer_id,
    'status',v_status,
    'priority',v_priority
  );
end;
$$;

revoke all on function public.create_service_job(
  uuid,bigint,uuid,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,numeric,numeric
) from public,anon,authenticated;
grant execute on function public.create_service_job(
  uuid,bigint,uuid,text,text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,numeric,numeric
) to authenticated;

create or replace view public.service_job_followup_candidates
with (security_invoker=true)
as
select
  j.id as service_job_id,
  j.job_number,
  j.customer_id,
  c.name as customer_name,
  c.phone,
  c.email,
  c.preferred_language,
  c.preferred_contact_channel,
  c.call_consent,
  c.call_consent_at,
  c.call_consent_source,
  c.do_not_call,
  j.service_category,
  j.priority,
  j.status,
  j.scheduled_at,
  j.follow_up_at,
  coalesce(j.follow_up_at,j.scheduled_at) as next_action_at,
  (
    j.status not in ('completed','cancelled')
    and nullif(btrim(coalesce(c.phone,'')),'') is not null
    and c.call_consent=true
    and c.do_not_call=false
  ) as call_eligible
from public.service_jobs j
join public.customers c on c.id=j.customer_id
where j.status not in ('completed','cancelled');

revoke all on public.service_job_followup_candidates from anon;
grant select on public.service_job_followup_candidates to authenticated;
