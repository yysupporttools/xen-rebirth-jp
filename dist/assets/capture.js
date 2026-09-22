"use strict";
(function(){
  const cfg=window.XEN_GLOSSARY_CONFIG;
  const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=function(id){return document.getElementById(id);};
  const esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};

  let stream=null;
  let imageBlob=null;
  let imageSourceType="manual";
  let previewUrl="";
  let records=[];
  let activeRecordId="";
  let activeNpcName="";
  const FAST_SCREEN_CACHE_KEY="xen-fast-screen-cache-v1";
  let quests=[];
  let npcProfiles=[];
  let dialogueTransitions=[];
  let gameMaps=[];
  let mapNpcs=[];
  const dialogueNavStacks=new Map();
  let npcImageBlob=null;
  let npcImagePreviewUrl="";
  let aiAnalyzing=false;
  let altDown=false;
  let altWasChord=false;
  let altPressedAt=0;
  let lastAiContext={npc_name:"",map_name:"",at:0};

  let autoEnabled=false;
  let autoTimer=null;
  let autoBaseline=null;
  let autoPending=null;
  let autoPendingAt=0;
  let lastAutoAnalysisAt=0;
  const AUTO_POLL_MS=2500;
  const AUTO_COOLDOWN_MS=10000;
  const AUTO_CHANGE_RATIO=0.018;
  const AUTO_STABLE_RATIO=0.012;
  const AUTO_MAX_PENDING_MS=12000;
  const contributorId=(function(){
    const key="xen-game-knowledge-contributor";
    let value=localStorage.getItem(key);
    if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}
    return value;
  })();

  function setStatus(id,msg){$(id).textContent=msg||"";}
  function setAutoStatus(state,msg){
    const el=$("auto-status");
    if(!el) return;
    el.dataset.state=state;
    el.textContent=msg;
  }
  function setImage(blob,type,silent){
    imageBlob=blob;
    imageSourceType=type||"image_upload";
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(blob);
    $("capture-preview").src=previewUrl;
    $("capture-preview").hidden=false;
    $("preview-empty").hidden=true;
    $("ocr-run").disabled=false;
    $("translate-run").disabled=!$("english-text").value.trim();
    if(!silent) setStatus("capture-status","画像を取り込みました。必要ならOCRを実行してください。");
  }

  async function startScreen(){
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:5,max:15}},audio:false});
      $("screen-video").srcObject=stream;
      $("screen-shot").disabled=false;
      $("screen-stop").disabled=false;
      $("screen-start").disabled=true;
      $("auto-mode").disabled=false;
      setAutoStatus("off","OFF");
      const track=stream.getVideoTracks()[0];
      if(track) track.addEventListener("ended",stopScreen);
      setStatus("capture-status","共有中です。NPC会話やクエスト画面を表示して「現在の画面をキャプチャ」を押してください。");
    }catch(err){
      setStatus("capture-status",err.name==="NotAllowedError"?"画面共有はキャンセルされました。":"画面共有を開始できませんでした："+err.message);
    }
  }

  function stopScreen(){
    stopAutoMonitor(true);
    if(stream) stream.getTracks().forEach(function(t){t.stop();});
    stream=null;
    $("screen-video").srcObject=null;
    $("screen-shot").disabled=true;
    $("screen-stop").disabled=true;
    $("screen-start").disabled=false;
    $("auto-mode").disabled=true;
    $("auto-mode").checked=false;
    setAutoStatus("off","OFF");
  }

  async function captureFrame(silent){
    const video=$("screen-video");
    if(!video.videoWidth){if(!silent)setStatus("capture-status","共有画面がまだ準備できていません。");return null;}
    const maxWidth=1600;
    const scale=Math.min(1,maxWidth/video.videoWidth);
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(video.videoWidth*scale);
    canvas.height=Math.round(video.videoHeight*scale);
    canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(function(resolve){canvas.toBlob(resolve,"image/webp",0.84);});
    if(blob) setImage(blob,"screen_capture",!!silent);
    return blob||null;
  }

  function monitorSample(){
    const video=$("screen-video");
    if(!stream||!video.videoWidth||video.readyState<2) return null;
    const w=128,h=72;
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(video,0,0,w,h);
    const data=ctx.getImageData(0,0,w,h).data;
    const sample=[];
    for(let y=3;y<h-3;y++){
      for(let x=6;x<w-4;x++){
        const inCenter=(x>=20&&x<=101&&y>=7&&y<=58);
        const inRight=(x>=88&&y>=4&&y<=65);
        const inBottom=(x>=12&&x<=116&&y>=39&&y<=67);
        if(!(inCenter||inRight||inBottom)) continue;
        const i=(y*w+x)*4;
        sample.push(Math.round(data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114));
      }
    }
    return new Uint8Array(sample);
  }

  function sampleDifference(a,b){
    if(!a||!b||a.length!==b.length) return 1;
    let changed=0,sum=0;
    for(let i=0;i<a.length;i++){
      const d=Math.abs(a[i]-b[i]);
      sum+=d;
      if(d>=22) changed++;
    }
    const ratio=changed/a.length;
    const mean=sum/a.length;
    return Math.max(ratio,Math.min(1,mean/80));
  }

  function stopAutoMonitor(resetToggle){
    autoEnabled=false;
    if(autoTimer){clearInterval(autoTimer);autoTimer=null;}
    autoBaseline=null;
    autoPending=null;
    autoPendingAt=0;
    if(resetToggle&&$("auto-mode")) $("auto-mode").checked=false;
  }

  async function startAutoMonitor(){
    if(!stream){
      $("auto-mode").checked=false;
      setAutoStatus("off","OFF");
      setStatus("capture-status","先に画面共有を開始してください。");
      return;
    }
    autoEnabled=true;
    autoBaseline=monitorSample();
    autoPending=null;
    autoPendingAt=0;
    setAutoStatus("watching","監視中");
    setStatus("capture-status","自動解析モードを開始しました。NPC会話・クエスト画面の変化を監視します。");
    if(autoTimer) clearInterval(autoTimer);
    autoTimer=setInterval(autoTick,AUTO_POLL_MS);

    setTimeout(function(){
      if(autoEnabled&&stream&&!aiAnalyzing&&(Date.now()-lastAutoAnalysisAt>=AUTO_COOLDOWN_MS)){
        setAutoStatus("analyzing","初回解析中");
        lastAutoAnalysisAt=Date.now();
        runOpenAiAnalysis("auto");
      }
    },900);
  }

  async function autoTick(){
    if(!autoEnabled||!stream) return;
    if(aiAnalyzing){
      setAutoStatus("analyzing","解析中");
      return;
    }

    const now=Date.now();
    if(now-lastAutoAnalysisAt<AUTO_COOLDOWN_MS){
      const remain=Math.ceil((AUTO_COOLDOWN_MS-(now-lastAutoAnalysisAt))/1000);
      setAutoStatus("cooldown","待機 "+remain+"秒");
      return;
    }

    const sample=monitorSample();
    if(!sample) return;
    if(!autoBaseline){
      autoBaseline=sample;
      setAutoStatus("watching","監視中");
      return;
    }

    const changed=sampleDifference(autoBaseline,sample);
    if(changed<AUTO_CHANGE_RATIO){
      autoBaseline=sample;
      autoPending=null;
      autoPendingAt=0;
      setAutoStatus("watching","監視中");
      return;
    }

    if(!autoPending){
      autoPending=sample;
      autoPendingAt=now;
      setAutoStatus("detected","変化検出・安定待ち");
      return;
    }

    const stable=sampleDifference(autoPending,sample);
    if(stable<=AUTO_STABLE_RATIO){
      autoBaseline=sample;
      autoPending=null;
      autoPendingAt=0;
      lastAutoAnalysisAt=now;
      setAutoStatus("analyzing","自動解析中");
      await runOpenAiAnalysis("auto");
      if(autoEnabled&&stream){
        autoBaseline=monitorSample()||autoBaseline;
        setAutoStatus("cooldown","解析完了・待機");
      }
      return;
    }

    if(now-autoPendingAt>AUTO_MAX_PENDING_MS){
      autoBaseline=sample;
      autoPending=null;
      autoPendingAt=0;
      setAutoStatus("watching","動きが大きいため再監視");
      return;
    }

    autoPending=sample;
    setAutoStatus("detected","画面安定待ち");
  }

  function handleFile(file){
    if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)){setStatus("capture-status","PNG / JPEG / WebP画像を選択してください。");return;}
    setImage(file,"image_upload");
  }

  function blobToDataUrl(blob){
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve(String(reader.result||""));};
      reader.onerror=function(){reject(reader.error||new Error("画像を読み込めませんでした。"));};
      reader.readAsDataURL(blob);
    });
  }

  async function blobHash(blob){
    const buffer=await blob.arrayBuffer();
    const digest=await crypto.subtle.digest("SHA-256",buffer);
    return Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");
  }

  function readFastScreenCache(){
    try{
      const parsed=JSON.parse(localStorage.getItem(FAST_SCREEN_CACHE_KEY)||"{}");
      return parsed&&typeof parsed==="object"?parsed:{};
    }catch(_){return {};}
  }

  function rememberFastScreen(imageHash,recordId,npcName){
    if(!imageHash||!recordId) return;
    const cache=readFastScreenCache();
    cache[imageHash]={record_id:recordId,npc_name:npcName||"",at:Date.now()};
    const entries=Object.entries(cache).sort(function(a,b){return Number(b[1].at||0)-Number(a[1].at||0);}).slice(0,250);
    try{localStorage.setItem(FAST_SCREEN_CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));}catch(_){}
  }

  function fastScreenRecord(imageHash){
    const hit=readFastScreenCache()[imageHash];
    if(!hit) return null;
    return records.find(function(r){return r.id===hit.record_id;})||null;
  }

  function dialogueRowsForNpc(name){
    return records.filter(function(r){return r.npc_name===name;}).sort(function(a,b){
      return new Date(a.created_at||0)-new Date(b.created_at||0);
    });
  }

  function dialogueRootForNpc(name){
    const rows=dialogueRowsForNpc(name);
    if(!rows.length) return null;
    const ids=new Set(rows.map(function(r){return r.id;}));
    const inbound=new Set(dialogueTransitions.filter(function(t){
      return ids.has(t.from_record_id)&&ids.has(t.to_record_id);
    }).map(function(t){return t.to_record_id;}));
    return rows.find(function(r){return !inbound.has(r.id);})||rows[0];
  }

  function dialoguePageInfo(record){
    if(!record) return {index:1,total:1};
    const rows=dialogueRowsForNpc(record.npc_name);
    const idx=Math.max(0,rows.findIndex(function(r){return r.id===record.id;}));
    return {index:idx+1,total:Math.max(1,rows.length)};
  }

  function normText(value){
    return String(value||"").trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/g," ");
  }

  function linesToArray(value){
    return String(value||"").split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
  }

  function choicesArray(value){
    if(Array.isArray(value)) return value.map(function(x){return String(x||"").trim();}).filter(Boolean);
    if(typeof value==="string"){
      try{
        const parsed=JSON.parse(value);
        if(Array.isArray(parsed)) return parsed.map(function(x){return String(x||"").trim();}).filter(Boolean);
      }catch(_){}
      return linesToArray(value);
    }
    return [];
  }

  function profileKey(name,map){
    return normText(name)+"|"+normText(map);
  }

  function findNpcProfile(name,map){
    const exact=profileKey(name,map);
    const fallback=profileKey(name,"");
    return npcProfiles.find(function(p){return profileKey(p.npc_name,p.map_name)===exact;})
      || npcProfiles.find(function(p){return profileKey(p.npc_name,"")===fallback;})
      || npcProfiles.find(function(p){return normText(p.npc_name)===normText(name);})
      || null;
  }

  async function applyAiResult(result){
    const f=$("capture-form").elements;
    if(result.screen_type==="expanded_map"){
      if(result.map_name) f.map_name.value=String(result.map_name);
      const n=Array.isArray(result.map_npcs)?result.map_npcs.length:0;
      setStatus("capture-status","拡大マップを認識しました："+(result.map_name||"マップ名不明")+" / NPC候補 "+n+"件");
      return;
    }
    const npc=String(result.npc_name||"").trim();
    let map=String(result.map_name||"").trim();
    if(!map&&npc&&lastAiContext.npc_name===npc&&Date.now()-lastAiContext.at<300000){
      map=lastAiContext.map_name||"";
      result.map_name=map;
    }
    if(npc){
      lastAiContext={npc_name:npc,map_name:map,at:Date.now()};
    }
    f.map_name.value=map;
    f.npc_name.value=npc;
    f.quest_name_en.value=result.quest_name_en||"";
    f.quest_name_ja.value=result.quest_name_ja||"";

    const dialogueEn=String(result.dialogue_text_en||result.english_text||"");
    const dialogueJa=String(result.dialogue_text_ja||result.japanese_text||"");
    const choicesEn=choicesArray(result.choices_en);
    const choicesJa=choicesArray(result.choices_ja);
    f.dialogue_text_en.value=dialogueEn;
    f.dialogue_text_ja.value=dialogueJa;
    f.choices_en.value=choicesEn.join("\n");
    f.choices_ja.value=choicesJa.join("\n");
    f.english_text.value=result.english_text||[dialogueEn].concat(choicesEn).filter(Boolean).join("\n");
    f.japanese_text.value=result.japanese_text||[dialogueJa].concat(choicesJa).filter(Boolean).join("\n");
    f.required_level.value=result.required_level==null?"":result.required_level;
    f.requirements.value=result.requirements||"";
    f.targets.value=result.targets||"";
    f.rewards.value=result.rewards||"";
    f.notes.value=result.notes||"";
    $("translate-run").disabled=!f.english_text.value.trim();

    const en=normText(result.quest_name_en);
    const ja=normText(result.quest_name_ja);
    const match=quests.find(function(q){
      return (en&&normText(q.title_en)===en)||(ja&&normText(q.title_ja)===ja);
    });
    if(match){
      $("quest-link").value=match.id;
      await changeQuest();
    }

    const warnings=Array.isArray(result.warnings)?result.warnings.filter(Boolean):[];
    const confidence=Number.isFinite(Number(result.confidence))?Number(result.confidence):null;
    const meta=result._meta||{};
    let msg="OpenAI解析完了";
    if(confidence!=null) msg+="（信頼度 "+confidence+"%）";
    if(meta.cached) msg+="・同じ画像の保存済み解析結果を使用";
    if(warnings.length) msg+="。確認事項："+warnings.join(" / ");
    else msg+="。内容を確認してから登録してください。";
    setStatus("capture-status",msg);
  }

  async function autoSaveAiResult(result,imageHash){
    const res=await db.rpc("game_knowledge_auto_save_v2",{
      p_map_name:String(result.map_name||""),
      p_npc_name:String(result.npc_name||""),
      p_quest_name_en:String(result.quest_name_en||""),
      p_quest_name_ja:String(result.quest_name_ja||""),
      p_english_text:String(result.english_text||""),
      p_japanese_text:String(result.japanese_text||""),
      p_dialogue_text_en:String(result.dialogue_text_en||result.english_text||""),
      p_dialogue_text_ja:String(result.dialogue_text_ja||result.japanese_text||""),
      p_choices_en:choicesArray(result.choices_en),
      p_choices_ja:choicesArray(result.choices_ja),
      p_required_level:result.required_level==null?null:Number(result.required_level),
      p_requirements:String(result.requirements||""),
      p_targets:String(result.targets||""),
      p_rewards:String(result.rewards||""),
      p_notes:String(result.notes||""),
      p_screen_type:String(result.screen_type||""),
      p_confidence:Number.isFinite(Number(result.confidence))?Number(result.confidence):null,
      p_image_hash:imageHash||"",
      p_source_type:"screen_capture",
      p_contributor_id:contributorId
    });
    if(res.error) throw new Error("自動保存に失敗しました："+res.error.message);
    const info=res.data||{};
    if(info.saved){
      activeRecordId=String(info.id||"");
      activeNpcName=String(result.npc_name||"").trim();
      if(result._client_image_hash) rememberFastScreen(result._client_image_hash,activeRecordId,activeNpcName);
      setStatus("form-status",info.inserted?"AI解析結果を自動保存しました。現在の会話だけ表示します。":"同じ内容は登録済みのため更新のみ行いました。");
      await loadRecords(true);
      return info;
    }
    const reasons={
      screen_type:"NPC会話・クエスト画面ではないため保存しませんでした。",
      low_confidence:"認識精度が低いため自動保存しませんでした。",
      npc_missing:"NPC名を確認できなかったため自動保存しませんでした。",
      content_missing:"保存できる英文・クエスト名がありませんでした。"
    };
    setStatus("form-status",reasons[info.reason]||"今回は自動保存対象外です。");
    return info;
  }

  function validMapRegion(region){
    if(!region) return false;
    return Number(region.width)>20&&Number(region.height)>20;
  }

  async function cropBlobNormalized(blob,region,quality){
    if(!blob||!validMapRegion(region)) return null;
    const bitmap=await createImageBitmap(blob);
    const x=Math.max(0,Math.round(bitmap.width*(Number(region.x)||0)/1000));
    const y=Math.max(0,Math.round(bitmap.height*(Number(region.y)||0)/1000));
    const w=Math.max(1,Math.min(bitmap.width-x,Math.round(bitmap.width*(Number(region.width)||0)/1000)));
    const h=Math.max(1,Math.min(bitmap.height-y,Math.round(bitmap.height*(Number(region.height)||0)/1000)));
    const canvas=document.createElement("canvas");
    canvas.width=w;
    canvas.height=h;
    canvas.getContext("2d").drawImage(bitmap,x,y,w,h,0,0,w,h);
    if(bitmap.close) bitmap.close();
    return await new Promise(function(resolve){canvas.toBlob(resolve,"image/webp",quality||0.86);});
  }

  async function cropMapBlob(region){
    return await cropBlobNormalized(imageBlob,region,0.86);
  }

  async function makeMapCandidateBlob(){
    if(!imageBlob) return null;
    return await cropBlobNormalized(imageBlob,{x:470,y:0,width:530,height:600},0.84);
  }

  async function analyzeMapCandidate(){
    const blob=await makeMapCandidateBlob();
    if(!blob) return null;
    const hash=await blobHash(blob);
    const dataUrl=await blobToDataUrl(blob);
    const response=await fetch(cfg.SUPABASE_URL+"/functions/v1/analyze-game-map",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":cfg.SUPABASE_ANON_KEY,
        "x-xen-client":"capture-v1"
      },
      body:JSON.stringify({image:dataUrl,image_hash:hash})
    });
    let data={};
    try{data=await response.json();}catch(_){}
    if(!response.ok) throw new Error(data.error||("マップ解析に失敗しました（HTTP "+response.status+"）"));
    return {data:data,blob:blob,hash:hash};
  }

  function canonicalMapRegion(region){
    const r=region||{};
    const rx=Number(r.x)||0;
    const ry=Number(r.y)||0;
    const rw=Number(r.width)||0;
    const rh=Number(r.height)||0;
    const looksLikeFullPanel=rw>=340&&rh>=430&&(rx+rw)>=820&&ry<=180;
    if(!looksLikeFullPanel){
      return {x:420,y:0,width:580,height:760};
    }
    const left=Math.max(0,Math.min(rx-25,430));
    const bottom=Math.min(1000,Math.max(ry+rh+25,720));
    return {x:left,y:0,width:1000-left,height:bottom};
  }

  function remapNpcToSavedRegion(npc,sourceRegion,savedRegion){
    const sx=Number(sourceRegion&&sourceRegion.x)||0;
    const sy=Number(sourceRegion&&sourceRegion.y)||0;
    const sw=Number(sourceRegion&&sourceRegion.width)||1000;
    const sh=Number(sourceRegion&&sourceRegion.height)||1000;
    const absX=sx+sw*(Number(npc.x)||0)/1000;
    const absY=sy+sh*(Number(npc.y)||0)/1000;
    return {
      name:String(npc.name||""),
      x:Math.max(0,Math.min(1000,Math.round((absX-savedRegion.x)*1000/savedRegion.width))),
      y:Math.max(0,Math.min(1000,Math.round((absY-savedRegion.y)*1000/savedRegion.height))),
      confidence:Number(npc.confidence||0)
    };
  }

  async function saveDedicatedMapAnalysis(pack){
    if(!pack||!pack.data||!pack.data.map_visible) return false;
    const result=pack.data;
    const mapName=String(result.map_name||"").trim();
    const confidence=Number(result.confidence||0);
    const sourceRegion=validMapRegion(result.panel_region)?result.panel_region:{x:420,y:0,width:580,height:760};
    const savedRegion=canonicalMapRegion(sourceRegion);
    const rawNpcs=Array.isArray(result.npcs)?result.npcs.filter(function(n){
      return n&&String(n.name||"").trim()&&Number(n.confidence||0)>=70;
    }):[];
    const npcs=rawNpcs.map(function(n){return remapNpcToSavedRegion(n,sourceRegion,savedRegion);});
    if(!mapName||confidence<70) return false;

    let mapImageUrl="";
    const existing=gameMaps.find(function(m){return normText(m.map_name)===normText(mapName);});
    if(existing&&existing.map_image_url&&existing.source_image_hash===pack.hash){
      mapImageUrl=existing.map_image_url;
    }else{
      const panel=await cropBlobNormalized(pack.blob,savedRegion,0.9);
      if(panel){
        const safe=mapName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"map";
        const path=safe+"/"+Date.now()+"-"+pack.hash+".webp";
        const up=await db.storage.from("map-images").upload(path,panel,{contentType:"image/webp",upsert:false});
        if(!up.error) mapImageUrl=db.storage.from("map-images").getPublicUrl(path).data.publicUrl||"";
      }
    }

    const res=await db.rpc("map_analysis_save",{
      p_map_name:mapName,
      p_npcs:npcs,
      p_image_hash:pack.hash,
      p_map_image_url:mapImageUrl,
      p_confidence:confidence,
      p_contributor_id:contributorId
    });
    if(res.error) throw new Error("マップ情報の保存に失敗しました："+res.error.message);
    const info=res.data||{};
    setStatus("map-collect-status",mapName+" の拡大マップを保存：NPC "+npcs.length+"件 / 新規観測 "+(info.new_sightings||0)+"件");
    await loadMapData();
    return true;
  }

  function portraitFallbackRegion(result){
    if(validMapRegion(result&&result.npc_portrait_region)) return result.npc_portrait_region;
    const d=result&&result.dialog_window_region;
    if(!validMapRegion(d)) return null;
    return {
      x:Number(d.x)||0,
      y:(Number(d.y)||0)+(Number(d.height)||0)*0.07,
      width:(Number(d.width)||0)*0.24,
      height:(Number(d.height)||0)*0.58
    };
  }

  async function autoSaveNpcPortrait(result){
    if(!result||result.screen_type!=="npc_dialog") return false;
    const npc=String(result.npc_name||"").trim();
    const map=String(result.map_name||"").trim();
    const region=portraitFallbackRegion(result);
    if(!npc||!validMapRegion(region)||!imageBlob) return false;
    if(findNpcProfile(npc,map)) return false;

    const portrait=await cropBlobNormalized(imageBlob,region,0.92);
    if(!portrait) return false;
    const safe=npc.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"npc";
    const path=safe+"/"+Date.now()+"-"+crypto.randomUUID()+".webp";
    const up=await db.storage.from("npc-images").upload(path,portrait,{contentType:"image/webp",upsert:false});
    if(up.error) return false;
    const url=db.storage.from("npc-images").getPublicUrl(path).data.publicUrl||"";
    const saved=await db.rpc("npc_profile_save_image",{
      p_npc_name:npc,
      p_map_name:map,
      p_image_url:url,
      p_contributor_id:contributorId
    });
    if(saved.error) return false;
    await loadNpcProfiles();
    setStatus("npc-image-status",npc+" のNPC画像を自動登録しました。");
    return true;
  }

  async function uploadMapImage(mapName,region,imageHash){
    const existing=gameMaps.find(function(m){return normText(m.map_name)===normText(mapName);});
    if(existing&&existing.map_image_url) return existing.map_image_url;
    const blob=await cropMapBlob(region);
    if(!blob) return "";
    const safe=String(mapName||"map").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"map";
    const path=safe+"/"+Date.now()+"-"+(imageHash||crypto.randomUUID())+".webp";
    const up=await db.storage.from("map-images").upload(path,blob,{contentType:"image/webp",upsert:false});
    if(up.error) throw new Error("マップ画像保存に失敗しました："+up.error.message);
    return db.storage.from("map-images").getPublicUrl(path).data.publicUrl||"";
  }

  async function saveMapAnalysis(result,imageHash){
    if(result.screen_type!=="expanded_map") return null;
    const mapName=String(result.map_name||"").trim();
    const confidence=Number(result.map_confidence||result.confidence||0);
    const npcs=Array.isArray(result.map_npcs)?result.map_npcs.filter(function(n){
      return n&&String(n.name||"").trim()&&Number(n.confidence||0)>=70;
    }):[];

    if(!mapName||confidence<70){
      setStatus("map-collect-status","マップ名または認識精度が不足したため保存しませんでした。");
      return null;
    }

    let mapImageUrl="";
    try{
      mapImageUrl=await uploadMapImage(mapName,result.map_region,imageHash);
    }catch(err){
      setStatus("map-collect-status",err.message||String(err));
    }

    const res=await db.rpc("map_analysis_save",{
      p_map_name:mapName,
      p_npcs:npcs,
      p_image_hash:imageHash||"",
      p_map_image_url:mapImageUrl,
      p_confidence:confidence,
      p_contributor_id:contributorId
    });
    if(res.error) throw new Error("マップ情報の保存に失敗しました："+res.error.message);

    const info=res.data||{};
    setStatus(
      "map-collect-status",
      mapName+" を保存：NPC "+npcs.length+"件 / 新規観測 "+(info.new_sightings||0)+"件"
    );
    await loadMapData();
    return info;
  }

  async function runOpenAiAnalysis(trigger){
    if(aiAnalyzing) return;
    aiAnalyzing=true;
    const source=trigger||"manual";
    const button=$("ai-run");
    button.disabled=true;
    try{
      if(stream){
        if(source!=="auto") setStatus("capture-status","現在のゲーム画面をキャプチャしています…");
        await captureFrame(true);
      }
      if(!imageBlob) throw new Error("先に「画面共有を開始」するか、スクリーンショットを選択してください。");

      if(source==="auto") setAutoStatus("analyzing","OpenAI解析中");
      setStatus("capture-status",source==="auto"?"画面変化を検出しました。OpenAIで自動解析中…":"OpenAIでゲーム画面を解析中…");
      const image=await blobToDataUrl(imageBlob);
      const imageHash=await blobHash(imageBlob);

      const instant=fastScreenRecord(imageHash);
      if(instant){
        activeRecordId=instant.id;
        activeNpcName=instant.npc_name||"";
        renderRecords();
        setStatus("capture-status","保存済みの翻訳を即時表示しました。AI解析は使用していません。");
        setStatus("form-status","保存済みデータを表示中（API使用なし）");
        return;
      }

      const response=await fetch(cfg.SUPABASE_URL+"/functions/v1/analyze-game-screen",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "apikey":cfg.SUPABASE_ANON_KEY,
          "x-xen-client":"capture-v1"
        },
        body:JSON.stringify({image:image,image_hash:imageHash})
      });
      let data={};
      try{data=await response.json();}catch(_){}
      if(!response.ok){
        if(response.status===429&&data.reset_at){
          const reset=new Date(data.reset_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
          throw new Error((data.error||"AI解析上限に達しました。")+" "+(data.used!=null&&data.limit!=null?data.used+"/"+data.limit+"回使用。 ":"")+"次回リセット："+reset);
        }
        throw new Error(data.error||("AI解析に失敗しました（HTTP "+response.status+"）"));
      }
      data._client_image_hash=imageHash;
      await applyAiResult(data);

      if(data.screen_type==="npc_dialog"){
        await autoSaveAiResult(data,imageHash);
        await autoSaveNpcPortrait(data);
      }else if(data.screen_type==="quest_window"||data.screen_type==="reward_window"){
        await autoSaveAiResult(data,imageHash);
      }

      let dedicatedMapSaved=false;
      if(data.screen_type==="expanded_map"||data.screen_type==="other"){
        try{
          const mapPack=await analyzeMapCandidate();
          dedicatedMapSaved=await saveDedicatedMapAnalysis(mapPack);
        }catch(mapErr){
          setStatus("map-collect-status",mapErr&&mapErr.message?mapErr.message:String(mapErr));
        }
      }
      if(data.screen_type==="expanded_map"&&!dedicatedMapSaved){
        setStatus("map-collect-status","拡大マップは検出しましたが、専用マップ解析で確定できなかったため保存しませんでした。");
      }
    }catch(err){
      setStatus("capture-status",err&&err.message?err.message:String(err));
    }finally{
      aiAnalyzing=false;
      button.disabled=false;
      if(source!=="auto"&&stream){
        lastAutoAnalysisAt=Date.now();
        autoBaseline=monitorSample()||autoBaseline;
      }
      if(autoEnabled&&stream&&source!=="auto") setAutoStatus("cooldown","手動解析後・待機");
    }
  }

  async function runOcr(){
    if(!imageBlob) return;
    if(!window.Tesseract){setStatus("capture-status","OCRライブラリを読み込めませんでした。通信環境を確認してください。");return;}
    $("ocr-run").disabled=true;
    try{
      const result=await window.Tesseract.recognize(imageBlob,"eng",{logger:function(m){
        if(m.status==="recognizing text") setStatus("capture-status","OCR読み取り中… "+Math.round((m.progress||0)*100)+"%");
        else setStatus("capture-status","OCR準備中…");
      }});
      const text=(result&&result.data&&result.data.text?result.data.text:"").trim();
      if(text){
        $("english-text").value=text;
        $("dialogue-text-en").value=text;
        suggestNpc(text);
        $("translate-run").disabled=false;
        setStatus("capture-status","OCR完了。誤認識がないか英文を確認してください。");
      }else setStatus("capture-status","文字を読み取れませんでした。会話ウィンドウを大きく表示して再キャプチャしてください。");
    }catch(err){
      setStatus("capture-status","OCRに失敗しました："+err.message);
    }finally{$("ocr-run").disabled=false;}
  }

  function suggestNpc(text){
    const input=$("capture-form").elements.npc_name;
    if(input.value.trim()) return;
    const ignore=/^(hello|quest info|end conversation|close quest list|reward|rewards|accept|cancel)$/i;
    const lines=text.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
    const candidate=lines.find(function(line){
      return line.length>=3&&line.length<=42&&/^[A-Za-z][A-Za-z .'-]+$/.test(line)&&!ignore.test(line)&&!/[.!?]$/.test(line);
    });
    if(candidate) input.value=candidate;
  }

  async function translateEnglish(){
    const text=$("dialogue-text-en").value.trim()||$("english-text").value.trim();
    if(!text){setStatus("capture-status","先に英文を入力またはOCRで読み取ってください。");return;}
    $("translate-run").disabled=true;
    try{
      let translated="";
      if(window.Translator&&typeof window.Translator.create==="function"){
        const translator=await window.Translator.create({sourceLanguage:"en",targetLanguage:"ja"});
        translated=await translator.translate(text);
        if(translator.destroy) translator.destroy();
      }else if(window.ai&&window.ai.translator&&typeof window.ai.translator.create==="function"){
        const translator=await window.ai.translator.create({sourceLanguage:"en",targetLanguage:"ja"});
        translated=await translator.translate(text);
      }else{
        throw new Error("このブラウザは内蔵翻訳APIに対応していません。日本語訳欄へ手入力してください。");
      }
      $("dialogue-text-ja").value=translated||"";
      $("japanese-text").value=translated||"";
      setStatus("capture-status","会話内容を翻訳しました。ゲーム用語・固有名詞を確認してください。");
    }catch(err){
      setStatus("capture-status",err.message);
    }finally{$("translate-run").disabled=false;}
  }

  async function loadQuests(){
    const res=await db.from("quests").select("id,title_en,title_ja,required_level,start_npc,start_location,rewards").order("title_en");
    if(res.error) return;
    quests=res.data||[];
    const sel=$("quest-link");
    sel.innerHTML='<option value="">関連付けなし</option>'+quests.map(function(q){
      return '<option value="'+esc(q.id)+'">'+esc(q.title_ja||q.title_en)+' / '+esc(q.title_en)+'</option>';
    }).join("");
  }

  async function changeQuest(){
    const id=$("quest-link").value;
    const step=$("step-link");
    step.innerHTML='<option value="">STEP指定なし</option>';
    step.disabled=!id;
    if(!id) return;
    const q=quests.find(function(x){return x.id===id;});
    const f=$("capture-form").elements;
    if(q){
      if(!f.quest_name_en.value) f.quest_name_en.value=q.title_en||"";
      if(!f.quest_name_ja.value) f.quest_name_ja.value=q.title_ja||"";
      if(!f.npc_name.value) f.npc_name.value=q.start_npc||"";
      if(!f.map_name.value) f.map_name.value=q.start_location||"";
      if(!f.required_level.value&&q.required_level!=null) f.required_level.value=q.required_level;
      if(!f.rewards.value) f.rewards.value=q.rewards||"";
    }
    const res=await db.from("quest_steps").select("id,step_number,title,npc_name,location").eq("quest_id",id).order("step_number");
    if(res.error) return;
    step.innerHTML+=(res.data||[]).map(function(s){
      return '<option value="'+esc(s.id)+'">STEP '+esc(s.step_number)+' '+esc(s.title||s.npc_name||"")+'</option>';
    }).join("");
  }

  async function uploadImage(){
    if(!imageBlob||!$("save-image").checked) return "";
    const ext=imageBlob.type==="image/png"?"png":imageBlob.type==="image/jpeg"?"jpg":"webp";
    const path=contributorId+"/"+Date.now()+"-"+crypto.randomUUID()+"."+ext;
    const res=await db.storage.from("game-captures").upload(path,imageBlob,{contentType:imageBlob.type||"image/webp",upsert:false});
    if(res.error) throw new Error("画像保存に失敗しました："+res.error.message);
    return db.storage.from("game-captures").getPublicUrl(path).data.publicUrl||"";
  }

  function handleNpcImageFile(file){
    if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)){
      setStatus("npc-image-status","PNG / JPEG / WebP画像を選択してください。");
      return;
    }
    npcImageBlob=file;
    if(npcImagePreviewUrl) URL.revokeObjectURL(npcImagePreviewUrl);
    npcImagePreviewUrl=URL.createObjectURL(file);
    $("npc-image-preview").src=npcImagePreviewUrl;
    $("npc-image-preview").hidden=false;
    $("npc-image-empty").hidden=true;
    $("npc-image-save").disabled=false;
    setStatus("npc-image-status","画像を選択しました。NPC名を確認して保存してください。");
  }

  async function saveNpcImage(){
    const f=$("capture-form").elements;
    const npc=String(f.npc_name.value||"").trim();
    const map=String(f.map_name.value||"").trim();
    if(!npc){setStatus("npc-image-status","先にNPC名を入力してください。");return;}
    if(!npcImageBlob){setStatus("npc-image-status","NPC画像を選択してください。");return;}
    const button=$("npc-image-save");
    button.disabled=true;
    setStatus("npc-image-status","NPC画像を保存中…");
    try{
      const ext=npcImageBlob.type==="image/png"?"png":npcImageBlob.type==="image/jpeg"?"jpg":"webp";
      const safe=npc.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"npc";
      const path=safe+"/"+Date.now()+"-"+crypto.randomUUID()+"."+ext;
      const up=await db.storage.from("npc-images").upload(path,npcImageBlob,{contentType:npcImageBlob.type||"image/webp",upsert:false});
      if(up.error) throw new Error(up.error.message);
      const url=db.storage.from("npc-images").getPublicUrl(path).data.publicUrl||"";
      const saved=await db.rpc("npc_profile_save_image",{
        p_npc_name:npc,
        p_map_name:map,
        p_image_url:url,
        p_contributor_id:contributorId
      });
      if(saved.error) throw new Error(saved.error.message);
      setStatus("npc-image-status","NPC画像を保存しました。");
      await loadNpcProfiles();
      renderRecords();
    }catch(err){
      setStatus("npc-image-status","保存できませんでした："+(err&&err.message?err.message:String(err)));
    }finally{
      button.disabled=false;
    }
  }

  async function saveRecord(e){
    e.preventDefault();
    const form=e.currentTarget;
    const b=form.querySelector('[type="submit"]');
    b.disabled=true;
    setStatus("form-status","保存中…");
    try{
      const fd=new FormData(form);
      const imageUrl=await uploadImage();
      const level=String(fd.get("required_level")||"").trim();
      const dialogEn=String(fd.get("dialogue_text_en")||"");
      const dialogJa=String(fd.get("dialogue_text_ja")||"");
      const choiceEn=linesToArray(fd.get("choices_en")||"");
      const choiceJa=linesToArray(fd.get("choices_ja")||"");
      const fullEn=[dialogEn].concat(choiceEn).filter(Boolean).join("\n");
      const fullJa=[dialogJa].concat(choiceJa).filter(Boolean).join("\n");
      const args={
        p_map_name:String(fd.get("map_name")||""),
        p_npc_name:String(fd.get("npc_name")||""),
        p_quest_name_en:String(fd.get("quest_name_en")||""),
        p_quest_name_ja:String(fd.get("quest_name_ja")||""),
        p_english_text:fullEn,
        p_japanese_text:fullJa,
        p_dialogue_text_en:dialogEn,
        p_dialogue_text_ja:dialogJa,
        p_choices_en:choiceEn,
        p_choices_ja:choiceJa,
        p_required_level:level===""?null:Number(level),
        p_requirements:String(fd.get("requirements")||""),
        p_targets:String(fd.get("targets")||""),
        p_rewards:String(fd.get("rewards")||""),
        p_notes:String(fd.get("notes")||""),
        p_ocr_text:fullEn,
        p_source_image_url:imageUrl,
        p_source_type:imageBlob?imageSourceType:"manual",
        p_contributor_id:contributorId,
        p_quest_id:String(fd.get("quest_id")||"")||null,
        p_quest_step_id:String(fd.get("quest_step_id")||"")||null
      };
      const res=await db.rpc("game_knowledge_save_v2",args);
      if(res.error) throw new Error(res.error.message);
      setStatus("form-status","登録しました。NPC検索に反映しました。");
      await loadRecords();
    }catch(err){
      setStatus("form-status","保存できませんでした："+err.message);
    }finally{b.disabled=false;}
  }

  function clearForm(){
    $("capture-form").reset();
    $("step-link").innerHTML='<option value="">STEP指定なし</option>';
    $("step-link").disabled=true;
    npcImageBlob=null;
    if(npcImagePreviewUrl){URL.revokeObjectURL(npcImagePreviewUrl);npcImagePreviewUrl="";}
    $("npc-image-preview").hidden=true;
    $("npc-image-preview").removeAttribute("src");
    $("npc-image-empty").hidden=false;
    $("npc-image-save").disabled=true;
    setStatus("npc-image-status","");
    setStatus("form-status","");
  }

  async function loadMapData(){
    const mapsRes=await db.from("game_maps").select("*").order("map_name",{ascending:true}).limit(1000);
    const npcsRes=await db.from("map_npcs").select("*,game_maps(map_name,map_image_url)").order("npc_name",{ascending:true}).limit(5000);
    if(!mapsRes.error) gameMaps=mapsRes.data||[];
    if(!npcsRes.error) mapNpcs=npcsRes.data||[];
    renderMapDatabase();
  }

  function renderMapDatabase(){
    const select=$("map-db-select");
    const canvas=$("map-db-canvas");
    const list=$("map-db-list");
    if(!select||!canvas||!list) return;

    const current=select.value;
    select.innerHTML='<option value="">マップを選択</option>'+gameMaps.map(function(m){
      return '<option value="'+esc(m.id)+'">'+esc(m.map_name)+'</option>';
    }).join("");
    if(gameMaps.some(function(m){return m.id===current;})) select.value=current;
    if(!select.value&&gameMaps.length) select.value=gameMaps[0].id;

    const map=gameMaps.find(function(m){return m.id===select.value;});
    if(!map){
      canvas.innerHTML='<div class="map-db-empty">まだマップ情報がありません。</div>';
      list.innerHTML="";
      $("map-db-count").textContent="0 NPC";
      return;
    }

    const rows=mapNpcs.filter(function(n){return n.map_id===map.id;});
    $("map-db-count").textContent=rows.length+" NPC";
    canvas.style.backgroundImage=map.map_image_url?'url("'+String(map.map_image_url).replace(/"/g,"%22")+'")':"none";
    canvas.innerHTML=rows.map(function(n){
      const x=Math.max(0,Math.min(100,Number(n.x_norm)/10));
      const y=Math.max(0,Math.min(100,Number(n.y_norm)/10));
      return '<button type="button" class="map-npc-marker" style="left:'+x+'%;top:'+y+'%" data-map-npc="'+esc(n.npc_name)+'" title="'+esc(n.npc_name)+'">'+
        '<span></span><b>'+esc(n.npc_name)+'</b>'+
      '</button>';
    }).join("");

    list.innerHTML=rows.map(function(n){
      return '<button type="button" data-map-npc="'+esc(n.npc_name)+'">'+
        '<strong>'+esc(n.npc_name)+'</strong>'+
        '<span>X '+Math.round(Number(n.x_norm))+' / Y '+Math.round(Number(n.y_norm))+'</span>'+
        '<small>'+esc(n.sighting_count)+'回観測・'+Math.round(Number(n.confidence))+'%</small>'+
      '</button>';
    }).join("");
  }

  async function loadNpcProfiles(){
    const res=await db.from("npc_profiles").select("*").order("updated_at",{ascending:false}).limit(1000);
    if(!res.error){
      npcProfiles=res.data||[];
      if(records.length) renderRecords();
    }
  }

  async function loadDialogueTransitions(){
    const res=await db.from("game_dialogue_transitions").select("*").order("created_at",{ascending:true}).limit(5000);
    if(!res.error){
      dialogueTransitions=res.data||[];
      if(records.length) renderRecords();
    }
  }

  function transitionFor(recordId,choiceIndex){
    return dialogueTransitions.find(function(t){
      return t.from_record_id===recordId&&Number(t.choice_index)===Number(choiceIndex);
    })||null;
  }

  function renderDialogueCard(r,cardKey){
    const quest=[r.quest_name_ja,r.quest_name_en].filter(Boolean).join(" / ");
    const profile=findNpcProfile(r.npc_name,r.map_name);
    const dialogueEn=r.dialogue_text_en||r.english_text||"";
    const dialogueJa=r.dialogue_text_ja||r.japanese_text||"";
    const choicesEn=choicesArray(r.choices_en);
    const choicesJa=choicesArray(r.choices_ja);
    const count=Math.max(choicesEn.length,choicesJa.length);
    const choiceRows=[];
    for(let i=0;i<count;i++){
      const transition=transitionFor(r.id,i);
      const inner=
        '<span class="game-choice-mark">✦</span><div>'+
        (choicesEn[i]?'<div class="choice-en">'+esc(choicesEn[i])+'</div>':"")+
        (choicesJa[i]?'<div class="choice-ja">'+esc(choicesJa[i])+'</div>':"")+
        '</div>'+
        (transition?'<span class="choice-next">→</span>':"");
      choiceRows.push(
        transition
          ? '<button type="button" class="game-choice-row game-choice-link" data-dialogue-target="'+esc(transition.to_record_id)+'">'+inner+'</button>'
          : '<div class="game-choice-row">'+inner+'</div>'
      );
    }

    const extra=[
      r.requirements?'<div><strong>必要アイテム</strong><br>'+esc(r.requirements)+'</div>':"",
      r.targets?'<div><strong>討伐対象</strong><br>'+esc(r.targets)+'</div>':"",
      r.rewards?'<div><strong>報酬</strong><br>'+esc(r.rewards)+'</div>':""
    ].join("");

    const stack=dialogueNavStacks.get(cardKey)||[];
    const page=dialoguePageInfo(r);
    return '<article class="knowledge-card game-dialog-card" data-card-key="'+esc(cardKey)+'" data-record-id="'+esc(r.id)+'">'+
      '<div class="game-dialog-title"><strong>'+esc(r.npc_name)+'</strong>'+
        '<span>'+esc(r.map_name||"MAP未登録")+'</span>'+
      '</div>'+
      '<div class="knowledge-meta">'+
        (stack.length?'<button type="button" class="dialogue-back" data-dialogue-back="1">← 1つ前の会話へ</button>':"")+
        '<span>会話 '+page.index+' / '+page.total+'</span>'+
        (r.required_level!=null?'<span>Lv '+esc(r.required_level)+'</span>':"")+
        (quest?'<span>'+esc(quest)+'</span>':"")+
        (r.confidence!=null?'<span>AI '+esc(r.confidence)+'%</span>':"")+
      '</div>'+
      '<div class="game-dialog-layout">'+
        '<aside class="game-npc-portrait">'+
          (profile&&profile.image_url?'<img src="'+esc(profile.image_url)+'" alt="'+esc(r.npc_name)+'">':'<div class="portrait-placeholder">NPC<br>IMAGE</div>')+
        '</aside>'+
        '<div class="game-dialog-main">'+
          '<section class="game-dialog-upper">'+
            '<div class="game-panel-label">会話内容 / DIALOGUE</div>'+
            '<div class="dialog-en">'+esc(dialogueEn||"会話内容未登録")+'</div>'+
            (dialogueJa?'<div class="dialog-ja">'+esc(dialogueJa)+'</div>':"")+
          '</section>'+
          '<section class="game-dialog-lower">'+
            '<div class="game-panel-label">選択項目 / CHOICES</div>'+
            (choiceRows.length?choiceRows.join(""):'<div class="no-choices">選択項目なし / 未登録</div>')+
          '</section>'+
        '</div>'+
      '</div>'+
      (extra?'<div class="knowledge-extra">'+extra+'</div>':"")+
      (r.notes?'<p><strong>メモ：</strong>'+esc(r.notes)+'</p>':"")+
      (r.source_image_url?'<a class="knowledge-image" href="'+esc(r.source_image_url)+'" target="_blank" rel="noopener noreferrer">登録時のゲーム画面を見る ↗</a>':"")+
      (r.quest_id?'<p><a href="quests.html#'+esc(r.quest_id)+'">既存クエストページを開く →</a></p>':"")+
    '</article>';
  }

  async function loadRecords(silent){
    if(!silent) setStatus("capture-status","登録済みデータを読み込み中…");
    const res=await db.from("game_knowledge").select("*").order("created_at",{ascending:false}).limit(1000);
    if(res.error){
      $("knowledge-results").innerHTML='<p class="notice">データを読み込めませんでした：'+esc(res.error.message)+'</p>';
      return;
    }
    records=res.data||[];
    buildFilters();
    renderRecords();
    if(!silent) setStatus("capture-status","");
  }

  function buildFilters(){
    const maps=Array.from(new Set(records.map(function(r){return r.map_name||"";}).filter(Boolean))).sort(function(a,b){return a.localeCompare(b,"ja");});
    const current=$("map-filter").value;
    $("map-filter").innerHTML='<option value="">すべてのマップ</option>'+maps.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>';}).join("");
    $("map-filter").value=maps.includes(current)?current:"";

    const counts={};
    records.forEach(function(r){counts[r.npc_name]=(counts[r.npc_name]||0)+1;});
    const npcs=Object.keys(counts).sort(function(a,b){return a.localeCompare(b,"ja");});
    $("npc-index").innerHTML=npcs.slice(0,80).map(function(n){
      return '<button type="button" data-npc="'+esc(n)+'">'+esc(n)+' <small>('+counts[n]+')</small></button>';
    }).join("");
    $("npc-index").querySelectorAll("[data-npc]").forEach(function(btn){
      btn.addEventListener("click",function(){
        activeNpcName=btn.dataset.npc||"";
        const first=dialogueRootForNpc(activeNpcName);
        activeRecordId=first?first.id:"";
        dialogueNavStacks.clear();
        $("knowledge-search").value=activeNpcName;
        renderRecords();
      });
    });
  }

  function renderRecords(){
    const word=$("knowledge-search").value.trim().toLowerCase();
    const map=$("map-filter").value;
    const rows=records.filter(function(r){
      const choices=[].concat(choicesArray(r.choices_en),choicesArray(r.choices_ja)).join(" ");
      const hay=[r.npc_name,r.map_name,r.quest_name_en,r.quest_name_ja,r.english_text,r.japanese_text,r.dialogue_text_en,r.dialogue_text_ja,choices,r.requirements,r.targets,r.rewards,r.notes].join(" ").toLowerCase();
      return (!word||hay.includes(word))&&(!map||r.map_name===map);
    });

    if(!rows.length){
      $("record-count").textContent="0件";
      $("knowledge-results").innerHTML='<div class="notice">該当する登録情報はありません。</div>';
      return;
    }

    let current=null;
    if(activeRecordId){
      current=rows.find(function(r){return r.id===activeRecordId;})||null;
    }
    if(!current&&activeNpcName){
      const root=dialogueRootForNpc(activeNpcName);
      current=root&&rows.some(function(r){return r.id===root.id;})?root:null;
    }
    if(!current&&word){
      const exactNpc=rows.find(function(r){return String(r.npc_name||"").toLowerCase()===word;});
      if(exactNpc){
        const root=dialogueRootForNpc(exactNpc.npc_name);
        current=root&&rows.some(function(r){return r.id===root.id;})?root:exactNpc;
      }else current=rows[0];
    }
    if(!current) current=rows[0];

    activeRecordId=current.id;
    activeNpcName=current.npc_name||"";
    const sameNpcCount=records.filter(function(r){
      return r.npc_name===current.npc_name&&(!map||r.map_name===map);
    }).length;

    $("record-count").textContent="現在の会話 1件 / 保存 "+sameNpcCount+"件";
    if(!dialogueNavStacks.has(current.id)) dialogueNavStacks.set(current.id,[]);
    $("knowledge-results").innerHTML=renderDialogueCard(current,current.id);
  }

  function openDialogueTarget(button){
    const card=button.closest(".game-dialog-card");
    if(!card) return;
    const targetId=button.dataset.dialogueTarget;
    const target=records.find(function(r){return r.id===targetId;});
    if(!target) return;

    const cardKey=card.dataset.cardKey||card.dataset.recordId;
    const currentId=card.dataset.recordId;
    const stack=dialogueNavStacks.get(cardKey)||[];
    stack.push(currentId);
    dialogueNavStacks.set(cardKey,stack);
    activeRecordId=target.id;
    activeNpcName=target.npc_name||activeNpcName;
    card.outerHTML=renderDialogueCard(target,cardKey);
  }

  function goDialogueBack(button){
    const card=button.closest(".game-dialog-card");
    if(!card) return;
    const cardKey=card.dataset.cardKey||card.dataset.recordId;
    const stack=dialogueNavStacks.get(cardKey)||[];
    const previousId=stack.pop();
    dialogueNavStacks.set(cardKey,stack);
    const previous=records.find(function(r){return r.id===previousId;});
    if(previous){
      activeRecordId=previous.id;
      activeNpcName=previous.npc_name||activeNpcName;
      card.outerHTML=renderDialogueCard(previous,cardKey);
    }
  }

  $("map-db-select").addEventListener("change",renderMapDatabase);
  $("map-database").addEventListener("click",function(e){
    const target=e.target.closest("[data-map-npc]");
    if(!target) return;
    const npc=target.dataset.mapNpc;
    activeNpcName=npc;
    const first=dialogueRootForNpc(npc);
    activeRecordId=first?first.id:"";
    dialogueNavStacks.clear();
    $("knowledge-search").value=npc;
    renderRecords();
    $("npc-database").scrollIntoView({behavior:"smooth",block:"start"});
  });

  $("knowledge-results").addEventListener("click",function(e){
    const next=e.target.closest("[data-dialogue-target]");
    if(next){openDialogueTarget(next);return;}
    const back=e.target.closest("[data-dialogue-back]");
    if(back){goDialogueBack(back);}
  });

  $("ai-run").addEventListener("click",function(){runOpenAiAnalysis("manual");});
  $("auto-mode").addEventListener("change",function(){
    if(this.checked) startAutoMonitor();
    else{
      stopAutoMonitor(false);
      setAutoStatus("off","OFF");
      setStatus("capture-status","自動解析モードを停止しました。");
    }
  });

  document.addEventListener("keydown",function(e){
    if(e.key==="Alt"&&!e.repeat&&!e.ctrlKey&&!e.shiftKey&&!e.metaKey){
      altDown=true;
      altWasChord=false;
      altPressedAt=Date.now();
      e.preventDefault();
      return;
    }
    if(altDown) altWasChord=true;
  },true);

  document.addEventListener("keyup",function(e){
    if(e.key!=="Alt") return;
    const single=altDown&&!altWasChord&&(Date.now()-altPressedAt<=1200);
    altDown=false;
    altWasChord=false;
    if(single){
      e.preventDefault();
      runOpenAiAnalysis("alt");
    }
  },true);

  window.addEventListener("blur",function(){
    altDown=false;
    altWasChord=false;
  });

  $("npc-image-file").addEventListener("change",function(e){handleNpcImageFile(e.target.files&&e.target.files[0]);});
  $("npc-image-save").addEventListener("click",saveNpcImage);

    $("screen-start").addEventListener("click",startScreen);
  $("screen-stop").addEventListener("click",stopScreen);
  $("screen-shot").addEventListener("click",captureFrame);
  $("image-file").addEventListener("change",function(e){handleFile(e.target.files&&e.target.files[0]);});
  $("ocr-run").addEventListener("click",runOcr);
  $("translate-run").addEventListener("click",translateEnglish);
  $("dialogue-text-en").addEventListener("input",function(){
    $("english-text").value=this.value;
    $("translate-run").disabled=!this.value.trim();
  });
  $("capture-form").addEventListener("submit",saveRecord);
  $("form-clear").addEventListener("click",clearForm);
  $("quest-link").addEventListener("change",changeQuest);
  $("knowledge-search").addEventListener("input",function(){
    activeRecordId="";
    activeNpcName=this.value.trim();
    dialogueNavStacks.clear();
    renderRecords();
  });
  $("map-filter").addEventListener("change",function(){
    activeRecordId="";
    renderRecords();
  });
  $("knowledge-reload").addEventListener("click",loadRecords);
  document.addEventListener("paste",function(e){
    const items=Array.from(e.clipboardData&&e.clipboardData.items||[]);
    const item=items.find(function(x){return x.type&&x.type.startsWith("image/");});
    if(item){e.preventDefault();handleFile(item.getAsFile());}
  });
  window.addEventListener("beforeunload",stopScreen);

  Promise.all([loadQuests(),loadNpcProfiles(),loadDialogueTransitions(),loadMapData(),loadRecords()]).catch(function(err){setStatus("capture-status",err.message);});
})();
