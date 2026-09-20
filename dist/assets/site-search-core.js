"use strict";
(() => {
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const tokens = query => [...new Set(normalize(query).trim().split(/\s+/u).filter(Boolean))].slice(0,12);
  const validUrl = value => typeof value === 'string' && /^[a-z0-9-]+\.html(?:[?#][^\s<>]*)?$/.test(value);
  function prepare(records) {
    return records.filter(r => r && validUrl(r.url) && typeof r.title === 'string').map(r => ({...r,
      text:String(r.text || ''),page:String(r.page || ''),
      titleKey:normalize(r.title), bodyKey:normalize(`${r.title} ${r.page || ''} ${r.text || ''}`)
    }));
  }
  function search(records, query, kind='all') {
    const words=tokens(query);
    if (!words.length) return [];
    const matches=records.filter(r => (kind==='all'||r.kind===kind) && words.every(word=>r.bodyKey.includes(word)));
    const detailedPages=new Set(matches.filter(r=>!String(r.key).startsWith('page:')).map(r=>r.url.split(/[?#]/)[0]));
    return matches.filter(r=>!String(r.key).startsWith('page:') || !detailedPages.has(r.url.split(/[?#]/)[0]) || words.every(word=>r.titleKey.includes(word)))
      .map(r=>({r,score:(r.titleKey===normalize(query).trim()?100:0)+words.reduce((n,w)=>n+(r.titleKey.includes(w)?20:1),0)}))
      .sort((a,b)=>b.score-a.score||a.r.title.localeCompare(b.r.title,'ja')).map(x=>x.r);
  }
  function snippet(text, query) {
    const str=String(text).replace(/\s+/g,' '), hay=normalize(str);
    const hits=tokens(query).map(t=>hay.indexOf(t)).filter(n=>n>=0);
    const start=Math.max(0,(hits.length?Math.min(...hits):0)-45);
    return (start?'…':'')+str.slice(start,start+180)+(str.length>start+180?'…':'');
  }
  const api={normalize,tokens,prepare,search,snippet,validUrl};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else window.SiteSearchCore=api;
})();
