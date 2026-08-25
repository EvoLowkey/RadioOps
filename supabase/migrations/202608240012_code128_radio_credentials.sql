-- Valet Radio HQ: compact secure credentials for Code 128 / DYMO 30336 labels.
-- Existing credential digests remain valid until a Manager rotates a radio.
create or replace function public.rotate_radio_qr_token(p_radio_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare token text; rid text:=upper(trim(p_radio_id)); gen integer;
begin
  if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
  if not exists(select 1 from public.radios where id=rid) then raise exception 'Unknown radio'; end if;
  token:=translate(encode(extensions.gen_random_bytes(9),'base64'),'+/','-_');
  insert into public.radio_qr_credentials(radio_id,token_digest,generation,rotated_by)
  values(rid,extensions.digest(token,'sha256'),1,auth.uid())
  on conflict(radio_id) do update set token_digest=excluded.token_digest,generation=public.radio_qr_credentials.generation+1,rotated_at=now(),rotated_by=auth.uid()
  returning generation into gen;
  insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
  values(auth.uid(),'RADIO_BARCODE_ROTATED',rid,jsonb_build_object('generation',gen,'format','CODE128'));
  return jsonb_build_object('radio_id',rid,'token',token,'generation',gen,'format','CODE128');
end; $$;

create or replace function public.rotate_all_radio_qr_tokens() returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record; token text; gen integer; items jsonb:='[]'::jsonb;
begin
  if not public.is_manager_uid(auth.uid()) then raise exception 'Permission denied: manager required'; end if;
  for r in select id from public.radios order by asset_number loop
    token:=translate(encode(extensions.gen_random_bytes(9),'base64'),'+/','-_');
    insert into public.radio_qr_credentials(radio_id,token_digest,generation,rotated_by)
    values(r.id,extensions.digest(token,'sha256'),1,auth.uid())
    on conflict(radio_id) do update set token_digest=excluded.token_digest,generation=public.radio_qr_credentials.generation+1,rotated_at=now(),rotated_by=auth.uid()
    returning generation into gen;
    insert into public.audit_events(actor_profile_id,event_type,radio_id,metadata)
    values(auth.uid(),'RADIO_BARCODE_ROTATED',r.id,jsonb_build_object('generation',gen,'bulk',true,'format','CODE128'));
    items:=items||jsonb_build_array(jsonb_build_object('radio_id',r.id,'token',token,'generation',gen,'format','CODE128'));
  end loop;
  return items;
end; $$;

grant execute on function public.rotate_radio_qr_token(text) to authenticated;
grant execute on function public.rotate_all_radio_qr_tokens() to authenticated;
