begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text unique not null,
  display_name text not null,
  department text not null,
  role text not null check (role in ('EMPLOYEE','MANAGER')) default 'EMPLOYEE',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.radios (
  id text primary key check (id ~ '^WT-(0[1-9]|[12][0-9]|3[0-9]|40)$'),
  asset_number integer unique not null check (asset_number between 1 and 40),
  status text not null check (status in ('AVAILABLE','IN_USE','REPAIR')) default 'AVAILABLE',
  dock_slot integer unique not null check (dock_slot between 1 and 40),
  dock_state text not null check (dock_state in ('EMPTY','CHARGING','FULL','FAULT')) default 'FULL',
  assigned_profile_id uuid null references public.profiles(id),
  checkout_at timestamptz null,
  expected_return_at timestamptz null,
  last_returned_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  radio_id text not null references public.radios(id),
  profile_id uuid not null references public.profiles(id),
  employee_id_snapshot text not null,
  employee_name_snapshot text not null,
  department_snapshot text not null,
  checkout_at timestamptz not null default now(),
  expected_return_at timestamptz null,
  return_at timestamptz null,
  issued_by uuid not null references public.profiles(id),
  returned_by uuid null references public.profiles(id)
);

create unique index if not exists assignments_one_open_per_radio
  on public.assignments (radio_id) where return_at is null;

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_profile_id uuid null references public.profiles(id),
  event_type text not null,
  radio_id text null references public.radios(id),
  assignment_id uuid null references public.assignments(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.radios (id,asset_number,dock_slot,status,dock_state)
select 'WT-' || lpad(n::text,2,'0'), n, n, 'AVAILABLE', 'FULL'
from generate_series(1,40) as n
on conflict (id) do nothing;

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p from public.profiles p where p.id = auth.uid() and p.is_active = true;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true);
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role='MANAGER');
$$;

alter table public.profiles enable row level security;
alter table public.radios enable row level security;
alter table public.assignments enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.profiles, public.radios, public.assignments, public.audit_events from anon;
revoke insert, update, delete on public.profiles, public.radios, public.assignments, public.audit_events from authenticated;
grant select on public.profiles, public.radios, public.assignments, public.audit_events to authenticated;

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
using (profile_id = auth.uid() or public.is_manager());

drop policy if exists audit_select_manager on public.audit_events;
create policy audit_select_manager on public.audit_events
for select to authenticated
using (public.is_manager());

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
  caller public.profiles%rowtype;
  target public.profiles%rowtype;
  r public.radios%rowtype;
  a public.assignments%rowtype;
  target_id uuid;
begin
  select * into caller from public.profiles where id=auth.uid() and is_active=true;
  if not found then raise exception 'Active authenticated profile required'; end if;
  target_id := coalesce(p_target_profile_id, caller.id);
  select * into target from public.profiles where id=target_id and is_active=true;
  if not found then raise exception 'Target employee profile is missing or inactive'; end if;
  if caller.role <> 'MANAGER' and target.id <> caller.id then raise exception 'Permission denied: employees may only check out to themselves'; end if;

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
declare
  caller public.profiles%rowtype;
  a public.assignments%rowtype;
  r public.radios%rowtype;
begin
  select * into caller from public.profiles where id=auth.uid() and is_active=true;
  if not found then raise exception 'Active authenticated profile required'; end if;

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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; r public.radios%rowtype; next_status text; next_dock text;
begin
  select * into caller from public.profiles where id=auth.uid() and is_active=true and role='MANAGER';
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
end;
$$;

create or replace function public.set_dock_state(p_radio_id text,p_dock_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller public.profiles%rowtype; r public.radios%rowtype; normalized text;
begin
  select * into caller from public.profiles where id=auth.uid() and is_active=true and role='MANAGER';
  if not found then raise exception 'Permission denied: manager required'; end if;
  normalized := upper(trim(p_dock_state));
  if normalized not in ('EMPTY','CHARGING','FULL','FAULT') then raise exception 'Invalid dock state'; end if;
  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  update public.radios set dock_state=normalized,updated_at=now() where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
  values(caller.id,'DOCK_STATE_CHANGED',r.id,jsonb_build_object('from',r.dock_state,'to',normalized));
  return jsonb_build_object('radio_id',r.id,'dock_state',normalized);
end;
$$;

revoke all on function public.checkout_radio(text,uuid,timestamptz) from public;
revoke all on function public.return_radio(text) from public;
revoke all on function public.set_radio_repair(text,boolean) from public;
revoke all on function public.set_dock_state(text,text) from public;
grant execute on function public.checkout_radio(text,uuid,timestamptz) to authenticated;
grant execute on function public.return_radio(text) to authenticated;
grant execute on function public.set_radio_repair(text,boolean) to authenticated;
grant execute on function public.set_dock_state(text,text) to authenticated;

commit;
