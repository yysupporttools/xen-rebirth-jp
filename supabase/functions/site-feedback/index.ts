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
function publicPictureUrl(value:unknown){const raw=string(value,1000);if(!raw)return '';let url:URL;try{url=new URL(raw);}catch{throw Error('画像URLを確認してください');}const host=url.hostname.toLowerCase().replace(/\.$/,'');if(url.protocol!=='https:'||url.username||url.password||/[\s\u0000-\u001f]/.test(raw)||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||host.startsWith('[')||/^(?:0|10|127)\./.test(host)||/^169\.254\./.test(host)||/^192\.168\./.test(host)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(host))throw Error('公開された https:// の画像URLを入力してください');url.hash='';return url.href;}
const articleUrl = (value:unknown) => {const u=new URL(string(value,1000,true),`${allowedOrigin}/xen-rebirth-jp/`);if(u.origin!==allowedOrigin||!/^\/xen-rebirth-jp\/[a-z0-9-]+\.html$/.test(u.pathname))throw Error('サイトの記事URLを指定してください');u.search='';return u.href;};
function details(value:unknown){const d=(value&&typeof value==='object'&&!Array.isArray(value)?value:{}) as Record<string,unknown>;const result:Record<string,unknown>={};for(const [key,max]of [['level',300],['min_def',10000],['max_def',10000]] as const){const n=d[key];if(n===''||n==null)result[key]=null;else{const v=Number(n);if(!Number.isInteger(v)||v<0||v>max)throw Error('Lv / DEF の数値を確認してください');result[key]=v;}}if(result.min_def!=null&&result.max_def!=null&&Number(result.min_def)>Number(result.max_def))throw Error('DEF の最小値と最大値を確認してください');result.drop_items=string(d.drop_items,1200);result.map=string(d.map,200);result.image_url=secureUrl(d.image_url);result.notes=string(d.notes,1000);return result;}

const detailFields=['level','min_def','max_def','drop_items','map','notes'] as const;
function detailPatch(value:unknown,allowEmpty=false){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('モンスター情報の入力を確認してください');
 const input=value as Record<string,unknown>,keys=Object.keys(input),result:Record<string,unknown>={};
 if(!allowEmpty&&!keys.length)throw Error('変更する項目を入力してください');
 if(keys.some(key=>!detailFields.includes(key as typeof detailFields[number])))throw Error('編集できない項目が含まれています');
 for(const key of keys){
  const value=input[key];
  if(['level','min_def','max_def'].includes(key)){
   if(value===null){result[key]=null;continue;}
   const max=key==='level'?300:10000;
   if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>max)throw Error('Lv / DEF の数値を確認してください');
   result[key]=value;
  }else{
   if(typeof value!=='string')throw Error('文字列の入力を確認してください');
   result[key]=string(value,key==='drop_items'?1200:key==='map'?200:1000);
  }
 }
 if(result.min_def!=null&&result.max_def!=null&&Number(result.min_def)>Number(result.max_def))throw Error('DEF の最小値と最大値を確認してください');
 return result;
}


function reviewDetailPatch(value:unknown,previous:Record<string,unknown>){
 const incoming=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const allowed=Object.fromEntries(Object.entries(incoming).filter(([key])=>detailFields.includes(key as typeof detailFields[number])));
 const validated=detailPatch(allowed,true),result:Record<string,unknown>={};
 for(const key of detailFields){
  if(Object.prototype.hasOwnProperty.call(previous,key))result[key]=previous[key];
  if(Object.prototype.hasOwnProperty.call(validated,key)&&(Object.prototype.hasOwnProperty.call(previous,key)||validated[key]!==null&&validated[key]!==''))result[key]=validated[key];
 }
 return {...detailPatch(result,true),publication_mode:'immediate_details'};
}

async function rpc(name:string,args:unknown){const r=await fetch(`${project}/rest/v1/rpc/${name}`,{method:'POST',headers:serviceHeaders,body:JSON.stringify(args)});const text=await r.text();let data=null;if(text.trim()){try{data=JSON.parse(text);}catch{throw Error('保存先の応答を読み込めませんでした');}}if(!r.ok)throw Error(data?.message||'保存に失敗しました');return data;}
async function hash(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
const clientIp = (req:Request,visitor:unknown) => req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',').map(x=>x.trim()).filter(Boolean).at(-1)||`unknown:${visitor}`;
async function admin(req:Request){const bearer=req.headers.get('Authorization')||'';if(!/^Bearer [\w.-]+$/.test(bearer))throw Error('管理者ログインが必要です');const headers={apikey:publishable,Authorization:bearer};const r=await fetch(`${project}/auth/v1/user`,{headers});if(!r.ok)throw Error('ログインを確認できません。再度ログインしてください');const user=await r.json();const check=await fetch(`${project}/rest/v1/rpc/board_is_admin`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});if(!check.ok||await check.json()!==true)throw Error('このアカウントには管理者権限がありません');return user.id as string;}
type ImageFile={bytes:Uint8Array;type:string;extension:string};
const privatePath = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\/[a-f0-9-]{36}\.(png|jpg|webp)$/;
const managedPublicPath = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp)$/;
const publicImageUrl = (path:string) => `${project}/storage/v1/object/public/monster-images/${path}`;
const tag = (bytes: Uint8Array, start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
function dimensions(width: number, height: number) {
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16777216) {
    throw new Error('画像は縦横4096px以内で選んでください');
  }
}
function validateImage(bytes: Uint8Array, type: string) {
  if (bytes.length < 20 || bytes.length > 2097152) throw new Error('画像は2MB以内で選んでください');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png') {
    if (bytes.length < 45 || tag(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n' || view.getUint32(8) !== 13 || tag(bytes, 12, 4) !== 'IHDR') {
      throw new Error('PNG画像の形式を確認してください');
    }
    dimensions(view.getUint32(16), view.getUint32(20));
    let pos = 8, imageData = false, end = false;
    while (pos + 12 <= bytes.length) {
      const len = view.getUint32(pos), chunk = tag(bytes, pos + 4, 4);
      if (pos + len + 12 > bytes.length) throw new Error('PNG画像が壊れています');
      if (chunk === 'IDAT' && len > 0) imageData = true;
      pos += len + 12;
      if (chunk === 'IEND') { end = len === 0 && pos === bytes.length; break; }
    }
    if (!imageData || !end) throw new Error('PNG画像が壊れています');
  } else if (type === 'image/jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('JPEG画像の形式を確認してください');
    let pos = 2, frame = false, scan = false;
    const frames = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
    while (pos + 4 < bytes.length) {
      if (bytes[pos++] !== 0xff) throw new Error('JPEG画像が壊れています');
      while (bytes[pos] === 0xff) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda) { scan = true; break; }
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      const len = view.getUint16(pos);
      if (len < 2 || pos + len > bytes.length) throw new Error('JPEG画像が壊れています');
      if (frames.includes(marker)) {
        if (len < 8) throw new Error('JPEG画像が壊れています');
        dimensions(view.getUint16(pos + 5), view.getUint16(pos + 3)); frame = true;
      }
      pos += len;
    }
    if (!frame || !scan) throw new Error('JPEG画像が壊れています');
  } else if (type === 'image/webp') {
    if (tag(bytes, 0, 4) !== 'RIFF' || tag(bytes, 8, 4) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('WebP画像の形式を確認してください');
    let pos = 12, imageData = false;
    while (pos + 8 <= bytes.length) {
      const chunk = tag(bytes, pos, 4), len = view.getUint32(pos + 4, true), start = pos + 8;
      if (len < 1 || start + len > bytes.length) throw new Error('WebP画像が壊れています');
      if (chunk === 'VP8X' && len >= 10) {
        const read24 = (i: number) => bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16;
        dimensions(read24(start + 4) + 1, read24(start + 7) + 1);
      } else if (chunk === 'VP8 ' && len >= 10 && tag(bytes, start + 3, 3) === '\x9d\x01\x2a') {
        dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff); imageData = true;
      } else if (chunk === 'VP8L' && len >= 5 && bytes[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); imageData = true;
      }
      pos = start + len + (len % 2);
    }
    if (!imageData || pos !== bytes.length) throw new Error('WebP画像が壊れています');
  } else throw new Error('画像はPNG / JPEG / WebPで選んでください');
}

function imageFile(value:unknown):ImageFile|null{
 if(!value)return null;const a=value as {data?:string,type?:string};
 if(!['image/png','image/jpeg','image/webp'].includes(a.type||'')||typeof a.data!=='string'||a.data.length>2800000)throw Error('画像は PNG / JPEG / WebP、2MB以内で選んでください');
 let binary:string;try{binary=atob(a.data);}catch{throw Error('画像データを読み込めません');}
 if(binary.length>2097152||binary.length<12)throw Error('画像サイズを確認してください');
 const b=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10;
 const jpg=b[0]===255&&b[1]===216&&b[2]===255;
 const webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 if((a.type==='image/png'&&!png)||(a.type==='image/jpeg'&&!jpg)||(a.type==='image/webp'&&!webp))throw Error('画像形式を確認してください');
 return {bytes:b,type:a.type!,extension:a.type==='image/png'?'png':a.type==='image/jpeg'?'jpg':'webp'};
}
async function uploadImage(bucket:string,path:string,image:ImageFile){
 const r=await fetch(`${project}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':image.type,'Cache-Control':'max-age=60'},body:image.bytes});
 if(!r.ok)throw Error('画像を保存できませんでした');
}
async function savePrivateImage(image:ImageFile){const path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${image.extension}`;await uploadImage('article-feedback',path,image);return path;}
async function removeImages(bucket:string,paths:string[]){if(!paths.length)return;const r=await fetch(`${project}/storage/v1/object/${bucket}`,{method:'DELETE',headers:serviceHeaders,body:JSON.stringify({prefixes:paths})});if(!r.ok)throw Error('画像ファイルを削除できませんでした');}
async function copyApprovedImage(id:string,path:string){
 if(!privatePath.test(path))throw Error('確認用画像パスが無効です');
 const r=await fetch(`${project}/storage/v1/object/authenticated/article-feedback/${path}`,{headers:serviceHeaders});
 if(!r.ok)throw Error('図鑑画像を読み込めませんでした。管理画面を更新して再度お試しください');
 const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>2097152)throw Error('画像が大きすぎます');
 const extension=path.split('.').pop()!,type=extension==='png'?'image/png':extension==='jpg'?'image/jpeg':'image/webp';
 const target=`${id}/${crypto.randomUUID()}.${extension}`;await uploadImage('monster-images',target,{bytes,type,extension});return target;
}
async function cleanupPublicImages(){
 const paths=await rpc('site_feedback_image_cleanup_list',{}) as string[];
 for(const path of paths){if(!managedPublicPath.test(path))throw Error('削除対象の画像パスが無効です');await removeImages('monster-images',[path]);await rpc('site_feedback_image_cleanup_done',{p_path:path});}
}
// A failed response can follow a committed transaction. Retain any picture
// already referenced by a published submission instead of compensating blindly.
async function discardUnpublishedCopy(id:string,path:string){
 let current:Record<string,unknown>|null=null;
 try{current=await rpc('site_feedback_get',{p_id:id});}catch{try{await rpc('site_feedback_image_cleanup_queue',{p_path:path});}catch{/* Do not delete an ambiguously committed publication. */}return null;}
 if(current?.status==='published'&&current.monster_image_public_path===path)return current;
 try{await removeImages('monster-images',[path]);}catch{await rpc('site_feedback_image_cleanup_queue',{p_path:path});}
 return false;
}
let knownMonsterIds:Set<string>|null=null,knownMonsterIdsAt=0;
const knownMonsterNames=new Map<string,string>();
async function requireKnownMonster(id:string){
 if(!knownMonsterIds||Date.now()-knownMonsterIdsAt>300000){
  const response=await fetch('https://yysupporttools.github.io/xen-rebirth-jp/assets/monsters-data.json',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('図鑑のデータを確認できませんでした。時間をおいて再度お試しください');
  const data=await response.json();if(!Array.isArray(data.monsters))throw Error('図鑑のデータを読み込めませんでした');
  const ids=new Set<string>(),names=new Map<string,string>();for(const monster of data.monsters){if(typeof monster.id==='string'&&/^[a-z0-9_-]{1,160}$/.test(monster.id)){ids.add(monster.id);if(typeof monster.name==='string'&&monster.name.trim()&&monster.name.length<=200)names.set(monster.id,monster.name.trim());}}
  if(!ids.size)throw Error('図鑑のデータを読み込めませんでした');knownMonsterIds=ids;knownMonsterIdsAt=Date.now();knownMonsterNames.clear();for(const [mid,name]of names)knownMonsterNames.set(mid,name);
 }
 if(!knownMonsterIds.has(id))throw Error('このモンスターは図鑑に登録されていません。図鑑から追加してください');
}
async function addImage(req:Request,data:Record<string,unknown>){
 if(data.honeypot||data.kind&&data.kind!=='monster')throw Error('入力が無効です');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(data.visitor||'')))throw Error('ブラウザ識別子が無効です');
 const mid=string(data.monster_id,160,true),title=string(data.title,200,true);if(!/^[a-z0-9_-]{1,160}$/.test(mid))throw Error('モンスターが無効です');
 const image=imageFile(data.monster_image),url=image?'':publicPictureUrl(data.image_url);if(!image&&!url)throw Error('画像を貼り付けるか、ファイルまたは画像URLを指定してください');
 if(image)validateImage(image.bytes,image.type);
 await requireKnownMonster(mid);
 // Images have independent quotas; old report counters remain untouched.
 const visitorHash=await hash(`image-visitor:${data.visitor}`),ip=clientIp(req,data.visitor);
 // A stable private IP hash keeps the 10-minute window across midnight.
 // The database resets the separate day count at midnight in Japan.
 const ipHash=await hash(`image-ip:${service}:${ip}`);
 const input={kind:'monster',article_url:articleUrl(data.article_url),title,monster_id:mid,category:'image',body:title+'のゲーム内画像を追加しました。',details:{},source_url:secureUrl(data.source_url),author_name:string(data.author_name,40)||'匿名',attachment_path:''};
 const id=await rpc('site_feedback_submit_image',{p_input:input,p_visitor_hash:visitorHash,p_ip_hash:ipHash}) as string;
 let privateCopy='',publicCopy='',imageUrl=url;
 try{
  if(image){
   privateCopy=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${image.extension}`;await uploadImage('article-feedback',privateCopy,image);
   await rpc('site_feedback_monster_image_attach',{p_id:id,p_path:privateCopy});
   publicCopy=`${id}/${crypto.randomUUID()}.${image.extension}`;await uploadImage('monster-images',publicCopy,image);imageUrl=publicImageUrl(publicCopy);
  }
  await rpc('site_feedback_publish_image',{p_id:id,p_image_url:imageUrl,p_public_image_path:publicCopy});
  return reply({ok:true,id,image_url:imageUrl,publication_mode:'immediate'});
 }catch(error){
  if(publicCopy){const committed=await discardUnpublishedCopy(id,publicCopy);if(committed)return reply({ok:true,id,image_url:(committed.details as Record<string,unknown>).image_url,publication_mode:'immediate'});}
  else{try{const current=await rpc('site_feedback_get',{p_id:id});if(current?.status==='published'&&(current.details as Record<string,unknown>)?.image_url===imageUrl)return reply({ok:true,id,image_url:imageUrl,publication_mode:'immediate'});}catch{/* Keep a possibly committed URL addition. */}}
  let cancelled=false;try{cancelled=await rpc('site_feedback_cancel_image',{p_id:id})===true;}catch{/* Retain private original if its final state is unknown. */}
  if(cancelled&&privateCopy){try{await removeImages('article-feedback',[privateCopy]);}catch{/* Private file is not displayed. */}}
  throw error;
 }
}

async function saveDetails(req:Request,data:Record<string,unknown>){
 if(data.honeypot||data.kind&&data.kind!=='monster')throw Error('入力が無効です');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(data.visitor||'')))throw Error('ブラウザ識別子が無効です');
 const mid=string(data.monster_id,160,true);if(!/^[a-z0-9_-]{1,160}$/.test(mid))throw Error('モンスターが無効です');
 const patch=detailPatch(data.details);
 await requireKnownMonster(mid);
 const title=knownMonsterNames.get(mid)||mid;
 const labels:Record<string,string>={level:'Lv',min_def:'必要DEF（最小）',max_def:'必要DEF（最大）',drop_items:'ドロップアイテム',map:'出現場所',notes:'備考'};
 const body=title+'の'+Object.keys(patch).map(key=>labels[key]).join('・')+'を更新しました。';
 // Detail edits use separate counters. Neither old reports nor image additions
 // consume their allowance, and omitted fields are never added to the patch.
 const visitorHash=await hash(`details-visitor:${data.visitor}`);
 const ipHash=await hash(`details-ip:${service}:${clientIp(req,data.visitor)}`);
 const input={kind:'monster',article_url:articleUrl(`monsters.html#${mid}`),title,monster_id:mid,category:'note',body,details:{...patch,publication_mode:'immediate_details'},source_url:secureUrl(data.source_url),author_name:string(data.author_name,40)||'匿名',attachment_path:''};
 const id=await rpc('site_feedback_save_details',{p_input:input,p_visitor_hash:visitorHash,p_ip_hash:ipHash}) as string;
 return reply({ok:true,id,publication_mode:'immediate_details',details:patch});
}

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
   await Promise.all(rows.map(async row=>{if(row.attachment_path)row.attachment_url=await sign(String(row.attachment_path));row.has_monster_image=Boolean(row.monster_image_path);if(row.monster_image_path)row.monster_image_url=await sign(String(row.monster_image_path));row.monster_image_published=row.status==='published'&&Boolean(row.monster_image_public_path);delete row.reviewed_by;delete row.attachment_path;delete row.monster_image_path;delete row.monster_image_public_path;}));return reply({rows});
  }
  if(req.method!=='POST')return reply({error:'操作が無効です'},405);
  if(Number(req.headers.get('Content-Length')||0)>5700000)throw Error('画像が大きすぎます');const raw=await req.text();if(raw.length>5700000)throw Error('画像が大きすぎます');const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('入力が無効です');
  if(data.action==='review'){
   const actor=await admin(req);if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))throw Error('IDが無効です');
   const row=await rpc('site_feedback_get',{p_id:data.id}) as Record<string,unknown>|null;if(!row)throw Error('報告が見つかりません');
   const nextStatus=string(data.status,20,true),isDetailEdit=(row.details as Record<string,unknown>)?.publication_mode==='immediate_details',nextDetails=isDetailEdit?reviewDetailPatch(data.details,row.details as Record<string,unknown>):details(data.details),oldPath=String(row.monster_image_public_path||'');let newPath='',createdPath='';
   if(oldPath&&nextDetails.image_url===publicImageUrl(oldPath)){nextDetails.image_url='';}
   try{
    if(nextStatus==='published'&&row.kind==='monster'&&row.monster_image_path&&data.use_uploaded_image!==false){
     newPath=row.status==='published'&&managedPublicPath.test(oldPath)?oldPath:await copyApprovedImage(data.id,String(row.monster_image_path));
     if(newPath!==oldPath)createdPath=newPath;
     nextDetails.image_url=publicImageUrl(newPath);nextDetails.image_source='uploaded';
    }
    if(nextStatus==='published'&&row.category==='image'&&!nextDetails.image_url)throw Error('図鑑に掲載する画像または画像URLを選択してください');
    await rpc('site_feedback_review_with_image',{p_id:data.id,p_status:nextStatus,p_note:string(data.note,500),p_actor:actor,p_body:string(data.body,3000,true),p_details:nextDetails,p_public_image_path:newPath,p_expected_status:row.status,p_expected_reviewed_at:row.reviewed_at});
   }catch(error){if(!createdPath||!await discardUnpublishedCopy(data.id,createdPath))throw error;}
   try{await cleanupPublicImages();}catch{return reply({ok:true,warning:'変更は保存しました。公開を解除した画像の削除は次の管理者保存時に再試行します。'});}
   return reply({ok:true});
  }
  if(data.action==='add_image')return await addImage(req,data);
  if(data.action==='save_details')return await saveDetails(req,data);
  if(data.action!=='submit'||data.honeypot)throw Error('入力が無効です');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.visitor||''))throw Error('ブラウザ識別子が無効です');
  if(!['article','monster'].includes(data.kind))throw Error('報告の種類が無効です');const mid=string(data.monster_id,160);if(data.kind==='monster'&&!/^[a-z0-9_-]{1,160}$/.test(mid))throw Error('モンスターが無効です');
  const category=string(data.category,20,true);if(!categories.includes(category)||(data.kind==='article'&&!['error','outdated','link','other'].includes(category))||(data.kind==='monster'&&!['drop','def','level','map','image','note'].includes(category)))throw Error('分類を確認してください');
  const input={kind:data.kind,article_url:articleUrl(data.article_url),title:string(data.title,200,true),monster_id:data.kind==='monster'?mid:null,category,body:string(data.body,3000,true),details:details(data.details),source_url:secureUrl(data.source_url),author_name:string(data.author_name,40)||'匿名',attachment_path:''};
  if(category==='def'&&(input.details.min_def==null&&input.details.max_def==null||!input.details.notes))throw Error('必要DEFの数値と、通常 / Hard・単体 / AoE・目標被ダメージなどの確認条件を記載してください');
  const monsterImage=imageFile(data.monster_image),evidenceImage=imageFile(data.attachment);
  if(monsterImage&&data.kind!=='monster')throw Error('図鑑画像はモンスター情報から投稿してください');
  if(category==='image'&&!monsterImage&&!input.details.image_url)throw Error('画像を貼り付けるか、ファイルまたは画像URLを指定してください');
  const visitorHash=await hash(`visitor:${data.visitor}`);const ip=clientIp(req,data.visitor);const ipHash=await hash(`ip:${new Date().toISOString().slice(0,10)}:${service}:${ip}`);
  // Rate check and insert run atomically; attachments are uploaded only after a
  // valid receipt, so random callers cannot bypass submission limits via files.
  const id=await rpc('site_feedback_submit',{p_input:input,p_visitor_hash:visitorHash,p_ip_hash:ipHash}) as string;
  const warnings:string[]=[];
  if(monsterImage){let path='';try{path=await savePrivateImage(monsterImage);await rpc('site_feedback_monster_image_attach',{p_id:id,p_path:path});}catch{if(path){try{await removeImages('article-feedback',[path]);}catch{/* It remains private and is not displayed. */}}warnings.push('投稿を保存しましたが図鑑画像を保存できませんでした。画像は別の投稿で再送してください。');}}
  if(evidenceImage){let path='';try{path=await savePrivateImage(evidenceImage);await rpc('site_feedback_attach',{p_id:id,p_path:path});}catch{if(path){try{await removeImages('article-feedback',[path]);}catch{/* Evidence remains private. */}}warnings.push('確認用画像を保存できませんでした。必要なら別の報告で再送してください。');}}
  return reply({ok:true,id,...(warnings.length?{warning:warnings.join(' ')}:{})});
 }catch(e){const message=e instanceof Error?e.message:'操作に失敗しました';return reply({error:message},message.includes('管理者')||message.includes('ログイン')||message.includes('権限')?403:400);}
});

