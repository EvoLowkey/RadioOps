begin;

-- Manager override return. Employees must use return_radio_verified so the
-- audit trail can distinguish a camera/QR verified handoff from an override.
create or replace function public.return_radio(p_radio_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; a public.assignments%rowtype; r public.radios%rowtype;
begin
  select * into caller from public.profiles
   where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: manager required for override return'; end if;

  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  select * into a from public.assignments where radio_id=r.id and return_at is null for update;
  if not found then raise exception 'Radio has no open assignment'; end if;

  update public.assignments set return_at=now(),returned_by=caller.id where id=a.id returning * into a;
  update public.radios
     set status='AVAILABLE',assigned_profile_id=null,checkout_at=null,expected_return_at=null,
         last_returned_at=a.return_at,dock_state='CHARGING',updated_at=now()
   where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'RADIO_RETURN_OVERRIDE',r.id,a.id,
         jsonb_build_object('profile_id',a.profile_id,'verification','MANAGER_OVERRIDE'));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'return_at',a.return_at,'verification','MANAGER_OVERRIDE');
end;
$$;

create or replace function public.return_radio_verified(p_radio_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; a public.assignments%rowtype; r public.radios%rowtype;
begin
  select * into caller from public.profiles
   where id=auth.uid() and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved authenticated profile required'; end if;

  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  select * into a from public.assignments where radio_id=r.id and return_at is null for update;
  if not found then raise exception 'Radio has no open assignment'; end if;
  if caller.role <> 'MANAGER' and a.profile_id <> caller.id then
    raise exception 'Permission denied: employees may only return their own radio';
  end if;

  update public.assignments set return_at=now(),returned_by=caller.id where id=a.id returning * into a;
  update public.radios
     set status='AVAILABLE',assigned_profile_id=null,checkout_at=null,expected_return_at=null,
         last_returned_at=a.return_at,dock_state='CHARGING',updated_at=now()
   where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'QR_VERIFIED_RETURN',r.id,a.id,
         jsonb_build_object('profile_id',a.profile_id,'verification','QR_CAMERA'));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'return_at',a.return_at,'verification','QR_CAMERA');
end;
$$;

revoke all on function public.return_radio_verified(text) from public;
grant execute on function public.return_radio_verified(text) to authenticated;

commit;
