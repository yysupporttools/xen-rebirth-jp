create schema visitor_private;
revoke all on schema visitor_private from public, anon, authenticated;
grant usage on schema visitor_private to service_role;
create table visitor_private.totals (id boolean primary key default true check(id), total bigint not null default 0, started date not null default (now() at time zone 'Asia/Tokyo')::date);
insert into visitor_private.totals(id) values(true);
create table visitor_private.visitors (token text primary key check(length(token)=64), last_day date not null);
create table visitor_private.daily (day date primary key, visitors bigint not null default 0);
alter table visitor_private.totals enable row level security;
alter table visitor_private.visitors enable row level security;
alter table visitor_private.daily enable row level security;
revoke all on all tables in schema visitor_private from public, anon, authenticated;
grant select, insert, update on all tables in schema visitor_private to service_role;
create function public.site_visitor_counter(p_token text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d date := (now() at time zone 'Asia/Tokyo')::date; previous date; total_count bigint; started_day date;
begin
select total, started into total_count, started_day from visitor_private.totals where id=true for update;
if p_token is not null then
 if p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid token'; end if;
 select last_day into previous from visitor_private.visitors where token=p_token;
 if previous is null then
  insert into visitor_private.visitors(token,last_day) values(p_token,d);
  update visitor_private.totals set total=total+1 where id=true returning total into total_count;
 elsif previous<>d then
  update visitor_private.visitors set last_day=d where token=p_token;
 end if;
 if previous is null or previous<>d then
  insert into visitor_private.daily(day,visitors) values(d,1) on conflict(day) do update set visitors=visitor_private.daily.visitors+1;
 end if;
end if;
return jsonb_build_object('total',total_count,'today',coalesce((select visitors from visitor_private.daily where day=d),0),'day',d,'started',started_day);
end $$;
revoke all on function public.site_visitor_counter(text) from public,anon,authenticated;
grant execute on function public.site_visitor_counter(text) to service_role;