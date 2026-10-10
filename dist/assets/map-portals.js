"use strict";
(function(root){
 const nav=root.XenMapNavigator,$=id=>document.getElementById(id),cfg=root.XEN_GLOSSARY_CONFIG;
 if(!$("map-portal-panel"))return;
 const db=root.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{storageKey:"xen-board-admin",detectSessionInUrl:false}});
 let view=null,rows=[],admin=false,armed=false,draft=null,busy=false,seq=0;
 const escape=nav.esc,canonical=root.XenMapNavigation.canonicalMapName;
 function point(event,image){
  const r=image.getBoundingClientRect();if(!r.width||!r.height)return null;
  const x=(event.clientX-r.left)/r.width*1000,y=(event.clientY-r.top)/r.height*1000;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1000||y<0||y>1000)return null;
  return {x_norm:Math.round(x),y_norm:Math.round(y)};
 }
 function visible(list,current){return current?list.filter(r=>canonical(r.map_name)===canonical(current.mapName)&&r.image_key===current.imageKey):[];}
 root.XenMapPortals={point,visible};
 function message(text){$("map-portal-status").textContent=text;}
 function draw(){
  const list=visible(rows,view),show=$("map-show-portals").checked;
  $("map-portal-pins").innerHTML=show?list.map(r=>'<button type="button" class="map-portal-pin '+r.kind+'" data-portal="'+escape(r.id)+'" style="left:'+r.x_norm/10+'%;top:'+r.y_norm/10+'%" title="'+escape(r.label||r.destination||r.kind)+'"><span>'+escape((r.kind==="entrance"?"入口":"出口")+(r.label?"："+r.label:r.destination?" → "+nav.mapLabel(r.destination):""))+'</span>'+(r.kind==="entrance"?"入":"出")+'</button>').join(""):"";
  if(draft&&draft.x_norm!=null)$("map-portal-pins").innerHTML+='<i class="map-portal-draft" style="left:'+draft.x_norm/10+'%;top:'+draft.y_norm/10+'%">＋</i>';
  $("map-portal-list").innerHTML=list.length?list.map(r=>'<div class="map-portal-row"><span>'+escape((r.kind==="entrance"?"入口":"出口")+(r.label?"："+r.label:"")+(r.destination?" → "+nav.mapLabel(r.destination):""))+'</span>'+(admin?'<button type="button" data-edit-portal="'+escape(r.id)+'">編集・移動</button><button type="button" data-delete-portal="'+escape(r.id)+'">削除</button>':"")+'</div>').join(""):'<p class="map-help">この画像の入口・出口は未登録です。</p>';
  $("map-portal-edit").hidden=!admin;
  $("map-name-edit").hidden=!admin;$("map-name-edit").disabled=busy||!view?.mapName;
  $("map-portal-edit").disabled=busy||!view?.imageKey;
  for(const id of ["map-portal-place","map-portal-save","map-portal-kind","map-portal-label","map-portal-destination"])$(id).disabled=busy||!view?.imageKey;
  $("map-portal-save").disabled=busy||!draft||draft.x_norm==null;
 }
 function reset(){
  armed=false;draft=null;$("map-portal-form").hidden=true;$("map-portal-kind").value="entrance";$("map-portal-label").value="";$("map-portal-destination").value="";$("map-portal-coordinate").textContent="";$("map-viewport").classList.remove("map-portal-placing");draw();
 }
 async function refresh(){
  if(!view?.imageKey){rows=[];draw();return;}
  const request=++seq,v={...view};
  const result=await db.from("map_portals").select("id,map_name,image_key,kind,label,destination,x_norm,y_norm,updated_at").eq("map_name",root.XenMapNames?.source(v.mapName)||v.mapName).eq("image_key",v.imageKey).order("kind").limit(200);
  if(request!==seq||view?.imageKey!==v.imageKey)return;
  if(result.error){message("入口・出口を読み込めませんでした。再読み込みしてください。");return;}
  rows=result.data||[];draw();
 }
 async function auth(){
  const user=await db.auth.getUser();const result=user.data?.user?await db.rpc("board_is_admin"):{data:false};
  admin=!result.error&&result.data===true;
  if(!admin){reset();$("map-name-form").hidden=true;}draw();
 }
 function edit(row){
  if(!admin||busy||!view?.imageKey)return;
  reset();draft=row?{...row}:{map_name:root.XenMapNames?.source(view.mapName)||view.mapName,image_key:view.imageKey,kind:"entrance"};
  $("map-portal-kind").value=draft.kind;$("map-portal-label").value=draft.label||"";$("map-portal-destination").value=draft.destination||"";
  $("map-portal-form").hidden=false;
  $("map-portal-coordinate").textContent=draft.x_norm==null?"地図上で位置を指定してください。":"位置は登録済みです。移動する場合は「地図をクリックして位置を指定」を押してください。";
  message("保存すると、ほかの利用者にも表示されます。");draw();
 }
 $("map-portal-edit").addEventListener("click",()=>edit(null));
 $("map-portal-cancel").addEventListener("click",()=>{if(!busy)reset();});
 $("map-portal-place").addEventListener("click",()=>{
  if(!admin||busy||!draft)return;
  $("map-cancel-point").click();armed=true;$("map-viewport").classList.add("map-portal-placing");
  message("地図上の入口・出口の位置をクリックしてください。Escで位置指定を取り消せます。");
 });
 $("map-viewport").addEventListener("click",event=>{
  if(!armed||!admin||busy)return;
  event.preventDefault();event.stopImmediatePropagation();
  const p=point(event,$("map-image"));if(!p)return;
  Object.assign(draft,p);armed=false;$("map-viewport").classList.remove("map-portal-placing");
  $("map-portal-coordinate").textContent="位置を指定しました。「サイト共通で保存」で確定します。";draw();
 },true);
 $("map-viewport").addEventListener("keydown",event=>{if(event.key==="Escape"){armed=false;$("map-viewport").classList.remove("map-portal-placing");}});
 $("map-portal-form").addEventListener("submit",async event=>{
  event.preventDefault();if(!admin||busy||!draft||draft.x_norm==null||draft.image_key!==view?.imageKey)return;
  const destination=canonical($("map-portal-destination").value.trim()),label=$("map-portal-label").value.trim();
  if(destination&&!(nav.registeredNames?.()||root.XEN_MAP_REGISTRY.names).includes(destination)){message("移動先は登録済みのマップ名から選んでください。");return;}
  if(destination===view.mapName){message("移動先には別のマップを選んでください。");return;}
  const payload={map_name:root.XenMapNames?.source(view.mapName)||view.mapName,image_key:view.imageKey,kind:$("map-portal-kind").value,label,destination,x_norm:draft.x_norm,y_norm:draft.y_norm,updated_at:new Date().toISOString()};
  const savedDraft={...draft};busy=true;draw();message("保存しています…");
  try{
   let query=draft.id?db.from("map_portals").update(payload).eq("id",draft.id).eq("updated_at",draft.updated_at):db.from("map_portals").insert(payload);
   const result=await query.select("id");
   if(result.error)throw Error("保存できませんでした。管理者としてログインしているか確認してください。");
   if(result.data?.length!==1)throw Error("ほかの画面で変更されました。再読み込みしてから編集してください。");
   reset();await refresh();message("サイト共通の入口・出口を保存しました。");
  }catch(error){draft=savedDraft;message(error.message);}
  finally{busy=false;if(draft&&draft.image_key!==view?.imageKey)reset();draw();}
 });
 $("map-portal-list").addEventListener("click",async event=>{
  const editButton=event.target.closest("[data-edit-portal]"),deleteButton=event.target.closest("[data-delete-portal]");
  if(!admin||busy)return;
  if(editButton){edit(rows.find(r=>r.id===editButton.dataset.editPortal));return;}
  if(!deleteButton)return;const row=rows.find(r=>r.id===deleteButton.dataset.deletePortal);
  if(!row||!root.confirm("この入口・出口の印をサイト共通の地図から削除しますか？"))return;
  busy=true;draw();
  try{
   const result=await db.from("map_portals").delete().eq("id",row.id).eq("updated_at",row.updated_at).select("id");
   if(result.error||result.data?.length!==1)throw Error("削除できませんでした。再読み込みしてから確認してください。");
   if(draft?.id===row.id)reset();await refresh();message("印を削除しました。");
  }catch(error){message(error.message);}finally{busy=false;draw();}
 });
 $("map-portal-pins").addEventListener("click",event=>{
  const button=event.target.closest("[data-portal]"),row=button&&rows.find(r=>r.id===button.dataset.portal);
  if(row){message((row.kind==="entrance"?"入口":"出口")+"："+(row.label||"")+(row.destination?" → "+nav.mapLabel(row.destination):""));if(admin)edit(row);}
 });
 let nameSource="",nameOriginal=null;
 $("map-name-edit").addEventListener("click",()=>{
  if(!admin||busy||!view?.mapName)return;reset();
  nameSource=root.XenMapNames?.source(view.mapName)||view.mapName;
  nameOriginal=root.XenMapNames?.rows.find(r=>r.source_name===nameSource)||null;
  $("map-name-corrected").value=view.mapName;$("map-name-form").hidden=false;$("map-name-status").textContent="";
 });
 $("map-name-cancel").addEventListener("click",()=>{if(!busy)$("map-name-form").hidden=true;});
 $("map-name-form").addEventListener("submit",async event=>{
  event.preventDefault();if(!admin||busy||!nameSource||$("map-name-form").hidden)return;
  const name=$("map-name-corrected").value.trim();
  if(!name||name.length>120||/[<> -]/.test(name)){$("map-name-status").textContent="正しいマップ名を120文字以内で入力してください。";return;}
  const other=canonical(name);
  if((nav.registeredNames?.()||root.XEN_MAP_REGISTRY.names).includes(other)&&other!==canonical(nameSource)){$("map-name-status").textContent="別の登録済みマップと同じ名前には変更できません。";return;}
  const aliases=[...new Set([...(nameOriginal?.aliases||[]),nameOriginal?.corrected_name,nameSource].filter(Boolean))].slice(-20);
  const payload={source_name:nameSource,corrected_name:name,aliases,updated_at:new Date().toISOString()};
  busy=true;draw();$("map-name-save").disabled=true;
  try{
   const query=nameOriginal?db.from("map_name_corrections").update(payload).eq("source_name",nameSource).eq("updated_at",nameOriginal.updated_at):db.from("map_name_corrections").insert(payload);
   const result=await query.select("source_name");
   if(result.error||result.data?.length!==1)throw Error("保存できませんでした。再読み込みしてから管理者として編集してください。");
   $("map-name-status").textContent="マップ名を保存しました。画面を更新します。";root.location.reload();
  }catch(error){$("map-name-status").textContent=error.message;}finally{busy=false;$("map-name-save").disabled=false;draw();}
 });
 $("map-show-portals").addEventListener("change",draw);
 $("map-portal-refresh").addEventListener("click",()=>{if(!busy)Promise.all([auth(),refresh()]).catch(()=>message("再読み込みできませんでした。"));});
 root.addEventListener("xen-map-view",event=>{
  const next=event.detail;
  const changed=view?.imageKey!==next.imageKey;if(view?.mapName!==next.mapName){$("map-name-form").hidden=true;nameSource="";}view=next;if(changed){seq++;rows=[];reset();refresh().catch(()=>message("入口・出口を読み込めませんでした。"));}else draw();
 });
 db.auth.onAuthStateChange(()=>setTimeout(()=>auth().catch(()=>{}),0));
 if(root.XenMapNavigator.currentView){view=root.XenMapNavigator.currentView;refresh().catch(()=>{});}
 auth().catch(()=>message("管理者のログイン状態を確認できませんでした。"));
})(window);
