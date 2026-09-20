"use strict";
(() => {
  const select = document.getElementById("cc-class");
  if (!select) return;
  const status = document.getElementById("cc-filter-status");
  const allowed = new Set([...select.options].map(option => option.value));
  const requested = new URL(location.href).searchParams.get("class");
  select.value = allowed.has(requested) ? requested : "all";
  const update = (replaceUrl) => {
    const selected = select.value;
    document.querySelectorAll("[data-cc-class]").forEach(card => {
      card.hidden = selected !== "all" && card.dataset.ccClass !== selected;
    });
    document.querySelectorAll(".cc-job-grid").forEach(grid => grid.classList.toggle("cc-filtered", selected !== "all"));
    status.textContent = selected === "all" ? "全職業を表示中" : `${select.selectedOptions[0].textContent}の情報を表示中（共通手順はそのまま読めます）`;
    if (replaceUrl) {
      const url = new URL(location.href);
      if (selected === "all") url.searchParams.delete("class");
      else url.searchParams.set("class", selected);
      history.replaceState(null, "", url);
    }
  };
  update(false);
  document.querySelector(".cc-picker").hidden = false;
  select.addEventListener("change", () => update(true));
})();
