"use strict";
(function(){
  const cfg=window.XEN_GLOSSARY_CONFIG;
  const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=function(id){return document.getElementById(id);};
  const esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};

  let stream=null;
  let captureBlackCheckTimer=null;
  let captureSourceVideo=null;
  let imageBlob=null;
  let imageSourceType="manual";
  let previewUrl="";
  let records=[];
  let activeRecordId="";
  let activeNpcName="";
  const FAST_SCREEN_CACHE_KEY="xen-fast-screen-cache-v1";
  const KNOWN_NPC_SIGNATURES_KEY="xen-known-npc-signatures-v1";
  const NPC_INDEX_EXPANDED_KEY="xen-npc-index-expanded-v1";
  let fastNpcTimer=null;
  let lastFastNpcName="";
  let lastFastNpcAt=0;
  let fastDialogueOcrBusy=false;
  let lastFastDialogueOcrAt=0;
  let lastFastFallbackAt=0;
  let quests=[];
  let npcProfiles=[];
  let dialogueTransitions=[];
  let gameMaps=[];
  let mapNpcs=[];
  const dialogueNavStacks=new Map();
  const dialogueHistory=[];
  let lastObservedRecordId="";
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
  const AUTO_POLL_MS=1200;
  const AUTO_COOLDOWN_MS=10000;
  const AUTO_CHANGE_RATIO=0.018;
  const AUTO_STABLE_RATIO=0.012;
  const AUTO_MAX_PENDING_MS=12000;

  // Local map navigation: no OpenAI API is used for current-location detection.
  const LOCAL_MAP_STATE_KEY="xen-local-current-map-v1";
  const LOCAL_MAP_SIGNATURES_KEY="xen-local-map-signatures-v1";
  const ROUTE_DESTINATION_KEY="xen-route-destination-v1";
  let localMapTimer=null;
  let localMapActive=false;
  let localMapSignatureLoading=false;
  let localMapSignatures=[];
  let lastLocalMapImageAt=0;
  let lastCenterSample=null;
  let lastCenterBurstAt=0;
  let centerTransitionPendingAt=0;
  let centerTransitionStable=0;
  let centerOcrBusy=false;
  let expandedMapOcrBusy=false;
  let lastExpandedMapOcrAt=0;
  let lastLocalMapBest=null;
  let localMapMatchCandidate={name:"",hits:0,at:0};
  let localMapOcrCandidate={name:"",hits:0,at:0};
  let routeCurrentMap="";
  let routeCurrentSource="";
  let routeCurrentConfidence=0;
  let currentRoutePlan=null;
  const LOCAL_MAP_IMAGE_INTERVAL_MS=1300;
  const CENTER_MAP_BURST_COOLDOWN_MS=5000;
  const contributorId=(function(){
    const key="xen-game-knowledge-contributor";
    let value=localStorage.getItem(key);
    if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}
    return value;
  })();

  function setStatus(id,msg){$(id).textContent=msg||"";}
  function syncMiniCaptureStatus(){
    const sharing=!!stream;
    const shareEl=$("capture-mini-share");
    const autoEl=$("capture-mini-auto");
    const nowBtn=$("capture-mini-now");
    if(shareEl){
      shareEl.dataset.state=sharing?"on":"off";
      shareEl.textContent=sharing?"画面共有：ON":"画面共有：OFF";
    }
    if(autoEl){
      autoEl.dataset.state=autoEnabled?"on":"off";
      autoEl.textContent=autoEnabled?"自動解析：ON":"自動解析：OFF";
    }
    if(nowBtn) nowBtn.disabled=!sharing;
  }
  function setAutoStatus(state,msg){
    const el=$("auto-status");
    if(el){
      el.dataset.state=state;
      el.textContent=msg;
    }
    syncMiniCaptureStatus();
  }

  function ensureCaptureSourceVideo(){
    if(captureSourceVideo) return captureSourceVideo;
    const v=document.createElement("video");
    v.id="capture-source-video";
    v.autoplay=true;
    v.muted=true;
    v.playsInline=true;
    v.setAttribute("aria-hidden","true");
    v.style.position="fixed";
    v.style.right="0";
    v.style.bottom="0";
    v.style.width="2px";
    v.style.height="2px";
    v.style.opacity="0.001";
    v.style.pointerEvents="none";
    v.style.zIndex="-1";
    document.body.appendChild(v);
    captureSourceVideo=v;
    return v;
  }

  function getCaptureVideo(){
    const hidden=ensureCaptureSourceVideo();
    if(hidden&&hidden.videoWidth&&hidden.readyState>=2) return hidden;
    return $("screen-video");
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

  function captureSurfaceLabel(){
    try{
      const track=stream&&stream.getVideoTracks?stream.getVideoTracks()[0]:null;
      const surface=track&&track.getSettings?track.getSettings().displaySurface:"";
      if(surface==="monitor") return "画面全体";
      if(surface==="window") return "ウィンドウ";
      if(surface==="browser") return "ブラウザタブ";
      return surface||"共有画面";
    }catch(_){return "共有画面";}
  }

  function frameLooksBlack(video){
    if(!video||!video.videoWidth||video.readyState<2) return null;
    const w=96,h=54;
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(video,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h).data;
    let sum=0,sum2=0,bright=0,count=0;
    for(let i=0;i<d.length;i+=4){
      const g=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;
      sum+=g;sum2+=g*g;count++;
      if(g>=24) bright++;
    }
    const mean=sum/Math.max(1,count);
    const variance=Math.max(0,sum2/Math.max(1,count)-mean*mean);
    return mean<7&&variance<18&&bright/Math.max(1,count)<0.003;
  }

  function xenGameFrameEvidence(video){
    if(!video||!video.videoWidth||video.readyState<2) return {likely:false,score:0};
    const canvas=document.createElement("canvas");
    canvas.width=180;canvas.height=90;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const sw=Math.max(1,video.videoWidth*0.22);
    const sh=Math.max(1,video.videoHeight*0.16);
    ctx.drawImage(video,0,0,sw,sh,0,0,canvas.width,canvas.height);
    const d=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let red=0,green=0,yellow=0,dark=0,count=0;
    for(let i=0;i<d.length;i+=4){
      const r=d[i],g=d[i+1],b=d[i+2];
      const lum=r*0.299+g*0.587+b*0.114;
      if(lum<78) dark++;
      if(r>105&&r-g>42&&r-b>36) red++;
      if(g>90&&g-r>22&&g-b>18) green++;
      if(r>110&&g>75&&b<95&&r-b>40&&g-b>20) yellow++;
      count++;
    }
    const rr=red/count,gr=green/count,yr=yellow/count,dr=dark/count;
    let score=0;
    if(rr>=0.004) score+=0.28;
    if(gr>=0.004) score+=0.28;
    if(yr>=0.0012) score+=0.18;
    if(dr>=0.18) score+=0.16;
    if(rr>=0.009&&gr>=0.009) score+=0.10;
    return {likely:score>=0.62,score:score,red:rr,green:gr,yellow:yr,dark:dr};
  }

  function isLikelyXenGameFrame(){
    return xenGameFrameEvidence(getCaptureVideo()).likely;
  }

  function hideBlackCaptureWarning(){
    const el=$("capture-black-warning");
    if(el) el.hidden=true;
  }

  function showBlackCaptureWarning(){
    const el=$("capture-black-warning");
    if(!el) return;
    const surface=captureSurfaceLabel();
    const text=$("capture-black-warning-text");
    if(text){
      text.textContent=surface==="ウィンドウ"
        ?"ゲームのウィンドウ共有が黒画面になっています。Xen Rebirthをウィンドウ/ボーダーレス表示にするか、「画面全体」を選んで共有し直してください。"
        :"共有映像が黒画面です。「画面全体」を選んで共有し直すと改善することがあります。";
    }
    el.hidden=false;
    setStatus("capture-status","共有映像が黒画面のため読み取りを停止しています。下の案内から共有し直してください。");
  }

  function scheduleBlackCaptureCheck(){
    if(captureBlackCheckTimer) clearTimeout(captureBlackCheckTimer);
    let attempt=0,blackHits=0;
    const check=function(){
      if(!stream) return;
      const video=getCaptureVideo();
      const black=frameLooksBlack(video);
      if(black===true) blackHits++;
      else if(black===false){
        hideBlackCaptureWarning();
        blackHits=0;
      }
      attempt++;
      if(attempt<4){
        captureBlackCheckTimer=setTimeout(check,attempt===1?700:1000);
      }else if(blackHits>=3){
        showBlackCaptureWarning();
      }
    };
    captureBlackCheckTimer=setTimeout(check,450);
  }

  async function startScreen(){
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:8,max:15}},audio:false});
      const visible=$("screen-video");
      const source=ensureCaptureSourceVideo();
      visible.srcObject=stream;
      source.srcObject=stream;
      try{await Promise.all([visible.play(),source.play()]);}catch(_){}
      $("screen-shot").disabled=false;
      $("screen-stop").disabled=false;
      $("screen-start").disabled=true;
      $("auto-mode").disabled=false;
      setAutoStatus("off","OFF");
      const track=stream.getVideoTracks()[0];
      if(track) track.addEventListener("ended",stopScreen);
      hideBlackCaptureWarning();
      setStatus("capture-status","共有中（"+captureSurfaceLabel()+"）です。ページ内で3.登録済み情報を見ている間も、裏側の専用映像から読み取りを継続します。");
      syncMiniCaptureStatus();
      startLocalMapMonitor();
      scheduleBlackCaptureCheck();
    }catch(err){
      setStatus("capture-status",err.name==="NotAllowedError"?"画面共有はキャンセルされました。":"画面共有を開始できませんでした："+err.message);
    }
  }

  function stopScreen(){
    if(captureBlackCheckTimer){clearTimeout(captureBlackCheckTimer);captureBlackCheckTimer=null;}
    hideBlackCaptureWarning();
    stopAutoMonitor(true);
    stopLocalMapMonitor();
    if(stream) stream.getTracks().forEach(function(t){t.stop();});
    stream=null;
    $("screen-video").srcObject=null;
    if(captureSourceVideo) captureSourceVideo.srcObject=null;
    $("screen-shot").disabled=true;
    $("screen-stop").disabled=true;
    $("screen-start").disabled=false;
    $("auto-mode").disabled=true;
    $("auto-mode").checked=false;
    setAutoStatus("off","OFF");
    syncMiniCaptureStatus();
  }

  async function captureFrame(silent){
    const video=getCaptureVideo();
    if(!video.videoWidth){if(!silent)setStatus("capture-status","共有画面がまだ準備できていません。");return null;}
    if(frameLooksBlack(video)===true){
      showBlackCaptureWarning();
      return null;
    }
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
    const video=getCaptureVideo();
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
    if(fastNpcTimer){clearInterval(fastNpcTimer);fastNpcTimer=null;}
    autoBaseline=null;
    autoPending=null;
    autoPendingAt=0;
    if(resetToggle&&$("auto-mode")) $("auto-mode").checked=false;
    syncMiniCaptureStatus();
  }

  async function startAutoMonitor(){
    if(!stream){
      $("auto-mode").checked=false;
      setAutoStatus("off","OFF");
      setStatus("capture-status","先に画面共有を開始してください。");
      return;
    }
    autoEnabled=true;
    syncMiniCaptureStatus();
    autoBaseline=monitorSample();
    autoPending=null;
    autoPendingAt=0;
    setAutoStatus("watching","監視中");
    setStatus("capture-status","自動解析モードを開始しました。NPC会話・クエスト画面の変化を監視します。");
    if(autoTimer) clearInterval(autoTimer);
    autoTimer=setInterval(autoTick,AUTO_POLL_MS);
    if(fastNpcTimer) clearInterval(fastNpcTimer);
    // Run the local known-NPC matcher immediately, then keep it hot at a light interval.
    fastKnownNpcTick();
    fastNpcTimer=setInterval(fastKnownNpcTick,450);

    setTimeout(async function(){
      if(!autoEnabled||!stream||aiAnalyzing) return;
      const signature=npcSignatureFromVideo();
      const match=bestKnownNpcMatch(signature);
      if(match&&await showKnownNpcMatch(match)){
        setAutoStatus("watching","保存済みNPCを高速表示");
        return;
      }
      if(!autoEnabled||!stream||aiAnalyzing||fastDialogueOcrBusy) return;
      if(Date.now()-lastAutoAnalysisAt>=AUTO_COOLDOWN_MS){
        setAutoStatus("analyzing","初回解析中");
        lastAutoAnalysisAt=Date.now();
        runOpenAiAnalysis("auto");
      }
    },500);
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
      setAutoStatus("analyzing","保存済み会話を照合中");
      const localHit=await fastDialogueOcrTick(true);
      if(!localHit){
        setAutoStatus("analyzing","自動解析中");
        await runOpenAiAnalysis("auto");
      }
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
      // Never stay in "stable wait" forever. Try local OCR once, then force the
      // existing AI path if the saved conversation still cannot be identified.
      if(now-lastFastFallbackAt>6000){
        lastFastFallbackAt=now;
        setAutoStatus("analyzing","保存済み会話を再照合中");
        const localHit=await fastDialogueOcrTick(true);
        if(!localHit&&!aiAnalyzing){
          lastAutoAnalysisAt=now;
          setAutoStatus("analyzing","AI解析へ切替");
          await runOpenAiAnalysis("auto");
        }
      }else setAutoStatus("watching","再監視");
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

  function readKnownNpcSignatures(){
    try{
      const value=JSON.parse(localStorage.getItem(KNOWN_NPC_SIGNATURES_KEY)||"{}");
      return value&&typeof value==="object"?value:{};
    }catch(_){return {};}
  }

  function writeKnownNpcSignatures(value){
    try{localStorage.setItem(KNOWN_NPC_SIGNATURES_KEY,JSON.stringify(value));}catch(_){}
  }

  function dhashFromCanvas(canvas){
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let bits="";
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width-1;x++){
        const i=(y*canvas.width+x)*4;
        const j=(y*canvas.width+x+1)*4;
        const a=data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114;
        const b=data[j]*0.299+data[j+1]*0.587+data[j+2]*0.114;
        bits+=a>b?"1":"0";
      }
    }
    return bits;
  }

  function drawSignatureZone(source,sx,sy,sw,sh){
    const canvas=document.createElement("canvas");
    canvas.width=25;
    canvas.height=16;
    const ctx=canvas.getContext("2d");
    ctx.drawImage(source,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    return dhashFromCanvas(canvas);
  }

  function npcSignatureFromSource(source,w,h){
    if(!source||!w||!h) return "";
    const aspect=w/h;
    const headerW=aspect>=1.55?w*0.30:w*0.70;
    const headerH=aspect>=1.55?h*0.075:h*0.12;
    const portraitW=aspect>=1.55?w*0.095:w*0.28;
    const portraitY=aspect>=1.55?h*0.045:h*0.08;
    const portraitH=aspect>=1.55?h*0.285:h*0.68;
    const header=drawSignatureZone(source,0,0,Math.max(1,headerW),Math.max(1,headerH));
    const portrait=drawSignatureZone(source,0,portraitY,Math.max(1,portraitW),Math.max(1,portraitH));
    return header+"|"+portrait;
  }

  async function npcSignatureFromBlob(blob){
    if(!blob) return "";
    const bitmap=await createImageBitmap(blob);
    try{return npcSignatureFromSource(bitmap,bitmap.width,bitmap.height);}
    finally{if(bitmap.close) bitmap.close();}
  }

  function npcSignatureFromVideo(){
    const video=getCaptureVideo();
    if(!stream||!video.videoWidth||video.readyState<2) return "";
    return npcSignatureFromSource(video,video.videoWidth,video.videoHeight);
  }

  function signatureDistance(a,b){
    if(!a||!b||a.length!==b.length) return 1;
    let diff=0,total=0;
    for(let i=0;i<a.length;i++){
      if(a[i]==="|") continue;
      total++;
      if(a[i]!==b[i]) diff++;
    }
    return total?diff/total:1;
  }

  async function rememberKnownNpcSignature(result){
    const npc=String(result&&result.npc_name||"").trim();
    if(!npc||Number(result&&result.confidence||0)<85||!imageBlob) return;
    const signature=await npcSignatureFromBlob(imageBlob);
    if(!signature) return;
    const root=dialogueRootForNpc(npc);
    const db=readKnownNpcSignatures();
    const key=normText(npc);
    const entry=db[key]||{npc_name:npc,root_record_id:"",signatures:[]};
    entry.npc_name=npc;
    entry.root_record_id=root?root.id:(activeRecordId||entry.root_record_id||"");
    entry.signatures=Array.isArray(entry.signatures)?entry.signatures:[];
    if(!entry.signatures.some(function(x){return signatureDistance(x.bits,signature)<0.025;})){
      entry.signatures.unshift({bits:signature,at:Date.now()});
      entry.signatures=entry.signatures.slice(0,4);
    }
    db[key]=entry;
    writeKnownNpcSignatures(db);
  }

  function bestKnownNpcMatch(signature){
    if(!signature) return null;
    const db=readKnownNpcSignatures();
    const candidates=[];
    Object.keys(db).forEach(function(key){
      const entry=db[key];
      const distances=(entry.signatures||[]).map(function(s){return signatureDistance(signature,s.bits);});
      if(distances.length) candidates.push({entry:entry,distance:Math.min.apply(null,distances)});
    });
    candidates.sort(function(a,b){return a.distance-b.distance;});
    if(!candidates.length) return null;
    const best=candidates[0];
    const second=candidates[1];
    if(best.distance>0.135) return null;
    if(second&&second.entry.npc_name!==best.entry.npc_name&&second.distance-best.distance<0.035) return null;
    return best;
  }

  async function showKnownNpcMatch(match){
    if(!match||!match.entry) return false;
    // Portrait/name hashes cannot identify the current dialogue. Confirm with OCR.
    return fastDialogueOcrTick(false);
  }

  async function fastKnownNpcTick(){
    if(!autoEnabled||!stream) return;
    const signature=npcSignatureFromVideo();
    const match=signature?bestKnownNpcMatch(signature):null;
    if(match){
      const npc=match.entry.npc_name||"";
      if(!(npc===lastFastNpcName&&Date.now()-lastFastNpcAt<1800)){
        await showKnownNpcMatch(match);
      }
    }
    // Appearance is only the first hint. If it is ambiguous/missing, identify the
    // saved dialogue from local OCR using NPC name + English dialogue + choices +
    // current map. This also handles identical-looking / same-name NPCs.
    await fastDialogueOcrTick(false);
  }

  function fastDialogueCanvas(){
    const video=getCaptureVideo();
    if(!stream||!video.videoWidth||video.readyState<2) return null;
    const vw=video.videoWidth,vh=video.videoHeight;
    const canvas=document.createElement("canvas");
    canvas.width=1000; canvas.height=430;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    // Xen NPC dialogue is normally around the centre. OCR a broad centre zone so
    // different resolutions/window sizes still work; map/name/text/choices can all
    // contribute to the local match.
    ctx.drawImage(video,vw*0.18,vh*0.18,vw*0.70,vh*0.68,0,0,canvas.width,canvas.height);
    return canvas;
  }

  function tokenSet(value){
    return new Set(String(value||"").normalize("NFKC").toLowerCase()
      .replace(/[^a-z0-9' -]+/g," ").split(/\s+/).filter(function(x){return x.length>=2;}));
  }

  function tokenSimilarity(a,b){
    const aa=tokenSet(a),bb=tokenSet(b);
    if(!aa.size||!bb.size) return 0;
    let hit=0; aa.forEach(function(x){if(bb.has(x)) hit++;});
    return hit/Math.max(1,Math.min(aa.size,bb.size));
  }

  function bestSavedDialogueFromOcr(text){
    const raw=String(text||"").trim();
    if(!raw) return null;
    const map=String(routeCurrentMap||"").trim();
    // Location can be stale indoors; use it as supporting evidence, not a gate.
    const scored=records.map(function(r){
      const body=r.dialogue_text_en||r.english_text||"";
      const bodyTokens=tokenSet(body),rawTokens=tokenSet(raw);
      let hits=0; bodyTokens.forEach(function(token){if(rawTokens.has(token)) hits++;});
      if(hits<Math.min(3,bodyTokens.size)||!bodyTokens.size) return {record:r,score:0};
      let score=hits/bodyTokens.size;
      const choiceTokens=tokenSet(choicesArray(r.choices_en).join(" "));
      let choiceHits=0; choiceTokens.forEach(function(token){if(rawTokens.has(token)) choiceHits++;});
      if(choiceTokens.size) score+=0.15*choiceHits/choiceTokens.size;
      if(map&&r.map_name&&normText(map)===normText(r.map_name)) score+=0.12;
      // NPC name is useful, but never sufficient by itself because duplicate names exist.
      if(r.npc_name&&normText(raw).includes(normText(r.npc_name))) score+=0.10;
      return {record:r,score:score};
    }).sort(function(a,b){return b.score-a.score;});
    if(!scored.length||scored[0].score<0.34) return null;
    if(scored[1]&&scored[0].score-scored[1].score<0.045) return null;
    return scored[0];
  }

  function inferChoiceIndexBetween(from,to){
    if(!from||!to||from.id===to.id) return -1;
    if(!from.npc_name||normText(from.npc_name)!==normText(to.npc_name)) return -1;
    if(from.map_name&&to.map_name&&normText(from.map_name)!==normText(to.map_name)) return -1;
    const choices=choicesArray(from.choices_en);
    if(!choices.length) return -1;
    const nextText=[to.dialogue_text_en,to.english_text,to.quest_name_en].filter(Boolean).join(" ");
    let best={index:-1,score:0},second=0;
    choices.forEach(function(choice,index){
      let score=tokenSimilarity(choice,nextText);
      // Existing transition knowledge is strong evidence and lets repeated
      // observations reinforce the same route.
      const known=transitionFor(from.id,index);
      if(known&&known.to_record_id===to.id) score+=1;
      if(score>best.score){second=best.score;best={index:index,score:score};}
      else if(score>second) second=score;
    });
    if(best.score>=1) return best.index;
    if(best.score>=0.24&&best.score-second>=0.08) return best.index;
    // If only one choice can advance and both records belong to the same NPC/map,
    // it is safe enough to connect it from the observed before/after pair.
    if(choices.length===1&&from.npc_name===to.npc_name&&
       (!from.map_name||!to.map_name||normText(from.map_name)===normText(to.map_name))) return 0;
    return -1;
  }

  async function rememberObservedDialogueTransition(previousId,nextRecord){
    if(!previousId||!nextRecord||previousId===nextRecord.id) return;
    const previous=records.find(function(r){return r.id===previousId;});
    if(!previous) return;
    const choiceIndex=inferChoiceIndexBetween(previous,nextRecord);
    if(choiceIndex<0) return;
    const exists=transitionFor(previous.id,choiceIndex);
    if(exists) return; // Inference must never overwrite an established branch.
    // Persist when the existing RPC is available; otherwise keep a session-local
    // transition so navigation works immediately without breaking older databases.
    try{
      const res=await db.rpc("game_dialogue_transition_save",{
        p_from_record_id:previous.id,
        p_choice_index:choiceIndex,
        p_to_record_id:nextRecord.id,
        p_choice_text_en:choicesArray(previous.choices_en)[choiceIndex]||"",
        p_contributor_id:contributorId
      });
      if(!res.error) await loadDialogueTransitions();
      else dialogueTransitions.push({from_record_id:previous.id,choice_index:choiceIndex,to_record_id:nextRecord.id,_local:true});
    }catch(_){
      dialogueTransitions.push({from_record_id:previous.id,choice_index:choiceIndex,to_record_id:nextRecord.id,_local:true});
    }
  }

  function rememberDialogueHistory(nextId){
    if(!nextId||nextId===activeRecordId) return;
    if(activeRecordId) dialogueHistory.push(activeRecordId);
    if(dialogueHistory.length>40) dialogueHistory.shift();
  }

  function showSavedDialogueMatch(hit){
    if(!hit||!hit.record) return false;
    const r=hit.record;
    if(activeRecordId===r.id&&$("knowledge-search").value===r.npc_name&&
       (!$("map-filter").value||$("map-filter").value===r.map_name)) return true;
    const previousId=activeRecordId;
    rememberDialogueHistory(r.id);
    activeNpcName=r.npc_name||"";
    activeRecordId=r.id;
    rememberObservedDialogueTransition(previousId,r);
    if($("knowledge-search").value!==activeNpcName) $("knowledge-search").value=activeNpcName;
    if($("map-filter").value&&$("map-filter").value!==r.map_name) $("map-filter").value="";
    renderRecords();
    lastFastNpcName=activeNpcName;
    lastFastNpcAt=Date.now();
    setStatus("capture-status","保存済み会話を高速照合しました（NPC名・会話文・選択肢・現在地を照合 / AI解析なし）。");
    setStatus("form-status",needsTranslation(r)?"未翻訳の項目があります。":"保存済み翻訳を即時表示中（API使用なし）");
    return true;
  }

  async function fastDialogueOcrTick(force){
    const now=Date.now();
    if(fastDialogueOcrBusy||!autoEnabled||!stream||!window.Tesseract) return false;
    if(!force&&now-lastFastDialogueOcrAt<1800) return false;
    const canvas=fastDialogueCanvas();
    if(!canvas) return false;
    fastDialogueOcrBusy=true;
    const sourceStream=stream;
    const sourceRecordId=activeRecordId;
    lastFastDialogueOcrAt=now;
    try{
      const result=await window.Tesseract.recognize(canvas,"eng",{logger:function(){}});
      if(!autoEnabled||stream!==sourceStream||activeRecordId!==sourceRecordId) return false;
      const text=result&&result.data?String(result.data.text||""):"";
      const hit=bestSavedDialogueFromOcr(text);
      return hit?showSavedDialogueMatch(hit):false;
    }catch(_){return false;}
    finally{fastDialogueOcrBusy=false;}
  }

  function normText(value){
    return String(value||"").trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/g," ");
  }

  function linesToArray(value){
    return String(value||"").split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
  }

  function choicesArray(value){
    if(Array.isArray(value)) return value.map(function(x){return String(x||"").trim();});
    if(typeof value==="string"){
      if(!value.trim()) return [];
      try{
        const parsed=JSON.parse(value);
        if(Array.isArray(parsed)) return parsed.map(function(x){return String(x||"").trim();});
      }catch(_){}
      return value.split(/\r?\n/).map(function(x){return x.trim();});
    }
    return [];
  }

  // Empty slots are intentional: choice indexes also identify dialogue transitions.
  const TRANSLATION_CACHE_KEY="xen-validated-ja-v1";
  const translationPending=new Map();
  const translationFailures=new Map();
  const recordRepairs=new Map();

  function translationKey(value){
    return String(value||"").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
  }

  function validJapanese(en,ja){
    const source=translationKey(en),target=translationKey(ja);
    if(!target||!/[ぁ-んァ-ヶ一-龠]/.test(target)||source===target) return false;
    // Reject an English echo with a tiny Japanese suffix/prefix as well.
    const latin=target.replace(/[^a-z0-9]/g,"");
    const original=source.replace(/[^a-z0-9]/g,"");
    const japanese=(target.match(/[ぁ-んァ-ヶ一-龠]/g)||[]).length;
    if(original&&latin&&japanese<target.length*0.3){
      if(latin.includes(original)||original.includes(latin)) return false;
      const a=new Set(latin.match(/.{1,2}/g)||[]);
      const b=new Set(original.match(/.{1,2}/g)||[]);
      let common=0;
      a.forEach(function(x){if(b.has(x)) common++;});
      if(2*common/(a.size+b.size)>=0.85) return false;
    }
    return true;
  }

  function readTranslationCache(){
    try{
      const rows=JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY)||"[]");
      return new Map(Array.isArray(rows)?rows.filter(function(r){
        return Array.isArray(r)&&r.length===2&&validJapanese(r[0],r[1]);
      }):[]);
    }catch(_){return new Map();}
  }

  const translationCache=readTranslationCache();

  function acceptedTranslation(en,ja){
    if(validJapanese(en,ja)) return String(ja).trim();
    const cached=translationCache.get(translationKey(en));
    return validJapanese(en,cached)?cached:"";
  }

  function rememberTranslation(en,ja){
    if(!validJapanese(en,ja)) return;
    const key=translationKey(en);
    translationCache.delete(key);
    translationCache.set(key,String(ja).trim());
    while(translationCache.size>500) translationCache.delete(translationCache.keys().next().value);
    try{localStorage.setItem(TRANSLATION_CACHE_KEY,JSON.stringify(Array.from(translationCache)));}catch(_){}
  }

  function cleanTranslations(result){
    const copy=Object.assign({},result);
    copy.dialogue_text_en=String(result.dialogue_text_en??result.english_text??"");
    copy.dialogue_text_ja=collapseRepeatedDialogue(acceptedTranslation(copy.dialogue_text_en,result.dialogue_text_ja??result.japanese_text));
    copy.choices_en=choicesArray(result.choices_en);
    const ja=choicesArray(result.choices_ja);
    copy.choices_ja=copy.choices_en.map(function(en,i){return en?acceptedTranslation(en,ja[i]):"";});
    copy.japanese_text=[copy.dialogue_text_ja].concat(copy.choices_ja).filter(Boolean).join("\n");
    return copy;
  }

  function needsTranslation(result){
    const clean=cleanTranslations(result);
    return !!(clean.dialogue_text_en.trim()&&!clean.dialogue_text_ja)||
      clean.choices_en.some(function(en,i){return en&&!clean.choices_ja[i];});
  }

  async function translateMissingText(en,retry){
    const cached=acceptedTranslation(en,"");
    if(cached) return cached;
    const key=translationKey(en);
    if(!key) return "";
    if(translationPending.has(key)) return translationPending.get(key);
    if(!retry&&Date.now()-(translationFailures.get(key)||0)<60000) return "";
    const pending=(async function(){
      let translator;
      try{
        const api=window.Translator||(window.ai&&window.ai.translator);
        if(!api||typeof api.create!=="function") return "";
        translator=await api.create({sourceLanguage:"en",targetLanguage:"ja"});
        const ja=await translator.translate(en);
        if(!validJapanese(en,ja)) return "";
        rememberTranslation(en,ja);
        return String(ja).trim();
      }catch(_){return "";}
      finally{if(translator&&translator.destroy) translator.destroy();}
    })();
    translationPending.set(key,pending);
    try{
      const ja=await pending;
      if(!ja) translationFailures.set(key,Date.now());
      else translationFailures.delete(key);
      return ja;
    }finally{translationPending.delete(key);}
  }

  async function repairTranslations(result,retry){
    const clean=cleanTranslations(result);
    if(clean.dialogue_text_en.trim()&&!clean.dialogue_text_ja){
      clean.dialogue_text_ja=await translateMissingText(clean.dialogue_text_en,retry);
    }
    for(let i=0;i<clean.choices_en.length;i++){
      if(clean.choices_en[i]&&!clean.choices_ja[i]){
        clean.choices_ja[i]=await translateMissingText(clean.choices_en[i],retry);
      }
      rememberTranslation(clean.choices_en[i],clean.choices_ja[i]);
    }
    rememberTranslation(clean.dialogue_text_en,clean.dialogue_text_ja);
    clean.japanese_text=[clean.dialogue_text_ja].concat(clean.choices_ja).filter(Boolean).join("\n");
    return clean;
  }

  function repairDisplayedRecord(record,cardKey){
    if(!needsTranslation(record)||recordRepairs.has(record.id)) return;
    const pending=repairTranslations(record).then(function(clean){
      Object.assign(record,clean);
      // Refresh only the same visible record; never navigate after an async repair.
      document.querySelectorAll(".game-dialog-card").forEach(function(card){
        if(card.dataset.recordId===record.id&&card.dataset.cardKey===cardKey){
          card.outerHTML=renderDialogueCard(record,cardKey);
        }
      });
    }).catch(function(){}).finally(function(){recordRepairs.delete(record.id);});
    recordRepairs.set(record.id,pending);
  }

  function profileKey(name,map){
    return normText(name)+"|"+normText(map);
  }

  function findNpcProfile(name,map){
    const exact=profileKey(name,map);
    return npcProfiles.find(function(p){return profileKey(p.npc_name,p.map_name)===exact;})||null;
  }

  async function applyAiResult(result){
    result=cleanTranslations(result);
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
    const dialogueJa=String(result.dialogue_text_ja??result.japanese_text??"");
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

  function dialogueUnits(text){
    const value=String(text||"").replace(/\r/g,"").trim();
    if(!value) return [];
    const paragraphs=value.split(/\n{2,}/).map(function(x){return x.trim();}).filter(Boolean);
    const out=[];
    paragraphs.forEach(function(p){
      const parts=p.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g)||[p];
      parts.map(function(x){return x.trim();}).filter(Boolean).forEach(function(x){out.push(x);});
    });
    return out.length?out:[value];
  }

  function compactUnit(text){
    return String(text||"").normalize("NFKC").toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu,"");
  }

  function bigramDice(a,b){
    a=compactUnit(a); b=compactUnit(b);
    if(!a||!b) return 0;
    if(a===b) return 1;
    if(a.includes(b)||b.includes(a)) return Math.min(a.length,b.length)/Math.max(a.length,b.length);
    if(a.length<2||b.length<2) return 0;
    const counts=new Map();
    for(let i=0;i<a.length-1;i++){
      const g=a.slice(i,i+2);
      counts.set(g,(counts.get(g)||0)+1);
    }
    let common=0;
    for(let i=0;i<b.length-1;i++){
      const g=b.slice(i,i+2);
      const n=counts.get(g)||0;
      if(n){common++;counts.set(g,n-1);}
    }
    return 2*common/((a.length-1)+(b.length-1));
  }

  function routeData(){
    return window.XEN_WORLD_ROUTES||{nodes:[],edges:[],aliases:{}};
  }

  function mapKey(value){
    return String(value||"").normalize("NFKC").toLowerCase()
      .replace(/['’]/g,"")
      .replace(/[^a-z0-9]+/g," ")
      .trim();
  }

  function canonicalRouteMapName(value){
    const raw=String(value||"").trim();
    if(!raw) return "";
    const data=routeData();
    const key=mapKey(raw);
    const alias=(data.aliases||{})[key];
    if(alias) return alias;
    const exact=(data.nodes||[]).find(function(name){return mapKey(name)===key;});
    if(exact) return exact;

    const candidates=Array.from(new Set(
      (data.nodes||[]).concat(gameMaps.map(function(m){return m.map_name||"";})).filter(Boolean)
    ));
    let best=null,second=null;
    candidates.forEach(function(name){
      const score=bigramDice(raw,name);
      const item={name:name,score:score};
      if(!best||score>best.score){second=best;best=item;}
      else if(!second||score>second.score) second=item;
    });
    if(best&&best.score>=0.74&&(!second||best.score-second.score>=0.035)) return best.name;
    return raw;
  }

  function loadLocalMapState(){
    try{
      const saved=JSON.parse(localStorage.getItem(LOCAL_MAP_STATE_KEY)||"{}");
      routeCurrentMap=canonicalRouteMapName(saved.map||"");
      routeCurrentSource=String(saved.source||"");
      routeCurrentConfidence=Number(saved.confidence||0);
      if(routeCurrentSource==="中央マップ名OCR"&&routeCurrentConfidence<90){
        routeCurrentMap="";
        routeCurrentSource="";
        routeCurrentConfidence=0;
      }
    }catch(_){}
  }

  function saveLocalMapState(){
    try{
      localStorage.setItem(LOCAL_MAP_STATE_KEY,JSON.stringify({
        map:routeCurrentMap,
        source:routeCurrentSource,
        confidence:routeCurrentConfidence,
        at:Date.now()
      }));
    }catch(_){}
  }

  function setLocalCurrentMap(name,source,confidence,force){
    const canonical=canonicalRouteMapName(name);
    if(!canonical) return false;
    const conf=Math.max(0,Math.min(100,Math.round(Number(confidence)||0)));
    if(!force&&routeCurrentMap&&canonical!==routeCurrentMap&&conf<72) return false;
    if(!force&&source==="中央マップ名OCR"&&routeCurrentMap&&canonical!==routeCurrentMap){
      const now=Date.now();
      if(localMapOcrCandidate.name===canonical&&now-localMapOcrCandidate.at<5000){
        localMapOcrCandidate.hits++;
      }else{
        localMapOcrCandidate={name:canonical,hits:1,at:now};
      }
      localMapOcrCandidate.at=now;
      if(localMapOcrCandidate.hits<2) return false;
    }else if(canonical===routeCurrentMap){
      localMapOcrCandidate={name:"",hits:0,at:0};
    }
    routeCurrentMap=canonical;
    routeCurrentSource=source||"ローカル認識";
    routeCurrentConfidence=conf;
    saveLocalMapState();
    const manual=$("route-current-manual");
    if(manual&&Array.from(manual.options).some(function(o){return o.value===canonical;})) manual.value=canonical;
    const mapSelect=$("map-db-select");
    if(mapSelect&&gameMaps.length){
      const match=gameMaps.find(function(m){return canonicalRouteMapName(m.map_name)===canonical;});
      if(match) mapSelect.value=match.id;
    }
    renderRoutePlanner();
    renderMapDatabase();
    return true;
  }

  function refreshRouteDestinationOptions(){
    const data=routeData();
    const names=(data.nodes||[]).slice().sort(function(a,b){return a.localeCompare(b,"en");});
    const dest=$("route-destination");
    const destList=$("route-destination-list");
    const manual=$("route-current-manual");
    if(dest&&destList){
      const previous=dest.value||localStorage.getItem(ROUTE_DESTINATION_KEY)||"";
      destList.innerHTML=names.map(function(name){
        return '<option value="'+esc(name)+'"></option>';
      }).join("");
      if(previous) dest.value=previous;
    }
    if(manual){
      const previous=routeCurrentMap;
      manual.innerHTML='<option value="">自動認識</option>'+names.map(function(name){
        return '<option value="'+esc(name)+'">'+esc(name)+'</option>';
      }).join("");
      if(names.includes(previous)) manual.value=previous;
    }
    renderRoutePlanner();
  }

  function worldRoute(from,to,level,ignoreLevel){
    from=canonicalRouteMapName(from);
    to=canonicalRouteMapName(to);
    if(!from||!to) return null;
    if(from===to) return {path:[from],edges:[]};
    const data=routeData();
    const graph=new Map();
    (data.edges||[]).forEach(function(edge){
      if(!ignoreLevel&&Number.isFinite(level)&&edge.minLevel&&level<Number(edge.minLevel)) return;
      if(!graph.has(edge.a)) graph.set(edge.a,[]);
      if(!graph.has(edge.b)) graph.set(edge.b,[]);
      graph.get(edge.a).push({to:edge.b,edge:edge});
      graph.get(edge.b).push({to:edge.a,edge:edge});
    });
    const queue=[from];
    const prev=new Map();
    prev.set(from,null);
    while(queue.length){
      const here=queue.shift();
      if(here===to) break;
      (graph.get(here)||[]).forEach(function(next){
        if(prev.has(next.to)) return;
        prev.set(next.to,{from:here,edge:next.edge});
        queue.push(next.to);
      });
    }
    if(!prev.has(to)) return null;
    const path=[];
    const used=[];
    let cur=to;
    while(cur){
      path.unshift(cur);
      const p=prev.get(cur);
      if(!p) break;
      used.unshift(p.edge);
      cur=p.from;
    }
    return {path:path,edges:used};
  }

  function renderRoutePlanner(){
    const currentEl=$("route-current-map");
    const sourceEl=$("route-current-source");
    const nextEl=$("route-next-map");
    const pathEl=$("route-path");
    const statusEl=$("route-status");
    if(!currentEl||!nextEl||!pathEl) return;

    currentEl.textContent=routeCurrentMap||"未認識";
    if(sourceEl){
      sourceEl.textContent=routeCurrentMap
        ? (routeCurrentSource||"ローカル認識")+(routeCurrentConfidence?" / "+routeCurrentConfidence+"%":"")
        : "拡大マップ画像または中央のマップ名をローカルで待機中";
    }

    const destinationRaw=$("route-destination")?$("route-destination").value:"";
    const destination=canonicalRouteMapName(destinationRaw);
    currentRoutePlan=null;
    if(!destinationRaw){
      nextEl.textContent="目的地を選択してください";
      pathEl.innerHTML="";
      if(statusEl) statusEl.textContent="現在地認識はOpenAI APIを使わず、端末内の画像照合とOCRで行います。";
      renderRouteExitArrow();
      return;
    }
    if(!routeCurrentMap){
      nextEl.textContent="現在地を認識中…";
      pathEl.innerHTML="";
      if(statusEl) statusEl.textContent="拡大マップを開くか、マップ移動時に中央へ表示されるマップ名を待っています。";
      renderRouteExitArrow();
      return;
    }

    const levelInput=$("route-level");
    const level=levelInput&&levelInput.value!==""?Number(levelInput.value):NaN;
    let route=worldRoute(routeCurrentMap,destination,level,false);
    let restricted=false;
    if(!route&&Number.isFinite(level)){
      route=worldRoute(routeCurrentMap,destination,level,true);
      restricted=!!route;
    }
    if(!route){
      nextEl.textContent="ルート未登録";
      pathEl.innerHTML='<span class="route-warning">'+esc(routeCurrentMap)+' から '+esc(destination)+' までの接続データがまだありません。</span>';
      if(statusEl) statusEl.textContent="現在地の認識自体は継続します。ルート接続データは今後追加できます。";
      renderRouteExitArrow();
      return;
    }

    currentRoutePlan=route;
    if(route.path.length===1){
      nextEl.textContent="目的地に到着しています";
    }else{
      nextEl.textContent=route.path[1];
    }
    pathEl.innerHTML=route.path.map(function(name,i){
      const edge=i>0?route.edges[i-1]:null;
      const requirement=edge&&edge.minLevel?'<small>L'+esc(edge.minLevel)+'+</small>':(edge&&edge.note?'<small>'+esc(edge.note)+'</small>':"");
      return '<span class="'+(i===0?"is-current":(i===route.path.length-1?"is-destination":""))+'">'+esc(name)+requirement+'</span>'+
        (i<route.path.length-1?'<b>→</b>':"");
    }).join("");
    if(statusEl){
      statusEl.textContent=restricted
        ?"入力Lvでは通れない区間があります。表示経路のLv条件を確認してください。"
        :"あと "+Math.max(0,route.path.length-1)+" マップ / 次は「"+(route.path[1]||destination)+"」です。";
    }
    renderRouteExitArrow();
  }

  function visualSignatureFromSource(source,sx,sy,sw,sh){
    const w=33,h=24;
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(source,sx,sy,sw,sh,0,0,w,h);
    const data=ctx.getImageData(0,0,w,h).data;
    const gray=[];
    for(let i=0;i<data.length;i+=4) gray.push(data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114);
    let bits="";
    for(let y=0;y<h;y++){
      for(let x=0;x<w-1;x++){
        const i=y*w+x;
        bits+=gray[i]>gray[i+1]?"1":"0";
      }
    }
    for(let y=0;y<h-1;y++){
      for(let x=0;x<w;x++){
        const i=y*w+x;
        bits+=gray[i]>gray[i+w]?"1":"0";
      }
    }
    return bits;
  }

  function visualSignatureDistance(a,b){
    if(!a||!b||a.length!==b.length) return 1;
    let diff=0;
    for(let i=0;i<a.length;i++) if(a[i]!==b[i]) diff++;
    return diff/a.length;
  }

  function readLocalMapSignatureCache(){
    try{
      const value=JSON.parse(localStorage.getItem(LOCAL_MAP_SIGNATURES_KEY)||"{}");
      return value&&typeof value==="object"?value:{};
    }catch(_){return {};}
  }

  async function prepareLocalMapSignatures(){
    if(localMapSignatureLoading) return;
    localMapSignatureLoading=true;
    try{
      const cache=readLocalMapSignatureCache();
      const nextCache={};
      const out=[];
      for(const map of gameMaps){
        if(!map.map_image_url) continue;
        const key=String(map.id||map.map_name)+"|"+map.map_image_url;
        let bits=cache[key]&&cache[key].bits;
        if(!bits){
          try{
            const response=await fetch(map.map_image_url,{cache:"force-cache"});
            if(!response.ok) continue;
            const blob=await response.blob();
            const bitmap=await createImageBitmap(blob);
            bits=visualSignatureFromSource(bitmap,0,0,bitmap.width,bitmap.height);
            if(bitmap.close) bitmap.close();
          }catch(_){continue;}
        }
        nextCache[key]={map_name:map.map_name,bits:bits};
        out.push({map_name:map.map_name,bits:bits});
      }
      localMapSignatures=out;
      try{localStorage.setItem(LOCAL_MAP_SIGNATURES_KEY,JSON.stringify(nextCache));}catch(_){}
    }finally{
      localMapSignatureLoading=false;
    }
  }

  function currentExpandedMapSignatures(){
    const video=getCaptureVideo();
    if(!stream||!video.videoWidth||video.readyState<2) return [];
    const w=video.videoWidth,h=video.videoHeight;
    // Actual expanded-map observations are normally in the far-right ~22-27%
    // of the game window. Try several nearby crops because aspect ratio and UI
    // scaling move the panel a little.
    const regions=[
      [0.72,0.00,0.28,0.50],
      [0.735,0.00,0.265,0.49],
      [0.755,0.00,0.245,0.48],
      [0.70,0.00,0.30,0.53],
      [0.74,0.01,0.26,0.46]
    ];
    return regions.map(function(r){
      return visualSignatureFromSource(video,w*r[0],h*r[1],w*r[2],h*r[3]);
    }).filter(Boolean);
  }

  async function localExpandedMapMatchTick(force){
    if(!isLikelyXenGameFrame()) return false;
    const now=Date.now();
    if(!force&&now-lastLocalMapImageAt<LOCAL_MAP_IMAGE_INTERVAL_MS) return false;
    lastLocalMapImageAt=now;
    if(!localMapSignatures.length){
      await prepareLocalMapSignatures();
      if(!localMapSignatures.length) return false;
    }
    const sigs=currentExpandedMapSignatures();
    if(!sigs.length) return false;
    const ranked=localMapSignatures.map(function(item){
      let distance=1;
      sigs.forEach(function(sig){
        distance=Math.min(distance,visualSignatureDistance(sig,item.bits));
      });
      return {name:item.map_name,distance:distance};
    }).sort(function(a,b){return a.distance-b.distance;});
    const best=ranked[0],second=ranked[1];
    lastLocalMapBest=best||null;
    if(!best||best.distance>0.34) return false;
    if(second&&second.distance-best.distance<0.012&&best.distance>0.22) return false;

    if(localMapMatchCandidate.name===best.name&&now-localMapMatchCandidate.at<5000){
      localMapMatchCandidate.hits++;
    }else{
      localMapMatchCandidate={name:best.name,hits:1,at:now};
    }
    localMapMatchCandidate.at=now;
    if(force||localMapMatchCandidate.hits>=2){
      setLocalCurrentMap(best.name,"ローカル拡大マップ照合",Math.round((1-best.distance)*100),!!force);
      return true;
    }
    return false;
  }

  function expandedMapTitleCanvas(){
    const video=getCaptureVideo();
    if(!stream||!video.videoWidth||video.readyState<2) return null;
    const vw=video.videoWidth,vh=video.videoHeight;
    // Crop the title/header portion of the far-right expanded map panel.
    const sx=vw*0.70, sy=0, sw=vw*0.30, sh=vh*0.18;
    const canvas=document.createElement("canvas");
    canvas.width=1000;canvas.height=260;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height);
    let min=255,max=0;
    for(let i=0;i<image.data.length;i+=4){
      const g=image.data[i]*0.299+image.data[i+1]*0.587+image.data[i+2]*0.114;
      if(g<min) min=g;
      if(g>max) max=g;
    }
    const span=Math.max(28,max-min);
    for(let i=0;i<image.data.length;i+=4){
      let g=image.data[i]*0.299+image.data[i+1]*0.587+image.data[i+2]*0.114;
      g=(g-min)*255/span;
      g=g>150?255:(g<75?0:g);
      image.data[i]=image.data[i+1]=image.data[i+2]=g;
    }
    ctx.putImageData(image,0,0);
    return canvas;
  }

  async function runExpandedMapTitleOcrSnapshot(force){
    const now=Date.now();
    if(expandedMapOcrBusy||!window.Tesseract||!stream) return false;
    if(!isLikelyXenGameFrame()) return false;
    if(!force&&now-lastExpandedMapOcrAt<4500) return false;
    const canvas=expandedMapTitleCanvas();
    if(!canvas) return false;
    expandedMapOcrBusy=true;
    lastExpandedMapOcrAt=now;
    try{
      const result=await window.Tesseract.recognize(canvas,"eng",{logger:function(){}});
      const text=result&&result.data?String(result.data.text||""):"";
      const best=bestMapNameFromOcr(text);
      if(best){
        const ocrConfidence=result&&result.data&&Number.isFinite(Number(result.data.confidence))?Number(result.data.confidence):75;
        const combined=Math.round(Math.min(99,Math.max(72,best.score*78+ocrConfidence*0.22)));
        setLocalCurrentMap(best.name,"拡大マップ名OCR",combined,true);
        setStatus("route-status","拡大マップ上のマップ名をローカルOCRで認識しました。OpenAI APIは使用していません。");
        return true;
      }
      return false;
    }catch(_){
      return false;
    }finally{
      expandedMapOcrBusy=false;
    }
  }

  function centerTitleSample(){
    const video=getCaptureVideo();
    if(!stream||!video.videoWidth||video.readyState<2) return null;
    const w=64,h=18;
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const vw=video.videoWidth,vh=video.videoHeight;
    ctx.drawImage(video,vw*0.22,vh*0.34,vw*0.56,vh*0.18,0,0,w,h);
    const data=ctx.getImageData(0,0,w,h).data;
    const sample=[];
    for(let i=0;i<data.length;i+=4) sample.push(Math.round(data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114));
    return new Uint8Array(sample);
  }

  function centerTitleCanvas(){
    const video=getCaptureVideo();
    if(!stream||!video.videoWidth||video.readyState<2) return null;
    const vw=video.videoWidth,vh=video.videoHeight;
    const canvas=document.createElement("canvas");
    canvas.width=900;canvas.height=220;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(video,vw*0.18,vh*0.29,vw*0.64,vh*0.26,0,0,canvas.width,canvas.height);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height);
    let sum=0;
    for(let i=0;i<image.data.length;i+=4){
      const g=image.data[i]*0.299+image.data[i+1]*0.587+image.data[i+2]*0.114;
      sum+=g;
    }
    const avg=sum/(image.data.length/4);
    for(let i=0;i<image.data.length;i+=4){
      let g=image.data[i]*0.299+image.data[i+1]*0.587+image.data[i+2]*0.114;
      g=(g-avg)*1.8+128;
      g=Math.max(0,Math.min(255,g));
      image.data[i]=image.data[i+1]=image.data[i+2]=g;
    }
    ctx.putImageData(image,0,0);
    return canvas;
  }

  function bestMapNameFromOcr(text){
    const raw=String(text||"").trim();
    if(!raw) return null;
    const data=routeData();
    const names=Array.from(new Set(
      (data.nodes||[]).concat(gameMaps.map(function(m){return m.map_name||"";})).filter(Boolean)
    ));
    const lines=raw.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
    const whole=mapKey(raw);
    let best=null,second=null;
    names.forEach(function(name){
      const key=mapKey(name);
      let score=0;
      if(key&&whole.includes(key)) score=1;
      else{
        lines.forEach(function(line){score=Math.max(score,bigramDice(line,name));});
      }
      if(key.length<=4&&score<0.88) return;
      const item={name:name,score:score};
      if(!best||score>best.score){second=best;best=item;}
      else if(!second||score>second.score) second=item;
    });
    if(!best||best.score<0.66) return null;
    if(second&&best.score-second.score<0.035&&best.score<0.9) return null;
    return best;
  }

  async function runCenterMapOcrSnapshot(){
    if(centerOcrBusy||!window.Tesseract||!stream) return;
    if(!isLikelyXenGameFrame()) return;
    const canvas=centerTitleCanvas();
    if(!canvas) return;
    centerOcrBusy=true;
    try{
      const result=await window.Tesseract.recognize(canvas,"eng",{logger:function(){}});
      const text=result&&result.data?String(result.data.text||""):"";
      const best=bestMapNameFromOcr(text);
      if(best){
        const ocrConfidence=result&&result.data&&Number.isFinite(Number(result.data.confidence))?Number(result.data.confidence):75;
        const combined=Math.round(Math.min(99,Math.max(70,best.score*75+ocrConfidence*0.25)));
        setLocalCurrentMap(best.name,"中央マップ名OCR",combined);
        setStatus("route-status","中央に表示されたマップ名をローカルOCRで認識しました。OpenAI APIは使用していません。");
      }
    }catch(_){}
    finally{centerOcrBusy=false;}
  }

  function scheduleCenterMapOcrBurst(){
    const now=Date.now();
    if(now-lastCenterBurstAt<CENTER_MAP_BURST_COOLDOWN_MS) return;
    lastCenterBurstAt=now;
    [180,650,1250].forEach(function(delay){
      setTimeout(function(){if(localMapActive&&stream) runCenterMapOcrSnapshot();},delay);
    });
  }

  function localMapTick(){
    if(!localMapActive||!stream) return;
    if(!isLikelyXenGameFrame()){
      lastCenterSample=null;
      centerTransitionPendingAt=0;
      centerTransitionStable=0;
      return;
    }
    localExpandedMapMatchTick(false);
    if(!routeCurrentMap) runExpandedMapTitleOcrSnapshot(false);

    const sample=centerTitleSample();
    if(!sample) return;
    if(lastCenterSample){
      const diff=sampleDifference(lastCenterSample,sample);
      const now=Date.now();
      const destination=$("route-destination")?$("route-destination").value:"";

      // A large center-screen change followed by a stable frame is treated as
      // a zone transition. This keeps OCR mostly idle during ordinary play,
      // while still catching the short-lived map title even when no route is set.
      if(diff>=0.32){
        centerTransitionPendingAt=now;
        centerTransitionStable=0;
      }else if(centerTransitionPendingAt&&now-centerTransitionPendingAt<=3500){
        if(diff<=0.08) centerTransitionStable++;
        else centerTransitionStable=0;
        if(centerTransitionStable>=2){
          centerTransitionPendingAt=0;
          centerTransitionStable=0;
          scheduleCenterMapOcrBurst();
        }
      }else if(centerTransitionPendingAt&&now-centerTransitionPendingAt>3500){
        centerTransitionPendingAt=0;
        centerTransitionStable=0;
      }

      // While navigation is active (or current map is still unknown), be a bit
      // more eager so a short title is not missed.
      if((destination||!routeCurrentMap)&&diff>=0.17) scheduleCenterMapOcrBurst();
    }
    lastCenterSample=sample;
  }

  function startLocalMapMonitor(){
    localMapActive=true;
    lastCenterSample=isLikelyXenGameFrame()?centerTitleSample():null;
    prepareLocalMapSignatures().then(function(){
      localExpandedMapMatchTick(true).then(function(ok){
        if(!ok) runExpandedMapTitleOcrSnapshot(true);
      });
    });
    if(localMapTimer) clearInterval(localMapTimer);
    localMapTimer=setInterval(localMapTick,450);
    renderRoutePlanner();
  }

  function stopLocalMapMonitor(){
    localMapActive=false;
    if(localMapTimer){clearInterval(localMapTimer);localMapTimer=null;}
    lastCenterSample=null;
    centerOcrBusy=false;
  }

  async function localMapRescan(){
    if(!stream){
      setStatus("route-status","先に画面共有を開始してください。");
      return;
    }
    if(!isLikelyXenGameFrame()){
      setStatus("route-status","共有映像にXen RebirthのゲームHUDを確認できません。ゲーム画面を表示してから再認識してください。ブラウザやデスクトップ画面は現在地判定から除外します。");
      return;
    }
    setStatus("route-status","ローカル再認識中… 登録済みマップ画像とマップ名OCRを確認しています。");
    const matched=await localExpandedMapMatchTick(true);
    if(matched){
      setStatus("route-status","登録済み拡大マップ画像とのローカル照合で現在地を認識しました。OpenAI APIは使用していません。");
      return;
    }
    const titleMatched=await runExpandedMapTitleOcrSnapshot(true);
    if(titleMatched) return;
    await runCenterMapOcrSnapshot();
    const best=lastLocalMapBest;
    setStatus("route-status",
      "ローカル再認識で確定できませんでした。"+
      (best?" 画像の最有力候補："+best.name+"（類似 "+Math.round((1-best.distance)*100)+"%）。":"")+
      " 拡大マップを開いた状態でもう一度押してください。"
    );
  }

  function unitSimilarity(a,b){
    const na=compactUnit(a),nb=compactUnit(b);
    if(!na||!nb) return 0;
    if(na===nb) return 1;
    if(na.includes(nb)||nb.includes(na)){
      const ratio=Math.min(na.length,nb.length)/Math.max(na.length,nb.length);
      if(Math.min(na.length,nb.length)>=12) return Math.max(ratio,bigramDice(a,b));
    }
    return bigramDice(a,b);
  }

  function unitsMatch(a,b){
    return unitSimilarity(a,b)>=0.72;
  }

  function overlapSequenceMatches(left,right,k){
    const scores=[];
    for(let i=0;i<k;i++) scores.push(unitSimilarity(left[left.length-k+i],right[i]));
    const avg=scores.reduce(function(sum,x){return sum+x;},0)/Math.max(1,scores.length);
    if(k===1) return avg>=0.72;
    if(k===2) return scores.every(function(x){return x>=0.62;})&&avg>=0.72;
    const strong=scores.filter(function(x){return x>=0.68;}).length;
    const veryStrong=scores.filter(function(x){return x>=0.84;}).length;
    return avg>=0.58&&strong>=Math.ceil(k*0.5)&&veryStrong>=1;
  }

  function collapseRepeatedDialogue(text){
    const value=String(text||"").replace(/\r/g,"").trim();
    if(!value) return "";
    const units=dialogueUnits(value);
    if(units.length<6) return value;

    let best=null;
    for(let split=3;split<=units.length-3;split++){
      const left=units.slice(0,split);
      const right=units.slice(split);
      const count=Math.min(left.length,right.length);
      if(count<3||count/Math.max(left.length,right.length)<0.7) continue;

      const scores=[];
      for(let i=0;i<count;i++) scores.push(unitSimilarity(left[i],right[i]));
      const avg=scores.reduce(function(sum,x){return sum+x;},0)/count;
      const strong=scores.filter(function(x){return x>=0.68;}).length;
      const veryStrong=scores.filter(function(x){return x>=0.84;}).length;
      if(avg<0.58||strong<Math.ceil(count*0.5)||veryStrong<1) continue;

      const score=avg+(strong/count)*0.25+(veryStrong/count)*0.15;
      if(!best||score>best.score) best={left:left,right:right,score:score};
    }

    if(!best) return value;
    const leftText=best.left.join("\n");
    const rightText=best.right.join("\n");
    return compactUnit(rightText).length>=compactUnit(leftText).length?rightText:leftText;
  }

  function mergeDialogueFragments(base,incoming){
    base=String(base||"").trim();
    incoming=String(incoming||"").trim();
    const baseUnits=dialogueUnits(base),incomingUnits=dialogueUnits(incoming);
    if(!base) return {text:incoming,overlap:!!incoming,changed:!!incoming,mode:"replace",overlapCount:0,baseUnitCount:0,incomingUnitCount:incomingUnits.length};
    if(!incoming) return {text:base,overlap:false,changed:false,mode:"none",overlapCount:0,baseUnitCount:baseUnits.length,incomingUnitCount:0};

    const aKey=compactUnit(base),bKey=compactUnit(incoming);
    if(aKey===bKey||aKey.includes(bKey)){
      return {text:base,overlap:true,changed:false,mode:"contained",overlapCount:incomingUnits.length,baseUnitCount:baseUnits.length,incomingUnitCount:incomingUnits.length};
    }
    if(bKey.includes(aKey)){
      return {text:incoming,overlap:true,changed:true,mode:"replace",overlapCount:baseUnits.length,baseUnitCount:baseUnits.length,incomingUnitCount:incomingUnits.length};
    }

    const a=baseUnits,b=incomingUnits;
    const max=Math.min(a.length,b.length);

    function acceptable(k,left,right){
      if(k>=2) return true;
      const x=left[left.length-1],y=right[0];
      return Math.max(compactUnit(x).length,compactUnit(y).length)>=55&&unitSimilarity(x,y)>=0.72;
    }

    for(let k=max;k>=1;k--){
      if(overlapSequenceMatches(a,b,k)&&acceptable(k,a,b)){
        if(k===b.length){
          return {text:base,overlap:true,changed:false,mode:"contained",overlapCount:k,baseUnitCount:a.length,incomingUnitCount:b.length};
        }
        return {
          text:a.concat(b.slice(k)).join("\n\n"),
          overlap:true,
          changed:true,
          mode:"append",
          overlapCount:k,
          baseUnitCount:a.length,
          incomingUnitCount:b.length
        };
      }
    }

    for(let k=max;k>=1;k--){
      if(overlapSequenceMatches(b,a,k)&&acceptable(k,b,a)){
        if(k===a.length){
          return {text:incoming,overlap:true,changed:true,mode:"replace",overlapCount:k,baseUnitCount:a.length,incomingUnitCount:b.length};
        }
        return {
          text:b.concat(a.slice(k)).join("\n\n"),
          overlap:true,
          changed:true,
          mode:"prepend",
          overlapCount:k,
          baseUnitCount:a.length,
          incomingUnitCount:b.length
        };
      }
    }

    return {text:base,overlap:false,changed:false,mode:"none",overlapCount:0,baseUnitCount:a.length,incomingUnitCount:b.length};
  }

  function mergeTranslatedFragments(existing,incoming,enMerge){
    existing=collapseRepeatedDialogue(existing);
    incoming=collapseRepeatedDialogue(incoming);
    if(!existing) return incoming;
    if(!incoming) return existing;

    if(enMerge&&enMerge.overlap&&!enMerge.changed&&enMerge.mode==="contained") return existing;

    const direct=mergeDialogueFragments(existing,incoming);
    if(direct.overlap) return collapseRepeatedDialogue(direct.text);

    if(enMerge&&enMerge.mode==="replace") return incoming;

    const jaUnits=dialogueUnits(incoming);
    const incomingCount=Math.max(1,Number(enMerge&&enMerge.incomingUnitCount)||0);
    const overlapCount=Math.max(0,Number(enMerge&&enMerge.overlapCount)||0);
    const newEnglishUnits=Math.max(0,incomingCount-overlapCount);

    if(enMerge&&newEnglishUnits>0&&jaUnits.length){
      const take=Math.max(1,Math.min(jaUnits.length,Math.round(jaUnits.length*newEnglishUnits/incomingCount)));
      if(enMerge.mode==="append"){
        const tail=jaUnits.slice(jaUnits.length-take).join("\n\n");
        const tailMerge=mergeDialogueFragments(existing,tail);
        return collapseRepeatedDialogue(tailMerge.overlap?tailMerge.text:[existing,tail].filter(Boolean).join("\n\n"));
      }
      if(enMerge.mode==="prepend"){
        const head=jaUnits.slice(0,take).join("\n\n");
        const headMerge=mergeDialogueFragments(head,existing);
        return collapseRepeatedDialogue(headMerge.overlap?headMerge.text:[head,existing].filter(Boolean).join("\n\n"));
      }
    }

    return existing;
  }

  function choiceSignature(value){
    return choicesArray(value).map(function(x){return compactUnit(x);}).join("|");
  }

  function sameDialogueContext(record,result){
    if(normText(record.npc_name)!==normText(result.npc_name)) return false;
    const rq=compactUnit(record.quest_name_en||"");
    const nq=compactUnit(result.quest_name_en||"");
    if(rq&&nq&&rq!==nq) return false;
    return choiceSignature(record.choices_en)===choiceSignature(result.choices_en);
  }

  function findLongDialogueMerge(result){
    const incoming=String(result.dialogue_text_en||result.english_text||"").trim();
    if(!incoming) return null;
    const candidates=records.filter(function(r){return sameDialogueContext(r,result);})
      .sort(function(a,b){return new Date(a.created_at||0)-new Date(b.created_at||0);});
    let best=null;
    candidates.forEach(function(record){
      const merged=mergeDialogueFragments(record.dialogue_text_en||record.english_text||"",incoming);
      if(!merged.overlap) return;
      const gain=compactUnit(merged.text).length-compactUnit(record.dialogue_text_en||record.english_text||"").length;
      const score=(gain>0?1000+gain:1);
      if(!best||score>best.score) best={record:record,merged:merged,score:score};
    });
    return best;
  }

  async function mergeLongDialogueRecord(match,result,imageHash){
    const record=match.record;
    const en=match.merged.text;
    const existingJa=String(record.dialogue_text_ja||record.japanese_text||"").trim();
    const incomingJa=String(result.dialogue_text_ja||result.japanese_text||"").trim();
    const ja=mergeTranslatedFragments(existingJa,incomingJa,match.merged);

    const choicesEn=choicesArray(result.choices_en).length?choicesArray(result.choices_en):choicesArray(record.choices_en);
    const choicesJa=choicesArray(result.choices_ja).length?choicesArray(result.choices_ja):choicesArray(record.choices_ja);
    const fullEn=[en].concat(choicesEn).filter(Boolean).join("\n\n");
    const fullJa=[ja].concat(choicesJa).filter(Boolean).join("\n\n");

    const res=await db.rpc("game_knowledge_merge_fragment",{
      p_record_id:record.id,
      p_map_name:String(result.map_name||record.map_name||""),
      p_dialogue_text_en:en,
      p_dialogue_text_ja:ja,
      p_english_text:fullEn,
      p_japanese_text:fullJa,
      p_notes:"スクロール式の長文会話を複数画面から自動統合。",
      p_confidence:Number.isFinite(Number(result.confidence))?Number(result.confidence):null,
      p_image_hash:imageHash||""
    });
    if(res.error) throw new Error("長文会話の統合に失敗しました："+res.error.message);

    rememberDialogueHistory(record.id);
    activeRecordId=record.id;
    activeNpcName=record.npc_name||String(result.npc_name||"").trim();
    $("knowledge-search").value=activeNpcName;
    if($("map-filter").value&&$("map-filter").value!==String(record.map_name||"")) $("map-filter").value="";
    if(result._client_image_hash&&!needsTranslation(result)) rememberFastScreen(result._client_image_hash,activeRecordId,activeNpcName);
    await loadRecords(true);
    const refreshed=records.find(function(r){return r.id===record.id;});
    if(refreshed){
      activeRecordId=refreshed.id;
      activeNpcName=refreshed.npc_name||activeNpcName;
      renderRecords();
    }
    await rememberKnownNpcSignature(result);
    setStatus("form-status","長い会話の続きとして統合保存しました。次回は全文を表示します。");
    return {saved:true,id:record.id,merged:true};
  }

  async function autoSaveAiResult(result,imageHash){
    result=cleanTranslations(result);

    const longMerge=findLongDialogueMerge(result);
    if(longMerge){
      return await mergeLongDialogueRecord(longMerge,result,imageHash);
    }

    const res=await db.rpc("game_knowledge_auto_save_v2",{
      p_map_name:String(result.map_name||""),
      p_npc_name:String(result.npc_name||""),
      p_quest_name_en:String(result.quest_name_en||""),
      p_quest_name_ja:String(result.quest_name_ja||""),
      p_english_text:String(result.english_text||""),
      p_japanese_text:String(result.japanese_text||""),
      p_dialogue_text_en:String(result.dialogue_text_en||result.english_text||""),
      p_dialogue_text_ja:String(result.dialogue_text_ja??result.japanese_text??""),
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
      const previousId=activeRecordId;
      rememberDialogueHistory(String(info.id||""));
      activeRecordId=String(info.id||"");
      activeNpcName=String(result.npc_name||"").trim();
      $("knowledge-search").value=activeNpcName;
      if($("map-filter").value&&$("map-filter").value!==String(result.map_name||"")) $("map-filter").value="";
      if(result._client_image_hash&&!needsTranslation(result)) rememberFastScreen(result._client_image_hash,activeRecordId,activeNpcName);
      setStatus("form-status",info.inserted?"AI解析結果を自動保存しました。現在の会話だけ表示します。":"同じ内容は登録済みのため更新のみ行いました。");
      await loadRecords(true);
      await rememberObservedDialogueTransition(previousId,records.find(function(r){return r.id===String(info.id||"");}));
      await rememberKnownNpcSignature(result);
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
      body:JSON.stringify({
        image:dataUrl,
        image_hash:hash,
        known_maps:gameMaps.map(function(m){return m.map_name;}).filter(Boolean).slice(0,40)
      })
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

  function npcMapMatchScore(detected,known){
    const nameScore=bigramDice(detected.name||"",known.npc_name||"");
    if(nameScore<0.76) return 0;
    const dx=Number(detected.x||0)-Number(known.x_norm||0);
    const dy=Number(detected.y||0)-Number(known.y_norm||0);
    const dist=Math.sqrt(dx*dx+dy*dy);
    let pos=0;
    if(dist<=70) pos=2.4;
    else if(dist<=120) pos=1.8;
    else if(dist<=180) pos=1.1;
    else if(dist<=260) pos=0.4;
    const sameNameMaps=new Set(
      mapNpcs.filter(function(x){return bigramDice(x.npc_name||"",known.npc_name||"")>=0.9;})
        .map(function(x){return x.map_id;})
    ).size;
    const uniqueWeight=sameNameMaps<=1?1.7:(sameNameMaps===2?1.3:1);
    return (nameScore*2.4+pos)*uniqueWeight;
  }

  function inferKnownMapFromNpcPattern(detected){
    if(!Array.isArray(detected)||detected.length<2||!gameMaps.length||!mapNpcs.length) return null;
    const results=gameMaps.map(function(map){
      const known=mapNpcs.filter(function(n){return n.map_id===map.id;});
      const used=new Set();
      let score=0,matches=0;
      detected.forEach(function(d){
        let best=null;
        known.forEach(function(k){
          if(used.has(k.id)) return;
          const s=npcMapMatchScore(d,k);
          if(s>0&&(!best||s>best.score)) best={row:k,score:s};
        });
        if(best&&best.score>=2.6){
          used.add(best.row.id);
          matches++;
          score+=best.score;
        }
      });
      return {map:map,matches:matches,score:score};
    }).sort(function(a,b){
      if(b.matches!==a.matches) return b.matches-a.matches;
      return b.score-a.score;
    });
    const best=results[0],second=results[1];
    if(!best||best.matches<2||best.score<6.2) return null;
    if(second&&second.matches===best.matches&&best.score-second.score<1.4) return null;
    return best;
  }

  async function saveDedicatedMapAnalysis(pack){
    if(!pack||!pack.data||!pack.data.map_visible) return false;
    const result=pack.data;
    let mapName=String(result.map_name||"").trim();
    const confidence=Number(result.confidence||0);
    const sourceRegion=validMapRegion(result.panel_region)?result.panel_region:{x:420,y:0,width:580,height:760};
    const savedRegion=canonicalMapRegion(sourceRegion);
    const rawNpcs=Array.isArray(result.npcs)?result.npcs.filter(function(n){
      return n&&String(n.name||"").trim()&&Number(n.confidence||0)>=70;
    }):[];
    const npcs=rawNpcs.map(function(n){return remapNpcToSavedRegion(n,sourceRegion,savedRegion);});

    const existingByName=gameMaps.find(function(m){return normText(m.map_name)===normText(mapName);});
    const inferred=inferKnownMapFromNpcPattern(npcs);
    let inferredByPattern=false;
    if(inferred&&(!existingByName||normText(existingByName.map_name)!==normText(inferred.map.map_name))){
      mapName=inferred.map.map_name;
      inferredByPattern=true;
    }

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
    setStatus(
      "map-collect-status",
      (inferredByPattern?"NPC配置から "+mapName+" と補完しました。":"")+
      mapName+" の拡大マップを保存：NPC "+npcs.length+"件 / 新規観測 "+(info.new_sightings||0)+"件"
    );
    await loadMapData();
    return true;
  }

  function portraitFallbackRegion(result){
    const r=result&&result.npc_portrait_region;
    if(!r) return null;
    const x=Number(r.x),y=Number(r.y),width=Number(r.width),height=Number(r.height);
    if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=20||height<=20||x+width>1000||y+height>1000) return null;
    // An estimated slice of the dialogue window can permanently store scenery.
    // Only persist an explicitly detected, bounded portrait rectangle.
    return {x:x,y:y,width:width,height:height};
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
    const analysisStartedAt=Date.now();
    const button=$("ai-run");
    button.disabled=true;
    try{
      if(stream){
        if(!isLikelyXenGameFrame()){
          if(source==="auto"){
            setAutoStatus("watching","ゲーム画面待機");
            setStatus("capture-status","共有モニター上でXen Rebirthが前面に戻るまで自動解析を待機します。APIは使用していません。");
            return;
          }
          throw new Error("共有映像にXen Rebirthのゲーム画面を確認できません。ゲームを前面に表示してから解析してください。APIは使用していません。");
        }
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
        showSavedDialogueMatch({record:instant});
        setStatus("capture-status","保存済みの翻訳を即時表示しました。AI解析は使用していません。");
        setStatus("form-status",needsTranslation(instant)?"未翻訳の項目を補完中（画像AI解析なし）":"保存済みデータを表示中（API使用なし）");
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
      if(source==="auto"&&lastFastNpcAt>analysisStartedAt){
        setStatus("capture-status","保存済みNPCを高速表示済みのため、古いAI解析結果の画面反映を省略しました。");
        return;
      }
      data=await repairTranslations(data);
      if(source==="auto"&&lastFastNpcAt>analysisStartedAt) return;
      await applyAiResult(data);

      if(data.screen_type==="npc_dialog"){
        await autoSaveAiResult(data,imageHash);
        await autoSaveNpcPortrait(data);
      }else if(data.screen_type==="quest_window"||data.screen_type==="reward_window"){
        await autoSaveAiResult(data,imageHash);
      }

      let dedicatedMapSaved=false;
      if(data.screen_type==="expanded_map"&&isLikelyXenGameFrame()){
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
    const f=$("capture-form").elements;
    $("translate-run").disabled=true;
    try{
      const result=await repairTranslations({
        dialogue_text_en:f.dialogue_text_en.value||f.english_text.value,
        dialogue_text_ja:f.dialogue_text_ja.value,
        choices_en:choicesArray(f.choices_en.value),
        choices_ja:choicesArray(f.choices_ja.value)
      },true);
      f.dialogue_text_ja.value=result.dialogue_text_ja;
      f.choices_ja.value=result.choices_ja.join("\n");
      f.japanese_text.value=result.japanese_text;
      setStatus("capture-status",needsTranslation(result)
        ?"未翻訳の項目が残っています。対応ブラウザで再試行するか、日本語訳を入力してください。"
        :"会話と選択肢の日本語訳を確認しました。ゲーム用語・固有名詞を確認してください。");
    }catch(err){setStatus("capture-status",err.message);}
    finally{$("translate-run").disabled=false;}
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
      const repaired=await repairTranslations({
        dialogue_text_en:dialogEn,
        dialogue_text_ja:String(fd.get("dialogue_text_ja")||""),
        choices_en:choicesArray(fd.get("choices_en")||""),
        choices_ja:choicesArray(fd.get("choices_ja")||"")
      },true);
      const dialogJa=repaired.dialogue_text_ja;
      const choiceEn=repaired.choices_en;
      const choiceJa=repaired.choices_ja;
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
    const mapSelect=$("map-db-select");
    if(mapSelect&&routeCurrentMap){
      const currentMatch=gameMaps.find(function(m){return canonicalRouteMapName(m.map_name)===routeCurrentMap;});
      if(currentMatch) mapSelect.value=currentMatch.id;
    }
    renderMapDatabase();
    refreshRouteDestinationOptions();
    prepareLocalMapSignatures();
  }

  function routeDirectionPoint(direction){
    const points={
      top:{x:500,y:70},
      right:{x:930,y:500},
      bottom:{x:500,y:930},
      left:{x:70,y:500}
    };
    return points[direction]||{x:500,y:500};
  }

  function renderRouteExitArrow(){
    const canvas=$("map-db-canvas");
    const select=$("map-db-select");
    if(!canvas||!select) return;
    canvas.querySelectorAll(".route-exit-arrow").forEach(function(el){el.remove();});
    if(!currentRoutePlan||currentRoutePlan.path.length<2||!routeCurrentMap) return;

    const shown=gameMaps.find(function(m){return m.id===select.value;});
    if(!shown||canonicalRouteMapName(shown.map_name)!==routeCurrentMap) return;

    const next=currentRoutePlan.path[1];
    const edge=currentRoutePlan.edges[0]||null;
    const rows=mapNpcs.filter(function(n){return n.map_id===shown.id;});
    let hints=[next];
    let direction="";
    if(edge){
      if(edge.a===routeCurrentMap){
        hints=hints.concat(Array.isArray(edge.exitA)?edge.exitA:[]);
        direction=edge.dirA||"";
      }else if(edge.b===routeCurrentMap){
        hints=hints.concat(Array.isArray(edge.exitB)?edge.exitB:[]);
        direction=edge.dirB||"";
      }
    }

    let best=null;
    rows.forEach(function(row){
      hints.forEach(function(hint){
        const score=Math.max(
          mapKey(row.npc_name)===mapKey(hint)?1:0,
          bigramDice(row.npc_name||"",hint||"")
        );
        if(!best||score>best.score) best={row:row,score:score};
      });
    });

    let x,y,exact=false;
    if(best&&best.score>=0.67){
      x=Math.max(0,Math.min(1000,Number(best.row.x_norm)||0));
      y=Math.max(0,Math.min(1000,Number(best.row.y_norm)||0));
      exact=true;
    }else{
      const point=routeDirectionPoint(direction);
      x=point.x;y=point.y;
    }

    const angle=Math.atan2(y-500,x-500)*180/Math.PI;
    const left=x/10,top=y/10;
    const arrow=document.createElement("div");
    arrow.className="route-exit-arrow"+(exact?" is-exact":" is-direction");
    arrow.style.left=left+"%";
    arrow.style.top=top+"%";
    arrow.innerHTML='<span class="route-exit-arrow-icon" style="transform:rotate('+angle+'deg)">➜</span>'+
      '<strong>次：'+esc(next)+'</strong>'+
      (exact?'<small>出口候補を検出</small>':'<small>進行方向の目安</small>');
    canvas.appendChild(arrow);
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
    renderRouteExitArrow();

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
    const dialogueEn=String(r.dialogue_text_en??r.english_text??"");
    const clean=cleanTranslations(r);
    const dialogueJa=clean.dialogue_text_ja;
    repairDisplayedRecord(r,cardKey);
    const choicesEn=choicesArray(r.choices_en);
    const choicesJa=clean.choices_ja;
    const count=Math.max(choicesEn.length,choicesJa.length);
    const choiceRows=[];
    for(let i=0;i<count;i++){
      const transition=transitionFor(r.id,i);
      const inner=
        '<span class="game-choice-mark">✦</span><div>'+
        (choicesEn[i]?'<div class="choice-en">'+esc(choicesEn[i])+'</div>':"")+
        (choicesJa[i]?'<div class="choice-ja">'+esc(choicesJa[i])+'</div>':'<div class="choice-ja">未翻訳</div>')+
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
        ((stack.length||dialogueHistory.length)?'<button type="button" class="dialogue-back" data-dialogue-back="1">← 1つ前の会話へ</button>':"")+
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
            (dialogueJa?'<div class="dialog-ja">'+esc(dialogueJa)+'</div>':(dialogueEn?'<div class="dialog-ja">未翻訳</div>':""))+
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
    $("npc-index-count").textContent=npcs.length+" NPC";
    $("npc-index").innerHTML=npcs.map(function(n){
      return '<button type="button" data-npc="'+esc(n)+'">'+esc(n)+' <small>('+counts[n]+')</small></button>';
    }).join("");
    applyNpcIndexState();
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

  function npcIndexExpanded(){
    try{return localStorage.getItem(NPC_INDEX_EXPANDED_KEY)==="1";}catch(_){return false;}
  }

  function applyNpcIndexState(){
    const index=$("npc-index");
    const button=$("npc-index-toggle");
    if(!index||!button) return;
    const expanded=npcIndexExpanded();
    index.classList.toggle("is-collapsed",!expanded);
    index.classList.toggle("is-expanded",expanded);
    button.setAttribute("aria-expanded",expanded?"true":"false");
    button.textContent=expanded?"一覧を閉じる ▲":"一覧を開く ▼";
  }

  function toggleNpcIndex(){
    const next=!npcIndexExpanded();
    try{localStorage.setItem(NPC_INDEX_EXPANDED_KEY,next?"1":"0");}catch(_){}
    applyNpcIndexState();
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
    dialogueHistory.push(currentId);
    if(dialogueHistory.length>40) dialogueHistory.shift();
    activeRecordId=target.id;
    activeNpcName=target.npc_name||activeNpcName;
    card.outerHTML=renderDialogueCard(target,cardKey);
  }

  function goDialogueBack(button){
    const card=button.closest(".game-dialog-card");
    if(!card) return;
    const cardKey=card.dataset.cardKey||card.dataset.recordId;
    const stack=dialogueNavStacks.get(cardKey)||[];
    let previousId=stack.pop();
    dialogueNavStacks.set(cardKey,stack);
    if(previousId&&dialogueHistory[dialogueHistory.length-1]===previousId) dialogueHistory.pop();
    if(!previousId) previousId=dialogueHistory.pop();
    const previous=records.find(function(r){return r.id===previousId;});
    if(previous){
      activeRecordId=previous.id;
      activeNpcName=previous.npc_name||activeNpcName;
      card.outerHTML=renderDialogueCard(previous,cardKey);
    }
  }

  $("route-destination").addEventListener("input",function(){
    renderRoutePlanner();
  });
  $("route-destination").addEventListener("change",function(){
    const canonical=canonicalRouteMapName(this.value);
    if((routeData().nodes||[]).includes(canonical)) this.value=canonical;
    try{localStorage.setItem(ROUTE_DESTINATION_KEY,this.value||"");}catch(_){}
    renderRoutePlanner();
    if(this.value&&stream) scheduleCenterMapOcrBurst();
  });
  $("route-level").addEventListener("input",renderRoutePlanner);
  $("route-current-manual").addEventListener("change",function(){
    if(this.value) setLocalCurrentMap(this.value,"手動補正",100,true);
    else{
      routeCurrentMap="";
      routeCurrentSource="";
      routeCurrentConfidence=0;
      saveLocalMapState();
      renderRoutePlanner();
      if(stream) localMapRescan();
    }
  });
  $("route-rescan").addEventListener("click",localMapRescan);
  $("route-clear").addEventListener("click",function(){
    $("route-destination").value="";
    try{localStorage.removeItem(ROUTE_DESTINATION_KEY);}catch(_){}
    renderRoutePlanner();
  });

  $("capture-mini-now").addEventListener("click",function(){runOpenAiAnalysis("manual");});
  $("capture-mini-top").addEventListener("click",function(){
    $("capture-source-section").scrollIntoView({behavior:"smooth",block:"start"});
  });
  syncMiniCaptureStatus();
  loadLocalMapState();
  refreshRouteDestinationOptions();

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
  $("screen-retry").addEventListener("click",function(){
    stopScreen();
    setStatus("capture-status","共有先を選び直します。「画面全体」を選ぶ方法を推奨します。");
    setTimeout(startScreen,250);
  });
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
  $("npc-index-toggle").addEventListener("click",toggleNpcIndex);
  applyNpcIndexState();

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

