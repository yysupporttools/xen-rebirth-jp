#!/usr/bin/env node
"use strict";

/* Xen Rebirth Event Sync Ver.10
   PRODUCTION WRITE / MANUAL WORKFLOW ONLY / NO DELETES
   Based on the verified Ver.9 parser and duplicate classifier.
*/

const CALENDAR_URL="https://www.xenrebirth.com/calendar/";
const MAX_EVENTS=Number(process.env.MAX_EVENTS||50);
const SUPABASE_URL="https://dzxxjtmpcfsmvdgkcwvn.supabase.co";
const SUPABASE_SECRET=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const OPENAI_API_KEY=process.env.OPENAI_API_KEY||"";
const OPENAI_MODEL=process.env.OPENAI_MODEL||"gpt-5.6-luna";
const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const WD="(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const DATE=`${WD},\\s+[A-Z][a-z]{2}\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4}`;
const DATETIME=`${DATE},\\s+\\d{1,2}:\\d{2}\\s+(?:am|pm)`;

if(!SUPABASE_SECRET) throw new Error("Missing GitHub Secret: SUPABASE_SERVICE_ROLE_KEY");
if(!OPENAI_API_KEY) throw new Error("Missing GitHub Secret: OPENAI_API_KEY");

function decode(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
function clean(s=""){return decode(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|div|tr|h\d|time|blockquote)>/gi,"\n").replace(/<li[^>]*>/gi,"• ").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim());}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);try{const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; XenRebirthJP-CalendarSync/10.0)","accept":"text/html,application/xhtml+xml"}});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);return await r.text();}finally{clearTimeout(t);}}
function canonical(raw){const u=new URL(decode(raw),CALENDAR_URL);u.hash="";return u.href;}
function discover(html){const re=/<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,map=new Map();for(const m of html.matchAll(re)){const id=m[2],title=clean(m[3]);if(title&&!map.has(id))map.set(id,{id,title,url:canonical(m[1])});}return [...map.values()];}
function calendarViewLinks(html){
 const out=[],seen=new Set();
 const re=/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
 for(const m of html.matchAll(re)){
   let url; try{url=canonical(m[2]);}catch{continue;}
   if(!url.startsWith("https://www.xenrebirth.com/calendar/"))continue;
   if(/[?&]event\/|\/event\//i.test(url))continue;
   if(url===CALENDAR_URL||seen.has(url))continue;
   const attrs=(m[1]+" "+m[3]).replace(/\s+/g," ").trim();
   const label=clean(m[4]);
   if(/(?:month|calendar|next|prev|today|view|date|202\d)/i.test(url+" "+attrs+" "+label)){
     seen.add(url);out.push({url,label,attrs:attrs.slice(0,240)});
   }
 }
 return out.slice(0,80);
}
function titleOf(html,fallback){const m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);return m?clean(m[1]):fallback;}
function headerWindow(html,title){const p=clean(html);let i=p.indexOf(title);if(i<0)i=0;return p.slice(i,i+2500).replace(/\s*\n\s*/g," | ").replace(/\s+/g," ").trim();}
function categoryOf(h){const m=h.match(/\bCategory\s*\|\s*([^|]{2,80}?)(?=\s*\|)/i);return m?m[1].trim():null;}
function bodyOf(html,title,category){
  const text=clean(html);
  let i=text.indexOf(title); if(i<0)i=0;
  let s=text.slice(i);
  const anchors=["Server Timezone","Category"];
  let start=-1;
  for(const a of anchors){const k=s.indexOf(a);if(k>=0)start=Math.max(start,k);}
  if(start>=0){s=s.slice(start); const nl=s.indexOf("\n"); if(nl>=0)s=s.slice(nl+1);}
  if(category){const k=s.indexOf(category);if(k>=0&&k<500)s=s.slice(k+category.length);}
  s=s.replace(/^\s*[|:\-–]+\s*/,"").trim();
  const stops=["\nComments","\nComment","\nShare this event","\nUsers Online","\nRecently Browsing","\nCreate an account or sign in"];
  let end=s.length; for(const x of stops){const k=s.indexOf(x);if(k>=0)end=Math.min(end,k);} s=s.slice(0,end).trim();
  // Avoid feeding navigation/header garbage to translation. Keep enough for real event descriptions.
  return s.slice(0,16000);
}

function parseOfficialHeader(h){
 const tz=(h.match(/\bYour Timezone\s*\|\s*([A-Za-z_]+\/[A-Za-z_]+)\s*\|\s*Start\b/i)||[])[1]||null;
 let m;
 if(tz){
   m=h.match(new RegExp(`\\bStart\\s*\\|\\s*(${DATETIME})\\s*\\|\\s*End\\s*\\|\\s*(${DATETIME})`,"i"));
   if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:false,method:"timezone-start-end"};
   m=h.match(new RegExp(`\\bStart\\s*\\|\\s*(${DATE})\\s*\\|\\s*End\\s*\\|\\s*(${DATE})`,"i"));
   if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:true,method:"timezone-date-only"};
 }
 m=h.match(new RegExp(`\\|\\s*(${DATE})\\s*-\\s*(${DATE})\\s*\\|`,"i"));
 if(m)return {timezone:null,startRaw:m[1],endRaw:m[2],allDay:true,method:"header-date-range"};
 m=h.match(new RegExp(`(${DATE})\\s*[-–]\\s*(${DATE})`,"i"));
 if(m)return {timezone:null,startRaw:m[1],endRaw:m[2],allDay:true,method:"header-date-range-fallback"};
 return {timezone:tz,startRaw:null,endRaw:null,allDay:null,method:null,error:"Start/End not detected"};
}
function parseParts(raw,allDay){const re=allDay?new RegExp(`^${WD},\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})$`,"i"):new RegExp(`^${WD},\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4}),\\s+(\\d{1,2}):(\\d{2})\\s+(am|pm)$`,"i");const m=raw.match(re);if(!m)return null;let hour=0,minute=0;if(!allDay){hour=Number(m[4])%12+(m[6].toLowerCase()==="pm"?12:0);minute=Number(m[5]);}const mon=m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase();return {year:+m[3],month:MONTHS[mon],day:+m[2],hour,minute};}
function offsetAt(ms,tz){const f=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});const o=Object.fromEntries(f.formatToParts(new Date(ms)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second)-ms;}
function zonedToUtc(p,tz){const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);let g=wall;for(let i=0;i<4;i++){const n=wall-offsetAt(g,tz);if(n===g)break;g=n;}return new Date(g);}
function ymd(p){return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;}
function addDays(s,n){const [y,m,d]=s.split("-").map(Number),x=new Date(Date.UTC(y,m-1,d+n));return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;}
function normalize(e,h,html){const p=parseOfficialHeader(h),base={official_event_id:`official-${e.id}`,title_en:e.title,official_url:e.url,category:categoryOf(h),description_en:null,all_day:p.allDay};base.description_en=bodyOf(html,e.title,base.category)||null;if(p.error)return {...base,status:"REVIEW",reason:p.error};const a=parseParts(p.startRaw,p.allDay),b=parseParts(p.endRaw,p.allDay);if(!a||!b)return {...base,status:"REVIEW",reason:"Date parse failed"};if(p.allDay){const sd=ymd(a),ed=addDays(ymd(b),1);return {...base,start_time:`${sd}T00:00:00.000Z`,end_time:`${ed}T00:00:00.000Z`,status:"OK"};}try{return {...base,start_time:zonedToUtc(a,p.timezone).toISOString(),end_time:zonedToUtc(b,p.timezone).toISOString(),status:"OK"};}catch(err){return {...base,status:"REVIEW",reason:`Timezone conversion failed: ${err.message}`};}}

const sbHeaders=()=>({"apikey":SUPABASE_SECRET,"Accept":"application/json","Content-Type":"application/json"});
async function sb(path,opts={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{...sbHeaders(),...(opts.headers||{})}});const text=await r.text();if(!r.ok)throw new Error(`Supabase ${opts.method||"GET"} failed HTTP ${r.status}: ${text.slice(0,800)}`);return text?JSON.parse(text):null;}
async function loadExistingEvents(){return await sb("xen_events?select=id,official_event_id,title_en,title_ja,category,start_time,end_time,description_en,description_ja,requirements_ja,rewards_ja,official_url,all_day&order=start_time.asc");}
function numericOfficialId(value=""){const s=String(value||"");const u=s.match(/[?&]event\/(\d+)|\/event\/(\d+)|event\/(\d+)-/i);if(u)return u[1]||u[2]||u[3];const id=s.match(/(?:^|[-_])(\d{3,})(?:$|[-_])/);return id?id[1]:null;}
function normTitle(s=""){return String(s||"").toLowerCase().replace(/['’!]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function dayOf(v){return v?String(v).slice(0,10):null;}
function classify(rec,existing){const oid=String(rec.official_event_id||"").replace(/^official-/,"");const byNumeric=existing.filter(x=>numericOfficialId(x.official_url)===oid||numericOfficialId(x.official_event_id)===oid);if(byNumeric.length===1)return {kind:"EXISTING_OFFICIAL_ID",matches:byNumeric};if(byNumeric.length>1)return {kind:"AMBIGUOUS",matches:byNumeric};const nt=normTitle(rec.title_en);const candidates=existing.filter(x=>normTitle(x.title_en)===nt&&dayOf(rec.start_time)&&dayOf(x.start_time)===dayOf(rec.start_time));if(candidates.length===1)return {kind:"DUPLICATE_CANDIDATE",matches:candidates};if(candidates.length>1)return {kind:"AMBIGUOUS",matches:candidates};return {kind:"NEW",matches:[]};}

function outputText(j){if(typeof j.output_text==="string")return j.output_text;for(const item of (j.output||[]))for(const c of (item.content||[]))if(c.type==="output_text"&&typeof c.text==="string")return c.text;return "";}
async function translate(rec){
 const schema={type:"object",additionalProperties:false,properties:{title_ja:{type:"string"},description_ja:{type:"string"},requirements_ja:{type:"string"},rewards_ja:{type:"string"}},required:["title_ja","description_ja","requirements_ja","rewards_ja"]};
 const input=`Xen Rebirthの公式イベント情報を日本語化してください。

【タイトルの重要ルール】
title_ja は自然な日本語タイトルだけを返してください。
元の英語タイトルを併記しないでください。
「Four Seasons Event（四季イベント）」のような「英語名（日本語名）」形式は禁止です。
例:
Four Seasons Event → 四季イベント
Obstacle Race (Wed) → 障害物レース（水曜日）
Server Challenge → サーバーチャレンジ

ただし、ゲーム内で英語表記のまま使われる固有名詞・NPC名・地名・アイテム名は、無理に日本語へ翻訳せず必要に応じて英語表記を残してください。

【本文】
原文にない条件や報酬は絶対に作らないでください。
requirements_ja は原文に明示された参加条件・ルールだけを抽出してください。
rewards_ja は原文に明示された報酬だけを抽出してください。
該当情報がなければ空文字にしてください。
description_ja は原文内容を忠実に、読みやすい日本語へ翻訳してください。

Title: ${rec.title_en}
Category: ${rec.category||""}
Body:
${rec.description_en||""}`;
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:OPENAI_MODEL,store:false,reasoning:{effort:"none"},input,text:{format:{type:"json_schema",name:"xen_event_translation",strict:true,schema}}})});
 const raw=await r.text();if(!r.ok)throw new Error(`OpenAI translation failed HTTP ${r.status}: ${raw.slice(0,800)}`);const j=JSON.parse(raw),t=outputText(j);if(!t)throw new Error("OpenAI translation returned no output text");return JSON.parse(t);
}
async function updateRow(id,rec){const body={official_event_id:rec.official_event_id,title_en:rec.title_en,category:rec.category,start_time:rec.start_time,end_time:rec.end_time,description_en:rec.description_en,official_url:rec.official_url,all_day:!!rec.all_day,updated_at:new Date().toISOString()};await sb(`xen_events?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(body)});}
async function insertRow(rec,tr){const body={official_event_id:rec.official_event_id,title_en:rec.title_en,title_ja:tr.title_ja||null,category:rec.category,start_time:rec.start_time,end_time:rec.end_time,description_en:rec.description_en,description_ja:tr.description_ja||null,requirements_ja:tr.requirements_ja||null,rewards_ja:tr.rewards_ja||null,official_url:rec.official_url,all_day:!!rec.all_day};await sb("xen_events",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify(body)});}

(async()=>{
 console.log("=== Xen Rebirth Event Sync Ver.10 ===");
 console.log(`Mode: PRODUCTION WRITE / MANUAL / model=${OPENAI_MODEL}`);
 console.log("Safety: NO DELETE operations are implemented.");
 const [calendarHtml,existing]=await Promise.all([get(CALENDAR_URL),loadExistingEvents()]);
 console.log("Calendar navigation candidates:", JSON.stringify(calendarViewLinks(calendarHtml),null,2));
 const events=discover(calendarHtml).slice(0,MAX_EVENTS);
 let updated=0,inserted=0,review=0;
 for(let i=0;i<events.length;i++){
   const e=events[i],html=await get(e.url),title=titleOf(html,e.title),h=headerWindow(html,title),rec=normalize({...e,title},h,html);
   console.log(`\n[${i+1}/${events.length}] ${title}`);
   if(rec.status!=="OK"){review++;console.log(`REVIEW: ${rec.reason}`);continue;}
   const c=classify(rec,existing);
   if(c.kind==="AMBIGUOUS"){review++;console.log(`REVIEW: ambiguous existing match (${c.matches.length})`);continue;}
   if(c.kind==="NEW"){
     console.log(`INSERT: ${rec.official_event_id} / translating new event...`);
     const tr=await translate(rec);
     await insertRow(rec,tr);inserted++;
     existing.push({...rec,id:`new-${rec.official_event_id}`,...tr});
     console.log("INSERT OK");
   }else{
     const old=c.matches[0];
     console.log(`UPDATE: row=${old.id} match=${c.kind} (Japanese fields preserved)`);
     await updateRow(old.id,rec);updated++;
     Object.assign(old,rec);
     console.log("UPDATE OK");
   }
   await sleep(250);
 }
 console.log("\n=== SUMMARY ===");
 console.log(`Official events: ${events.length}`);
 console.log(`UPDATED:         ${updated}`);
 console.log(`INSERTED:        ${inserted}`);
 console.log(`REVIEW skipped:  ${review}`);
 console.log("DELETED:         0");
 console.log("Existing Japanese fields: PRESERVED");
})().catch(e=>{console.error("SYNC FAILED:",e?.message||e);process.exit(1);});
