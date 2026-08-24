-- Force all self-registered employee accounts into the Valet Associate department.
-- Manager profiles and existing departments are not changed by this migration.
create or replace function public.handle_new_radioops_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(new.raw_user_meta_data->>'display_name',''));
  v_employee_id text := trim(coalesce(new.raw_user_meta_data->>'employee_id',''));
  v_department text := 'Valet Associate';
begin
  if v_name='' then raise exception 'Display name is required'; end if;
  if v_employee_id='' then raise exception 'Employee ID is required'; end if;

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
