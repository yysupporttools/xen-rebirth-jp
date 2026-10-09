"use strict";
(() => {
  const root=document.querySelector('[data-admin-access]');
  if(!root)return;
  const hub=root.dataset.adminAccess==='hub';
  root.innerHTML='<h2>管理者ログイン</h2><p class="admin-access-help">質問掲示板と同じ管理者アカウントを使います。</p>'+(hub?'<form class="admin-access-login"><label>メールアドレス<input name="email" type="email" autocomplete="email" required></label><button type="submit" class="primary">ログインメールを送る</button></form><form class="admin-access-code" hidden><label>確認コード（メールに記載されている場合）<input name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" required></label><button type="submit">コードでログイン</button></form>':'<p class="admin-access-entry"><a href="admin.html">管理者ログインへ</a></p>')+'<p class="admin-access-status" role="status" aria-live="polite">ログイン状態を確認しています…</p><div class="admin-access-actions"><button type="button" class="admin-access-retry">ログイン状態を確認</button><button type="button" class="admin-access-logout" hidden>ログアウト</button></div>';
  const message=root.querySelector('.admin-access-status'),login=root.querySelector('.admin-access-login'),code=root.querySelector('.admin-access-code'),logout=root.querySelector('.admin-access-logout');
  const listeners=new Set();
  const returnKey='xen-admin-login-return-v1';
  function clearReturnIntent(stamp){try{if(!stamp||localStorage.getItem(returnKey)===stamp)localStorage.removeItem(returnKey);}catch{}}
  function prepareReturnIntent(){const stamp=String(Date.now());try{localStorage.setItem(returnKey,stamp);}catch{}return stamp;}
  const missingLogin=()=>({admin:false,verified:true,session:null,user:null,kind:'anonymous'});
  const invalidLogin=error=>[401,403].includes(Number(error?.status)) || ['AuthSessionMissingError','AuthInvalidJwtError'].includes(error?.name) || ['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(error?.code);
  let epoch=0,codeRequested=false,state=Object.freeze({admin:false,verified:false,session:null,user:null,kind:'checking'});
  function publish(next){
    state=Object.freeze(next);
    const allowed=state.verified&&state.admin;
    if(allowed)clearReturnIntent();
    document.querySelectorAll('[data-admin-protected]').forEach(el=>{if(!allowed)el.hidden=true;else if(!el.hasAttribute('data-admin-manual'))el.hidden=false;});
    document.body.classList.toggle('xen-admin-verified',allowed);
    if(login)login.hidden=!!state.session;if(code)code.hidden=!!state.session||!codeRequested;logout.hidden=!state.session;
    const title=root.querySelector('h2');title.textContent=allowed?'管理者としてログイン中':'管理者ログイン';
    if(!hub){const link=root.querySelector('.admin-access-entry a');link.textContent=allowed?'管理トップへ':'管理者ログインへ';}
    message.textContent=state.kind==='checking'?'ログイン状態を確認しています…':allowed?'管理メニューを利用できます。':state.kind==='forbidden'?'このアカウントには管理者権限がありません。登録済みの管理者アカウントでログインしてください。':state.kind==='error'?'ログイン・管理権限を確認できませんでした。時間をおいて再確認してください。':'このページはサイト管理者専用です。管理者としてログインしてください。';
    for(const listener of listeners)listener(state);
  }
  if(!window.supabase){publish({admin:false,verified:false,session:null,user:null,kind:'error'});message.textContent='ログイン機能を読み込めませんでした。ページを再読み込みしてください。';return;}
  const cfg=window.XEN_GLOSSARY_CONFIG;
  const client=window.supabase.createClient(cfg?.SUPABASE_URL||'https://dzxxjtmpcfsmvdgkcwvn.supabase.co',cfg?.SUPABASE_ANON_KEY||'sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_',{auth:{storageKey:'xen-board-admin',detectSessionInUrl:true}});
  async function checkAccount(run=epoch){
    const initial=await client.auth.getSession();if(initial.error){if(invalidLogin(initial.error))return missingLogin();throw initial.error;}
    const session=initial.data.session;if(!session)return missingLogin();
    if(run===epoch&&state.session?.user?.id!==session.user?.id)publish({admin:false,verified:false,session,user:null,kind:'checking'});
    const actual=await client.auth.getUser(session.access_token);
    if(actual.error){if(invalidLogin(actual.error))return missingLogin();throw actual.error;}
    if(!actual.data.user || actual.data.user.id!==session.user?.id)return missingLogin();
    const result=await client.rpc('board_is_admin');if(result.error){if(invalidLogin(result.error))return {admin:false,verified:true,session,user:actual.data.user,kind:'forbidden'};throw result.error;}
    const latest=await client.auth.getSession();if(latest.error){if(invalidLogin(latest.error))return missingLogin();throw latest.error;}
    if(!latest.data.session)return missingLogin();
    if(latest.data.session.user?.id!==actual.data.user.id){if(run===epoch)publish({admin:false,verified:false,session:latest.data.session,user:null,kind:'checking'});throw Error('Login changed');}
    const admin=result.data===true;
    return {admin,verified:true,session:latest.data.session,user:actual.data.user,kind:admin?'authorized':'forbidden'};
  }
  async function refresh(){
    const run=++epoch;publish({admin:false,verified:false,session:state.session,user:null,kind:'checking'});
    try{const next=await checkAccount(run);if(run===epoch)publish(next);}
    catch{if(run===epoch)publish({admin:false,verified:false,session:state.session,user:null,kind:'error'});}
    return state;
  }
  async function getToken(){
    if(!state.admin || !state.verified)throw Error('管理者としてログインしてください。');
    const run=epoch, userId=state.user.id;
    try{
      const next=await checkAccount(run);if(run!==epoch)throw Error('ログイン状態が変わりました。再確認してください。');
      if(!next.admin || next.user?.id!==userId){epoch++;publish(next);throw Error('管理者としてログインしてください。');}
      return next.session.access_token;
    }catch(error){if(run===epoch){epoch++;publish({admin:false,verified:false,session:state.session,user:null,kind:'error'});}throw error;}
  }
  window.XenAdminAccess={client,get state(){return state;},get epoch(){return epoch;},refresh,getToken,subscribe(listener){listeners.add(listener);listener(state);return()=>listeners.delete(listener);},ready:null};
  function lock(form,value){form.querySelectorAll('input,button').forEach(el=>el.disabled=value);}
  if(login)login.addEventListener('submit',async event=>{
    event.preventDefault();lock(login,true);
    const stamp=prepareReturnIntent();
    try{const callback=new URL('board.html',location.href);callback.hash='xen-admin-return';const {error}=await client.auth.signInWithOtp({email:login.elements.email.value.trim(),options:{shouldCreateUser:false,emailRedirectTo:callback.href}});if(error)throw error;message.textContent='ログインメールを送信しました。メールのリンクを開くと管理者ページへ戻ります。確認コードが届いた場合は、下の欄に入力できます。';codeRequested=true;code.hidden=false;}
    catch{clearReturnIntent(stamp);message.textContent='メールを送信できませんでした。入力したアドレスを確認し、時間をおいてお試しください。';}finally{lock(login,false);}
  });
  if(code)code.addEventListener('submit',async event=>{event.preventDefault();lock(code,true);try{const {error}=await client.auth.verifyOtp({email:login.elements.email.value.trim(),token:code.elements.token.value.trim(),type:'email'});if(error)throw error;await refresh();}catch{message.textContent='確認コードを認証できませんでした。メールのコードをご確認ください。';}finally{lock(code,false);}});
  logout.addEventListener('click',async()=>{
    epoch++;codeRequested=false;clearReturnIntent();publish(missingLogin());logout.disabled=true;
    try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}
    catch{message.textContent='管理画面を閉じましたが、ログアウト処理を完了できませんでした。再確認してください。';}finally{logout.disabled=false;}
  });
  root.querySelector('.admin-access-retry').addEventListener('click',refresh);
  client.auth.onAuthStateChange((event,nextSession)=>{if(event==='SIGNED_OUT'){epoch++;codeRequested=false;publish(missingLogin());}else if(event!=='TOKEN_REFRESHED'){epoch++;publish({admin:false,verified:false,session:nextSession,user:null,kind:'checking'});setTimeout(refresh,0);}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.XenAdminAccess.ready=refresh();
})();
