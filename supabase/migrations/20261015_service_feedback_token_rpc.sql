-- Token-gated anonymous feedback with no anonymous table grants.
-- Google review link is independent of rating; never filter low ratings.
begin;

create or replace function public.get_service_feedback_session(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_request public.service_feedback_requests%rowtype;
  v_job public.service_jobs%rowtype;
  v_review text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('valid',false);
  end if;
  select * into v_request from public.service_feedback_requests
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and revoked_at is null and expires_at>now();
  if not found then return jsonb_build_object('valid',false); end if;
  select * into v_job from public.service_jobs
    where id=v_request.service_job_id and status='completed';
  if not found then return jsonb_build_object('valid',false); end if;
  select google_review_url into v_review
    from public.service_feedback_settings where singleton=true;
  return jsonb_build_object(
    'valid',true,'job_number',v_job.job_number,
    'already_submitted',v_request.submitted_at is not null,
    'google_review_url',v_review);
end;
$$;
revoke all on function public.get_service_feedback_session(text) from public,anon,authenticated;
grant execute on function public.get_service_feedback_session(text) to anon,authenticated;

create or replace function public.submit_service_feedback(
  p_token text,p_rating integer,p_comments text default null,
  p_callback_requested boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_request public.service_feedback_requests%rowtype;
  v_review text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired feedback link';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Select a satisfaction rating from 1 to 5';
  end if;
  if char_length(coalesce(p_comments,''))>2000 then
    raise exception 'Feedback comments are too long';
  end if;
  select * into v_request from public.service_feedback_requests
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and expires_at>now() and revoked_at is null
  for update;
  if not found or v_request.submitted_at is not null then
    raise exception 'Feedback link is invalid, expired or already used';
  end if;
  if not exists(select 1 from public.service_jobs
    where id=v_request.service_job_id and status='completed') then
    raise exception 'Feedback is not available for this service';
  end if;
  insert into public.service_feedback(
    service_job_id,request_id,rating,comments,callback_requested)
  values(v_request.service_job_id,v_request.id,p_rating,
    nullif(btrim(coalesce(p_comments,'')),''),coalesce(p_callback_requested,false));
  update public.service_feedback_requests set submitted_at=now()
    where id=v_request.id;
  if coalesce(p_callback_requested,false) then
    update public.service_jobs set callback_required=true
      where id=v_request.service_job_id;
  end if;
  select google_review_url into v_review from public.service_feedback_settings
    where singleton=true;
  return jsonb_build_object('ok',true,'google_review_url',v_review);
end;
$$;
revoke all on function public.submit_service_feedback(text,integer,text,boolean)
  from public,anon,authenticated;
grant execute on function public.submit_service_feedback(text,integer,text,boolean)
  to anon,authenticated;

commit;
