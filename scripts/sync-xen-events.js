#!/usr/bin/env node
"use strict";

/*
 Xen Rebirth Event Import Preview Ver.4
 READ ONLY / DRY RUN
 - Fetch official calendar
 - Deduplicate official event IDs
 - Parse title/date/category/body
 - Normalize date-only values for Supabase preview
 - Detect likely timed events and show them for manual verification
 - DOES NOT write to Supabase
*/

const CALENDAR_URL="https://www.xenrebirth.com/calendar/";
const MAX_EVENTS=Number(process.env.MAX_EVENTS||50);

function decode(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function clean(s=""){return decode(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|div|tr|h\d)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim());}
async function get(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
 try{
  const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; XenRebirthJP-CalendarTest/4.0)","accept":"text/html,application/xhtml+xml"}});
  if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
 }finally{clearTimeout(t);}
}
function canonical(raw){
 const u=new URL(decode(raw),CALENDAR_URL); u.hash=""; return u.href;
}
function discover(html){
 const re=/<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
 const map=new Map();
 for(const m of html.matchAll(re)){
  const id=m[2], title=clean(m[3]); if(!title)continue;
  if(!map.has(id))map.set(id,{id,title,url:canonical(m[1])});
 }
 return [...map.values()];
}
function first(html,arr){for(const re of arr){const m=html.match(re);if(m?.[1])return clean(m[1]);}return "";}
function parseDateRange(pageText){
 const day="(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
 const mon="[A-Z][a-z]{2}";
 const one=`${day},\\s+${mon}\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4}`;
 const m=pageText.match(new RegExp(`(${one})(?:\\s*[-–]\\s*(${one}))?`,"i"));
 return m?{start:m[1],end:m[2]||m[1]}:{start:"",end:""};
}
const MONTH={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
function isoDate(s){
 const m=s.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/i);
 if(!m)return "";
 const mm=String(MONTH[m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase()]||0).padStart(2,"0");
 return `${m[3]}-${mm}-${String(m[2]).padStart(2,"0")}`;
}
function addDays(iso,n){
 const d=new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);
}
function category(html,pageText){
 let c=first(html,[/(?:Category|Categories)\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i,/(?:Category|Categories)\s*[:\-]\s*([\w ][\w &/-]{1,80})/i]);
 if(c)return c;
 const known=["Automated Events","Holiday Events","Maintenance","Weddings","Events"];
 return known.find(x=>new RegExp(`(?:^|\\s|\\|)${x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:\\s|\\||$)`,"i").test(pageText))||"";
}
function body(html,title){
 const blocks=[];
 for(const re of [/<div[^>]+class=["'][^"']*(?:messageText|messageBody|htmlContent|eventDescription)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,/<article\b[^>]*>([\s\S]*?)<\/article>/gi])
  for(const m of html.matchAll(re)){const v=clean(m[1]);if(v.length>80)blocks.push(v);}
 if(blocks.length)return blocks.sort((a,b)=>b.length-a.length)[0];
 const p=clean(html); let pos=p.search(/\bIntroduction\s*:/i); if(pos<0)pos=p.indexOf(title);
 return p.slice(Math.max(0,pos),Math.max(0,pos)+6000);
}
function detectTimeHints(pageText){
 const hits=[];
 const patterns=[
  /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/ig,
  /\b\d{1,2}\s*(?:am|pm)\b/ig,
  /\bmidnight\b/ig,
  /\bnoon\b/ig,
  /\bserver time\b/ig
 ];
 for(const re of patterns)for(const m of pageText.matchAll(re))hits.push(m[0]);
 return [...new Set(hits)].slice(0,12);
}
function parse(html,e){
 const title=first(html,[/<h1[^>]*>([\s\S]*?)<\/h1>/i,/<title[^>]*>([\s\S]*?)<\/title>/i])||e.title;
 const pageText=clean(html), dates=parseDateRange(pageText);
 return {title,category:category(html,pageText),dates,body:body(html,title),timeHints:detectTimeHints(pageText)};
}
function previewRecord(e,d){
 const start=isoDate(d.dates.start), endInclusive=isoDate(d.dates.end);
 // Current site convention for all-day ranges: end_time is exclusive.
 const endExclusive=endInclusive?addDays(endInclusive,1):"";
 const allDay=d.timeHints.length===0;
 return {
  official_event_id:`official-${e.id}`,
  title_en:d.title,
  category:d.category,
  start_time:start?`${start}T00:00:00+00:00`:null,
  end_time:endExclusive?`${endExclusive}T00:00:00+00:00`:null,
  official_url:e.url,
  all_day_candidate:allDay,
  source_start:d.dates.start,
  source_end:d.dates.end,
  time_hints:d.timeHints
 };
}

(async()=>{
 console.log("=== Xen Rebirth Supabase import preview Ver.4 ===");
 console.log("DRY RUN: NO DATABASE WRITES");
 const cal=await get(CALENDAR_URL),events=discover(cal).slice(0,MAX_EVENTS);
 console.log(`[CALENDAR] ${events.length} unique event(s)`);

 let ok=0,dateOK=0,needsTimeReview=0;
 for(let i=0;i<events.length;i++){
  const e=events[i];
  try{
   const html=await get(e.url),d=parse(html,e),r=previewRecord(e,d); ok++;
   if(r.start_time&&r.end_time)dateOK++;
   if(!r.all_day_candidate)needsTimeReview++;
   console.log(`\n===== PREVIEW ${i+1}/${events.length} =====`);
   console.log(JSON.stringify(r,null,2));
   console.log(`Body chars: ${d.body.length}`);
  }catch(err){console.error(`\n[ERROR ${e.id}] ${err.message}`);}
  await new Promise(r=>setTimeout(r,250));
 }
 console.log("\n=== SUMMARY ===");
 console.log(`Unique events:              ${events.length}`);
 console.log(`Preview generated:          ${ok}`);
 console.log(`Date normalized:            ${dateOK}`);
 console.log(`Needs time verification:    ${needsTimeReview}`);
 console.log("Supabase writes:            0");
 console.log("IMPORTANT: Events with time hints are NOT safe to auto-import yet.");
})().catch(e=>{console.error(e?.stack||e);process.exit(1);});
