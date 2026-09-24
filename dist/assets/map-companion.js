"use strict";
(() => {
  const $ = id => document.getElementById(id);
  if (!$('companion-connect')) return;
  let token = '', timer = null, connected = false, epoch = 0, state = null;
  const status = text => { $('companion-status').textContent = text; };
  const actionIds = ['companion-send', 'companion-clear', 'companion-export'];
  function enable(on) { actionIds.forEach(id => { $(id).disabled = !on; }); }
  async function request(path, body) {
    const response = await fetch('http://127.0.0.1:18765' + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      credentials: 'omit', targetAddressSpace: 'loopback',
      headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(response.status === 401 ? '接続コードが違います。常駐ツールのコードを貼り直してください。' : '常駐ツールへの要求を処理できませんでした。');
    return response.json();
  }
  function render(value) {
    state = value;
    $('companion-current').textContent = value.current || '拡大マップ待機中';
    $('companion-path').textContent = value.path.length ? value.path.join(' → ') : '行先を選ぶと道順を表示します。';
    status(value.status);
    const options = value.destinations.map(name => {
      const option = document.createElement('option'); option.value = name;
      option.label = value.japanese[name] || name; return option;
    });
    $('companion-destinations').replaceChildren(...options);
    const preview = $('companion-preview');
    preview.hidden = !value.preview;
    if (value.preview && value.preview.startsWith('data:image/jpeg;base64,')) preview.src = value.preview;
    else preview.removeAttribute('src');
    const list = $('companion-maps');
    // Keep focused controls intact while polling.
    const signature = JSON.stringify(value.maps);
    if (list.dataset.signature !== signature && !list.contains(document.activeElement)) {
      list.dataset.signature = signature;
      list.replaceChildren(...Object.entries(value.maps).map(([name, map]) => {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = name + ' · 出口 ' + Object.values(map.exits).filter(e => e.count >= 2).length + '件';
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '収集記録を削除';
        button.addEventListener('click', () => act('/forget', { name }));
        item.append(text, button); return item;
      }));
    }
    $('companion-count').textContent = Object.keys(value.maps).length + ' エリア';
  }
  async function poll(id) {
    try {
      const value = await request('/state');
      if (id !== epoch) return;
      connected = true; enable(true); render(value);
      timer = setTimeout(() => poll(id), 2000);
    } catch (error) {
      if (id !== epoch) return;
      connected = false; enable(false);
      $('companion-current').textContent = '未接続';
      $('companion-path').textContent = '接続が切れました。常駐ツールの案内は継続します。停止はツール側で行ってください。';
      $('companion-preview').hidden = true;
      $('companion-preview').removeAttribute('src');
      status(error.message.includes('コード') ? error.message : '接続できません。常駐ツールを起動し、Chrome / Edgeのローカルネットワーク接続を許可してから再接続してください。');
      $('companion-maps').querySelectorAll('button').forEach(b => { b.disabled = true; });
      $('companion-maps').dataset.signature = '';
    }
  }
  async function act(path, body) {
    if (!connected) return;
    try { await request(path, body); status('常駐ツールに送信しました。'); }
    catch (error) { status(error.message); }
  }
  $('companion-connect').addEventListener('click', () => {
    token = $('companion-code').value.trim();
    if (!token) { status('常駐ツールに表示される接続コードを貼り付けてください。'); return; }
    clearTimeout(timer); enable(false); status('接続しています…'); poll(++epoch);
  });
  $('companion-send').addEventListener('click', () => {
    const raw = $('companion-destination').value.trim();
    const name = state.destinations.includes(raw) ? raw : Object.keys(state.japanese).find(n => state.japanese[n] === raw && state.destinations.includes(n));
    if (!name) { status('候補から行先を選んでください。未登録エリアは収集後に追加されます。'); return; }
    act('/destination', { name, transports: $('companion-transports').checked });
  });
  $('companion-clear').addEventListener('click', () => act('/clear', {}));
  $('companion-export').addEventListener('click', () => {
    if (!state) return;
    const blob = new Blob([JSON.stringify({ version: 1, maps: state.maps }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); const url = URL.createObjectURL(blob);
    link.href = url; link.download = 'xen-map-atlas.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('pagehide', () => { clearTimeout(timer); ++epoch; });
  enable(false);
})();
