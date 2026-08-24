begin;

-- Keep removed employee profiles as archival identity records so assignment and
-- audit history continue to point at the person who originally performed them.
alter table public.profiles add column if not exists removed_at timestamptz null;
alter table public.profiles add column if not exists removed_by uuid null references public.profiles(id);

-- Profiles must be allowed to outlive auth.users after a manager permanently
-- removes a login. The profile UUID remains useful as an immutable history key.
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- A removed employee may later sign up again with the same employee ID. Only
-- non-removed profiles must remain unique.
alter table public.profiles drop constraint if exists profiles_employee_id_key;
drop index if exists profiles_employee_id_key;
create unique index if not exists profiles_employee_id_active_unique
  on public.profiles (employee_id)
  where approval_status <> 'REMOVED';

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('PENDING','ACTIVE','REJECTED','DISABLED','REMOVED'));

create or replace function public.archive_employee_for_removal(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  select * into caller
  from public.profiles
  where id=auth.uid()
    and role='MANAGER'
    and is_active=true
    and approval_status='ACTIVE';
  if not found then
    raise exception 'Permission denied: active manager required';
  end if;

  select * into target from public.profiles where id=p_profile_id for update;
  if not found then
    raise exception 'Employee profile not found';
  end if;
  if target.role='MANAGER' then
    raise exception 'Managers cannot be removed from employee administration';
  end if;
  if target.approval_status='REMOVED' then
    raise exception 'Employee is already removed';
  end if;
  if exists(
    select 1 from public.assignments
    where profile_id=target.id and return_at is null
  ) then
    raise exception 'Employee has an open assignment. Return the assigned radio before removal';
  end if;

  update public.profiles
  set approval_status='REMOVED',
      is_active=false,
      removed_at=now(),
      removed_by=caller.id,
      disabled_at=coalesce(disabled_at,now()),
      last_status_change_at=now(),
      updated_at=now()
  where id=target.id
  returning * into target;

  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(
    caller.id,
    'EMPLOYEE_REMOVED',
    jsonb_build_object(
      'target_profile_id',target.id,
      'employee_id',target.employee_id,
      'display_name',target.display_name,
      'history_preserved',true,
      'signup_required_again',true
    )
  );

  return jsonb_build_object(
    'id',target.id,
    'employee_id',target.employee_id,
    'approval_status',target.approval_status,
    'is_active',target.is_active,
    'removed_at',target.removed_at
  );
end;
$$;

revoke all on function public.archive_employee_for_removal(uuid) from public;
grant execute on function public.archive_employee_for_removal(uuid) to authenticated;

commit;
