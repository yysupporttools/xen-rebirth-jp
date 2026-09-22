(() => {
  const head = document.head;

  if (!document.querySelector('link[href^="assets/new-badge.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/new-badge.css?v=2";
    head.appendChild(link);
  }

  if (!document.querySelector('script[src^="assets/new-badge.js"]')) {
    const script = document.createElement("script");
    script.src = "assets/new-badge.js?v=2";
    script.defer = true;
    document.body
      ? document.body.appendChild(script)
      : document.addEventListener("DOMContentLoaded", () => {
          document.body.appendChild(script);
        });
  }
})();
"use strict";
(() => {
  const jst = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const dateFormat = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function remaining(start, now) {
    const seconds=Math.max(0,Math.ceil((start-now)/1000));
    return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  }
  function activeEvents(data,now) {return (data.events||[]).filter(e=>e.end>now).sort((a,b)=>a.start-b.start);}
  function state(data,now) {
    if(!data || !Array.isArray(data.events) || !data.events.length) return 'empty';
    if(now<data.fetchedAt-300000) return 'clock';
    if(now>=data.validUntil) return 'expired';
    return now-data.fetchedAt>12*3600000?'stale':'fresh';
  }
  const api={remaining,activeEvents,state,dateJst:ms=>dateFormat.format(ms)};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  if(typeof document==='undefined') return;
  let data=window.BOSS_DATA||{events:[]},signature='',refreshFailed=false;
  const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function tick() {
    const now=Date.now();
    document.querySelectorAll('[data-jst-clock]').forEach(e=>{e.textContent=jst.format(now)+' JST';e.dateTime=new Date(now).toISOString();});
    const status=state(data,now);
    const events=['expired','clock','empty'].includes(status)?[]:activeEvents(data,now);
    const next=events.find(e=>e.start>now);
    const key=JSON.stringify([events.map(e=>[e.id,e.start,e.end,e.start<=now]),status]);
    if(key!==signature) {
      signature=key;
      document.querySelectorAll('[data-next-boss]').forEach(el=>{el.innerHTML=next?`<div class="next-boss-image"><img src="${escape(next.image)}" alt="${escape(next.name)}" loading="eager"></div><div class="next-boss-info"><p class="location">${escape(next.location)}</p><h2>${escape(next.name)}</h2><div class="countdown" data-countdown="${next.start}" aria-label="出現予定までの残り時間"></div><p>${dateFormat.format(next.start)} JST</p><p class="small">公式予定 / 実際の出現状況は未取得</p></div>`:'<h2>最新の予定を確認</h2><p>収録された次回予定がありません。公式タイマーでご確認ください。</p>';});
      document.querySelectorAll('[data-boss-list]').forEach(el=>{el.innerHTML=events.length?events.map(e=>`<article class="boss-row"><img src="${escape(e.image)}" alt="${escape(e.name)}" width="80" height="90"><div><h2>${escape(e.name)}</h2><p>${escape(e.location)}</p><p>${dateFormat.format(e.start)} JST</p></div><div>${e.start<=now?'<strong>予定の出現枠</strong><p>討伐・生存状況は未確認</p>':`<p>出現予定まで</p><div class="countdown" data-countdown="${e.start}"></div>`}</div></article>`).join(''):'<div class="paper"><h2>最新の予定を確認してください</h2><p>有効な予定データがありません。古い予定の繰り返し表示は行いません。</p><a href="https://www.xenrebirth.com/index.php?game-bosstimer/" target="_blank" rel="noopener noreferrer">公式タイマーを開く ↗</a></div>';});
    }
    document.querySelectorAll('[data-countdown]').forEach(e=>{e.textContent=remaining(Number(e.dataset.countdown),now);});
    const messages={fresh:'公式予定を表示中',stale:'予定データの更新が遅れています。公式でも確認してください。',expired:'予定データの有効期間を過ぎました。公式でご確認ください。',empty:'予定を取得できませんでした。',clock:'端末の日時が予定データより前です。端末時計を確認してください。'};
    document.querySelectorAll('[data-schedule-status]').forEach(el=>{el.textContent=messages[status]+(data.fetchedAt?' ｜取得：'+dateFormat.format(data.fetchedAt)+' JST':'')+(refreshFailed?' ｜再取得に失敗。収録済みの予定を表示しています。':'');});
  }
  async function refresh() {
    if(location.protocol==='file:') return;
    try {
      const response=await fetch('assets/boss-data.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw new Error('Schedule unavailable');
      const latest=await response.json();
      if(!Array.isArray(latest.events)||!Number.isFinite(latest.fetchedAt)||!Number.isFinite(latest.validUntil)||!latest.events.every(e=>Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start&&/^assets\/bosses\/[a-z]+\.png$/.test(e.image))) throw new Error('Invalid schedule');
      if(latest.fetchedAt>=(data.fetchedAt||0)) data=latest;
      refreshFailed=false;tick();
    }catch{refreshFailed=true;tick();}
  }
  if(document.querySelector('[data-next-boss],[data-boss-list]')) {
    tick();setInterval(tick,1000);setInterval(refresh,300000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();refresh();}});
    refresh();
  }
})();
