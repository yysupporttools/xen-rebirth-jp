(() => {
  'use strict';
  const KEY = 'xenRebirthSavedItemsV1';
  const base = new URL('./', location.href);
  const allowed = new Set(['index.html','start.html','classes.html','class-change.html','class-archer.html','class-cleric.html','class-knight.html','class-mage.html','class-rogue.html','class-templar.html','systems.html','quests.html','events.html','bosses.html','tools.html','glossary.html','board.html','sources.html','search.html']);
  const buttons = new Map();
  const main = document.querySelector('main');
  if (!main) return;
  const status = document.createElement('p');
  status.className = 'saved-status';
  status.setAttribute('role', 'status');
  main.prepend(status);

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
  function render() {
    const favorites=document.getElementById('saved-favorites');
    if (!favorites) return;
    const data=read();
    renderList(favorites,data.favorites,'まだお気に入りはありません。ページや用語の☆を押して追加してください。');
    renderList(document.getElementById('saved-recents'),data.recent,'まだ閲覧履歴はありません。攻略ページや用語を開くと自動で記録されます。');
    document.getElementById('saved-count').textContent=`（${data.favorites.length}件）`;
    document.getElementById('saved-clear').disabled=!data.recent.length;
    syncButtons();
  }
  const page=clean({url:location.pathname,title:document.querySelector('h1')?.textContent.trim() || document.title});
  if (page) {
    const bar=document.createElement('div'); bar.className='saved-page-actions';
    const link=document.createElement('a'); link.href='favorites.html'; link.textContent='お気に入り・最近見た項目を見る →';
    bar.append(star(page),link);
    (document.querySelector('.page-intro') || main).appendChild(bar);
    if (bar.parentElement === main) main.prepend(bar);
    remember(page);
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
  window.addEventListener('pageshow',event => { if (event.persisted) { if(page) remember(page); syncButtons(); render(); } });
  syncButtons(); render();
})();
