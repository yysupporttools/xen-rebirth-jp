(() => {
  "use strict";

  const SUPABASE_URL =
    "https://dzxxjtmpcfsmvdgkcwvn.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_";

  const EVENT_STORAGE =
    "xen-new-seen-events-v1";

  const BOARD_STORAGE =
    "xen-new-seen-board-v1";


  /* ========================================
     localStorage
  ======================================== */

  function getStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function setStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 保存できない場合は何もしない */
    }
  }


  /* ========================================
     Supabase REST
  ======================================== */

  async function api(path) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `NEW badge API error: ${response.status}`
      );
    }

    return response.json();
  }


  /* ========================================
     イベント
     現在存在するイベントID一覧で判定
  ======================================== */

  async function getEventState() {
    const rows = await api(
      "xen_events?select=id&order=start_time.asc"
    );

    const ids = rows
      .map(row => String(row.id))
      .sort();

    return JSON.stringify(ids);
  }


  /* ========================================
     掲示板
     updated_at の最新値で判定
     新規質問・新しい回答の両方を検知
  ======================================== */

  async function getBoardState() {
    const rows = await api(
      "board_threads?select=id,updated_at&order=updated_at.desc&limit=1"
    );

    if (!rows.length) {
      return "";
    }

    return String(
      rows[0].updated_at || rows[0].id || ""
    );
  }


  /* ========================================
     NEWバッジ生成
  ======================================== */

  function createBadge(link) {
    if (
      !link ||
      link.querySelector(".xen-new-badge")
    ) {
      return;
    }

    const badge =
      document.createElement("span");

    badge.className =
      "xen-new-badge is-visible";

    badge.setAttribute(
      "aria-label",
      "新着あり"
    );

    badge.setAttribute(
      "aria-hidden",
      "true"
    );

    link.appendChild(badge);

    /*
      最初は消灯。
      約3秒後に点灯。
    */

    setTimeout(() => {
      badge.classList.add("is-on");
    }, 3000);
  }


  /* ========================================
     ナビリンク検索
  ======================================== */

  function findNavLink(fileName) {
    return Array.from(
      document.querySelectorAll("nav a")
    ).find(link => {
      const href =
        link.getAttribute("href") || "";

      return href.endsWith(fileName);
    });
  }


  /* ========================================
     イベントNEW
  ======================================== */

  async function checkEvents() {
    const current =
      await getEventState();

    const seen =
      getStorage(EVENT_STORAGE);

    /*
      初回アクセス時は現在のイベントを
      基準値として保存。
      過去イベント全部をNEWにしない。
    */

    if (seen === null) {
      setStorage(
        EVENT_STORAGE,
        current
      );

      return;
    }

    /*
      イベントページを開いたら既読
    */

    const currentFile =
      location.pathname.split("/").pop() || "";

    if (currentFile === "events.html") {
      setStorage(EVENT_STORAGE,current);

      const existing =
        findNavLink("events.html")?.querySelector(".xen-new-badge");

      if (existing) {
        existing.remove();
      }

      return;
    }

    if (seen !== current) {
      createBadge(
        findNavLink("events.html")
      );
    }
  }


  /* ========================================
     掲示板NEW
  ======================================== */

  async function checkBoard() {
    const current =
      await getBoardState();

    const seen =
      getStorage(BOARD_STORAGE);

    /*
      初回は現在値を保存
    */

    if (seen === null) {
      setStorage(
        BOARD_STORAGE,
        current
      );

      return;
    }

    /*
      掲示板を開いたら既読
    */

    const currentFile =
      location.pathname.split("/").pop() || "";

    if (currentFile === "board.html") {
      setStorage(BOARD_STORAGE,current);

      const existing =
        findNavLink("board.html")?.querySelector(".xen-new-badge");

      if (existing) {
        existing.remove();
      }

      return;
    }

    if (
      current &&
      seen !== current
    ) {
      createBadge(
        findNavLink("board.html")
      );
    }
  }


  /* ========================================
     初期化
  ======================================== */

  async function init() {
    try {
      await Promise.all([
        checkEvents(),
        checkBoard()
      ]);
    } catch (error) {
      console.error(
        "NEW badge:",
        error
      );
    }
  }


  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();
