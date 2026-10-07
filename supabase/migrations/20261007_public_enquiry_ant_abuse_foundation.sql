-- Platform — Milestone 4A1
-- Public enquiry anti-abuse foundation. Keeps current anon insert temporarily
-- until the hardened Edge Function + website client are deployed.

create table if not exists public.public_enquiry_submission_attempts (
  id bigint generated always as identity primary key,
  fingerprint_hash text not null,
  phone_hash text,
  accepted boolean not null default false,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists public_enquiry_attempts_fingerprint_created_idx
  on public.public_enquiry_submission_attempts(fingerprint_hash,created_at desc);
create index if not exists public_enquiry_attempts_phone_created_idx
  on public.public_enquiry_submission_attempts(phone_hash,created_at desc)
  where phone_hash is not null;
create index if not exists public_enquiry_attempts_created_idx
  on public.public_enquiry_submission_attempts(created_at desc);

alter table public.public_enquiry_submission_attempts enable row level security;
revoke all on public.public_enquiry_submission_attempts from anon,authenticated;
revoke all on sequence public.public_enquiry_submission_attempts_id_seq from anon,authenticated;

create or replace function public.consume_public_enquiry_quota(
  p_fingerprint_hash text,
  p_phone_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_fingerprint text:=nullif(btrim(coalesce(p_fingerprint_hash,'')),'');
  v_phone text:=nullif(btrim(coalesce(p_phone_hash,'')),'');
  v_fp_count integer;
  v_phone_count integer;
  v_allowed boolean:=true;
  v_reason text;
begin
  if v_fingerprint is null or char_length(v_fingerprint)>128 then
    raise exception 'Invalid submission fingerprint';
  end if;
  if v_phone is not null and char_length(v_phone)>128 then
    raise exception 'Invalid phone fingerprint';
  end if;

  -- Serialize requests for the same fingerprint to avoid burst races.
  perform pg_advisory_xact_lock(hashtextextended(v_fingerprint,0));

  select count(*) into v_fp_count
  from public.public_enquiry_submission_attempts a
  where a.fingerprint_hash=v_fingerprint
    and a.created_at>=now()-interval '15 minutes';

  if v_phone is not null then
    select count(*) into v_phone_count
    from public.public_enquiry_submission_attempts a
    where a.phone_hash=v_phone
      and a.created_at>=now()-interval '30 minutes';
  else
    v_phone_count:=0;
  end if;

  if v_fp_count>=5 then
    v_allowed:=false;
    v_reason:='Too many submissions from this client. Please try again later.';
  elsif v_phone_count>=3 then
    v_allowed:=false;
    v_reason:='Too many recent submissions for this phone number. Please try again later.';
  end if;

  insert into public.public_enquiry_submission_attempts(
    fingerprint_hash,phone_hash,accepted,rejection_reason
  )
  values(
    v_fingerprint,v_phone,v_allowed,
    case when v_allowed then null else v_reason end
  );

  return jsonb_build_object(
    'allowed',v_allowed,
    'reason',v_reason,
    'fingerprint_count_before',v_fp_count,
    'phone_count_before',v_phone_count
  );
end;
$$;

revoke all on function public.consume_public_enquiry_quota(text,text)
from public,anon,authenticated;
grant execute on function public.consume_public_enquiry_quota(text,text)
to service_role;

create or replace function public.submit_public_enquiry(
  p_name text,
  p_phone text,
  p_email text,
  p_service text,
  p_message text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_name text:=btrim(coalesce(p_name,''));
  v_phone text:=btrim(coalesce(p_phone,''));
  v_email text:=nullif(btrim(coalesce(p_email,'')),'');
  v_service text:=btrim(coalesce(p_service,''));
  v_message text:=nullif(btrim(coalesce(p_message,'')),'');
  v_id bigint;
begin
  if char_length(v_name)<2 or char_length(v_name)>120 then
    raise exception 'Name must be between 2 and 120 characters';
  end if;
  if char_length(v_phone)<7 or char_length(v_phone)>30 then
    raise exception 'Phone number must be between 7 and 30 characters';
  end if;
  if v_phone !~ '^[+0-9() .-]+$' then
    raise exception 'Phone number contains unsupported characters';
  end if;
  if char_length(v_service)<2 or char_length(v_service)>120 then
    raise exception 'Service must be between 2 and 120 characters';
  end if;
  if v_email is not null then
    if char_length(v_email)>320 or v_email !~* '^[A-Z0-9._%+''-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      raise exception 'Email address is invalid';
    end if;
  end if;
  if v_message is not null and char_length(v_message)>4000 then
    raise exception 'Message is too long';
  end if;

  insert into public.enquiries(
    name,phone,email,service,message,source,status,
    internal_notes,follow_up_at,customer_id
  )
  values(
    v_name,v_phone,v_email,v_service,v_message,'website','new',
    null,null,null
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_public_enquiry(text,text,text,text,text)
from public,anon,authenticated;
grant execute on function public.submit_public_enquiry(text,text,text,text,text)
to service_role;
