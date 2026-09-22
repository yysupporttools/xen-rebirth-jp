"use strict";
(async () => {
  const $=id=>document.getElementById(id), core=window.SiteSearchCore;
  const input=$('site-search-query'), filter=$('site-search-kind'), results=$('site-search-results');
  if (!input || !core) return;
  const labels={guide:'ガイド・ページ',class:'職業・転職',skill:'スキル',glossary:'用語集',lucky:'ラッキーボール',quest:'クエスト',board:'質問掲示板',event:'イベント'};
  let records=[], ready=false, liveLoading=true, limit=20, failed=[], timer;
  const text=(obj,fields)=>fields.map(k=>obj[k]).filter(v=>v!==null&&v!==undefined).map(v=>Array.isArray(v)?v.join(' '):String(v)).join(' ');
  const title=obj=>[obj.name_ja||obj.title_ja,obj.name_en||obj.title_en].filter(Boolean).join(' / ');
  const eventDate=value=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric'}).format(date);
  };
  const record=(key,title,text,url,kind,page)=>({key,title,text,url,kind,page});
  function syncUrl() {
    const url=new URL(location.href);
    if(input.value.trim())url.searchParams.set('q',input.value.trim());else url.searchParams.delete('q');
    if(filter.value!=='all')url.searchParams.set('type',filter.value);else url.searchParams.delete('type');
    history.replaceState(null,'',url);
  }
  function restore() {
    const params=new URL(location.href).searchParams;
    input.value=(params.get('q')||'').slice(0,120);
    filter.value=Object.hasOwn(labels,params.get('type'))?params.get('type'):'all';
  }
  function render() {
    results.replaceChildren();
    $('site-search-more').hidden=true;
    if(!input.value.trim()){
      $('site-search-count').textContent='キーワードを入力してください。';
      $('site-search-empty').hidden=true;
      return;
    }
    if(!ready){$('site-search-count').textContent='検索データを読み込んでいます…';return;}
    const found=core.search(records,input.value,filter.value);
    if(!found.length && liveLoading){
      $('site-search-count').textContent='最新の公開情報を検索しています…';
      $('site-search-empty').hidden=true;
      return;
    }
    $('site-search-count').textContent=`${found.length}件見つかりました${found.length>limit?`（${limit}件表示中）`:''}`;
    $('site-search-empty').hidden=found.length>0;
    for(const item of found.slice(0,limit)){
      const article=document.createElement('article');article.className='site-search-result';
      const meta=document.createElement('p');meta.className='site-search-meta';meta.textContent=`${labels[item.kind]||'ページ'} · ${item.page}`;
      const heading=document.createElement('h2'),link=document.createElement('a');link.href=item.url;link.textContent=item.title;heading.append(link);
      const excerpt=document.createElement('p');excerpt.textContent=core.snippet(item.text,input.value);
      article.append(meta,heading,excerpt);results.append(article);
    }
    $('site-search-more').hidden=found.length<=limit;
  }
  function updateStatus(){
    $('site-search-status').textContent=failed.length?`${failed.join('・')}の最新データを取得できませんでした。読み込めた情報で検索しています。再読み込みすると再取得します。`:'ガイド・スキルと、公開中の用語・クエスト・掲示板・イベントを検索できます。';
  }
  $('site-search-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);limit=20;syncUrl();render();});
  input.addEventListener('input',event=>{if(event.isComposing)return;clearTimeout(timer);timer=setTimeout(()=>{limit=20;syncUrl();render();},220);});
  input.addEventListener('compositionend',()=>{clearTimeout(timer);limit=20;syncUrl();render();});
  filter.addEventListener('change',()=>{limit=20;syncUrl();render();});
  $('site-search-more').addEventListener('click',()=>{const previous=limit;limit+=20;render();results.children[previous]?.querySelector('a')?.focus();});
  $('site-search-clear').addEventListener('click',()=>{input.value='';filter.value='all';limit=20;syncUrl();render();input.focus();});
  window.addEventListener('popstate',()=>{restore();limit=20;render();});
  restore();render();
  try {
    const response=await fetch('assets/site-search-index.json',{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('snapshot');
    const data=await response.json();if(!Array.isArray(data.records))throw Error('snapshot');
    records=core.prepare(data.records);
  }catch{failed.push('ガイド・スキル');}
  ready=true;render();
  $('site-search-status').textContent='公開中の用語・クエストなどを更新しています…';
  const cfg=window.XEN_GLOSSARY_CONFIG||{};
  async function rows(table,fields,extra={}) {
    if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)throw Error('config');
    const out=[];
    for(let offset=0;offset<10000;offset+=500){
      const params=new URLSearchParams({select:fields,order:'id.asc',limit:'500',offset:String(offset),...extra});
      const headers={apikey:cfg.SUPABASE_ANON_KEY};
      if(!cfg.SUPABASE_ANON_KEY.startsWith('sb_publishable_'))headers.Authorization='Bearer '+cfg.SUPABASE_ANON_KEY;
      const response=await fetch(`${cfg.SUPABASE_URL}/rest/v1/${table}?${params}`,{headers,signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error(table);
      const batch=await response.json();if(!Array.isArray(batch))throw Error(table);
      out.push(...batch);if(batch.length<500)return out;
    }
    throw Error('too many records');
  }
  const jobs=[
    ['用語集','glossary',async()=> {
      const [shared, reference] = await Promise.allSettled([
        rows('glossary_terms','id,slug,name_en,name_ja,aliases,description,drop_location,acquisition,related_entity,notes,required_level'),
        fetch('assets/reference-catalog.json?v=20260922').then(r=>{if(!r.ok)throw Error('reference');return r.json();})
      ]);
      if(shared.status==='rejected') failed.push('用語集の共同編集');
      if(reference.status==='rejected') failed.push('作成・ペット資料');
      const list=shared.status==='fulfilled'?shared.value:[];
      for(const t of reference.status==='fulfilled'?reference.value.terms:[]) {
        if(!list.some(x=>x.slug===t.slug)) list.push(t);
      }
      return list.map(t=>record('term:'+t.slug,title(t),text(t,['aliases','description','drop_location','acquisition','related_entity','notes','required_level']),'glossary.html#'+encodeURIComponent(t.slug),'glossary','用語集'));
    }],
    ['ラッキーボール','lucky',async()=>{
      const [groups,items]=await Promise.all([rows('lucky_ball_groups','id,slug,name_en,name_ja,description'),rows('lucky_ball_items','id,group_id,name_en,name_ja,stats,stats_en,description')]);
      const found=[];
      for(const g of groups){
        const url='glossary.html#lucky-ball-'+encodeURIComponent(g.slug),name=title(g);
        found.push(record('ball:'+g.slug,name,g.description+' ラッキーボール Lucky Ball',url,'lucky','ラッキーボール'));
        for(const i of items.filter(i=>String(i.group_id)===String(g.id)))found.push(record('item:'+i.id,title(i),name+' '+text(i,['stats','stats_en','description']),url,'lucky',name));
      }return found;
    }],
    ['クエスト','quest',async()=>{
      const [quests,steps]=await Promise.all([rows('quests','id,title_en,title_ja,category,required_level,start_npc,start_location,prerequisite,rewards,notes'),rows('quest_steps','id,quest_id,title,description,npc_name,location')]);
      return quests.map(q=>record('quest:'+q.id,title(q),text(q,['category','required_level','start_npc','start_location','prerequisite','rewards','notes'])+' '+steps.filter(s=>String(s.quest_id)===String(q.id)).map(s=>text(s,['title','description','npc_name','location'])).join(' '),'quests.html#'+encodeURIComponent(q.id),'quest','クエスト'));
    }],
    ['質問掲示板','board',async()=>{
      const [threads,answers]=await Promise.all([rows('board_threads','id,title,body,status',{status:'in.(open,resolved,closed)'}),rows('board_answers','id,thread_id,body')]);
      return threads.map(t=>record('board:'+t.id,t.title,t.body+' '+answers.filter(a=>String(a.thread_id)===String(t.id)).map(a=>a.body).join(' '),'board.html#'+encodeURIComponent(t.id),'board','質問掲示板'));
    }],
    ['イベント','event',async()=> (await rows('xen_events','id,title_ja,title_en,description_ja,requirements_ja,rewards_ja,location,start_time')).map(t=>record('event:'+t.id,title(t),eventDate(t.start_time)+' '+text(t,['location','description_ja','requirements_ja','rewards_ja']),'events.html?event='+encodeURIComponent(t.id),'event','イベントカレンダー'))]
  ];
  await Promise.all(jobs.map(async([label,kind,load])=>{
    try{const data=await load();records=records.filter(r=>r.kind!==kind).concat(core.prepare(data));}
    catch{failed.push(label);}
  }));
  liveLoading=false;render();updateStatus();
})();
