-- Image ownership is private; previous anonymous rows keep NULL and require an administrator.
begin;
alter table feedback_private.submissions add column image_owner_hash text
 check (image_owner_hash is null or image_owner_hash ~ '^[a-f0-9]{64}$');
create function public.site_feedback_publish_owned_image(p_id uuid,p_image_url text,p_public_image_path text,p_owner_hash text)
returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if p_owner_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$' then raise exception '投稿者を確認できません'; end if;
 perform public.site_feedback_publish_image(p_id,p_image_url,p_public_image_path);
 update feedback_private.submissions set image_owner_hash=p_owner_hash where id=p_id;
end $fn$;
create function public.site_feedback_delete_image(p_id uuid,p_monster_id text,p_owner_hash text,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare v_row feedback_private.submissions;
begin
 if p_id is null or p_monster_id is null or p_monster_id !~ '^[a-z0-9_-]{1,160}$'
  or p_owner_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$' then raise exception '入力を確認してください'; end if;
 select * into v_row from feedback_private.submissions where id=p_id for update;
 if not found or v_row.kind<>'monster' or v_row.category<>'image' or v_row.monster_id is distinct from p_monster_id
  then raise exception '追加画像が見つかりません'; end if;
 if p_actor is null and (v_row.image_owner_hash is null or v_row.image_owner_hash is distinct from p_owner_hash)
  then raise exception 'この画像を削除する権限がありません' using errcode='42501'; end if;
 if v_row.status='rejected' and v_row.review_note in ('投稿者による画像削除','管理者による画像削除')
  then return jsonb_build_object('deleted',true,'id',p_id,'monster_id',p_monster_id); end if;
 if v_row.status<>'published' or coalesce(v_row.details->>'image_url','')=''
  then raise exception '公開中の追加画像ではありません'; end if;
 update feedback_private.submissions set status='rejected',reviewed_at=now(),reviewed_by=p_actor,
  review_note=case when p_actor is null then '投稿者による画像削除' else '管理者による画像削除' end where id=p_id;
 delete from public.monster_updates where id=p_id and monster_id=p_monster_id and category='image';
 if p_actor is not null then
  insert into feedback_private.audit(submission_id,actor,action) values(p_id,p_actor,'delete_image');
 end if;
 return jsonb_build_object('deleted',true,'id',p_id,'monster_id',p_monster_id);
end $fn$;
revoke all on function public.site_feedback_publish_owned_image(uuid,text,text,text),
 public.site_feedback_delete_image(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.site_feedback_publish_owned_image(uuid,text,text,text),
 public.site_feedback_delete_image(uuid,text,text,uuid) to service_role;
commit;
