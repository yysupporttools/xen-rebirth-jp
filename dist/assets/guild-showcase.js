"use strict";
(() => {
  const publicRoot = document.querySelector('[data-guild-showcase]');
  const adminRoot = document.querySelector('[data-guild-admin]');
  if (!publicRoot && !adminRoot) return;
  const cfg = window.XEN_GLOSSARY_CONFIG;
  const project = cfg?.SUPABASE_URL || 'https://dzxxjtmpcfsmvdgkcwvn.supabase.co';
  const key = cfg?.SUPABASE_ANON_KEY || 'sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_';
  const endpoint = project + '/functions/v1/guild-showcase';
  const $ = id => document.getElementById(id);
  function node(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value != null) el.textContent = String(value); return el; }
  function safeImageUrl(value) {
    if (!value) return '';
    try {
      const u = new URL(String(value));
      const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (u.protocol !== 'https:' || u.username || u.password || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '::' || (host.includes(':') && /^(fc|fd|fe80:|::ffff:)/i.test(host))) return '';
      const parts = host.split('.').map(Number);
      if (parts.length === 4 && parts.every(x => Number.isInteger(x) && x >= 0 && x <= 255) && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168))) return '';
      return u.href;
    } catch { return ''; }
  }
  async function request(action, payload, token) {
    const headers = {apikey:key};
    if (token) headers.Authorization = 'Bearer ' + token;
    const options = {headers, signal:AbortSignal.timeout(30000)};
    let url = endpoint;
    if (payload) { options.method = 'POST'; headers['Content-Type'] = 'application/json'; options.body = JSON.stringify({action, ...payload}); }
    else if (action === 'admin') url += '?action=admin';
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '読み込みに失敗しました。時間をおいてお試しください。');
    return data;
  }
  let publicTimer = 0;
  let publicListeners = null;
  function renderShowcase(data) {
    clearTimeout(publicTimer);
    publicListeners?.abort();
    publicListeners = new AbortController();
    const eventOptions = {signal:publicListeners.signal};
    publicRoot.replaceChildren();
    const guild = data.guild;
    const members = Array.isArray(data.members) ? data.members : [];
    const intro = node('div','guild-intro-area');
    intro.append(node('p','guild-eyebrow','GUILD / 仲間と冒険'));
    const title = node('h2','',guild?.name || 'ギルド紹介');
    title.id = 'guild-showcase-title';
    intro.append(title);
    const stats = node('div','guild-stats');
    if (guild?.guild_level != null) stats.append(node('span','',`ギルドLv ${guild.guild_level}`));
    if (guild?.member_count != null) stats.append(node('span','',`メンバー ${guild.member_count}人`));
    if (stats.childNodes.length) intro.append(stats);
    intro.append(node('p','guild-intro',guild?.intro || 'ギルド紹介を準備中です。紹介文とメンバーの写真を、こちらに掲載します。'));
    publicRoot.append(intro);
    const area = node('div','guild-member-area');
    area.append(node('p','guild-member-heading','メンバー紹介'));
    if (!members.length) area.append(node('p','guild-small','メンバー紹介は準備中です。'));
    else {
      area.setAttribute('aria-roledescription','スライドショー');
      area.setAttribute('aria-label','ギルドメンバー紹介');
      const slide = node('div','guild-slide');
      slide.setAttribute('aria-live','off');
      const controls = node('div','guild-controls');
      const previous = node('button','', '←'); previous.type = 'button'; previous.setAttribute('aria-label','前のメンバー');
      const next = node('button','', '→'); next.type = 'button'; next.setAttribute('aria-label','次のメンバー');
      const toggle = node('button','guild-toggle','自動切替を停止'); toggle.type = 'button';
      const counter = node('p','guild-counter');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      let index = 0, paused = false, hovering = false, focused = false;
      const seconds = Math.min(30, Math.max(5, Number(guild?.slide_seconds) || 8));
      function schedule() {
        clearTimeout(publicTimer);
        if (members.length > 1 && !paused && !hovering && !focused && !document.hidden && !reduced.matches) publicTimer = setTimeout(() => { show(index + 1); }, seconds * 1000);
      }
      function show(value) {
        index = (value + members.length) % members.length;
        const member = members[index];
        slide.setAttribute('aria-live', paused || focused || reduced.matches ? 'polite' : 'off');
        slide.replaceChildren();
        const imageUrl = safeImageUrl(member.image_url);
        const photoEmpty = () => node('div','guild-photo-empty','写真を準備中です');
        if (imageUrl) {
          const image = node('img','guild-member-image'); image.src = imageUrl; image.alt = member.name + 'のゲーム内写真'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => image.replaceWith(node('div','guild-photo-empty','写真を表示できませんでした')), {once:true});
          slide.append(image);
        } else slide.append(photoEmpty());
        slide.append(node('h3','',member.name || 'メンバー'));
        if (member.role) slide.append(node('p','guild-role',member.role));
        slide.append(node('p','guild-member-intro',member.intro || '自己紹介は準備中です。'));
        counter.textContent = `${index + 1} / ${members.length} · 紹介メンバー ${members.length}名`;
        toggle.textContent = reduced.matches ? '自動切替は停止中' : paused ? '自動切替を再開' : '自動切替を停止';
        toggle.disabled = reduced.matches || members.length < 2;
        toggle.setAttribute('aria-pressed', String(paused || reduced.matches));
        toggle.title = reduced.matches ? '動きを減らす設定のため、自動切替を停止しています。前・次で切り替えられます。' : '';
        schedule();
      }
      previous.addEventListener('click', () => show(index - 1));
      next.addEventListener('click', () => show(index + 1));
      toggle.addEventListener('click', () => { paused = !paused; show(index); });
      previous.disabled = next.disabled = members.length < 2;
      controls.append(previous, toggle, next);
      area.append(slide, controls, counter);
      publicRoot.addEventListener('pointerenter', () => { hovering = true; schedule(); }, eventOptions);
      publicRoot.addEventListener('pointerleave', () => { hovering = false; schedule(); }, eventOptions);
      publicRoot.addEventListener('focusin', () => { focused = true; schedule(); }, eventOptions);
      publicRoot.addEventListener('focusout', e => { focused = publicRoot.contains(e.relatedTarget); schedule(); }, eventOptions);
      document.addEventListener('visibilitychange', schedule, eventOptions);
      reduced.addEventListener('change', () => show(index), eventOptions);
      show(0);
    }
    publicRoot.append(area);
    const link = node('a','guild-manage-link','紹介を管理（サイト管理者）'); link.href = 'guild.html'; publicRoot.append(link);
  }
  async function loadPublic() {
    try { renderShowcase(await request('public')); }
    catch {
      renderShowcase({guild:null,members:[]});
      const warning = node('p','guild-small','紹介情報を読み込めませんでした。');
      const retry = node('button','guild-retry','再読み込み'); retry.type='button'; retry.addEventListener('click',loadPublic);
      publicRoot.append(warning,retry);
    }
  }
  if (publicRoot) loadPublic();
  if (!adminRoot) return;
  if (!window.supabase) { $('guild-auth-status').textContent = 'ログイン機能を読み込めませんでした。ページを再読み込みしてください。'; return; }
  const db = window.supabase.createClient(project,key,{auth:{storageKey:'xen-board-admin',detectSessionInUrl:true}});
  let session = null, admin = false, authRun = 0, members = [], editingId = null, selectedPhoto = null, previewUrl = '', imageClear = false, photoReadRun = 0, pendingDelete = '';
  function status(id,message,error=false) { const el=$(id); el.textContent=message; el.classList.toggle('is-error',error); }
  function busy(form,state) { form.querySelectorAll('button,input,textarea').forEach(el => { el.disabled=state; }); }
  function clearPreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=''; }
  function resetMember(member=null) {
    photoReadRun++; clearPreview(); selectedPhoto=null; imageClear=false; editingId=member?.id || null;
    const form=$('guild-member-form'); form.reset();
    form.elements.name.value=member?.name || ''; form.elements.role.value=member?.role || ''; form.elements.intro.value=member?.intro || ''; form.elements.image_url.value=member?.image_url || ''; form.elements.is_published.checked=member?.is_published ?? true;
    $('guild-member-form-title').textContent=member ? 'メンバーを編集' : 'メンバーを追加';
    const src=safeImageUrl(member?.image_url); $('guild-photo-preview').hidden=!src; if(src)$('guild-photo-preview').src=src; else $('guild-photo-preview').removeAttribute('src');
    $('guild-photo-note').textContent=src?'登録済みの写真':'写真はまだ選択されていません。';
    status('guild-member-status',''); $('guild-member-editor').hidden=false;
  }
  async function photoFile(file) {
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('PNG・JPEG・WebPの写真を選んでください。');
    if (file.size > 20 * 1024 * 1024) throw Error('20MB以下の写真を選んでください。');
    if (file.size <= 2 * 1024 * 1024) return file;
    const image=await createImageBitmap(file);
    try {
      const scale=Math.min(1,1600/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale));
      const context=canvas.getContext('2d'); context.fillStyle='#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      if(!blob || blob.size > 2*1024*1024) throw Error('写真を2MB以下にしてから登録してください。');
      return blob;
    } finally { image.close(); }
  }
  async function selectPhoto(file) {
    const run=++photoReadRun;
    status('guild-member-status','写真を確認しています…');
    $('guild-member-save').disabled=true;
    try {
      const photo=await photoFile(file);
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('写真を読み込めませんでした。'));reader.readAsDataURL(photo);});
      if(run!==photoReadRun)return;
      selectedPhoto={type:photo.type,data:String(data).split(',')[1]}; imageClear=false;
      clearPreview(); previewUrl=URL.createObjectURL(photo); $('guild-photo-preview').src=previewUrl; $('guild-photo-preview').hidden=false;
      $('guild-photo-note').textContent=`登録する写真 · ${Math.round(photo.size/1024)}KB${photo!==file?'（表示サイズを整えて軽量化しました）':''}`;
      status('guild-member-status','写真の準備ができました。「メンバーを保存」で登録します。');
    } catch(e) { if(run===photoReadRun)status('guild-member-status',e.message,true); }
    finally { if(run===photoReadRun)$('guild-member-save').disabled=false; }
  }
  async function sessionChanged() {
    const run=++authRun; admin=false; $('guild-editor-panel').hidden=true;
    try {
      const {data,error}=await db.auth.getSession(); if(error)throw error; if(run!==authRun)return;
      session=data.session; $('guild-admin-login').hidden=!!session; $('guild-admin-code').hidden=!!session; $('guild-admin-logout').hidden=!session;
      if(!session){$('guild-auth-status').textContent='サイト管理者としてログインすると編集できます。'; $('guild-member-editor').hidden=true; resetLocalPhoto(); return;}
      const result=await db.rpc('board_is_admin'); if(result.error)throw result.error; if(run!==authRun)return;
      admin=result.data===true;
      $('guild-auth-status').textContent=admin?'サイト管理者としてログイン中':'このアカウントには管理者権限がありません。';
      if(admin){await loadAdmin();if(run===authRun)$('guild-editor-panel').hidden=false;}
    }catch(e){if(run===authRun)status('guild-auth-status','ログイン状態を確認できませんでした：'+e.message,true);}
  }
  function resetLocalPhoto(){photoReadRun++;selectedPhoto=null;clearPreview();}
  async function token() { if(!admin)throw Error('サイト管理者としてログインしてください。'); const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('ログインの有効期限が切れました。再ログインしてください。');return data.session.access_token; }
  async function mutate(action,payload){return request(action,payload,await token());}
  async function loadAdmin() {
    const data=await request('admin',null,await token());
    if(!admin)return;
    const guild=data.guild || {}; members=Array.isArray(data.members)?data.members:[];
    const form=$('guild-form'); form.elements.name.value=guild.name || '';form.elements.intro.value=guild.intro || '';form.elements.guild_level.value=guild.guild_level ?? '';form.elements.member_count.value=guild.member_count ?? '';form.elements.slide_seconds.value=guild.slide_seconds || 8;form.elements.is_published.checked=guild.is_published ?? false;
    renderMembers();
  }
  function actionButton(label,action){const b=node('button','',label);b.type='button';b.addEventListener('click',action);return b;}
  function renderMembers() {
    const list=$('guild-member-list');list.replaceChildren();
    $('guild-member-count').textContent=`紹介に登録したメンバー ${members.length}名（ギルド全体の人数とは別です）`;
    $('guild-member-add').disabled=members.length>=100;
    if(!members.length){list.append(node('p','guild-small','メンバーはまだ登録されていません。「メンバーを追加」から登録できます。'));return;}
    members.forEach((member,index)=>{
      const item=node('article','guild-admin-member');const imageUrl=safeImageUrl(member.image_url);
      if(imageUrl){const image=node('img','guild-admin-thumb');image.src=imageUrl;image.alt=member.name+'の写真';image.loading='lazy';item.append(image);}
      const content=node('div','guild-admin-member-content');content.append(node('strong','',member.name));const info=node('p','guild-small');info.append(node('span','guild-admin-tag',member.is_published?'公開':'非公開'));if(member.role)info.append(document.createTextNode(member.role));content.append(info);
      const actions=node('div','guild-admin-actions');actions.append(actionButton('編集',()=>{resetMember(member);$('guild-member-editor').scrollIntoView({behavior:'auto',block:'start'});$('guild-member-form').elements.name.focus();}));
      const up=actionButton('↑ 上へ',()=>reorder(index,-1));up.disabled=index===0;up.setAttribute('aria-label',member.name+'を上へ');const down=actionButton('↓ 下へ',()=>reorder(index,1));down.disabled=index===members.length-1;down.setAttribute('aria-label',member.name+'を下へ');actions.append(up,down);
      const remove=actionButton('削除',()=>{pendingDelete=member.id;$('guild-delete-name').textContent=member.name;status('guild-delete-status','');$('guild-delete-dialog').showModal();});remove.className='danger';actions.append(remove);content.append(actions);item.append(content);list.append(item);
    });
  }
  async function reorder(index,delta) {
    const ids=members.map(x=>x.id);[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];
    const list=$('guild-member-list');list.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await mutate('reorder',{ids});await loadAdmin();status('guild-list-status','表示順を保存しました。');}
    catch(e){status('guild-list-status',e.message,true);renderMembers();}
  }
  $('guild-admin-login').addEventListener('submit',async e=>{
    e.preventDefault();busy(e.currentTarget,true);
    try{const {error}=await db.auth.signInWithOtp({email:$('guild-admin-email').value.trim(),options:{shouldCreateUser:false,emailRedirectTo:new URL('guild.html',location.href).href}});if(error)throw error;status('guild-auth-status','ログインメールを送信しました。メール内のリンクを開くか、確認コードが届いた場合は下の欄に入力してください。');$('guild-admin-code').hidden=false;}
    catch(error){status('guild-auth-status','メールを送信できませんでした：'+error.message,true);}
    finally{busy($('guild-admin-login'),false);}
  });
  $('guild-admin-code').addEventListener('submit',async e=>{e.preventDefault();busy(e.currentTarget,true);try{const {error}=await db.auth.verifyOtp({email:$('guild-admin-email').value.trim(),token:$('guild-admin-token').value.trim(),type:'email'});if(error)throw error;await sessionChanged();}catch(error){status('guild-auth-status','確認できませんでした：'+error.message,true);}finally{busy($('guild-admin-code'),false);}});
  $('guild-admin-logout').addEventListener('click',async()=>{await db.auth.signOut();await sessionChanged();});
  $('guild-admin-reload').addEventListener('click',async()=>{try{await loadAdmin();status('guild-list-status','最新の内容を読み込みました。');}catch(e){status('guild-list-status',e.message,true);}});
  $('guild-form').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const value=new FormData(form);
    const guild={name:String(value.get('name')||'').trim(),intro:String(value.get('intro')||'').trim(),guild_level:value.get('guild_level')===''?null:Number(value.get('guild_level')),member_count:value.get('member_count')===''?null:Number(value.get('member_count')),slide_seconds:Number(value.get('slide_seconds')),is_published:form.elements.is_published.checked};
    busy(form,true);status('guild-form-status','保存しています…');
    try{await mutate('save_guild',{guild});status('guild-form-status',guild.is_published?'ギルド紹介を保存・公開しました。':'ギルド紹介を非公開で保存しました。');}
    catch(error){status('guild-form-status','保存できませんでした：'+error.message,true);}
    finally{busy(form,false);}
  });
  $('guild-member-add').addEventListener('click',()=>{resetMember();$('guild-member-editor').scrollIntoView({behavior:'auto',block:'start'});$('guild-member-form').elements.name.focus();});
  $('guild-member-cancel').addEventListener('click',()=>{$('guild-member-editor').hidden=true;resetLocalPhoto();status('guild-member-status','');});
  $('guild-member-form').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,value=new FormData(form),url=String(value.get('image_url')||'').trim();
    if(url && !safeImageUrl(url)){status('guild-member-status','写真のURLは公開されたHTTPSの画像URLを入力してください。',true);return;}
    const member={name:String(value.get('name')||'').trim(),role:String(value.get('role')||'').trim(),intro:String(value.get('intro')||'').trim(),is_published:form.elements.is_published.checked};
    if(editingId)member.id=editingId;
    if(imageClear)member.image_url='';else if(url)member.image_url=url;else if(!editingId)member.image_url='';
    const payload={member};if(selectedPhoto)payload.photo=selectedPhoto;
    busy(form,true);status('guild-member-status','写真と紹介を保存しています…');
    try{await mutate('save_member',payload);await loadAdmin();$('guild-member-editor').hidden=true;resetLocalPhoto();status('guild-list-status','メンバー紹介を保存しました。');}
    catch(error){status('guild-member-status','保存できませんでした：'+error.message,true);}
    finally{busy(form,false);}
  });
  const drop=$('guild-photo-drop'),input=$('guild-photo-file');
  input.addEventListener('change',()=>{const file=input.files?.[0];if(file)selectPhoto(file);});
  drop.addEventListener('paste',event=>{const item=Array.from(event.clipboardData?.items||[]).find(x=>x.type.startsWith('image/'));const file=item?.getAsFile();if(file){event.preventDefault();selectPhoto(file);}});
  drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('is-over'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('is-over');const file=Array.from(event.dataTransfer?.files||[]).find(x=>x.type.startsWith('image/'));if(file)selectPhoto(file);});
  $('guild-photo-clear').addEventListener('click',()=>{photoReadRun++;selectedPhoto=null;imageClear=true;clearPreview();input.value='';$('guild-member-form').elements.image_url.value='';$('guild-photo-preview').hidden=true;$('guild-photo-preview').removeAttribute('src');$('guild-photo-note').textContent='写真を外して保存します。';$('guild-member-save').disabled=false;status('guild-member-status','「メンバーを保存」で写真の解除を反映します。');});
  $('guild-member-form').elements.image_url.addEventListener('change',event=>{const url=safeImageUrl(event.target.value);if(url && !selectedPhoto){$('guild-photo-preview').src=url;$('guild-photo-preview').hidden=false;imageClear=false;}});
  $('guild-delete-cancel').addEventListener('click',()=>$('guild-delete-dialog').close());
  $('guild-delete-confirm').addEventListener('click',async()=>{const button=$('guild-delete-confirm');button.disabled=true;try{await mutate('delete_member',{id:pendingDelete});$('guild-delete-dialog').close();if(editingId===pendingDelete){$('guild-member-editor').hidden=true;resetLocalPhoto();}await loadAdmin();status('guild-list-status','メンバー紹介を削除しました。');}catch(e){status('guild-delete-status',e.message,true);}finally{button.disabled=false;}});
  db.auth.onAuthStateChange((event,nextSession)=>{session=nextSession;if(event!=='TOKEN_REFRESHED')setTimeout(sessionChanged,0);});
  sessionChanged();
})();
