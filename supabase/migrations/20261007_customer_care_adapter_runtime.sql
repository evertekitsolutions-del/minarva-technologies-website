-- Customer Care — Milestone 3B2
-- Provider adapter runtime, mock/test delivery, dead-letter and manual retry foundation.
-- Live outbound remains disabled by default.

alter table public.customer_care_provider_adapters
  add column if not exists runtime_mode text not null default 'disabled'
    check (runtime_mode in ('disabled','test','live')),
  add column if not exists health_status text not null default 'unknown'
    check (health_status in ('unknown','ready','error','disabled')),
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_health_error text;

create table if not exists public.customer_care_test_allowlist (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','sms','email','call')),
  recipient text not null,
  label text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(channel,recipient)
);

create index if not exists customer_care_test_allowlist_active_idx
  on public.customer_care_test_allowlist(channel,active,recipient);

create table if not exists public.customer_care_dead_letters (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.customer_contact_outbox(id) on delete cascade,
  attempt_id uuid references public.notification_delivery_attempts(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  channel text check (channel is null or channel in ('whatsapp','sms','email','call')),
  provider_adapter_key text references public.customer_care_provider_adapters(adapter_key) on delete set null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open','retried','resolved','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists customer_care_dead_letters_status_created_idx
  on public.customer_care_dead_letters(status,created_at desc);
create index if not exists customer_care_dead_letters_outbox_idx
  on public.customer_care_dead_letters(outbox_id,created_at desc);
create index if not exists customer_care_dead_letters_customer_idx
  on public.customer_care_dead_letters(customer_id,created_at desc);
create index if not exists customer_care_dead_letters_attempt_idx
  on public.customer_care_dead_letters(attempt_id)
  where attempt_id is not null;
create index if not exists customer_care_dead_letters_resolved_by_idx
  on public.customer_care_dead_letters(resolved_by)
  where resolved_by is not null;

alter table public.customer_care_test_allowlist enable row level security;
alter table public.customer_care_dead_letters enable row level security;

revoke all on public.customer_care_test_allowlist from anon;
revoke all on public.customer_care_dead_letters from anon;
grant select,insert,update,delete on public.customer_care_test_allowlist to authenticated;
grant select,insert,update,delete on public.customer_care_dead_letters to authenticated;

drop policy if exists "active_admin_manage_customer_care_test_allowlist" on public.customer_care_test_allowlist;
create policy "active_admin_manage_customer_care_test_allowlist"
on public.customer_care_test_allowlist for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

drop policy if exists "active_admin_manage_customer_care_dead_letters" on public.customer_care_dead_letters;
create policy "active_admin_manage_customer_care_dead_letters"
on public.customer_care_dead_letters for all to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

insert into public.customer_care_provider_adapters(
  adapter_key,channel,display_name,adapter_type,enabled,runtime_mode,health_status,config,notes
)
values
  (
    'mock_whatsapp','whatsapp','Mock WhatsApp — Test Only','edge_function',true,'test','ready',
    '{"mock":true,"external_contact":false}'::jsonb,
    'Sandbox adapter. Simulates successful delivery and never contacts the recipient.'
  ),
  (
    'mock_sms','sms','Mock SMS — Test Only','edge_function',true,'test','ready',
    '{"mock":true,"external_contact":false}'::jsonb,
    'Sandbox adapter. Simulates successful delivery and never contacts the recipient.'
  ),
  (
    'mock_email','email','Mock Email — Test Only','edge_function',true,'test','ready',
    '{"mock":true,"external_contact":false}'::jsonb,
    'Sandbox adapter. Simulates successful delivery and never contacts the recipient.'
  ),
  (
    'mock_call','call','Mock Automated Call — Test Only','edge_function',true,'test','ready',
    '{"mock":true,"external_contact":false}'::jsonb,
    'Sandbox adapter. Simulates a call result and never dials the recipient.'
  )
on conflict(adapter_key) do update set
  display_name=excluded.display_name,
  adapter_type=excluded.adapter_type,
  enabled=true,
  runtime_mode='test',
  health_status='ready',
  config=excluded.config,
  notes=excluded.notes,
  updated_at=now();

update public.customer_care_provider_adapters
set runtime_mode='disabled',
    health_status='disabled',
    enabled=false
where adapter_key in (
  'whatsapp_unconfigured','sms_unconfigured','email_unconfigured','call_unconfigured'
);

update public.notification_event_routes
set provider_adapter_key=case channel
  when 'whatsapp' then 'mock_whatsapp'
  when 'sms' then 'mock_sms'
  when 'email' then 'mock_email'
  when 'call' then 'mock_call'
  else provider_adapter_key
end
where channel in ('whatsapp','sms','email','call');

create or replace function public.customer_care_worker_prepare_dispatch(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  return private.customer_care_prepare_dispatch_worker(p_limit);
end;
$$;

revoke all on function public.customer_care_worker_prepare_dispatch(integer)
from public,anon,authenticated;
grant execute on function public.customer_care_worker_prepare_dispatch(integer)
to service_role;

create or replace function public.customer_care_worker_claim(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),100));
  v_result jsonb;
begin
  update public.notification_delivery_attempts a
  set
    status='ready',
    started_at=null,
    error_message=coalesce(a.error_message,'')||
      case when coalesce(a.error_message,'')='' then '' else E'\n' end||
      'Recovered after stale worker lock'
  from public.customer_contact_outbox o
  where a.outbox_id=o.id
    and a.status='sending'
    and a.started_at<now()-interval '15 minutes'
    and o.status='ready';

  with picked as (
    select a.id
    from public.notification_delivery_attempts a
    join public.customer_contact_outbox o on o.id=a.outbox_id
    join public.customer_care_provider_adapters p on p.adapter_key=a.provider_adapter_key
    where a.status='ready'
      and o.status='ready'
      and p.enabled=true
      and p.runtime_mode in ('test','live')
      and p.health_status in ('ready','unknown')
    order by a.created_at
    for update of a skip locked
    limit v_limit
  ),
  locked as (
    update public.notification_delivery_attempts a
    set status='sending',started_at=now()
    where a.id in (select id from picked)
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'attempt_id',a.id,
    'attempt_no',a.attempt_no,
    'outbox_id',a.outbox_id,
    'customer_id',o.customer_id,
    'channel',a.channel,
    'recipient',a.recipient,
    'subject',a.subject,
    'body',a.body,
    'call_script',a.call_script,
    'provider_adapter_key',a.provider_adapter_key,
    'runtime_mode',p.runtime_mode,
    'provider_config',p.config,
    'event_type',o.event_type,
    'source_type',o.source_type,
    'source_id',o.source_id
  ) order by a.created_at),'[]'::jsonb)
  into v_result
  from locked a
  join public.customer_contact_outbox o on o.id=a.outbox_id
  join public.customer_care_provider_adapters p on p.adapter_key=a.provider_adapter_key;

  return v_result;
end;
$$;

revoke all on function public.customer_care_worker_claim(integer)
from public,anon,authenticated;
grant execute on function public.customer_care_worker_claim(integer)
to service_role;

create or replace function public.customer_care_worker_finish(
  p_attempt_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_provider_response jsonb default null,
  p_error_message text default null,
  p_mock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_attempt public.notification_delivery_attempts%rowtype;
  v_outbox public.customer_contact_outbox%rowtype;
  v_route public.notification_event_routes%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_retry_at timestamptz;
  v_dead_letter_id uuid;
begin
  if v_status not in ('sent','failed','suppressed','cancelled') then
    raise exception 'Invalid worker result status';
  end if;

  select * into v_attempt
  from public.notification_delivery_attempts
  where id=p_attempt_id
  for update;

  if not found then raise exception 'Delivery attempt not found'; end if;

  select * into v_outbox
  from public.customer_contact_outbox
  where id=v_attempt.outbox_id
  for update;

  if not found then raise exception 'Outbox item not found'; end if;

  if v_outbox.route_id is not null then
    select * into v_route
    from public.notification_event_routes
    where id=v_outbox.route_id;
  end if;

  update public.notification_delivery_attempts
  set
    status=v_status,
    provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),
    provider_response=coalesce(p_provider_response,'{}'::jsonb)||
      jsonb_build_object('mock',coalesce(p_mock,false)),
    error_message=nullif(btrim(coalesce(p_error_message,'')),''),
    completed_at=now()
  where id=v_attempt.id;

  if v_status='sent' then
    update public.customer_contact_outbox
    set status='sent',last_error=null,next_attempt_at=null,processed_at=now()
    where id=v_outbox.id;

    update public.automated_call_jobs
    set
      status=case when v_attempt.channel='call' then 'completed' else status end,
      attempt_count=greatest(attempt_count,v_attempt.attempt_no),
      provider_call_id=case when v_attempt.channel='call'
        then coalesce(nullif(btrim(coalesce(p_provider_message_id,'')),''),provider_call_id)
        else provider_call_id
      end,
      outcome=case when v_attempt.channel='call' and coalesce(p_mock,false)
        then 'sandbox_simulated'
        else outcome
      end,
      last_error=null,
      updated_at=now()
    where outbox_id=v_outbox.id;

    insert into public.customer_contact_timeline(
      customer_id,outbox_id,attempt_id,source_type,source_id,event_type,channel,
      direction,status,summary,metadata
    )
    values(
      v_outbox.customer_id,v_outbox.id,v_attempt.id,v_outbox.source_type,v_outbox.source_id,
      v_outbox.event_type,v_attempt.channel,'outbound','sent',
      case when coalesce(p_mock,false)
        then 'Sandbox delivery simulated — no external contact'
        else 'Provider delivery reported sent'
      end,
      jsonb_build_object(
        'provider_message_id',p_provider_message_id,
        'mock',coalesce(p_mock,false),
        'provider_response',coalesce(p_provider_response,'{}'::jsonb)
      )
    );

  elsif v_status='failed' and v_outbox.attempt_count<v_outbox.max_attempts then
    v_retry_at:=now()+make_interval(
      mins=>coalesce(v_route.retry_base_minutes,15)*
        power(2,greatest(v_outbox.attempt_count-1,0))::integer
    );

    update public.customer_contact_outbox
    set
      status='pending',
      last_error=p_error_message,
      next_attempt_at=v_retry_at,
      processed_at=now()
    where id=v_outbox.id;

    update public.notification_delivery_attempts
    set next_retry_at=v_retry_at
    where id=v_attempt.id;

    insert into public.customer_contact_timeline(
      customer_id,outbox_id,attempt_id,source_type,source_id,event_type,channel,
      direction,status,summary,metadata
    )
    values(
      v_outbox.customer_id,v_outbox.id,v_attempt.id,v_outbox.source_type,v_outbox.source_id,
      v_outbox.event_type,v_attempt.channel,'outbound','pending',
      coalesce(p_error_message,'Provider delivery failed; retry scheduled'),
      jsonb_build_object('next_retry_at',v_retry_at)
    );

  else
    update public.customer_contact_outbox
    set
      status=case when v_status='failed' then 'failed' else v_status end,
      last_error=p_error_message,
      next_attempt_at=null,
      processed_at=now()
    where id=v_outbox.id;

    if v_status='failed' then
      insert into public.customer_care_dead_letters(
        outbox_id,attempt_id,customer_id,channel,provider_adapter_key,reason,payload
      )
      values(
        v_outbox.id,v_attempt.id,v_outbox.customer_id,v_attempt.channel,
        v_attempt.provider_adapter_key,
        coalesce(nullif(btrim(coalesce(p_error_message,'')),''),'Maximum delivery attempts exhausted'),
        jsonb_build_object(
          'event_type',v_outbox.event_type,
          'source_type',v_outbox.source_type,
          'source_id',v_outbox.source_id,
          'attempt_no',v_attempt.attempt_no
        )
      )
      returning id into v_dead_letter_id;
    end if;

    insert into public.customer_contact_timeline(
      customer_id,outbox_id,attempt_id,source_type,source_id,event_type,channel,
      direction,status,summary,metadata
    )
    values(
      v_outbox.customer_id,v_outbox.id,v_attempt.id,v_outbox.source_type,v_outbox.source_id,
      v_outbox.event_type,v_attempt.channel,'outbound',
      case when v_status='failed' then 'failed' else v_status end,
      coalesce(p_error_message,v_status),
      jsonb_build_object('dead_letter_id',v_dead_letter_id)
    );
  end if;

  return jsonb_build_object(
    'attempt_id',v_attempt.id,
    'outbox_id',v_outbox.id,
    'status',case
      when v_status='failed' and v_outbox.attempt_count<v_outbox.max_attempts then 'pending'
      when v_status='failed' then 'failed'
      else v_status
    end,
    'next_retry_at',v_retry_at,
    'dead_letter_id',v_dead_letter_id
  );
end;
$$;

revoke all on function public.customer_care_worker_finish(
  uuid,text,text,jsonb,text,boolean
) from public,anon,authenticated;
grant execute on function public.customer_care_worker_finish(
  uuid,text,text,jsonb,text,boolean
) to service_role;

create or replace function public.customer_care_worker_update_health(
  p_adapter_key text,
  p_health_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text:=lower(btrim(coalesce(p_health_status,'')));
begin
  if v_status not in ('unknown','ready','error','disabled') then
    raise exception 'Invalid provider health status';
  end if;

  update public.customer_care_provider_adapters
  set
    health_status=v_status,
    last_health_check_at=now(),
    last_health_error=case when v_status='error' then nullif(btrim(coalesce(p_error,'')),'') else null end,
    updated_at=now()
  where adapter_key=p_adapter_key;
end;
$$;

revoke all on function public.customer_care_worker_update_health(text,text,text)
from public,anon,authenticated;
grant execute on function public.customer_care_worker_update_health(text,text,text)
to service_role;

create or replace function public.customer_care_retry_outbox(
  p_outbox_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_outbox public.customer_contact_outbox%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to retry customer-care delivery' using errcode='42501';
  end if;

  select * into v_outbox
  from public.customer_contact_outbox
  where id=p_outbox_id
  for update;

  if not found then raise exception 'Outbox item not found'; end if;
  if v_outbox.status not in ('failed','suppressed') then
    raise exception 'Only Failed or Suppressed items can be manually retried';
  end if;

  update public.customer_contact_outbox
  set
    status='pending',
    max_attempts=greatest(max_attempts,attempt_count+1),
    suppression_reason=null,
    last_error=null,
    scheduled_for=now(),
    next_attempt_at=null,
    processed_at=null
  where id=v_outbox.id;

  update public.customer_care_dead_letters
  set status='retried',resolved_at=now(),resolved_by=auth.uid()
  where outbox_id=v_outbox.id and status='open';

  insert into public.customer_contact_timeline(
    customer_id,outbox_id,source_type,source_id,event_type,channel,direction,status,summary
  )
  values(
    v_outbox.customer_id,v_outbox.id,v_outbox.source_type,v_outbox.source_id,
    v_outbox.event_type,coalesce(v_outbox.resolved_channel,v_outbox.requested_channel),
    'internal','pending','Manual retry requested by administrator'
  );

  return jsonb_build_object('outbox_id',v_outbox.id,'status','pending');
end;
$$;

revoke all on function public.customer_care_retry_outbox(uuid)
from public,anon,authenticated;
grant execute on function public.customer_care_retry_outbox(uuid)
to authenticated;

create or replace function public.customer_care_provider_runtime_state(
  p_adapter_key text,
  p_runtime_mode text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_mode text:=lower(btrim(coalesce(p_runtime_mode,'')));
  v_adapter public.customer_care_provider_adapters%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Not authorized to change provider runtime state' using errcode='42501';
  end if;

  if v_mode not in ('disabled','test','live') then
    raise exception 'Invalid runtime mode';
  end if;

  if v_mode='live' then
    raise exception 'Live provider mode is intentionally locked until a real provider is configured and explicitly approved';
  end if;

  update public.customer_care_provider_adapters
  set
    runtime_mode=v_mode,
    enabled=coalesce(p_enabled,false),
    health_status=case
      when coalesce(p_enabled,false)=false or v_mode='disabled' then 'disabled'
      when coalesce((config->>'mock')::boolean,false)=true then 'ready'
      else 'unknown'
    end,
    updated_at=now()
  where adapter_key=p_adapter_key
  returning * into v_adapter;

  if not found then raise exception 'Provider adapter not found'; end if;

  return jsonb_build_object(
    'adapter_key',v_adapter.adapter_key,
    'runtime_mode',v_adapter.runtime_mode,
    'enabled',v_adapter.enabled,
    'health_status',v_adapter.health_status
  );
end;
$$;

revoke all on function public.customer_care_provider_runtime_state(text,text,boolean)
from public,anon,authenticated;
grant execute on function public.customer_care_provider_runtime_state(text,text,boolean)
to authenticated;
