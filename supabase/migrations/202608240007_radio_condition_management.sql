begin;

alter table public.radios add column if not exists condition_reason text;
alter table public.radios add column if not exists condition_updated_at timestamptz;
alter table public.radios add column if not exists condition_updated_by uuid references public.profiles(id) on delete set null;

alter table public.radios drop constraint if exists radios_status_check;
alter table public.radios add constraint radios_status_check
  check (status in ('AVAILABLE','IN_USE','REPAIR','LOST','DAMAGED'));

create or replace function public.set_radio_condition(
  p_radio_id text,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  caller public.profiles%rowtype;
  r public.radios%rowtype;
  normalized text;
  reason text;
  has_open_assignment boolean;
  next_dock text;
begin
  select * into caller from public.profiles
   where id=auth.uid() and role='MANAGER' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Permission denied: manager required'; end if;

  normalized := upper(trim(coalesce(p_status,'')));
  reason := nullif(trim(coalesce(p_reason,'')),'');
  if normalized not in ('AVAILABLE','REPAIR','LOST','DAMAGED') then raise exception 'Invalid radio condition'; end if;
  if normalized in ('REPAIR','LOST','DAMAGED') and reason is null then raise exception 'A condition reason is required'; end if;

  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;

  select exists(select 1 from public.assignments where radio_id=r.id and return_at is null) into has_open_assignment;

  if normalized in ('REPAIR','DAMAGED') and has_open_assignment then
    raise exception 'Return or resolve the active assignment before marking this radio damaged or in repair';
  end if;
  if normalized='LOST' and r.status not in ('AVAILABLE','IN_USE','LOST') then
    raise exception 'Only an available or checked out radio can be marked lost';
  end if;
  if normalized='AVAILABLE' and has_open_assignment then
    raise exception 'Return or resolve the active assignment before marking this radio available';
  end if;
  if normalized in ('REPAIR','DAMAGED') and r.status not in ('AVAILABLE','REPAIR','DAMAGED') then
    raise exception 'Radio must be available before changing this condition';
  end if;

  next_dock := case
    when normalized in ('REPAIR','DAMAGED') then 'FAULT'
    when normalized='LOST' then 'EMPTY'
    else 'FULL'
  end;

  update public.radios
     set status=normalized,
         condition_reason=case when normalized='AVAILABLE' then null else reason end,
         condition_updated_at=now(),
         condition_updated_by=caller.id,
         dock_state=next_dock,
         updated_at=now()
   where id=r.id;

  insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
  values(caller.id,'RADIO_CONDITION_CHANGED',r.id,
    jsonb_build_object('from',r.status,'to',normalized,'reason',reason,'open_assignment',has_open_assignment));

  return jsonb_build_object('radio_id',r.id,'status',normalized,'reason',reason,'dock_state',next_dock);
end;
$$;


-- Returning a recovered Lost radio closes the assignment and clears stale condition notes.
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
         last_returned_at=a.return_at,dock_state='CHARGING',condition_reason=null,
         condition_updated_at=now(),condition_updated_by=caller.id,updated_at=now()
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
  select * into caller from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved authenticated profile required'; end if;
  select * into r from public.radios where id=upper(trim(p_radio_id)) for update;
  if not found then raise exception 'Unknown radio'; end if;
  select * into a from public.assignments where radio_id=r.id and return_at is null for update;
  if not found then raise exception 'Radio has no open assignment'; end if;
  if caller.role <> 'MANAGER' and a.profile_id <> caller.id then raise exception 'Permission denied: employees may only return their own radio'; end if;
  update public.assignments set return_at=now(),returned_by=caller.id where id=a.id returning * into a;
  update public.radios
     set status='AVAILABLE',assigned_profile_id=null,checkout_at=null,expected_return_at=null,
         last_returned_at=a.return_at,dock_state='CHARGING',condition_reason=null,
         condition_updated_at=now(),condition_updated_by=caller.id,updated_at=now()
   where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata)
  values(caller.id,'QR_VERIFIED_RETURN',r.id,a.id,
         jsonb_build_object('profile_id',a.profile_id,'verification','QR_CAMERA'));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'return_at',a.return_at,'verification','QR_CAMERA');
end;
$$;

-- Keep the existing repair API compatible with the newer condition workflow.
create or replace function public.set_radio_repair(p_radio_id text,p_in_repair boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if p_in_repair then
    return public.set_radio_condition(p_radio_id,'REPAIR','Manager marked radio for repair');
  end if;
  return public.set_radio_condition(p_radio_id,'AVAILABLE',null);
end; $$;

revoke all on function public.set_radio_condition(text,text,text) from public;
grant execute on function public.set_radio_condition(text,text,text) to authenticated;

commit;
