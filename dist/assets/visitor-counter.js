(() => {
 "use strict";
 if (location.hostname !== "yysupporttools.github.io" || !location.pathname.startsWith("/xen-rebirth-jp/")) return;
 function init() {
  if(document.getElementById("site-visitor-counter")) return;
  const counter=document.createElement("div");
  counter.id="site-visitor-counter";
  counter.className="visitor-counter";
  counter.setAttribute("role","region");
  counter.setAttribute("aria-label","サイト訪問者数");
  counter.innerHTML='<div class="visitor-counter-title">サイト訪問者数</div><div class="visitor-counter-values" aria-live="polite">読み込み中…</div><details><summary>数え方について</summary><p>同じブラウザーは累計で1回、今日の人数では日本時間で1日1回数えます。全ページ共通です。ブラウザー内にランダムな識別子を保存します。別端末・別ブラウザーや保存データの削除後は別の訪問者として数えられます。過去の訪問は含みません。</p><p class="visitor-counter-start"></p></details>';
  const footer=document.querySelector("footer");
  (footer||document.body).appendChild(counter);
  const style=document.createElement("style");
  style.textContent='.visitor-counter{box-sizing:border-box;max-width:520px;margin:24px auto 12px;padding:16px 20px;border:1px solid #b69b63;border-radius:10px;background:#f6eedc;color:#263a3b;text-align:center;font-size:14px;line-height:1.65}.visitor-counter-title{font-weight:700;letter-spacing:.08em}.visitor-counter-values{display:flex;justify-content:center;gap:28px;flex-wrap:wrap;margin:8px 0;font-size:15px}.visitor-counter-values strong{font-size:23px;color:#234e50;font-variant-numeric:tabular-nums}.visitor-counter details{font-size:12px;color:#4b5b5b}.visitor-counter summary{cursor:pointer}.visitor-counter details p{text-align:left;margin:8px 0}.visitor-counter-start{text-align:center!important}';
  document.head.appendChild(style);
  let visitor;
  try {
   visitor=localStorage.getItem("xen-site-visitor-v1");
   if(!visitor || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor)){
    visitor=crypto.randomUUID();localStorage.setItem("xen-site-visitor-v1",visitor);
   }
  }catch { visitor=null; }
  const options={method:visitor?"POST":"GET",headers:{"apikey":"sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_"},signal:AbortSignal.timeout(10000),cache:"no-store"};
  if(visitor){options.headers["Content-Type"]="application/json";options.body=JSON.stringify({visitor});}
  fetch("https://dzxxjtmpcfsmvdgkcwvn.supabase.co/functions/v1/site-visitor-counter",options)
   .then(response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{
    if(!Number.isSafeInteger(data.total)||!Number.isSafeInteger(data.today)||data.total<0||data.today<0)throw new Error();
    const values=counter.querySelector(".visitor-counter-values");
    values.replaceChildren();
    for(const [label,n] of [["累計",data.total],["今日",data.today]]){
     const span=document.createElement("span");span.append(label+" ");
     const strong=document.createElement("strong");strong.textContent=n.toLocaleString("ja-JP");
     span.append(strong," 人");values.appendChild(span);
    }
    counter.querySelector(".visitor-counter-start").textContent="集計開始："+data.started+" ／ 今日："+data.day+"（日本時間）";
    if(!visitor)counter.querySelector(".visitor-counter-start").append(" ／ このブラウザーは保存が無効のため集計対象外です。");
   })
   .catch(()=>{counter.querySelector(".visitor-counter-values").textContent="現在、訪問者数を取得できません";});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
