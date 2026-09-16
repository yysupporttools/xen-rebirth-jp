#!/usr/bin/env node
"use strict";

/*
 * Xen Rebirth official event detail fetch test Ver.2
 * READ ONLY:
 * - Fetches official calendar
 * - Discovers event detail links
 * - Fetches each event detail page
 * - Extracts title/date text/category/body preview
 * - DOES NOT write to Supabase
 */

const CALENDAR_URL = "https://www.xenrebirth.com/calendar/";
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 40);

function decodeHtml(s = "") {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
function stripTags(s = "") {
  return decodeHtml(
    s.replace(/<script[\s\S]*?<\/script>/gi, " ")
     .replace(/<style[\s\S]*?<\/style>/gi, " ")
     .replace(/<br\s*\/?>/gi, "\n")
     .replace(/<\/p>|<\/li>|<\/div>|<\/tr>/gi, "\n")
     .replace(/<[^>]*>/g, " ")
     .replace(/[ \t]+/g, " ")
     .replace(/\n\s+/g, "\n")
     .replace(/\n{3,}/g, "\n\n")
     .trim()
  );
}
async function fetchText(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: c.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; XenRebirthJP-CalendarTest/2.0)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.text();
  } finally { clearTimeout(t); }
}
function discoverEvents(html) {
  const re = /<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const map = new Map();
  for (const m of html.matchAll(re)) {
    const href = decodeHtml(m[1]);
    const title = stripTags(m[2]);
    if (!title) continue;
    let url;
    try { url = new URL(href, CALENDAR_URL).href; } catch { continue; }
    const id = (url.match(/event\/(\d+)/i) || [])[1];
    if (id && !map.has(url)) map.set(url, { id, title, url });
  }
  return [...map.values()];
}
function firstMatch(html, patterns) {
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return stripTags(m[1]);
  }
  return "";
}
function extractDetail(html, fallback) {
  const title = firstMatch(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ]) || fallback.title;

  const category = firstMatch(html, [
    /Category:\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i,
    /Category:\s*([\s\S]{0,120}?)(?:<\/|<br|$)/i
  ]);

  const start = firstMatch(html, [
    /Start:\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i,
    /Start:\s*([\s\S]{0,160}?)(?:<\/|<br|$)/i
  ]);
  const end = firstMatch(html, [
    /End:\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i,
    /End:\s*([\s\S]{0,160}?)(?:<\/|<br|$)/i
  ]);

  // Generic text snapshot. It is intentionally only a preview in this test.
  const text = stripTags(html);
  let bodyPreview = "";
  const titlePos = text.indexOf(title);
  if (titlePos >= 0) bodyPreview = text.slice(titlePos + title.length, titlePos + title.length + 900);
  else bodyPreview = text.slice(0, 900);

  return { title, start, end, category, bodyPreview };
}

(async () => {
  console.log("=== Xen Rebirth event detail fetch test Ver.2 ===");
  console.log("Mode: READ-ONLY / NO DATABASE WRITES");

  const calendarHtml = await fetchText(CALENDAR_URL);
  const events = discoverEvents(calendarHtml).slice(0, MAX_EVENTS);
  if (!events.length) throw new Error("No event links detected.");

  console.log(`[CALENDAR] ${events.length} event link(s) queued.`);
  let ok = 0, fail = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    console.log(`\n===== EVENT ${i + 1}/${events.length} =====`);
    console.log(`Calendar title: ${e.title}`);
    console.log(`Official ID:    ${e.id}`);
    console.log(`URL:            ${e.url}`);
    try {
      const html = await fetchText(e.url);
      const d = extractDetail(html, e);
      console.log(`Detail title:   ${d.title || "(not detected)"}`);
      console.log(`Start:          ${d.start || "(not detected)"}`);
      console.log(`End:            ${d.end || "(not detected)"}`);
      console.log(`Category:       ${d.category || "(not detected)"}`);
      console.log(`Body preview:   ${(d.bodyPreview || "(not detected)").replace(/\n/g, " | ")}`);
      ok++;
    } catch (err) {
      console.error(`DETAIL ERROR:   ${err.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 250));
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Detail fetch success: ${ok}`);
  console.log(`Detail fetch failed:  ${fail}`);
  console.log("No Supabase/site data was changed.");

  if (!ok) process.exit(2);
})().catch(err => {
  console.error(`[ERROR] ${err?.stack || err}`);
  console.error("No Supabase/site data was changed.");
  process.exit(1);
});
