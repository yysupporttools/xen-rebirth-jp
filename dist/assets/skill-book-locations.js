'use strict';
(() => {
  const form = document.getElementById('skill-book-filters');
  if (!form) return;
  const level = document.getElementById('skill-book-level');
  const query = document.getElementById('skill-book-query');
  const status = document.getElementById('skill-book-status');
  const empty = document.getElementById('skill-book-empty');
  const groups = Array.from(document.querySelectorAll('[data-book-level]')).map(element => ({
    element,
    initiallyOpen: element.open,
    rows: Array.from(element.querySelectorAll('[data-book-location]')),
    count: element.querySelector('[data-book-count]')
  }));
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  function apply() {
    const terms = normalize(query.value).split(' ').filter(Boolean);
    const filtered = Boolean(level.value || terms.length);
    let groupCount = 0;
    let locationCount = 0;
    groups.forEach(group => {
      let matches = 0;
      group.rows.forEach(row => {
        const text = normalize(row.dataset.bookSearch || row.textContent);
        row.hidden = !terms.every(term => text.includes(term));
        if (!row.hidden) matches++;
      });
      const visible = (!level.value || group.element.dataset.bookLevel === level.value) && (matches > 0 || (!terms.length && !group.rows.length));
      group.element.hidden = !visible;
      group.count.textContent = group.rows.length ? `${matches}件の入手場所` : '公式に入手先未掲載';
      group.element.open = filtered ? visible : group.initiallyOpen;
      if (visible) { groupCount++; locationCount += matches; }
    });
    status.textContent = `対象Lv ${groupCount}区分 / 入手場所の掲載 ${locationCount}件（同じマップの別Lv・別経路を含む）`;
    empty.hidden = groupCount !== 0;
  }
  form.addEventListener('submit', event => event.preventDefault());
  level.addEventListener('change', apply);
  query.addEventListener('input', apply);
  form.addEventListener('reset', event => {
    event.preventDefault();
    level.value = '';
    query.value = '';
    apply();
  });
  form.hidden = false;
  apply();
})();
