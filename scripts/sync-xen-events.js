#!/usr/bin/env node
"use strict";

/* Xen Rebirth Event Sync Simulation Ver.9
   DRY RUN / NO SUPABASE WRITES
   Adds date-only fallback for official events without "Your Timezone".
*/
const CALENDAR_URL="https://www.xenrebirth.com/calendar/";
const MAX_EVENTS=Number(process.env.MAX_EVENTS||50);
const SUPABASE_URL="https://dzxxjtmpcfsmvdgkcwvn.supabase.co";
const SUPABASE_PUBLIC_KEY="sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_";
const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const WD="(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const DATE=`${WD},\\s+[A-Z][a-z]{2}\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4}`;
const DATETIME=`${DATE},\\s+\\d{1,2}:\\d{2}\\s+(?:am|pm)`;

function decode(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function clean(s=""){return decode(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|div|tr|h\d|time)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim());}
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);try{const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; XenRebirthJP-CalendarSync/9.0)","accept":"text/html,application/xhtml+xml"}});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);return await r.text();}finally{clearTimeout(t);}}
function canonical(raw){const u=new URL(decode(raw),CALENDAR_URL);u.hash="";return u.href;}
function discover(html){const re=/<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,map=new Map();for(const m of html.matchAll(re)){const id=m[2],title=clean(m[3]);if(title&&!map.has(id))map.set(id,{id,title,url:canonical(m[1])});}return [...map.values()];}
function titleOf(html,fallback){const m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);return m?clean(m[1]):fallback;}
function headerWindow(html,title){const p=clean(html);let i=p.indexOf(title);if(i<0)i=0;return p.slice(i,i+2000).replace(/\s*\n\s*/g," | ").replace(/\s+/g," ").trim();}

function parseOfficialHeader(h){
 const tz=(h.match(/\bYour Timezone\s*\|\s*([A-Za-z_]+\/[A-Za-z_]+)\s*\|\s*Start\b/i)||[])[1]||null;
 let m;
 if(tz){
   m=h.match(new RegExp(`\\bStart\\s*\\|\\s*(${DATETIME})\\s*\\|\\s*End\\s*\\|\\s*(${DATETIME})`,"i"));
   if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:false,method:"timezone-start-end"};
   m=h.match(new RegExp(`\\bStart\\s*\\|\\s*(${DATE})\\s*\\|\\s*End\\s*\\|\\s*(${DATE})`,"i"));
   if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:true,method:"timezone-date-only"};
 }
 // Date-only events such as Gummy challenge omit Your Timezone.
 // Read the event heading range itself, before body text.
 m=h.match(new RegExp(`\\|\\s*(${DATE})\\s*-\\s*(${DATE})\\s*\\|`,"i"));
 if(m)return {timezone:null,startRaw:m[1],endRaw:m[2],allDay:true,method:"header-date-range"};
 // Some pages may use no spaces around the dash.
 m=h.match(new RegExp(`(${DATE})\\s*[-–]\\s*(${DATE})`,"i"));
 if(m)return {timezone:null,startRaw:m[1],endRaw:m[2],allDay:true,method:"header-date-range-fallback"};
 return {timezone:tz,startRaw:null,endRaw:null,allDay:null,method:null,error:"Start/End not detected"};
}
function parseParts(raw,allDay){
 const re=allDay?new RegExp(`^${WD},\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})$`,"i"):new RegExp(`^${WD},\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4}),\\s+(\\d{1,2}):(\\d{2})\\s+(am|pm)$`,"i");
 const m=raw.match(re);if(!m)return null;let hour=0,minute=0;if(!allDay){hour=Number(m[4])%12+(m[6].toLowerCase()==="pm"?12:0);minute=Number(m[5]);}
 const mon=m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase();return {year:+m[3],month:MONTHS[mon],day:+m[2],hour,minute};
}
function offsetAt(ms,tz){const f=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});const o=Object.fromEntries(f.formatToParts(new Date(ms)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second)-ms;}
function zonedToUtc(p,tz){const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);let g=wall;for(let i=0;i<4;i++){const n=wall-offsetAt(g,tz);if(n===g)break;g=n;}return new Date(g);}
function ymd(p){return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;}
function addDays(s,n){const [y,m,d]=s.split("-").map(Number),x=new Date(Date.UTC(y,m-1,d+n));return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;}
function jst(iso){return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));}

function preview(e,h){
 const p=parseOfficialHeader(h),base={official_event_id:`official-${e.id}`,title_en:e.title,official_url:e.url,parse_method:p.method,source_timezone:p.timezone,source_start:p.startRaw,source_end:p.endRaw,all_day:p.allDay};
 if(p.error)return {...base,status:"REVIEW",reason:p.error};
 const a=parseParts(p.startRaw,p.allDay),b=parseParts(p.endRaw,p.allDay);if(!a||!b)return {...base,status:"REVIEW",reason:"Date parse failed"};
 if(p.allDay)return {...base,start_date:ymd(a),end_date_exclusive:addDays(ymd(b),1),jst_display:`${ymd(a)} ～ ${ymd(b)}`,status:"OK"};
 try{const s=zonedToUtc(a,p.timezone).toISOString(),t=zonedToUtc(b,p.timezone).toISOString();return {...base,start_time:s,end_time:t,jst_start:jst(s),jst_end:jst(t),status:"OK"};}catch(err){return {...base,status:"REVIEW",reason:`Timezone conversion failed: ${err.message}`};}
}


async function loadExistingEvents(){
 const url=`${SUPABASE_URL}/rest/v1/xen_events?select=id,official_event_id,title_en,title_ja,start_time,end_time,official_url&order=start_time.asc`;
 const r=await fetch(url,{headers:{
   "apikey":SUPABASE_PUBLIC_KEY,
   "Authorization":`Bearer ${SUPABASE_PUBLIC_KEY}`,
   "Accept":"application/json"
 }});
 if(!r.ok)throw new Error(`Supabase read failed: HTTP ${r.status} ${await r.text()}`);
 return await r.json();
}
function numericOfficialId(value=""){
 const s=String(value||"");
 const u=s.match(/[?&]event\/(\d+)|\/event\/(\d+)|event\/(\d+)-/i);
 if(u)return u[1]||u[2]||u[3];
 const id=s.match(/(?:^|[-_])(\d{3,})(?:$|[-_])/);
 return id?id[1]:null;
}
function normTitle(s=""){return String(s||"").toLowerCase().replace(/['’!]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function dayOf(v){return v?String(v).slice(0,10):null;}
function classify(rec,existing){
 const oid=String(rec.official_event_id||"").replace(/^official-/,"");
 const byNumeric=existing.filter(x=>numericOfficialId(x.official_url)===oid || numericOfficialId(x.official_event_id)===oid);
 if(byNumeric.length)return {kind:"EXISTING_OFFICIAL_ID",matches:byNumeric};

 const nt=normTitle(rec.title_en);
 const candidates=existing.filter(x=>{
   const sameTitle=normTitle(x.title_en)===nt;
   if(!sameTitle)return false;
   const recDay=rec.all_day ? rec.start_date : dayOf(rec.start_time);
   return recDay && dayOf(x.start_time)===recDay;
 });
 if(candidates.length)return {kind:"DUPLICATE_CANDIDATE",matches:candidates};
 return {kind:"NEW",matches:[]};
}

(async()=>{
 console.log("=== Xen Rebirth Event Sync Simulation Ver.9 ===");
 console.log("DRY RUN / NO SUPABASE WRITES / NO DELETES");

 const [calendarHtml,existing]=await Promise.all([get(CALENDAR_URL),loadExistingEvents()]);
 const events=discover(calendarHtml).slice(0,MAX_EVENTS);

 let updateCount=0, insertCount=0, reviewCount=0;
 const plans=[];

 for(let i=0;i<events.length;i++){
   const e=events[i], html=await get(e.url), title=titleOf(html,e.title);
   const rec=preview({...e,title},headerWindow(html,title));
   if(rec.status!=="OK"){
     reviewCount++;
     plans.push({action:"REVIEW",title_en:rec.title_en,reason:rec.reason||"parse error"});
     continue;
   }

   const c=classify(rec,existing);
   if(c.kind==="NEW"){
     insertCount++;
     plans.push({
       action:"INSERT",
       title_en:rec.title_en,
       official_event_id:rec.official_event_id,
       official_url:rec.official_url,
       all_day:rec.all_day,
       start_time:rec.start_time||null,
       end_time:rec.end_time||null,
       start_date:rec.start_date||null,
       end_date_exclusive:rec.end_date_exclusive||null,
       note:"New official event. Japanese fields are not generated in Ver.9."
     });
   } else {
     updateCount++;
     const old=c.matches[0];
     plans.push({
       action:"UPDATE",
       match_type:c.kind,
       title_en:rec.title_en,
       row_id:old.id,
       preserve:{
         title_ja:old.title_ja,
         note:"Japanese title/content fields are preserved; Ver.9 performs no write."
       },
       changes:{
         official_event_id:{from:old.official_event_id,to:rec.official_event_id},
         official_url:{from:old.official_url,to:rec.official_url},
         start_time:{from:old.start_time,to:rec.start_time||null},
         end_time:{from:old.end_time,to:rec.end_time||null}
       },
       all_day:rec.all_day,
       start_date:rec.start_date||null,
       end_date_exclusive:rec.end_date_exclusive||null
     });
   }
   await new Promise(r=>setTimeout(r,250));
 }

 for(let i=0;i<plans.length;i++){
   console.log(`\n===== PLAN ${i+1}/${plans.length} =====`);
   console.log(JSON.stringify(plans[i],null,2));
 }

 console.log("\n=== SUMMARY ===");
 console.log(`Official events:        ${events.length}`);
 console.log(`UPDATE planned:         ${updateCount}`);
 console.log(`INSERT planned:         ${insertCount}`);
 console.log(`REVIEW required:        ${reviewCount}`);
 console.log("DELETE planned:         0");
 console.log("Japanese data:          PRESERVE on existing rows");
 console.log("Supabase writes:        0");
 console.log("IMPORTANT: Simulation only. No database rows were changed.");
})().catch(e=>{console.error(e?.stack||e);process.exit(1);});
