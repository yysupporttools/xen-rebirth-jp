// Public feedback accepts the site's publishable key. Moderation additionally
// validates a live Auth user and reuses the existing board administrator check.
const project = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publishable = 'sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_';
const allowedOrigin = 'https://yysupporttools.github.io';
const cors = {'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'};
const serviceHeaders = {apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
const categories = ['error','outdated','link','other','drop','def','level','map','image','note'];
const reply = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const string = (value:unknown,max:number,required=false) => {if(typeof value!=='string' && value!=null)throw Error('文字列の入力を確認してください'); const v=String(value??'').trim();if(v.length>max||(required&&!v))throw Error('文字数を確認してください');return v;};
const secureUrl = (value:unknown) => {const v=string(value,1000);if(!v)return '';const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw Error('URLは https:// で入力してください');return u.href;};
const articleUrl = (value:unknown) => {const u=new URL(string(value,1000,true),`${allowedOrigin}/xen-rebirth-jp/`);if(u.origin!==allowedOrigin||!/^\/xen-rebirth-jp\/[a-z0-9-]+\.html$/.test(u.pathname))throw Error('サイトの記事URLを指定してください');u.search='';return u.href;};
function details(value:unknown){const d=(value&&typeof value==='object'&&!Array.isArray(value)?value:{}) as Record<string,unknown>;const result:Record<string,unknown>={};for(const [key,max]of [['level',300],['min_def',10000],['max_def',10000]] as const){const n=d[key];if(n===''||n==null)result[key]=null;else{const v=Number(n);if(!Number.isInteger(v)||v<0||v>max)throw Error('Lv / DEF の数値を確認してください');result[key]=v;}}if(result.min_def!=null&&result.max_def!=null&&Number(result.min_def)>Number(result.max_def))throw Error('DEF の最小値と最大値を確認してください');result.drop_items=string(d.drop_items,1200);result.map=string(d.map,200);result.image_url=secureUrl(d.image_url);result.notes=string(d.notes,1000);return result;}
async function rpc(name:string,args:unknown){const r=await fetch(`${project}/rest/v1/rpc/${name}`,{method:'POST',headers:serviceHeaders,body:JSON.stringify(args)});const data=await r.json();if(!r.ok)throw Error(data.message||'保存に失敗しました');return data;}
async function hash(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function admin(req:Request){const bearer=req.headers.get('Authorization')||'';if(!/^Bearer [\w.-]+$/.test(bearer))throw Error('管理者ログインが必要です');const headers={apikey:publishable,Authorization:bearer};const r=await fetch(`${project}/auth/v1/user`,{headers});if(!r.ok)throw Error('ログインを確認できません。再度ログインしてください');const user=await r.json();const check=await fetch(`${project}/rest/v1/rpc/board_is_admin`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});if(!check.ok||await check.json()!==true)throw Error('このアカウントには管理者権限がありません');return user.id as string;}
async function attachment(value:unknown){if(!value)return '';const a=value as {data?:string,type?:string};if(!['image/png','image/jpeg','image/webp'].includes(a.type||'')||typeof a.data!=='string'||a.data.length>2800000)throw Error('画像は PNG / JPEG / WebP、2MB以内で選んでください');let binary:string;try{binary=atob(a.data);}catch{throw Error('画像データを読み込めません');}if(binary.length>2097152||binary.length<12)throw Error('画像サイズを確認してください');const b=Uint8Array.from(binary,c=>c.charCodeAt(0));const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;const jpg=b[0]===255&&b[1]===216&&b[2]===255;const webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';if((a.type==='image/png'&&!png)||(a.type==='image/jpeg'&&!jpg)||(a.type==='image/webp'&&!webp))throw Error('画像形式を確認してください');const ext=a.type==='image/png'?'png':a.type==='image/jpeg'?'jpg':'webp';const path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;const r=await fetch(`${project}/storage/v1/object/article-feedback/${path}`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':a.type!},body:b});if(!r.ok)throw Error('画像を保存できませんでした');return path;}
async function sign(path:string){if(!path)return '';const r=await fetch(`${project}/storage/v1/object/sign/article-feedback/${path}`,{method:'POST',headers:serviceHeaders,body:JSON.stringify({expiresIn:600})});if(!r.ok)return '';const data=await r.json();return data.signedURL?`${project}/storage/v1${data.signedURL}`:'';}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');if(origin&&origin!==allowedOrigin)return reply({error:'このサイトからご利用ください'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.headers.get('apikey')!==publishable)return reply({error:'接続キーを確認してください'},401);
 try{
  const u=new URL(req.url);
  if(req.method==='GET'){
   if(u.searchParams.get('action')!=='admin')return reply({ok:true});
   await admin(req);const status=u.searchParams.get('status');if(status&&!['pending','published','resolved','rejected'].includes(status))throw Error('状態が無効です');
   const rows=await rpc('site_feedback_list',{p_status:status}) as Record<string,unknown>[];
   await Promise.all(rows.map(async row=>{if(row.attachment_path)row.attachment_url=await sign(String(row.attachment_path));delete row.reviewed_by;delete row.attachment_path;}));return reply({rows});
  }
  if(req.method!=='POST')return reply({error:'操作が無効です'},405);
  if(Number(req.headers.get('Content-Length')||0)>2900000)throw Error('画像が大きすぎます');const raw=await req.text();if(raw.length>2900000)throw Error('画像が大きすぎます');const data=JSON.parse(raw);
  if(data.action==='review'){
   const actor=await admin(req);if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))throw Error('IDが無効です');
   await rpc('site_feedback_review',{p_id:data.id,p_status:string(data.status,20,true),p_note:string(data.note,500),p_actor:actor,p_body:string(data.body,3000,true),p_details:details(data.details)});return reply({ok:true});
  }
  if(data.action!=='submit'||data.honeypot)throw Error('入力が無効です');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.visitor||''))throw Error('ブラウザ識別子が無効です');
  if(!['article','monster'].includes(data.kind))throw Error('報告の種類が無効です');const mid=string(data.monster_id,160);if(data.kind==='monster'&&!/^[a-z0-9_-]{1,160}$/.test(mid))throw Error('モンスターが無効です');
  const category=string(data.category,20,true);if(!categories.includes(category)||(data.kind==='article'&&!['error','outdated','link','other'].includes(category))||(data.kind==='monster'&&!['drop','def','level','map','image','note'].includes(category)))throw Error('分類を確認してください');
  const input={kind:data.kind,article_url:articleUrl(data.article_url),title:string(data.title,200,true),monster_id:data.kind==='monster'?mid:null,category,body:string(data.body,3000,true),details:details(data.details),source_url:secureUrl(data.source_url),author_name:string(data.author_name,40)||'匿名',attachment_path:''};
  if(category==='def'&&(input.details.min_def==null&&input.details.max_def==null||!input.details.notes))throw Error('必要DEFの数値と、通常 / Hard・単体 / AoE・目標被ダメージなどの確認条件を記載してください');
  const visitorHash=await hash(`visitor:${data.visitor}`);const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||req.headers.get('cf-connecting-ip')||`unknown:${data.visitor}`;const ipHash=await hash(`ip:${new Date().toISOString().slice(0,10)}:${service}:${ip}`);
  // Rate check and insert run atomically; attachments are uploaded only after a
  // valid receipt, so random callers cannot bypass submission limits via files.
  const id=await rpc('site_feedback_submit',{p_input:input,p_visitor_hash:visitorHash,p_ip_hash:ipHash}) as string;
  if(data.attachment){try{const path=await attachment(data.attachment);await rpc('site_feedback_attach',{p_id:id,p_path:path});}catch{return reply({ok:true,id,warning:'報告を保存しました。添付画像は保存できなかったため、必要なら別の報告で再送してください。'});}}
  return reply({ok:true,id});
 }catch(e){const message=e instanceof Error?e.message:'操作に失敗しました';return reply({error:message},message.includes('管理者')||message.includes('ログイン')||message.includes('権限')?403:400);}
});
