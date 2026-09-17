(() => {
  "use strict";

  function addHeroMonsters() {
    if (document.querySelector(".xen-hero-monsters")) {
      return;
    }

    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3")
    );

    const heading = headings.find(el =>
      el.textContent &&
      el.textContent.includes("もう一度、") &&
      el.textContent.includes("ゼンの世界へ。")
    );

    if (!heading) return;

    const hero =
      heading.closest("section") ||
      heading.closest(".hero") ||
      heading.parentElement;

    if (!hero) return;

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


  function addGuideMascots() {
    const settings = [
    {
      marker: "01 / START",
      className: "xen-guide-poyo"
    },
    {
      marker: "02 / CLASSES",
      className: "xen-guide-poko"
    },
    {
      marker: "03 / ADVENTURE",
      className: "xen-guide-poku"
    }
  ];

  const links = Array.from(
    document.querySelectorAll("a")
  );

  settings.forEach(setting => {
    const card = links.find(link =>
      link.textContent &&
      link.textContent.includes(setting.marker)
    );

    if (!card) return;

    if (card.querySelector(".xen-guide-mascot")) {
      return;
    }

    card.classList.add(
      "xen-guide-mascot-card"
    );

    const mascot =
      document.createElement("span");

    mascot.className =
      `xen-guide-mascot ${setting.className}`;

    mascot.setAttribute(
      "aria-hidden",
      "true"
    );

    card.appendChild(mascot);
  });


  /* QUESTSカード */

  const questCard = links.find(link =>
    link.textContent &&
    link.textContent.includes("04 / QUESTS")
  );

  if (
    questCard &&
    !questCard.querySelector(".xen-guide-stack")
  ) {
    questCard.classList.add(
      "xen-guide-mascot-card"
    );

    const stack =
      document.createElement("span");

    stack.className =
      "xen-guide-stack";

    stack.setAttribute(
      "aria-hidden",
      "true"
    );

    questCard.appendChild(stack);
  }
}
