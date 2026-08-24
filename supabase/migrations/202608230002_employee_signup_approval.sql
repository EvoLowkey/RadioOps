begin;

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists approval_status text not null default 'PENDING';
alter table public.profiles add column if not exists approved_at timestamptz null;
alter table public.profiles add column if not exists approved_by uuid null references public.profiles(id);
alter table public.profiles add column if not exists rejected_at timestamptz null;
alter table public.profiles add column if not exists disabled_at timestamptz null;
alter table public.profiles add column if not exists last_status_change_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='profiles_approval_status_check'
      and conrelid='public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_approval_status_check
      check (approval_status in ('PENDING','ACTIVE','REJECTED','DISABLED'));
  end if;
end $$;

-- Preserve the current production users. Existing active accounts stay active;
-- existing inactive accounts become disabled.
update public.profiles p
set approval_status = case when p.is_active then 'ACTIVE' else 'DISABLED' end,
    approved_at = case when p.is_active then coalesce(p.approved_at,p.created_at,now()) else p.approved_at end,
    disabled_at = case when not p.is_active then coalesce(p.disabled_at,now()) else null end,
    last_status_change_at = coalesce(p.last_status_change_at,now()),
    email = coalesce(p.email,u.email)
from auth.users u
where u.id=p.id
  and (p.approval_status='PENDING' or p.email is null);

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true and p.approval_status='ACTIVE'
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='MANAGER' and p.is_active=true and p.approval_status='ACTIVE'
  );
$$;

-- Self-service signup hook. Only these three metadata fields are trusted.
-- Role/status/active values supplied by a browser are ignored completely.
-- Forced values: role = 'EMPLOYEE', approval_status = 'PENDING', is_active = false.
create or replace function public.handle_new_radioops_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(new.raw_user_meta_data->>'display_name',''));
  v_employee_id text := trim(coalesce(new.raw_user_meta_data->>'employee_id',''));
  v_department text := trim(coalesce(new.raw_user_meta_data->>'department',''));
begin
  if v_name='' then raise exception 'Display name is required'; end if;
  if v_employee_id='' then raise exception 'Employee ID is required'; end if;
  if v_department='' then raise exception 'Department is required'; end if;

  insert into public.profiles(
    id,employee_id,display_name,department,email,role,is_active,approval_status,
    approved_at,approved_by,rejected_at,disabled_at,last_status_change_at
  ) values (
    new.id,v_employee_id,v_name,v_department,new.email,
    'EMPLOYEE',false,'PENDING',null,null,null,null,now()
  );
  return new;
exception
  when unique_violation then
    raise exception 'Employee ID is already registered. Contact a Manager.';
end;
$$;

drop trigger if exists on_auth_user_created_radioops on auth.users;
create trigger on_auth_user_created_radioops
after insert on auth.users
for each row execute function public.handle_new_radioops_user();

-- RLS: any authenticated user may read only their own profile unless they are
-- an active Manager. Fleet access remains limited to active approved users.
drop policy if exists profiles_select_self_or_manager on public.profiles;
create policy profiles_select_self_or_manager on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_manager());

drop policy if exists radios_select_active on public.radios;
create policy radios_select_active on public.radios
for select to authenticated
using (public.is_active_user());

drop policy if exists assignments_select_self_or_manager on public.assignments;
create policy assignments_select_self_or_manager on public.assignments
for select to authenticated
using ((profile_id = auth.uid() and public.is_active_user()) or public.is_manager());

drop policy if exists audit_select_manager on public.audit_events;
create policy audit_select_manager on public.audit_events
for select to authenticated
using (public.is_manager());

create or replace function public.approve_employee(p_profile_id uuid)
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
  if target.role='MANAGER' then raise exception 'Manager profiles cannot be changed from employee administration'; end if;

  update public.profiles
  set approval_status='ACTIVE', is_active=true, approved_at=now(), approved_by=caller.id,
      rejected_at=null, disabled_at=null, last_status_change_at=now(), updated_at=now()
  where id=target.id returning * into target;

  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(caller.id,'EMPLOYEE_APPROVED',jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));
  return jsonb_build_object('id',target.id,'approval_status',target.approval_status,'is_active',target.is_active);
end;
$$;

create or replace function public.reject_employee(p_profile_id uuid)
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
  if target.role='MANAGER' then raise exception 'Manager profiles cannot be changed from employee administration'; end if;

  update public.profiles
  set approval_status='REJECTED', is_active=false, rejected_at=now(), disabled_at=null,
      last_status_change_at=now(), updated_at=now()
  where id=target.id returning * into target;

  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(caller.id,'EMPLOYEE_REJECTED',jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));
  return jsonb_build_object('id',target.id,'approval_status',target.approval_status,'is_active',target.is_active);
end;
$$;

create or replace function public.disable_employee(p_profile_id uuid)
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
  if p_profile_id=caller.id then raise exception 'Managers cannot disable their own account'; end if;
  select * into target from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'Employee profile not found'; end if;
  if target.role='MANAGER' then raise exception 'Manager profiles cannot be changed from employee administration'; end if;
  if exists(select 1 from public.assignments where profile_id=target.id and return_at is null) then
    raise exception 'Employee must return their assigned radio before access can be disabled';
  end if;

  update public.profiles
  set approval_status='DISABLED', is_active=false, disabled_at=now(), last_status_change_at=now(), updated_at=now()
  where id=target.id returning * into target;
  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(caller.id,'EMPLOYEE_DISABLED',jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));
  return jsonb_build_object('id',target.id,'approval_status',target.approval_status,'is_active',target.is_active);
end;
$$;

create or replace function public.enable_employee(p_profile_id uuid)
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
  if target.role='MANAGER' then raise exception 'Manager profiles cannot be changed from employee administration'; end if;

  update public.profiles
  set approval_status='ACTIVE', is_active=true, approved_at=coalesce(approved_at,now()), approved_by=caller.id,
      rejected_at=null, disabled_at=null, last_status_change_at=now(), updated_at=now()
  where id=target.id returning * into target;
  insert into public.audit_events(actor_profile_id,event_type,metadata)
  values(caller.id,'EMPLOYEE_ENABLED',jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));
  return jsonb_build_object('id',target.id,'approval_status',target.approval_status,'is_active',target.is_active);
end;
$$;

-- Re-issue operational functions with approval-aware caller checks.
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
  select * into caller from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved authenticated profile required'; end if;
  target_id := coalesce(p_target_profile_id, caller.id);
  select * into target from public.profiles where id=target_id and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Target employee profile is missing, inactive, or unapproved'; end if;
  if caller.role <> 'MANAGER' and target.id <> caller.id then raise exception 'Permission denied: employees may only check out to themselves'; end if;
  if caller.role <> 'MANAGER' and exists(select 1 from public.assignments where profile_id=caller.id and return_at is null) then
    raise exception 'Employee already has a checked out radio';
  end if;

  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  if r.status <> 'AVAILABLE' then raise exception 'Radio is no longer available'; end if;

  insert into public.assignments(radio_id,profile_id,employee_id_snapshot,employee_name_snapshot,department_snapshot,checkout_at,expected_return_at,issued_by)
  values(r.id,target.id,target.employee_id,target.display_name,target.department,now(),p_expected_return_at,caller.id)
  returning * into a;
  update public.radios set status='IN_USE',assigned_profile_id=target.id,checkout_at=a.checkout_at,expected_return_at=p_expected_return_at,dock_state='EMPTY',updated_at=now() where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'RADIO_CHECKOUT',r.id,a.id,jsonb_build_object('target_profile_id',target.id,'employee_id',target.employee_id));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'profile_id',target.id,'checkout_at',a.checkout_at,'expected_return_at',p_expected_return_at);
end;
$$;

create or replace function public.return_radio(p_radio_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; a public.assignments%rowtype; r public.radios%rowtype;
begin
  select * into caller from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved authenticated profile required'; end if;
  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  select * into a from public.assignments where radio_id=r.id and return_at is null for update;
  if not found then raise exception 'Radio has no open assignment'; end if;
  if caller.role <> 'MANAGER' and a.profile_id <> caller.id then raise exception 'Permission denied: employees may only return their own radio'; end if;
  update public.assignments set return_at=now(),returned_by=caller.id where id=a.id returning * into a;
  update public.radios set status='AVAILABLE',assigned_profile_id=null,checkout_at=null,expected_return_at=null,last_returned_at=a.return_at,dock_state='CHARGING',updated_at=now() where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'RADIO_RETURN',r.id,a.id,jsonb_build_object('profile_id',a.profile_id));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'return_at',a.return_at);
end;
$$;

create or replace function public.set_radio_repair(p_radio_id text,p_in_repair boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller public.profiles%rowtype; r public.radios%rowtype; next_status text; next_dock text;
begin
  select * into caller from public.profiles where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: manager required'; end if;
  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  if p_in_repair and r.status <> 'AVAILABLE' then raise exception 'Only available radios can enter repair'; end if;
  if not p_in_repair and r.status <> 'REPAIR' then raise exception 'Radio is not in repair'; end if;
  next_status := case when p_in_repair then 'REPAIR' else 'AVAILABLE' end;
  next_dock := case when p_in_repair then 'FAULT' else 'FULL' end;
  update public.radios set status=next_status,dock_state=next_dock,updated_at=now() where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
  values(caller.id,case when p_in_repair then 'RADIO_REPAIR_OPEN' else 'RADIO_REPAIR_CLOSED' end,r.id,'{}'::jsonb);
  return jsonb_build_object('radio_id',r.id,'status',next_status,'dock_state',next_dock);
end; $$;

create or replace function public.set_dock_state(p_radio_id text,p_dock_state text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller public.profiles%rowtype; r public.radios%rowtype; normalized text;
begin
  select * into caller from public.profiles where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: manager required'; end if;
  normalized := upper(trim(p_dock_state));
  if normalized not in ('EMPTY','CHARGING','FULL','FAULT') then raise exception 'Invalid dock state'; end if;
  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  update public.radios set dock_state=normalized,updated_at=now() where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
  values(caller.id,'DOCK_STATE_CHANGED',r.id,jsonb_build_object('from',r.dock_state,'to',normalized));
  return jsonb_build_object('radio_id',r.id,'dock_state',normalized);
end; $$;

revoke all on function public.approve_employee(uuid) from public;
revoke all on function public.reject_employee(uuid) from public;
revoke all on function public.disable_employee(uuid) from public;
revoke all on function public.enable_employee(uuid) from public;
grant execute on function public.approve_employee(uuid) to authenticated;
grant execute on function public.reject_employee(uuid) to authenticated;
grant execute on function public.disable_employee(uuid) to authenticated;
grant execute on function public.enable_employee(uuid) to authenticated;


-- Include profile changes in Supabase Realtime when the publication is available.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

commit;
