/* Shared saved-map data. Coordinates belong to the map_id image; never join variants. */
"use strict";
(function(root){
  const registry=root.XEN_MAP_REGISTRY;
  const cfg=root.XEN_GLOSSARY_CONFIG;
  const has=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
  const canonical=value=>registry?registry.resolve(value):String(value||"").trim();
  const fold=value=>String(value||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  const coordinate=value=>{if(value===null||value===undefined||String(value).trim()==="")return null;const number=Number(value);return Number.isFinite(number)&&number>=0&&number<=1000?number:null;};
  let client;
  function db(){
    if(!client){
      if(!cfg||!root.supabase)throw Error("マップの接続設定を読み込めませんでした。再読み込みしてください。");
      client=root.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    }
    return client;
  }
  function record(row){return registry?registry.record(row):Object.assign({},row,{map_name:canonical(row.map_name)});}
  async function readAll(table,columns,order){
    const rows=[],size=500;
    for(let start=0;;start+=size){
      const query=db().from(table).select(columns).order(order||"id",{ascending:true}).range(start,start+size-1);
      const response=await query;
      if(response.error)throw Error(table+" の情報を読み込めませんでした。");
      const page=response.data||[];
      rows.push(...page);
      if(page.length<size)break;
      if(start>=100000)throw Error("データ件数が多すぎるため読み込みを中止しました。");
    }
    return Array.from(new Map(rows.map(row=>[row.id,row])).values());
  }
  function projectMonsters(catalog,updates){
    const sparse=(catalog.monsters||[]).map(row=>({
      id:row.id,name:row.name,level:row.level,map:row.map||"",mapOriginal:row.map||"",
      region:row.region||"",regionId:row.regionId||"",area:row.area||"",
      sourceUrl:row.sourceUrl||"",mapSource:"catalog"
    }));
    const byId=new Map(sparse.map(row=>[row.id,row]));
    for(const row of updates){
      const monster=byId.get(row.monster_id);
      if(monster && monster.level==null && row.details?.publication_mode!=="immediate_details" && row.details?.publication_mode!=="immediate" && Number.isInteger(row.details?.level))monster.level=row.details.level;
    }
    const time=row=>Date.parse(row.created_at||row.updated_at||"")||0;
    const edits=updates.filter(row=>row.details?.publication_mode==="immediate_details").slice().sort((a,b)=>time(a)-time(b)||String(a.id||"").localeCompare(String(b.id||"")));
    for(const row of edits){
      const monster=byId.get(row.monster_id),details=row.details;
      if(!monster)continue;
      if(has(details,"map") && typeof details.map==="string"){
        monster.map=details.map;monster.mapOriginal=details.map;monster.mapSource="player";
        monster.sourceUrl=row.source_url||"";monster.mapUpdateId=row.id;
      }
      if(has(details,"level") && (details.level===null||Number.isInteger(details.level)&&details.level>=0))monster.level=details.level;
    }
    for(const monster of sparse){
      const raw=monster.map.trim();
      monster.map=canonical(raw);
      // A regional heading is not an exact spawn map or position.
      monster.regionOnly=!raw||fold(raw)===fold(monster.region)||/^(north|south|east|west)\s+(eir|essene|brynhilld|candyvault)$/i.test(raw)||/^(town exclusive spawns|shenzhen teleport areas)$/i.test(raw);
    }
    return sparse;
  }
  async function load(){
    const warnings=[];
    async function optional(label,promise){try{return await promise;}catch(error){warnings.push(label);return [];}}
    const catalogPromise=fetch("assets/monsters-data.json?v=1").then(response=>{if(!response.ok)throw Error("モンスター図鑑を読み込めませんでした。");return response.json();});
    const [maps,mapNpcs,npcProfiles,knowledge,catalog,monsterUpdates]=await Promise.all([
      readAll("game_maps","id,map_name,map_image_url,source_image_hash,confidence,created_at,updated_at"),
      readAll("map_npcs","id,map_id,npc_name,x_norm,y_norm,confidence,sighting_count,last_seen_at"),
      optional("NPCの紹介画像を取得できませんでした。",readAll("npc_profiles","id,npc_name,map_name,image_url")),
      optional("NPC会話のマップ情報を取得できませんでした。",readAll("game_knowledge","id,npc_name,map_name")),
      catalogPromise,
      optional("モンスターの投稿情報を取得できませんでした。",readAll("monster_updates","id,monster_id,details,source_url,created_at,updated_at"))
    ]);
    const normalized=maps.map(record);
    return {
      maps:normalized,mapGroups:registry?registry.groups(normalized):normalized.map(row=>Object.assign({},row,{map_variants:[row]})),
      mapNpcs:mapNpcs.map(row=>Object.assign({},row,{x_norm:coordinate(row.x_norm),y_norm:coordinate(row.y_norm),confidence:Number(row.confidence)})),
      npcProfiles:npcProfiles.map(record),knowledge:knowledge.map(record),
      transitions:[],monsters:projectMonsters(catalog,monsterUpdates),monsterUpdates,warnings
    };
  }
  function contributor(){
    const key="xen-game-knowledge-contributor";
    try{let value=localStorage.getItem(key);if(!/^[a-f0-9-]{36}$/i.test(value||"")){value=crypto.randomUUID();localStorage.setItem(key,value);}return value;}catch(_){return crypto.randomUUID();}
  }
  async function sha(blob){
    const bytes=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
    return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("");
  }
  async function mapBlob(file){
    if(!file||!file.size||file.size>2097152||!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("PNG / JPEG / WebP、2MB以内の拡大マップ画像を選んでください。");
    let bitmap;
    try{bitmap=await createImageBitmap(file);}catch(_){throw Error("画像ファイルを読み込めませんでした。");}
    try{
      if(bitmap.width<100||bitmap.height<100||bitmap.width>4096||bitmap.height>4096)throw Error("画像は縦横100〜4096ピクセルの拡大マップを選んでください。");
      const canvas=document.createElement("canvas");
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      canvas.getContext("2d").drawImage(bitmap,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.9));
      if(!blob||blob.type!=="image/webp"||blob.size>2097152)throw Error("画像を保存できる大きさに変換できませんでした。");
      return blob;
    }finally{if(bitmap.close)bitmap.close();}
  }
  async function saveMap(options){
    options=options||{};
    if(options.cropped!==true)throw Error("拡大マップ全体だけに切り抜いた画像を選んでください。");
    const name=canonical(options.name);
    if(!name||name.length>120||/[\u0000-\u001f\u007f<>]/.test(name))throw Error("登録するマップ名を120文字以内で入力してください。");
    const maps=await readAll("game_maps","id,map_name,map_image_url");
    const variants=maps.filter(row=>canonical(row.map_name)===name);
    if(variants.some(row=>row.map_image_url))throw Error("このマップの画像は登録済みです。既存画像はそのまま利用します。");
    const selected=variants.slice().sort((a,b)=>(a.map_name===name?-1:0)-(b.map_name===name?-1:0))[0];
    // Orphaned coordinates cannot safely be attached to an unrelated new crop.
    if(variants.length){
      const points=await readAll("map_npcs","id,map_id");
      if(points.some(row=>variants.some(map=>map.id===row.map_id)))throw Error("このマップには既存の座標があります。翻訳・NPC検索から、座標と同じマップ画像を登録してください。");
    }
    const blob=await mapBlob(options.file),hash=await sha(blob);
    const safe=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"map";
    const path=safe+"/"+Date.now()+"-"+crypto.randomUUID()+".webp";
    const up=await db().storage.from("map-images").upload(path,blob,{contentType:"image/webp",upsert:false});
    if(up.error)throw Error("マップ画像を保存できませんでした。時間をおいて再度お試しください。");
    const url=db().storage.from("map-images").getPublicUrl(path).data.publicUrl;
    if(!url)throw Error("マップ画像の公開URLを取得できませんでした。");
    // Check again after upload so another completed capture is not replaced.
    const latest=await readAll("game_maps","id,map_name,map_image_url");
    if(latest.some(row=>canonical(row.map_name)===name&&row.map_image_url))throw Error("ほかの画面でこのマップが登録されました。再読み込みしてご確認ください。");
    const latestVariants=latest.filter(row=>canonical(row.map_name)===name);
    if(latestVariants.length){
      const latestPoints=await readAll("map_npcs","id,map_id");
      if(latestPoints.some(row=>latestVariants.some(map=>map.id===row.map_id)))throw Error("このマップに新しい座標が保存されました。再読み込みしてご確認ください。");
    }
    const latestRow=latestVariants.find(row=>row.map_name===name)||latestVariants[0]||selected;
    const result=await db().rpc("map_analysis_save",{
      p_map_name:latestRow?latestRow.map_name:name,p_npcs:[],p_image_hash:hash,p_map_image_url:url,
      p_confidence:100,p_contributor_id:contributor()
    });
    if(result.error||result.data?.saved!==true)throw Error("マップ情報を保存できませんでした。再度お試しください。");
    return Object.assign({},result.data,{map_name:name,map_image_url:url,source_image_hash:hash});
  }
  root.XenMapNavigationData={load,saveMap,projectMonsters,canonical};
})(typeof window!=="undefined"?window:globalThis);

