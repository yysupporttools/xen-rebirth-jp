-- New image-only additions publish immediately through a service-only RPC.
-- Existing pending submissions are not migrated or automatically published.
create function public.site_feedback_publish_image(p_id uuid,p_image_url text,p_public_image_path text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_row feedback_private.submissions; v_path text=coalesce(p_public_image_path,''); v_details jsonb;
begin
 select * into v_row from feedback_private.submissions where id=p_id for update;
 if not found or v_row.kind<>'monster' or v_row.category<>'image' or v_row.status<>'pending' or v_row.reviewed_at is not null then raise exception '画像を追加できません。表示を更新して確認してください'; end if;
 if p_image_url is null or p_image_url !~ '^https://' or length(p_image_url)>1000 then raise exception '画像URLが無効です'; end if;
 if v_path<>'' and (v_path!~'^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$' or split_part(v_path,'/',1)<>p_id::text or v_row.monster_image_path='') then raise exception '投稿と公開画像が一致しません'; end if;
 if v_path<>'' and p_image_url not like ('%/storage/v1/object/public/monster-images/'||v_path) then raise exception '公開画像URLとパスが一致しません'; end if;
 v_details=jsonb_build_object('image_url',p_image_url,'image_source',case when v_path<>'' then 'uploaded' else 'url' end,'publication_mode','immediate');
 update feedback_private.submissions set status='published',details=v_details,monster_image_public_path=v_path,reviewed_at=now() where id=p_id;
 insert into public.monster_updates(id,monster_id,category,body,details,source_url,author_name,created_at)
 values(v_row.id,v_row.monster_id,'image',v_row.body,v_details,v_row.source_url,v_row.author_name,v_row.created_at);
end $$;
revoke all on function public.site_feedback_publish_image(uuid,text,text) from public, anon, authenticated;
grant execute on function public.site_feedback_publish_image(uuid,text,text) to service_role;

create function public.site_feedback_cancel_image(p_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update feedback_private.submissions set status='rejected',reviewed_at=now(),review_note='画像の保存に失敗しました。必要なら画像を追加し直してください。',monster_image_path='',monster_image_public_path=''
 where id=p_id and kind='monster' and category='image' and status='pending' and reviewed_at is null;
 return found;
end $$;
revoke all on function public.site_feedback_cancel_image(uuid) from public, anon, authenticated;
grant execute on function public.site_feedback_cancel_image(uuid) to service_role;

-- If a network response is lost after a successful publication, cleanup may
-- have been queued conservatively. Never delete a currently published picture.
create or replace function public.site_feedback_image_cleanup_list()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(path),'[]'::jsonb) from (
  select c.path from feedback_private.image_cleanup c
  where not exists(select 1 from feedback_private.submissions s where s.status='published' and s.monster_image_public_path=c.path)
  order by c.queued_at limit 20
 ) s;
$$;
revoke all on function public.site_feedback_image_cleanup_list() from public, anon, authenticated;
grant execute on function public.site_feedback_image_cleanup_list() to service_role;
