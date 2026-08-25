begin;

-- Fix PostgreSQL overload resolution for pgcrypto.digest().
-- Explicitly hash UTF-8 bytes and type the algorithm argument as text.
-- This preserves all existing token digests because digest(text,'sha256')
-- hashes the same UTF-8 bytes for the ASCII secure tokens used by Valet Radio HQ.

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

  select q.radio_id into rid
  from public.radio_qr_credentials q
  where q.token_digest=extensions.digest(convert_to(trim(p_token),'UTF8'::text),'sha256'::text);

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

  select q.radio_id into rid
  from public.radio_qr_credentials q
  where q.token_digest=extensions.digest(convert_to(trim(p_token),'UTF8'::text),'sha256'::text);

  if rid is null then raise exception 'Invalid or expired radio QR code'; end if;
  select * into a from public.assignments where profile_id=caller.id and return_at is null for update;
  if not found then raise exception 'No open radio assignment'; end if;
  if a.radio_id<>rid then raise exception 'Wrong radio scanned: return the assigned radio'; end if;
  update public.assignments set return_at=returned,returned_by=caller.id,return_status='RETURNED',tip_release_status='TIP_RELEASE_CLEARED' where id=a.id;
  update public.radios set status='AVAILABLE',assigned_profile_id=null,checkout_at=null,expected_return_at=null,last_returned_at=returned,dock_state='CHARGING',updated_at=now() where id=rid;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,assignment_id,metadata) values(caller.id,'SECURE_QR_RETURN',rid,a.id,jsonb_build_object('verification','SECURE_QR','tip_release_status','TIP_RELEASE_CLEARED'));
  return jsonb_build_object('radio_id',rid,'assignment_id',a.id,'return_at',returned,'tip_release_status','TIP_RELEASE_CLEARED');
end; $$;

grant execute on function public.checkout_radio_secure(text,text,date) to authenticated;
grant execute on function public.return_radio_secure(text) to authenticated;

commit;
