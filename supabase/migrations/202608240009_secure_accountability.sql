begin;
create extension if not exists pgcrypto;

alter table public.profiles add column if not exists operational_role text not null default 'VALET_ASSOCIATE';
alter table public.profiles drop constraint if exists profiles_operational_role_check;
alter table public.profiles add constraint profiles_operational_role_check check (operational_role in ('VALET_ASSOCIATE','GSC_CAPTAIN','CASHIER'));

alter table public.assignments add column if not exists shift_code text;
alter table public.assignments add column if not exists shift_date date;
alter table public.assignments add column if not exists shift_end_at timestamptz;
alter table public.assignments add column if not exists return_status text not null default 'ACTIVE';
alter table public.assignments add column if not exists tip_release_status text not null default 'NOT_APPLICABLE';
alter table public.assignments drop constraint if exists assignments_shift_code_check;
alter table public.assignments add constraint assignments_shift_code_check check (shift_code is null or shift_code in ('AM','PM','OVERNIGHT'));

create table if not exists public.radio_qr_credentials(
  radio_id text primary key references public.radios(id) on delete cascade,
  token_digest bytea not null unique,
  generation integer not null default 1,
  rotated_at timestamptz not null default now(),
  rotated_by uuid references public.profiles(id)
);
revoke all on public.radio_qr_credentials from anon, authenticated;

create table if not exists public.equipment_agreements(
  version integer primary key,
  title text not null,
  body text not null,
  is_current boolean not null default false,
  published_at timestamptz not null default now()
);
create unique index if not exists equipment_agreements_one_current on public.equipment_agreements(is_current) where is_current;

create table if not exists public.equipment_agreement_acceptances(
  profile_id uuid not null references public.profiles(id),
  agreement_version integer not null references public.equipment_agreements(version),
  agreement_title text not null,
  accepted_at timestamptz not null default now(),
  primary key(profile_id,agreement_version)
);

create table if not exists public.radio_incidents(
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignments(id),
  profile_id uuid not null references public.profiles(id),
  radio_id text not null references public.radios(id),
  shift_code text,
  incident_type text not null check (incident_type in ('LOST','MISSING','DAMAGED','STOLEN','MALFUNCTION','OTHER')),
  explanation text not null,
  occurrence_number integer not null,
  radio_status text,
  resolution text,
  resolved_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz not null default now()
);

create table if not exists public.disciplinary_records(
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.radio_incidents(id),
  profile_id uuid not null references public.profiles(id),
  level text not null check (level in ('WRITTEN_WARNING','WRITE_UP')),
  manager_notes text not null,
  financial_review_required boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  employee_statement text,
  employee_statement_at timestamptz,
  acknowledged_at timestamptz
);

revoke all on public.equipment_agreements from anon, authenticated;
revoke all on public.equipment_agreement_acceptances from anon, authenticated;
revoke all on public.radio_incidents from anon, authenticated;
revoke all on public.disciplinary_records from anon, authenticated;

insert into public.equipment_agreements(version,title,body,is_current)
values(1,'Radio & Equipment Use Agreement',
'I understand that the radio assigned to me is company property. I will take reasonable care of it, use it appropriately, not transfer it to another employee without Manager authorization, and return the same physical radio by scanning its QR code. I will promptly report loss, damage, theft, malfunction, or other equipment issues. I understand that misuse, intentional damage, negligence, unauthorized transfer, failure to return equipment, or failure to promptly report a lost or damaged radio may result in corrective or disciplinary action, including a written warning or write-up, in accordance with company policy and management review. Acceptance of this agreement does not automatically make me financially responsible for lost or damaged equipment.',true)
on conflict(version) do update set title=excluded.title,body=excluded.body,is_current=true;

create or replace function public.is_manager_uid(p_uid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=p_uid and role='MANAGER' and is_active=true and approval_status='ACTIVE')
$$;

create or replace function public.get_current_equipment_agreement() returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(a) from public.equipment_agreements a where a.is_current limit 1
$$;
create or replace function public.get_my_agreement_acceptance(p_version integer) returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(a) from public.equipment_agreement_acceptances a where a.profile_id=auth.uid() and a.agreement_version=p_version
$$;

create or replace function public.accept_equipment_agreement(p_version integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype; a public.equipment_agreements%rowtype; x public.equipment_agreement_acceptances%rowtype;
begin
  select * into p from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved employee required'; end if;
  select * into a from public.equipment_agreements where version=p_version and is_current=true;
  if not found then raise exception 'Agreement version is not current'; end if;
  insert into public.equipment_agreement_acceptances(profile_id,agreement_version,agreement_title)
  values(p.id,a.version,a.title) on conflict(profile_id,agreement_version) do nothing;
  select * into x from public.equipment_agreement_acceptances where profile_id=p.id and agreement_version=a.version;
  return to_jsonb(x);
end; $$;

create or replace function public.rotate_radio_qr_token(p_radio_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare token text; rid text:=upper(trim(p_radio_id)); gen integer;
begin
  if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
  if not exists(select 1 from public.radios where id=rid) then raise exception 'Unknown radio'; end if;
  token:=encode(gen_random_bytes(32),'hex');
  insert into public.radio_qr_credentials(radio_id,token_digest,generation,rotated_by)
  values(rid,digest(token,'sha256'),1,auth.uid())
  on conflict(radio_id) do update set token_digest=excluded.token_digest,generation=public.radio_qr_credentials.generation+1,rotated_at=now(),rotated_by=auth.uid()
  returning generation into gen;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata) values(auth.uid(),'RADIO_QR_ROTATED',rid,jsonb_build_object('generation',gen));
  return jsonb_build_object('radio_id',rid,'token',token,'generation',gen);
end; $$;

create or replace function public.rotate_all_radio_qr_tokens() returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record; token text; gen integer; items jsonb:='[]'::jsonb;
begin
  if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
  for r in select id from public.radios order by asset_number loop
    token:=encode(gen_random_bytes(32),'hex');
    insert into public.radio_qr_credentials(radio_id,token_digest,generation,rotated_by)
    values(r.id,digest(token,'sha256'),1,auth.uid())
    on conflict(radio_id) do update set token_digest=excluded.token_digest,generation=public.radio_qr_credentials.generation+1,rotated_at=now(),rotated_by=auth.uid()
    returning generation into gen;
    insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
    values(auth.uid(),'RADIO_QR_ROTATED',r.id,jsonb_build_object('generation',gen,'bulk',true));
    items:=items||jsonb_build_array(jsonb_build_object('radio_id',r.id,'token',token,'generation',gen));
  end loop;
  return items;
end; $$;

create or replace function public.checkout_radio_secure(p_token text,p_shift_code text,p_shift_date date) returns jsonb
language plpgsql security definer set search_path=public as $$
declare caller public.profiles%rowtype; r public.radios%rowtype; a public.assignments%rowtype; rid text; end_at timestamptz; current_ver integer;
begin
  select * into caller from public.profiles where id=auth.uid() and role='EMPLOYEE' and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved employee required'; end if;
  select version into current_ver from public.equipment_agreements where is_current=true limit 1;
  if not exists(select 1 from public.equipment_agreement_acceptances where profile_id=caller.id and agreement_version=current_ver) then raise exception 'Equipment agreement acceptance required'; end if;
  if p_shift_code not in ('AM','PM','OVERNIGHT') then raise exception 'Invalid shift'; end if;
  if exists(select 1 from public.assignments where profile_id=caller.id and return_at is null) then raise exception 'Employee already has a checked out radio'; end if;
  select q.radio_id into rid from public.radio_qr_credentials q where q.token_digest=digest(trim(p_token),'sha256');
  if rid is null then raise exception 'Invalid or expired radio QR code'; end if;
  select * into r from public.radios where id=rid for update;
  if r.status <> 'AVAILABLE' then raise exception 'Radio is no longer available'; end if;
  end_at:=case p_shift_code
    when 'AM' then ((p_shift_date + time '15:00') at time zone 'America/Chicago')
    when 'PM' then ((p_shift_date + time '23:00') at time zone 'America/Chicago')
    else (((p_shift_date + 1) + time '07:00') at time zone 'America/Chicago') end;
  insert into public.assignments(radio_id,profile_id,employee_id_snapshot,employee_name_snapshot,department_snapshot,checkout_at,expected_return_at,issued_by,shift_code,shift_date,shift_end_at,return_status,tip_release_status)
  values(r.id,caller.id,caller.employee_id,caller.display_name,caller.department,now(),end_at,caller.id,p_shift_code,p_shift_date,end_at,'ACTIVE','NOT_APPLICABLE') returning * into a;
  update public.radios set status='IN_USE',assigned_profile_id=caller.id,checkout_at=a.checkout_at,expected_return_at=end_at,dock_state='EMPTY',updated_at=now() where id=r.id;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata) values(caller.id,'SECURE_QR_CHECKOUT',r.id,a.id,jsonb_build_object('shift_code',p_shift_code,'verification','SECURE_QR'));
  return jsonb_build_object('radio_id',r.id,'assignment_id',a.id,'checkout_at',a.checkout_at,'expected_return_at',end_at,'shift_code',p_shift_code);
end; $$;

create or replace function public.return_radio_secure(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare caller public.profiles%rowtype; rid text; a public.assignments%rowtype; returned timestamptz:=now();
begin
  select * into caller from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
  if not found then raise exception 'Active approved profile required'; end if;
  select radio_id into rid from public.radio_qr_credentials where token_digest=digest(trim(p_token),'sha256');
  if rid is null then raise exception 'Invalid or expired radio QR code'; end if;
  select * into a from public.assignments where profile_id=caller.id and return_at is null for update;
  if not found then raise exception 'No open radio assignment'; end if;
  if a.radio_id<>rid then raise exception 'Wrong radio scanned: return the assigned radio'; end if;
  update public.assignments set return_at=returned,returned_by=caller.id,return_status='RETURNED',tip_release_status='TIP_RELEASE_CLEARED' where id=a.id;
  update public.radios set status='AVAILABLE',assigned_profile_id=null,checkout_at=null,expected_return_at=null,last_returned_at=returned,dock_state='CHARGING',updated_at=now() where id=rid;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata) values(caller.id,'SECURE_QR_RETURN',rid,a.id,jsonb_build_object('verification','SECURE_QR','tip_release_status','TIP_RELEASE_CLEARED'));
  return jsonb_build_object('radio_id',rid,'assignment_id',a.id,'return_at',returned,'tip_release_status','TIP_RELEASE_CLEARED');
end; $$;

create or replace function public.resolve_radio_return_exception(p_assignment_id uuid,p_incident_type text,p_radio_status text,p_explanation text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; n integer; i public.radio_incidents%rowtype; typ text:=upper(trim(p_incident_type)); st text:=upper(trim(p_radio_status));
begin
 if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
 if typ not in ('LOST','MISSING','DAMAGED','STOLEN','MALFUNCTION','OTHER') then raise exception 'Invalid incident type'; end if;
 if nullif(trim(p_explanation),'') is null then raise exception 'Explanation required'; end if;
 select * into a from public.assignments where id=p_assignment_id and return_at is null for update;
 if not found then raise exception 'Open assignment not found'; end if;
 select count(*)+1 into n from public.radio_incidents where profile_id=a.profile_id and incident_type in ('LOST','MISSING');
 insert into public.radio_incidents(assignment_id,profile_id,radio_id,shift_code,incident_type,explanation,occurrence_number,radio_status,resolution,resolved_by)
 values(a.id,a.profile_id,a.radio_id,a.shift_code,typ,trim(p_explanation),n,st,'MANAGER_EXCEPTION',auth.uid()) returning * into i;
 update public.assignments set return_at=now(),returned_by=auth.uid(),return_status='MANAGER_EXCEPTION',tip_release_status='TIP_RELEASE_CLEARED' where id=a.id;
 update public.radios set status=case when st in ('LOST','DAMAGED','REPAIR') then st else 'AVAILABLE' end,assigned_profile_id=null,checkout_at=null,expected_return_at=null,updated_at=now() where id=a.radio_id;
 insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata) values(auth.uid(),'RADIO_RETURN_EXCEPTION',a.radio_id,a.id,jsonb_build_object('incident_id',i.id,'incident_type',typ,'occurrence_number',n));
 return to_jsonb(i);
end; $$;

create or replace function public.create_radio_discipline(p_incident_id uuid,p_level text,p_manager_notes text,p_financial_review_required boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare i public.radio_incidents%rowtype; d public.disciplinary_records%rowtype; lvl text:=upper(trim(p_level));
begin
 if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
 if lvl not in ('WRITTEN_WARNING','WRITE_UP') then raise exception 'Invalid discipline level'; end if;
 select * into i from public.radio_incidents where id=p_incident_id; if not found then raise exception 'Incident not found'; end if;
 insert into public.disciplinary_records(incident_id,profile_id,level,manager_notes,financial_review_required,created_by)
 values(i.id,i.profile_id,lvl,trim(p_manager_notes),coalesce(p_financial_review_required,false),auth.uid()) returning * into d;
 insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata) values(auth.uid(),'RADIO_DISCIPLINE_CREATED',i.radio_id,jsonb_build_object('discipline_id',d.id,'level',lvl,'financial_review_required',d.financial_review_required));
 return to_jsonb(d);
end; $$;

create or replace function public.submit_discipline_statement(p_disciplinary_record_id uuid,p_employee_statement text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d public.disciplinary_records%rowtype;
begin
 select * into d from public.disciplinary_records where id=p_disciplinary_record_id and profile_id=auth.uid() for update;
 if not found then raise exception 'Disciplinary record not found'; end if;
 if d.employee_statement_at is not null then raise exception 'Employee statement is already final'; end if;
 update public.disciplinary_records set employee_statement=nullif(trim(p_employee_statement),''),employee_statement_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end; $$;

create or replace function public.submit_writeup_response(p_disciplinary_record_id uuid,p_employee_statement text,p_acknowledge_receipt boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d public.disciplinary_records%rowtype;
begin
 if not p_acknowledge_receipt then raise exception 'Receipt acknowledgment required'; end if;
 select * into d from public.disciplinary_records where id=p_disciplinary_record_id and profile_id=auth.uid() and level='WRITE_UP' for update;
 if not found then raise exception 'Write-up not found'; end if;
 if d.acknowledged_at is not null then raise exception 'Write-up response is already final'; end if;
 update public.disciplinary_records set employee_statement=nullif(trim(p_employee_statement),''),employee_statement_at=coalesce(employee_statement_at,now()),acknowledged_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end; $$;

create or replace function public.set_employee_operational_role(p_profile_id uuid,p_new_role text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype; nr text:=upper(trim(p_new_role)); old_role text;
begin
 if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
 if nr not in ('VALET_ASSOCIATE','GSC_CAPTAIN','CASHIER') then raise exception 'Invalid operational role'; end if;
 select * into p from public.profiles where id=p_profile_id and role<>'MANAGER' for update; if not found then raise exception 'Employee not found'; end if;
 old_role:=p.operational_role;
 update public.profiles set operational_role=nr,last_status_change_at=now() where id=p.id returning * into p;
 insert into public.audit_events(actor_profile_id,event_type,metadata) values(auth.uid(),'EMPLOYEE_OPERATIONAL_ROLE_CHANGED',jsonb_build_object('profile_id',p.id,'previous_role',old_role,'new_role',nr));
 return to_jsonb(p);
end; $$;

-- Safe read models for GSC Captain, Cashier, and Manager.
create or replace function public.list_operational_checked_out() returns setof public.assignments
language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
 if not found or not (p.role='MANAGER' or p.operational_role in ('GSC_CAPTAIN','CASHIER')) then raise exception 'Permission denied'; end if;
 return query select * from public.assignments where return_at is null order by checkout_at desc;
end; $$;
create or replace function public.list_operational_radio_history(p_limit integer default 200) returns setof public.assignments
language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where id=auth.uid() and is_active=true and approval_status='ACTIVE';
 if not found or not (p.role='MANAGER' or p.operational_role in ('GSC_CAPTAIN','CASHIER')) then raise exception 'Permission denied'; end if;
 return query select * from public.assignments order by checkout_at desc limit greatest(1,least(coalesce(p_limit,200),500));
end; $$;

-- Current due state is server-derived; callers cannot clear it by changing their device clock.
create or replace function public.get_my_radio_accountability() returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; due text;
begin
 select * into a from public.assignments where profile_id=auth.uid() and return_at is null order by checkout_at desc limit 1;
 if not found then return null; end if;
 due:=case when now()>=a.shift_end_at then 'UNRETURNED_AFTER_SHIFT' when now()>=a.shift_end_at-interval '15 minutes' then 'RETURN_DUE_SOON' else 'ACTIVE' end;
 if due='UNRETURNED_AFTER_SHIFT' and a.tip_release_status<>'TIP_RELEASE_PENDING' then
   update public.assignments set return_status='UNRETURNED_AFTER_SHIFT',tip_release_status='TIP_RELEASE_PENDING' where id=a.id returning * into a;
 end if;
 return to_jsonb(a)||jsonb_build_object('computed_return_status',due);
end; $$;


create or replace function public.list_my_disciplinary_records() returns setof public.disciplinary_records
language sql stable security definer set search_path=public as $$
  select * from public.disciplinary_records where profile_id=auth.uid() order by created_at desc
$$;

create or replace function public.list_manager_radio_incidents() returns setof public.radio_incidents
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
 return query select * from public.radio_incidents order by created_at desc limit 500;
end; $$;

create or replace function public.list_manager_disciplinary_records() returns setof public.disciplinary_records
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
 return query select * from public.disciplinary_records order by created_at desc limit 500;
end; $$;

create or replace function public.list_radio_qr_status() returns table(radio_id text,generation integer,rotated_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
 return query select r.id,coalesce(q.generation,0),q.rotated_at from public.radios r left join public.radio_qr_credentials q on q.radio_id=r.id order by r.asset_number;
end; $$;

revoke all on function public.rotate_radio_qr_token(text) from public;
revoke all on function public.rotate_all_radio_qr_tokens() from public;
revoke all on function public.checkout_radio_secure(text,text,date) from public;
revoke all on function public.return_radio_secure(text) from public;
revoke all on function public.resolve_radio_return_exception(uuid,text,text,text) from public;
revoke all on function public.create_radio_discipline(uuid,text,text,boolean) from public;
revoke all on function public.set_employee_operational_role(uuid,text) from public;
grant execute on function public.get_current_equipment_agreement() to authenticated;
grant execute on function public.get_my_agreement_acceptance(integer) to authenticated;
grant execute on function public.accept_equipment_agreement(integer) to authenticated;
grant execute on function public.rotate_radio_qr_token(text) to authenticated;
grant execute on function public.rotate_all_radio_qr_tokens() to authenticated;
grant execute on function public.checkout_radio_secure(text,text,date) to authenticated;
grant execute on function public.return_radio_secure(text) to authenticated;
grant execute on function public.resolve_radio_return_exception(uuid,text,text,text) to authenticated;
grant execute on function public.create_radio_discipline(uuid,text,text,boolean) to authenticated;
grant execute on function public.submit_discipline_statement(uuid,text) to authenticated;
grant execute on function public.submit_writeup_response(uuid,text,boolean) to authenticated;
grant execute on function public.set_employee_operational_role(uuid,text) to authenticated;
grant execute on function public.list_operational_checked_out() to authenticated;
grant execute on function public.list_operational_radio_history(integer) to authenticated;
grant execute on function public.get_my_radio_accountability() to authenticated;
grant execute on function public.list_my_disciplinary_records() to authenticated;
grant execute on function public.list_manager_radio_incidents() to authenticated;
grant execute on function public.list_manager_disciplinary_records() to authenticated;
grant execute on function public.list_radio_qr_status() to authenticated;

commit;
