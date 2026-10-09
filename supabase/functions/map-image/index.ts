import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PUBLIC_KEY="sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_";
const ALLOWED_KEYS=new Set([PUBLIC_KEY,Deno.env.get("SUPABASE_ANON_KEY")||""].filter(Boolean));
const ALLOWED_ORIGINS=new Set(["https://yysupporttools.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const MAX_IMAGE=2097152;

function headers(origin:string|null){
  return {"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:"https://yysupporttools.github.io",
    "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-xen-client","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
}
function response(data:unknown,status:number,origin:string|null){return new Response(JSON.stringify(data),{status,headers:headers(origin)});}
async function bounded(stream:ReadableStream<Uint8Array>|null,limit:number){
  if(!stream)throw Error("empty-body");
  const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const result=await reader.read();if(result.done)break;total+=result.value.length;if(total>limit){await reader.cancel();throw Error("body-too-large");}chunks.push(result.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function hash(bytes:Uint8Array){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}
const textBytes=(value:string)=>new TextEncoder().encode(value);
function tag(bytes:Uint8Array,offset:number){return String.fromCharCode(...bytes.slice(offset,offset+4));}
function webpDimensions(bytes:Uint8Array){
  if(bytes.length<26||tag(bytes,0)!=="RIFF"||tag(bytes,8)!=="WEBP")throw Error("invalid-webp");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(4,true)+8!==bytes.length)throw Error("invalid-riff-size");
  let frame:{width:number,height:number}|null=null,extended:{width:number,height:number}|null=null;
  for(let offset=12;offset<bytes.length;){
    if(offset+8>bytes.length)throw Error("invalid-chunk");
    const name=tag(bytes,offset),size=view.getUint32(offset+4,true),start=offset+8,end=start+size;
    if(end+(size%2)>bytes.length)throw Error("invalid-chunk");
    if(name==="ANIM"||name==="ANMF")throw Error("animated-webp");
    if(name==="VP8X"){
      if(extended||size!==10||(bytes[start]&2))throw Error("invalid-vp8x");
      const width=1+bytes[start+4]+(bytes[start+5]<<8)+(bytes[start+6]<<16);
      const height=1+bytes[start+7]+(bytes[start+8]<<8)+(bytes[start+9]<<16);
      extended={width,height};
    }else if(name==="VP8 "){
      if(frame||size<10||(bytes[start]&1)||bytes[start+3]!==0x9d||bytes[start+4]!==1||bytes[start+5]!==0x2a)throw Error("invalid-vp8");
      frame={width:view.getUint16(start+6,true)&0x3fff,height:view.getUint16(start+8,true)&0x3fff};
    }else if(name==="VP8L"){
      if(frame||size<5||bytes[start]!==0x2f)throw Error("invalid-vp8l");
      const bits=view.getUint32(start+1,true);
      if(bits>>>29)throw Error("invalid-vp8l-version");
      frame={width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};
    }
    offset=end+(size%2);
  }
  if(!frame||(extended&&(extended.width!==frame.width||extended.height!==frame.height)))throw Error("invalid-frame");
  if(frame.width<100||frame.height<100||frame.width>4096||frame.height>4096)throw Error("invalid-dimensions");
  return frame;
}
function imageUrl(value:unknown,mapId:string){
  if(typeof value!=="string")return "";
  const expected=SUPABASE_URL+"/storage/v1/object/public/map-images/manual-updates/"+mapId+"/";
  if(!value.startsWith(expected)||!UUID.test(value.slice(expected.length).replace(/\.webp$/,""))||!value.endsWith(".webp"))return "";
  try{const parsed=new URL(value);if(parsed.search||parsed.hash||parsed.username||parsed.password||parsed.origin!==new URL(SUPABASE_URL).origin)return "";}catch(_){return "";}
  return value;
}
function input(value:any){
  if(!value||typeof value!=="object"||Array.isArray(value)||value.action!=="replace_image"||!UUID.test(String(value.map_id||""))||!UUID.test(String(value.visitor_id||"")))return null;
  const mapId=String(value.map_id).toLowerCase(),url=imageUrl(value.image_url,mapId);
  if(!url||typeof value.expected_image_url!=="string"||!value.expected_image_url||value.expected_image_url.length>2000||
    !(value.expected_image_hash===null||typeof value.expected_image_hash==="string"&&HASH.test(value.expected_image_hash))||
    !Number.isSafeInteger(value.expected_revision)||value.expected_revision<0||!HASH.test(String(value.image_hash||""))||
    !Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<100||value.height<100||value.width>4096||value.height>4096)return null;
  return {mapId,url,expectedUrl:value.expected_image_url,expectedHash:value.expected_image_hash,revision:value.expected_revision,
    hash:value.image_hash,width:value.width,height:value.height,visitor:String(value.visitor_id).toLowerCase()};
}
async function handle(req:Request){
  const origin=req.headers.get("origin");
  if(!origin||!ALLOWED_ORIGINS.has(origin))return response({error:"このサイトから画像を更新してください。"},403,origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST")return response({error:"POST only"},405,origin);
  if(!ALLOWED_KEYS.has(req.headers.get("apikey")||"")||req.headers.get("x-xen-client")!=="map-nav-v1")return response({error:"サイトの接続設定を確認してください。"},403,origin);
  if(!SUPABASE_URL||!SERVICE_ROLE)return response({error:"画像更新の接続設定がありません。"},503,origin);
  let parsed;
  try{
    const body=await bounded(req.body,8192);
    parsed=input(JSON.parse(new TextDecoder().decode(body)));
  }catch(_){return response({error:"画像更新の入力を確認してください。"},400,origin);}
  if(!parsed)return response({error:"画像更新の入力を確認してください。"},400,origin);
  try{
    const asset=await fetch(parsed.url,{redirect:"error"});
    if(!asset.ok)return response({error:"アップロードした画像を取得できませんでした。"},400,origin);
    const size=Number(asset.headers.get("content-length")||0);
    if(size>MAX_IMAGE)return response({error:"画像は2MB以内で保存してください。"},413,origin);
    let bytes,dimensions;
    try{bytes=await bounded(asset.body,MAX_IMAGE);dimensions=webpDimensions(bytes);}
    catch(_){return response({error:"拡大マップのWebP画像を確認してください。"},400,origin);}
    if(dimensions.width!==parsed.width||dimensions.height!==parsed.height||await hash(bytes)!==parsed.hash)return response({error:"画像のサイズまたは保存情報が一致しません。"},400,origin);
    const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
    const visitorHash=await hash(textBytes("map-image-v1|visitor|"+SERVICE_ROLE+"|"+parsed.visitor));
    const ipHash=await hash(textBytes("map-image-v1|ip|"+SERVICE_ROLE+"|"+ip));
    const result=await fetch(SUPABASE_URL+"/rest/v1/rpc/map_image_replace",{
      method:"POST",headers:{apikey:SERVICE_ROLE,Authorization:"Bearer "+SERVICE_ROLE,"Content-Type":"application/json"},
      body:JSON.stringify({p_map_id:parsed.mapId,p_expected_image_url:parsed.expectedUrl,p_expected_image_hash:parsed.expectedHash,p_expected_revision:parsed.revision,
        p_image_url:parsed.url,p_image_hash:parsed.hash,p_width:parsed.width,p_height:parsed.height,p_visitor_hash:visitorHash,p_ip_hash:ipHash})
    });
    if(!result.ok)return response({error:"画像を更新できませんでした。再読み込みしてご確認ください。"},502,origin);
    const saved=await result.json();
    if(saved?.saved!==true){
      const status=[400,404,409,429].includes(Number(saved?.status))?Number(saved.status):502;
      const error=saved?.reason==="conflict"?"ほかの画面でマップ画像が更新されました。再読み込みしてご確認ください。":
        saved?.reason==="rate_limit"?"画像の更新が続いています。時間をおいて再度お試しください。":
        saved?.reason==="map_missing"?"指定されたマップが見つかりません。":"画像を更新できませんでした。再読み込みしてご確認ください。";
      return response({error,reason:saved?.reason||"save_failed"},status,origin);
    }
    return response({saved:true,map_id:saved.map_id,image_url:saved.image_url,source_image_hash:saved.source_image_hash,image_source:saved.image_source,
      image_revision:saved.image_revision,image_width:saved.image_width,image_height:saved.image_height,updated_at:saved.updated_at},200,origin);
  }catch(_){
    console.error("Map image update failed");
    return response({error:"画像更新中にエラーが発生しました。再読み込みしてご確認ください。"},500,origin);
  }
}
Deno.serve(handle);
