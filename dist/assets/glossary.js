"use strict";
(() => {
  const panel = document.getElementById("glossary-search-panel");
  if (!panel) return;

  const CFG = window.XEN_GLOSSARY_CONFIG || {};
  const query = document.getElementById("glossary-query");
  const categorySelect = document.getElementById("glossary-category");
  const countEl = document.getElementById("glossary-count");
  const emptyEl = document.getElementById("glossary-empty");
  const anchorNav = document.querySelector(".anchor-nav");
  const syncStatus = document.createElement("p");
  syncStatus.className = "glossary-sync-note";
  syncStatus.setAttribute("role", "status");
  panel.after(syncStatus);
  let categories = [];
  let terms = [];
  let usingSharedData = false;
  let editingTerm = null;
  let modalOpener = null;
  let previewUrl = null;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const normalize = text => String(text ?? "").normalize("NFKC").toLocaleLowerCase("ja").replace(/[’‘]/g,"'").trim();
  const configured = () => /^https?:\/\//.test(CFG.SUPABASE_URL || "") && (CFG.SUPABASE_ANON_KEY || "").length > 20;
  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }
  function authHeaders() {
    const headers = {apikey: CFG.SUPABASE_ANON_KEY};
    if (!CFG.SUPABASE_ANON_KEY.startsWith("sb_publishable_")) headers.Authorization = "Bearer " + CFG.SUPABASE_ANON_KEY;
    return headers;
  }

  function api(path, options={}) {
    const headers = Object.assign({
      ...authHeaders(),
      "Content-Type": "application/json"
    }, options.headers || {});
    return fetch(CFG.SUPABASE_URL + path, {...options, headers});
  }

  function currentEntries() { return [...document.querySelectorAll(".glossary-entry")]; }

  function filter() {
    const words = normalize(query.value).split(/\s+/).filter(Boolean);
    const entries = currentEntries();
    let count = 0;
    for (const entry of entries) {
      const text = normalize(entry.textContent);
      entry.hidden = !(words.every(word => text.includes(word)) && (!categorySelect.value || categorySelect.value === entry.dataset.category));
      if (!entry.hidden) count++;
    }
    document.querySelectorAll(".glossary-category").forEach(section => {
      section.hidden = ![...section.querySelectorAll(".glossary-entry")].some(entry => !entry.hidden);
    });
    countEl.textContent = `${count} / ${entries.length}件`;
    emptyEl.hidden = count !== 0;
  }

  function reset() { query.value = ""; categorySelect.value = ""; filter(); }

  function revealHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target || (!target.classList.contains("glossary-entry") && !target.classList.contains("glossary-category"))) return;
    reset();
    requestAnimationFrame(() => {
      target.scrollIntoView({behavior:"instant",block:"start"});
      if (target.classList.contains("glossary-entry")) target.focus({preventScroll:true});
    });
  }

  function categoryOptions() {
    const selectedCategory = categorySelect.value;
    categorySelect.innerHTML = '<option value="">すべて</option>' + categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
    categorySelect.value = categories.some(c => c.name === selectedCategory) ? selectedCategory : "";
    const editCategory = document.getElementById("edit-category");
    editCategory.innerHTML = '<option value="">分類を選択</option>' + categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    if (anchorNav) anchorNav.innerHTML = categories.map((c,i) => `<a href="#category-${i}">${esc(c.name)}</a>`).join("");
  }

  function detail(label, value) {
    return value ? `<div class="glossary-detail"><strong>${esc(label)}</strong>${esc(value).replace(/\n/g,"<br>")}</div>` : "";
  }

  function renderSharedTerms() {
    document.querySelectorAll(".glossary-category").forEach(x => x.remove());
    categories.forEach((cat,index) => {
      const section = document.createElement("section");
      section.className = "glossary-category";
      section.id = `category-${index}`;
      section.innerHTML = `<h2>${esc(cat.name)}</h2>`;
      terms.filter(t => String(t.category_id) === String(cat.id)).forEach(t => {
        const article = document.createElement("article");
        article.className = "paper glossary-entry";
        article.dataset.category = cat.name;
        article.id = t.slug;
        article.tabIndex = -1;
        const image = safeUrl(t.image_url) ? `<img class="glossary-entry-image" src="${esc(safeUrl(t.image_url))}" alt="${esc(t.name_en || t.name_ja)}">` : "";
        const alias = t.aliases ? `<p class="small">別表記：${esc(t.aliases)}</p>` : "";
        const jp = t.name_ja ? `<p class="small">日本語名：${esc(t.name_ja)}</p>` : "";
        const details = [
          detail("ドロップ場所", t.drop_location),
          detail("入手方法", t.acquisition),
          detail("関連NPC / モンスター", t.related_entity),
          detail("必要Lv", t.required_level === null ? "" : t.required_level),
          detail("備考", t.notes)
        ].filter(Boolean).join("");
        const links = [
          safeUrl(t.related_guide) ? `<a href="${esc(safeUrl(t.related_guide))}">関連ガイドへ</a>` : "",
          safeUrl(t.source_url) ? `<a href="${esc(safeUrl(t.source_url))}" rel="noopener noreferrer" target="_blank">公式の出典 ↗</a>` : "",
          `<a href="#${esc(t.slug)}">この項目へのリンク</a>`
        ].filter(Boolean).join("");
        article.innerHTML = `
          <div class="${image ? "glossary-entry-media" : ""}">
            ${image}
            <div>
              <h3>${esc(t.name_en || t.name_ja)}</h3>${jp}${alias}
              <p>${esc(t.description).replace(/\n/g,"<br>")}</p>
              ${details ? `<div class="glossary-detail-list">${details}</div>` : ""}
              <div class="glossary-links">${links}<button type="button" class="glossary-edit-button" data-edit-id="${esc(t.id)}">編集</button></div>
              <div class="glossary-updated">更新：${esc(new Date(t.updated_at).toLocaleString("ja-JP"))}${t.contributor_name ? " / 投稿：" + esc(t.contributor_name) : ""}</div>
            </div>
          </div>`;
        section.appendChild(article);
      });
      emptyEl.before(section);
    });
    bindEditButtons();
    filter();
  }

  async function loadShared() {
    if (!configured()) {
      syncStatus.textContent = "共同編集の接続設定がありません。保存済みの用語を表示しています。";
      return false;
    }
    try {
      const [cRes,tRes] = await Promise.all([
        api("/rest/v1/glossary_categories?select=*&order=sort_order.asc,name.asc"),
        api("/rest/v1/glossary_terms?select=*&order=updated_at.desc")
      ]);
      if (!cRes.ok || !tRes.ok) throw new Error("共有用語集を取得できません");
      categories = await cRes.json();
      terms = await tRes.json();
      if (!categories.length) throw new Error("分類を取得できません");
      usingSharedData = true;
      categoryOptions();
      renderSharedTerms();
      syncStatus.textContent = `共同編集に接続済み：${terms.length}件・${categories.length}分類`;
      return true;
    } catch(err) {
      console.warn(err);
      syncStatus.textContent = "共同編集の取得に失敗しました。直前の表示を残しています。ページを再読み込みしてお試しください。";
      return false;
      // Static 43 entries remain visible as fallback.
    }
  }

  function openModal(id) {
    modalOpener = document.activeElement;
    const modal = document.getElementById(id);
    modal.hidden = false;
    document.body.style.overflow="hidden";
    modal.querySelector("input:not([type=hidden]),button")?.focus();
  }
  function closeModal(id) {
    document.getElementById(id).hidden = true;
    document.body.style.overflow="";
    modalOpener?.focus();
  }
  document.addEventListener("keydown", e => {
    const modal = document.querySelector(".glossary-modal:not([hidden])");
    if (!modal) return;
    if (e.key === "Escape") closeModal(modal.id);
    if (e.key === "Tab") {
      const fields = [...modal.querySelectorAll("button,input:not([type=hidden]),select,textarea")].filter(el => !el.disabled);
      const first = fields[0], last = fields[fields.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function fillTermForm(term=null) {
    editingTerm = term;
    document.getElementById("glossary-editor-title").textContent = term ? "用語を編集" : "用語を追加";
    document.getElementById("edit-term-id").value = term?.id || "";
    document.getElementById("edit-term-slug").value = term?.slug || "";
    document.getElementById("edit-name-en").value = term?.name_en || "";
    document.getElementById("edit-name-ja").value = term?.name_ja || "";
    document.getElementById("edit-aliases").value = term?.aliases || "";
    document.getElementById("edit-category").value = term?.category_id || "";
    document.getElementById("edit-description").value = term?.description || "";
    document.getElementById("edit-drop-location").value = term?.drop_location || "";
    document.getElementById("edit-acquisition").value = term?.acquisition || "";
    document.getElementById("edit-related-entity").value = term?.related_entity || "";
    document.getElementById("edit-required-level").value = term?.required_level ?? "";
    document.getElementById("edit-notes").value = term?.notes || "";
    document.getElementById("edit-related-guide").value = term?.related_guide || "";
    document.getElementById("edit-source-url").value = term?.source_url || "";
    document.getElementById("edit-contributor").value = "";
    const preview = document.getElementById("edit-image-preview");
    preview.src = safeUrl(term?.image_url);
    preview.hidden = !term?.image_url;
    document.getElementById("edit-image").value = "";
    document.getElementById("glossary-save-status").textContent = "";
  }

  function bindEditButtons() {
    document.querySelectorAll("[data-edit-id]").forEach(btn => btn.addEventListener("click", () => {
      const term = terms.find(t => String(t.id) === btn.dataset.editId);
      if (!term) return;
      fillTermForm(term);
      openModal("glossary-editor-modal");
    }));
  }

  async function uploadImage(id,file) {
    if (!file) return editingTerm?.image_url || null;
    if (file.size > 5*1024*1024) throw new Error("画像は5MB以下にしてください");
    if (!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)) throw new Error("PNG/JPG/WebP/GIF画像を選択してください");
    const ext=(file.name.split(".").pop()||"png").replace(/[^a-z0-9]/gi,"").toLowerCase();
    const objectName=`${id}/${Date.now()}.${ext}`;
    const res=await fetch(`${CFG.SUPABASE_URL}/storage/v1/object/glossary-images/${objectName}`,{
      method:"POST",
      headers:{
        ...authHeaders(),
        "Content-Type":file.type || "application/octet-stream"
      },
      body:file
    });
    if(!res.ok) throw new Error("画像をアップロードできませんでした");
    return `${CFG.SUPABASE_URL}/storage/v1/object/public/glossary-images/${objectName}`;
  }

  document.getElementById("glossary-add-term")?.addEventListener("click", () => {
    if (!configured()) return alert("共同編集機能を使うには assets/glossary-config.js のSupabase設定が必要です。");
    if (!usingSharedData) return alert("共同編集に接続できていません。ページを再読み込みしてお試しください。");
    fillTermForm();
    openModal("glossary-editor-modal");
  });
  document.getElementById("glossary-add-category")?.addEventListener("click", () => {
    if (!configured()) return alert("共同編集機能を使うには assets/glossary-config.js のSupabase設定が必要です。");
    if (!usingSharedData) return alert("共同編集に接続できていません。ページを再読み込みしてお試しください。");
    document.getElementById("category-save-status").textContent = "";
    openModal("glossary-category-modal");
  });

  document.querySelectorAll("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
  document.querySelectorAll(".glossary-modal").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) closeModal(modal.id); }));

  document.getElementById("edit-image")?.addEventListener("change", e => {
    const f=e.target.files[0],preview=document.getElementById("edit-image-preview");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if(!f){preview.hidden=true;return;}
    previewUrl=URL.createObjectURL(f);preview.src=previewUrl;preview.hidden=false;
  });

  document.getElementById("glossary-editor-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const submit=e.submitter,status=document.getElementById("glossary-save-status");
    submit.disabled=true;status.textContent="保存中…";
    try{
      for (const field of ["edit-related-guide", "edit-source-url"]) {
        const value = document.getElementById(field).value.trim();
        if (value && !safeUrl(value)) throw new Error("リンクは http:// または https:// のURLか、サイト内の相対パスで入力してください");
      }
      const id=document.getElementById("edit-term-id").value || null;
      const uploadId=id || crypto.randomUUID();
      const imageUrl=await uploadImage(uploadId,document.getElementById("edit-image").files[0]);
      const payload={
        p_id:id,
        p_slug:document.getElementById("edit-term-slug").value || null,
        p_name_en:document.getElementById("edit-name-en").value.trim(),
        p_name_ja:document.getElementById("edit-name-ja").value.trim() || null,
        p_aliases:document.getElementById("edit-aliases").value.trim() || null,
        p_category_id:document.getElementById("edit-category").value,
        p_description:document.getElementById("edit-description").value.trim(),
        p_drop_location:document.getElementById("edit-drop-location").value.trim() || null,
        p_acquisition:document.getElementById("edit-acquisition").value.trim() || null,
        p_related_entity:document.getElementById("edit-related-entity").value.trim() || null,
        p_required_level:document.getElementById("edit-required-level").value ? Number(document.getElementById("edit-required-level").value) : null,
        p_notes:document.getElementById("edit-notes").value.trim() || null,
        p_related_guide:document.getElementById("edit-related-guide").value.trim() || null,
        p_source_url:document.getElementById("edit-source-url").value.trim() || null,
        p_image_url:imageUrl,
        p_contributor_name:document.getElementById("edit-contributor").value.trim() || null
      };
      const res=await api("/rest/v1/rpc/glossary_save_term",{method:"POST",body:JSON.stringify(payload)});
      if(!res.ok) throw new Error(await res.text());
      status.textContent="保存しました。";
      closeModal("glossary-editor-modal");
      await loadShared();
    }catch(err){console.error(err);status.textContent="保存できませんでした：" + err.message;}
    finally{submit.disabled=false;}
  });

  document.getElementById("glossary-category-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const submit=e.submitter,status=document.getElementById("category-save-status");
    submit.disabled=true;status.textContent="追加中…";
    try{
      const res=await api("/rest/v1/rpc/glossary_add_category",{method:"POST",body:JSON.stringify({
        p_name:document.getElementById("new-category-name").value.trim(),
        p_description:document.getElementById("new-category-description").value.trim() || null,
        p_contributor_name:document.getElementById("new-category-contributor").value.trim() || null
      })});
      if(!res.ok) throw new Error(await res.text());
      document.getElementById("glossary-category-form").reset();
      closeModal("glossary-category-modal");
      await loadShared();
    }catch(err){console.error(err);status.textContent="追加できませんでした：" + err.message;}
    finally{submit.disabled=false;}
  });

  query.addEventListener("input", filter);
  categorySelect.addEventListener("change", filter);
  document.getElementById("glossary-reset").addEventListener("click", () => {reset();query.focus();});
  anchorNav?.addEventListener("click", e => { if(e.target.closest("a")) reset(); });
  window.addEventListener("hashchange", revealHash);
  window.addEventListener("pageshow", revealHash);

  panel.hidden=false;
  filter();
  loadShared().then(revealHash);
})();
