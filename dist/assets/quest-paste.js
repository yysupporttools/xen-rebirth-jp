(() => {
  "use strict";

  /*
    Xen Rebirth
    クエスト画像
    コピー＆ペースト / ドラッグ＆ドロップ対応
  */

  if (window.__xenQuestPasteV2Loaded) {
    return;
  }

  window.__xenQuestPasteV2Loaded = true;

  const MAX_SIZE =
    5 * 1024 * 1024;

  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  let previewUrl = null;


  /* ========================================
     DOM取得
  ======================================== */

  function $(id) {
    return document.getElementById(id);
  }


  function getDialog() {
    return $("image-dialog");
  }


  function getForm() {
    return $("image-form");
  }


  function getInput() {
    const form = getForm();

    if (!form) {
      return null;
    }

    return form.querySelector(
      'input[name="image"]'
    );
  }


  function getStatus() {
    return $("image-form-status");
  }


  /* ========================================
     メッセージ
  ======================================== */

  function setStatus(
    message,
    type = "normal"
  ) {
    const status =
      getStatus();

    if (!status) {
      return;
    }

    status.textContent =
      message || "";

    status.style.color =
      type === "error"
        ? "#c0392b"
        : "";
  }


  /* ========================================
     貼り付けエリアを作る
  ======================================== */

  function createPasteArea() {

    const form =
      getForm();

    if (!form) {
      return;
    }

    if (
      $("quest-paste-area")
    ) {
      return;
    }

    const area =
      document.createElement("div");

    area.id =
      "quest-paste-area";

    area.tabIndex = 0;

    area.innerHTML = `
      <div class="quest-paste-icon">
        📋
      </div>

      <strong>
        画像をコピーして Ctrl + V
      </strong>

      <span>
        または、ここに画像をドラッグ＆ドロップ
      </span>

      <small>
        JPEG / PNG / WebP / GIF・5MB以下
      </small>

      <div
        id="quest-paste-preview"
        hidden
      >
        <img
          id="quest-paste-preview-image"
          alt="アップロード画像プレビュー"
        >

        <div
          id="quest-paste-file-name"
        ></div>
      </div>
    `;

    const firstLabel =
      form.querySelector("label");

    if (firstLabel) {
      form.insertBefore(
        area,
        firstLabel
      );
    } else {
      form.prepend(area);
    }


    /* ドラッグ */

    area.addEventListener(
      "dragenter",
      event => {

        event.preventDefault();

        area.classList.add(
          "is-dragging"
        );
      }
    );


    area.addEventListener(
      "dragover",
      event => {

        event.preventDefault();

        area.classList.add(
          "is-dragging"
        );
      }
    );


    area.addEventListener(
      "dragleave",
      event => {

        event.preventDefault();

        area.classList.remove(
          "is-dragging"
        );
      }
    );


    area.addEventListener(
      "drop",
      event => {

        event.preventDefault();

        area.classList.remove(
          "is-dragging"
        );

        const files =
          Array.from(
            event.dataTransfer
              ?.files || []
          );

        const image =
          files.find(file =>
            file.type
              .startsWith(
                "image/"
              )
          );

        if (!image) {

          setStatus(
            "画像ファイルをドロップしてください。",
            "error"
          );

          return;
        }

        setImageFile(
          image,
          "drop"
        );
      }
    );


    /*
      エリアをクリックしたら
      通常のファイル選択も可能
    */

    area.addEventListener(
      "click",
      event => {

        if (
          event.target.closest(
            "#quest-paste-preview"
          )
        ) {
          return;
        }

        const input =
          getInput();

        if (input) {
          input.click();
        }
      }
    );
  }


  /* ========================================
     CSSを追加
  ======================================== */

  function addStyles() {

    if (
      $("quest-paste-style")
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "quest-paste-style";

    style.textContent = `

      #quest-paste-area {
        margin: 0 0 16px;
        padding: 22px 18px;

        border:
          2px dashed
          rgba(
            201,
            168,
            93,
            .75
          );

        border-radius: 14px;

        background:
          rgba(
            201,
            168,
            93,
            .07
          );

        text-align: center;

        cursor: pointer;

        transition:
          background .2s ease,
          border-color .2s ease,
          transform .2s ease;
      }


      #quest-paste-area:hover,
      #quest-paste-area:focus {
        outline: none;

        background:
          rgba(
            201,
            168,
            93,
            .13
          );

        border-color:
          #c9a85d;
      }


      #quest-paste-area.is-dragging {
        background:
          rgba(
            201,
            168,
            93,
            .2
          );

        transform:
          scale(1.01);
      }


      #quest-paste-area
      .quest-paste-icon {
        margin-bottom: 5px;
        font-size: 28px;
      }


      #quest-paste-area strong {
        display: block;

        margin-bottom: 5px;

        color:
          #123f43;

        font-size:
          16px;
      }


      #quest-paste-area > span {
        display: block;

        margin-bottom: 4px;

        font-size:
          13px;
      }


      #quest-paste-area > small {
        display: block;

        opacity: .68;

        font-size:
          11px;
      }


      #quest-paste-preview {
        margin-top: 14px;
      }


      #quest-paste-preview img {
        display: block;

        width: auto;
        max-width: 100%;
        max-height: 230px;

        margin:
          0 auto 8px;

        border-radius: 10px;

        box-shadow:
          0 5px 16px
          rgba(
            0,
            0,
            0,
            .16
          );
      }


      #quest-paste-file-name {
        font-size: 12px;

        word-break:
          break-all;
      }


      @media
      (max-width: 600px) {

        #quest-paste-area {
          padding:
            18px 12px;
        }

        #quest-paste-area strong {
          font-size:
            14px;
        }
      }

    `;

    document.head.appendChild(
      style
    );
  }


  /* ========================================
     ファイルチェック
  ======================================== */

  function validateFile(file) {

    if (!file) {

      throw new Error(
        "画像を取得できませんでした。"
      );
    }


    if (
      !ALLOWED_TYPES.includes(
        file.type
      )
    ) {

      throw new Error(
        "JPEG・PNG・WebP・GIFの画像を使用してください。"
      );
    }


    if (
      file.size >
      MAX_SIZE
    ) {

      throw new Error(
        "画像は5MB以下にしてください。"
      );
    }
  }


  /* ========================================
     inputへ画像をセット
  ======================================== */

  function setImageFile(
    originalFile,
    source = "paste"
  ) {

    try {

      validateFile(
        originalFile
      );


      const input =
        getInput();

      if (!input) {

        throw new Error(
          "画像入力欄が見つかりません。"
        );
      }


      /*
        clipboard Blobの場合でも
        正しいファイル名を付ける
      */

      let file =
        originalFile;


      if (
        !file.name ||
        file.name ===
        "image.png"
      ) {

        const extensions = {
          "image/jpeg":
            "jpg",

          "image/png":
            "png",

          "image/webp":
            "webp",

          "image/gif":
            "gif"
        };


        const ext =
          extensions[
            file.type
          ] || "png";


        file =
          new File(
            [file],
            `clipboard-${Date.now()}.${ext}`,
            {
              type:
                file.type ||
                "image/png",

              lastModified:
                Date.now()
            }
          );
      }


      /*
        File inputへセット
      */

      const transfer =
        new DataTransfer();

      transfer.items.add(
        file
      );

      input.files =
        transfer.files;


      /*
        通常ファイル選択と
        同じイベントを発生
      */

      input.dispatchEvent(
        new Event(
          "input",
          {
            bubbles: true
          }
        )
      );

      input.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true
          }
        )
      );


      showPreview(
        file
      );


      const label =
        source === "drop"
          ? "画像をドロップしました"
          : "コピーした画像を貼り付けました";


      setStatus(
        `📋 ${label}（${(
          file.size /
          1024 /
          1024
        ).toFixed(2)} MB）`
      );


    } catch (error) {

      console.error(
        "Quest paste:",
        error
      );

      setStatus(
        error.message ||
        "画像を設定できませんでした。",
        "error"
      );
    }
  }


  /* ========================================
     プレビュー
  ======================================== */

  function showPreview(file) {

    const preview =
      $("quest-paste-preview");

    const image =
      $("quest-paste-preview-image");

    const name =
      $("quest-paste-file-name");


    if (
      !preview ||
      !image
    ) {
      return;
    }


    if (previewUrl) {

      URL.revokeObjectURL(
        previewUrl
      );
    }


    previewUrl =
      URL.createObjectURL(
        file
      );


    image.src =
      previewUrl;


    if (name) {

      name.textContent =
        file.name;
    }


    preview.hidden =
      false;
  }


  function clearPreview() {

    const preview =
      $("quest-paste-preview");

    const image =
      $("quest-paste-preview-image");

    const name =
      $("quest-paste-file-name");


    if (preview) {

      preview.hidden =
        true;
    }


    if (image) {

      image.removeAttribute(
        "src"
      );
    }


    if (name) {

      name.textContent =
        "";
    }


    if (previewUrl) {

      URL.revokeObjectURL(
        previewUrl
      );

      previewUrl =
        null;
    }
  }


  /* ========================================
     Clipboardから画像取得
  ======================================== */

  function getClipboardImage(
    clipboardData
  ) {

    if (!clipboardData) {
      return null;
    }


    /*
      filesを優先
    */

    const files =
      Array.from(
        clipboardData.files ||
        []
      );


    const imageFile =
      files.find(file =>
        file.type &&
        file.type.startsWith(
          "image/"
        )
      );


    if (imageFile) {

      return imageFile;
    }


    /*
      itemsから取得
    */

    const items =
      Array.from(
        clipboardData.items ||
        []
      );


    const imageItem =
      items.find(item =>
        item.type &&
        item.type.startsWith(
          "image/"
        )
      );


    if (
      imageItem &&
      imageItem.kind ===
      "file"
    ) {

      return (
        imageItem.getAsFile() ||
        null
      );
    }


    return null;
  }


  /* ========================================
     Ctrl + V
  ======================================== */

  document.addEventListener(
    "paste",
    event => {

      const dialog =
        getDialog();


      /*
        画像追加画面が
        開いている時だけ有効
      */

      if (
        !dialog ||
        !dialog.open
      ) {
        return;
      }


      const file =
        getClipboardImage(
          event.clipboardData
        );


      if (!file) {

        setStatus(
          "クリップボードに画像が見つかりませんでした。",
          "error"
        );

        return;
      }


      /*
        quests.js内に残っている
        古いpaste処理を止める
      */

      event.preventDefault();

      event.stopPropagation();

      event.stopImmediatePropagation();


      setImageFile(
        file,
        "paste"
      );

    },
    true
  );


  /* ========================================
     通常ファイル選択
  ======================================== */

  document.addEventListener(
    "change",
    event => {

      const input =
        getInput();


      if (
        !input ||
        event.target !==
        input
      ) {
        return;
      }


      const file =
        input.files?.[0];


      if (!file) {

        clearPreview();

        return;
      }


      try {

        validateFile(
          file
        );

        showPreview(
          file
        );


        /*
          clipboard処理から
          dispatchした場合は
          statusを上書きしない
        */

        if (
          !getStatus()
            ?.textContent
            ?.includes(
              "貼り付けました"
            )
        ) {

          setStatus(
            `画像を選択しました（${(
              file.size /
              1024 /
              1024
            ).toFixed(2)} MB）`
          );
        }


      } catch (error) {

        input.value =
          "";

        clearPreview();

        setStatus(
          error.message,
          "error"
        );
      }

    }
  );


  /* ========================================
     ダイアログを開いた時
  ======================================== */

  function watchDialog() {

    const dialog =
      getDialog();


    if (!dialog) {
      return;
    }


    const observer =
      new MutationObserver(
        () => {

          if (
            dialog.open
          ) {

            clearPreview();

            setStatus(
              "画像をコピーして Ctrl + V でも追加できます。"
            );

            setTimeout(
              () => {

                const area =
                  $("quest-paste-area");

                if (area) {
                  area.focus();
                }

              },
              50
            );
          }
        }
      );


    observer.observe(
      dialog,
      {
        attributes: true,
        attributeFilter: [
          "open"
        ]
      }
    );
  }


  /* ========================================
     初期化
  ======================================== */

  function init() {

    addStyles();

    createPasteArea();

    watchDialog();


    console.log(
      "Quest image paste V2 loaded"
    );
  }


  /*
    quests.jsの初期化後に実行
  */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      () => {

        setTimeout(
          init,
          100
        );

      },
      {
        once: true
      }
    );

  } else {

    setTimeout(
      init,
      100
    );
  }

})();
