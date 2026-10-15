-- Only an active administrator can issue/revoke a feedback link.
-- 256-bit tokens are returned once and only SHA-256 hashes are persisted.
begin;

create or replace function public.issue_service_feedback_link(p_service_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_job public.service_jobs%rowtype;
  v_existing public.service_feedback_requests%rowtype;
  v_token text;
  v_expiry timestamptz:=now()+interval '14 days';
begin
  if not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into v_job from public.service_jobs where id=p_service_job_id;
  if not found or v_job.status<>'completed' then
    raise exception 'Only completed service jobs can request feedback';
  end if;
  select * into v_existing from public.service_feedback_requests
    where service_job_id=p_service_job_id for update;
  if found and v_existing.submitted_at is not null then
    raise exception 'Feedback has already been submitted for this service';
  end if;
  if found and v_existing.issued_at>now()-interval '10 minutes' then
    raise exception 'Please use the previously generated link or retry after 10 minutes';
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.service_feedback_requests(
    service_job_id,token_hash,issued_by,issued_at,expires_at,submitted_at,revoked_at
  ) values(
    p_service_job_id,encode(extensions.digest(v_token,'sha256'),'hex'),
    auth.uid(),now(),v_expiry,null,null
  )
  on conflict(service_job_id) do update
  set token_hash=excluded.token_hash,issued_by=excluded.issued_by,
      issued_at=excluded.issued_at,expires_at=excluded.expires_at,
      submitted_at=null,revoked_at=null;
  return jsonb_build_object('token',v_token,'expires_at',v_expiry,
     'job_number',v_job.job_number);
end;
$$;
revoke all on function public.issue_service_feedback_link(uuid) from public,anon,authenticated;
grant execute on function public.issue_service_feedback_link(uuid) to authenticated;

create or replace function public.revoke_service_feedback_link(p_service_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  update public.service_feedback_requests set revoked_at=now()
  where service_job_id=p_service_job_id and submitted_at is null;
  return jsonb_build_object('revoked',found);
end;
$$;
revoke all on function public.revoke_service_feedback_link(uuid) from public,anon,authenticated;
grant execute on function public.revoke_service_feedback_link(uuid) to authenticated;

commit;
