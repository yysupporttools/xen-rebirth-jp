(() => {
  "use strict";
  const list = document.getElementById("updates-list");
  const toggle = document.getElementById("updates-toggle");
  const status = document.getElementById("updates-status");
  if (!list || !toggle || !status) return;

  if (!Array.isArray(window.SITE_UPDATES)) {
    status.textContent = "更新履歴を読み込めませんでした。時間をおいて再読み込みしてください。";
    return;
  }
  const entries = window.SITE_UPDATES.filter(entry => {
    if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return false;
    const date = new Date(`${entry.date}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === entry.date &&
      typeof entry.category === "string" && entry.category.trim() &&
      typeof entry.text === "string" && entry.text.trim();
  }).slice().sort((a, b) => b.date.localeCompare(a.date));

  let expanded = false;
  function render() {
    list.replaceChildren();
    for (const entry of expanded ? entries : entries.slice(0, 5)) {
      const row = document.createElement("li");
      const date = document.createElement("time");
      date.dateTime = entry.date;
      date.textContent = entry.date.replaceAll("-", "/");
      const category = document.createElement("span");
      category.className = "updates-category";
      category.textContent = entry.category;
      // Only relative links within this static site are accepted.
      const href = typeof entry.href === "string" && /^[a-zA-Z0-9_-]+\.html(?:#[a-zA-Z0-9_-]+)?$/.test(entry.href) ? entry.href : null;
      const content = document.createElement(href ? "a" : "span");
      content.className = "updates-content";
      content.textContent = entry.text;
      if (href) content.setAttribute("href", href);
      row.append(date, category, content);
      list.append(row);
    }
    status.textContent = entries.length ? `${entries.length}件中${Math.min(entries.length, expanded ? entries.length : 5)}件を表示` : "更新履歴はまだありません。";
    toggle.hidden = entries.length <= 5;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "最新5件に戻す ↑" : "更新履歴をすべて見る →";
  }
  toggle.addEventListener("click", () => { expanded = !expanded; render(); });
  render();
})();
