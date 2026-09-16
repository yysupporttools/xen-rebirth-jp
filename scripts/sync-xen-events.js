#!/usr/bin/env node
"use strict";

/*
 Xen Rebirth Event Date/Time Parser Ver.6
 DRY RUN / NO SUPABASE WRITES

 Parses the official event header:
   Your Timezone | America/Chicago | Start | ... | End | ...
 and converts timed events to UTC + JST.

 Date-only events remain date-only and use an exclusive end date for
 calendar storage preview.
*/

const CALENDAR_URL="https://www.xenrebirth.com/calendar/";
const MAX_EVENTS=Number(process.env.MAX_EVENTS||50);
const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const WD="(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const DATE=`${WD},\\s+[A-Z][a-z]{2}\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4}`;
const DATETIME=`${DATE},\\s+\\d{1,2}:\\d{2}\\s+(?:am|pm)`;

function decode(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function clean(s=""){return decode(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|div|tr|h\d|time)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim());}
async function get(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
 try{
  const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; XenRebirthJP-CalendarSync/6.0)","accept":"text/html,application/xhtml+xml"}});
  if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
 } finally {clearTimeout(t);}
}
function canonical(raw){const u=new URL(decode(raw),CALENDAR_URL);u.hash="";return u.href;}
function discover(html){
 const re=/<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,map=new Map();
 for(const m of html.matchAll(re)){const id=m[2],title=clean(m[3]);if(title&&!map.has(id))map.set(id,{id,title,url:canonical(m[1])});}
 return [...map.values()];
}
function titleOf(html,fallback){const m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);return m?clean(m[1]):fallback;}
function headerWindow(html,title){
 const p=clean(html); let i=p.indexOf(title); if(i<0)i=0;
 return p.slice(i,i+1800).replace(/\s*\n\s*/g," | ").replace(/\s+/g," ").trim();
}
function parseOfficialHeader(h){
 const tz=(h.match(/\bYour Timezone\s*\|\s*([A-Za-z_]+\/[A-Za-z_]+)\s*\|\s*Start\b/i)||[])[1]||null;
 if(!tz)return {timezone:null,startRaw:null,endRaw:null,allDay:null,error:"Your Timezone not detected"};

 let m=h.match(new RegExp(`\\bStart\\s*\\|\\s*(${DATETIME})\\s*\\|\\s*End\\s*\\|\\s*(${DATETIME})`,"i"));
 if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:false,error:null};

 m=h.match(new RegExp(`\\bStart\\s*\\|\\s*(${DATE})\\s*\\|\\s*End\\s*\\|\\s*(${DATE})`,"i"));
 if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:true,error:null};

 // Fallback: the visible event heading before Your Timezone.
 m=h.match(new RegExp(`\\|\\s*(${DATETIME})\\s*-\\s*(${DATETIME})\\s*\\|[\\s\\S]*?\\bYour Timezone\\b`,"i"));
 if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:false,error:null};
 m=h.match(new RegExp(`\\|\\s*(${DATE})\\s*-\\s*(${DATE})\\s*\\|[\\s\\S]*?\\bYour Timezone\\b`,"i"));
 if(m)return {timezone:tz,startRaw:m[1],endRaw:m[2],allDay:true,error:null};

 return {timezone:tz,startRaw:null,endRaw:null,allDay:null,error:"Start/End not detected"};
}
function parseParts(raw,allDay){
 const re=allDay
  ? new RegExp(`^${WD},\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})$`,"i")
  : new RegExp(`^${WD},\\s+([A-Z][a-z]{2})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4}),\\s+(\\d{1,2}):(\\d{2})\\s+(am|pm)$`,"i");
 const m=raw.match(re); if(!m)return null;
 let hour=0,minute=0;
 if(!allDay){hour=Number(m[4])%12+(m[6].toLowerCase()==="pm"?12:0);minute=Number(m[5]);}
 return {year:Number(m[3]),month:MONTHS[m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase()],day:Number(m[2]),hour,minute};
}
function offsetAt(utcMs,tz){
 const f=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const o=Object.fromEntries(f.formatToParts(new Date(utcMs)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 const asUTC=Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second);
 return asUTC-utcMs;
}
function zonedToUtc(p,tz){
 const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,0);
 let guess=wall;
 for(let i=0;i<4;i++){const next=wall-offsetAt(guess,tz);if(next===guess)break;guess=next;}
 return new Date(guess);
}
function ymd(p){return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;}
function addDaysYmd(s,n){
 const [y,m,d]=s.split("-").map(Number),x=new Date(Date.UTC(y,m-1,d+n));
 return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
}
function jst(iso){
 return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));
}
function makePreview(e,h){
 const p=parseOfficialHeader(h);
 const base={official_event_id:`official-${e.id}`,title_en:e.title,official_url:e.url,source_timezone:p.timezone,source_start:p.startRaw,source_end:p.endRaw,all_day:p.allDay};
 if(p.error)return {...base,status:"REVIEW",reason:p.error};
 const a=parseParts(p.startRaw,p.allDay),b=parseParts(p.endRaw,p.allDay);
 if(!a||!b)return {...base,status:"REVIEW",reason:"Date parse failed"};

 if(p.allDay){
  // Official End is inclusive. DB/calendar preview uses exclusive end.
  return {...base,start_date:ymd(a),end_date_exclusive:addDaysYmd(ymd(b),1),start_time:null,end_time:null,jst_display:`${ymd(a)} ～ ${ymd(b)}`,status:"OK"};
 }
 try{
  const s=zonedToUtc(a,p.timezone).toISOString(),t=zonedToUtc(b,p.timezone).toISOString();
  return {...base,start_time:s,end_time:t,jst_start:jst(s),jst_end:jst(t),status:"OK"};
 }catch(err){return {...base,status:"REVIEW",reason:`Timezone conversion failed: ${err.message}`};}
}

(async()=>{
 console.log("=== Xen Rebirth Event Date/Time Parser Ver.6 ===");
 console.log("DRY RUN / NO SUPABASE WRITES");
 const events=discover(await get(CALENDAR_URL)).slice(0,MAX_EVENTS);
 let ok=0,review=0,timed=0,allDay=0;
 for(let i=0;i<events.length;i++){
  const e=events[i],html=await get(e.url),title=titleOf(html,e.title),h=headerWindow(html,title);
  const rec=makePreview({...e,title},h);
  if(rec.status==="OK")ok++; else review++;
  if(rec.all_day===true)allDay++; else if(rec.all_day===false)timed++;
  console.log(`\n===== PREVIEW ${i+1}/${events.length} =====`);
  console.log(JSON.stringify(rec,null,2));
  await new Promise(r=>setTimeout(r,250));
 }
 console.log("\n=== SUMMARY ===");
 console.log(`Unique events:          ${events.length}`);
 console.log(`Parsed OK:              ${ok}`);
 console.log(`Needs review:           ${review}`);
 console.log(`Timed events:           ${timed}`);
 console.log(`Date-only events:       ${allDay}`);
 console.log("Supabase writes:        0");
 console.log("IMPORTANT: This version is a dry run. No database rows were changed.");
})().catch(e=>{console.error(e?.stack||e);process.exit(1);});
