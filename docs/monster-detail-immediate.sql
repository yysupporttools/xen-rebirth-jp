-- Immediate sparse monster detail edits. Existing posts, reports, images,
-- counters, policies and tables remain intact. Call only through site-feedback.
begin;
create or replace function public.site_feedback_save_details(p_input jsonb,p_visitor_hash text,p_ip_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_token text; v_row feedback_private.throttle;
 v_day date=(now() at time zone 'Asia/Tokyo')::date;
 v_details jsonb; v_key text; v_value jsonb; v_max integer;
begin
 if jsonb_typeof(p_input) is distinct from 'object'
   or p_input->>'kind' is distinct from 'monster'
   or p_input->>'category' is distinct from 'note'
   or p_visitor_hash is null or p_visitor_hash!~'^[a-f0-9]{64}$'
   or p_ip_hash is null or p_ip_hash!~'^[a-f0-9]{64}$' then
  raise exception 'モンスター情報の入力を確認してください';
 end if;
 v_details=p_input->'details';
 if jsonb_typeof(v_details) is distinct from 'object'
   or v_details->>'publication_mode' is distinct from 'immediate_details'
   or not exists(select 1 from jsonb_object_keys(v_details) key where key<>'publication_mode') then
  raise exception '変更する項目を入力してください';
 end if;
 for v_key,v_value in select key,value from jsonb_each(v_details) loop
  if v_key='publication_mode' then continue; end if;
  if v_key not in ('level','min_def','max_def','drop_items','map','notes') then
   raise exception '編集できない項目が含まれています';
  end if;
  if v_key in ('level','min_def','max_def') then
   if v_value='null'::jsonb then continue; end if;
   v_max=case when v_key='level' then 300 else 10000 end;
   if jsonb_typeof(v_value) is distinct from 'number' then raise exception 'Lv / DEF の数値を確認してください'; end if;
   if (v_value::text)::numeric<>trunc((v_value::text)::numeric) or (v_value::text)::numeric<0 or (v_value::text)::numeric>v_max then
    raise exception 'Lv / DEF の数値を確認してください';
   end if;
  else
   v_max=case when v_key='drop_items' then 1200 when v_key='map' then 200 else 1000 end;
   if jsonb_typeof(v_value) is distinct from 'string' or length(v_value#>>'{}')>v_max then
    raise exception '文字列の入力を確認してください';
   end if;
  end if;
 end loop;
 if v_details->>'min_def' is not null and v_details->>'max_def' is not null
   and (v_details->>'min_def')::integer>(v_details->>'max_def')::integer then
  raise exception 'DEF の最小値と最大値を確認してください';
 end if;
 foreach v_token in array array[p_visitor_hash,p_ip_hash] loop
  insert into feedback_private.throttle(token) values(v_token) on conflict do nothing;
  select * into v_row from feedback_private.throttle where token=v_token for update;
  if v_row.window_started<=now()-interval '10 minutes' then v_row.window_started=now();v_row.window_count=0; end if;
  if v_row.day_started<>v_day then v_row.day_started=v_day;v_row.day_count=0; end if;
  if v_row.day_count>=500 then
   raise exception '本日の情報保存の上限500件に達しました。日本時間の翌日0時以降に再度お試しください';
  end if;
  if v_row.window_count>=60 then
   raise exception '情報の保存が続いています。10分間に60件まで保存できます。最大10分ほど待ってから再度お試しください';
  end if;
  update feedback_private.throttle set window_started=v_row.window_started,window_count=v_row.window_count+1,
   day_started=v_day,day_count=v_row.day_count+1 where token=v_token;
 end loop;
 -- Receipt and published projection are one transaction. No pending state,
 -- update of old facts, cleared history, or privileged public write is needed.
 insert into feedback_private.submissions(kind,article_url,title,monster_id,category,body,details,source_url,author_name,attachment_path,status,reviewed_at)
 values('monster',p_input->>'article_url',p_input->>'title',p_input->>'monster_id','note',p_input->>'body',
  v_details,coalesce(p_input->>'source_url',''),coalesce(nullif(p_input->>'author_name',''),'匿名'),'','published',now())
 returning id into v_id;
 insert into public.monster_updates(id,monster_id,category,body,details,source_url,author_name,created_at)
 select id,monster_id,category,body,details,source_url,author_name,created_at from feedback_private.submissions where id=v_id;
 return v_id;
end $$;
revoke all on function public.site_feedback_save_details(jsonb,text,text) from public, anon, authenticated;
grant execute on function public.site_feedback_save_details(jsonb,text,text) to service_role;
commit;
