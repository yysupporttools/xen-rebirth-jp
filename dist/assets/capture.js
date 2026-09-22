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
  const contributorId=(function(){
    const key="xen-game-knowledge-contributor";
    let value=localStorage.getItem(key);
    if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}
    return value;
  })();

  function setStatus(id,msg){$(id).textContent=msg||"";}
  function setImage(blob,type){
    imageBlob=blob;
    imageSourceType=type||"image_upload";
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(blob);
    $("capture-preview").src=previewUrl;
    $("capture-preview").hidden=false;
    $("preview-empty").hidden=true;
    $("ocr-run").disabled=false;
    $("translate-run").disabled=!$("english-text").value.trim();
    setStatus("capture-status","画像を取り込みました。必要ならOCRを実行してください。");
  }

  async function startScreen(){
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:5,max:15}},audio:false});
      $("screen-video").srcObject=stream;
      $("screen-shot").disabled=false;
      $("screen-stop").disabled=false;
      $("screen-start").disabled=true;
      const track=stream.getVideoTracks()[0];
      if(track) track.addEventListener("ended",stopScreen);
      setStatus("capture-status","共有中です。NPC会話やクエスト画面を表示して「現在の画面をキャプチャ」を押してください。");
    }catch(err){
      setStatus("capture-status",err.name==="NotAllowedError"?"画面共有はキャンセルされました。":"画面共有を開始できませんでした："+err.message);
    }
  }

  function stopScreen(){
    if(stream) stream.getTracks().forEach(function(t){t.stop();});
    stream=null;
    $("screen-video").srcObject=null;
    $("screen-shot").disabled=true;
    $("screen-stop").disabled=true;
    $("screen-start").disabled=false;
  }

  async function captureFrame(){
    const video=$("screen-video");
    if(!video.videoWidth){setStatus("capture-status","共有画面がまだ準備できていません。");return;}
    const maxWidth=1600;
    const scale=Math.min(1,maxWidth/video.videoWidth);
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(video.videoWidth*scale);
    canvas.height=Math.round(video.videoHeight*scale);
    canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(function(resolve){canvas.toBlob(resolve,"image/webp",0.82);});
    if(blob) setImage(blob,"screen_capture");
  }

  function handleFile(file){
    if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)){setStatus("capture-status","PNG / JPEG / WebP画像を選択してください。");return;}
    setImage(file,"image_upload");
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

  async function loadRecords(){
    setStatus("capture-status","登録済みデータを読み込み中…");
    const res=await db.from("game_knowledge").select("*").order("created_at",{ascending:false}).limit(1000);
    if(res.error){
      $("knowledge-results").innerHTML='<p class="notice">データを読み込めませんでした：'+esc(res.error.message)+'</p>';
      return;
    }
    records=res.data||[];
    buildFilters();
    renderRecords();
    setStatus("capture-status","");
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
