-- Hardening: public feedback RPCs expose only SECURITY INVOKER wrappers.
-- Privileged SQL implementations move to an unexposed dedicated schema.
-- No business data, tokens, reviews or feedback records are changed.
begin;
create schema if not exists feedback_private;
revoke all on schema feedback_private from public,anon,authenticated;
grant usage on schema feedback_private to anon,authenticated;

do $clone$
declare
  v_name text;
  v_oid oid;
  v_definition text;
begin
  foreach v_name in array array[
    'get_service_feedback_session',
    'submit_service_feedback',
    'issue_service_feedback_link',
    'revoke_service_feedback_link'
  ] loop
    select p.oid into v_oid
    from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public' and p.proname=v_name;
    if v_oid is null then
      raise exception 'Missing feedback implementation: %',v_name;
    end if;
    v_definition:=pg_get_functiondef(v_oid);
    if position('SECURITY DEFINER' in v_definition)=0
       or position('FUNCTION public.'||v_name||'(' in v_definition)=0
       or position('SET search_path TO ''''' in v_definition)=0
    then
      raise exception 'Unexpected definition for feedback function: %',v_name;
    end if;
    v_definition:=replace(v_definition,
      'FUNCTION public.'||v_name||'(',
      'FUNCTION feedback_private.'||v_name||'(');
    execute v_definition;
  end loop;
end;
$clone$;

-- Existing browser/client RPC signatures, argument defaults and return schemas
-- are preserved. The privately stored token hash is not exposed as an API row.
create or replace function public.get_service_feedback_session(p_token text)
returns jsonb language sql security invoker set search_path='' as $fn$
  select feedback_private.get_service_feedback_session(p_token);
$fn$;

create or replace function public.submit_service_feedback(
  p_token text,p_rating integer,p_comments text default null,
  p_callback_requested boolean default false)
returns jsonb language sql security invoker set search_path='' as $fn$
  select feedback_private.submit_service_feedback(
    p_token,p_rating,p_comments,p_callback_requested);
$fn$;

create or replace function public.issue_service_feedback_link(p_service_job_id uuid)
returns jsonb language sql security invoker set search_path='' as $fn$
  select feedback_private.issue_service_feedback_link(p_service_job_id);
$fn$;

create or replace function public.revoke_service_feedback_link(p_service_job_id uuid)
returns jsonb language sql security invoker set search_path='' as $fn$
  select feedback_private.revoke_service_feedback_link(p_service_job_id);
$fn$;

-- Both schemas explicitly restrict function EXECUTE. No default PUBLIC grant.
revoke all on function
  feedback_private.get_service_feedback_session(text),
  feedback_private.submit_service_feedback(text,integer,text,boolean),
  feedback_private.issue_service_feedback_link(uuid),
  feedback_private.revoke_service_feedback_link(uuid)
  from public,anon,authenticated;
grant execute on function
  feedback_private.get_service_feedback_session(text),
  feedback_private.submit_service_feedback(text,integer,text,boolean)
  to anon,authenticated;
grant execute on function
  feedback_private.issue_service_feedback_link(uuid),
  feedback_private.revoke_service_feedback_link(uuid)
  to authenticated;

revoke all on function
  public.get_service_feedback_session(text),
  public.submit_service_feedback(text,integer,text,boolean),
  public.issue_service_feedback_link(uuid),
  public.revoke_service_feedback_link(uuid)
  from public,anon,authenticated;
grant execute on function
  public.get_service_feedback_session(text),
  public.submit_service_feedback(text,integer,text,boolean)
  to anon,authenticated;
grant execute on function
  public.issue_service_feedback_link(uuid),
  public.revoke_service_feedback_link(uuid)
  to authenticated;

-- Explicit deny policy documents intent; sensitive tables still have NO
-- anonymous/authenticated table privileges. Admin only sees response records.
drop policy if exists service_feedback_requests_deny_api
on public.service_feedback_requests;
create policy service_feedback_requests_deny_api
on public.service_feedback_requests for all to anon,authenticated
using(false) with check(false);
commit;
