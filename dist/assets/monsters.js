(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const http = value => {try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');if(u.protocol!=='https:'||u.username||u.password||host.includes(':')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return '';const p=host.split('.').map(Number);if(p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(p[0]===0||p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)))return '';return u.href;}catch{return '';}};
  const fold = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'');
  const decode = value => {try{return decodeURIComponent(value);}catch{return '';}};
  let data = {monsters:[], regions:[], references:[]}, visible = [], limit = 60, lastButton = null;
  const additions = new Map();
  const originalValues = new Map();
  const scopeLabels = {excludes_hard_hitters:'通常個体向け（強打個体を除外）',excludes_listed_hard_hitters:'通常個体向け（記載の強打個体を除外）',includes_hard_hitters:'マップ全体（強打個体を含む）',full_map:'マップ全体',monster:'個体参考',unknown:'条件未確認'};
  const refs = monster => (monster.defRefs || []).map(i => data.references[i]).filter(Boolean);
  const num = id => $(id).value.trim() === '' ? null : Number($(id).value);
  const levelLabel = monster => monster.level != null ? 'Lv ' + esc(monster.level) + (monster.levelPost?'（投稿情報）':'') : 'Lv未確認';
  const levelRange = monster => typeof monster.level === 'number' ? [monster.level,monster.level] : /^\d+\+$/.test(monster.level || '') ? [parseInt(monster.level,10),Infinity] : null;
  const extra = monster => additions.get(monster.id) || [];
  function filterDef(monster) {
    const all=refs(monster).filter(r=>r.maxDef!=null || r.minDef!=null);
    const individual=all.filter(r=>r.type==='monster');
    if(individual.length)return Math.max(...individual.map(r=>r.maxDef??r.minDef));
    const full=$('dex-def-mode').value==='full';
    let candidates=all.filter(r=>full ? ['includes_hard_hitters','full_map'].includes(r.scope) : ['excludes_hard_hitters','excludes_listed_hard_hitters'].includes(r.scope));
    if(!candidates.length)candidates=all.filter(r=>r.scope==='unknown');
    return candidates.length ? Math.max(...candidates.map(r=>r.maxDef??r.minDef)) : null;
  }
  function dropNames(monster) {
    const official = (monster.drops || []).map(d => d.name);
    const contributed = extra(monster).filter(r=>r.details?.publication_mode!=='immediate').map(r => r.details?.drop_items).filter(Boolean);
    return [...official,...contributed];
  }
  function defSummary(monster) {
    const known = refs(monster).filter(r => r.minDef != null);
    if (!known.length) return '未登録';
    const individual = known.filter(r => r.type === 'monster');
    if (individual.length) return '個体参考 ' + [...new Set(individual.map(r => r.defDisplay))].join(' / ');
    const regular = known.filter(r => r.scope === 'excludes_hard_hitters' || r.scope === 'excludes_listed_hard_hitters');
    const full = known.filter(r => r.scope === 'includes_hard_hitters' || r.scope === 'full_map');
    const rest = known.filter(r => !regular.includes(r) && !full.includes(r) && ![...regular,...full].some(x=>x.defDisplay===r.defDisplay));
    const line = (rows,label) => rows.length ? label + ' ' + [...new Set(rows.map(r => r.defDisplay))].join(' / ') : '';
    return [line(regular,'通常'),line(full,'強打込み'),line(rest,'マップ参考')].filter(Boolean).join(' ／ ');
  }
  function image(monster,detail=false) {
    const url=http(monster.imageUrl);
    return url ? '<img src="'+esc(url)+'" alt="'+esc(monster.name)+'のゲーム内画像" '+(detail?'':'loading="lazy" ')+'decoding="async" referrerpolicy="no-referrer">' : '<span class="dex-image-missing">ゲーム内画像<br>未登録</span>';
  }
  function wireImages(container) {
    container.querySelectorAll('img').forEach(img => img.addEventListener('error',() => {const p=document.createElement('span');p.className='dex-image-missing';p.textContent='画像を取得できません。詳細の出典リンクからご確認ください。';img.replaceWith(p);},{once:true}));
  }
  function card(monster) {
    const drops=dropNames(monster),summary=drops.length?drops.slice(0,3).join('、')+(drops.length>3?' ほか':''):monster.rewards?.length?'未登録／討伐報酬：'+monster.rewards.map(r=>r.name).join('、'):'未登録';
    return '<article class="dex-card"><div class="dex-card-image">'+image(monster)+'</div><h3>'+esc(monster.name)+'</h3><div><span class="dex-level">'+levelLabel(monster)+'</span></div><span class="dex-source-label">'+esc(monster.region)+' / '+esc(monster.map || monster.area || 'マップ未登録')+'</span><dl><dt>アイテムドロップ</dt><dd>'+esc(summary)+'</dd><dt>必要DEF（参考）</dt><dd>'+esc(defSummary(monster))+'</dd></dl><button type="button" data-monster="'+esc(monster.id)+'" aria-label="'+esc(monster.name)+'の詳細・情報追記">詳細・情報を追記'+(extra(monster).length?'（投稿 '+extra(monster).length+'）':'')+'</button></article>';
  }
  function render() {
    const shown=visible.slice(0,limit),html=[];
    if (!shown.length) html.push('<p class="dex-empty">条件に合うモンスターが見つかりませんでした。地域・数値・キーワードの条件を減らしてみてください。</p>');
    if ($('dex-sort').value === 'region') {
      let region=null,map=null;
      for(const monster of shown) {
        if(monster.regionId!==region) {if(region!==null)html.push('</div></section>');region=monster.regionId;map=null;html.push('<section class="dex-region-group"><h2>'+esc(monster.region)+'</h2>');}
        const mapKey=monster.area+'|'+monster.map;
        if(mapKey!==map) {if(map!==null)html.push('</div>');map=mapKey;html.push('<h3 class="dex-map-title">'+esc([monster.area,monster.map].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / ') || 'マップ未登録')+'</h3><div class="dex-grid">');}
        html.push(card(monster));
      }
      if(region!==null)html.push('</div></section>');
    } else html.push('<section class="dex-region-group"><h2>検索結果</h2><div class="dex-grid">'+shown.map(card).join('')+'</div></section>');
    $('dex-results').innerHTML=html.join('');wireImages($('dex-results'));
    $('dex-status').textContent=visible.length+'件の出現情報／'+shown.length+'件表示';
    $('dex-more').hidden=shown.length>=visible.length;
    $('dex-more').textContent='続きを表示（残り '+Math.max(0,visible.length-shown.length)+'件）';
    $('dex-regions').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===$('dex-region').value)));
  }
  function filter(save=true,preserveLimit=false) {
    const query=fold($('dex-query').value).trim().split(/\s+/).filter(Boolean),region=$('dex-region').value,map=$('dex-map').value,min=num('dex-min-level'),max=num('dex-max-level'),def=num('dex-def'),unknown=$('dex-include-unknown').checked;
    visible=data.monsters.filter(m=>{
      if(region && m.regionId!==region || map && m.map!==map)return false;
      if($('dex-known-drop').checked && !dropNames(m).length)return false;
      if(min!=null || max!=null) {const range=levelRange(m);if(!range) {if(!unknown)return false;} else if(min!=null && range[1]<min || max!=null && range[0]>max)return false;}
      if(def!=null) {const required=filterDef(m);if(required==null){if(!unknown)return false;}else if(required>def)return false;}
      const text=fold([m.name,m.region,m.area,m.map,...dropNames(m),...(m.notes||[])].join(' '));
      return query.every(q=>text.includes(q));
    });
    if($('dex-sort').value==='level')visible.sort((a,b)=>(levelRange(a)?.[0]??999)-(levelRange(b)?.[0]??999)||a.name.localeCompare(b.name));
    else if($('dex-sort').value==='name')visible.sort((a,b)=>a.name.localeCompare(b.name));
    if(!preserveLimit)limit=60;render();
    if(save) {const url=new URL(location.href);url.search='';[['q','dex-query'],['region','dex-region'],['map','dex-map'],['min','dex-min-level'],['max','dex-max-level'],['def','dex-def']].forEach(([key,id])=>{if($(id).value)url.searchParams.set(key,$(id).value);});if($('dex-def-mode').value==='full')url.searchParams.set('def-mode','full');if($('dex-known-drop').checked)url.searchParams.set('drops','1');if(!unknown)url.searchParams.set('unknown','0');if($('dex-sort').value!=='region')url.searchParams.set('sort',$('dex-sort').value);history.replaceState(null,'',url);}
  }
  function maps() {
    const selected=$('dex-map').value,region=$('dex-region').value;
    const choices=[...new Set(data.monsters.filter(m=>!region || m.regionId===region).map(m=>m.map).filter(Boolean))];
    $('dex-map').innerHTML='<option value="">すべてのマップ</option>'+choices.map(m=>'<option value="'+esc(m)+'">'+esc(m)+'</option>').join('');
    if(choices.includes(selected))$('dex-map').value=selected;
  }
  function sourceLink(url,label) {const href=http(url);return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':esc(label);}
  function sourceRef(ref) {
    return ref.sourceUrl ? sourceLink(ref.sourceUrl,'公式掲載DEF資料'+(ref.location?' / '+ref.location:'')) : esc((ref.sourceFile||'資料')+' / '+(ref.sourceSheet||'')+' '+(ref.sourceRange||''));
  }
  function open(id,save=true,moveFocus=true) {
    const m=data.monsters.find(x=>x.id===id);if(!m)return;
    const known=refs(m),drops=m.drops||[],region=data.regions.find(x=>x.id===m.regionId);
    $('dex-detail').innerHTML='<div class="dex-detail-main"><div>'+image(m,true)+'</div><div><h2 id="dex-dialog-title">'+esc(m.name)+'</h2><span class="dex-level">'+levelLabel(m)+'</span><p>'+esc([m.region,m.area,m.map].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / '))+'</p><div class="dex-source">'+sourceLink(m.sourceUrl,m.imagePost?'モンスター情報の公式出典':'ゲーム内画像・モンスター情報の出典')+(region?.author?'<p>記事作者：'+esc(region.author)+'</p>':'')+'</div></div></div><section class="dex-detail-section"><h3>アイテムドロップ</h3>'+(drops.length?'<ul class="dex-drop-list">'+drops.map(d=>'<li>'+esc(d.name)+(d.note?'<small>'+esc(d.note)+'</small>':'')+'<small>'+sourceLink(d.sourceUrl||m.sourceUrl,'出典')+'</small></li>').join('')+'</ul>':'<p>未登録です。出典に記載がない項目は推測で補完していません。</p>')+'</section><section class="dex-detail-section"><h3>必要DEF（参考）</h3>'+(known.length?known.map(r=>'<div class="dex-def-row"><p><strong>'+esc(r.defDisplay||'数値未登録')+'</strong> ／ '+esc(r.type==='monster'?'個体参考':scopeLabels[r.scope]||'マップ参考')+'</p><p>'+esc(r.note)+'</p>'+(r.levelGate?'<p>マップのLv条件：'+esc(typeof r.levelGate==='object'?JSON.stringify(r.levelGate):r.levelGate)+'</p>':'')+'<small>'+sourceRef(r)+'</small></div>').join(''):'<p class="dex-def-unknown">このマップ・個体の参考値は未登録です。</p>')+'</section>'+(m.notes?.length?'<section class="dex-detail-section"><h3>補足</h3><ul class="dex-notes">'+m.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></section>':'')+'<section id="dex-contributions" class="dex-detail-section"></section>';
    for(const [items,title] of [[m.rewards,'討伐報酬'],[m.mapItems,'このマップの入手情報（ドロップする個体は未特定）']]) {
      if(!items?.length)continue;
      const section=document.createElement('section');section.className='dex-detail-section';
      section.innerHTML='<h3>'+esc(title)+'</h3><ul class="dex-drop-list">'+items.map(d=>'<li>'+esc(d.name)+'<small>'+esc(d.note)+'</small><small>'+sourceLink(d.sourceUrl,'出典')+'</small></li>').join('')+'</ul>';
      $('dex-contributions').before(section);
    }
    if(m.levelPost || m.imagePost){const p=document.createElement('p');p.className='dex-source';p.textContent=[m.levelPost?'Lvは管理者が確認した投稿から補完。':'',m.imagePost?(m.imagePost.details?.publication_mode==='immediate'?'画像はプレイヤーが追加したゲーム内画像です。':'画像は管理者が確認した投稿から補完。'):''].filter(Boolean).join(' ');$('dex-detail').querySelector('.dex-detail-main').after(p);}
    wireImages($('dex-detail'));
    if(window.XenReports){window.XenReports.mountMonster($('dex-contributions'),{id:m.id,name:m.name,url:'monsters.html#'+m.id});const register=document.createElement('button');register.type='button';register.className='dex-image-register';register.textContent='画像を追加';register.onclick=()=>window.XenReports.openImage({kind:'monster',title:m.name,monsterId:m.id,url:'monsters.html#'+m.id});$('dex-detail').querySelector('.dex-detail-main>div').append(register);}
    else $('dex-contributions').textContent='追記機能を読み込めませんでした。ページを再読み込みしてください。';
    if(!$('dex-dialog').open)$('dex-dialog').showModal();
    if(save)history.replaceState(null,'',location.pathname+location.search+'#'+encodeURIComponent(m.id));
    if(moveFocus)$('dex-close').focus();
  }
  function close() {$('dex-dialog').close();history.replaceState(null,'',location.pathname+location.search);const button=lastButton?.isConnected?lastButton:lastButton?.dataset.monster?$('dex-results').querySelector('[data-monster="'+CSS.escape(lastButton.dataset.monster)+'"]'):null;button?.focus();}
  function applyAdditions(rows) {
    additions.clear();
    for(const monster of data.monsters){const original=originalValues.get(monster.id);if(original){monster.level=original.level;monster.imageUrl=original.imageUrl;}delete monster.levelPost;delete monster.imagePost;}
    for(const row of rows){
      const list=additions.get(row.monster_id)||[];list.push(row);additions.set(row.monster_id,list);
      const monster=data.monsters.find(m=>m.id===row.monster_id);if(!monster)continue;
      if(monster.level==null && row.details?.publication_mode!=='immediate' && Number.isInteger(row.details?.level)){monster.level=row.details.level;monster.levelPost=row;}
      if(!monster.imageUrl && http(row.details?.image_url)){monster.imageUrl=http(row.details.image_url);monster.imagePost=row;}
    }
    filter(false,true);
    if($('dex-dialog').open && location.hash)open(decode(location.hash.slice(1)),false,false);
  }
  async function init() {
    try {const response=await fetch('assets/monsters-data.json?v=1');if(!response.ok)throw new Error('load');data=await response.json();
      for(const monster of data.monsters)originalValues.set(monster.id,{level:monster.level,imageUrl:monster.imageUrl});
      if(innerWidth<600)$('dex-region-panel').open=false;
      $('dex-total').textContent=data.regions.length+'地域・'+data.monsters.length+'件の出現情報';
      $('dex-region').innerHTML='<option value="">すべての地域</option>'+data.regions.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('');
      $('dex-regions').innerHTML='<button type="button" data-region="" aria-pressed="true"><span>すべて</span><small>'+data.monsters.length+'件</small></button>'+data.regions.map(r=>'<button type="button" data-region="'+esc(r.id)+'" aria-pressed="false"><span>'+esc(r.name)+'</span><small>'+data.monsters.filter(m=>m.regionId===r.id).length+'件</small></button>').join('');
      const query=new URLSearchParams(location.search);[['q','dex-query'],['region','dex-region'],['min','dex-min-level'],['max','dex-max-level'],['def','dex-def']].forEach(([key,id])=>{if(query.has(key))$(id).value=query.get(key);});maps();if(query.has('map'))$('dex-map').value=query.get('map');if(query.has('sort'))$('dex-sort').value=query.get('sort');if(query.get('def-mode')==='full')$('dex-def-mode').value='full';$('dex-known-drop').checked=query.get('drops')==='1';$('dex-include-unknown').checked=query.get('unknown')!=='0';filter(false);
      if(location.hash)open(decode(location.hash.slice(1)),false);
      if(window.XenReports?.loadAllMonsters) {window.XenReports.loadAllMonsters().then(rows=>applyAdditions(rows)).catch(()=>{});}
    } catch { $('dex-status').textContent='図鑑を読み込めませんでした。ページを再読み込みしてください。'; }
  }
  $('dex-filter').addEventListener('submit',event=>{event.preventDefault();filter();});
  $('dex-region').addEventListener('change',()=>{maps();filter();});$('dex-map').addEventListener('change',()=>filter());$('dex-sort').addEventListener('change',()=>filter());
  $('dex-regions').addEventListener('click',event=>{const button=event.target.closest('button[data-region]');if(!button)return;$('dex-region').value=button.dataset.region;$('dex-map').value='';maps();filter();$('dex-filter').scrollIntoView({block:'start'});});
  $('dex-results').addEventListener('click',event=>{const button=event.target.closest('button[data-monster]');if(button){lastButton=button;open(button.dataset.monster);}});
  $('dex-more').addEventListener('click',()=>{limit+=60;render();});$('dex-close').addEventListener('click',close);
  $('dex-dialog').addEventListener('cancel',event=>{event.preventDefault();close();});
  $('dex-reset').addEventListener('click',()=>{$('dex-filter').reset();maps();filter();});window.addEventListener('hashchange',()=>{if(location.hash)open(decode(location.hash.slice(1)),false);else if($('dex-dialog').open)$('dex-dialog').close();});
  window.addEventListener('xen-monster-updated',event=>{if(Array.isArray(event.detail?.rows))applyAdditions(event.detail.rows);});
  init();
})();
