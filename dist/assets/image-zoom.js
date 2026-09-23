(() => {
  'use strict';
  const selector = 'img.glossary-thumb, img.lucky-ball-group-image, img.lucky-ball-item-image, img.class-equipment-image, img.token-exchange-item-icon';
  const dialog = document.createElement('dialog');
  dialog.className = 'image-zoom';
  dialog.setAttribute('aria-labelledby', 'image-zoom-title');
  dialog.innerHTML = '<div class="image-zoom-head"><h2 id="image-zoom-title">画像を拡大</h2><button type="button" aria-label="拡大画像を閉じる" autofocus>閉じる ×</button></div><img class="image-zoom-full" alt=""><p class="image-zoom-error" role="status" hidden>画像を読み込めませんでした。</p>';
  document.body.append(dialog);
  const full = dialog.querySelector('img');
  const error = dialog.querySelector('[role="status"]');
  let opener = null;
  let previousOverflow = '';
  function prepare(root) {
    const images = root.matches?.(selector) ? [root] : [];
    images.push(...(root.querySelectorAll?.(selector) || []));
    for (const img of images) {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-haspopup', 'dialog');
      img.setAttribute('aria-label', `${img.alt || '画像'}を拡大`);
      img.title = 'クリックして拡大';
    }
  }
  prepare(document);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1 && !dialog.contains(node)) prepare(node);
    }
  }).observe(document.querySelector('main') || document.body, {childList:true, subtree:true});
  function open(img) {
    if (dialog.open) return;
    opener = img;
    full.hidden = false;
    error.hidden = true;
    full.alt = img.alt || '拡大画像';
    full.referrerPolicy = img.referrerPolicy;
    full.src = img.currentSrc || img.src;
    dialog.querySelector('h2').textContent = img.alt || '画像を拡大';
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
  }
  full.addEventListener('error', () => { full.hidden = true; error.hidden = false; });
  document.addEventListener('click', event => {
    if (!event.target.matches?.(selector)) return;
    event.preventDefault();
    event.stopPropagation();
    open(event.target);
  }, true);
  document.addEventListener('keydown', event => {
    if (!event.target.matches?.(selector) || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    open(event.target);
  }, true);
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    full.removeAttribute('src');
    if (opener?.isConnected) opener.focus({preventScroll:true});
  });
})();
