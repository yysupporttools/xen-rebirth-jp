begin;
create schema if not exists board_private;
revoke all on schema board_private from public, anon, authenticated;
create table if not exists board_private.admins(email text primary key);
insert into board_private.admins values ('y.y.supporttools@gmail.com') on conflict do nothing;
create table if not exists public.board_threads (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 120),
 body text not null check(length(body) between 1 and 6000), author_name text not null check(length(author_name) between 1 and 40),
 status text not null default 'open' check(status in ('open','resolved','closed','deleted')),
 best_answer_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 closed_at timestamptz, close_reason text
);
create table if not exists public.board_answers (
 id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.board_threads(id),
 body text not null check(length(body) between 1 and 6000), author_name text not null check(length(author_name) between 1 and 40),
 created_at timestamptz not null default now()
);
create index if not exists board_answers_thread_idx on public.board_answers(thread_id,created_at);
create table if not exists board_private.owners(thread_id uuid primary key references public.board_threads(id), key_hash text not null);
create table if not exists board_private.rate_limits(key_hash text primary key, last_post timestamptz not null);
create table if not exists board_private.audit(id bigint generated always as identity primary key, thread_id uuid, action text, actor uuid, created_at timestamptz default now());
alter table public.board_threads enable row level security;
alter table public.board_answers enable row level security;
revoke all on public.board_threads,public.board_answers from anon,authenticated;
grant select on public.board_threads,public.board_answers to anon,authenticated;
create policy board_threads_read on public.board_threads for select to anon,authenticated using(status <> 'deleted');
create policy board_answers_read on public.board_answers for select to anon,authenticated using(exists(select 1 from public.board_threads t where t.id=thread_id and t.status <> 'deleted'));

create or replace function public.board_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join board_private.admins a on lower(u.email)=lower(a.email) where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
create or replace function board_private.hash_key(p_key text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_key,'UTF8')),'hex');
$$;
create or replace function board_private.throttle(p_key text) returns void language plpgsql set search_path='' as $$
declare k text;
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise exception '投稿者情報を再読み込みしてください'; end if;
 k:=board_private.hash_key(p_key);
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 if exists(select 1 from board_private.rate_limits where key_hash=k and last_post>now()-interval '15 seconds') then raise exception '連続投稿は15秒以上あけてください'; end if;
 insert into board_private.rate_limits values(k,now()) on conflict(key_hash) do update set last_post=excluded.last_post;
end $$;
create or replace function public.board_create_thread(p_title text,p_body text,p_name text,p_owner_key text,p_visitor_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_owner_key is null or p_owner_key !~ '^[a-f0-9]{64}$' then raise exception '管理キーが無効です'; end if;
 perform board_private.throttle(p_visitor_key);
 insert into public.board_threads(title,body,author_name) values(trim(p_title),trim(p_body),coalesce(nullif(trim(p_name),''),'匿名')) returning id into v_id;
 insert into board_private.owners values(v_id,board_private.hash_key(p_owner_key));
 return v_id;
end $$;
create or replace function public.board_add_answer(p_thread_id uuid,p_body text,p_name text,p_visitor_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; t public.board_threads;
begin
 select * into t from public.board_threads where id=p_thread_id for update;
 if t.id is null or t.status<>'open' then raise exception 'このスレッドの回答受付は終了しています'; end if;
 perform board_private.throttle(p_visitor_key);
 insert into public.board_answers(thread_id,body,author_name) values(p_thread_id,trim(p_body),coalesce(nullif(trim(p_name),''),'匿名')) returning id into v_id;
 update public.board_threads set updated_at=now() where id=p_thread_id;
 return v_id;
end $$;
create or replace function public.board_check_owner(p_thread_id uuid,p_owner_key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from board_private.owners where thread_id=p_thread_id and key_hash=board_private.hash_key(p_owner_key));
$$;
create or replace function public.board_close_thread(p_thread_id uuid,p_owner_key text,p_answer_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare t public.board_threads;
begin
 select * into t from public.board_threads where id=p_thread_id for update;
 if not public.board_check_owner(p_thread_id,p_owner_key) then raise exception '質問者の管理キーが必要です'; end if;
 if t.status<>'open' then raise exception 'このスレッドはすでに終了しています'; end if;
 if p_answer_id is not null and not exists(select 1 from public.board_answers where id=p_answer_id and thread_id=p_thread_id) then raise exception 'この質問への回答を選択してください'; end if;
 update public.board_threads set status=case when p_answer_id is null then 'closed' else 'resolved' end,best_answer_id=p_answer_id,closed_at=now(),updated_at=now(),close_reason=case when p_answer_id is null then '質問者が受付を終了しました' else '質問者がベストアンサーを選びました' end where id=p_thread_id;
 insert into board_private.audit(thread_id,action) values(p_thread_id,'owner_close');
end $$;
create or replace function public.board_moderate(p_thread_id uuid,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.board_is_admin() then raise exception '管理者ログインが必要です'; end if;
 if p_action not in ('closed','deleted') then raise exception '操作が無効です'; end if;
 if length(p_reason)>500 then raise exception '理由は500文字以内で入力してください'; end if;
 perform 1 from public.board_threads where id=p_thread_id and status<>'deleted' for update;
 if not found then raise exception 'スレッドが見つかりません'; end if;
 update public.board_threads set status=p_action,closed_at=now(),updated_at=now(),close_reason=coalesce(nullif(trim(p_reason),''),'管理者が受付を終了しました') where id=p_thread_id;
 insert into board_private.audit(thread_id,action,actor) values(p_thread_id,p_action,auth.uid());
end $$;
revoke all on function public.board_is_admin(),public.board_create_thread(text,text,text,text,text),public.board_add_answer(uuid,text,text,text),public.board_check_owner(uuid,text),public.board_close_thread(uuid,text,uuid),public.board_moderate(uuid,text,text) from public;
grant execute on function public.board_is_admin(),public.board_create_thread(text,text,text,text,text),public.board_add_answer(uuid,text,text,text),public.board_check_owner(uuid,text),public.board_close_thread(uuid,text,uuid),public.board_moderate(uuid,text,text) to anon,authenticated;
commit;
