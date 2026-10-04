const allowed = new Set(["https://yysupporttools.github.io"]);
const publicKey = "sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_";
Deno.serve(async (req) => {
 const origin=req.headers.get("origin")||"";
 const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!allowed.has(origin)) return new Response("Forbidden",{status:403});
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers});
 if(req.headers.get("apikey")!==publicKey) return reply({error:"Unauthorized"},401);
 if(!["GET","POST"].includes(req.method)) return reply({error:"Method not allowed"},405);
 try {
  let token=null; let article=null;
  if(req.method==="POST"){
   if(Number(req.headers.get("content-length")||0)>512) return reply({error:"Too large"},413);
   const raw=await req.text();
   if(raw.length>512) return reply({error:"Too large"},413);
   const body=JSON.parse(raw);
   if(typeof body.visitor!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(body.visitor)) return reply({error:"Invalid visitor"},400);
   if(typeof body.article!=="string" || body.article.length>220 || !/^[a-z-]+\.html(?:#[a-zA-Z0-9_-]+)?$/.test(body.article)) return reply({error:"Invalid article"},400);
   article=body.article;
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body.visitor.toLowerCase()));
   token=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  }
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const response=await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/rpc/site_popular_articles",{method:"POST",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({p_url:article,p_token:token})});
  if(!response.ok) return reply({error:"Ranking unavailable"},503);
  return reply(await response.json());
 }catch {return reply({error:"Ranking unavailable"},503);}
});