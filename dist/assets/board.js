"use strict";
(() => {
 const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cfg=window.XEN_GLOSSARY_CONFIG, db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{storageKey:'xen-board-admin',detectSessionInUrl:true}});
 const keygen=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const memory={};
 const get=k=>{try{return localStorage.getItem(k)||memory[k]}catch{return memory[k]}};
 const put=(k,v)=>{memory[k]=v;try{localStorage.setItem(k,v);return true}catch{return false}};
 const visitor=get('xen-board-visitor')||keygen();put('xen-board-visitor',visitor);
 const keyFor=id=>get('xen-board-owner-'+id)||'';
 let admin=false, current=null, owner=false, page=0, action=null, generation=0;
 const date=s=>new Date(s).toLocaleString('ja-JP');
 const labels={open:'回答受付中',resolved:'解決済み',closed:'受付終了'};
 const tag=s=>`<span class="board-tag ${s==='open'?'':'closed'}">${labels[s]||'受付終了'}</span>`;
 async function rpc(name,args={}){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
 function fail(err){$('board-status').textContent='読み込みできませんでした。更新してお試しください。';console.error(err)}
 function show(id){const d=$(id);d.querySelector('.form-status')?.replaceChildren();d.showModal()}
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
 async function submit(form,job){const b=form.querySelector('[type=submit]'),s=form.querySelector('.form-status');b.disabled=true;s.textContent='処理中…';try{await job();s.textContent=''}catch(e){s.textContent=e.message||'処理できませんでした。再度お試しください。'}finally{b.disabled=false}}
 async function load(){const gen=++generation;const id=location.hash.slice(1);$('board-status').textContent='読み込み中…';try{
   if(id){await detail(id,gen);return}
   current=null;$('board-list-view').hidden=false;$('board-detail').hidden=true;
   let q=db.from('board_threads').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id').range(page*20,page*20+19);
   const f=$('board-filter').value;if(f)q=q.eq('status',f);
   const words=$('board-search').value.trim();if(words){const safe=words.replace(/[,%()*\\]/g,' ');q=q.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`)}
   const {data,error,count}=await q;if(error)throw error;if(gen!==generation)return;
   $('board-list').innerHTML=data.length?data.map(t=>`<article class="paper board-thread">${tag(t.status)}<h2><a href="#${esc(t.id)}">${esc(t.title)}</a></h2><p>${esc(t.body.slice(0,150))}${t.body.length>150?'…':''}</p><p class="board-meta">${esc(t.author_name)} · ${date(t.created_at)}</p></article>`).join(''):'<div class="paper board-empty">該当する質問はありません。新しい質問を投稿できます。</div>';
   $('board-prev').disabled=page===0;$('board-next').disabled=(page+1)*20>=count;$('board-page-number').textContent=`${page+1}ページ / ${count}件`;$('board-status').textContent='';
 }catch(e){fail(e)}}
 async function detail(id,gen){$('board-list-view').hidden=true;$('board-detail').hidden=false;$('board-detail').innerHTML='<p>質問を読み込み中…</p>';
   const {data:t,error}=await db.from('board_threads').select('*').eq('id',id).maybeSingle();if(error)throw error;if(gen!==generation)return;
   if(!t){$('board-detail').innerHTML='<p>質問が見つからないか、管理者により削除されました。</p><a href="board.html">一覧へ戻る</a>';$('board-status').textContent='';return}
   const {data:answers,error:ae}=await db.from('board_answers').select('*').eq('thread_id',id).order('created_at');if(ae)throw ae;
   const own=keyFor(id)?await rpc('board_check_owner',{p_thread_id:id,p_owner_key:keyFor(id)}):false;if(gen!==generation)return;current=t;owner=own;
   $('board-detail').innerHTML=`<a href="board.html">← 質問一覧へ</a><article class="paper">${tag(t.status)}<h1>${esc(t.title)}</h1><p class="board-meta">質問者：${esc(t.author_name)} · ${date(t.created_at)}</p><p class="board-body">${esc(t.body)}</p>${t.close_reason?`<p class="board-notice">${esc(t.close_reason)}</p>`:''}<div class="board-actions">${owner?'<button id="show-key">管理キーを確認</button>':'<button id="restore-key">質問者として操作</button>'}${owner&&t.status==='open'?'<button id="owner-close">回答受付を終了する</button>':''}</div>${admin?'<div class="board-actions"><strong>管理者操作</strong><button id="mod-close">受付終了にする</button><button id="mod-delete" class="danger">スレッドを削除</button></div>':''}</article><h2>回答（${answers.length}件）</h2>${answers.map(a=>`<article id="answer-${a.id}" class="paper board-answer ${a.id===t.best_answer_id?'best':''}">${a.id===t.best_answer_id?'<p class="board-tag">★ ベストアンサー</p>':''}<p class="board-meta">${esc(a.author_name)} · ${date(a.created_at)}</p><p class="board-body">${esc(a.body)}</p>${owner&&t.status==='open'?`<button data-best="${a.id}" class="primary">ベストアンサーに選んで解決</button>`:''}</article>`).join('')||'<p>まだ回答がありません。</p>'}${t.status==='open'?'<section class="paper"><h2>回答する</h2><form id="answer-form"><label>表示名（任意）<input name="name" maxlength="40" placeholder="匿名"></label><label>回答<textarea name="body" maxlength="6000" required></textarea></label><p class="form-status" role="status"></p><button type="submit" class="primary">回答を投稿する</button></form></section>':'<p class="board-notice">このスレッドの回答受付は終了しています。</p>'}`;
   $('board-status').textContent='';
   $('restore-key')?.addEventListener('click',()=>show('restore-dialog'));
   $('show-key')?.addEventListener('click',()=>showKey(keyFor(id),true));
   $('owner-close')?.addEventListener('click',()=>confirmAction('owner',null));
   $('mod-close')?.addEventListener('click',()=>confirmAction('closed',null));
   $('mod-delete')?.addEventListener('click',()=>confirmAction('deleted',null));
   document.querySelectorAll('[data-best]').forEach(b=>b.addEventListener('click',()=>confirmAction('best',b.dataset.best)));
   $('answer-form')?.addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const f=new FormData(e.target);await rpc('board_add_answer',{p_thread_id:id,p_name:f.get('name'),p_body:f.get('body'),p_visitor_key:visitor});await load()})});
 }
 function showKey(key,saved){$('owner-key-value').textContent=key;$('key-storage-note').textContent=saved?'このブラウザにも保存しました。ブラウザのデータを消す場合や別端末で操作する場合は、このキーが必要です。':'ブラウザへ保存できませんでした。必ずこのキーを控えてください。';show('key-dialog')}
 function confirmAction(kind,answer){action={kind,answer,id:current.id};$('action-title').textContent=kind==='best'?'ベストアンサーを選んで解決':kind==='deleted'?'スレッドを削除':'回答受付を終了';$('action-description').textContent=kind==='deleted'?'質問と回答が公開一覧から非表示になります。管理用の記録は保存されます。':'確定すると、このスレッドに新しい回答を投稿できなくなります。';$('reason-label').hidden=!['closed','deleted'].includes(kind);$('action-form').reset();show('action-dialog')}
 $('question-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const f=new FormData(e.target),key=keygen();const id=await rpc('board_create_thread',{p_title:f.get('title'),p_body:f.get('body'),p_name:f.get('name'),p_owner_key:key,p_visitor_key:visitor});const saved=put('xen-board-owner-'+id,key);$('question-dialog').close();e.target.reset();location.hash=id;showKey(key,saved)})});
 $('restore-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const key=new FormData(e.target).get('key').trim();if(!await rpc('board_check_owner',{p_thread_id:current.id,p_owner_key:key}))throw Error('管理キーが一致しません');put('xen-board-owner-'+current.id,key);$('restore-dialog').close();await load()})});
 $('action-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{if(['best','owner'].includes(action.kind))await rpc('board_close_thread',{p_thread_id:action.id,p_owner_key:keyFor(action.id),p_answer_id:action.answer});else await rpc('board_moderate',{p_thread_id:action.id,p_action:action.kind,p_reason:new FormData(e.target).get('reason')});$('action-dialog').close();if(action.kind==='deleted')location.hash='';else await load()})});
 $('board-new').addEventListener('click',()=>show('question-dialog'));$('board-reload').addEventListener('click',load);
 $('board-prev').addEventListener('click',()=>{page--;load()});$('board-next').addEventListener('click',()=>{page++;load()});$('board-filter').addEventListener('change',()=>{page=0;load()});
 let timer;$('board-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=0;load()},300)});window.addEventListener('hashchange',load);
 $('admin-login').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const {error}=await db.auth.signInWithOtp({email:$('admin-email').value.trim(),options:{emailRedirectTo:new URL('board.html',location.href).href}});if(error)throw error;$('admin-status').textContent='ログインメールを送信しました。メールのリンクを開いてください。'}catch(e){$('admin-status').textContent='送信できませんでした：'+e.message}finally{b.disabled=false}});
 $('admin-logout').addEventListener('click',async()=>{await db.auth.signOut();await sessionChanged()});
 async function sessionChanged(){try{admin=await rpc('board_is_admin');const {data}=await db.auth.getSession();$('admin-login').hidden=!!data.session;$('admin-logout').hidden=!data.session;$('admin-status').textContent=admin?'管理者としてログイン中':data.session?'このアカウントには管理者権限がありません。':'';await load()}catch(e){fail(e)}}
 db.auth.onAuthStateChange(()=>setTimeout(sessionChanged,0));sessionChanged();
})();
