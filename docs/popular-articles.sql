create schema article_private;
revoke all on schema article_private from public,anon,authenticated;
grant usage on schema article_private to service_role;
create table article_private.catalog (url text primary key,title text not null);
create table article_private.totals (url text primary key,views bigint not null default 0 check(views>=0),started date not null default (now() at time zone 'Asia/Tokyo')::date);
create table article_private.visitors (url text not null,token text not null check(token ~ '^[0-9a-f]{64}$'),last_day date not null,primary key(url,token));
alter table article_private.catalog enable row level security;
alter table article_private.totals enable row level security;
alter table article_private.visitors enable row level security;
revoke all on all tables in schema article_private from public,anon,authenticated;
grant select,insert,update on all tables in schema article_private to service_role;
insert into article_private.catalog(url,title) values ('start.html','初心者ガイド'),('classes.html','職業・スキル一覧'),('class-change.html','転職ガイド'),('class-knight.html','ナイトの職業・スキル'),('class-mage.html','メイジの職業・スキル'),('class-archer.html','アーチャーの職業・スキル'),('class-cleric.html','クレリックの職業・スキル'),('class-rogue.html','ローグの職業・スキル'),('class-templar.html','テンプラーの職業・スキル'),('systems.html','ゲームシステム'),('quests.html','クエスト一覧'),('glossary.html','用語集'),('events.html','イベント'),('bosses.html','ボスタイマー'),('story.html','世界観・ストーリー'),('rules.html','ゲームのルール'),('level-guide.html','キャラクターLv別のやること一覧');
create function public.site_popular_articles(p_url text default null,p_token text default null)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare d date := (now() at time zone 'Asia/Tokyo')::date; article_title text; accepted boolean; ranking jsonb;
begin
if p_url is not null then
 if length(p_url)>220 or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid article'; end if;
 select c.title into article_title from article_private.catalog c where c.url=p_url;
 if article_title is null and p_url like 'glossary.html#%' then
  select coalesce(nullif(t.name_ja,''),t.name_en) into article_title from public.glossary_terms t where t.slug=substring(p_url from 15);
 elsif article_title is null and p_url like 'quests.html#%' then
  select coalesce(nullif(q.title_ja,''),q.title_en) into article_title from public.quests q where q.id::text=substring(p_url from 13);
 end if;
 if article_title is null then raise exception 'Unknown article'; end if;
 with recorded as (
  insert into article_private.visitors(url,token,last_day) values(p_url,p_token,d)
  on conflict(url,token) do update set last_day=excluded.last_day
  where article_private.visitors.last_day<excluded.last_day returning 1
 ) select exists(select 1 from recorded) into accepted;
 if accepted then
  insert into article_private.totals(url,views,started) values(p_url,1,d)
  on conflict(url) do update set views=article_private.totals.views+1;
 end if;
end if;
select coalesce(jsonb_agg(jsonb_build_object('url',r.url,'title',r.title,'views',r.views)),'[]'::jsonb) into ranking from (
 select t.url,t.views,coalesce(c.title,g.name_ja,g.name_en,q.title_ja,q.title_en) as title
 from article_private.totals t
 left join article_private.catalog c on c.url=t.url
 left join public.glossary_terms g on t.url='glossary.html#'||g.slug
 left join public.quests q on t.url='quests.html#'||q.id::text
 where t.views>0 and coalesce(c.title,g.name_ja,g.name_en,q.title_ja,q.title_en) is not null
 order by t.views desc,t.url asc limit 5
) r;
return jsonb_build_object('articles',ranking,'started',(select min(started) from article_private.totals),'day',d);
end $fn$;
revoke all on function public.site_popular_articles(text,text) from public,anon,authenticated;
grant execute on function public.site_popular_articles(text,text) to service_role;
grant select(slug,name_ja,name_en) on public.glossary_terms to service_role;
grant select(id,title_ja,title_en) on public.quests to service_role;
