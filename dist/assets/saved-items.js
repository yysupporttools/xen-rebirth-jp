(() => {
  'use strict';
  const KEY = 'xenRebirthSavedItemsV1';
  const base = new URL('./', location.href);
  const allowed = new Set(['index.html','start.html','classes.html','class-change.html','class-archer.html','class-cleric.html','class-knight.html','class-mage.html','class-rogue.html','class-templar.html','systems.html','quests.html','events.html','bosses.html','tools.html','glossary.html','board.html','sources.html','search.html','capture.html','favorites.html','rules.html','story.html','level-guide.html','monsters.html','reports.html','guild.html']);
  const buttons = new Map();
  let currentPage = null;
  let sideRail = null;
  let popularRows = [], popularMessage = '読み込み中…', popularStarted = null;
  const popularSeen = new Set();
  const popularEndpoint = 'https://dzxxjtmpcfsmvdgkcwvn.supabase.co/functions/v1/site-popular-articles';
  const popularKey = 'sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_';
  const main = document.querySelector('main');
  if (!main) return;
  const status = document.createElement('p');
  status.className = 'saved-status';
  status.setAttribute('role', 'status');
  main.prepend(status);

  function setupSiteHeader() {
    const header = document.querySelector('header');
    const nav = header?.querySelector('nav');
    if (!nav || nav.dataset.compactReady) return;
    nav.dataset.compactReady = 'true';

    const brandLink = header.querySelector('.brand > a');
    if (brandLink && !brandLink.dataset.visualBrandReady) {
      brandLink.dataset.visualBrandReady = 'true';
      brandLink.classList.add('xen-visual-brand');
      brandLink.innerHTML =
        '<img class="xen-brand-wing" src="assets/xen-wing-logo.webp?v=2" alt="">' +
        '<span class="xen-brand-copy"><strong>Xen Rebirth</strong><small>日本語攻略ガイド</small></span>';
    }
    const edition = header.querySelector('.edition');
    if (edition) edition.textContent = 'UNOFFICIAL FAN GUIDE';

    let icon = document.querySelector('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = 'assets/xen-wing-logo.webp?v=2';
    icon.type = 'image/webp';

    const currentFile = location.pathname.split('/').pop() || 'index.html';
    const removeFiles = new Set(['search.html','bosses.html','tools.html','capture.html','favorites.html','rules.html','guild.html']);
    [...nav.querySelectorAll('a')].forEach(link => {
      try {
        const file = new URL(link.href, location.href).pathname.split('/').pop();
        if (removeFiles.has(file)) link.remove();
      } catch {}
    });

    const tools = document.createElement('div');
    tools.className = 'site-tools-menu';
    const toolsButton = document.createElement('button');
    toolsButton.type = 'button';
    toolsButton.className = 'site-tools-toggle';
    toolsButton.setAttribute('aria-expanded','false');
    toolsButton.textContent = '便利機能';
    if (['bosses.html','tools.html','capture.html','reports.html','guild.html'].includes(currentFile)) toolsButton.classList.add('is-current');

    const toolsPanel = document.createElement('div');
    toolsPanel.className = 'site-tools-panel';
    toolsPanel.hidden = true;
    [
      ['bosses.html','ボスタイマー','出現予定を確認'],
      ['tools.html','精錬ツール','精錬データ・計算'],
      ['capture.html','翻訳・NPC検索','ゲーム画面から検索'],
      ['reports.html','修正報告・投稿管理','送った情報の確認'],
      ['guild.html','ギルド紹介の編集','メンバー写真・自己紹介を登録']
    ].forEach(([href,title,sub]) => {
      const a = document.createElement('a');
      a.href = href;
      a.innerHTML = '<strong>'+title+'</strong><small>'+sub+'</small>';
      toolsPanel.append(a);
    });
    tools.append(toolsButton,toolsPanel);

    const search = document.createElement('div');
    search.className = 'site-search-menu';
    const searchButton = document.createElement('button');
    searchButton.type = 'button';
    searchButton.className = 'site-search-toggle';
    searchButton.setAttribute('aria-label','サイト内検索を開く');
    searchButton.setAttribute('aria-expanded','false');
    searchButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.7"></circle><path d="m16 16 5 5"></path></svg>';

    const searchPanel = document.createElement('form');
    searchPanel.className = 'site-search-popover';
    searchPanel.action = 'search.html';
    searchPanel.method = 'get';
    searchPanel.role = 'search';
    searchPanel.hidden = true;
    const input = document.createElement('input');
    input.type = 'search';
    input.name = 'q';
    input.maxLength = 120;
    input.placeholder = 'サイト内を検索…';
    input.setAttribute('aria-label','検索キーワード');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '検索';
    searchPanel.append(input,submit);
    search.append(searchButton,searchPanel);

    function closeMenus(except) {
      if (except !== 'tools') {
        toolsPanel.hidden = true;
        toolsButton.setAttribute('aria-expanded','false');
      }
      if (except !== 'search') {
        searchPanel.hidden = true;
        searchButton.setAttribute('aria-expanded','false');
      }
    }

    toolsButton.addEventListener('click',() => {
      const open = toolsPanel.hidden;
      closeMenus(open ? 'tools' : '');
      toolsPanel.hidden = !open;
      toolsButton.setAttribute('aria-expanded',String(open));
    });
    searchButton.addEventListener('click',() => {
      const open = searchPanel.hidden;
      closeMenus(open ? 'search' : '');
      searchPanel.hidden = !open;
      searchButton.setAttribute('aria-expanded',String(open));
      if (open) setTimeout(() => input.focus(),0);
    });
    document.addEventListener('click',event => {
      if (!tools.contains(event.target) && !search.contains(event.target)) closeMenus('');
    });
    document.addEventListener('keydown',event => {
      if (event.key === 'Escape') closeMenus('');
    });

    nav.append(tools,search);
    document.body.classList.add('compact-site-nav');
  }

  setupSiteHeader();

  function clean(record) {
    if (!record || typeof record.url !== 'string' || typeof record.title !== 'string') return null;
    try {
      const url = new URL(record.url, base);
      const file = url.pathname.slice(base.pathname.length) || 'index.html';
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || !allowed.has(file)) return null;
      return {url: file + url.search + url.hash, title: record.title.slice(0,180), time: Number(record.time) || 0};
    } catch { return null; }
  }
  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      const list = (v, limit) => Array.isArray(v) ? [...new Map(v.map(clean).filter(Boolean).map(x => [x.url,x])).values()].slice(0,limit) : [];
      return {favorites: list(data.favorites,100), recent: list(data.recent,30)};
    } catch {
      const warning = '保存データを読み込めません。このブラウザの保存設定をご確認ください。';
      if (status.textContent !== warning) status.textContent = warning;
      return {favorites: [], recent: []};
    }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
    catch { status.textContent = '保存できませんでした。ブラウザの保存設定や空き容量をご確認ください。'; return false; }
  }
  function remember(record) {
    trackPopular(record);
    const data = read();
    data.recent = [{...record,time:Date.now()}, ...data.recent.filter(x => x.url !== record.url)].slice(0,30);
    write(data);
  }

  function isQuestDetailRecord(record) {
    return !!record && /^quests\.html#[^#]+/.test(record.url || '');
  }

  function orderedFavorites(records) {
    return [...records].sort((a, b) => {
      const questOrder = Number(isQuestDetailRecord(b)) - Number(isQuestDetailRecord(a));
      if (questOrder) return questOrder;
      return (Number(b.time) || 0) - (Number(a.time) || 0);
    });
  }

  function syncButtons() {
    const saved = new Set(read().favorites.map(x => x.url));
    for (const [button, record] of buttons) {
      if (!button.isConnected) { buttons.delete(button); continue; }
      const active = saved.has(record.url);
      const label = active ? '★ 保存済み' : '☆ お気に入り';
      if (button.textContent !== label) button.textContent = label;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', record.title + (active ? 'をお気に入りから解除' : 'をお気に入りに追加'));
    }
  }
  function star(record) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saved-star';
    buttons.set(button, record);
    button.addEventListener('click', () => {
      const data = read();
      const exists = data.favorites.some(x => x.url === record.url);
      if (!exists && data.favorites.length >= 100) {
        status.textContent = 'お気に入りは100件まで保存できます。不要な項目を解除してから追加してください。';
        return;
      }
      if (exists) {
        data.favorites = data.favorites.filter(x => x.url !== record.url);
      } else {
        if (isQuestDetailRecord(record)) {
          data.favorites = data.favorites.filter(x => x.url !== 'quests.html');
        }
        data.favorites = [{...record,time:Date.now()}, ...data.favorites.filter(x => x.url !== record.url)];
      }
      if (write(data)) {
        status.textContent = exists
          ? (isQuestDetailRecord(record) ? 'このクエストをお気に入りから解除しました。' : 'お気に入りを解除しました。')
          : (isQuestDetailRecord(record) ? 'このクエストをお気に入りに追加しました。' : 'お気に入りに追加しました。');
        syncButtons();
        render();
      }
    });
    return button;
  }
  function renderList(container, records, empty) {
    container.replaceChildren();
    if (!records.length) { const p = document.createElement('p'); p.className='saved-empty'; p.textContent=empty; container.append(p); return; }
    const list=document.createElement('ul'); list.className='saved-list';
    records.forEach(record => {
      const li=document.createElement('li');
      const link=document.createElement('a'); link.href=record.url; link.textContent=record.title;
      li.append(link,star(record)); list.append(li);
    });
    container.append(list);
  }

  function ensureSideRail() {
    if (sideRail?.isConnected) return sideRail;
    sideRail = document.createElement('aside');
    sideRail.className = 'site-side-rail';
    sideRail.setAttribute('aria-label','お気に入り・最近見た項目・人気記事');
    sideRail.innerHTML =
      '<section class="rail-current"><p class="rail-eyebrow">QUICK ACCESS</p><h2>このページ</h2><div id="rail-current-action"></div></section>'+
      '<section><div class="rail-head"><h2>☆ お気に入り</h2><a href="favorites.html">すべて</a></div><div id="rail-favorites"></div></section>'+
      '<section><div class="rail-head"><h2>最近見た項目</h2><a href="favorites.html#recent">履歴</a></div><div id="rail-recents"></div>'+
      '<div class="rail-popular"><div class="rail-head"><h2>最も閲覧された記事</h2></div><div id="rail-popular"></div><details class="rail-popular-help"><summary>集計について</summary><p>同じブラウザーから同じ記事への閲覧は、日本時間で1日1回数えます。サイト全体の累計で上位5件を表示します。集計開始前の閲覧は含みません。訪問者カウンターと共通のランダムな識別子を使います。</p><p id="rail-popular-start"></p></details></div></section>';
    const header=document.querySelector('header');
    if (header) header.insertAdjacentElement('afterend',sideRail);
    else document.body.prepend(sideRail);
    document.body.classList.add('has-site-side-rail');
    return sideRail;
  }


  function renderPopular() {
    const box=sideRail?.querySelector('#rail-popular');
    if(!box) return;
    box.replaceChildren();
    if(!popularRows.length) {
      const p=document.createElement('p'); p.className='rail-empty'; p.textContent=popularMessage; box.append(p);
    } else {
      const list=document.createElement('ol'); list.className='rail-popular-list';
      popularRows.slice(0,5).forEach((row,index)=>{
        const record=clean({url:row.url,title:row.title});
        if(!record || !Number.isSafeInteger(row.views) || row.views<1) return;
        const li=document.createElement('li');
        const rank=document.createElement('span');rank.className='rail-popular-rank';rank.textContent=String(index+1);rank.setAttribute('aria-label',String(index+1)+'位');
        const a=document.createElement('a');a.href=record.url;a.textContent=record.title;
        const small=document.createElement('small');small.textContent='閲覧数 '+row.views.toLocaleString('ja-JP');
        const copy=document.createElement('div');copy.append(a,small);li.append(rank,copy);list.append(li);
      });
      box.append(list);
    }
    const note=sideRail.querySelector('#rail-popular-start');
    note.textContent=popularStarted?'集計開始：'+popularStarted:'';
  }
  async function requestPopular(article) {
    const production=location.hostname==='yysupporttools.github.io' && location.pathname.startsWith('/xen-rebirth-jp/');
    if(!production) {popularMessage='公開サイトで集計・表示します。';renderPopular();return;}
    let visitor=null;
    try {
      visitor=localStorage.getItem('xen-site-visitor-v1');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor||'')) {
        visitor=crypto.randomUUID();localStorage.setItem('xen-site-visitor-v1',visitor);
      }
    } catch {visitor=null;}
    try {
      const record=Boolean(article&&visitor);
      const response=await fetch(popularEndpoint,{method:record?'POST':'GET',headers:record?{apikey:popularKey,'Content-Type':'application/json'}:{apikey:popularKey},...(record?{body:JSON.stringify({article,visitor})}:{}),signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(!Array.isArray(data.articles))throw new Error();
      popularRows=data.articles;
      popularMessage='まだ閲覧データがありません。';
      popularStarted=/^\d{4}-\d{2}-\d{2}$/.test(data.started||'')?data.started:null;
      renderPopular();
    } catch {if(article)popularSeen.delete(article);popularMessage='現在、ランキングを取得できません。';renderPopular();}
  }
  function trackPopular(record) {
    if(!record) return;
    const url=new URL(record.url,base),file=url.pathname.split('/').pop();
    const article=file+(['glossary.html','quests.html'].includes(file)?url.hash:'');
    if(['index.html','search.html','favorites.html','board.html','capture.html','sources.html','tools.html','reports.html','guild.html'].includes(file)) return;
    if(popularSeen.has(article))return;
    popularSeen.add(article);requestPopular(article);
  }

  function renderRailLinks(container,records,empty,limit) {
    container.replaceChildren();
    const rows=records.slice(0,limit);
    if (!rows.length) {
      const p=document.createElement('p');
      p.className='rail-empty';
      p.textContent=empty;
      container.append(p);
      return;
    }
    const ul=document.createElement('ul');
    ul.className='rail-list';
    rows.forEach(record => {
      const li=document.createElement('li');
      const a=document.createElement('a');
      a.href=record.url;
      a.textContent=record.title;
      li.append(a);
      ul.append(li);
    });
    container.append(ul);
  }

  function renderSideRail(data) {
    const rail=ensureSideRail();
    const current=rail.querySelector('#rail-current-action');
    const currentHeading=rail.querySelector('.rail-current h2');
    if (currentHeading) currentHeading.textContent=isQuestDetailRecord(currentPage) ? 'このクエスト' : 'このページ';
    current.replaceChildren();
    if (currentPage) current.append(star(currentPage));
    else {
      const p=document.createElement('p');
      p.className='rail-empty';
      p.textContent=location.hash && location.pathname.endsWith('/quests.html')
        ? 'クエストを読み込み中…'
        : 'このページは保存対象外です。';
      current.append(p);
    }
    renderRailLinks(rail.querySelector('#rail-favorites'),orderedFavorites(data.favorites),'まだありません。',5);
    renderRailLinks(rail.querySelector('#rail-recents'),data.recent,'まだありません。',6);
    renderPopular();
  }
  function render() {
    const data=read();
    const favorites=document.getElementById('saved-favorites');
    if (favorites) {
      renderList(favorites,orderedFavorites(data.favorites),'まだお気に入りはありません。ページ・用語・クエストの☆を押して追加してください。');
      const recents=document.getElementById('saved-recents');
      if (recents) renderList(recents,data.recent,'まだ閲覧履歴はありません。攻略ページや用語を開くと自動で記録されます。');
      const count=document.getElementById('saved-count');
      if (count) count.textContent=`（${data.favorites.length}件）`;
      const clear=document.getElementById('saved-clear');
      if (clear) clear.disabled=!data.recent.length;
    }
    renderSideRail(data);
    syncButtons();
  }
  const page=clean({url:location.pathname,title:document.querySelector('h1')?.textContent.trim() || document.title});
  const onQuestsPage=location.pathname.endsWith('/quests.html');
  currentPage=onQuestsPage && location.hash ? null : page;
  if (currentPage) remember(currentPage);

  function questRecordFromDetail() {
    if (!onQuestsPage || !location.hash) return null;
    const title=main.querySelector('#quest-detail .quest-detail-title')?.textContent?.trim();
    const id=location.hash.slice(1);
    if (!title || !id) return null;
    return clean({
      url:'quests.html#'+encodeURIComponent(id),
      title:title
    });
  }

  function ensureQuestFavorite(record) {
    if (!record) return;
    const card=main.querySelector('#quest-detail > article.paper');
    if (!card) return;
    let row=card.querySelector(':scope > .quest-detail-favorite-row');
    if (!row) {
      row=document.createElement('div');
      row.className='quest-detail-favorite-row';
      card.prepend(row);
    }
    if (row.dataset.savedUrl === record.url) return;
    row.dataset.savedUrl=record.url;
    row.replaceChildren(star(record));
  }

  function syncQuestContext() {
    if (!onQuestsPage) return;
    if (location.hash) {
      const record=questRecordFromDetail();
      if (!record) {
        currentPage=null;
        renderSideRail(read());
        syncButtons();
        return;
      }
      const changed=currentPage?.url !== record.url;
      currentPage=record;
      if (changed) remember(record);
      ensureQuestFavorite(record);
    } else {
      const changed=currentPage?.url !== page?.url;
      currentPage=page;
      if (changed && currentPage) remember(currentPage);
    }
    renderSideRail(read());
    syncButtons();
  }

  if (onQuestsPage) {
    const detail=document.getElementById('quest-detail');
    if (detail) {
      const observer=new MutationObserver(syncQuestContext);
      observer.observe(detail,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    }
    window.addEventListener('hashchange',() => {
      if (location.hash) {
        currentPage=null;
        renderSideRail(read());
        syncButtons();
      } else {
        syncQuestContext();
      }
    });
    syncQuestContext();
  }

  function itemRecord(node) {
    const summary=node.matches('details') ? node.querySelector(':scope > summary') : node.querySelector(':scope > details > summary');
    const title=summary?.querySelector('.glossary-name-ja')?.textContent || summary?.querySelector('strong')?.textContent;
    return title && node.id ? clean({url:'glossary.html#'+encodeURIComponent(node.id),title:title.trim()}) : null;
  }
  function attachItems() {
    document.querySelectorAll('.glossary-entry[id], .lucky-ball-group[id]').forEach(node => {
      if (node.dataset.savedReady) return;
      const record=itemRecord(node);
      if (!record) return;
      node.dataset.savedReady='true';
      const bar=document.createElement('div'); bar.className='saved-item-actions'; bar.append(star(record));
      if (node.matches('details')) node.querySelector(':scope > summary').after(bar);
      else node.prepend(bar);
    });
    syncButtons();
  }
  if (location.pathname.endsWith('/glossary.html')) {
    attachItems();
    const observer=new MutationObserver(attachItems);
    observer.observe(main,{childList:true,subtree:true});
    main.addEventListener('toggle',event => {
      const details=event.target;
      if (!details.open) return;
      const node=details.matches('.lucky-ball-group') ? details : details.parentElement?.matches('.glossary-entry') ? details.parentElement : null;
      const record=node && itemRecord(node);
      if (record) remember(record);
    },true);
  }
  document.getElementById('saved-clear')?.addEventListener('click',() => {
    if (!window.confirm('最近見た項目の履歴を消去しますか？お気に入りは残ります。')) return;
    const data=read(); data.recent=[];
    if (write(data)) { status.textContent='閲覧履歴を消去しました。'; render(); }
  });
  window.addEventListener('storage',event => { if (event.key === KEY || event.key === null) { syncButtons(); render(); } });
  window.addEventListener('pageshow',event => { if (event.persisted) { if(currentPage) remember(currentPage); if(onQuestsPage) syncQuestContext(); syncButtons(); render(); } });
  syncButtons(); render();
})();
