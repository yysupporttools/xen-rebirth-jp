"use strict";

(() => {

  /* ========================================
     CONFIG
  ======================================== */

  const CFG =
    window.XEN_GLOSSARY_CONFIG || {};

  const $ =
    id =>
      document.getElementById(id);


  const query =
    $("glossary-query");

  const categorySelect =
    $("glossary-category");

  const countEl =
    $("glossary-count");

  const emptyEl =
    $("glossary-empty");

  const resultsEl =
    $("glossary-results");

  const syncStatus =
    $("glossary-sync-status");


  if (
    !query ||
    !categorySelect ||
    !countEl ||
    !emptyEl ||
    !resultsEl
  ) {
    console.error(
      "Glossary: 必要なHTML要素が見つかりません。"
    );

    return;
  }


  let categories = [];
  let terms = [];

  let usingSharedData = false;
  let editingTerm = null;
  let modalOpener = null;

  let previewUrl = null;
  let selectedImageFile = null;


  const filters = {
    major: "",
    index: ""
  };


  /* ========================================
     INDEX
  ======================================== */

  const ALPHA =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");


  const KANA = [
    "あ","い","う","え","お",
    "か","き","く","け","こ",
    "さ","し","す","せ","そ",
    "た","ち","つ","て","と",
    "な","に","ぬ","ね","の",
    "は","ひ","ふ","へ","ほ",
    "ま","み","む","め","も",
    "や","ゆ","よ",
    "ら","り","る","れ","ろ",
    "わ","を","ん"
  ];


  /* ========================================
     UTIL
  ======================================== */

  const esc =
    value =>
      String(
        value ?? ""
      ).replace(
        /[&<>"']/g,
        char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]
      );


  const normalize =
    value =>
      String(
        value ?? ""
      )
        .normalize("NFKC")
        .toLocaleLowerCase("ja")
        .replace(
          /[’‘]/g,
          "'"
        )
        .trim();


  function configured() {

    return (
      /^https?:\/\//.test(
        CFG.SUPABASE_URL || ""
      ) &&
      (
        CFG.SUPABASE_ANON_KEY ||
        ""
      ).length > 20
    );
  }


  function safeUrl(value) {

    if (!value) {
      return "";
    }

    try {

      const url =
        new URL(
          value,
          location.href
        );

      return [
        "http:",
        "https:"
      ].includes(
        url.protocol
      )
        ? url.href
        : "";

    } catch {

      return "";
    }
  }


  function authHeaders() {

    const headers = {
      apikey:
        CFG.SUPABASE_ANON_KEY
    };


    if (
      CFG.SUPABASE_ANON_KEY &&
      !CFG.SUPABASE_ANON_KEY.startsWith(
        "sb_publishable_"
      )
    ) {

      headers.Authorization =
        "Bearer " +
        CFG.SUPABASE_ANON_KEY;
    }


    return headers;
  }


  function api(
    path,
    options = {}
  ) {

    const headers =
      Object.assign(
        {
          ...authHeaders(),

          "Content-Type":
            "application/json"
        },
        options.headers || {}
      );


    return fetch(
      CFG.SUPABASE_URL +
      path,
      {
        ...options,
        headers
      }
    );
  }


  /* ========================================
     CATEGORY
  ======================================== */

  function getCategoryName(term) {

    const category =
      categories.find(
        item =>
          String(item.id) ===
          String(term.category_id)
      );


    return (
      category?.name ||
      ""
    );
  }


  /* ========================================
     MAJOR CATEGORY
  ======================================== */

  function getMajorGroups(term) {

    const category =
      normalize(
        getCategoryName(term)
      );


    const text =
      normalize(
        [
          category,
          term.name_en,
          term.name_ja,
          term.aliases,
          term.description,
          term.drop_location,
          term.acquisition,
          term.related_entity,
          term.notes
        ].join(" ")
      );


    const groups =
      new Set();


    /*
      クラス
    */

    if (
      /クラス|職業|転職用装備|アーチャー|クレリック|ナイト|メイジ|ローグ|テンプラー|xenian|archer|cleric|knight|mage|rogue|templar/.test(
        text
      )
    ) {

      groups.add(
        "class"
      );
    }


    /*
      アイテム
    */

    if (
      /アイテム|素材|装備|武器|防具|消耗品|転職素材|stone|orb|tonic|blood|weapon|armor|item|ペット|pet/.test(
        text
      )
    ) {

      groups.add(
        "item"
      );
    }


    /*
      世界地図
    */

    if (
      /マップ|地図|世界|町|村|地域|フィールド|npc|モンスター|monster|map/.test(
        text
      )
    ) {

      groups.add(
        "world"
      );
    }


    /*
      クエスト
    */

    if (
      /クエスト|quest|転職/.test(
        text
      )
    ) {

      groups.add(
        "quest"
      );
    }


    /*
      ダンジョン・ボス
    */

    if (
      /ダンジョン|ボス|インスタンス|dungeon|boss|instance/.test(
        text
      )
    ) {

      groups.add(
        "dungeon"
      );
    }


    return [
      ...groups
    ];
  }


  /* ========================================
     KATAKANA → HIRAGANA
  ======================================== */

  function katakanaToHiragana(
    text
  ) {

    return String(
      text || ""
    ).replace(
      /[\u30a1-\u30f6]/g,
      character => {

        return String.fromCharCode(
          character.charCodeAt(0) -
          0x60
        );
      }
    );
  }


  /* ========================================
     VOICED KANA NORMALIZE
  ======================================== */

  function normalizeKanaInitial(
    character
  ) {

    const map = {

      /*
        が行
      */

      "が": "か",
      "ぎ": "き",
      "ぐ": "く",
      "げ": "け",
      "ご": "こ",

      /*
        ざ行
      */

      "ざ": "さ",
      "じ": "し",
      "ず": "す",
      "ぜ": "せ",
      "ぞ": "そ",

      /*
        だ行
      */

      "だ": "た",
      "ぢ": "ち",
      "づ": "つ",
      "で": "て",
      "ど": "と",

      /*
        ば行
      */

      "ば": "は",
      "び": "ひ",
      "ぶ": "ふ",
      "べ": "へ",
      "ぼ": "ほ",

      /*
        ぱ行
      */

      "ぱ": "は",
      "ぴ": "ひ",
      "ぷ": "ふ",
      "ぺ": "へ",
      "ぽ": "ほ",

      /*
        その他
      */

      "ゔ": "う",

      "ぁ": "あ",
      "ぃ": "い",
      "ぅ": "う",
      "ぇ": "え",
      "ぉ": "お",

      "ゃ": "や",
      "ゅ": "ゆ",
      "ょ": "よ",

      "っ": "つ",

      "ゎ": "わ"
    };


    return (
      map[character] ||
      character
    );
  }


  /* ========================================
     LATIN INITIAL
  ======================================== */

  function latinInitial(term) {

    const text =
      String(
        term.name_en || ""
      )
        .trim()
        .normalize("NFKC");


    if (!text) {
      return "";
    }


    const first =
      text
        .charAt(0)
        .toUpperCase();


    /*
      英字
    */

    if (
      /^[A-Z]$/.test(
        first
      )
    ) {

      return first;
    }


    /*
      日本語の場合は
      #にしない
    */

    if (
      /[\u3040-\u30ff\u3400-\u9fff]/.test(
        first
      )
    ) {

      return "";
    }


    /*
      数字・記号
    */

    return "#";
  }


  /* ========================================
     JAPANESE INITIAL
  ======================================== */

  function japaneseInitial(term) {

    /*
      日本語名を最優先。

      日本語名が無い場合は
      name_en に日本語が入っている
      既存データにも対応。

      aliases も最後に確認。
    */

    const candidates = [
      term.name_ja,
      term.name_en,
      term.aliases
    ];


    for (
      const candidate of candidates
    ) {

      const raw =
        String(
          candidate || ""
        )
          .trim()
          .normalize("NFKC");


      if (!raw) {
        continue;
      }


      const hiragana =
        katakanaToHiragana(
          raw
        );


      const first =
        hiragana.charAt(0);


      /*
        ひらがななら採用
      */

      if (
        /^[ぁ-んゔ]$/.test(
          first
        )
      ) {

        return normalizeKanaInitial(
          first
        );
      }
    }


    return "";
  }


  /* ========================================
     DEFAULT GROUP INITIAL
  ======================================== */

  function displayInitial(term) {

    const latin =
      latinInitial(term);


    if (latin) {
      return latin;
    }


    const japanese =
      japaneseInitial(term);


    if (japanese) {
      return japanese;
    }


    return "#";
  }


  /* ========================================
     BUILD INDEX
  ======================================== */

  function buildIndexes() {

    const alpha =
      $("glossary-alpha-index");

    const kana =
      $("glossary-kana-index");


    if (
      !alpha ||
      !kana
    ) {

      console.error(
        "Glossary: 索引エリアが見つかりません。"
      );

      return;
    }


    alpha.innerHTML =
      [
        `
          <button
            type="button"
            class="is-active"
            data-index=""
          >
            すべて
          </button>
        `,

        ...ALPHA.map(
          letter => `
            <button
              type="button"
              data-index="${letter}"
            >
              ${letter}
            </button>
          `
        ),

        `
          <button
            type="button"
            data-index="#"
          >
            #
          </button>
        `
      ].join("");


    kana.innerHTML =
      [
        `
          <button
            type="button"
            data-index=""
          >
            すべて
          </button>
        `,

        ...KANA.map(
          letter => `
            <button
              type="button"
              data-index="ja:${letter}"
            >
              ${letter}
            </button>
          `
        )

      ].join("");


    document
      .querySelectorAll(
        "[data-index]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              filters.index =
                button.dataset.index ||
                "";


              document
                .querySelectorAll(
                  "[data-index]"
                )
                .forEach(
                  item => {

                    item.classList.remove(
                      "is-active"
                    );
                  }
                );


              button.classList.add(
                "is-active"
              );


              renderTerms();
            }
          );
        }
      );
  }


  /* ========================================
     MAJOR INDEX
  ======================================== */

  function bindMajorIndex() {

    document
      .querySelectorAll(
        "[data-major]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              filters.major =
                button.dataset.major ||
                "";


              document
                .querySelectorAll(
                  "[data-major]"
                )
                .forEach(
                  item => {

                    item.classList.remove(
                      "is-active"
                    );
                  }
                );


              button.classList.add(
                "is-active"
              );


              renderTerms();
            }
          );
        }
      );
  }


  /* ========================================
     CATEGORY OPTIONS
  ======================================== */

  function categoryOptions() {

    const selected =
      categorySelect.value;


    categorySelect.innerHTML =
      `
        <option value="">
          すべての分類
        </option>
      ` +
      categories
        .map(
          category => `
            <option
              value="${esc(category.name)}"
            >
              ${esc(category.name)}
            </option>
          `
        )
        .join("");


    categorySelect.value =
      categories.some(
        item =>
          item.name ===
          selected
      )
        ? selected
        : "";


    const editCategory =
      $("edit-category");


    if (editCategory) {

      editCategory.innerHTML =
        `
          <option value="">
            分類を選択
          </option>
        ` +
        categories
          .map(
            category => `
              <option
                value="${esc(category.id)}"
              >
                ${esc(category.name)}
              </option>
            `
          )
          .join("");
    }
  }


  /* ========================================
     FILTER
  ======================================== */

  function filteredTerms() {

    const words =
      normalize(
        query.value
      )
        .split(/\s+/)
        .filter(Boolean);


    return terms
      .filter(
        term => {

          const category =
            getCategoryName(
              term
            );


          const searchText =
            normalize(
              [
                term.name_en,
                term.name_ja,
                term.aliases,
                category,
                term.description,
                term.drop_location,
                term.acquisition,
                term.related_entity,
                term.notes
              ].join(" ")
            );


          /*
            SEARCH
          */

          if (
            !words.every(
              word =>
                searchText.includes(
                  word
                )
            )
          ) {

            return false;
          }


          /*
            CATEGORY
          */

          if (
            categorySelect.value &&
            category !==
            categorySelect.value
          ) {

            return false;
          }


          /*
            MAJOR CATEGORY
          */

          if (
            filters.major &&
            !getMajorGroups(term)
              .includes(
                filters.major
              )
          ) {

            return false;
          }


          /*
            INDEX
          */

          if (
            filters.index
          ) {

            /*
              日本語
            */

            if (
              filters.index.startsWith(
                "ja:"
              )
            ) {

              const kana =
                filters.index.slice(
                  3
                );


              if (
                japaneseInitial(term) !==
                kana
              ) {

                return false;
              }

            } else {

              /*
                英字 / #
              */

              if (
                filters.index ===
                "#"
              ) {

                if (
                  displayInitial(term) !==
                  "#"
                ) {

                  return false;
                }

              } else {

                if (
                  latinInitial(term) !==
                  filters.index
                ) {

                  return false;
                }
              }
            }
          }


          return true;
        }
      )
      .sort(
        (a, b) => {

          const aa =
            normalize(
              a.name_en ||
              a.name_ja
            );


          const bb =
            normalize(
              b.name_en ||
              b.name_ja
            );


          return aa.localeCompare(
            bb,
            "ja"
          );
        }
      );
  }


  /* ========================================
     DETAIL
  ======================================== */

  function detail(
    label,
    value
  ) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {

      return "";
    }


    return `
      <div class="glossary-detail">

        <strong>
          ${esc(label)}
        </strong>

        <span>
          ${esc(value)
            .replace(
              /\n/g,
              "<br>"
            )}
        </span>

      </div>
    `;
  }


  /* ========================================
     TERM HTML
  ======================================== */

  function termHtml(term) {

    const category =
      getCategoryName(
        term
      );


    const imageUrl =
      safeUrl(
        term.image_url
      );


    const image =
      imageUrl
        ? `
          <img
            class="glossary-thumb"
            src="${esc(imageUrl)}"
            alt="${esc(
              term.name_en ||
              term.name_ja ||
              "用語画像"
            )}"
            loading="lazy"
          >
        `
        : `
          <div
            class="glossary-thumb glossary-thumb-empty"
            aria-hidden="true"
          >
            ?
          </div>
        `;


    const jp =
      term.name_ja
        ? `
          <span class="glossary-name-ja">
            ${esc(term.name_ja)}
          </span>
        `
        : "";


    const alias =
      term.aliases
        ? `
          <span class="glossary-alias">
            別表記：
            ${esc(term.aliases)}
          </span>
        `
        : "";


    const details =
      [

        detail(
          "ドロップ場所",
          term.drop_location
        ),

        detail(
          "入手方法",
          term.acquisition
        ),

        detail(
          "関連NPC / モンスター",
          term.related_entity
        ),

        detail(
          "必要Lv",
          term.required_level
        ),

        detail(
          "備考",
          term.notes
        )

      ]
        .filter(Boolean)
        .join("");


    const guide =
      safeUrl(
        term.related_guide
      );


    const source =
      safeUrl(
        term.source_url
      );


    const updated =
      term.updated_at
        ? new Date(
            term.updated_at
          ).toLocaleString(
            "ja-JP"
          )
        : "";


    return `
      <article
        class="glossary-entry"
        id="${esc(
          term.slug ||
          term.id
        )}"
      >

        <details>

          <summary>

            ${image}


            <div class="glossary-summary-text">

              <div class="glossary-title-line">

                <strong
                  class="glossary-name-en"
                >
                  ${esc(
                    term.name_en ||
                    term.name_ja ||
                    "名称未設定"
                  )}
                </strong>

                ${jp}

              </div>


              <div
                class="glossary-summary-bottom"
              >

                <span
                  class="glossary-category-badge"
                >
                  ${esc(
                    category ||
                    "未分類"
                  )}
                </span>

                ${alias}

              </div>

            </div>


            <span
              class="glossary-open-icon"
              aria-hidden="true"
            >
              ＋
            </span>

          </summary>


          <div
            class="glossary-entry-detail"
          >

            <p
              class="glossary-description"
            >
              ${esc(
                term.description ||
                ""
              ).replace(
                /\n/g,
                "<br>"
              )}
            </p>


            ${
              details
                ? `
                  <div
                    class="glossary-detail-list"
                  >
                    ${details}
                  </div>
                `
                : ""
            }


            <div
              class="glossary-links"
            >

              ${
                guide
                  ? `
                    <a
                      href="${esc(guide)}"
                    >
                      関連ガイド
                    </a>
                  `
                  : ""
              }


              ${
                source
                  ? `
                    <a
                      href="${esc(source)}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      公式の出典 ↗
                    </a>
                  `
                  : ""
              }


              <a
                href="#${esc(
                  term.slug ||
                  term.id
                )}"
              >
                この項目へのリンク
              </a>


              <button
                type="button"
                class="glossary-edit-button"
                data-edit-id="${esc(
                  term.id
                )}"
              >
                編集
              </button>

            </div>


            ${
              updated
                ? `
                  <div
                    class="glossary-updated"
                  >

                    更新：
                    ${esc(updated)}

                    ${
                      term.contributor_name
                        ? `
                          / 投稿：
                          ${esc(
                            term.contributor_name
                          )}
                        `
                        : ""
                    }

                  </div>
                `
                : ""
            }

          </div>

        </details>

      </article>
    `;
  }


  /* ========================================
     RENDER
  ======================================== */

  function renderTerms() {

    const rows =
      filteredTerms();


    countEl.textContent =
      `${rows.length} / ${terms.length}件`;


    emptyEl.hidden =
      rows.length !== 0;


    if (
      !rows.length
    ) {

      resultsEl.innerHTML =
        "";

      return;
    }


    const groups =
      new Map();


    for (
      const term of rows
    ) {

      let key;


      /*
        日本語索引選択中
      */

      if (
        filters.index.startsWith(
          "ja:"
        )
      ) {

        key =
          japaneseInitial(term) ||
          "#";

      } else {

        key =
          displayInitial(term);
      }


      if (
        !groups.has(key)
      ) {

        groups.set(
          key,
          []
        );
      }


      groups
        .get(key)
        .push(term);
    }


    /*
      グループ順
    */

    const order =
      [
        ...ALPHA,
        "#",
        ...KANA
      ];


    const sortedGroups =
      [
        ...groups.entries()
      ].sort(
        (a, b) => {

          const ai =
            order.indexOf(
              a[0]
            );

          const bi =
            order.indexOf(
              b[0]
            );


          if (
            ai === -1 &&
            bi === -1
          ) {

            return String(
              a[0]
            ).localeCompare(
              String(b[0]),
              "ja"
            );
          }


          if (
            ai === -1
          ) {
            return 1;
          }


          if (
            bi === -1
          ) {
            return -1;
          }


          return ai - bi;
        }
      );


    resultsEl.innerHTML =
      sortedGroups
        .map(
          ([key, items]) => `

            <section
              class="glossary-letter-section"
            >

              <h2>
                ${esc(key)}
              </h2>


              <div
                class="glossary-compact-list"
              >

                ${items
                  .map(
                    termHtml
                  )
                  .join("")}

              </div>

            </section>

          `
        )
        .join("");


    bindEditButtons();

    openHashTarget();
  }


  /* ========================================
     LOAD
  ======================================== */

  async function loadShared() {

    if (
      !configured()
    ) {

      if (syncStatus) {

        syncStatus.textContent =
          "共同編集の接続設定がありません。";
      }


      resultsEl.innerHTML =
        `
          <p class="notice">
            用語集を読み込めませんでした。
          </p>
        `;


      countEl.textContent =
        "0件";


      return false;
    }


    try {

      if (syncStatus) {

        syncStatus.textContent =
          "用語集を読み込んでいます…";
      }


      const [
        categoryResponse,
        termResponse
      ] =
        await Promise.all([

          api(
            "/rest/v1/glossary_categories?select=*&order=sort_order.asc,name.asc"
          ),

          api(
            "/rest/v1/glossary_terms?select=*&order=name_en.asc,name_ja.asc"
          )

        ]);


      if (
        !categoryResponse.ok
      ) {

        throw new Error(
          "分類データを取得できませんでした。"
        );
      }


      if (
        !termResponse.ok
      ) {

        throw new Error(
          "用語データを取得できませんでした。"
        );
      }


      categories =
        await categoryResponse.json();


      terms =
        await termResponse.json();


      usingSharedData =
        true;


      categoryOptions();

      renderTerms();


      if (syncStatus) {

        syncStatus.textContent =
          `共同編集に接続済み：${terms.length}件・${categories.length}分類`;
      }


      return true;


    } catch (
      error
    ) {

      console.error(
        "Glossary load error:",
        error
      );


      if (syncStatus) {

        syncStatus.textContent =
          "用語集を取得できませんでした。ページを再読み込みしてください。";
      }


      resultsEl.innerHTML =
        `
          <p class="notice">
            用語集の読み込みに失敗しました。
          </p>
        `;


      countEl.textContent =
        "読み込み失敗";


      return false;
    }
  }


  /* ========================================
     HASH
  ======================================== */

  function openHashTarget() {

    if (
      !location.hash
    ) {
      return;
    }


    let id;


    try {

      id =
        decodeURIComponent(
          location.hash.slice(1)
        );

    } catch {

      return;
    }


    const target =
      document.getElementById(
        id
      );


    if (!target) {
      return;
    }


    const details =
      target.querySelector(
        "details"
      );


    if (details) {

      details.open =
        true;
    }


    requestAnimationFrame(
      () => {

        target.scrollIntoView({
          behavior:
            "smooth",

          block:
            "center"
        });

      }
    );
  }


  /* ========================================
     MODAL
  ======================================== */

  function openModal(id) {

    const modal =
      $(id);


    if (!modal) {
      return;
    }


    modalOpener =
      document.activeElement;


    modal.hidden =
      false;


    document.body.style.overflow =
      "hidden";


    modal
      .querySelector(
        "input:not([type=hidden]),button"
      )
      ?.focus();
  }


  function closeModal(id) {

    const modal =
      $(id);


    if (!modal) {
      return;
    }


    modal.hidden =
      true;


    document.body.style.overflow =
      "";


    modalOpener
      ?.focus();
  }


  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            closeModal(
              button.dataset.closeModal
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      ".glossary-modal"
    )
    .forEach(
      modal => {

        modal.addEventListener(
          "click",
          event => {

            if (
              event.target ===
              modal
            ) {

              closeModal(
                modal.id
              );
            }
          }
        );
      }
    );


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !==
        "Escape"
      ) {
        return;
      }


      const modal =
        document.querySelector(
          ".glossary-modal:not([hidden])"
        );


      if (modal) {

        closeModal(
          modal.id
        );
      }
    }
  );


  /* ========================================
     FORM
  ======================================== */

  function fillTermForm(
    term = null
  ) {

    editingTerm =
      term;


    $("glossary-editor-title")
      .textContent =
      term
        ? "用語を編集"
        : "用語を追加";


    $("edit-term-id").value =
      term?.id || "";


    $("edit-term-slug").value =
      term?.slug || "";


    $("edit-name-en").value =
      term?.name_en || "";


    $("edit-name-ja").value =
      term?.name_ja || "";


    $("edit-aliases").value =
      term?.aliases || "";


    $("edit-category").value =
      term?.category_id || "";


    $("edit-description").value =
      term?.description || "";


    $("edit-drop-location").value =
      term?.drop_location || "";


    $("edit-acquisition").value =
      term?.acquisition || "";


    $("edit-related-entity").value =
      term?.related_entity || "";


    $("edit-required-level").value =
      term?.required_level ??
      "";


    $("edit-notes").value =
      term?.notes || "";


    $("edit-related-guide").value =
      term?.related_guide || "";


    $("edit-source-url").value =
      term?.source_url || "";


    $("edit-contributor").value =
      "";


    selectedImageFile =
      null;


    const imageInput =
      $("edit-image");


    if (imageInput) {

      imageInput.value =
        "";
    }


    if (
      previewUrl
    ) {

      URL.revokeObjectURL(
        previewUrl
      );

      previewUrl =
        null;
    }


    const preview =
      $("edit-image-preview");


    const existing =
      safeUrl(
        term?.image_url
      );


    if (
      preview
    ) {

      if (
        existing
      ) {

        preview.src =
          existing;

        preview.hidden =
          false;

      } else {

        preview.removeAttribute(
          "src"
        );

        preview.hidden =
          true;
      }
    }


    const imageStatus =
      $("glossary-image-status");


    if (
      imageStatus
    ) {

      imageStatus.textContent =
        "";
    }


    const saveStatus =
      $("glossary-save-status");


    if (
      saveStatus
    ) {

      saveStatus.textContent =
        "";
    }
  }


  /* ========================================
     IMAGE VALIDATE
  ======================================== */

  function validateImage(
    file
  ) {

    if (!file) {

      throw new Error(
        "画像を取得できませんでした。"
      );
    }


    if (
      file.size >
      5 * 1024 * 1024
    ) {

      throw new Error(
        "画像は5MB以下にしてください。"
      );
    }


    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif"
      ].includes(
        file.type
      )
    ) {

      throw new Error(
        "PNG / JPG / WebP / GIF画像を使用してください。"
      );
    }
  }


  /* ========================================
     IMAGE PREVIEW
  ======================================== */

  function setImage(
    file,
    source
  ) {

    const status =
      $("glossary-image-status");


    try {

      validateImage(
        file
      );


      selectedImageFile =
        file;


      if (
        previewUrl
      ) {

        URL.revokeObjectURL(
          previewUrl
        );
      }


      previewUrl =
        URL.createObjectURL(
          file
        );


      const preview =
        $("edit-image-preview");


      if (
        preview
      ) {

        preview.src =
          previewUrl;

        preview.hidden =
          false;
      }


      const label =
        source === "paste"
          ? "コピーした画像を貼り付けました"
          : source === "drop"
          ? "画像をドロップしました"
          : "画像を選択しました";


      if (
        status
      ) {

        status.textContent =
          `📋 ${label}（${(
            file.size /
            1024 /
            1024
          ).toFixed(2)} MB）`;
      }


    } catch (
      error
    ) {

      selectedImageFile =
        null;


      if (
        status
      ) {

        status.textContent =
          error.message;
      }
    }
  }


  /* ========================================
     FILE SELECT
  ======================================== */

  $("edit-image")
    ?.addEventListener(
      "change",
      event => {

        const file =
          event.target
            .files?.[0];


        if (!file) {
          return;
        }


        setImage(
          file,
          "select"
        );
      }
    );


  /* ========================================
     CTRL + V
  ======================================== */

  document.addEventListener(
    "paste",
    event => {

      const modal =
        $("glossary-editor-modal");


      if (
        !modal ||
        modal.hidden
      ) {

        return;
      }


      const items =
        Array.from(
          event.clipboardData
            ?.items || []
        );


      const imageItem =
        items.find(
          item =>
            item.type &&
            item.type.startsWith(
              "image/"
            )
        );


      if (
        !imageItem
      ) {
        return;
      }


      event.preventDefault();


      const blob =
        imageItem.getAsFile();


      if (!blob) {
        return;
      }


      const extensions = {

        "image/png":
          "png",

        "image/jpeg":
          "jpg",

        "image/webp":
          "webp",

        "image/gif":
          "gif"

      };


      const extension =
        extensions[
          blob.type
        ] || "png";


      const file =
        new File(
          [blob],

          `clipboard-${Date.now()}.${extension}`,

          {
            type:
              blob.type ||
              "image/png",

            lastModified:
              Date.now()
          }
        );


      setImage(
        file,
        "paste"
      );

    },
    true
  );


  /* ========================================
     DRAG & DROP
  ======================================== */

  const pasteZone =
    $("glossary-paste-zone");


  if (
    pasteZone
  ) {

    [
      "dragenter",
      "dragover"
    ].forEach(
      eventName => {

        pasteZone.addEventListener(
          eventName,
          event => {

            event.preventDefault();


            pasteZone.classList.add(
              "is-dragging"
            );
          }
        );
      }
    );


    [
      "dragleave",
      "drop"
    ].forEach(
      eventName => {

        pasteZone.addEventListener(
          eventName,
          event => {

            event.preventDefault();


            pasteZone.classList.remove(
              "is-dragging"
            );
          }
        );
      }
    );


    pasteZone.addEventListener(
      "drop",
      event => {

        const files =
          Array.from(
            event.dataTransfer
              ?.files || []
          );


        const image =
          files.find(
            file =>
              file.type &&
              file.type.startsWith(
                "image/"
              )
          );


        if (
          !image
        ) {

          const status =
            $("glossary-image-status");


          if (
            status
          ) {

            status.textContent =
              "画像ファイルをドロップしてください。";
          }


          return;
        }


        setImage(
          image,
          "drop"
        );
      }
    );


    pasteZone.addEventListener(
      "click",
      () => {

        $("edit-image")
          ?.click();
      }
    );
  }


  /* ========================================
     IMAGE UPLOAD
  ======================================== */

  async function uploadImage(
    id,
    file
  ) {

    if (!file) {

      return (
        editingTerm?.image_url ||
        null
      );
    }


    validateImage(
      file
    );


    const extension =
      (
        file.name
          ?.split(".")
          .pop() ||
        file.type
          ?.split("/")[1] ||
        "png"
      )
        .replace(
          /[^a-z0-9]/gi,
          ""
        )
        .toLowerCase();


    const objectName =
      `${id}/${Date.now()}.${extension}`;


    const response =
      await fetch(

        `${CFG.SUPABASE_URL}/storage/v1/object/glossary-images/${objectName}`,

        {
          method:
            "POST",

          headers: {
            ...authHeaders(),

            "Content-Type":
              file.type ||
              "application/octet-stream"
          },

          body:
            file
        }
      );


    if (
      !response.ok
    ) {

      const message =
        await response.text()
          .catch(
            () => ""
          );


      throw new Error(
        "画像をアップロードできませんでした。" +
        (
          message
            ? " " + message
            : ""
        )
      );
    }


    return (
      `${CFG.SUPABASE_URL}/storage/v1/object/public/glossary-images/${objectName}`
    );
  }


  /* ========================================
     EDIT BUTTON
  ======================================== */

  function bindEditButtons() {

    document
      .querySelectorAll(
        "[data-edit-id]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            event => {

              event.preventDefault();


              const term =
                terms.find(
                  item =>
                    String(item.id) ===
                    String(
                      button.dataset.editId
                    )
                );


              if (!term) {
                return;
              }


              fillTermForm(
                term
              );


              openModal(
                "glossary-editor-modal"
              );
            }
          );
        }
      );
  }


  /* ========================================
     ADD TERM
  ======================================== */

  $("glossary-add-term")
    ?.addEventListener(
      "click",
      () => {

        if (
          !configured()
        ) {

          alert(
            "Supabase設定がありません。"
          );

          return;
        }


        if (
          !usingSharedData
        ) {

          alert(
            "共同編集に接続できていません。"
          );

          return;
        }


        fillTermForm();


        openModal(
          "glossary-editor-modal"
        );
      }
    );


  /* ========================================
     SAVE TERM
  ======================================== */

  $("glossary-editor-form")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const submit =
          event.submitter;


        const status =
          $("glossary-save-status");


        if (
          submit
        ) {

          submit.disabled =
            true;
        }


        if (
          status
        ) {

          status.textContent =
            "保存中…";
        }


        try {

          const id =
            $("edit-term-id")
              .value ||
            null;


          const uploadId =
            id ||
            crypto.randomUUID();


          const imageUrl =
            await uploadImage(
              uploadId,
              selectedImageFile
            );


          const payload = {

            p_id:
              id,

            p_slug:
              $("edit-term-slug")
                .value ||
              null,

            p_name_en:
              $("edit-name-en")
                .value
                .trim(),

            p_name_ja:
              $("edit-name-ja")
                .value
                .trim() ||
              null,

            p_aliases:
              $("edit-aliases")
                .value
                .trim() ||
              null,

            p_category_id:
              $("edit-category")
                .value,

            p_description:
              $("edit-description")
                .value
                .trim(),

            p_drop_location:
              $("edit-drop-location")
                .value
                .trim() ||
              null,

            p_acquisition:
              $("edit-acquisition")
                .value
                .trim() ||
              null,

            p_related_entity:
              $("edit-related-entity")
                .value
                .trim() ||
              null,

            p_required_level:
              $("edit-required-level")
                .value
                ? Number(
                    $("edit-required-level")
                      .value
                  )
                : null,

            p_notes:
              $("edit-notes")
                .value
                .trim() ||
              null,

            p_related_guide:
              $("edit-related-guide")
                .value
                .trim() ||
              null,

            p_source_url:
              $("edit-source-url")
                .value
                .trim() ||
              null,

            p_image_url:
              imageUrl,

            p_contributor_name:
              $("edit-contributor")
                .value
                .trim() ||
              null

          };


          const response =
            await api(
              "/rest/v1/rpc/glossary_save_term",

              {
                method:
                  "POST",

                body:
                  JSON.stringify(
                    payload
                  )
              }
            );


          if (
            !response.ok
          ) {

            throw new Error(
              await response.text()
            );
          }


          if (
            status
          ) {

            status.textContent =
              "保存しました。";
          }


          closeModal(
            "glossary-editor-modal"
          );


          await loadShared();


        } catch (
          error
        ) {

          console.error(
            "Glossary save error:",
            error
          );


          if (
            status
          ) {

            status.textContent =
              "保存できませんでした：" +
              error.message;
          }


        } finally {

          if (
            submit
          ) {

            submit.disabled =
              false;
          }
        }
      }
    );


  /* ========================================
     ADD CATEGORY
  ======================================== */

  $("glossary-add-category")
    ?.addEventListener(
      "click",
      () => {

        if (
          !configured() ||
          !usingSharedData
        ) {

          alert(
            "共同編集に接続できていません。"
          );

          return;
        }


        const status =
          $("category-save-status");


        if (
          status
        ) {

          status.textContent =
            "";
        }


        openModal(
          "glossary-category-modal"
        );
      }
    );


  $("glossary-category-form")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const submit =
          event.submitter;


        const status =
          $("category-save-status");


        if (
          submit
        ) {

          submit.disabled =
            true;
        }


        if (
          status
        ) {

          status.textContent =
            "追加中…";
        }


        try {

          const response =
            await api(
              "/rest/v1/rpc/glossary_add_category",

              {
                method:
                  "POST",

                body:
                  JSON.stringify({

                    p_name:
                      $("new-category-name")
                        .value
                        .trim(),

                    p_description:
                      $("new-category-description")
                        .value
                        .trim() ||
                      null,

                    p_contributor_name:
                      $("new-category-contributor")
                        .value
                        .trim() ||
                      null

                  })
              }
            );


          if (
            !response.ok
          ) {

            throw new Error(
              await response.text()
            );
          }


          $("glossary-category-form")
            .reset();


          closeModal(
            "glossary-category-modal"
          );


          await loadShared();


        } catch (
          error
        ) {

          console.error(
            "Glossary category error:",
            error
          );


          if (
            status
          ) {

            status.textContent =
              "追加できませんでした：" +
              error.message;
          }


        } finally {

          if (
            submit
          ) {

            submit.disabled =
              false;
          }
        }
      }
    );


  /* ========================================
     RESET
  ======================================== */

  function resetFilters() {

    query.value =
      "";


    categorySelect.value =
      "";


    filters.major =
      "";


    filters.index =
      "";


    document
      .querySelectorAll(
        "[data-major]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "is-active",
            button.dataset.major ===
            ""
          );
        }
      );


    document
      .querySelectorAll(
        "[data-index]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "is-active",
            button.dataset.index ===
            ""
          );
        }
      );


    renderTerms();
  }


  /* ========================================
     EVENTS
  ======================================== */

  query.addEventListener(
    "input",
    renderTerms
  );


  categorySelect.addEventListener(
    "change",
    renderTerms
  );


  $("glossary-reset")
    ?.addEventListener(
      "click",
      resetFilters
    );


  window.addEventListener(
    "hashchange",
    openHashTarget
  );


  /* ========================================
     INIT
  ======================================== */

  buildIndexes();

  bindMajorIndex();

  loadShared();

})();
