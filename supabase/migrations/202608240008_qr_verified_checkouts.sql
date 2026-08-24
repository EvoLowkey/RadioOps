begin;

-- Manual checkout is a Manager-only override/admin action. Regular employees
-- must use checkout_radio_verified so their physical QR scan is recorded.
create or replace function public.checkout_radio(
  p_radio_id text,
  p_target_profile_id uuid default null,
  p_expected_return_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller public.profiles%rowtype; target public.profiles%rowtype;
  r public.radios%rowtype; a public.assignments%rowtype; target_id uuid;
begin
  select * into caller from public.profiles
   where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: manager required for manual checkout'; end if;

  target_id := coalesce(p_target_profile_id, caller.id);
  select * into target from public.profiles
   where id=target_id and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Target employee profile is missing, inactive, or unapproved'; end if;
  if exists(select 1 from public.assignments where profile_id=target.id and return_at is null) then
    raise exception 'Employee already has a checked out radio';
  end if;

  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  if r.status <> 'AVAILABLE' then raise exception 'Radio is no longer available'; end if;

  insert into public.assignments(radio_id,profile_id,employee_id_snapshot,employee_name_snapshot,department_snapshot,checkout_at,expected_return_at,issued_by)
  values(r.id,target.id,target.employee_id,target.display_name,target.department,now(),p_expected_return_at,caller.id)
  returning * into a;
  update public.radios
     set status='IN_USE',assigned_profile_id=target.id,checkout_at=a.checkout_at,
         expected_return_at=p_expected_return_at,dock_state='EMPTY',updated_at=now()
   where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'RADIO_CHECKOUT_OVERRIDE',r.id,a.id,
         jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id,'verification','MANAGER_OVERRIDE'));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'profile_id',target.id,
                            'checkout_at',a.checkout_at,'expected_return_at',p_expected_return_at,
                            'verification','MANAGER_OVERRIDE');
end;
$$;

create or replace function public.checkout_radio_verified(
  p_radio_id text,
  p_expected_return_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller public.profiles%rowtype; r public.radios%rowtype; a public.assignments%rowtype;
begin
  select * into caller from public.profiles
   where id=auth.uid() and role='EMPLOYEE' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved employee profile required'; end if;

  if exists(select 1 from public.assignments where profile_id=caller.id and return_at is null) then
    raise exception 'Employee already has a checked out radio';
  end if;

  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  if r.status <> 'AVAILABLE' then raise exception 'Radio is no longer available'; end if;

  insert into public.assignments(radio_id,profile_id,employee_id_snapshot,employee_name_snapshot,department_snapshot,checkout_at,expected_return_at,issued_by)
  values(r.id,caller.id,caller.employee_id,caller.display_name,caller.department,now(),p_expected_return_at,caller.id)
  returning * into a;
  update public.radios
     set status='IN_USE',assigned_profile_id=caller.id,checkout_at=a.checkout_at,
         expected_return_at=p_expected_return_at,dock_state='EMPTY',updated_at=now()
   where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'QR_VERIFIED_CHECKOUT',r.id,a.id,
         jsonb_build_object('target_profile_id',caller.id,'employee_id',caller.employee_id,'verification','QR_CAMERA'));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'profile_id',caller.id,
                            'checkout_at',a.checkout_at,'expected_return_at',p_expected_return_at,
                            'verification','QR_CAMERA');
end;
$$;

revoke all on function public.checkout_radio_verified(text,timestamptz) from public;
grant execute on function public.checkout_radio_verified(text,timestamptz) to authenticated;

commit;
