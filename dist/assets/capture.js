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
  let quests=[];
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

  function normText(value){
    return String(value||"").trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/g," ");
  }

  async function applyAiResult(result){
    const f=$("capture-form").elements;
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
    f.english_text.value=result.english_text||"";
    f.japanese_text.value=result.japanese_text||"";
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
    const res=await db.rpc("game_knowledge_auto_save",{
      p_map_name:String(result.map_name||""),
      p_npc_name:String(result.npc_name||""),
      p_quest_name_en:String(result.quest_name_en||""),
      p_quest_name_ja:String(result.quest_name_ja||""),
      p_english_text:String(result.english_text||""),
      p_japanese_text:String(result.japanese_text||""),
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
      setStatus("form-status",info.inserted?"AI解析結果を自動保存しました。":"同じ内容は登録済みのため更新のみ行いました。");
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
      if(!response.ok) throw new Error(data.error||("AI解析に失敗しました（HTTP "+response.status+"）"));
      await applyAiResult(data);
      await autoSaveAiResult(data,imageHash);
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
    const text=$("english-text").value.trim();
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
      $("japanese-text").value=translated||"";
      setStatus("capture-status","翻訳しました。ゲーム用語・固有名詞を確認してから登録してください。");
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
      const args={
        p_map_name:String(fd.get("map_name")||""),
        p_npc_name:String(fd.get("npc_name")||""),
        p_quest_name_en:String(fd.get("quest_name_en")||""),
        p_quest_name_ja:String(fd.get("quest_name_ja")||""),
        p_english_text:String(fd.get("english_text")||""),
        p_japanese_text:String(fd.get("japanese_text")||""),
        p_required_level:level===""?null:Number(level),
        p_requirements:String(fd.get("requirements")||""),
        p_targets:String(fd.get("targets")||""),
        p_rewards:String(fd.get("rewards")||""),
        p_notes:String(fd.get("notes")||""),
        p_ocr_text:String(fd.get("english_text")||""),
        p_source_image_url:imageUrl,
        p_source_type:imageBlob?imageSourceType:"manual",
        p_contributor_id:contributorId,
        p_quest_id:String(fd.get("quest_id")||"")||null,
        p_quest_step_id:String(fd.get("quest_step_id")||"")||null
      };
      const res=await db.rpc("game_knowledge_save",args);
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
    setStatus("form-status","");
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
      btn.addEventListener("click",function(){$("knowledge-search").value=btn.dataset.npc;renderRecords();});
    });
  }

  function renderRecords(){
    const word=$("knowledge-search").value.trim().toLowerCase();
    const map=$("map-filter").value;
    const rows=records.filter(function(r){
      const hay=[r.npc_name,r.map_name,r.quest_name_en,r.quest_name_ja,r.english_text,r.japanese_text,r.requirements,r.targets,r.rewards,r.notes].join(" ").toLowerCase();
      return (!word||hay.includes(word))&&(!map||r.map_name===map);
    });
    $("record-count").textContent=rows.length+"件";
    if(!rows.length){
      $("knowledge-results").innerHTML='<div class="notice">該当する登録情報はありません。</div>';
      return;
    }
    $("knowledge-results").innerHTML=rows.map(function(r){
      const quest=[r.quest_name_ja,r.quest_name_en].filter(Boolean).join(" / ");
      const extra=[
        r.requirements?'<div><strong>必要アイテム</strong><br>'+esc(r.requirements)+'</div>':"",
        r.targets?'<div><strong>討伐対象</strong><br>'+esc(r.targets)+'</div>':"",
        r.rewards?'<div><strong>報酬</strong><br>'+esc(r.rewards)+'</div>':""
      ].join("");
      return '<article class="knowledge-card">'+
        '<h3>'+esc(r.npc_name)+'</h3>'+
        '<div class="knowledge-meta">'+
          (r.map_name?'<span>MAP：'+esc(r.map_name)+'</span>':"")+
          (r.required_level!=null?'<span>Lv '+esc(r.required_level)+'</span>':"")+
          (quest?'<span>'+esc(quest)+'</span>':"")+
        '</div>'+
        '<div class="knowledge-pair">'+
          '<div><strong>English</strong><div class="knowledge-text">'+esc(r.english_text||"英文未登録")+'</div></div>'+
          '<div><strong>日本語訳</strong><div class="knowledge-text">'+esc(r.japanese_text||"翻訳未登録")+'</div></div>'+
        '</div>'+
        (extra?'<div class="knowledge-extra">'+extra+'</div>':"")+
        (r.notes?'<p><strong>メモ：</strong>'+esc(r.notes)+'</p>':"")+
        (r.source_image_url?'<a class="knowledge-image" href="'+esc(r.source_image_url)+'" target="_blank" rel="noopener noreferrer">登録時のゲーム画面を見る ↗</a>':"")+
        (r.quest_id?'<p><a href="quests.html#'+esc(r.quest_id)+'">既存クエストページを開く →</a></p>':"")+
      '</article>';
    }).join("");
  }

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

  $("screen-start").addEventListener("click",startScreen);
  $("screen-stop").addEventListener("click",stopScreen);
  $("screen-shot").addEventListener("click",captureFrame);
  $("image-file").addEventListener("change",function(e){handleFile(e.target.files&&e.target.files[0]);});
  $("ocr-run").addEventListener("click",runOcr);
  $("translate-run").addEventListener("click",translateEnglish);
  $("english-text").addEventListener("input",function(){$("translate-run").disabled=!this.value.trim();});
  $("capture-form").addEventListener("submit",saveRecord);
  $("form-clear").addEventListener("click",clearForm);
  $("quest-link").addEventListener("change",changeQuest);
  $("knowledge-search").addEventListener("input",renderRecords);
  $("map-filter").addEventListener("change",renderRecords);
  $("knowledge-reload").addEventListener("click",loadRecords);
  document.addEventListener("paste",function(e){
    const items=Array.from(e.clipboardData&&e.clipboardData.items||[]);
    const item=items.find(function(x){return x.type&&x.type.startsWith("image/");});
    if(item){e.preventDefault();handleFile(item.getAsFile());}
  });
  window.addEventListener("beforeunload",stopScreen);

  Promise.all([loadQuests(),loadRecords()]).catch(function(err){setStatus("capture-status",err.message);});
})();
