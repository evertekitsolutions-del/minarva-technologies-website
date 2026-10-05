-- Operations — Milestone 3A3 security/performance hardening.
-- Keep privileged implementation functions outside the exposed API schema and
-- expose SECURITY INVOKER wrappers only. Technician clients use RPCs, not direct table reads.

alter function public.technician_claim_profile() set schema private;
alter function public.technician_get_profile() set schema private;
alter function public.technician_get_queue() set schema private;
alter function public.technician_get_job(uuid) set schema private;
alter function public.technician_apply_mobile_action(uuid,uuid,text,jsonb) set schema private;

revoke all on function private.technician_claim_profile() from public,anon;
revoke all on function private.technician_get_profile() from public,anon;
revoke all on function private.technician_get_queue() from public,anon;
revoke all on function private.technician_get_job(uuid) from public,anon;
revoke all on function private.technician_apply_mobile_action(uuid,uuid,text,jsonb) from public,anon;

grant execute on function private.technician_claim_profile() to authenticated;
grant execute on function private.technician_get_profile() to authenticated;
grant execute on function private.technician_get_queue() to authenticated;
grant execute on function private.technician_get_job(uuid) to authenticated;
grant execute on function private.technician_apply_mobile_action(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.technician_claim_profile()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.technician_claim_profile();
$$;

create or replace function public.technician_get_profile()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.technician_get_profile();
$$;

create or replace function public.technician_get_queue()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.technician_get_queue();
$$;

create or replace function public.technician_get_job(p_job_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.technician_get_job(p_job_id);
$$;

create or replace function public.technician_apply_mobile_action(
  p_client_action_id uuid,
  p_service_job_id uuid,
  p_action_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.technician_apply_mobile_action(
    p_client_action_id,p_service_job_id,p_action_type,p_payload
  );
$$;

revoke all on function public.technician_claim_profile() from public,anon,authenticated;
revoke all on function public.technician_get_profile() from public,anon,authenticated;
revoke all on function public.technician_get_queue() from public,anon,authenticated;
revoke all on function public.technician_get_job(uuid) from public,anon,authenticated;
revoke all on function public.technician_apply_mobile_action(uuid,uuid,text,jsonb) from public,anon,authenticated;

grant execute on function public.technician_claim_profile() to authenticated;
grant execute on function public.technician_get_profile() to authenticated;
grant execute on function public.technician_get_queue() to authenticated;
grant execute on function public.technician_get_job(uuid) to authenticated;
grant execute on function public.technician_apply_mobile_action(uuid,uuid,text,jsonb) to authenticated;

-- Technician app never needs direct Data API access to these tables.
-- Remove parallel technician SELECT policies and keep all technician access behind scoped RPCs.
drop policy if exists "technician_select_self" on public.technicians;
drop policy if exists "technician_select_assigned_jobs" on public.service_jobs;
drop policy if exists "technician_select_assigned_materials" on public.service_job_materials;
drop policy if exists "technician_select_assigned_attachments" on public.service_job_attachments;
drop policy if exists "technician_select_assigned_events" on public.service_job_events;
drop policy if exists "technician_select_own_mobile_actions" on public.technician_mobile_actions;

-- Consolidate private media policies so SELECT/INSERT/DELETE each have one
-- permissive authenticated policy. Admins retain full access; technicians are
-- limited to /<assigned-job-id>/mobile/* and can only delete objects they own.
drop policy if exists "service_job_media_admin_select" on storage.objects;
drop policy if exists "service_job_media_admin_insert" on storage.objects;
drop policy if exists "service_job_media_admin_delete" on storage.objects;
drop policy if exists "service_job_media_technician_select" on storage.objects;
drop policy if exists "service_job_media_technician_insert" on storage.objects;
drop policy if exists "service_job_media_technician_delete_own" on storage.objects;

create policy "service_job_media_actor_select"
on storage.objects for select to authenticated
using (
  bucket_id='service-job-media'
  and (
    (select private.is_active_admin())
    or (
      (storage.foldername(name))[2]='mobile'
      and exists(
        select 1
        from public.service_jobs j
        where j.id::text=(storage.foldername(name))[1]
          and j.assigned_technician_id=private.current_technician_id()
      )
    )
  )
);

create policy "service_job_media_actor_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='service-job-media'
  and (
    (select private.is_active_admin())
    or (
      (storage.foldername(name))[2]='mobile'
      and exists(
        select 1
        from public.service_jobs j
        where j.id::text=(storage.foldername(name))[1]
          and j.assigned_technician_id=private.current_technician_id()
      )
    )
  )
);

create policy "service_job_media_actor_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='service-job-media'
  and (
    (select private.is_active_admin())
    or (
      (storage.foldername(name))[2]='mobile'
      and owner_id=(select auth.uid()::text)
      and exists(
        select 1
        from public.service_jobs j
        where j.id::text=(storage.foldername(name))[1]
          and j.assigned_technician_id=private.current_technician_id()
      )
    )
  )
);
