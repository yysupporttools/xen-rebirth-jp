(() => {
  const links = document.querySelectorAll('[data-skill-video]');
  if (!links.length || typeof HTMLDialogElement === 'undefined') return;
  const dialog = document.createElement('dialog');
  dialog.className = 'skill-video-dialog';
  dialog.setAttribute('aria-labelledby', 'skill-video-title');
  dialog.innerHTML = `<div class="skill-video-heading"><h2 id="skill-video-title"></h2><button type="button" class="skill-video-close" autofocus aria-label="動画を閉じる">閉じる ×</button></div><video controls loop playsinline preload="none"></video><p class="skill-video-hint" aria-live="polite">繰り返し再生します。音声はプレーヤーで切り替えられます。</p>`;
  document.body.append(dialog);
  const video = dialog.querySelector('video');
  const hint = dialog.querySelector('.skill-video-hint');
  let opener;
  let sequence = 0;
  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    opener = link;
    const current = ++sequence;
    dialog.querySelector('h2').textContent = link.dataset.skillVideo;
    hint.textContent = '繰り返し再生します。音声はプレーヤーで切り替えられます。';
    video.src = link.href;
    video.muted = true;
    dialog.showModal();
    document.documentElement.classList.add('skill-video-open');
    video.play().catch(() => {
      if (current === sequence && dialog.open) hint.textContent = 'プレーヤーの再生ボタンを押してください。再生中はループします。';
    });
  }));
  video.addEventListener('error', () => {
    if (dialog.open) hint.textContent = '動画を読み込めませんでした。ページを再読み込みしてお試しください。';
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    sequence++;
    video.pause();
    video.removeAttribute('src');
    video.load();
    document.documentElement.classList.remove('skill-video-open');
    opener?.focus();
  });
})();