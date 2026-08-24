-- Add 30-minute, 15-minute, and exact shift-end radio return reminders.
-- Also publish agreement v2 with early-departure return responsibility.

update public.equipment_agreements set is_current=false where is_current=true;
insert into public.equipment_agreements(version,title,body,is_current)
values(2,'Radio & Equipment Use Agreement',
'I understand that the radio assigned to me is company property. I will take reasonable care of it, use it appropriately, not transfer it to another employee without Manager authorization, and return the same physical radio by scanning its QR code. If I leave work before my scheduled shift ends for any reason, I must return and scan my assigned radio before leaving the property. I will promptly report loss, damage, theft, malfunction, or other equipment issues. I understand that misuse, intentional damage, negligence, unauthorized transfer, failure to return equipment, or failure to promptly report a lost or damaged radio may result in corrective or disciplinary action, including a written warning or write-up, in accordance with company policy and management review. Acceptance of this agreement does not automatically make me financially responsible for lost or damaged equipment.',true)
on conflict(version) do update set title=excluded.title,body=excluded.body,is_current=true;

create or replace function public.get_my_radio_accountability() returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; due text;
begin
 select * into a from public.assignments where profile_id=auth.uid() and return_at is null order by checkout_at desc limit 1;
 if not found then return null; end if;
 due:=case
   when now()>=a.shift_end_at then 'UNRETURNED_AFTER_SHIFT'
   when now()>=a.shift_end_at-interval '15 minutes' then 'RETURN_DUE_15'
   when now()>=a.shift_end_at-interval '30 minutes' then 'RETURN_DUE_30'
   else 'ACTIVE'
 end;
 if due='UNRETURNED_AFTER_SHIFT' and a.tip_release_status<>'TIP_RELEASE_PENDING' then
   update public.assignments set return_status='UNRETURNED_AFTER_SHIFT',tip_release_status='TIP_RELEASE_PENDING' where id=a.id returning * into a;
 end if;
 return to_jsonb(a)||jsonb_build_object('computed_return_status',due);
end; $$;
