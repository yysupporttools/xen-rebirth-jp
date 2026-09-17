(() => {
  "use strict";

  function addHeroMonsters() {
    if (document.querySelector(".xen-hero-monsters")) {
      return;
    }

    /* 見出しだけからヒーロータイトルを探す */
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3")
    );

    const heading = headings.find(el =>
      el.textContent &&
      el.textContent.includes("もう一度、ゼンの世界へ。")
    );

    if (!heading) {
      return;
    }

    /* 見出しを含むヒーロー領域を取得 */
    const hero =
      heading.closest("section") ||
      heading.closest(".hero") ||
      heading.parentElement;

    if (!hero) {
      return;
    }

    if (getComputedStyle(hero).position === "static") {
      hero.style.position = "relative";
    }

    hero.style.overflow = "visible";

    const monsters = document.createElement("div");

    monsters.className = "xen-hero-monsters";
    monsters.setAttribute("aria-hidden", "true");

    monsters.innerHTML =
      '<div class="xen-monster-trio-art"></div>';

    hero.appendChild(monsters);
  }

  function addBgmMascot() {
    if (document.querySelector(".xen-bgm-mascot")) {
      return;
    }

    if (!document.querySelector(".xen-bgm-player")) {
      return;
    }

    const mascot = document.createElement("div");

    mascot.className = "xen-bgm-mascot";
    mascot.setAttribute("aria-hidden", "true");

    document.body.appendChild(mascot);
  }

  function init() {
    addHeroMonsters();

    /* BGMプレイヤー生成を待ちながら数回確認 */
    let tries = 0;

    const timer = setInterval(() => {
      addBgmMascot();

      tries++;

      if (
        document.querySelector(".xen-bgm-mascot") ||
        tries >= 20
      ) {
        clearInterval(timer);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
