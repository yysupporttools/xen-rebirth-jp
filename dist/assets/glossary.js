"use strict";

(() => {
  const CFG = window.XEN_GLOSSARY_CONFIG || {};
  const $ = id => document.getElementById(id);

  const query = $("glossary-query");
  const categorySelect = $("glossary-category");
  const countEl = $("glossary-count");
  const emptyEl = $("glossary-empty");
  const resultsEl = $("glossary-results");
  const syncStatus = $("glossary-sync-status");

  if (!query || !categorySelect || !countEl || !emptyEl || !resultsEl) {
    console.error("Glossary: required HTML elements are missing.");
    return;
  }

  let categories = [];
  let terms = [];
  let luckyBallGroups = [];
  let luckyBallItems = [];
  let luckyBallReady = false;
  let classEquipmentSources = [];
  let classEquipmentItems = [];
  let classEquipmentReady = false;
  let classEquipmentError = "";
  let luckyBallError = "";
  let usingSharedData = false;
  let referenceCatalog = null;
  let editingTerm = null;
  let modalOpener = null;
  let previewUrl = null;
  let selectedImageFile = null;

  const filters = { major: "", index: "" };
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const KANA = [
    "あ","い","う","え","お","か","き","く","け","こ",
    "さ","し","す","せ","そ","た","ち","つ","て","と",
    "な","に","ぬ","ね","の","は","ひ","ふ","へ","ほ",
    "ま","み","む","め","も","や","ゆ","よ","ら","り",
    "る","れ","ろ","わ","を","ん"
  ];

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const normalize = value => String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[’‘]/g, "'")
    .trim();

  function configured() {
    return /^https?:\/\//.test(CFG.SUPABASE_URL || "") &&
      (CFG.SUPABASE_ANON_KEY || "").length > 20;
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function authHeaders() {
    const headers = { apikey: CFG.SUPABASE_ANON_KEY };
    if (CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.startsWith("sb_publishable_")) {
      headers.Authorization = "Bearer " + CFG.SUPABASE_ANON_KEY;
    }
    return headers;
  }

  function api(path, options = {}) {
    const headers = Object.assign({
      ...authHeaders(),
      "Content-Type": "application/json"
    }, options.headers || {});
    return fetch(CFG.SUPABASE_URL + path, { ...options, headers });
  }

  function getCategoryName(term) {
    return categories.find(c => String(c.id) === String(term.category_id))?.name || "";
  }

  function getMajorGroups(term) {
    const text = normalize([
      getCategoryName(term), term.name_en, term.name_ja, term.aliases,
      term.description, term.drop_location, term.acquisition,
      term.related_entity, term.notes
    ].join(" "));
    const groups = new Set();
    if (/クラス|職業|転職用装備|アーチャー|クレリック|ナイト|メイジ|ローグ|テンプラー|xenian|archer|cleric|knight|mage|rogue|templar/.test(text)) groups.add("class");
    if (/アイテム|素材|装備|武器|防具|消耗品|転職素材|stone|orb|tonic|blood|weapon|armor|item|ペット|pet|lucky ball|ラッキーボール/.test(text)) groups.add("item");
    if (/マップ|地図|世界|町|村|地域|フィールド|npc|モンスター|monster|map/.test(text)) groups.add("world");
    if (/クエスト|quest|転職/.test(text)) groups.add("quest");
    if (/ダンジョン|ボス|インスタンス|dungeon|boss|instance/.test(text)) groups.add("dungeon");
    return [...groups];
  }

  function katakanaToHiragana(text) {
    return String(text || "").replace(/[\u30a1-\u30f6]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0x60)
    );
  }

  function normalizeKanaInitial(c) {
    const map = {
      "が":"か","ぎ":"き","ぐ":"く","げ":"け","ご":"こ",
      "ざ":"さ","じ":"し","ず":"す","ぜ":"せ","ぞ":"そ",
      "だ":"た","ぢ":"ち","づ":"つ","で":"て","ど":"と",
      "ば":"は","び":"ひ","ぶ":"ふ","べ":"へ","ぼ":"ほ",
      "ぱ":"は","ぴ":"ひ","ぷ":"ふ","ぺ":"へ","ぽ":"ほ",
      "ゔ":"う","ぁ":"あ","ぃ":"い","ぅ":"う","ぇ":"え","ぉ":"お",
      "ゃ":"や","ゅ":"ゆ","ょ":"よ","っ":"つ","ゎ":"わ"
    };
    return map[c] || c;
  }

  function latinInitial(term) {
    const text = String(term.name_en || "").trim().normalize("NFKC");
    if (!text) return "";
    const first = text.charAt(0).toUpperCase();
    if (/^[A-Z]$/.test(first)) return first;
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(first)) return "";
    return "#";
  }

  function japaneseInitial(term) {
    for (const candidate of [term.name_ja, term.name_en, term.aliases]) {
      const raw = String(candidate || "").trim().normalize("NFKC");
      if (!raw) continue;
      const first = katakanaToHiragana(raw).charAt(0);
      if (/^[ぁ-んゔ]$/.test(first)) return normalizeKanaInitial(first);
    }
    return "";
  }

  function displayInitial(term) {
    return latinInitial(term) || japaneseInitial(term) || "#";
  }

  function isLuckyBallHub(term) {
    const values = [term.name_en, term.name_ja, term.aliases].map(normalize);
    return term.slug === "lucky-ball" || values.some(v =>
      v === "lucky ball" ||
      v === "lucky balls" ||
      v === "ラッキーボール" ||
      v === "ラッキーボール一覧"
    );
  }

  function classKeyForTerm(term) {
    const slug = String(term.slug || "");
    const slugMatch = slug.match(/^class-(knight|mage|archer|cleric|rogue|templar|xenian)$/);
    if (slugMatch) return slugMatch[1];

    // Legacy fallback: only an entry whose actual name is exactly the class name
    // may become a class hub. Do not match partial names such as "Xenian Skill".
    const values = [term.name_en, term.name_ja]
      .map(normalize)
      .filter(Boolean);
    const map = [
      ["knight", ["knight", "ナイト"]], ["mage", ["mage", "メイジ"]],
      ["archer", ["archer", "アーチャー"]], ["cleric", ["cleric", "クレリック"]],
      ["rogue", ["rogue", "ローグ"]], ["templar", ["templar", "テンプラー"]],
      ["xenian", ["xenian", "ゼニアン"]]
    ];
    return map.find(([, names]) => names.some(name => values.includes(normalize(name))))?.[0] || "";
  }

  function classEquipmentSearchText(term) {
    const key = classKeyForTerm(term);
    if (!key) return "";
    const source = classEquipmentSources.find(s => s.class_key === key);
    if (!source) return "";
    return classEquipmentItems.filter(i => String(i.source_id) === String(source.id))
      .map(i => [i.name_en, i.name_ja, i.section_en, i.section_ja, i.item_type_en, i.item_type_ja, i.required_level, i.stats, i.description].join(" "))
      .join(" ");
  }

  function buildIndexes() {
    const alpha = $("glossary-alpha-index");
    const kana = $("glossary-kana-index");
    if (!alpha || !kana) return;

    alpha.innerHTML = [
      '<button type="button" class="is-active" data-index="">すべて</button>',
      ...ALPHA.map(x => `<button type="button" data-index="${x}">${x}</button>`),
      '<button type="button" data-index="#">#</button>'
    ].join("");

    kana.innerHTML = [
      '<button type="button" data-index="">すべて</button>',
      ...KANA.map(x => `<button type="button" data-index="ja:${x}">${x}</button>`)
    ].join("");

    document.querySelectorAll("[data-index]").forEach(button => {
      button.addEventListener("click", () => {
        filters.index = button.dataset.index || "";
        document.querySelectorAll("[data-index]").forEach(b => b.classList.remove("is-active"));
        button.classList.add("is-active");
        renderTerms();
      });
    });
  }

  function renderCategoryButtons() {
    const panel = $("glossary-major-index");
    if (!panel) return;
    const fixed = [["", "すべて"], ["class", "クラス"], ["item", "アイテム"],
      ["lucky", "ラッキーボール"], ["crafting", "アイテム作成"], ["pets", "ペット・騎乗ペット"], ["world", "世界地図"], ["quest", "クエスト"], ["dungeon", "ダンジョン・ボス"]];
    const fixedNames = new Set(fixed.map(x => x[1]));
    const buttons = [...fixed, ...categories.filter(c => !fixedNames.has(c.name)).map(c => [`category:${c.id}`, c.name])];
    panel.innerHTML = buttons.map(([id, name]) => `<button type="button" data-major="${esc(id)}" class="${filters.major === id ? "is-active" : ""}" aria-pressed="${filters.major === id}">${esc(name)}</button>`).join("") +
      '<button type="button" data-add-category>＋ カテゴリを追加</button>';
  }
  function bindMajorIndex() {
    $("glossary-major-index")?.addEventListener("click", event => {
      if (event.target.closest("[data-add-category]")) { $("glossary-add-category")?.click(); return; }
      const button = event.target.closest("[data-major]");
      if (!button) return;
      filters.major = button.dataset.major || "";
      categorySelect.value = "";
      // A-Z / 日本語 index is a secondary filter. When switching category,
      // always return it to "すべて" so an old letter never leaks into the new category.
      filters.index = "";
      document.querySelectorAll("[data-index]").forEach(b => b.classList.toggle("is-active", b.dataset.index === ""));
      if (["lucky", "crafting", "pets"].includes(filters.major)) query.value = "";
      renderCategoryButtons();
      renderTerms();
    });
  }

  function categoryOptions() {
    renderCategoryButtons();
    const selected = categorySelect.value;
    categorySelect.innerHTML = '<option value="">すべての分類</option>' +
      categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
    categorySelect.value = categories.some(c => c.name === selected) ? selected : "";

    const editCategory = $("edit-category");
    if (editCategory) {
      editCategory.innerHTML = '<option value="">分類を選択</option>' +
        categories.filter(c => c.id !== "catalog-items").map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    }
  }

  function filteredTerms() {
    const words = normalize(query.value).split(/\s+/).filter(Boolean);
    return terms.filter(term => {
      const category = getCategoryName(term);
      const searchText = normalize([
        term.name_en, term.name_ja, term.aliases, category, term.description,
        term.drop_location, term.acquisition, term.related_entity, term.notes, term._section,
        isLuckyBallHub(term) ? luckyBallGroups.map(g => [g.name_en, g.name_ja,
          ...luckyBallItems.filter(i => String(i.group_id) === String(g.id)).map(i =>
            [i.name_en, i.name_ja, i.stats, i.stats_en, i.description].join(" "))].join(" ")).join(" ") : "",
        classEquipmentSearchText(term)
      ].join(" "));

      if (!words.every(word => searchText.includes(word))) return false;
      if (categorySelect.value && category !== categorySelect.value && !(categorySelect.value === "ラッキーボール" && isLuckyBallHub(term))) return false;
      if (["crafting", "pets"].includes(filters.major)) {
        if (term._catalogType !== filters.major) return false;
      } else if (filters.major === "lucky") {
        if (!isLuckyBallHub(term) && category !== "ラッキーボール") return false;
      } else if (filters.major.startsWith("category:")) {
        if (String(term.category_id) !== filters.major.slice(9)) return false;
      } else if (filters.major === "class") {
        if (!classKeyForTerm(term)) return false;
      } else if (filters.major && !getMajorGroups(term).includes(filters.major)) return false;

      if (filters.index) {
        if (filters.index.startsWith("ja:")) {
          if (japaneseInitial(term) !== filters.index.slice(3)) return false;
        } else if (filters.index === "#") {
          if (displayInitial(term) !== "#") return false;
        } else if (latinInitial(term) !== filters.index) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => normalize(a.name_en || a.name_ja).localeCompare(normalize(b.name_en || b.name_ja), "ja"));
  }

  function detail(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return `<div class="glossary-detail"><strong>${esc(label)}</strong><span>${esc(value).replace(/\n/g, "<br>")}</span></div>`;
  }

  function luckyBallCatalogHtml() {
    if (!luckyBallReady) return '<p role="status">ラッキーボール一覧を読み込んでいます…</p>';
    if (!luckyBallGroups.length) return `<p role="status">${esc(luckyBallError || "獲得アイテムはまだ登録されていません。")}</p>`;
    const placeholder = '<span class="lucky-ball-image-empty">画像未掲載</span>';
    return `<div class="lucky-ball-catalog">
      <p class="lucky-ball-note">公式Lexiconの掲載内容を収録（確認日：2026年9月19日）。日本語名・説明は参考訳です。共通アイテムはExtras欄にまとめています。</p>
      <label class="lucky-ball-search-label">種類・獲得アイテムを検索
        <input type="search" class="lucky-ball-search" placeholder="例：ブルー、Hockey Mask、防御力" aria-label="ラッキーボール内を検索">
      </label>
      <p class="lucky-ball-search-empty" hidden>該当する種類・アイテムはありません。</p>
      ${luckyBallGroups.map(group => {
        const groupItems = luckyBallItems.filter(i => String(i.group_id) === String(group.id))
          .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
        const groupImage = safeUrl(group.image_url);
        return `<details class="lucky-ball-group" id="lucky-ball-${esc(group.slug || group.id)}" data-group-search="${esc(normalize([group.name_en, group.name_ja, group.section].join(" ")))}">
          <summary class="lucky-ball-group-head">
            ${groupImage ? `<img class="lucky-ball-group-image" src="${esc(groupImage)}" alt="${esc(group.name_en)}" loading="lazy" referrerpolicy="no-referrer">` : placeholder}
            <span><strong>${esc(group.name_ja || group.name_en)}</strong>
              <span class="lucky-ball-name-en">${esc(group.name_en)}</span>
              <span class="lucky-ball-count">${esc(group.section || "")} · 掲載アイテム ${groupItems.length}件</span>
            </span><span aria-hidden="true">＋</span>
          </summary>
          <div class="lucky-ball-group-body">
            <p>${esc(group.description || "")}</p>
            ${!groupImage ? `<p><button type="button" class="lucky-image-add" data-lucky-edit="${esc(group.id)}" data-lucky-item="group">本体画像を追加（Ctrl+V / アップロード）</button></p>` : ""}
            <table class="lucky-ball-table">
              <caption class="sr-only">${esc(group.name_ja || group.name_en)}の獲得アイテム</caption>
              <thead><tr><th scope="col">画像</th><th scope="col">アイテム名</th><th scope="col">ステータス・詳細</th></tr></thead>
              <tbody>${groupItems.map((item, itemIndex) => {
                const itemImage = safeUrl(item.image_url);
                return `<tr data-item-search="${esc(normalize([item.name_en, item.name_ja, item.stats, item.stats_en, item.description].join(" ")))}">
                  <td class="lucky-ball-item-image-cell">${itemImage ? `<img class="lucky-ball-item-image" src="${esc(itemImage)}" alt="${esc(item.name_en)}" loading="lazy" referrerpolicy="no-referrer">` : `<button type="button" class="lucky-image-add" data-lucky-edit="${esc(group.id)}" data-lucky-item="${itemIndex}" aria-label="${esc(item.name_ja || item.name_en)}の画像を追加">画像を追加<br><small>Ctrl+V / 選択</small></button>`}</td>
                  <td><strong>${esc(item.name_ja || item.name_en)}</strong><span class="lucky-ball-item-en">${esc(item.name_en)}</span></td>
                  <td>${esc(item.stats || "公式ページにステータスの記載なし").replace(/\n/g, "<br>")}
                    ${item.description ? `<p>${esc(item.description)}</p>` : ""}
                    ${item.stats_en ? `<details class="lucky-ball-original"><summary>英語の原文</summary><p>${esc(item.stats_en).replace(/\n/g, "<br>")}</p></details>` : ""}
                  </td></tr>`;
              }).join("") || '<tr><td colspan="3">獲得アイテムはまだ登録されていません。</td></tr>'}</tbody>
            </table>
            ${safeUrl(group.source_url) ? `<p><a href="${esc(safeUrl(group.source_url))}" target="_blank" rel="noopener noreferrer">公式Lexiconの該当箇所 ↗</a></p>` : ""}
            ${safeUrl(group.image_source_url) ? `<a href="${esc(safeUrl(group.image_source_url))}" target="_blank" rel="noopener noreferrer">本体画像の出典 ↗</a>` : ""}
            <div class="lucky-ball-edit-actions"><button type="button" data-lucky-edit="${esc(group.id)}">このラッキーボールを編集</button></div>
          </div>
        </details>`;
      }).join("")}
    </div>`;
  }

  function classEquipmentCatalogHtml(term) {
    const key = classKeyForTerm(term);
    if (!key) return "";
    if (!classEquipmentReady) return '<p role="status">装備一覧を読み込んでいます…</p>';
    const source = classEquipmentSources.find(s => s.class_key === key);
    if (!source) return '<p role="status">この職業の装備データはまだ登録されていません。</p>';
    const items = classEquipmentItems.filter(i => String(i.source_id) === String(source.id))
      .sort((a,b) => (Number(a.sort_order)||0) - (Number(b.sort_order)||0));
    if (!items.length) return `<p role="status">${esc(classEquipmentError || "この職業の装備一覧はまだ同期されていません。")}</p>`;

    const hasImages = items.some(item => Boolean(safeUrl(item.image_url)));
    const sections = new Map();
    for (const item of items) {
      const section = item.section_ja || item.section_en || "装備一覧";
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section).push(item);
    }
    return `<div class="class-equipment-catalog ${hasImages ? "has-images" : "no-images"}" data-class-key="${esc(key)}">
      <div class="class-equipment-heading"><h3>${esc(source.class_name_ja || source.class_name_en)} 装備一覧</h3>
        <span class="class-equipment-total">掲載 ${items.length}件</span></div>
      <p class="class-equipment-note">公式Xen Rebirth Lexicon掲載データをもとに整理しています。${hasImages ? " 公式画像がある装備はその画像を表示しています。" : ""} 画像がない装備は「画像を追加」を選び、Ctrl+Vまたは画像ファイルから追加できます。</p>
      <label class="class-equipment-search-label">装備を検索
        <input type="search" class="class-equipment-search" placeholder="例：剣、Lv 40、Defense" aria-label="${esc(source.class_name_ja || source.class_name_en)}の装備を検索">
      </label>
      <p class="class-equipment-search-empty" hidden>該当する装備はありません。</p>
      ${[...sections.entries()].map(([section, rows], sectionIndex) => `<details class="class-equipment-section" ${sectionIndex === 0 ? "open" : ""}>
        <summary><strong>${esc(section)}</strong><span>${rows.length}件</span></summary>
        <div class="class-equipment-table-wrap"><table class="class-equipment-table">
          <thead><tr><th>画像</th><th>装備名</th><th>種類</th><th>必要Lv</th><th>性能・詳細</th></tr></thead>
          <tbody>${rows.map(item => {
            const img = safeUrl(item.image_url);
            const search = normalize([item.name_en,item.name_ja,item.section_en,item.section_ja,item.item_type_en,item.item_type_ja,item.required_level,item.stats,item.description].join(" "));
            return `<tr data-equipment-search="${esc(search)}">
              <td class="class-equipment-image-cell">${img ? `<img class="class-equipment-image" src="${esc(img)}" alt="${esc(item.name_en)}" loading="lazy" referrerpolicy="no-referrer">` : `<button type="button" class="class-equipment-image-add" data-equipment-image-id="${esc(item.id)}" aria-label="${esc(item.name_ja || item.name_en)}の画像を追加">画像を追加<br><small>Ctrl+V / 選択</small></button>`}</td>
              <td><strong>${esc(item.name_ja || item.name_en)}</strong>${item.name_ja ? `<span class="class-equipment-name-en">${esc(item.name_en)}</span>` : ""}</td>
              <td>${esc(item.item_type_ja || item.item_type_en || "装備")}</td>
              <td>${esc(item.required_level || "—")}</td>
              <td>${esc(item.stats || item.description || "公式ページに詳細記載なし").replace(/\n/g,"<br>")}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </details>`).join("")}
      ${safeUrl(source.source_url) ? `<p class="class-equipment-source"><a href="${esc(safeUrl(source.source_url))}" target="_blank" rel="noopener noreferrer">公式Lexiconの装備一覧 ↗</a></p>` : ""}
    </div>`;
  }

  let equipmentImageEditing = null;
  let equipmentImageFile = null;
  let equipmentImagePreview = "";
  const equipmentImageModal = document.createElement("div");
  equipmentImageModal.id = "equipment-image-modal";
  equipmentImageModal.className = "glossary-modal";
  equipmentImageModal.hidden = true;
  equipmentImageModal.setAttribute("role","dialog");
  equipmentImageModal.setAttribute("aria-modal","true");
  equipmentImageModal.innerHTML = `<div class="glossary-modal-card paper equipment-image-card">
    <div class="glossary-modal-head"><h2 id="equipment-image-title">装備画像を追加</h2>
      <button type="button" class="glossary-close" data-equipment-image-close>閉じる</button></div>
    <p id="equipment-image-name"></p>
    <div class="equipment-image-dropzone" tabindex="0">
      <img id="equipment-image-preview" alt="画像プレビュー" hidden>
      <strong>ここを選択して Ctrl+V</strong>
      <span>または画像を選択 / ドロップ</span>
      <input id="equipment-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
    </div>
    <p id="equipment-image-status" role="status" aria-live="polite"></p>
    <div class="glossary-modal-actions"><button type="button" data-equipment-image-close>キャンセル</button>
      <button type="button" class="glossary-manage-primary" id="equipment-image-save">画像を保存</button></div>
  </div>`;
  document.body.append(equipmentImageModal);

  function closeEquipmentImageEditor() {
    closeModal(equipmentImageModal.id);
    if (equipmentImagePreview) URL.revokeObjectURL(equipmentImagePreview);
    equipmentImagePreview = ""; equipmentImageFile = null; equipmentImageEditing = null;
  }
  function setEquipmentImage(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    validateImage(file);
    equipmentImageFile = file;
    if (equipmentImagePreview) URL.revokeObjectURL(equipmentImagePreview);
    equipmentImagePreview = URL.createObjectURL(file);
    const preview = $("equipment-image-preview");
    preview.src = equipmentImagePreview; preview.hidden = false;
    $("equipment-image-status").textContent = "画像を選択しました。";
  }
  function openEquipmentImageEditor(id) {
    const item = classEquipmentItems.find(x => String(x.id) === String(id));
    if (!item) return;
    equipmentImageEditing = item; equipmentImageFile = null;
    $("equipment-image-name").textContent = `${item.name_ja || item.name_en} / ${item.name_en}`;
    $("equipment-image-preview").hidden = true;
    $("equipment-image-status").textContent = "画像を貼り付けるか選択してください。";
    openModal(equipmentImageModal.id);
  }
  async function uploadEquipmentImage(item, file) {
    validateImage(file);
    const ext = (file.name?.split(".").pop() || file.type?.split("/")[1] || "png").replace(/[^a-z0-9]/gi,"").toLowerCase();
    const objectName = `class-equipment/${item.id}/${Date.now()}.${ext}`;
    const response = await fetch(`${CFG.SUPABASE_URL}/storage/v1/object/glossary-images/${objectName}`, {
      method:"POST", headers:{...authHeaders(),"Content-Type":file.type || "application/octet-stream"}, body:file
    });
    if (!response.ok) throw new Error("画像をアップロードできませんでした。");
    return `${CFG.SUPABASE_URL}/storage/v1/object/public/glossary-images/${objectName}`;
  }
  resultsEl.addEventListener("click", event => {
    const button = event.target.closest("[data-equipment-image-id]");
    if (button) { event.preventDefault(); openEquipmentImageEditor(button.dataset.equipmentImageId); }
  });
  equipmentImageModal.addEventListener("click", event => {
    if (event.target.closest("[data-equipment-image-close]")) closeEquipmentImageEditor();
  });
  $("equipment-image-file")?.addEventListener("change", event => setEquipmentImage(event.target.files?.[0]));
  const equipmentDropzone = equipmentImageModal.querySelector(".equipment-image-dropzone");
  equipmentDropzone?.addEventListener("dragover", event => event.preventDefault());
  equipmentDropzone?.addEventListener("drop", event => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer?.files || []).find(x => x.type?.startsWith("image/"));
    if (file) setEquipmentImage(file);
  });
  equipmentImageModal.addEventListener("paste", event => {
    const file = Array.from(event.clipboardData?.files || []).find(x => x.type?.startsWith("image/")) ||
      Array.from(event.clipboardData?.items || []).find(x => x.type?.startsWith("image/"))?.getAsFile();
    if (file) { event.preventDefault(); setEquipmentImage(file); }
  });
  $("equipment-image-save")?.addEventListener("click", async () => {
    if (!equipmentImageEditing || !equipmentImageFile) {
      $("equipment-image-status").textContent = "先に画像を貼り付けるか選択してください。"; return;
    }
    const button = $("equipment-image-save"); button.disabled = true;
    $("equipment-image-status").textContent = "保存中…";
    try {
      const imageUrl = await uploadEquipmentImage(equipmentImageEditing,equipmentImageFile);
      const response = await api("/rest/v1/rpc/class_equipment_set_image", {
        method:"POST", body:JSON.stringify({p_id:equipmentImageEditing.id,p_image_url:imageUrl})
      });
      if (!response.ok) throw new Error(await response.text());
      closeEquipmentImageEditor();
      await loadClassEquipmentData();
      renderTerms();
    } catch (error) {
      console.error(error); $("equipment-image-status").textContent = "保存できませんでした：" + error.message;
    } finally { button.disabled = false; }
  });

  resultsEl.addEventListener("input", event => {
    if (event.target.matches(".class-equipment-search")) {
      const catalog = event.target.closest(".class-equipment-catalog");
      const words = normalize(event.target.value).split(/\s+/).filter(Boolean);
      let visible = 0;
      catalog.querySelectorAll(".class-equipment-section").forEach(section => {
        let sectionVisible = 0;
        section.querySelectorAll("[data-equipment-search]").forEach(row => {
          row.hidden = !words.every(word => row.dataset.equipmentSearch.includes(word));
          if (!row.hidden) { visible++; sectionVisible++; }
        });
        section.hidden = words.length > 0 && sectionVisible === 0;
        if (words.length > 0 && sectionVisible > 0) section.open = true;
      });
      catalog.querySelector(".class-equipment-search-empty").hidden = visible !== 0;
      return;
    }
    if (!event.target.matches(".lucky-ball-search")) return;
    const catalog = event.target.closest(".lucky-ball-catalog");
    const words = normalize(event.target.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    catalog.querySelectorAll(".lucky-ball-group").forEach(group => {
      let matches = 0;
      group.querySelectorAll("[data-item-search]").forEach(row => {
        row.hidden = !words.every(word => (group.dataset.groupSearch + " " + row.dataset.itemSearch).includes(word));
        if (!row.hidden) matches++;
      });
      group.hidden = words.length > 0 && !matches;
      if (!group.hidden) visible++;
      group.open = words.length > 0 && !group.hidden;
    });
    catalog.querySelector(".lucky-ball-search-empty").hidden = visible !== 0;
  });

  resultsEl.addEventListener("error", event => {
    if (event.target.matches?.(".lucky-ball-group-image, .lucky-ball-item-image, .class-equipment-image")) {
      const fallback = document.createElement("span");
      fallback.className = "lucky-ball-image-empty";
      fallback.textContent = "画像を取得できません";
      event.target.replaceWith(fallback);
    }
  }, true);

  function termHtml(term) {
    const category = getCategoryName(term);
    const imageUrl = safeUrl(term.image_url);
    const image = imageUrl
      ? `<img class="glossary-thumb" src="${esc(imageUrl)}" alt="${esc(term.name_en || term.name_ja || "用語画像")}" loading="lazy">`
      : '<div class="glossary-thumb glossary-thumb-empty" aria-hidden="true">?</div>';
    const jp = term.name_ja ? `<span class="glossary-name-ja">${esc(term.name_ja)}</span>` : "";
    const alias = term.aliases ? `<span class="glossary-alias">別表記：${esc(term.aliases)}</span>` : "";
    const details = [
      detail("ドロップ場所", term.drop_location),
      detail("入手方法", term.acquisition),
      detail("関連NPC / モンスター", term.related_entity),
      detail("必要Lv", term.required_level),
      detail("備考", term.notes)
    ].filter(Boolean).join("");
    const guide = safeUrl(term.related_guide);
    const source = safeUrl(term.source_url);
    const updated = term.updated_at ? new Date(term.updated_at).toLocaleString("ja-JP") : "";
    const id = term.slug || term.id;
    const luckyCatalog = isLuckyBallHub(term) ? luckyBallCatalogHtml() : "";
    const classKey = classKeyForTerm(term);
    const equipmentCatalog = classKey ? classEquipmentCatalogHtml(term) : "";

    return `<article class="glossary-entry${isLuckyBallHub(term) ? " glossary-entry-lucky-ball" : ""}${classKey ? " glossary-entry-class-equipment" : ""}" id="${esc(id)}">
      <details>
        <summary>
          ${image}
          <div class="glossary-summary-text">
            <div class="glossary-title-line">
              <strong class="glossary-name-en">${esc(term.name_en || term.name_ja || "名称未設定")}</strong>
              ${jp}
            </div>
            <div class="glossary-summary-bottom">
              <span class="glossary-category-badge">${esc(category || "未分類")}</span>
              ${alias}
              ${term._section ? `<span class="glossary-category-badge">${esc(term._section)}</span>` : ""}
              ${isLuckyBallHub(term) ? '<span class="lucky-ball-hub-badge">獲得アイテム一覧</span>' : ""}
              ${classKey ? '<span class="class-equipment-badge">装備一覧</span>' : ""}
            </div>
          </div>
          <span class="glossary-open-icon" aria-hidden="true">＋</span>
        </summary>

        <div class="glossary-entry-detail">
          <p class="glossary-description">${esc(term.description || "").replace(/\n/g, "<br>")}</p>
          ${details ? `<div class="glossary-detail-list">${details}</div>` : ""}
          ${luckyCatalog}
          ${equipmentCatalog}
          ${referenceHtml(term)}
          <div class="glossary-links">
            ${guide ? `<a href="${esc(guide)}">関連ガイド</a>` : ""}
            ${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">公式の出典 ↗</a>` : ""}
            <a href="#${esc(id)}">この項目へのリンク</a>
            <button type="button" class="glossary-edit-button" data-edit-id="${esc(term.id)}">編集</button>
          </div>
          ${updated ? `<div class="glossary-updated">更新：${esc(updated)}${term.contributor_name ? " / 投稿：" + esc(term.contributor_name) : ""}</div>` : ""}
        </div>
      </details>
    </article>`;
  }

  function renderTerms() {
    const rows = filteredTerms();
    countEl.textContent = `${rows.length} / ${terms.length}件`;
    emptyEl.hidden = rows.length !== 0;
    if (!rows.length) {
      resultsEl.innerHTML = "";
      return;
    }

    const overview = ["crafting", "pets"].includes(filters.major) ? rows.find(t => t.slug === (filters.major === "crafting" ? "ref-item-crafting-guide" : "ref-pets-and-mounts-guide")) : null;
    const groups = new Map();
    for (const term of rows) {
      if (term === overview) continue;
      const key = filters.index.startsWith("ja:") ? (japaneseInitial(term) || "#") : displayInitial(term);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(term);
    }

    const order = [...ALPHA, "#", ...KANA];
    const sortedGroups = [...groups.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      if (ai === -1 && bi === -1) return String(a[0]).localeCompare(String(b[0]), "ja");
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    resultsEl.innerHTML = (overview ? termHtml(overview) : "") + sortedGroups.map(([key, items]) => `
      <section class="glossary-letter-section">
        <h2>${esc(key)}</h2>
        <div class="glossary-compact-list">${items.map(termHtml).join("")}</div>
      </section>
    `).join("");

    bindEditButtons();
    if (overview) resultsEl.querySelector(".glossary-entry > details")?.setAttribute("open", "");
    if (filters.major === "lucky") resultsEl.querySelector(".glossary-entry-lucky-ball > details")?.setAttribute("open", "");
    openHashTarget();
  }

  async function loadLuckyBallData() {
    luckyBallError = "";
    const read = async promise => {
      const response = await promise;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };
    // The checked-in catalogue makes reading possible before the optional SQL import.
    // Existing database entries take precedence; missing source entries are supplemented.
    const [snapshot, groupsResult, itemsResult] = await Promise.allSettled([
      read(fetch("assets/lucky-ball-catalog.json?v=20260919")),
      read(api("/rest/v1/lucky_ball_groups?select=*&order=sort_order.asc,name_en.asc")),
      read(api("/rest/v1/lucky_ball_items?select=*&order=sort_order.asc,name_en.asc"))
    ]);
    const sourceGroups = snapshot.status === "fulfilled" && Array.isArray(snapshot.value.groups) ? snapshot.value.groups : [];
    const sharedAvailable = groupsResult.status === "fulfilled" && itemsResult.status === "fulfilled" &&
      Array.isArray(groupsResult.value) && Array.isArray(itemsResult.value);
    luckyBallGroups = sharedAvailable ? groupsResult.value.map(g => ({...g, _stored:true})) : [];
    luckyBallItems = sharedAvailable ? itemsResult.value.map(i => ({...i})) : [];
    for (const source of sourceGroups) {
      let group = luckyBallGroups.find(g => g.slug === source.slug || normalize(g.name_en) === normalize(source.name_en));
      if (!group) {
        group = {...source, id: `source-${source.slug}`};
        luckyBallGroups.push(group);
      } else {
        for (const key of ["section", "is_extra", "image_source_url"]) group[key] = source[key];
        if (!group.image_url) group.image_url = source.image_url;
      }
      for (const sourceItem of source.items) {
        const existing = luckyBallItems.find(i => String(i.group_id) === String(group.id) && normalize(i.source_name || i.name_en) === normalize(sourceItem.name_en));
        if (existing) {
          if (!existing.stats_en) existing.stats_en = sourceItem.stats_en;
        } else luckyBallItems.push({...sourceItem, group_id: group.id});
      }
    }
    luckyBallGroups.sort((a,b) => (Number(a.sort_order)||0) - (Number(b.sort_order)||0));
    luckyBallReady = true;
    if (!luckyBallGroups.length && !sharedAvailable) luckyBallError = "一覧を取得できませんでした。ページを再読み込みしてください。";
    if (sourceGroups.length && !terms.some(isLuckyBallHub)) {
      let category = categories.find(c => c.name === "アイテム");
      if (!category) {
        category = {id:"catalog-items", name:"アイテム"};
        categories.push(category);
      }
      terms.push({id:"catalog-lucky-ball", slug:"lucky-ball", name_en:"Lucky Ball", name_ja:"ラッキーボール",
        category_id:category.id, description:"種類ごとに獲得アイテム・画像・ステータスを確認できます。",
        source_url:sourceGroups[0].source_url.split("#")[0], _catalogSeed:true});
    }
  }

  async function loadClassEquipmentData() {
    classEquipmentError = "";
    try {
      const [sRes, iRes] = await Promise.all([
        api("/rest/v1/class_equipment_sources?select=*&order=sort_order.asc,class_name_en.asc"),
        api("/rest/v1/class_equipment_items?select=*&order=source_id.asc,sort_order.asc")
      ]);
      if (!sRes.ok || !iRes.ok) throw new Error(`HTTP ${!sRes.ok ? sRes.status : iRes.status}`);
      classEquipmentSources = await sRes.json();
      classEquipmentItems = await iRes.json();
      classEquipmentReady = true;
    } catch (error) {
      console.error("Class equipment load error:", error);
      classEquipmentSources = [];
      classEquipmentItems = [];
      classEquipmentReady = true;
      classEquipmentError = "装備一覧を取得できませんでした。ページを再読み込みしてください。";
    }
  }

  async function loadReferenceCatalog() {
    try {
      if (!referenceCatalog) {
        const response = await fetch("assets/reference-catalog.json?v=20260922c");
        if (!response.ok) throw new Error("Reference catalogue unavailable");
        referenceCatalog = (await response.json()).terms;
      }
      for (const source of referenceCatalog) {
        const existing = terms.find(t => t.slug === source.slug || normalize(t.name_en) === normalize(source.name_en));
        if (existing) {
          for (const key of ["_catalogType", "_section", "_blocks", "_table", "_tables", "_links"]) existing[key] = source[key];
        } else {
          const category = categories.find(c => c.name === (source._catalogType === "pets" ? "ペット" : "アイテム"));
          terms.push({...source, id:"catalog-" + source.slug, category_id:category?.id || "catalog-items", _catalogSeed:true});
        }
      }
    } catch (error) { console.error(error); }
  }
  function referenceHtml(term) {
    const links = rows => (rows || []).filter(x => safeUrl(x.url)).map(x => `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.label)} ↗</a>`).join("");
    const referenceImageSrc = url => {
      const safe = safeUrl(url);
      if (!safe) return "";
      if (safe.toLowerCase().includes("xenrebirth.com/index.php?attachment/")) {
        return safe + "&thumbnail=1";
      }
      return safe;
    };
    const images = rows => (rows || []).filter(x => safeUrl(x.url)).map(x => {
      const href = safeUrl(x.url);
      const src = referenceImageSrc(x.url);
      return `<a class="reference-image" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><img src="${esc(src)}" alt="${esc(x.label || "公式掲載画像")}" loading="lazy" referrerpolicy="no-referrer"><span>${esc(x.label || "公式掲載画像")}　拡大 ↗</span></a>`;
    }).join("");
    const blocks = (term._blocks || []).map(b => `<section class="reference-block"><h3>${esc(b.heading)}</h3>${b.text ? `<p>${esc(b.text).replace(/\n/g,"<br>")}</p>` : ""}${b.images?.length ? `<div class="reference-image-grid">${images(b.images)}</div>` : ""}<div class="reference-links">${links(b.links)}</div></section>`).join("");
    const makeTable = table => `<div class="reference-table-wrap"><table><caption>${esc(table.caption || "公式掲載値の整理")}</caption><thead><tr>${table.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((v,i)=>i===0?`<th scope="row">${esc(v)}</th>`:`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    const table = term._table ? makeTable(term._table) : "";
    const tables = (term._tables || []).map(makeTable).join("");
    return blocks + table + tables + (term._links?.length ? `<div class="reference-block reference-source-block"><h3>公式の出典</h3><div class="reference-links">${links(term._links)}</div></div>` : "");
  }

  async function loadShared() {
    if (!configured()) {
      if (syncStatus) syncStatus.textContent = "共同編集の接続設定がありません。";
      resultsEl.innerHTML = '<p class="notice">用語集を読み込めませんでした。</p>';
      countEl.textContent = "0件";
      return false;
    }

    try {
      if (syncStatus) syncStatus.textContent = "用語集を読み込んでいます…";
      const [cRes, tRes] = await Promise.all([
        api("/rest/v1/glossary_categories?select=*&order=sort_order.asc,name.asc"),
        api("/rest/v1/glossary_terms?select=*&order=name_en.asc,name_ja.asc")
      ]);
      if (!cRes.ok) throw new Error("分類データを取得できませんでした。");
      if (!tRes.ok) throw new Error("用語データを取得できませんでした。");

      categories = await cRes.json();
      terms = await tRes.json();
      usingSharedData = true;
      await Promise.all([loadLuckyBallData(), loadClassEquipmentData(), loadReferenceCatalog()]);
      categoryOptions();
      renderTerms();
      if (syncStatus) syncStatus.textContent = `共同編集に接続済み：${terms.length}件・${categories.length}分類（公式カタログを含む）`;
      return true;
    } catch (error) {
      console.error("Glossary load error:", error);
      if (syncStatus) syncStatus.textContent = "用語集を取得できませんでした。ページを再読み込みしてください。";
      resultsEl.innerHTML = '<p class="notice">用語集の読み込みに失敗しました。</p>';
      countEl.textContent = "読み込み失敗";
      return false;
    }
  }

  function openHashTarget() {
    if (!location.hash) return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let ancestor = target;
    while (ancestor) {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    const detailsEl = target.querySelector("details");
    if (detailsEl) detailsEl.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modalOpener = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector("input:not([type=hidden]),button")?.focus();
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    modalOpener?.focus();
  }

  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  document.querySelectorAll(".glossary-modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const modal = document.querySelector(".glossary-modal:not([hidden])");
    if (modal) closeModal(modal.id);
  });

  function fillTermForm(term = null) {
    editingTerm = term;
    $("glossary-editor-title").textContent = term ? "用語を編集" : "用語を追加";
    $("edit-term-id").value = term?._catalogSeed ? "" : term?.id || "";
    $("edit-term-slug").value = term?.slug || "";
    $("edit-name-en").value = term?.name_en || "";
    $("edit-name-ja").value = term?.name_ja || "";
    $("edit-aliases").value = term?.aliases || "";
    $("edit-category").value = term?.category_id === "catalog-items" ? "" : term?.category_id || "";
    $("edit-description").value = term?.description || "";
    $("edit-drop-location").value = term?.drop_location || "";
    $("edit-acquisition").value = term?.acquisition || "";
    $("edit-related-entity").value = term?.related_entity || "";
    $("edit-required-level").value = term?.required_level ?? "";
    $("edit-notes").value = term?.notes || "";
    $("edit-related-guide").value = term?.related_guide || "";
    $("edit-source-url").value = term?.source_url || "";
    $("edit-contributor").value = "";
    selectedImageFile = null;
    if ($("edit-image")) $("edit-image").value = "";

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    const preview = $("edit-image-preview");
    const existing = safeUrl(term?.image_url);
    if (preview) {
      if (existing) {
        preview.src = existing;
        preview.hidden = false;
      } else {
        preview.removeAttribute("src");
        preview.hidden = true;
      }
    }
    if ($("glossary-image-status")) $("glossary-image-status").textContent = "";
    if ($("glossary-save-status")) $("glossary-save-status").textContent = "";
  }

  function validateImage(file) {
    if (!file) throw new Error("画像を取得できませんでした。");
    if (file.size > 5 * 1024 * 1024) throw new Error("画像は5MB以下にしてください。");
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      throw new Error("PNG / JPG / WebP / GIF画像を使用してください。");
    }
  }

  function setImage(file, source) {
    const status = $("glossary-image-status");
    try {
      validateImage(file);
      selectedImageFile = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      const preview = $("edit-image-preview");
      if (preview) {
        preview.src = previewUrl;
        preview.hidden = false;
      }
      const label = source === "paste" ? "コピーした画像を貼り付けました" : source === "drop" ? "画像をドロップしました" : "画像を選択しました";
      if (status) status.textContent = `📋 ${label}（${(file.size / 1024 / 1024).toFixed(2)} MB）`;
    } catch (error) {
      selectedImageFile = null;
      if (status) status.textContent = error.message;
    }
  }

  $("edit-image")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) setImage(file, "select");
  });

  document.addEventListener("paste", event => {
    const modal = $("glossary-editor-modal");
    if (!modal || modal.hidden) return;
    const item = Array.from(event.clipboardData?.items || []).find(x => x.type?.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const blob = item.getAsFile();
    if (!blob) return;
    const ext = { "image/png":"png", "image/jpeg":"jpg", "image/webp":"webp", "image/gif":"gif" }[blob.type] || "png";
    setImage(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: blob.type || "image/png", lastModified: Date.now() }), "paste");
  }, true);

  const pasteZone = $("glossary-paste-zone");
  if (pasteZone) {
    ["dragenter", "dragover"].forEach(name => pasteZone.addEventListener(name, event => {
      event.preventDefault();
      pasteZone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach(name => pasteZone.addEventListener(name, event => {
      event.preventDefault();
      pasteZone.classList.remove("is-dragging");
    }));
    pasteZone.addEventListener("drop", event => {
      const image = Array.from(event.dataTransfer?.files || []).find(file => file.type?.startsWith("image/"));
      if (!image) {
        if ($("glossary-image-status")) $("glossary-image-status").textContent = "画像ファイルをドロップしてください。";
        return;
      }
      setImage(image, "drop");
    });
    pasteZone.addEventListener("click", () => $("edit-image")?.click());
  }

  async function uploadImage(id, file) {
    if (!file) return editingTerm?.image_url || null;
    validateImage(file);
    const ext = (file.name?.split(".").pop() || file.type?.split("/")[1] || "png")
      .replace(/[^a-z0-9]/gi, "").toLowerCase();
    const objectName = `${id}/${Date.now()}.${ext}`;
    const response = await fetch(`${CFG.SUPABASE_URL}/storage/v1/object/glossary-images/${objectName}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    if (!response.ok) throw new Error("画像をアップロードできませんでした。");
    return `${CFG.SUPABASE_URL}/storage/v1/object/public/glossary-images/${objectName}`;
  }

  function bindEditButtons() {
    document.querySelectorAll("[data-edit-id]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        const term = terms.find(item => String(item.id) === String(button.dataset.editId));
        if (!term) return;
        fillTermForm(term);
        openModal("glossary-editor-modal");
      });
    });
  }

  $("glossary-add-term")?.addEventListener("click", () => {
    if (!configured() || !usingSharedData) return alert("共同編集に接続できていません。");
    fillTermForm();
    openModal("glossary-editor-modal");
  });

  $("glossary-editor-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.submitter;
    const status = $("glossary-save-status");
    if (submit) submit.disabled = true;
    if (status) status.textContent = "保存中…";

    try {
      const id = $("edit-term-id").value || null;
      const uploadId = id || crypto.randomUUID();
      const imageUrl = await uploadImage(uploadId, selectedImageFile);
      const payload = {
        p_id: id,
        p_slug: $("edit-term-slug").value || null,
        p_name_en: $("edit-name-en").value.trim(),
        p_name_ja: $("edit-name-ja").value.trim() || null,
        p_aliases: $("edit-aliases").value.trim() || null,
        p_category_id: $("edit-category").value,
        p_description: $("edit-description").value.trim(),
        p_drop_location: $("edit-drop-location").value.trim() || null,
        p_acquisition: $("edit-acquisition").value.trim() || null,
        p_related_entity: $("edit-related-entity").value.trim() || null,
        p_required_level: $("edit-required-level").value ? Number($("edit-required-level").value) : null,
        p_notes: $("edit-notes").value.trim() || null,
        p_related_guide: $("edit-related-guide").value.trim() || null,
        p_source_url: $("edit-source-url").value.trim() || null,
        p_image_url: imageUrl,
        p_contributor_name: $("edit-contributor").value.trim() || null
      };
      const response = await api("/rest/v1/rpc/glossary_save_term", { method: "POST", body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await response.text());
      if (status) status.textContent = "保存しました。";
      closeModal("glossary-editor-modal");
      await loadShared();
    } catch (error) {
      console.error("Glossary save error:", error);
      if (status) status.textContent = "保存できませんでした：" + error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("glossary-add-category")?.addEventListener("click", () => {
    if (!configured() || !usingSharedData) return alert("共同編集に接続できていません。");
    if ($("category-save-status")) $("category-save-status").textContent = "";
    openModal("glossary-category-modal");
  });

  $("glossary-category-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.submitter;
    const status = $("category-save-status");
    if (submit) submit.disabled = true;
    if (status) status.textContent = "追加中…";
    try {
      const response = await api("/rest/v1/rpc/glossary_add_category", {
        method: "POST",
        body: JSON.stringify({
          p_name: $("new-category-name").value.trim(),
          p_description: $("new-category-description").value.trim() || null,
          p_contributor_name: $("new-category-contributor").value.trim() || null
        })
      });
      if (!response.ok) throw new Error(await response.text());
      $("glossary-category-form").reset();
      closeModal("glossary-category-modal");
      await loadShared();
    } catch (error) {
      if (status) status.textContent = "追加できませんでした：" + error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  function resetFilters() {
    query.value = "";
    categorySelect.value = "";
    filters.major = "";
    filters.index = "";
    renderCategoryButtons();
    document.querySelectorAll("[data-index]").forEach(button => button.classList.toggle("is-active", button.dataset.index === ""));
    renderTerms();
  }

  query.addEventListener("input", renderTerms);
  categorySelect.addEventListener("change", renderTerms);
  $("glossary-reset")?.addEventListener("click", resetFilters);
  window.addEventListener("hashchange", openHashTarget);

  let luckyEditing = null;
  const luckyFiles = new Map();
  const luckyPreviews = new Map();
  const luckyModal = document.createElement("div");
  luckyModal.id = "lucky-editor-modal";
  luckyModal.className = "glossary-modal";
  luckyModal.hidden = true;
  luckyModal.setAttribute("role", "dialog");
  luckyModal.setAttribute("aria-modal", "true");
  luckyModal.setAttribute("aria-labelledby", "lucky-editor-title");
  luckyModal.innerHTML = `<div class="glossary-modal-card lucky-editor-card paper">
    <div class="glossary-modal-head"><h2 id="lucky-editor-title">ラッキーボールを編集</h2>
      <button type="button" class="glossary-close" data-lucky-close>閉じる</button></div>
    <form id="lucky-editor-form">
      <p>本体と獲得アイテムを個別に編集できます。画像欄を選んでCtrl+V、またはファイルを選択してください。</p>
      <div id="lucky-editor-fields"></div>
      <p id="lucky-editor-status" role="status" aria-live="polite"></p>
      <div class="glossary-modal-actions"><button type="button" data-lucky-close>キャンセル</button>
        <button type="submit" class="glossary-manage-primary">変更を保存</button></div>
    </form></div>`;
  document.body.append(luckyModal);

  function releaseLuckyPreviews() {
    for (const url of luckyPreviews.values()) URL.revokeObjectURL(url);
    luckyFiles.clear(); luckyPreviews.clear();
  }
  function closeLuckyEditor() {
    if (luckyModal.dataset.saving === "true") return;
    closeModal(luckyModal.id);
    releaseLuckyPreviews(); luckyEditing = null;
  }
  function luckyField(label, name, value, multiline = false, required = false) {
    return `<label><span>${esc(label)}</span>${multiline
      ? `<textarea data-field="${name}" maxlength="5000">${esc(value)}</textarea>`
      : `<input data-field="${name}" value="${esc(value)}" maxlength="200" ${required ? "required" : ""}>`}</label>`;
  }
  function luckyRecordFields(record, key, heading, isGroup) {
    const url = safeUrl(record.image_url);
    return `<fieldset class="lucky-editor-record" data-record="${esc(key)}"><legend>${esc(heading)}</legend>
      <div class="lucky-image-input" tabindex="0" role="group" aria-label="${esc(heading)}の画像：選択してCtrl+V">
        <img class="lucky-editor-preview" src="${esc(url || "")}" alt="${esc(heading)}の画像プレビュー" ${url ? "" : "hidden"}>
        <span class="lucky-image-hint">${url ? "画像を差し替え" : "画像を追加"}：この欄を選んでCtrl+V</span>
        <label>画像をアップロード<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-image-input></label>
        <span class="lucky-image-status" role="status"></span>
      </div>
      <div class="lucky-editor-grid">
        ${luckyField("英語名", "name_en", record.name_en, false, true)}
        ${luckyField("日本語名", "name_ja", record.name_ja)}
        ${isGroup ? "" : luckyField("ステータス（日本語）", "stats", record.stats, true)}
        ${luckyField("説明・備考", "description", record.description, true)}
      </div>
      ${!isGroup && record.stats_en ? `<details><summary>公式の英語原文を確認</summary><p>${esc(record.stats_en).replace(/\n/g,"<br>")}</p></details>` : ""}
    </fieldset>`;
  }
  function openLuckyEditor(groupKey, itemKey) {
    const group = luckyBallGroups.find(g => String(g.id) === groupKey);
    if (!group) return;
    releaseLuckyPreviews();
    const items = luckyBallItems.filter(i => String(i.group_id) === groupKey).sort((a,b) => (Number(a.sort_order)||0) - (Number(b.sort_order)||0));
    luckyEditing = {group, items};
    $("lucky-editor-title").textContent = `${group.name_ja || group.name_en}を編集`;
    $("lucky-editor-fields").innerHTML = luckyRecordFields(group, "group", "ラッキーボール本体", true) +
      items.map((item, index) => luckyRecordFields(item, String(index), item.name_ja || item.name_en, false)).join("");
    $("lucky-editor-status").textContent = group._stored ? "" : "現在は閲覧用カタログです。共有保存にはラッキーボール編集設定SQLの実行が必要です。";
    openModal(luckyModal.id);
    if (itemKey !== undefined) {
      const field = [...$("lucky-editor-fields").querySelectorAll("[data-record]")].find(el => el.dataset.record === itemKey);
      field?.querySelector(".lucky-image-input")?.focus();
    }
  }
  resultsEl.addEventListener("click", event => {
    const button = event.target.closest("[data-lucky-edit]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    openLuckyEditor(button.dataset.luckyEdit, button.dataset.luckyItem);
  });
  function selectLuckyImage(field, file) {
    const status = field.querySelector(".lucky-image-status");
    try {
      validateImage(file);
      const key = field.dataset.record;
      if (luckyPreviews.has(key)) URL.revokeObjectURL(luckyPreviews.get(key));
      const url = URL.createObjectURL(file);
      luckyFiles.set(key, file); luckyPreviews.set(key, url);
      const img = field.querySelector(".lucky-editor-preview");
      img.src = url; img.hidden = false;
      status.textContent = "画像を選択しました。変更を保存すると反映されます。";
    } catch (error) { status.textContent = error.message; }
  }
  luckyModal.addEventListener("change", event => {
    if (event.target.matches("[data-image-input]") && event.target.files?.[0]) {
      selectLuckyImage(event.target.closest("[data-record]"), event.target.files[0]);
    }
  });
  luckyModal.addEventListener("paste", event => {
    if (luckyModal.dataset.saving === "true") return;
    const item = [...(event.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const field = event.target.closest("[data-record]");
    if (!field) { $("lucky-editor-status").textContent = "貼り付け先の画像欄を先に選択してください。"; return; }
    const file = item.getAsFile();
    if (file) selectLuckyImage(field, file);
  });
  luckyModal.addEventListener("click", event => {
    if (event.target === luckyModal || event.target.closest("[data-lucky-close]")) closeLuckyEditor();
  });
  luckyModal.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.stopPropagation(); closeLuckyEditor(); }
    if (event.key === "Tab") {
      const focusable = [...luckyModal.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(e => e.getClientRects().length);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  $("lucky-editor-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!luckyEditing || luckyModal.dataset.saving === "true") return;
    const status = $("lucky-editor-status");
    if (!luckyEditing.group._stored) {
      status.textContent = "共有保存の設定がまだ完了していません。ラッキーボール編集設定SQLを実行し、ページを再読み込みしてください。";
      return;
    }
    const changed = [];
    for (const field of $("lucky-editor-fields").querySelectorAll("[data-record]")) {
      const key = field.dataset.record;
      const original = key === "group" ? luckyEditing.group : luckyEditing.items[Number(key)];
      const patch = {};
      for (const input of field.querySelectorAll("[data-field]")) {
        const value = input.value.trim();
        if (value !== String(original[input.dataset.field] ?? "")) patch[input.dataset.field] = value;
      }
      if (Object.keys(patch).length || luckyFiles.has(key)) changed.push({key, original, patch});
    }
    if (!changed.length) { status.textContent = "変更はありません。"; return; }
    luckyModal.dataset.saving = "true";
    luckyModal.querySelectorAll("button,input,textarea").forEach(el => el.disabled = true);
    status.textContent = "保存中…";
    try {
      // Verify the save function before uploading images, so missing SQL creates no orphan upload.
      const probe = await api("/rest/v1/rpc/lucky_ball_edit", {method:"POST", body:JSON.stringify({p_slug:luckyEditing.group.slug,p_group:{},p_items:[]})});
      if (!probe.ok) throw new Error("共有保存に接続できません。編集設定SQLを実行済みか確認してください。");
      for (const change of changed) {
        if (luckyFiles.has(change.key)) {
          change.patch.image_url = await uploadImage(`lucky-ball/${luckyEditing.group.slug}/${crypto.randomUUID()}`, luckyFiles.get(change.key));
        }
      }
      const groupPatch = changed.find(c => c.key === "group")?.patch || {};
      const itemPatches = changed.filter(c => c.key !== "group").map(c => ({original_name:c.original.name_en, ...c.patch}));
      const response = await api("/rest/v1/rpc/lucky_ball_edit", {method:"POST", body:JSON.stringify({p_slug:luckyEditing.group.slug,p_group:groupPatch,p_items:itemPatches})});
      if (!response.ok) throw new Error("保存できませんでした。入力内容を残しています。通信状態と英語名の重複を確認してください。");
      const slug = luckyEditing.group.slug;
      luckyModal.dataset.saving = "false";
      closeLuckyEditor();
      await loadShared();
      const groupNode = document.getElementById(`lucky-ball-${slug}`);
      if (groupNode) {
        const hub = groupNode.closest(".glossary-entry")?.querySelector("details");
        if (hub) hub.open = true;
        groupNode.open = true;
        groupNode.scrollIntoView({block:"start"});
      }
    } catch (error) { status.textContent = error.message; }
    finally {
      luckyModal.dataset.saving = "false";
      luckyModal.querySelectorAll("button,input,textarea").forEach(el => el.disabled = false);
    }
  });

  buildIndexes();
  bindMajorIndex();
  loadShared();
})();
