-- Guild showcase backend. Apply to the existing project after review.
-- All mutations pass through the Edge Function, which validates a live Auth
-- user and public.board_is_admin(). No browser can invoke the service RPCs.
begin;

create schema if not exists guild_private;
revoke all on schema guild_private from public, anon, authenticated;
grant usage on schema guild_private to service_role;

create table if not exists guild_private.config (
  singleton boolean primary key default true check (singleton),
  name text not null default '' check (char_length(name) <= 80),
  intro text not null default '' check (char_length(intro) <= 2000),
  guild_level integer check (guild_level between 1 and 99),
  member_count integer check (member_count between 0 and 9999),
  is_published boolean not null default false,
  slide_seconds integer not null default 8 check (slide_seconds between 5 and 30),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (not is_published or (length(btrim(name)) > 0 and length(btrim(intro)) > 0))
);

create table if not exists guild_private.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  role text not null default '' check (char_length(role) <= 80),
  intro text not null default '' check (char_length(intro) <= 1200),
  image_url text not null default '' check (char_length(image_url) <= 1000 and (image_url = '' or image_url ~ '^https://[^[:space:]]+$')),
  photo_path text not null default '' check (char_length(photo_path) <= 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_published boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table guild_private.config enable row level security;
alter table guild_private.members enable row level security;
revoke all on guild_private.config, guild_private.members from public, anon, authenticated;
grant select, insert, update on guild_private.config, guild_private.members to service_role;
-- No client RLS policies: service_role is the only granted reader/writer.
create index if not exists guild_member_display_order on guild_private.members (sort_order, created_at, id) where deleted_at is null;

insert into guild_private.config (singleton) values (true) on conflict do nothing;

create or replace function public.guild_showcase_read(p_admin boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_guild jsonb;
  v_members jsonb;
begin
  select jsonb_build_object('name', name, 'intro', intro,
    'guild_level', guild_level, 'member_count', member_count,
    'is_published', is_published, 'slide_seconds', slide_seconds)
  into v_guild from guild_private.config
  where singleton and (p_admin or is_published);
  if v_guild is null then
    return jsonb_build_object('guild', null, 'members', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name,
    'role', role, 'intro', intro, 'image_url', image_url,
    'sort_order', sort_order, 'is_published', is_published)
    order by sort_order, created_at, id), '[]'::jsonb)
  into v_members from guild_private.members
  where deleted_at is null and (p_admin or is_published);
  return jsonb_build_object('guild', v_guild, 'members', v_members);
end;
$$;

create or replace function public.guild_showcase_mutate(p_action text, p_payload jsonb, p_actor uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_old guild_private.members;
  v_exists boolean;
  v_count integer;
  v_order integer;
  v_name text;
  v_intro text;
  v_role text;
  v_image text;
  v_photo text;
  v_published boolean;
  v_ids uuid[];
  v_updated integer;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception '入力内容を確認してください';
  end if;
  -- Every write locks the same row: member limits and reorder are atomic.
  perform 1 from guild_private.config where singleton for update;
  if not found then raise exception 'ギルド設定が見つかりません'; end if;

  if p_action = 'save_guild' then
    update guild_private.config set
      name = btrim(coalesce(p_payload ->> 'name', name)),
      intro = btrim(coalesce(p_payload ->> 'intro', intro)),
      guild_level = case when p_payload ? 'guild_level' then (p_payload ->> 'guild_level')::integer else guild_level end,
      member_count = case when p_payload ? 'member_count' then (p_payload ->> 'member_count')::integer else member_count end,
      is_published = coalesce((p_payload ->> 'is_published')::boolean, is_published),
      slide_seconds = coalesce((p_payload ->> 'slide_seconds')::integer, slide_seconds),
      updated_at = now(), updated_by = p_actor
    where singleton;
    return jsonb_build_object('ok', true);
  elsif p_action = 'save_member' then
    v_id := coalesce((nullif(p_payload ->> 'id', ''))::uuid, gen_random_uuid());
    select * into v_old from guild_private.members where id = v_id;
    v_exists := found;
    if v_exists and v_old.deleted_at is not null then
      raise exception '削除済みのメンバーは編集できません';
    end if;
    if not v_exists then
      select count(*), coalesce(max(sort_order) + 1, 0) into v_count, v_order
      from guild_private.members where deleted_at is null;
      if v_count >= 100 then raise exception '紹介できるメンバーは100人までです'; end if;
    else
      v_order := v_old.sort_order;
    end if;
    v_name := btrim(coalesce(p_payload ->> 'name', v_old.name, ''));
    v_intro := btrim(coalesce(p_payload ->> 'intro', v_old.intro, ''));
    v_role := btrim(coalesce(p_payload ->> 'role', v_old.role, ''));
    v_image := coalesce(p_payload ->> 'image_url', v_old.image_url, '');
    v_published := coalesce((p_payload ->> 'is_published')::boolean, v_old.is_published, false);
    v_photo := case when p_payload ? 'photo_path' then coalesce(p_payload ->> 'photo_path', '')
      when p_payload ? 'image_url' and v_image is distinct from coalesce(v_old.image_url, '') then ''
      else coalesce(v_old.photo_path, '') end;
    if v_photo <> '' and v_photo !~ ('^' || v_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then
      raise exception '画像の保存先を確認してください';
    end if;
    insert into guild_private.members (id, name, role, intro, image_url, photo_path, sort_order, is_published, updated_by)
    values (v_id, v_name, v_role, v_intro, v_image, v_photo, v_order, v_published, p_actor)
    on conflict (id) do update set name = excluded.name, role = excluded.role,
      intro = excluded.intro, image_url = excluded.image_url, photo_path = excluded.photo_path,
      is_published = excluded.is_published, updated_at = now(), updated_by = p_actor;
    return jsonb_build_object('ok', true, 'id', v_id,
      'old_photo_path', case when v_photo is distinct from coalesce(v_old.photo_path, '') then coalesce(v_old.photo_path, '') else '' end);
  elsif p_action = 'delete_member' then
    v_id := (p_payload ->> 'id')::uuid;
    update guild_private.members set deleted_at = now(), is_published = false,
      updated_at = now(), updated_by = p_actor
    where id = v_id and deleted_at is null;
    if not found then raise exception 'メンバーが見つかりません'; end if;
    -- Keep the photo with the soft-deleted record for recovery.
    return jsonb_build_object('ok', true);
  elsif p_action = 'reorder' then
    if jsonb_typeof(p_payload -> 'ids') is distinct from 'array' then
      raise exception '並び順を確認してください';
    end if;
    select array_agg(value::uuid order by ord) into v_ids
    from jsonb_array_elements_text(p_payload -> 'ids') with ordinality as x(value, ord);
    v_ids := coalesce(v_ids, '{}'::uuid[]);
    select count(*) into v_count from guild_private.members where deleted_at is null;
    if cardinality(v_ids) <> v_count
      or (select count(distinct id) from unnest(v_ids) as x(id)) <> v_count
      or exists(select 1 from unnest(v_ids) as x(id)
        where not exists(select 1 from guild_private.members m where m.id = x.id and m.deleted_at is null)) then
      raise exception '全メンバーを重複なく指定してください';
    end if;
    update guild_private.members m set sort_order = x.ord - 1,
      updated_at = now(), updated_by = p_actor
    from unnest(v_ids) with ordinality as x(id, ord) where m.id = x.id;
    get diagnostics v_updated = row_count;
    if v_updated <> v_count then raise exception '並び順を保存できませんでした'; end if;
    return jsonb_build_object('ok', true);
  end if;
  raise exception '操作を確認してください';
end;
$$;

revoke all on function public.guild_showcase_read(boolean) from public, anon, authenticated;
revoke all on function public.guild_showcase_mutate(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.guild_showcase_read(boolean) to service_role;
grant execute on function public.guild_showcase_mutate(text, jsonb, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guild-member-photos', 'guild-member-photos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Public bucket images are readable via the Storage public endpoint. No client
-- INSERT/UPDATE/DELETE policy is created: uploads are validated by the Edge.

commit;

-- Optional initial seed, run only after review. Name lookup keeps reruns
-- idempotent without hardcoded member UUIDs. Existing photos/intros survive.
-- begin;
-- select public.guild_showcase_mutate('save_guild', jsonb_build_object(
--   'name', 'Japan Heroes',
--   'intro', 'ギルドメンバー全員日本人プレイヤーで構成されており、新人も玄人も在籍中。新規加入も募集しています。',
--   'guild_level', 4, 'member_count', 31, 'is_published', true, 'slide_seconds', 8));
-- do $seed$
-- declare v_name text; v_id uuid; v_pos integer := 0;
-- begin
--   foreach v_name in array array['Alone','ARCO','colina','soyopy','Gura','XperoX'] loop
--     select id into v_id from guild_private.members where name = v_name and deleted_at is null order by created_at limit 1;
--     perform public.guild_showcase_mutate('save_member', jsonb_build_object(
--       'id', v_id, 'name', v_name, 'role', case when v_name = 'Alone' then 'ギルドマスター' else '' end,
--       'is_published', true));
--     update guild_private.members set sort_order = v_pos where name = v_name and deleted_at is null;
--     v_pos := v_pos + 1;
--   end loop;
-- end;
-- $seed$;
-- commit;

-- Edge deployment setting: verify_jwt=false because GET accepts the site's
-- publishable key, while every admin GET/POST performs live Auth verification
-- and board_is_admin() with the caller's JWT before service-only operations.
