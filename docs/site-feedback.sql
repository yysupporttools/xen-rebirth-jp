-- Shared article reports and moderated monster additions.
-- Apply through the Supabase migration API. All mutations are service-only;
-- the Edge Function validates publishable credentials and administrator sessions.
create schema feedback_private;
revoke all on schema feedback_private from public, anon, authenticated;
grant usage on schema feedback_private to service_role;

create table feedback_private.submissions (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('article','monster')),
 article_url text not null check(length(article_url) between 1 and 1000),
 title text not null check(length(title) between 1 and 200),
 monster_id text check(monster_id ~ '^[a-z0-9_-]{1,160}$'),
 category text not null check(category in ('error','outdated','link','other','drop','def','level','map','image','note')),
 body text not null check(length(body) between 1 and 3000),
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 source_url text not null default '' check(length(source_url)<=1000),
 author_name text not null default '匿名' check(length(author_name) between 1 and 40),
 attachment_path text not null default '' check(length(attachment_path)<=180),
 status text not null default 'pending' check(status in ('pending','published','resolved','rejected')),
 review_note text not null default '' check(length(review_note)<=500),
 reviewed_by uuid,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 check((kind='monster' and monster_id is not null) or (kind='article' and monster_id is null))
);
create index feedback_submissions_created_idx on feedback_private.submissions(created_at desc);
create table feedback_private.throttle (
 token text primary key check(token ~ '^[a-f0-9]{64}$'),
 window_started timestamptz not null default now(),
 window_count integer not null default 0,
 day_started date not null default (now() at time zone 'Asia/Tokyo')::date,
 day_count integer not null default 0
);
create table feedback_private.audit (
 id bigint generated always as identity primary key,
 submission_id uuid not null references feedback_private.submissions(id),
 actor uuid not null,
 action text not null,
 created_at timestamptz not null default now()
);
alter table feedback_private.submissions enable row level security;
alter table feedback_private.throttle enable row level security;
alter table feedback_private.audit enable row level security;
grant select,insert,update on feedback_private.submissions,feedback_private.throttle to service_role;
grant insert on feedback_private.audit to service_role;
grant usage on sequence feedback_private.audit_id_seq to service_role;

create table public.monster_updates (
 id uuid primary key references feedback_private.submissions(id),
 monster_id text not null,
 category text not null,
 body text not null,
 details jsonb not null default '{}'::jsonb,
 source_url text not null default '',
 author_name text not null default '匿名',
 created_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create index monster_updates_monster_idx on public.monster_updates(monster_id,updated_at desc);
alter table public.monster_updates enable row level security;
revoke all on public.monster_updates from public, anon, authenticated;
grant select on public.monster_updates to anon, authenticated;
grant select,insert,update,delete on public.monster_updates to service_role;
create policy monster_updates_public_read on public.monster_updates for select to anon, authenticated using (true);

create function public.site_feedback_submit(p_input jsonb,p_visitor_hash text,p_ip_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_token text; v_row feedback_private.throttle; v_day date=(now() at time zone 'Asia/Tokyo')::date;
begin
 if jsonb_typeof(p_input)<>'object' or p_visitor_hash!~'^[a-f0-9]{64}$' or p_ip_hash!~'^[a-f0-9]{64}$' then raise exception '入力が無効です'; end if;
 foreach v_token in array array[p_visitor_hash,p_ip_hash] loop
  insert into feedback_private.throttle(token) values(v_token) on conflict do nothing;
  select * into v_row from feedback_private.throttle where token=v_token for update;
  if v_row.window_started<now()-interval '10 minutes' then v_row.window_started=now();v_row.window_count=0; end if;
  if v_row.day_started<>v_day then v_row.day_started=v_day;v_row.day_count=0; end if;
  if v_row.window_count>=5 or v_row.day_count>=30 then raise exception '投稿が続いています。時間をおいて再度お試しください'; end if;
  update feedback_private.throttle set window_started=v_row.window_started,window_count=v_row.window_count+1,day_started=v_day,day_count=v_row.day_count+1 where token=v_token;
 end loop;
 insert into feedback_private.submissions(kind,article_url,title,monster_id,category,body,details,source_url,author_name,attachment_path)
 values(p_input->>'kind',p_input->>'article_url',p_input->>'title',nullif(p_input->>'monster_id',''),p_input->>'category',p_input->>'body',coalesce(p_input->'details','{}'::jsonb),coalesce(p_input->>'source_url',''),coalesce(nullif(p_input->>'author_name',''),'匿名'),coalesce(p_input->>'attachment_path','')) returning id into v_id;
 return v_id;
end $$;

create function public.site_feedback_list(p_status text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) from (select * from feedback_private.submissions where p_status is null or status=p_status order by created_at desc limit 100) s;
$$;

create function public.site_feedback_attach(p_id uuid,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_path !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[a-f0-9-]{36}\.(png|jpg|webp)$' then raise exception '画像パスが無効です'; end if;
 update feedback_private.submissions set attachment_path=p_path where id=p_id and status='pending' and attachment_path='';
 if not found then raise exception '報告が見つかりません'; end if;
end $$;

create function public.site_feedback_review(p_id uuid,p_status text,p_note text,p_actor uuid,p_body text,p_details jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_row feedback_private.submissions;
begin
 if p_actor is null then raise exception '管理者ログインが必要です'; end if;
 select * into v_row from feedback_private.submissions where id=p_id for update;
 if not found then raise exception '報告が見つかりません'; end if;
 if (v_row.kind='article' and p_status not in ('pending','resolved','rejected')) or (v_row.kind='monster' and p_status not in ('pending','published','rejected')) then raise exception '状態が無効です'; end if;
 if length(p_note)>500 or length(p_body) not between 1 and 3000 or jsonb_typeof(p_details)<>'object' then raise exception '入力が無効です'; end if;
 update feedback_private.submissions set status=p_status,review_note=coalesce(p_note,''),body=p_body,details=p_details,reviewed_by=p_actor,reviewed_at=now() where id=p_id;
 if v_row.kind='monster' and p_status='published' then
  insert into public.monster_updates(id,monster_id,category,body,details,source_url,author_name,created_at)
  values(v_row.id,v_row.monster_id,v_row.category,p_body,p_details,v_row.source_url,v_row.author_name,v_row.created_at)
  on conflict(id) do update set body=excluded.body,details=excluded.details,updated_at=now();
 elsif v_row.kind='monster' then delete from public.monster_updates where id=p_id;
 end if;
 insert into feedback_private.audit(submission_id,actor,action) values(p_id,p_actor,p_status);
end $$;

revoke all on function public.site_feedback_submit(jsonb,text,text),public.site_feedback_list(text),public.site_feedback_attach(uuid,text),public.site_feedback_review(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.site_feedback_submit(jsonb,text,text),public.site_feedback_list(text),public.site_feedback_attach(uuid,text),public.site_feedback_review(uuid,text,text,uuid,text,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('article-feedback','article-feedback',false,2097152,array['image/png','image/jpeg','image/webp']);
-- No public Storage policies: uploads and 10-minute signed reads are issued only
-- by the feedback Edge Function. Screenshots remain private even after approval.
