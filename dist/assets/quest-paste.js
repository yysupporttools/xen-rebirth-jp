(() => {
  "use strict";

  function getImageDialog() {
    return document.getElementById("image-dialog");
  }

  function getImageForm() {
    return document.getElementById("image-form");
  }

  function setStatus(message) {
    const status =
      document.getElementById("image-form-status");

    if (status) {
      status.textContent = message;
    }
  }

  document.addEventListener(
    "paste",
    event => {

      const dialog = getImageDialog();
      const form = getImageForm();

      if (!dialog || !form) {
        return;
      }

      /* 画像追加画面を開いている時だけ動作 */
      if (!dialog.open) {
        return;
      }

      const items =
        Array.from(
          event.clipboardData?.items || []
        );

      const imageItem =
        items.find(item =>
          item.type &&
          item.type.startsWith("image/")
        );

      if (!imageItem) {
        setStatus(
          "クリップボードに画像がありません。"
        );

        return;
      }

      event.preventDefault();

      const blob =
        imageItem.getAsFile();

      if (!blob) {
        setStatus(
          "画像を読み取れませんでした。"
        );

        return;
      }

      /* 5MB制限 */
      if (blob.size > 5 * 1024 * 1024) {
        setStatus(
          "貼り付け画像は5MB以下にしてください。"
        );

        return;
      }

      const extensionMap = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif"
      };

      const extension =
        extensionMap[blob.type] || "png";

      const file =
        new File(
          [blob],
          `clipboard-${Date.now()}.${extension}`,
          {
            type:
              blob.type || "image/png"
          }
        );

      const input =
        form.querySelector(
          'input[name="image"]'
        );

      if (!input) {
        setStatus(
          "画像入力欄が見つかりません。"
        );

        return;
      }

      const transfer =
        new DataTransfer();

      transfer.items.add(file);

      input.files =
        transfer.files;

      /*
        通常のファイル選択と同じように
        changeイベントも発生させる
      */
      input.dispatchEvent(
        new Event(
          "change",
          { bubbles: true }
        )
      );

      setStatus(
        "📋 コピーした画像を貼り付けました！ " +
        `(${(
          file.size /
          1024 /
          1024
        ).toFixed(2)} MB)`
      );
    },
    true
  );

})();
