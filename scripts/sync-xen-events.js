#!/usr/bin/env node
"use strict";

/* Xen Rebirth official event parser test Ver.3
   READ ONLY - no Supabase/site writes. */

const CALENDAR_URL="https://www.xenrebirth.com/calendar/";
const MAX_EVENTS=Number(process.env.MAX_EVENTS||40);

function decode(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function text(s=""){return decode(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|div|tr|h\d)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim());}
async function get(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
 try{
  const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; XenRebirthJP-CalendarTest/3.0)","accept":"text/html,application/xhtml+xml"}});
  if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
 }finally{clearTimeout(t);}
}
function canonical(raw){
 const u=new URL(decode(raw),CALENDAR_URL);
 u.hash="";
 return u.href;
}
function discover(html){
 const re=/<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
 const byId=new Map();
 for(const m of html.matchAll(re)){
  const id=m[2],title=text(m[3]);
  if(!title)continue;
  const url=canonical(m[1]);
  if(!byId.has(id))byId.set(id,{id,title,url});
 }
 return [...byId.values()];
}
function match(html,arr){
 for(const re of arr){const m=html.match(re);if(m?.[1])return text(m[1]);}
 return "";
}
function parseDateRange(pageText){
 // WoltLab page observed format: Mon, Sep 14th 2026-Sun, Sep 20th 2026
 const re=/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})(?:\s*[-–]\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}))?/i;
 const m=pageText.match(re);
 return m?{start:m[1],end:m[2]||m[1]}:{start:"",end:""};
}
function parseCategory(html,pageText){
 const candidates=[
  /(?:Category|Categories)\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i,
  /(?:Category|Categories)\s*[:\-]\s*([\w ][\w &/-]{1,80})/i,
  /itemprop=["']eventStatus["'][^>]*>([\s\S]*?)</i
 ];
 let c=match(html,candidates);
 if(c)return c;
 const known=["Automated Events","Holiday Events","Maintenance","Weddings","Events"];
 return known.find(x=>new RegExp(`(?:^|\\s|\\|)${x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:\\s|\\||$)`,"i").test(pageText))||"";
}
function parseBody(html,title){
 // Prefer common WoltLab message/article containers, otherwise use cleaned page text around Introduction/body.
 const blocks=[];
 const res=[
  /<div[^>]+class=["'][^"']*(?:messageText|messageBody|htmlContent|eventDescription)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  /<article\b[^>]*>([\s\S]*?)<\/article>/gi
 ];
 for(const re of res)for(const m of html.matchAll(re)){const v=text(m[1]);if(v.length>80)blocks.push(v);}
 if(blocks.length)return blocks.sort((a,b)=>b.length-a.length)[0];
 const p=text(html);
 let pos=p.search(/\bIntroduction\s*:/i);
 if(pos<0)pos=p.indexOf(title);
 return p.slice(Math.max(0,pos),Math.max(0,pos)+2500);
}
function parseDetail(html,fallback){
 const title=match(html,[/<h1[^>]*>([\s\S]*?)<\/h1>/i,/<title[^>]*>([\s\S]*?)<\/title>/i])||fallback.title;
 const pageText=text(html);
 const dates=parseDateRange(pageText);
 return {title,start:dates.start,end:dates.end,category:parseCategory(html,pageText),body:parseBody(html,title)};
}

(async()=>{
 console.log("=== Xen Rebirth event parser test Ver.3 ===");
 console.log("Mode: READ-ONLY / NO DATABASE WRITES");
 const ch=await get(CALENDAR_URL);
 const rawCount=[...ch.matchAll(/<a\b[^>]*href=["'][^"']*(?:\?|&amp;)event\/\d+[^"']*["']/gi)].length;
 const events=discover(ch).slice(0,MAX_EVENTS);
 console.log(`[CALENDAR] raw event links: ${rawCount}`);
 console.log(`[DEDUP] unique official event IDs: ${events.length}`);
 if(!events.length)throw new Error("No event links detected.");

 let fetched=0,dateOK=0,catOK=0,bodyOK=0;
 for(let i=0;i<events.length;i++){
  const e=events[i];
  console.log(`\n===== EVENT ${i+1}/${events.length} =====`);
  console.log(`Calendar title: ${e.title}`);
  console.log(`Official ID:    ${e.id}`);
  console.log(`Canonical URL:  ${e.url}`);
  try{
   const html=await get(e.url),d=parseDetail(html,e); fetched++;
   if(d.start)dateOK++; if(d.category)catOK++; if(d.body)bodyOK++;
   console.log(`Detail title:   ${d.title||"(not detected)"}`);
   console.log(`Start:          ${d.start||"(not detected)"}`);
   console.log(`End:            ${d.end||"(not detected)"}`);
   console.log(`Category:       ${d.category||"(not detected)"}`);
   console.log(`Body preview:   ${(d.body||"(not detected)").slice(0,900).replace(/\n/g," | ")}`);
  }catch(err){console.error(`DETAIL ERROR:   ${err.message}`);}
  await new Promise(r=>setTimeout(r,250));
 }
 console.log("\n=== SUMMARY ===");
 console.log(`Unique events:          ${events.length}`);
 console.log(`Detail fetch success:   ${fetched}`);
 console.log(`Date range detected:    ${dateOK}`);
 console.log(`Category detected:      ${catOK}`);
 console.log(`Body detected:          ${bodyOK}`);
 console.log("No Supabase/site data was changed.");
 if(!fetched)process.exit(2);
})().catch(e=>{console.error(`[ERROR] ${e?.stack||e}`);console.error("No Supabase/site data was changed.");process.exit(1);});
