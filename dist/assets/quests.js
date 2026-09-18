"use strict";

(() => {

  const $ = id => document.getElementById(id);

  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
    );

  const cfg = window.XEN_GLOSSARY_CONFIG;

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  const editorKey = (() => {

    const k = 'xen-quest-editor';

    let v = localStorage.getItem(k);

    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(k, v);
    }

    return v;

  })();

  let quests = [];
  let current = null;
  let steps = [];
  let images = [];


  // ========================================
  // 共通処理
  // ========================================

  async function rpc(name, args) {

    const { data, error } = await db.rpc(name, args);

    if (error) {
      throw Error(error.message);
    }

    return data;

  }


  function status(msg) {

    $('quest-status').textContent = msg || '';

  }


  function showDialog(id) {

    $(id).showModal();

  }


  document
    .querySelectorAll('[data-close]')
    .forEach(b =>
      b.addEventListener(
        'click',
        () => $(b.dataset.close).close()
      )
    );


  // ========================================
  // クエスト一覧
  // ========================================

  async function loadList() {

    status('クエストを読み込み中…');

    const { data, error } =
      await db
        .from('quests')
        .select('*')
        .order('title_en');

    if (error) {

      status(
        '読み込みに失敗しました：' +
        error.message
      );

      return;

    }

    quests = data || [];

    renderList();

    status('');

  }


  function renderList() {

    const word =
      $('quest-search')
        .value
        .trim()
        .toLowerCase();

    const cat =
      $('quest-category').value;


    const rows = quests.filter(q => {

      const text = [
        q.title_en,
        q.title_ja,
        q.start_npc,
        q.start_location,
        q.notes
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!word || text.includes(word)) &&
        (!cat || q.category === cat)
      );

    });


    $('quest-list').innerHTML =
      rows.length

        ? rows.map(q => `

          <a
            class="quest-card"
            href="#${q.id}"
          >

            <span class="quest-badge">
              ${esc(
                q.category ||
                '一般クエスト'
              )}
            </span>

            ${
              q.required_level != null
                ? `
                  <span class="quest-badge">
                    Lv ${esc(q.required_level)}
                  </span>
                `
                : ''
            }

            <h2>
              ${esc(
                q.title_ja ||
                q.title_en
              )}
            </h2>

            ${
              q.title_ja
                ? `
                  <p>
                    ${esc(q.title_en)}
                  </p>
                `
                : ''
            }

            <p>
              開始NPC：
              ${esc(
                q.start_npc ||
                '未登録'
              )}
            </p>

            <p>
              開始場所：
              ${esc(
                q.start_location ||
                '未登録'
              )}
            </p>

          </a>

        `).join('')

        : `
          <div class="paper quest-empty">
            該当するクエストはまだ登録されていません。
          </div>
        `;

  }


  // ========================================
  // ルーティング
  // ========================================

  async function route() {

    const id =
      location.hash.slice(1);


    if (!id) {

      $('quest-list-view').hidden = false;

      $('quest-detail').hidden = true;

      renderList();

      return;

    }


    $('quest-list-view').hidden = true;

    $('quest-detail').hidden = false;

    status(
      'クエスト詳細を読み込み中…'
    );


    const [
      { data: q, error: qe },
      { data: s, error: se },
      { data: i, error: ie }
    ] = await Promise.all([

      db
        .from('quests')
        .select('*')
        .eq('id', id)
        .maybeSingle(),

      db
        .from('quest_steps')
        .select('*')
        .eq('quest_id', id)
        .order('step_number'),

      db
        .from('quest_images')
        .select('*')
        .eq('quest_id', id)
        .order('created_at')

    ]);


    if (
      qe ||
      se ||
      ie ||
      !q
    ) {

      status(
        'クエストを読み込めませんでした。'
      );

      $('quest-detail').innerHTML =
        '<a href="quests.html">← クエスト一覧へ</a>';

      return;

    }


    current = q;

    steps = s || [];

    images = i || [];

    renderDetail();

    status('');

  }


  // ========================================
  // 画像表示
  // ========================================

  function imgHtml(stepId) {

    const rows =
      images.filter(
        x =>
          (x.step_id || null) ===
          (stepId || null)
      );


    if (!rows.length) {
      return '';
    }


    return `
      <div class="quest-images">

        ${
          rows.map(x => `

            <figure>

              <a
                href="${esc(x.image_url)}"
                target="_blank"
                rel="noopener"
              >

                <img
                  src="${esc(x.image_url)}"
                  alt="${esc(
                    x.caption ||
                    'クエスト攻略画像'
                  )}"
                  loading="lazy"
                >

              </a>

              ${
                x.caption
                  ? `
                    <figcaption>
                      ${esc(x.caption)}
                    </figcaption>
                  `
                  : ''
              }

              <div class="quest-image-actions">
                <button
                  type="button"
                  class="quest-image-delete"
                  data-image-delete="${esc(x.id)}"
                >
                  画像を削除
                </button>
              </div>

            </figure>

          `).join('')
        }

      </div>
    `;

  }


  // ========================================
  // 削除済みクエスト
  // ========================================

  async function openDeletedQuests() {

    try {

      const { data, error } =
        await db
          .from('quest_revisions')
          .select('*')
          .eq('action', 'delete')
          .order(
            'created_at',
            { ascending: false }
          )
          .limit(100);


      if (error) {
        throw Error(error.message);
      }


      const existing =
        new Set(
          (quests || [])
            .map(q => q.id)
        );

      const seen =
        new Set();

      const rows = [];


      for (const r of (data || [])) {

        if (
          !existing.has(r.quest_id) &&
          !seen.has(r.quest_id)
        ) {

          seen.add(r.quest_id);

          rows.push(r);

        }

      }


      const dlg =
        document.createElement(
          'dialog'
        );

      dlg.className =
        'quest-history-dialog';


      dlg.innerHTML = `

        <div class="quest-history-head">

          <div>

            <p class="eyebrow">
              DELETED QUESTS
            </p>

            <h2>
              削除済みクエスト
            </h2>

          </div>

          <button
            type="button"
            class="quest-history-close"
          >
            閉じる
          </button>

        </div>

        <p class="small">
          削除時のバックアップから復元できます。
        </p>

        <div class="quest-history-list">

          ${
            rows.length

              ? rows.map(r => {

                  const s =
                    r.previous_data || {};

                  const q =
                    s.quest || s;

                  const t =
                    q.title_ja ||
                    q.title_en ||
                    '名称不明';

                  const d =
                    r.created_at
                      ? new Date(
                          r.created_at
                        ).toLocaleString(
                          'ja-JP'
                        )
                      : '日時不明';

                  const sc =
                    Array.isArray(s.steps)
                      ? s.steps.length
                      : 0;

                  const ic =
                    Array.isArray(s.images)
                      ? s.images.length
                      : 0;


                  return `

                    <article
                      class="quest-history-item"
                    >

                      <div>

                        <strong>
                          ${esc(t)}
                        </strong>

                        <span>
                          ${esc(d)}
                        </span>

                      </div>

                      <p>
                        攻略STEP ${sc}件 /
                        画像 ${ic}件
                      </p>

                      <button
                        type="button"
                        class="primary"
                        data-restore-deleted="${esc(r.id)}"
                      >
                        復元する
                      </button>

                    </article>

                  `;

                }).join('')

              : `
                <p>
                  復元できる削除済みクエストはありません。
                </p>
              `
          }

        </div>
      `;


      document.body.appendChild(dlg);


      dlg
        .querySelector(
          '.quest-history-close'
        )
        .onclick =
          () => dlg.close();


      dlg.addEventListener(
        'close',
        () => dlg.remove()
      );


      dlg
        .querySelectorAll(
          '[data-restore-deleted]'
        )
        .forEach(b =>

          b.onclick =
            async () => {

              if (
                !confirm(
                  'このクエストをSTEP・画像情報を含めて復元します。よろしいですか？'
                )
              ) {
                return;
              }


              b.disabled = true;


              try {

                const id =
                  await rpc(
                    'quest_restore_revision',
                    {
                      p_revision_id:
                        b.dataset.restoreDeleted,

                      p_editor_id:
                        editorKey
                    }
                  );


                dlg.close();

                await loadList();

                location.hash =
                  id || '';

                await route();


              } catch (err) {

                alert(
                  '復元できませんでした：' +
                  err.message
                );

                b.disabled = false;

              }

            }

        );


      dlg.showModal();


    } catch (err) {

      alert(
        '削除済みクエストを読み込めませんでした：' +
        err.message
      );

    }

  }


  // ========================================
  // 編集履歴
  // ========================================

  async function openHistory() {

    try {

      const { data, error } =
        await db
          .from('quest_revisions')
          .select('*')
          .eq(
            'quest_id',
            current.id
          )
          .order(
            'created_at',
            { ascending: false }
          )
          .limit(50);


      if (error) {
        throw Error(error.message);
      }


      const rows =
        data || [];


      const labels = {
        create: '作成',
        update: '編集',
        delete: '削除',
        restore: '復元'
      };


      const dlg =
        document.createElement(
          'dialog'
        );


      dlg.className =
        'quest-history-dialog';


      dlg.innerHTML = `

        <div class="quest-history-head">

          <div>

            <p class="eyebrow">
              EDIT HISTORY
            </p>

            <h2>
              編集履歴
            </h2>

          </div>

          <button
            type="button"
            class="quest-history-close"
          >
            閉じる
          </button>

        </div>

        <p class="small">
          直近50件を表示します。「この状態に戻す」は、その操作が行われる前のクエスト基本情報へ戻します。
        </p>

        <div class="quest-history-list">

          ${
            rows.length

              ? rows.map(r => {

                  const d =
                    r.previous_data || {};

                  const when =
                    r.created_at
                      ? new Date(
                          r.created_at
                        ).toLocaleString(
                          'ja-JP'
                        )
                      : '日時不明';

                  const title =
                    d.title_ja ||
                    d.title_en ||
                    '復元可能な基本情報';

                  const canRestore =
                    !!r.previous_data;


                  return `

                    <article
                      class="quest-history-item"
                    >

                      <div>

                        <strong>
                          ${esc(
                            labels[r.action] ||
                            r.action ||
                            '変更'
                          )}
                        </strong>

                        <span>
                          ${esc(when)}
                        </span>

                      </div>

                      <p>
                        ${esc(title)}
                      </p>

                      ${
                        canRestore
                          ? `
                            <button
                              type="button"
                              data-restore="${esc(r.id)}"
                            >
                              この状態に戻す
                            </button>
                          `
                          : `
                            <span class="small">
                              この履歴からは復元できません
                            </span>
                          `
                      }

                    </article>

                  `;

                }).join('')

              : `
                <p>
                  編集履歴はまだありません。
                </p>
              `
          }

        </div>
      `;


      document.body.appendChild(dlg);


      dlg
        .querySelector(
          '.quest-history-close'
        )
        .onclick =
          () => dlg.close();


      dlg.addEventListener(
        'close',
        () => dlg.remove()
      );


      dlg
        .querySelectorAll(
          '[data-restore]'
        )
        .forEach(b =>

          b.onclick =
            async () => {

              if (
                !confirm(
                  'クエストの基本情報をこの履歴の状態に戻します。よろしいですか？'
                )
              ) {
                return;
              }


              b.disabled = true;


              try {

                await rpc(
                  'quest_restore_revision',
                  {
                    p_revision_id:
                      b.dataset.restore,

                    p_editor_id:
                      editorKey
                  }
                );


                dlg.close();

                await loadList();

                await route();


              } catch (err) {

                alert(
                  '復元できませんでした：' +
                  err.message
                );

                b.disabled = false;

              }

            }

        );


      dlg.showModal();


    } catch (err) {

      alert(
        '編集履歴を読み込めませんでした：' +
        err.message
      );

    }

  }


  // ========================================
  // クエスト削除
  // ========================================

  async function deleteQuest() {

    if (!current) {
      return;
    }


    const name =
      current.title_ja ||
      current.title_en;


    if (
      !confirm(
        `「${name}」を削除します。\n\n攻略STEPも削除されます。クエスト基本情報は編集履歴から復元できますが、STEP・画像情報は現在の復元対象外です。\n\n本当に削除しますか？`
      )
    ) {
      return;
    }


    const typed =
      prompt(
        '誤操作防止のため「削除」と入力してください。'
      );


    if (typed !== '削除') {
      return;
    }


    const btn =
      document.getElementById(
        'quest-delete'
      );


    if (btn) {
      btn.disabled = true;
    }


    try {

      await rpc(
        'quest_delete',
        {
          p_quest_id:
            current.id,

          p_editor_id:
            editorKey
        }
      );


      location.hash = '';

      await loadList();

      await route();


    } catch (err) {

      alert(
        '削除できませんでした：' +
        err.message
      );


      if (btn) {
        btn.disabled = false;
      }

    }

  }


  // ========================================
  // クエスト詳細
  // ========================================

  function renderDetail() {

    const q = current;


    $('quest-detail').innerHTML = `

      <a
        class="quest-back"
        href="quests.html"
      >
        ← クエスト一覧へ
      </a>


      <article class="paper">

        <span class="quest-badge">
          ${esc(
            q.category ||
            '一般クエスト'
          )}
        </span>

        ${
          q.required_level != null
            ? `
              <span class="quest-badge">
                Lv ${esc(q.required_level)}
              </span>
            `
            : ''
        }


        <h1 class="quest-detail-title">
          ${esc(
            q.title_ja ||
            q.title_en
          )}
        </h1>


        ${
          q.title_ja
            ? `
              <p class="small">
                ${esc(q.title_en)}
              </p>
            `
            : ''
        }


        <div class="quest-meta">

          <div>

            <small>
              開始NPC
            </small>

            <strong>
              ${esc(
                q.start_npc ||
                '未登録'
              )}
            </strong>

          </div>


          <div>

            <small>
              開始場所
            </small>

            <strong>
              ${esc(
                q.start_location ||
                '未登録'
              )}
            </strong>

          </div>


          <div>

            <small>
              前提クエスト
            </small>

            <strong>
              ${esc(
                q.prerequisite ||
                'なし / 未登録'
              )}
            </strong>

          </div>

        </div>


        ${
          q.rewards
            ? `
              <h2>
                報酬
              </h2>

              <p class="quest-note">
                ${esc(q.rewards)}
              </p>
            `
            : ''
        }


        ${
          q.notes
            ? `
              <h2>
                攻略メモ
              </h2>

              <p class="quest-note">
                ${esc(q.notes)}
              </p>
            `
            : ''
        }


        ${
          q.source_url
            ? `
              <p class="quest-source">

                <a
                  href="${esc(q.source_url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  情報元を確認 ↗
                </a>

              </p>
            `
            : ''
        }


        ${imgHtml(null)}


        <div class="quest-actions">

          <button
            class="primary"
            id="quest-edit"
          >
            クエスト情報を編集
          </button>

          <button id="step-add">
            攻略STEPを追加
          </button>

          <button id="quest-image-add">
            クエスト画像を追加
          </button>

          <button id="quest-history">
            編集履歴
          </button>

          <button
            class="danger"
            id="quest-delete"
          >
            クエストを削除
          </button>

        </div>

      </article>


      <section>

        <div class="section-heading">

          <div>

            <p class="eyebrow">
              WALKTHROUGH
            </p>

            <h2>
              進行手順
            </h2>

          </div>

          <span>
            ${steps.length} STEP
          </span>

        </div>


        ${
          steps.length

            ? steps.map(s => `

                <article class="quest-step">

                  <div class="quest-step-head">

                    <div>

                      <span class="quest-step-number">
                        STEP ${esc(s.step_number)}
                      </span>

                      <h2>
                        ${esc(
                          s.title ||
                          '進行手順'
                        )}
                      </h2>

                    </div>


                    <div class="quest-actions">

                      <button
                        data-step-edit="${s.id}"
                      >
                        編集
                      </button>

                      <button
                        data-step-image="${s.id}"
                      >
                        画像追加
                      </button>

                    </div>

                  </div>


                  ${
                    s.npc_name
                      ? `
                        <p>
                          <strong>
                            NPC：
                          </strong>
                          ${esc(s.npc_name)}
                        </p>
                      `
                      : ''
                  }


                  ${
                    s.location
                      ? `
                        <p>
                          <strong>
                            場所：
                          </strong>
                          ${esc(s.location)}
                        </p>
                      `
                      : ''
                  }


                  <p class="quest-note">
                    ${esc(
                      s.description ||
                      '説明はまだ登録されていません。'
                    )}
                  </p>


                  ${imgHtml(s.id)}

                </article>

              `).join('')

            : `
              <div class="paper quest-empty">
                攻略手順はまだ登録されていません。「攻略STEPを追加」から追加できます。
              </div>
            `
        }

      </section>
    `;


    $('quest-edit').onclick =
      () => openQuestEdit(q);


    $('step-add').onclick =
      () => openStep();


    $('quest-image-add').onclick =
      () => openImage(null);


    $('quest-history').onclick =
      openHistory;


    $('quest-delete').onclick =
      deleteQuest;


    document
      .querySelectorAll(
        '[data-step-edit]'
      )
      .forEach(b =>

        b.onclick =
          () =>
            openStep(
              steps.find(
                s =>
                  s.id ===
                  b.dataset.stepEdit
              )
            )

      );


    document
      .querySelectorAll(
        '[data-step-image]'
      )
      .forEach(b =>

        b.onclick =
          () =>
            openImage(
              b.dataset.stepImage
            )

      );


    document
      .querySelectorAll(
        '[data-image-delete]'
      )
      .forEach(b => {

        b.onclick =
          () =>
            deleteQuestImage(
              b.dataset.imageDelete
            );

      });

  }


  // ========================================
  // クエスト編集
  // ========================================

  function fillQuestForm(q = {}) {

    const f =
      $('quest-form');


    f.reset();


    for (
      const n of [
        'title_en',
        'title_ja',
        'category',
        'required_level',
        'start_npc',
        'start_location',
        'prerequisite',
        'rewards',
        'notes',
        'source_url'
      ]
    ) {

      if (f.elements[n]) {

        f.elements[n].value =
          q[n] ?? '';

      }

    }

  }


  function openQuestEdit(q) {

    $('quest-dialog-title').textContent =
      'クエスト情報を編集';

    $('quest-form').dataset.id =
      q.id;

    fillQuestForm(q);

    showDialog(
      'quest-dialog'
    );

  }


  $('quest-new').onclick =
    () => {

      $('quest-dialog-title').textContent =
        'クエストを追加';

      $('quest-form').dataset.id =
        '';

      fillQuestForm();

      showDialog(
        'quest-dialog'
      );

    };


  $('quest-deleted').onclick =
    openDeletedQuests;


  $('quest-form').onsubmit =
    async e => {

      e.preventDefault();


      const f =
        e.target;

      const b =
        f.querySelector(
          '[type=submit]'
        );


      b.disabled = true;


      try {

        const v =
          n =>
            f.elements[n]
              .value
              .trim();


        const level =
          v('required_level') === ''
            ? null
            : Number(
                v('required_level')
              );


        const common = {

          p_title_en:
            v('title_en'),

          p_title_ja:
            v('title_ja'),

          p_category:
            v('category'),

          p_required_level:
            level,

          p_start_npc:
            v('start_npc'),

          p_start_location:
            v('start_location'),

          p_prerequisite:
            v('prerequisite'),

          p_rewards:
            v('rewards'),

          p_notes:
            v('notes'),

          p_source_url:
            v('source_url'),

          p_editor_id:
            editorKey

        };


        if (f.dataset.id) {

          await rpc(
            'quest_update',
            {
              p_quest_id:
                f.dataset.id,

              ...common
            }
          );

        } else {

          const id =
            await rpc(
              'quest_create',
              common
            );

          location.hash =
            id;

        }


        $('quest-dialog').close();

        await loadList();

        await route();


      } catch (err) {

        $('quest-form-status').textContent =
          err.message;


      } finally {

        b.disabled = false;

      }

    };


  // ========================================
  // STEP編集
  // ========================================

  function openStep(s = null) {

    const f =
      $('step-form');


    f.reset();


    f.dataset.id =
      s?.id || '';


    $('step-dialog-title').textContent =
      s
        ? '攻略STEPを編集'
        : '攻略STEPを追加';


    f.elements.step_number.value =
      s?.step_number ??
      (
        steps.length
          ? Math.max(
              ...steps.map(
                x => x.step_number
              )
            ) + 1
          : 1
      );


    for (
      const n of [
        'title',
        'description',
        'npc_name',
        'location'
      ]
    ) {

      f.elements[n].value =
        s?.[n] ?? '';

    }


    showDialog(
      'step-dialog'
    );

  }


  $('step-form').onsubmit =
    async e => {

      e.preventDefault();


      const f =
        e.target;

      const b =
        f.querySelector(
          '[type=submit]'
        );


      b.disabled = true;


      try {

        const v =
          n =>
            f.elements[n]
              .value
              .trim();


        const common = {

          p_step_number:
            Number(
              v('step_number')
            ),

          p_title:
            v('title'),

          p_description:
            v('description'),

          p_npc_name:
            v('npc_name'),

          p_location:
            v('location')

        };


        if (f.dataset.id) {

          await rpc(
            'quest_step_update',
            {
              p_step_id:
                f.dataset.id,

              ...common
            }
          );

        } else {

          await rpc(
            'quest_step_create',
            {
              p_quest_id:
                current.id,

              ...common
            }
          );

        }


        $('step-dialog').close();

        await route();


      } catch (err) {

        $('step-form-status').textContent =
          err.message;


      } finally {

        b.disabled = false;

      }

    };


  // ========================================
  // 画像アップロード
  // ========================================
  // ========================================
  // クリップボード画像貼り付け
  // Ctrl + V で画像をアップロード欄へセット
  // ========================================

  document.addEventListener('paste', e => {

    const dialog = $('image-dialog');

    // 画像追加ダイアログを開いている時だけ有効
    if (
      !dialog ||
      !dialog.open
    ) {
      return;
    }

    const items =
      Array.from(
        e.clipboardData?.items || []
      );

    const imageItem =
      items.find(item =>
        item.type.startsWith('image/')
      );

    if (!imageItem) {
      return;
    }

    e.preventDefault();

    const blob =
      imageItem.getAsFile();

    if (!blob) {
      return;
    }

    if (blob.size > 5242880) {
      $('image-form-status').textContent =
        '貼り付け画像は5MB以下にしてください。';

      return;
    }

    const mimeToExt = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };

    const ext =
      mimeToExt[blob.type] || 'png';

    const file =
      new File(
        [blob],
        `clipboard-${Date.now()}.${ext}`,
        {
          type: blob.type ||
            `image/${ext}`
        }
      );

    const input =
      $('image-form')
        .elements.image;

    /*
      通常のファイル選択と同じ状態にする
    */
    const transfer =
      new DataTransfer();

    transfer.items.add(file);

    input.files =
      transfer.files;

    $('image-form-status').textContent =
      `📋 画像を貼り付けました（${(
        file.size / 1024 / 1024
      ).toFixed(2)} MB）`;

  });

    // ========================================
  // Ctrl + V 画像貼り付け
  // ========================================

  document.addEventListener('paste', e => {

    const dialog = $('image-dialog');

    if (!dialog || !dialog.open) {
      return;
    }

    const items = Array.from(
      e.clipboardData?.items || []
    );

    const imageItem = items.find(
      item => item.type.startsWith('image/')
    );

    if (!imageItem) {
      return;
    }

    e.preventDefault();

    const blob = imageItem.getAsFile();

    if (!blob) {
      return;
    }

    if (blob.size > 5242880) {
      $('image-form-status').textContent =
        '貼り付け画像は5MB以下にしてください。';
      return;
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };

    const ext =
      extMap[blob.type] || 'png';

    const file = new File(
      [blob],
      `clipboard-${Date.now()}.${ext}`,
      {
        type: blob.type || 'image/png'
      }
    );

    const input =
      $('image-form').elements.image;

    const transfer =
      new DataTransfer();

    transfer.items.add(file);

    input.files = transfer.files;

    $('image-form-status').textContent =
      `📋 画像を貼り付けました（${(
        file.size / 1024 / 1024
      ).toFixed(2)} MB）`;
  });
  function openImage(stepId) {

    const f =
      $('image-form');


    f.reset();


    f.dataset.step =
      stepId || '';


    $('image-target').textContent =
      stepId
        ? 'このSTEPに画像を追加します。'
        : 'クエスト全体に画像を追加します。';


    showDialog(
      'image-dialog'
    );

  }


  $('image-form').onsubmit =
    async e => {

      e.preventDefault();


      const f =
        e.target;

      const b =
        f.querySelector(
          '[type=submit]'
        );


      b.disabled = true;


      $('image-form-status').textContent =
        'アップロード中…';


      try {

        const file =
          f.elements.image.files[0];


        if (!file) {

          throw Error(
            '画像を選択してください'
          );

        }


        if (
          file.size >
          5242880
        ) {

          throw Error(
            '画像は5MB以下にしてください'
          );

        }


        const ext =
          (
            file.name
              .split('.')
              .pop() ||
            'jpg'
          )
            .toLowerCase()
            .replace(
              /[^a-z0-9]/g,
              ''
            );


        const path =
          `${current.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;


        const { error: ue } =
          await db
            .storage
            .from(
              'quest-images'
            )
            .upload(
              path,
              file,
              {
                cacheControl:
                  '3600',

                upsert:
                  false
              }
            );


        if (ue) {
          throw ue;
        }


        const { data: url } =
          db
            .storage
            .from(
              'quest-images'
            )
            .getPublicUrl(
              path
            );


        await rpc(
          'quest_image_create',
          {

            p_quest_id:
              current.id,

            p_step_id:
              f.dataset.step ||
              null,

            p_image_url:
              url.publicUrl,

            p_caption:
              f.elements.caption
                .value
                .trim()

          }
        );


        $('image-dialog').close();

        await route();


      } catch (err) {

        $('image-form-status').textContent =
          err.message;


      } finally {

        b.disabled = false;

      }

    };


  // ========================================
  // 画像削除
  // ========================================

  function getQuestImageStoragePath(imageUrl) {

    try {

      const url = new URL(imageUrl);

      const marker =
        '/storage/v1/object/public/quest-images/';

      const index =
        url.pathname.indexOf(marker);

      if (index === -1) {
        return null;
      }

      const encodedPath =
        url.pathname.substring(
          index + marker.length
        );

      if (!encodedPath) {
        return null;
      }

      return decodeURIComponent(encodedPath);

    } catch (err) {

      console.error(
        '画像URLの解析に失敗しました',
        err
      );

      return null;

    }

  }


  async function deleteQuestImage(imageId) {

    const image =
      images.find(
        x =>
          String(x.id) ===
          String(imageId)
      );

    if (!image) {

      alert(
        '削除する画像が見つかりませんでした。'
      );

      return;

    }

    const caption =
      image.caption
        ? `\n\n画像：${image.caption}`
        : '';

    if (
      !confirm(
        `この画像を削除しますか？${caption}\n\nこの操作は取り消せません。`
      )
    ) {
      return;
    }

    const button =
      document.querySelector(
        `[data-image-delete="${CSS.escape(
          String(imageId)
        )}"]`
      );

    if (button) {
      button.disabled = true;
      button.textContent = '削除中…';
    }

    try {

      const storagePath =
        getQuestImageStoragePath(
          image.image_url
        );

      if (!storagePath) {
        throw new Error(
          'Storage上の画像パスを取得できませんでした。'
        );
      }

      // まずDBの画像レコードを削除
      await rpc(
        'quest_image_delete',
        {
          p_image_id: image.id,
          p_editor_id: editorKey
        }
      );

      // 次にStorageの実ファイルを削除
      const { error: storageError } =
        await db
          .storage
          .from('quest-images')
          .remove([storagePath]);

      if (storageError) {

        console.error(
          'Storage画像の削除に失敗しました',
          storageError
        );

        alert(
          '画像情報は削除しましたが、Storage上の実ファイル削除に失敗しました。\n\n' +
          storageError.message
        );
      }

      await route();

    } catch (err) {

      console.error(
        '画像削除エラー',
        err
      );

      alert(
        '画像を削除できませんでした。\n\n' +
        (err?.message || String(err))
      );

      if (button) {
        button.disabled = false;
        button.textContent = '画像を削除';
      }

    }

  }


  // ========================================
  // ★ クエスト一括インポート
  // ========================================

  const importButton =
    $('quest-import');

  const importDialog =
    $('import-dialog');

  const importForm =
    $('import-form');

  const importStatus =
    $('import-status');


  if (
    importButton &&
    importDialog &&
    importForm
  ) {

    // ----------------------------------------
    // インポート画面を開く
    // ----------------------------------------

    importButton.addEventListener(
      'click',
      () => {

        importForm.reset();

        if (importStatus) {
          importStatus.textContent = '';
        }

        importDialog.showModal();

      }
    );


    // ----------------------------------------
    // JSON一括登録
    // ----------------------------------------

    importForm.addEventListener(
      'submit',
      async e => {

        e.preventDefault();


        const submitButton =
          importForm.querySelector(
            '[type="submit"]'
          );


        submitButton.disabled =
          true;


        let createdQuestId =
          null;


        try {

          if (importStatus) {

            importStatus.textContent =
              'データを確認しています…';

          }


          const raw =
            importForm
              .elements
              .import_data
              .value
              .trim();


          if (!raw) {

            throw new Error(
              'インポートデータを入力してください。'
            );

          }


          // --------------------------------
          // JSON解析
          // --------------------------------

          let data;


          try {

            data =
              JSON.parse(raw);

          } catch {

            throw new Error(
              'JSON形式が正しくありません。'
            );

          }


          // --------------------------------
          // 基本データ確認
          // --------------------------------

          if (
            !data ||
            typeof data !==
              'object'
          ) {

            throw new Error(
              'インポートデータが正しくありません。'
            );

          }


          if (
            !data.quest ||
            typeof data.quest !==
              'object'
          ) {

            throw new Error(
              'questデータがありません。'
            );

          }


          if (
            !String(
              data.quest.title_en ||
              ''
            ).trim()
          ) {

            throw new Error(
              '英語クエスト名がありません。'
            );

          }


          if (
            !Array.isArray(
              data.steps
            )
          ) {

            throw new Error(
              'stepsデータがありません。'
            );

          }


          if (
            data.steps.length === 0
          ) {

            throw new Error(
              '攻略STEPが登録されていません。'
            );

          }


          if (
            data.steps.length > 100
          ) {

            throw new Error(
              '攻略STEPは100件以内にしてください。'
            );

          }


          // --------------------------------
          // 必要レベル確認
          // --------------------------------

          const q =
            data.quest;


          let requiredLevel =
            null;


          if (
            q.required_level !==
              null &&
            q.required_level !==
              undefined &&
            q.required_level !==
              ''
          ) {

            requiredLevel =
              Number(
                q.required_level
              );


            if (
              !Number.isFinite(
                requiredLevel
              ) ||
              requiredLevel < 0
            ) {

              throw new Error(
                '必要レベルが正しくありません。'
              );

            }

          }


          // --------------------------------
          // STEP番号確認
          // --------------------------------

          const stepNumbers =
            new Set();


          for (
            const step of
            data.steps
          ) {

            if (
              !step ||
              typeof step !==
                'object'
            ) {

              throw new Error(
                'STEPデータが正しくありません。'
              );

            }


            const num =
              Number(
                step.step_number
              );


            if (
              !Number.isInteger(
                num
              ) ||
              num < 1 ||
              num > 100
            ) {

              throw new Error(
                `STEP番号が正しくありません：${step.step_number}`
              );

            }


            if (
              stepNumbers.has(
                num
              )
            ) {

              throw new Error(
                `STEP ${num} が重複しています。`
              );

            }


            stepNumbers.add(
              num
            );

          }


          // --------------------------------
          // 登録前確認
          // --------------------------------

          const questName =
            String(
              q.title_ja ||
              q.title_en
            ).trim();


          if (
            !confirm(
              `「${questName}」を登録します。\n\n攻略STEP：${data.steps.length}件\n\n一括登録を開始してよろしいですか？`
            )
          ) {

            if (importStatus) {

              importStatus.textContent =
                '登録をキャンセルしました。';

            }

            return;

          }


          // --------------------------------
          // クエスト作成
          // --------------------------------

          if (importStatus) {

            importStatus.textContent =
              `クエストを登録しています…（STEP ${data.steps.length}件）`;

          }


          createdQuestId =
            await rpc(
              'quest_create',
              {

                p_title_en:
                  String(
                    q.title_en ||
                    ''
                  ).trim(),

                p_title_ja:
                  String(
                    q.title_ja ||
                    ''
                  ).trim(),

                p_category:
                  String(
                    q.category ||
                    '一般クエスト'
                  ).trim(),

                p_required_level:
                  requiredLevel,

                p_start_npc:
                  String(
                    q.start_npc ||
                    ''
                  ).trim(),

                p_start_location:
                  String(
                    q.start_location ||
                    ''
                  ).trim(),

                p_prerequisite:
                  String(
                    q.prerequisite ||
                    ''
                  ).trim(),

                p_rewards:
                  String(
                    q.rewards ||
                    ''
                  ).trim(),

                p_notes:
                  String(
                    q.notes ||
                    ''
                  ).trim(),

                p_source_url:
                  String(
                    q.source_url ||
                    ''
                  ).trim(),

                p_editor_id:
                  editorKey

              }
            );


          if (!createdQuestId) {

            throw new Error(
              'クエストIDを取得できませんでした。'
            );

          }


          // --------------------------------
          // STEPを番号順に並べる
          // --------------------------------

          const sortedSteps =
            [...data.steps]
              .sort(
                (a, b) =>
                  Number(
                    a.step_number
                  ) -
                  Number(
                    b.step_number
                  )
              );


          // --------------------------------
          // STEP登録
          // --------------------------------

          let completed = 0;


          for (
            const step of
            sortedSteps
          ) {

            if (importStatus) {

              importStatus.textContent =
                `STEPを登録しています… ${completed + 1} / ${sortedSteps.length}`;

            }


            await rpc(
              'quest_step_create',
              {

                p_quest_id:
                  createdQuestId,

                p_step_number:
                  Number(
                    step.step_number
                  ),

                p_title:
                  String(
                    step.title ||
                    ''
                  ).trim(),

                p_description:
                  String(
                    step.description ||
                    ''
                  ).trim(),

                p_npc_name:
                  String(
                    step.npc_name ||
                    ''
                  ).trim(),

                p_location:
                  String(
                    step.location ||
                    ''
                  ).trim()

              }
            );


            completed++;

          }


          // --------------------------------
          // 完了
          // --------------------------------

          if (importStatus) {

            importStatus.textContent =
              `登録完了：${completed} STEP`;

          }


          await loadList();


          importDialog.close();


          location.hash =
            createdQuestId;


          await route();


        } catch (err) {

          console.error(err);


          let message =
            err?.message ||
            String(err);


          // クエストだけ作成された後に
          // STEP登録が失敗した場合に分かるよう表示
          if (createdQuestId) {

            message +=
              '\n\nクエスト本体は作成済みの可能性があります。重複登録を避けるため、クエスト一覧を確認してください。';

          }


          if (importStatus) {

            importStatus.textContent =
              '登録できませんでした：' +
              message;

          }

        } finally {

          submitButton.disabled =
            false;

        }

      }
    );

  }


  // ========================================
  // 検索・ルーティング開始
  // ========================================

  $('quest-search')
    .addEventListener(
      'input',
      renderList
    );


  $('quest-category')
    .addEventListener(
      'change',
      renderList
    );


  window.addEventListener(
    'hashchange',
    route
  );


  loadList()
    .then(route);


})();
