#!/usr/bin/env node
"use strict";

/*
 Xen Rebirth Event Time Inspector Ver.5
 READ ONLY / DRY RUN
 Goal: isolate the official event header/date metadata from body text.
 No Supabase writes.
*/
const CALENDAR_URL="https://www.xenrebirth.com/calendar/";
const MAX_EVENTS=Number(process.env.MAX_EVENTS||50);

function decode(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function clean(s=""){return decode(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|div|tr|h\d|time)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim());}
async function get(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
 try{
  const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; XenRebirthJP-CalendarTest/5.0)","accept":"text/html,application/xhtml+xml"}});
  if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
 } finally { clearTimeout(t); }
}
function canonical(raw){const u=new URL(decode(raw),CALENDAR_URL);u.hash="";return u.href;}
function discover(html){
 const re=/<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
 const map=new Map();
 for(const m of html.matchAll(re)){const id=m[2],title=clean(m[3]);if(title&&!map.has(id))map.set(id,{id,title,url:canonical(m[1])});}
 return [...map.values()];
}
function titleOf(html,fallback){
 const m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
 return m?clean(m[1]):fallback;
}
function extractTimeTags(html){
 const out=[];
 const re=/<time\b([^>]*)>([\s\S]*?)<\/time>/gi;
 for(const m of html.matchAll(re)){
  const attrs=m[1], label=clean(m[2]);
  const dt=(attrs.match(/\bdatetime=["']([^"']+)["']/i)||[])[1]||"";
  out.push({datetime:decode(dt),label});
 }
 return out;
}
function extractDataTimes(html){
 const out=[];
 const re=/\b(data-(?:timestamp|time|date|start|end)|datetime)=["']([^"']+)["']/gi;
 for(const m of html.matchAll(re)) out.push({attribute:m[1],value:decode(m[2])});
 return out.slice(0,40);
}
function headerWindow(html,title){
 const plain=clean(html);
 let p=plain.indexOf(title);
 if(p<0)p=0;
 return plain.slice(p,p+1200);
}
function dateHeaderText(header){
 const m=header.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?(?:\s*[-–]\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?(?:[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}\s+)?\d{1,2}:\d{2}\s*(?:am|pm)|\s*[-–]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})?)/i);
 return m?m[1]:"";
}

(async()=>{
 console.log("=== Xen Rebirth Event Time Inspector Ver.5 ===");
 console.log("READ ONLY / NO SUPABASE WRITES");
 const events=discover(await get(CALENDAR_URL)).slice(0,MAX_EVENTS);
 console.log(`[CALENDAR] ${events.length} unique event(s)`);

 let timeTagEvents=0, headerDateEvents=0;
 for(let i=0;i<events.length;i++){
  const e=events[i],html=await get(e.url),title=titleOf(html,e.title);
  const times=extractTimeTags(html), dataTimes=extractDataTimes(html), header=headerWindow(html,title), dateHeader=dateHeaderText(header);
  if(times.length)timeTagEvents++;
  if(dateHeader)headerDateEvents++;

  console.log(`\n===== INSPECT ${i+1}/${events.length} =====`);
  console.log(`ID: ${e.id}`);
  console.log(`Title: ${title}`);
  console.log(`URL: ${e.url}`);
  console.log(`Header date text: ${dateHeader||"(not detected)"}`);
  console.log(`TIME_TAGS: ${JSON.stringify(times)}`);
  console.log(`DATA_TIMES: ${JSON.stringify(dataTimes)}`);
  console.log(`HEADER_PREVIEW: ${header.replace(/\n/g," | ")}`);
  await new Promise(r=>setTimeout(r,250));
 }
 console.log("\n=== SUMMARY ===");
 console.log(`Unique events:          ${events.length}`);
 console.log(`Header date detected:   ${headerDateEvents}`);
 console.log(`Events with <time>:     ${timeTagEvents}`);
 console.log("Supabase writes:        0");
 console.log("Next: use the official header metadata found here to build the final time parser.");
})().catch(e=>{console.error(e?.stack||e);process.exit(1);});
