-- Independent quota for immediate image additions. No existing rows/counters
-- are cleared. The Edge passes image-visitor:/image-ip: hashes, never the old
-- report hashes. Ordinary site_feedback_submit() remains 5/10 min and 30/day.
begin;
create or replace function public.site_feedback_submit_image(p_input jsonb,p_visitor_hash text,p_ip_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_token text; v_row feedback_private.throttle;
 v_day date=(now() at time zone 'Asia/Tokyo')::date;
begin
 if jsonb_typeof(p_input) is distinct from 'object'
   or p_input->>'kind' is distinct from 'monster' or p_input->>'category' is distinct from 'image'
   or p_visitor_hash is null or p_visitor_hash!~'^[a-f0-9]{64}$'
   or p_ip_hash is null or p_ip_hash!~'^[a-f0-9]{64}$' then
   raise exception '画像の入力を確認してください';
 end if;
 foreach v_token in array array[p_visitor_hash,p_ip_hash] loop
  insert into feedback_private.throttle(token) values(v_token) on conflict do nothing;
  select * into v_row from feedback_private.throttle where token=v_token for update;
  if v_row.window_started<=now()-interval '10 minutes' then v_row.window_started=now();v_row.window_count=0; end if;
  if v_row.day_started<>v_day then v_row.day_started=v_day;v_row.day_count=0; end if;
  if v_row.day_count>=500 then
   raise exception '本日の画像追加の上限500枚に達しました。日本時間の翌日0時以降に再度お試しください';
  end if;
  if v_row.window_count>=60 then
   raise exception '画像の追加が続いています。10分間に60枚まで追加できます。最大10分ほど待ってから再度お試しください';
  end if;
  update feedback_private.throttle set window_started=v_row.window_started,window_count=v_row.window_count+1,
   day_started=v_day,day_count=v_row.day_count+1 where token=v_token;
 end loop;
 -- Reservation and receipt insertion share the transaction. Neither count is
 -- spent when the other limit or the receipt's validation fails.
 insert into feedback_private.submissions(kind,article_url,title,monster_id,category,body,details,source_url,author_name,attachment_path)
 values('monster',p_input->>'article_url',p_input->>'title',nullif(p_input->>'monster_id',''),'image',p_input->>'body',
   '{}'::jsonb,coalesce(p_input->>'source_url',''),coalesce(nullif(p_input->>'author_name',''),'匿名'),'')
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.site_feedback_submit_image(jsonb,text,text) from public, anon, authenticated;
grant execute on function public.site_feedback_submit_image(jsonb,text,text) to service_role;
commit;
