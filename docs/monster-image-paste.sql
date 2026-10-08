-- Diff migration: clipboard/file monster pictures await moderation privately.
-- Existing article-feedback evidence attachments keep their private meaning.
alter table feedback_private.submissions
 add column monster_image_path text not null default '' check(length(monster_image_path)<=180),
 add column monster_image_public_path text not null default '' check(length(monster_image_public_path)<=180);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('monster-images','monster-images',true,2097152,array['image/png','image/jpeg','image/webp']);
-- Public delivery only. There are deliberately no anon/authenticated object
-- write policies; service credentials are restricted to the Edge Function.

create table feedback_private.image_cleanup (
 path text primary key check(path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'),
 queued_at timestamptz not null default now()
);
alter table feedback_private.image_cleanup enable row level security;
revoke all on feedback_private.image_cleanup from public, anon, authenticated;
grant select,insert,delete on feedback_private.image_cleanup to service_role;

create function public.site_feedback_get(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(s) from feedback_private.submissions s where id=p_id;
$$;

create function public.site_feedback_monster_image_attach(p_id uuid,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_path !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[a-f0-9-]{36}\.(png|jpg|webp)$' then raise exception '画像パスが無効です'; end if;
 update feedback_private.submissions set monster_image_path=p_path
 where id=p_id and kind='monster' and status='pending' and monster_image_path='';
 if not found then raise exception '確認待ちのモンスター投稿が見つかりません'; end if;
end $$;

create function public.site_feedback_review_with_image(
 p_id uuid,p_status text,p_note text,p_actor uuid,p_body text,p_details jsonb,p_public_image_path text,p_expected_status text,p_expected_reviewed_at timestamptz
)
returns void language plpgsql security invoker set search_path='' as $$
declare v_row feedback_private.submissions; v_path text=coalesce(p_public_image_path,'');
begin
 select * into v_row from feedback_private.submissions where id=p_id for update;
 if not found then raise exception '報告が見つかりません'; end if;
 if v_row.status is distinct from p_expected_status or v_row.reviewed_at is distinct from p_expected_reviewed_at then raise exception '別の管理操作で変更されています。管理画面を更新して再度お試しください'; end if;
 if v_path<>'' and (v_path!~'^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$' or v_row.kind<>'monster' or v_row.monster_image_path='' or p_status<>'published') then raise exception '公開画像パスが無効です'; end if;
 if v_path<>'' and split_part(v_path,'/',1)<>p_id::text then raise exception '投稿と公開画像が一致しません'; end if;
 perform public.site_feedback_review(p_id,p_status,p_note,p_actor,p_body,p_details);
 update feedback_private.submissions set monster_image_public_path=v_path where id=p_id;
 if v_row.monster_image_public_path<>'' and v_row.monster_image_public_path<>v_path then
  insert into feedback_private.image_cleanup(path) values(v_row.monster_image_public_path) on conflict do nothing;
 end if;
end $$;

create function public.site_feedback_image_cleanup_queue(p_path text)
returns void language sql security invoker set search_path='' as $$
 insert into feedback_private.image_cleanup(path) values(p_path) on conflict do nothing;
$$;

create function public.site_feedback_image_cleanup_list()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(path),'[]'::jsonb) from (select path from feedback_private.image_cleanup order by queued_at limit 20) s;
$$;

create function public.site_feedback_image_cleanup_done(p_path text)
returns void language sql security invoker set search_path='' as $$
 delete from feedback_private.image_cleanup where path=p_path;
$$;

revoke all on function public.site_feedback_get(uuid),public.site_feedback_monster_image_attach(uuid,text),public.site_feedback_review_with_image(uuid,text,text,uuid,text,jsonb,text,text,timestamptz),public.site_feedback_image_cleanup_queue(text),public.site_feedback_image_cleanup_list(),public.site_feedback_image_cleanup_done(text) from public, anon, authenticated;
grant execute on function public.site_feedback_get(uuid),public.site_feedback_monster_image_attach(uuid,text),public.site_feedback_review_with_image(uuid,text,text,uuid,text,jsonb,text,text,timestamptz),public.site_feedback_image_cleanup_queue(text),public.site_feedback_image_cleanup_list(),public.site_feedback_image_cleanup_done(text) to service_role;
