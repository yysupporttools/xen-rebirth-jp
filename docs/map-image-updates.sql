-- Reviewed scope: map-image replacement only. No public table UPDATE grant.
begin;

alter table public.game_maps
  add column if not exists image_source text not null default 'capture',
  add column if not exists image_revision integer not null default 0,
  add column if not exists image_width integer,
  add column if not exists image_height integer;

alter table public.game_maps
  add constraint game_maps_image_source_check check (image_source in ('capture','manual')),
  add constraint game_maps_image_revision_check check (image_revision>=0),
  add constraint game_maps_image_dimensions_check check (
    (image_width is null and image_height is null) or
    (image_width is not null and image_height is not null and image_width between 100 and 4096 and image_height between 100 and 4096)
  );

create table public.game_map_image_versions(
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.game_maps(id) on delete restrict,
  image_revision integer not null check (image_revision>=0),
  image_url text not null check (image_url ~ '^https://'),
  source_image_hash text,
  image_source text not null check (image_source in ('capture','manual')),
  image_width integer,
  image_height integer,
  created_at timestamptz not null default now(),
  unique(map_id,image_revision),
  check ((image_width is null and image_height is null) or
    (image_width is not null and image_height is not null and image_width between 100 and 4096 and image_height between 100 and 4096))
);
alter table public.game_map_image_versions enable row level security;
revoke all on public.game_map_image_versions from public,anon,authenticated,service_role;
grant select on public.game_map_image_versions to anon,authenticated,service_role;
grant insert on public.game_map_image_versions to service_role;
create policy game_map_image_versions_public_read on public.game_map_image_versions
  for select to anon,authenticated using (true);

-- Existing public map read grants/RLS remain unchanged.
grant select(id,map_name,map_image_url,source_image_hash,confidence,created_at,updated_at,
  image_source,image_revision,image_width,image_height)
  on public.game_maps to service_role;
grant update(map_image_url,source_image_hash,updated_at,image_source,image_revision,image_width,image_height)
  on public.game_maps to service_role;

create function public.map_image_replace(
  p_map_id uuid,p_expected_image_url text,p_expected_image_hash text,p_expected_revision integer,
  p_image_url text,p_image_hash text,p_width integer,p_height integer,
  p_visitor_hash text,p_ip_hash text
) returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_map public.game_maps;
  v_new public.game_maps;
  v_token text;
  v_limit feedback_private.throttle;
  v_day date=(now() at time zone 'Asia/Tokyo')::date;
  v_tokens text[];
begin
  if p_map_id is null or p_expected_revision is null or p_expected_revision<0
    or p_expected_image_url is null or length(p_expected_image_url)>2000
    or p_image_url is null or p_image_url!~(
      '^https://dzxxjtmpcfsmvdgkcwvn[.]supabase[.]co/storage/v1/object/public/map-images/manual-updates/'
      ||p_map_id::text||'/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[.]webp$')
    or p_image_hash is null or p_image_hash!~'^[a-f0-9]{64}$'
    or p_width is null or p_width not between 100 and 4096
    or p_height is null or p_height not between 100 and 4096
    or p_visitor_hash is null or p_visitor_hash!~'^[a-f0-9]{64}$'
    or p_ip_hash is null or p_ip_hash!~'^[a-f0-9]{64}$' then
    return jsonb_build_object('saved',false,'reason','invalid_input','status',400);
  end if;
  select * into v_map from public.game_maps where id=p_map_id for update;
  if not found then return jsonb_build_object('saved',false,'reason','map_missing','status',404); end if;
  if nullif(v_map.map_image_url,'') is null then
    return jsonb_build_object('saved',false,'reason','image_missing','status',409);
  end if;
  if v_map.image_revision is distinct from p_expected_revision
    or v_map.map_image_url is distinct from p_expected_image_url
    or v_map.source_image_hash is distinct from p_expected_image_hash then
    return jsonb_build_object('saved',false,'reason','conflict','status',409);
  end if;

  -- Counters use only salted map-image-specific hashes supplied by the Edge function.
  -- Stable ordering avoids cross-request visitor/IP row-lock inversions.
  select array_agg(token order by token) into v_tokens
  from (select distinct unnest(array[p_visitor_hash,p_ip_hash]) as token) tokens;
  begin
  foreach v_token in array v_tokens loop
    insert into feedback_private.throttle(token) values(v_token) on conflict do nothing;
    select * into v_limit from feedback_private.throttle where token=v_token for update;
    if v_limit.window_started<=now()-interval '10 minutes' then
      v_limit.window_started=now();v_limit.window_count=0;
    end if;
    if v_limit.day_started<>v_day then v_limit.day_started=v_day;v_limit.day_count=0; end if;
    if v_limit.day_count>=500 or v_limit.window_count>=60 then
      raise exception using errcode='P0001',message='map-image-rate-limit';
    end if;
  end loop;
  exception when raise_exception then
    if sqlerrm='map-image-rate-limit' then
      return jsonb_build_object('saved',false,'reason','rate_limit','status',429);
    end if;
    raise;
  end;
  foreach v_token in array v_tokens loop
    update feedback_private.throttle set
      window_count=case when window_started<=now()-interval '10 minutes' then 1 else window_count+1 end,
      window_started=case when window_started<=now()-interval '10 minutes' then now() else window_started end,
      day_count=case when day_started<>v_day then 1 else day_count+1 end,
      day_started=v_day
    where token=v_token;
  end loop;

  insert into public.game_map_image_versions(map_id,image_revision,image_url,source_image_hash,image_source,image_width,image_height)
  values(v_map.id,v_map.image_revision,v_map.map_image_url,v_map.source_image_hash,v_map.image_source,v_map.image_width,v_map.image_height)
  on conflict(map_id,image_revision) do nothing;
  update public.game_maps set
    map_image_url=p_image_url,source_image_hash=p_image_hash,image_source='manual',
    image_revision=v_map.image_revision+1,image_width=p_width,image_height=p_height,updated_at=now()
  where id=v_map.id returning * into v_new;
  insert into public.game_map_image_versions(map_id,image_revision,image_url,source_image_hash,image_source,image_width,image_height)
  values(v_new.id,v_new.image_revision,v_new.map_image_url,v_new.source_image_hash,v_new.image_source,v_new.image_width,v_new.image_height);
  return jsonb_build_object('saved',true,'map_id',v_new.id,'image_url',v_new.map_image_url,
    'source_image_hash',v_new.source_image_hash,'image_source',v_new.image_source,
    'image_revision',v_new.image_revision,'image_width',v_new.image_width,'image_height',v_new.image_height,
    'updated_at',v_new.updated_at);
end
$function$;
revoke all on function public.map_image_replace(uuid,text,text,integer,text,text,integer,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.map_image_replace(uuid,text,text,integer,text,text,integer,integer,text,text)
  to service_role;

-- Signature, SECURITY DEFINER, and existing EXECUTE grants of this already-used
-- auto-analysis RPC are preserved. Only image preference/CAS and manual-map
-- aggregate protection change; raw sightings continue to be received.
CREATE OR REPLACE FUNCTION public.map_analysis_save(p_map_name text, p_npcs jsonb DEFAULT '[]'::jsonb, p_image_hash text DEFAULT NULL::text, p_map_image_url text DEFAULT NULL::text, p_confidence integer DEFAULT NULL::integer, p_contributor_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_map_id uuid;
  v_item jsonb;
  v_name text;
  v_x integer;
  v_y integer;
  v_conf integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_existing_count integer;
  v_manual_image boolean;
begin
  if nullif(trim(coalesce(p_map_name,'')),'') is null then
    return jsonb_build_object('saved',false,'reason','map_missing');
  end if;

  insert into public.game_maps(map_name,map_image_url,source_image_hash,confidence)
  values(
    trim(p_map_name),
    nullif(trim(coalesce(p_map_image_url,'')),''),
    nullif(trim(coalesce(p_image_hash,'')),''),
    p_confidence
  )
  on conflict(lower(map_name))
  do update set
    map_image_url=case when public.game_maps.image_source='manual' then public.game_maps.map_image_url else coalesce(excluded.map_image_url,public.game_maps.map_image_url) end,
    source_image_hash=case when public.game_maps.image_source='manual' then public.game_maps.source_image_hash else coalesce(excluded.source_image_hash,public.game_maps.source_image_hash) end,
    image_revision=public.game_maps.image_revision+case when public.game_maps.image_source<>'manual' and
      ((excluded.map_image_url is not null and excluded.map_image_url is distinct from public.game_maps.map_image_url) or
       (excluded.source_image_hash is not null and excluded.source_image_hash is distinct from public.game_maps.source_image_hash)) then 1 else 0 end,
    image_width=case when public.game_maps.image_source<>'manual' and excluded.map_image_url is not null and excluded.map_image_url is distinct from public.game_maps.map_image_url then null else public.game_maps.image_width end,
    image_height=case when public.game_maps.image_source<>'manual' and excluded.map_image_url is not null and excluded.map_image_url is distinct from public.game_maps.map_image_url then null else public.game_maps.image_height end,
    confidence=greatest(coalesce(public.game_maps.confidence,0),coalesce(excluded.confidence,0)),
    updated_at=case when public.game_maps.image_source='manual' then public.game_maps.updated_at else now() end
  returning id,(image_source='manual') into v_map_id,v_manual_image;

  for v_item in select value from jsonb_array_elements(coalesce(p_npcs,'[]'::jsonb))
  loop
    v_name := nullif(trim(coalesce(v_item->>'name','')),'');
    v_x := greatest(0,least(1000,coalesce((v_item->>'x')::integer,0)));
    v_y := greatest(0,least(1000,coalesce((v_item->>'y')::integer,0)));
    v_conf := greatest(0,least(100,coalesce((v_item->>'confidence')::integer,0)));

    if v_name is null or v_conf < 70 then continue; end if;

    insert into public.map_npc_sightings(
      map_id,npc_name,x_norm,y_norm,confidence,image_hash,contributor_id
    ) values(
      v_map_id,v_name,v_x,v_y,v_conf,
      nullif(trim(coalesce(p_image_hash,'')),''),
      nullif(trim(coalesce(p_contributor_id,'')),'')
    )
    on conflict(map_id,npc_name,image_hash) do nothing;

    if found then
      v_inserted := v_inserted + 1;
      -- Keep original observations as candidates, never rebase them onto a manual image.
      if v_manual_image then continue; end if;
      select sighting_count into v_existing_count
      from public.map_npcs
      where map_id=v_map_id and lower(npc_name)=lower(v_name);

      if v_existing_count is null then
        insert into public.map_npcs(map_id,npc_name,x_norm,y_norm,confidence,sighting_count)
        values(v_map_id,v_name,v_x,v_y,v_conf,1);
      else
        update public.map_npcs
        set
          x_norm=((x_norm*sighting_count)+v_x)/(sighting_count+1),
          y_norm=((y_norm*sighting_count)+v_y)/(sighting_count+1),
          confidence=((confidence*sighting_count)+v_conf)/(sighting_count+1),
          sighting_count=sighting_count+1,
          last_seen_at=now()
        where map_id=v_map_id and lower(npc_name)=lower(v_name);
      end if;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'saved',true,
    'map_id',v_map_id,
    'new_sightings',v_inserted,
    'aggregates_updated',v_updated
  );
end;
$function$;

commit;
