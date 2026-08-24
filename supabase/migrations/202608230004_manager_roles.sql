begin;

alter table public.profiles add column if not exists is_primary_manager boolean not null default false;

-- Protect the original RadioOps manager account (employee ID 1001).
update public.profiles
set is_primary_manager=true,
    role='MANAGER',
    department='Management',
    is_active=true,
    approval_status='ACTIVE',
    updated_at=now()
where employee_id='1001';

create unique index if not exists profiles_one_primary_manager
  on public.profiles (is_primary_manager)
  where is_primary_manager=true;

create or replace function public.promote_to_manager(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; target public.profiles%rowtype;
begin
  select * into caller from public.profiles
    where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: active manager required'; end if;

  select * into target from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'Employee profile not found'; end if;
  if target.role='MANAGER' then raise exception 'Account is already a Manager'; end if;
  if not target.is_active or target.approval_status<>'ACTIVE' then raise exception 'Only active approved employees can be promoted'; end if;

  update public.profiles
  set role='MANAGER', department='Management', updated_at=now(), last_status_change_at=now()
  where id=target.id returning * into target;

  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(caller.id,'MANAGER_PROMOTED',jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));

  return jsonb_build_object('id',target.id,'role',target.role,'department',target.department,'is_primary_manager',target.is_primary_manager);
end;
$$;

create or replace function public.demote_manager(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; target public.profiles%rowtype; manager_count integer;
begin
  select * into caller from public.profiles
    where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: active manager required'; end if;

  select * into target from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'Manager profile not found'; end if;
  if target.role<>'MANAGER' then raise exception 'Account is not a Manager'; end if;
  if target.is_primary_manager then raise exception 'Primary Manager cannot be demoted'; end if;

  select count(*) into manager_count from public.profiles
    where role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if manager_count <= 1 then raise exception 'The last remaining Manager cannot be demoted'; end if;

  update public.profiles
  set role='EMPLOYEE', department='Valet Associate', is_primary_manager=false,
      updated_at=now(), last_status_change_at=now()
  where id=target.id returning * into target;

  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(caller.id,'MANAGER_DEMOTED',jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));

  return jsonb_build_object('id',target.id,'role',target.role,'department',target.department,'is_primary_manager',target.is_primary_manager);
end;
$$;

revoke all on function public.promote_to_manager(uuid) from public;
revoke all on function public.demote_manager(uuid) from public;
grant execute on function public.promote_to_manager(uuid) to authenticated;
grant execute on function public.demote_manager(uuid) to authenticated;

commit;
