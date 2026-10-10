"use strict";
(function(root){
  const nav=root.XenMapNavigation,repo=root.XenMapNavigationData,location=root.XenMapLocation;
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const canonicalMemo=new Map(),labelMemo=new Map();
  let memoRegistry=root.XEN_MAP_REGISTRY,memoDictionary=root.XEN_MAP_JAPANESE_NAMES;
  const canon=value=>{const raw=String(value??"");if(memoRegistry!==root.XEN_MAP_REGISTRY){memoRegistry=root.XEN_MAP_REGISTRY;canonicalMemo.clear();labelMemo.clear();}if(!canonicalMemo.has(raw)){if(canonicalMemo.size>4096)canonicalMemo.clear();canonicalMemo.set(raw,nav.canonicalMapName(raw));}return canonicalMemo.get(raw);},key=value=>nav.searchKey(value);
  function mapLabel(value){
    const name=canon(value);
    if(memoDictionary!==root.XEN_MAP_JAPANESE_NAMES){memoDictionary=root.XEN_MAP_JAPANESE_NAMES;labelMemo.clear();}
    if(!labelMemo.has(name)){
      if(labelMemo.size>4096)labelMemo.clear();
      const old=Object.prototype.hasOwnProperty.call(memoDictionary||{},name)&&typeof memoDictionary[name]==="string"?memoDictionary[name]:"";
      labelMemo.set(name,old?name+"（"+old+"）":name);
    }
    return labelMemo.get(name);
  }
  const imageKey=map=>String(map?.id||"")+"|"+String(map?.map_image_url||"")+"|"+String(map?.source_image_hash||"");
  function pointOnImage(point,map){
    if(!point||!map||String(point.map_id||point.mapId)!==String(map.id))return null;
    if(map.image_source==="manual"&&!point.personal)return null;
    if(point.image_key && point.image_key!==imageKey(map))return null;
    const x=nav.validCoordinate(point.x??point.x_norm),y=nav.validCoordinate(point.y??point.y_norm);
    return x===null||y===null?null:{x,y,map_id:map.id,name:point.npc_name||point.name||"",personal:!!point.personal};
  }
  function searchEntries(data){
    const entries=new Map(),mapsById=new Map((data.maps||[]).map(map=>[map.id,map]));
    function npc(name,map,point){
      if(!String(name||"").trim()||!String(map||"").trim())return;
      const canonical=canon(map),id="npc|"+key(name)+"|"+canonical;
      if(!entries.has(id))entries.set(id,{kind:"npc",id,name:String(name),map:canonical,points:[]});
      if(point)entries.get(id).points.push(point);
    }
    for(const point of data.mapNpcs||[]){const map=mapsById.get(point.map_id);if(map)npc(point.npc_name,map.map_name,point);}
    for(const row of data.npcProfiles||[])npc(row.npc_name,row.map_name);
    for(const row of data.knowledge||[])npc(row.npc_name,row.map_name);
    for(const monster of data.monsters||[])entries.set("monster|"+monster.id,{...monster,id:"monster|"+monster.id,monsterId:monster.id,kind:"monster",points:[]});
    return [...entries.values()].sort((a,b)=>a.name.localeCompare(b.name,"en")||a.map.localeCompare(b.map,"en"));
  }
  function search(entries,query){
    const q=key(query);
    if(!q)return [];
    const mapQuery=key(canon(query));
    return entries.filter(entry=>key(entry.name).includes(q)||key(mapLabel(entry.map)).includes(q)||key(entry.map)===mapQuery).sort((a,b)=>{
      const exactA=key(a.name)===q?0:1,exactB=key(b.name)===q?0:1;
      return exactA-exactB||a.name.localeCompare(b.name,"en")||a.map.localeCompare(b.map,"en");
    });
  }
  function planRoute(graph,current,destination,level,conditions){
    if(current&&destination&&canon(current)===canon(destination))return {path:[canon(current)],steps:[],edges:[],restricted:false,requiredLevel:null};
    return nav.findRoute(graph,current,destination,{level,items:conditions?.items||[],flags:conditions?.flags||[]});
  }
  function markerKey(map,step,target){
    if(!map)return "";
    const purpose=step?"exit|"+step.to+"|"+step.kind:target&&!target.regionOnly?"target|"+target.id:"";
    return purpose?imageKey(map)+"|"+purpose:"";
  }
  function guidance(map,plan,target,personal){
    if(!map)return {point:null,step:null,text:"マップを選んでください。"};
    const step=plan?.steps.find(step=>canon(step.from)===canon(map.map_name));
    if(step){
      const registered=map.image_source==="manual"?null:nav.selectExit(step,map,personal.mapNpcs||[]);
      const local=personal.markers?.[markerKey(map,step,target)];
      return {point:registered||pointOnImage(local,map),step,
        text:["transporter","transport","npc-transport","event-transport"].includes(step.kind)?"ここから "+mapLabel(step.to)+" へ移動します。":"次のマップは "+mapLabel(step.to)+" です。",
        missing:registered?"":"出口・案内NPCの位置は未登録です。方向の目安は行き方欄をご確認ください。"};
    }
    if(target&&!target.regionOnly&&canon(target.map)===canon(map.map_name)){
      let registered=pointOnImage(target.point,map);
      if(!registered&&target.kind==="npc"){
        const candidates=(target.points||[]).map(row=>pointOnImage(row,map)).filter(Boolean);
        if(candidates.length&&candidates.every(point=>Math.abs(point.x-candidates[0].x)<=5&&Math.abs(point.y-candidates[0].y)<=5))registered=candidates[0];
      }
      const local=personal.markers?.[markerKey(map,null,target)];
      return {point:registered||pointOnImage(local,map),step:null,
        text:target.kind==="monster"?target.name+" の出現マップです。":target.name+" の場所です。",
        missing:registered?"":target.kind==="monster"?"モンスターの座標は未登録です。出現マップまで案内しています。":"この画像に対応したNPCの位置は未登録です。"};
    }
    return {point:null,step:null,text:plan?.path.includes(canon(map.map_name))?"目的地のマップです。":"保存されたマップを表示しています。",missing:""};
  }
  root.XenMapNavigator={searchEntries,search,planRoute,pointOnImage,imageKey,markerKey,guidance,esc,mapLabel};
  if(!root.document?.getElementById("map-current"))return;
  const $=id=>root.document.getElementById(id);
  const storeKey="xen-map-personal-markers-v1";
  let data={maps:[],mapNpcs:[],npcProfiles:[],knowledge:[],monsters:[],mapGroups:[],transitions:[],warnings:[]};
  let graph,entries=[],target=null,plan=null,shown="",variantId="",zoom=1,pointMode="",loaded=false,reloading=false;
  let markers={},currentPoint=null;
  let uploadFile=null,uploadUrl="",uploadSaving=false,uploadName="",uploadMode="add",uploadMap=null;
  function readPersonal(){
    try{
      const stored=JSON.parse(localStorage.getItem(storeKey)||"null");
      if(stored&&stored.version===1){markers=stored.markers&&typeof stored.markers==="object"&&!Array.isArray(stored.markers)?stored.markers:{};currentPoint=stored.current||null;}
    }catch(_){}
  }
  function writePersonal(){
    try{localStorage.setItem(storeKey,JSON.stringify({version:1,markers,current:currentPoint}));}catch(_){$("map-point-status").textContent="このブラウザでは目印を保存できません。この画面を開いている間だけ利用できます。";}
  }
  function safeImage(value){
    try{const url=new URL(value),project=new URL(root.XEN_GLOSSARY_CONFIG.SUPABASE_URL);return url.origin===project.origin&&url.pathname.startsWith("/storage/v1/object/public/map-images/")?url.href:"";}catch(_){return "";}
  }
  function selectedMap(){
    const group=data.mapGroups.find(map=>canon(map.map_name)===shown);
    if(!group)return null;
    return group.map_variants.find(map=>map.id===variantId)||group.map_variants[0];
  }
  function syncImageActions(){
    const busy=reloading||uploadSaving;
    $("map-reload").disabled=busy;
    $("map-update-image").disabled=busy||!safeImage(selectedMap()?.map_image_url);
  }
  function buildGraph(){graph=nav.buildGraph(root.XEN_WORLD_ROUTES,data.transitions,{maps:data.maps,mapNpcs:data.mapNpcs,includeTransports:$("map-transports").checked});}
  function noExpandedMap(name){return (root.XEN_MAP_TRANSPORTS?.noExpandedMapMaps||[]).map(canon).includes(canon(name));}
  root.XenMapNavigator.registeredNames=()=>names();
  function names(){
    return [...new Set([...(root.XEN_MAP_REGISTRY?.names||[]),...(graph?.nodes||[]),...data.maps.map(map=>map.map_name),...entries.filter(entry=>!entry.regionOnly).map(entry=>entry.map),$("map-current").value,$("map-destination").value,shown].filter(Boolean).map(canon))].sort((a,b)=>a.localeCompare(b,"en"));
  }
  function renderOptions(){
    const all=names();
    $("map-names").innerHTML=all.map(name=>'<option value="'+esc(name)+'" label="'+esc(mapLabel(name))+'">'+esc(mapLabel(name))+'</option>').join("");
    $("map-view-select").innerHTML='<option value="">マップを選ぶ</option>'+all.map(name=>'<option value="'+esc(name)+'">'+esc(mapLabel(name))+(noExpandedMap(name)?"（拡大マップなし）":data.maps.some(map=>map.map_name===name&&map.map_image_url)?"":schematic(name)?"（動画の部分構造図）":"（画像未登録）")+'</option>').join("");
    $("map-view-select").value=shown;
  }
  function currentStatus(state){
    const current=$("map-current").value.trim();
    if(!current){$("map-current-status").textContent="現在のマップを選んでください。";return;}
    const matching=state&&canon(state.map)===canon(current);
    $("map-current-status").textContent="現在地："+mapLabel(current)+" · "+(matching?(state.source==="capture"?"画面から把握":"手動指定")+" · "+new Date(state.at).toLocaleString("ja-JP"):"手動で選んだ現在のマップです。");
    const blocked=(root.XEN_MAP_TRANSPORTS?.noTransporterTowns||[]).map(canon).includes(canon(current));
    $("map-town-note").textContent=blocked?"この町にはトランスポーターがありません。":$("map-transports").checked?"トランスポーターは確認された行き先だけを案内します。到着位置は未登録です。":"徒歩経路を中心に案内します。";
  }
  function setView(name,id){
    shown=canon(name);variantId=id||"";
    const map=selectedMap();if(map)variantId=map.id;
    zoom=1;pointMode="";$("map-viewport").dataset.pointMode="";
    $("map-cancel-point").hidden=true;
    renderOptions();renderMap();renderRoute();
  }
  function choose(entry){
    target={...entry};
    if(entry.regionOnly){
      plan=null;$("map-destination").value="";renderRoute();renderMap();
      $("map-route-status").textContent="地域のみ登録されています。詳細な出現マップを図鑑で確認・登録してください。";
      $("map-target-info").innerHTML='<strong>'+esc(entry.name)+'</strong><span>'+esc(mapLabel(entry.map||entry.region))+'（地域情報）</span><a href="monsters.html#'+encodeURIComponent(entry.monsterId)+'">モンスター図鑑で詳細を見る</a>';
      return;
    }
    const group=data.mapGroups.find(map=>map.map_name===entry.map);
    const candidates=!entry.explicitPoint&&group?.image_source==="manual"?entry.points.filter(point=>point.map_id===group.id):entry.points;
    const preferred=candidates.filter(point=>pointOnImage(point,data.maps.find(map=>map.id===point.map_id))).sort((a,b)=>Number(b.confidence)-Number(a.confidence))[0];
    if(preferred)target.point=preferred;
    $("map-destination").value=entry.map;
    compute(true);
    if(entry.map)setView(entry.map,preferred?.map_id||"");
    renderTarget();
  }
  function npcLocationLabel(entry){
    if(entry.kind!=="npc")return "";
    const group=data.mapGroups.find(map=>map.map_name===entry.map);
    if(group?.image_source==="manual")return " · 新しい画像の位置は未確認";
    return entry.points.some(point=>pointOnImage(point,data.maps.find(map=>map.id===point.map_id)))?"":" · 位置未登録";
  }
  function renderSearch(){
    const matches=search(entries,$("map-search-input").value);
    $("map-search-status").textContent=key($("map-search-input").value)?matches.length+"件"+(matches.length>60?" · 名前を絞り込むと探しやすくなります":""):"NPC名・モンスター名を入力してください。";
    $("map-search-results").innerHTML=matches.slice(0,60).map(entry=>'<button type="button" data-search-entry="'+esc(entry.id)+'"><span class="map-result-kind">'+(entry.kind==="npc"?"NPC":"モンスター")+'</span><strong>'+esc(entry.name)+(entry.level!=null?' · Lv '+esc(entry.level):"")+'</strong><small>'+esc(mapLabel(entry.map||entry.region||"出現場所未登録"))+(entry.regionOnly?" · 地域のみ":"")+npcLocationLabel(entry)+'</small></button>').join("");
  }
  function compute(changeView){
    buildGraph();
    const current=canon($("map-current").value),destination=canon($("map-destination").value);
    $("map-current").value=current;$("map-destination").value=destination;
    const level=$("map-level").value===""?null:Number($("map-level").value);
    plan=planRoute(graph,current,destination,level,{items:$("map-library-card").checked?["Library Card"]:[],flags:[...($("map-garcia-quest").checked?["garciaQuest"]:[]),...($("map-event-weekend").checked?["fourSeasonsWeekend"]:[])]});
    if(target&&!target.regionOnly&&target.map!==destination)target=null;
    currentStatus(location.read());
    renderOptions();renderRoute();
    if(changeView)setView(current||destination);
    else renderMap();
  }
  function renderRoute(){
    const current=canon($("map-current").value),destination=canon($("map-destination").value);
    $("map-destination-display").textContent=destination?"行き先："+mapLabel(destination):"";
    let text="";
    if(target?.regionOnly)text="地域のみ登録されています。詳細な出現マップを図鑑で確認・登録してください。";
    else if(!current||!destination)text="現在のマップと行き先を選んでください。";
    else if(ambiguousVariant(current))text="現在地に同名マップが複数あります。画像を選んでください。経路情報はマップ名単位のため、接続が確認されるまで案内を確定できません。";
    else if(!plan){
      const ignoring=nav.findRoute(graph,current,destination,{level:$("map-level").value||null,items:$("map-library-card").checked?["Library Card"]:[],flags:[...($("map-garcia-quest").checked?["garciaQuest"]:[]),...($("map-event-weekend").checked?["fourSeasonsWeekend"]:[])],ignoreLevel:true,ignoreConditions:true});
      text=ignoring?"選択した条件では利用できる経路がありません。"+(ignoring.requiredLevel?" 必要Lv "+ignoring.requiredLevel+"以上。":"")+(ignoring.requiredItems?.length?" 必要アイテム："+ignoring.requiredItems.join("、")+"。":"")+(ignoring.requiredFlags?.includes("garciaQuest")?" Garciaの前提クエスト完了が必要です。":"")+(ignoring.requiredFlags?.includes("fourSeasonsWeekend")?" Four Seasons Eventはサーバー時間の土日限定です。":""):"マップ間の接続が未登録のため、移動経路を案内できません。目的地の画像やNPC位置は確認できます。";
    }else if(!plan.steps.length)text="現在のマップが目的地です。";
    else text=plan.steps.length+"区間の移動です。"+($("map-level").value===""&&plan.requiredLevel?" この経路にはLv "+plan.requiredLevel+" 以上の条件があります。":"");
    $("map-route-status").textContent=text;
    $("map-route-status").classList.toggle("map-route-warning",!!plan?.requiredLevel&&$("map-level").value===""||!plan&&!!current&&!!destination);
    $("map-route-steps").innerHTML=(ambiguousVariant(current)?[]:plan?.path||[]).map((name,i)=>{
      const step=plan.steps[i],transport=step&&["transporter","transport","npc-transport","event-transport"].includes(step.kind);
      const type=step?(transport?(step.npcName||"トランスポーター・飛行船"):"マップ移動"):"到着";
      const direction=step&&({top:"北側",bottom:"南側",left:"西側",right:"東側","top-right":"右上","top-left":"左上","bottom-right":"右下","bottom-left":"左下"}[step.direction]||"");
      return '<li><button type="button" data-route-map="'+esc(name)+'" aria-current="'+(name===shown?"true":"false")+'"><span class="map-route-step-count">'+(i+1)+'</span><strong>'+esc(mapLabel(name))+'</strong><small>'+esc(type)+(step?' → '+esc(mapLabel(step.to)):"")+'</small>'+(step?.condition?'<small>'+esc(step.condition)+'</small>':"")+(step?.source?'<small>出典：'+esc(step.source)+'</small>':"")+(direction?'<small>出口方向の目安：'+esc(direction)+'</small>':"")+(transport?'<small>到着先の区画・座標は未確認です。</small>':"")+'</button></li>';
    }).join("");
  }
  function renderTarget(){
    if(!target){$("map-target-info").innerHTML=plan?.steps.some(step=>step.kind==="event-transport")?'<a href="glossary.html#four-seasons-event">Four Seasons Eventの概要・アイテム交換を見る</a>':"";return;}
    $("map-target-info").innerHTML='<strong>'+(target.kind==="npc"?"NPC":"モンスター")+'：'+esc(target.name)+'</strong><span>'+esc(mapLabel(target.map||target.region||"出現場所未登録"))+(target.regionOnly?"（地域情報・詳細マップ未登録）":target.mapSource==="player"?"（投稿情報）":"")+'</span>'+(target.kind==="monster"?'<a href="monsters.html#'+encodeURIComponent(target.monsterId)+'">図鑑の詳細・ドロップ・必要DEFを見る</a>':'<a href="capture.html?npc='+encodeURIComponent(target.name)+'&amp;map='+encodeURIComponent(target.map)+'#npc-database" target="_blank" rel="noopener">NPCの会話を確認 ↗</a>');
  }
  function ambiguousVariant(name){
    return data.maps.filter(item=>canon(item.map_name)===canon(name)&&!!item.map_image_url).length>1;
  }
  function activeGuidance(map){
    // A name-based route cannot establish which separate image owns the exit.
    if(map&&ambiguousVariant(map.map_name)&&plan?.steps.some(step=>canon(step.from)===canon(map.map_name))){
      return {point:null,step:null,text:"同名マップが複数あります。画像を切り替えて現在地を確認してください。接続先がマップIDで検証されるまで出口は案内しません。",missing:""};
    }
    return guidance(map,plan,target,{mapNpcs:data.mapNpcs,markers});
  }
  function position(map){
    const shared=location.read();
    // Persisted coordinates require the exact image context and current map.
    if(!map||!shared||canon(shared.map)!==canon(map.map_name)||shared.mapId!==map.id||shared.x===undefined||shared.y===undefined)return null;
    if(!currentPoint||currentPoint.image_key!==imageKey(map)||currentPoint.x!==shared.x||currentPoint.y!==shared.y)return null;
    return pointOnImage(currentPoint,map);
  }
  function pin(point,label,type,id){
    return '<button type="button" class="map-pin '+type+'" style="left:'+(point.x/10)+'%;top:'+(point.y/10)+'%" aria-label="'+esc(label)+'" title="'+esc(label)+'"'+(id?' data-npc-pin="'+esc(id)+'"':"")+'><span>'+esc(label)+'</span>'+(type==="current"?"●":type==="target"?"↓":"")+'</button>';
  }
  function renderPins(){
    const map=selectedMap();if(!map||!safeImage(map.map_image_url))return;
    const own=data.mapNpcs.filter(row=>row.map_id===map.id&&map.image_source!=="manual");
    const info=activeGuidance(map),start=position(map),end=info.point;
    let markup=$("map-show-npcs").checked?own.map(row=>{const p=pointOnImage(row,map);return p?pin(p,row.npc_name,"npc",row.id):"";}).join(""):"";
    if(end)markup+=pin(end,(end.personal?"自分用の目印：":"")+(end.npc_name||end.name||target?.name||info.step?.to||"目的地"),"target");
    if(start)markup+=pin(start,"自分で指定した現在位置","current");
    $("map-pins").innerHTML=markup;
    let arrows='';
    if(end){
      const from=start||{x:end.x,y:end.y<110?Math.min(1000,end.y+100):Math.max(0,end.y-100)};
      if(Math.abs(from.x-end.x)+Math.abs(from.y-end.y)>2)arrows='<defs><marker id="map-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ffd36b"/></marker></defs><line x1="'+from.x+'" y1="'+from.y+'" x2="'+end.x+'" y2="'+end.y+'" stroke="#172b34" stroke-width="10"/><line x1="'+from.x+'" y1="'+from.y+'" x2="'+end.x+'" y2="'+end.y+'" stroke="#ffd36b" stroke-width="5" marker-end="url(#map-arrow-head)"/>';
    }
    $("map-arrows").innerHTML=arrows;
    const annotation=end?(start?"指定した現在位置から、目印までの方向を表示しています。":"矢印は目印を指しています。現在位置は地図から指定できます。"):"";
    $("map-guidance").textContent=info.text+(info.missing?" "+info.missing:"")+(end?.personal?" 自分用に補った目印です。":"")+" "+annotation;
    const mkey=markerKey(map,info.step,target);
    $("map-clear-marker").hidden=!mkey||!markers[mkey];
    $("map-set-marker").disabled=!mkey||!!end&&!end.personal;
  }
  function updateZoom(){
    $("map-stage").style.width=(zoom*100)+"%";$("map-zoom-label").textContent=Math.round(zoom*100)+"%";
  }
  function schematic(name){const value=root.XEN_MAP_SCHEMATICS?.[canon(name)];return value&&/^assets\/schematics\/[a-z-]+\.svg\?v=\d+$/.test(value.path)?value:null;}
  function renderMap(){
    const map=selectedMap(),actual=map?safeImage(map.map_image_url):"",diagram=actual?null:schematic(shown),image=actual||diagram?.path||"";
    $("map-view-title").textContent=mapLabel(shown)||"保存された拡大マップ";
    $("map-view-select").value=shown;
    const group=data.mapGroups.find(row=>canon(row.map_name)===shown);
    const variants=group?.map_variants||[];
    $("map-variant-label").hidden=variants.length<2;
    $("map-variant-select").innerHTML=variants.map((row,i)=>'<option value="'+esc(row.id)+'">画像 '+(i+1)+' · '+esc(mapLabel(row.map_name))+'</option>').join("");
    $("map-variant-select").value=map?.id||"";
    $("map-add-variant").hidden=!shown||noExpandedMap(shown);
    $("map-stage").hidden=!image;$("map-empty").hidden=!!image;$("map-add-image").hidden=!shown||!!map?.map_image_url||noExpandedMap(shown);
    $("map-update-image").hidden=!actual;
    syncImageActions();
    $("map-set-position").disabled=!actual;$("map-set-marker").disabled=!actual;
    $("map-show-npcs").disabled=!!diagram;
    $("map-schematic-note").hidden=!diagram;
    $("map-schematic-caption").textContent=diagram?diagram.label+" — "+diagram.scope:"";
    for(const id of ["map-zoom-in","map-zoom-out","map-reset-view"])$(id).disabled=!image;
    $("map-image-status").textContent=(map?.image_source==="manual"?"手動更新の画像を優先表示しています。画像更新後のNPC位置は確認中です。 ":"")+(map?.updated_at?"画像・マップ情報の保存："+new Date(map.updated_at).toLocaleString("ja-JP"):"");
    $("map-image-status").classList.toggle("map-image-review",map?.image_source==="manual");
    if(image){
      $("map-image").alt=diagram?diagram.label+"（動画から作成した概略構造図）":mapLabel(shown)+" のゲーム内拡大マップ";
      if($("map-image").getAttribute("src")!==image)$("map-image").src=image;
      $("map-stage").style.width=(zoom*100)+"%";
      if(diagram){$("map-pins").innerHTML="";$("map-arrows").innerHTML="";$("map-clear-marker").hidden=true;$("map-image-status").textContent="動画から作成した構造図。位置・縮尺は概略で、ゲーム画面の座標とは対応していません。";$("map-guidance").textContent=activeGuidance(map||{map_name:shown}).text+" 構造図の門・ポータルを参考に移動してください。";}else renderPins();
    }else{
      $("map-image").removeAttribute("src");$("map-arrows").innerHTML="";$("map-pins").innerHTML="";
      $("map-empty-text").textContent=noExpandedMap(shown)?"この場所には拡大マップがありません。移動手順と出発NPCで案内します。":shown?mapLabel(shown)+" の拡大マップ画像は未登録です。画像を追加するか、翻訳・NPC検索で収集できます。":"マップを選んでください。";
      $("map-guidance").textContent=shown?activeGuidance(map||{map_name:shown}).text:"マップを選ぶとゲーム内画像を表示します。";
      $("map-clear-marker").hidden=true;
    }
    updateZoom();renderTarget();
    const detail={mapName:shown,imageKey:actual?imageKey(map):diagram?"schematic|"+diagram.path:"",destination:activeGuidance(map||{map_name:shown}).step?.to||""};
    root.XenMapNavigator.currentView=detail;
    root.dispatchEvent(new CustomEvent("xen-map-view",{detail}));
  }
  async function reload(){
    if(reloading)return;
    reloading=true;syncImageActions();$("map-load-status").textContent="保存されたマップを読み込んでいます…";
    try{
      const fresh=await repo.load();data=fresh;loaded=true;shown=canon(shown);$("map-current").value=canon($("map-current").value);$("map-destination").value=canon($("map-destination").value);entries=searchEntries(data);buildGraph();
      if(target){const latest=entries.find(entry=>entry.id===target.id);if(latest){const oldPoint=target.point;target={...latest};if(oldPoint)target.point=latest.points.find(row=>row.id===oldPoint.id)||null;$("map-destination").value=target.regionOnly?"":target.map;}}
      const state=location.read();
      if($("map-follow").checked&&state)$("map-current").value=state.map;
      if(!shown)shown=canon($("map-current").value||data.mapGroups.find(map=>map.map_name==="Essene")?.map_name||data.mapGroups[0]?.map_name||"");
      const selected=selectedMap();if(selected)variantId=selected.id;
      compute(false);renderSearch();
      $("map-load-status").textContent=data.mapGroups.length+"マップの画像情報・"+data.mapNpcs.length+"件の位置情報を読み込みました。"+(data.warnings.length?" "+data.warnings.join(" "):"");
      $("map-load-status").classList.remove("map-error");
    }catch(error){
      $("map-load-status").textContent="読み込めませんでした。再読み込みで再度お試しください。";
      $("map-load-status").classList.add("map-error");
      if(!loaded){buildGraph();renderOptions();renderMap();}
      throw error;
    }finally{reloading=false;syncImageActions();}
  }
  function sync(state){
    if(!$("map-follow").checked||!state)return;
    $("map-current").value=state.map;currentStatus(state);
    if(loaded){
      compute(false);
      if(!pointMode){
        const candidate=state.mapId&&data.maps.find(map=>map.id===state.mapId&&canon(map.map_name)===canon(state.map));
        if(candidate)setView(state.map,candidate.id);
        else if(ambiguousVariant(state.map)){
          if(canon(shown)!==canon(state.map))setView(state.map);
          $("map-current-status").textContent="同名の画像が複数あります。現在地は未確定です。「画像を切り替える」で正しい画像を指定してください。";
        }else setView(state.map);
      }
    }
  }
  function pointAction(mode){
    const map=selectedMap();if(!map?.map_image_url)return;
    pointMode=mode;$("map-viewport").dataset.pointMode=mode;$("map-cancel-point").hidden=false;
    $("map-point-status").textContent=mode==="current"?"画像をクリックして現在位置を指定してください。指定すると、現在のマップをこのマップに切り替えます。":"画像をクリックして、出口・案内先の目印を補ってください。この端末だけに保存します。";
    $("map-viewport").focus({preventScroll:true});
  }
  function cancelPoint(){
    pointMode="";$("map-viewport").dataset.pointMode="";$("map-cancel-point").hidden=true;$("map-point-status").textContent="位置の指定・補った目印は、この端末だけに保存します。";
  }
  function setPoint(event){
    if(!pointMode)return;
    const map=selectedMap(),rect=$("map-image").getBoundingClientRect();
    if(!map||rect.width<=0||rect.height<=0)return;
    let x=(event.clientX-rect.left)*1000/rect.width,y=(event.clientY-rect.top)*1000/rect.height;
    if(event.detail===0){
      const clicked=event.target.closest("button[data-npc-pin]"),row=clicked&&data.mapNpcs.find(row=>row.id===clicked.dataset.npcPin),registered=pointOnImage(row,map);
      if(!registered)return;
      x=registered.x;y=registered.y;
    }
    if(nav.validCoordinate(x)===null||nav.validCoordinate(y)===null)return;
    const point={map_id:map.id,x:Math.round(x),y:Math.round(y),image_key:imageKey(map),personal:true};
    if(pointMode==="current"){
      currentPoint=point;$("map-follow").checked=false;
      $("map-current").value=map.map_name;location.publish({map:map.map_name,mapId:map.id,x:point.x,y:point.y,source:"manual",confidence:100});
    }else{
      const info=activeGuidance(map),mkey=markerKey(map,info.step,target);
      if(!mkey)return;
      point.name=info.step?mapLabel(info.step.to):target?.name||"案内先";markers[mkey]=point;
    }
    writePersonal();cancelPoint();compute(false);renderMap();
  }
  function uploadReset(){
    uploadFile=null;
    if(uploadUrl)URL.revokeObjectURL(uploadUrl);uploadUrl="";
    $("map-upload-file").value="";$("map-upload-cropped").checked=false;$("map-upload-preview").hidden=true;$("map-upload-preview-image").removeAttribute("src");
    $("map-upload-status").textContent="";$("map-upload-status").classList.remove("map-error");
  }
  function openUpload(mode){
    const map=selectedMap(),updating=mode==="update",variant=mode==="variant";
    if(!shown||updating&&!map?.map_image_url||!updating&&noExpandedMap(shown))return;
    uploadReset();uploadMode=updating?"update":variant?"variant":"add";uploadName=shown;
    uploadMap=updating?{id:map.id,map_name:map.map_name,map_image_url:map.map_image_url,source_image_hash:map.source_image_hash||"",image_revision:Number(map.image_revision)||0}:null;
    $("map-upload-title").textContent=updating?"拡大マップ画像を更新":variant?"別マップとして画像を追加":"拡大マップ画像を追加";
    $("map-upload-name").textContent=(updating?"更新するマップ：":"登録先：")+mapLabel(uploadName);
    $("map-upload-mode-note").textContent=updating?"選択中の画像を、見やすい画像に更新します。手動で更新した画像を優先して表示します。NPCの目印は新しい画像で確認できるまで非表示になります。":variant?"同じ名称の別の場所として登録します。元の画像・NPC位置・入口と出口は変更しません。":"拡大マップ全体が見える画像を追加できます。";
    $("map-upload-original").hidden=!updating;
    if(updating)$("map-upload-original-image").src=safeImage(map.map_image_url);
    else $("map-upload-original-image").removeAttribute("src");
    $("map-upload-save").textContent=updating?"画像を更新":"保存";
    $("map-upload-dialog").showModal();$("map-upload-paste").focus();
  }
  function selectUpload(file){
    if(uploadSaving)return;
    if(!file||!file.size||file.size>2097152||!["image/png","image/jpeg","image/webp"].includes(file.type)){
      uploadReset();$("map-upload-status").textContent="PNG / JPEG / WebP、2MB以内の画像を選んでください。";$("map-upload-status").classList.add("map-error");return;
    }
    if(uploadUrl)URL.revokeObjectURL(uploadUrl);
    uploadFile=file;uploadUrl=URL.createObjectURL(file);$("map-upload-preview-image").src=uploadUrl;$("map-upload-preview").hidden=false;
    $("map-upload-caption").textContent=(file.name||"貼り付けた画像")+" / "+Math.ceil(file.size/1024)+"KB";
    $("map-upload-status").textContent="登録先の拡大マップ全体が写っていることを確認してください。";$("map-upload-status").classList.remove("map-error");
  }
  function applyImageUpdate(saved,original){
    const index=data.maps.findIndex(map=>map.id===original.id);
    if(index<0)return;
    data.maps[index]={...data.maps[index],map_image_url:saved.image_url,source_image_hash:saved.source_image_hash,image_source:"manual",
      image_revision:saved.image_revision,image_width:saved.image_width,image_height:saved.image_height,updated_at:saved.updated_at||new Date().toISOString()};
    data.mapGroups=repo.groupMaps(data.maps);
    data.mapNpcs=data.mapNpcs.map(row=>row.map_id===original.id?{...row,x_norm:null,y_norm:null,position_unconfirmed:true}:row);
    entries=searchEntries(data);
    buildGraph();setView(data.maps[index].map_name,original.id);renderSearch();
  }
  async function saveUpload(event){
    event.preventDefault();if(uploadSaving)return;
    if(!uploadFile){$("map-upload-status").textContent="先に画像を貼り付けるかファイルを選んでください。";return;}
    if(!$("map-upload-cropped").checked){$("map-upload-status").textContent="拡大マップ全体だけに切り抜いた画像であることを確認してください。";return;}
    uploadSaving=true;syncImageActions();const selectedFile=uploadFile,name=uploadName,mode=uploadMode,original=uploadMap;
    $("map-upload-save").disabled=true;$("map-upload-cancel").disabled=true;$("map-upload-close").disabled=true;$("map-upload-file").disabled=true;
    $("map-upload-status").textContent="画像を保存しています…";
    try{
      const saved=mode==="update"?await repo.updateMap({mapId:original.id,expectedImageUrl:original.map_image_url,expectedImageHash:original.source_image_hash,expectedRevision:original.image_revision,file:selectedFile,cropped:true}):await repo.saveMap({name,file:selectedFile,cropped:true,allowVariant:mode==="variant"});
      if(mode==="update")applyImageUpdate(saved,original);
      uploadFile=null;$("map-upload-status").textContent="保存しました。表示を更新しています…";
      $("map-upload-dialog").close();
      try{await reload();setView(name,mode==="update"?original.id:saved.map_id||"");$("map-image-status").textContent=mode==="update"?"画像を更新しました。NPC位置は新しい画像で確認できるまで非表示になります。":"拡大マップ画像を保存しました。";}
      catch(_){$("map-load-status").textContent="画像の保存は完了しました。表示の更新だけ失敗しました。「再読み込み」を押してください。";}
     }catch(error){
      $("map-upload-status").textContent="保存できませんでした："+error.message;
      $("map-upload-status").classList.add("map-error");
      if(error.code==="image_conflict"||error.code==="update_uncertain"){
        uploadFile=null;$("map-upload-preview").hidden=true;$("map-upload-file").value="";
        try{await reload();}catch(_){}
        $("map-upload-status").textContent=error.code==="image_conflict"?"画像が更新されていたため、保存しませんでした。いったん閉じて現在の画像を確認し、「画像を更新」を押し直してください。":"更新結果を確認できませんでした。いったん閉じて現在の画像を確認してください。";
      }
    }
    finally{uploadSaving=false;syncImageActions();$("map-upload-save").disabled=false;$("map-upload-cancel").disabled=false;$("map-upload-close").disabled=false;$("map-upload-file").disabled=false;}
  }
  $("map-show-npcs").checked=false;
  readPersonal();
  $("map-plan-form").addEventListener("submit",event=>{event.preventDefault();target=null;compute(true);});
  $("map-current").addEventListener("change",()=>{$("map-follow").checked=false;currentPoint=null;location.publish({map:canon($("map-current").value),source:"manual",confidence:100});writePersonal();compute(true);});
  $("map-follow").addEventListener("change",()=>{if($("map-follow").checked)sync(location.read());});
  $("map-transports").addEventListener("change",()=>compute(false));
  $("map-level").addEventListener("change",()=>compute(false));
  $("map-library-card").addEventListener("change",()=>compute(false));
  $("map-garcia-quest").addEventListener("change",()=>compute(false));
  $("map-event-weekend").addEventListener("change",()=>compute(false));
  $("map-destination").addEventListener("change",()=>{target=null;compute(false);});
  $("map-search-input").addEventListener("input",renderSearch);
  $("map-search-results").addEventListener("click",event=>{const button=event.target.closest("button[data-search-entry]");if(button){const entry=entries.find(item=>item.id===button.dataset.searchEntry);if(entry)choose(entry);}});
  $("map-route-steps").addEventListener("click",event=>{const button=event.target.closest("button[data-route-map]");if(button)setView(button.dataset.routeMap);});
  $("map-view-select").addEventListener("change",()=>setView($("map-view-select").value));
  $("map-variant-select").addEventListener("change",()=>{
    variantId=$("map-variant-select").value;zoom=1;cancelPoint();
    const map=selectedMap();
    if(map&&canon($("map-current").value)===canon(map.map_name)){
      location.publish({map:map.map_name,mapId:map.id,source:"manual",confidence:100,method:"map-variant-selection"});
    }
    renderMap();renderRoute();
  });
  $("map-reload").addEventListener("click",()=>reload().catch(()=>{}));
  $("map-image").addEventListener("error",()=>{$("map-stage").hidden=true;$("map-empty").hidden=false;$("map-empty-text").textContent="マップ画像を読み込めませんでした。再読み込みで再度お試しください。";$("map-add-image").hidden=true;$("map-set-position").disabled=true;$("map-set-marker").disabled=true;});
  $("map-image").addEventListener("load",()=>{$("map-stage").hidden=false;$("map-empty").hidden=true;renderPins();});
  $("map-zoom-in").addEventListener("click",()=>{zoom=Math.min(4,zoom+.25);updateZoom();});
  $("map-zoom-out").addEventListener("click",()=>{zoom=Math.max(1,zoom-.25);updateZoom();});
  $("map-reset-view").addEventListener("click",()=>{zoom=1;updateZoom();$("map-viewport").scrollTo({top:0,left:0});});
  $("map-show-npcs").addEventListener("change",renderPins);
  $("map-set-position").addEventListener("click",()=>pointAction("current"));
  $("map-set-marker").addEventListener("click",()=>pointAction("target"));
  $("map-cancel-point").addEventListener("click",cancelPoint);
  $("map-clear-marker").addEventListener("click",()=>{const map=selectedMap(),info=activeGuidance(map);delete markers[markerKey(map,info.step,target)];writePersonal();renderMap();});
  $("map-viewport").addEventListener("click",event=>{if(pointMode){setPoint(event);return;}const pin=event.target.closest("button[data-npc-pin]");if(pin){const point=data.mapNpcs.find(row=>row.id===pin.dataset.npcPin),map=selectedMap();if(point&&map)choose({kind:"npc",id:"npc|"+key(point.npc_name)+"|"+map.map_name,name:point.npc_name,map:map.map_name,points:[point],explicitPoint:true});}});
  $("map-viewport").addEventListener("keydown",event=>{
    if(event.key==="Escape"){cancelPoint();return;}
    if(event.target!==$("map-viewport"))return;
    const directions={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]};
    if(directions[event.key]){event.preventDefault();$("map-viewport").scrollBy({left:directions[event.key][0],top:directions[event.key][1]});}
  });
  $("map-add-image").addEventListener("click",()=>openUpload("add"));
  $("map-add-variant").addEventListener("click",()=>openUpload("variant"));
  $("map-schematic-add").addEventListener("click",()=>openUpload("add"));
  $("map-update-image").addEventListener("click",()=>openUpload("update"));
  $("map-upload-paste").addEventListener("click",()=>$("map-upload-paste").focus());
  $("map-upload-paste").addEventListener("paste",event=>{const file=[...(event.clipboardData?.items||[])].find(item=>item.kind==="file"&&item.type.startsWith("image/"))?.getAsFile();if(file){event.preventDefault();selectUpload(file);}});
  $("map-upload-file").addEventListener("change",()=>selectUpload($("map-upload-file").files[0]));
  $("map-upload-form").addEventListener("submit",saveUpload);
  for(const id of ["map-upload-close","map-upload-cancel"])$(id).addEventListener("click",()=>{if(!uploadSaving)$("map-upload-dialog").close();});
  $("map-upload-dialog").addEventListener("cancel",event=>{if(uploadSaving)event.preventDefault();});
  $("map-upload-dialog").addEventListener("close",uploadReset);
  location.subscribe(sync);currentStatus(location.read());sync(location.read());
  reload().catch(()=>{});
})(typeof window!=="undefined"?window:globalThis);

