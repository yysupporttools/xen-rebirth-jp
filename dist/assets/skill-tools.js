(() => {
  const normalize = text => text.normalize('NFKC').toLowerCase().trim();
  document.querySelectorAll('table.all-skills').forEach((table, tableIndex) => {
    const rows = [...table.querySelectorAll('tbody tr')];
    const entries = rows.map(row => {
      const cell = row.querySelector('.skill-levels');
      const name = row.querySelector('.skill-name strong')?.textContent || '';
      const text = row.textContent;
      const levels = [...(cell?.textContent || '').matchAll(/Lv(\d+)\s*[:：]\s*(\d+)/g)].map(m => ({level: Number(m[1]), required: Number(m[2])}));
      const mpLine = row.cells[1]?.innerHTML.match(/消費MP[：:]([^<]+)/)?.[1] || '';
      const mp = new Map([...mpLine.matchAll(/Lv(\d+)\s*[:：]\s*(\d+)/g)].map(m => [Number(m[1]), Number(m[2])]));
      const defenseLine = row.cells[1]?.innerHTML.match(/防御力上昇[：:]([^<]+)/)?.[1] || '';
      const defense = new Map([...defenseLine.matchAll(/Lv(\d+)\s*[:：]\s*(\d+)/g)].map(m => [Number(m[1]), Number(m[2])]));
      if (cell && levels.length) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '全Lvの習得条件';
        const original = document.createElement('div');
        original.textContent = cell.textContent;
        details.append(summary, original);
        cell.replaceChildren();
        const label = document.createElement('label');
        label.textContent = 'スキルLv ';
        const select = document.createElement('select');
        select.setAttribute('aria-label', name + 'のスキルLv');
        levels.forEach(item => select.add(new Option('Lv' + item.level, item.level)));
        label.append(select);
        const info = document.createElement('p');
        info.className = 'skill-selected-level';
        info.setAttribute('aria-live', 'polite');
        const update = () => {
          const selected = levels.find(item => item.level === Number(select.value));
          info.textContent = '必要キャラクターLv：' + selected.required + ' ／ 消費MP：' + (mp.has(selected.level) ? mp.get(selected.level) : '未掲載') + (defense.has(selected.level) ? ' ／ 防御力：+' + defense.get(selected.level) : '');
        };
        select.addEventListener('change', update);
        cell.append(label, info, details);
        update();
      }
      return {row, text: normalize(text), levels, video: Boolean(row.querySelector('[data-skill-video]'))};
    });
    const form = document.createElement('form');
    form.className = 'skill-filters';
    form.setAttribute('aria-label', 'スキル絞り込み');
    form.innerHTML = `<label>名前・効果で検索<input type="search" name="query" placeholder="例：Swing、範囲、強化" autocomplete="off"></label><label>キャラクターLv<input type="number" name="level" min="1" step="1" placeholder="指定なし"></label><label class="skill-video-filter"><input type="checkbox" name="video">動画ありのみ</label><button type="reset">絞り込みを解除</button><p class="skill-filter-help">キャラクターLvを入力すると、Lv1の習得条件を満たすスキルを表示します。職業・装備などの条件は各説明をご確認ください。</p><p class="skill-filter-count" role="status"></p>`;
    const wrap = table.closest('.table-wrap') || table;
    wrap.before(form);
    const empty = document.createElement('p');
    empty.className = 'skill-filter-empty';
    empty.textContent = '条件に合うスキルはありません。検索語やレベル条件を変更してください。';
    empty.hidden = true;
    wrap.after(empty);
    const query = form.elements.namedItem('query');
    const level = form.elements.namedItem('level');
    const video = form.elements.namedItem('video');
    const count = form.querySelector('.skill-filter-count');
    function filter() {
      const words = normalize(query.value).split(/\s+/).filter(Boolean);
      const limit = level.value === '' ? null : Number(level.value);
      let shown = 0;
      entries.forEach(entry => {
        const first = entry.levels.find(item => item.level === 1);
        const visible = words.every(word => entry.text.includes(word)) && (!video.checked || entry.video) && (limit === null || (first && first.required <= limit));
        entry.row.hidden = !visible;
        if (visible) shown++;
      });
      count.textContent = `${shown} / ${entries.length}件を表示`;
      empty.hidden = shown !== 0;
    }
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', filter);
    form.addEventListener('change', filter);
    form.addEventListener('reset', () => { query.value = ''; level.value = ''; video.checked = false; filter(); });
    filter();
    // Direct links should remain reachable even after applying filters.
    window.addEventListener('hashchange', () => {
      const row = entries.find(entry => '#' + entry.row.id === location.hash && entry.row.id);
      if (row?.row.hidden) { form.reset(); row.row.scrollIntoView(); }
    });
  });
})();