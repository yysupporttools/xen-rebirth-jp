(() => {
  'use strict';
  const KEY = 'xenRebirthSavedItemsV1';
  const base = new URL('./', location.href);
  const allowed = new Set(['index.html','start.html','classes.html','class-change.html','class-archer.html','class-cleric.html','class-knight.html','class-mage.html','class-rogue.html','class-templar.html','systems.html','quests.html','events.html','bosses.html','tools.html','glossary.html','board.html','sources.html','search.html','capture.html','favorites.html']);
  const buttons = new Map();
  let currentPage = null;
  let sideRail = null;
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

    const currentFile = location.pathname.split('/').pop() || 'index.html';
    const removeFiles = new Set(['search.html','bosses.html','tools.html','capture.html','favorites.html']);
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
    if (['bosses.html','tools.html','capture.html'].includes(currentFile)) toolsButton.classList.add('is-current');

    const toolsPanel = document.createElement('div');
    toolsPanel.className = 'site-tools-panel';
    toolsPanel.hidden = true;
    [
      ['bosses.html','ボスタイマー','出現予定を確認'],
      ['tools.html','精錬ツール','精錬データ・計算'],
      ['capture.html','翻訳・NPC検索','ゲーム画面から検索']
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
    const data = read();
    data.recent = [{...record,time:Date.now()}, ...data.recent.filter(x => x.url !== record.url)].slice(0,30);
    write(data);
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
      data.favorites = exists ? data.favorites.filter(x => x.url !== record.url) : [{...record,time:Date.now()},...data.favorites];
      if (write(data)) {
        status.textContent = exists ? 'お気に入りを解除しました。' : 'お気に入りに追加しました。';
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
    sideRail.setAttribute('aria-label','お気に入りと最近見た項目');
    sideRail.innerHTML =
      '<section class="rail-current"><p class="rail-eyebrow">QUICK ACCESS</p><h2>このページ</h2><div id="rail-current-action"></div></section>'+
      '<section><div class="rail-head"><h2>☆ お気に入り</h2><a href="favorites.html">すべて</a></div><div id="rail-favorites"></div></section>'+
      '<section><div class="rail-head"><h2>最近見た項目</h2><a href="favorites.html#recent">履歴</a></div><div id="rail-recents"></div></section>';
    const header=document.querySelector('header');
    if (header) header.insertAdjacentElement('afterend',sideRail);
    else document.body.prepend(sideRail);
    document.body.classList.add('has-site-side-rail');
    return sideRail;
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
    current.replaceChildren();
    if (currentPage) current.append(star(currentPage));
    else {
      const p=document.createElement('p');
      p.className='rail-empty';
      p.textContent='このページは保存対象外です。';
      current.append(p);
    }
    renderRailLinks(rail.querySelector('#rail-favorites'),data.favorites,'まだありません。',5);
    renderRailLinks(rail.querySelector('#rail-recents'),data.recent,'まだありません。',6);
  }
  function render() {
    const data=read();
    const favorites=document.getElementById('saved-favorites');
    if (favorites) {
      renderList(favorites,data.favorites,'まだお気に入りはありません。ページや用語の☆を押して追加してください。');
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
  currentPage=page;
  if (page) remember(page);

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
  window.addEventListener('pageshow',event => { if (event.persisted) { if(page) remember(page); syncButtons(); render(); } });
  syncButtons(); render();
})();
