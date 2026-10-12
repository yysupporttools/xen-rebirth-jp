begin;
create or replace function public.site_feedback_create_monster(p_input jsonb,p_visitor_hash text,p_ip_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_existing text; v_meta jsonb; v_clean jsonb;
begin
 v_meta=p_input->'catalog_entry';
 if jsonb_typeof(v_meta) is distinct from 'object'
 or length(trim(coalesce(v_meta->>'name','')))=0 or length(v_meta->>'name')>200
 or length(trim(coalesce(v_meta->>'map','')))=0 or length(v_meta->>'map')>200
 or coalesce(v_meta->>'regionId','')!~'^[a-z0-9-]{1,100}$'
 or length(trim(coalesce(v_meta->>'region','')))=0 or length(v_meta->>'region')>200
 or coalesce(p_input->>'monster_id','')!~'^manual-[a-f0-9-]{36}$' then
 raise exception '名前・地域・マップを確認してください';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(v_meta->>'name'))||'|'||(v_meta->>'map'),0));
 select monster_id into v_existing from public.monster_updates
 where lower(trim(details->'catalog_entry'->>'name'))=lower(trim(v_meta->>'name'))
 and details->'catalog_entry'->>'map'=v_meta->>'map' limit 1;
 if v_existing is not null then return jsonb_build_object('monster_id',v_existing,'existing',true); end if;
 v_clean=p_input-'catalog_entry';
 v_id=public.site_feedback_save_details(v_clean,p_visitor_hash,p_ip_hash);
 update public.monster_updates set details=details||jsonb_build_object('catalog_entry',v_meta) where id=v_id;
 update feedback_private.submissions set details=details||jsonb_build_object('catalog_entry',v_meta) where id=v_id;
 return jsonb_build_object('id',v_id,'monster_id',p_input->>'monster_id','existing',false);
end $$;
revoke all on function public.site_feedback_create_monster(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.site_feedback_create_monster(jsonb,text,text) to service_role;
commit;