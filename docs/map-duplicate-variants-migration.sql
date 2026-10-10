-- Run in Supabase SQL Editor after reviewing. Existing maps and NPC coordinates stay unchanged.
alter table public.game_maps add column if not exists display_map_name text;

create or replace function public.map_variant_create(
  p_map_name text,
  p_image_hash text,
  p_map_image_url text,
  p_contributor_id text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := trim(coalesce(p_map_name,''));
  v_url text := trim(coalesce(p_map_image_url,''));
begin
  if v_name = '' or length(v_name)>120 or v_name ~ '[<>[:cntrl:]]' then
    raise exception 'invalid map name';
  end if;
  if coalesce(p_image_hash,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid image hash';
  end if;
  if v_url not like 'https://dzxxjtmpcfsmvdgkcwvn.supabase.co/storage/v1/object/public/map-images/%'
     or length(v_url)>1000 then
    raise exception 'invalid image url';
  end if;
  if not exists (
    select 1 from public.game_maps
    where lower(coalesce(display_map_name,map_name))=lower(v_name)
  ) then
    raise exception 'register the original map first';
  end if;
  insert into public.game_maps(
    id,map_name,display_map_name,map_image_url,
    source_image_hash,image_source,confidence,image_revision
  ) values (
    v_id,v_name||' [variant:'||v_id::text||']',v_name,v_url,
    p_image_hash,'manual',100,1
  );
  return jsonb_build_object('saved',true,'map_id',v_id);
end;$$;

revoke all on function public.map_variant_create(text,text,text,text) from PUBLIC;
grant execute on function public.map_variant_create(text,text,text,text) to anon, authenticated;

-- Verify (read only):
-- select id,map_name,coalesce(display_map_name,map_name) as visible_name
-- from public.game_maps where lower(coalesce(display_map_name,map_name))='xiamen';
