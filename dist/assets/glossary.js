"use strict";
(() => {
  const panel = document.getElementById('glossary-search-panel');
  if (!panel) return;
  const query = document.getElementById('glossary-query');
  const category = document.getElementById('glossary-category');
  const entries = [...document.querySelectorAll('.glossary-entry')];
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ja').replace(/[’‘]/g,"'").trim();
  const texts = new Map(entries.map(entry => [entry, normalize(entry.textContent)]));
  function filter() {
    const words = normalize(query.value).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const entry of entries) {
      entry.hidden = !(words.every(word => texts.get(entry).includes(word)) && (!category.value || category.value === entry.dataset.category));
      if (!entry.hidden) count++;
    }
    document.querySelectorAll('.glossary-category').forEach(section => {
      section.hidden = ![...section.querySelectorAll('.glossary-entry')].some(entry => !entry.hidden);
    });
    document.getElementById('glossary-count').textContent = `${count} / ${entries.length}件`;
    document.getElementById('glossary-empty').hidden = count !== 0;
  }
  function reset() {query.value = ''; category.value = ''; filter();}
  function revealHash() {
    let id;
    try {id = decodeURIComponent(location.hash.slice(1));} catch {return;}
    const target = document.getElementById(id);
    if (!target || (!target.classList.contains('glossary-entry') && !target.classList.contains('glossary-category'))) return;
    reset();
    requestAnimationFrame(() => {
      target.scrollIntoView({behavior:'instant',block:'start'});
      if (target.classList.contains('glossary-entry')) target.focus({preventScroll:true});
    });
  }
  query.addEventListener('input', filter);
  category.addEventListener('change', filter);
  document.getElementById('glossary-reset').addEventListener('click', () => {reset();query.focus();});
  document.querySelectorAll('.anchor-nav a').forEach(a => a.addEventListener('click', reset));
  window.addEventListener('hashchange', revealHash);
  window.addEventListener('pageshow', revealHash);
  panel.hidden = false;
  filter();
  revealHash();
})();
