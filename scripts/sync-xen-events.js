#!/usr/bin/env node
"use strict";

/*
 * Xen Rebirth official calendar fetch test
 * TEST MODE ONLY:
 * - Reads the public official calendar.
 * - Prints discovered event links/titles to the Actions log.
 * - Does NOT write to Supabase or modify the site.
 */

const CALENDAR_URL = "https://www.xenrebirth.com/calendar/";

function decodeHtml(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s = "") {
  return decodeHtml(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; XenRebirthJP-CalendarTest/1.0)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    console.log(`[HTTP] ${res.status} ${res.statusText} -> ${res.url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function discoverEvents(html) {
  // WoltLab calendar detail URLs observed on the official site:
  // /calendar/index.php?event/19958-scheduled-maintenance/
  const re = /<a\b[^>]*href=["']([^"']*(?:\?|&amp;)event\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const map = new Map();

  for (const m of html.matchAll(re)) {
    let href = decodeHtml(m[1]);
    const title = stripTags(m[2]);
    if (!title) continue;

    let url;
    try {
      url = new URL(href, CALENDAR_URL).href;
    } catch {
      continue;
    }

    const idMatch = url.match(/event\/(\d+)(?:-([^/?#]+))?/i);
    const officialEventId = idMatch
      ? `${idMatch[1]}${idMatch[2] ? "-" + idMatch[2].replace(/\/$/, "") : ""}`
      : url;

    if (!map.has(url)) {
      map.set(url, { officialEventId, title, url });
    }
  }
  return [...map.values()];
}

(async () => {
  console.log("=== Xen Rebirth event fetch test ===");
  console.log(`Calendar: ${CALENDAR_URL}`);
  console.log("Mode: READ-ONLY / NO DATABASE WRITES");

  const html = await fetchText(CALENDAR_URL);
  console.log(`[HTML] ${html.length.toLocaleString()} characters received`);

  const events = discoverEvents(html);

  if (!events.length) {
    console.error("");
    console.error("[FAILED] No event detail links were detected.");
    console.error("The official site may render the calendar dynamically, block automated access, or its HTML structure may have changed.");
    console.error("No Supabase/site data was changed.");
    process.exit(2);
  }

  console.log("");
  console.log(`[SUCCESS] ${events.length} event link(s) detected.`);
  for (const [i, e] of events.entries()) {
    console.log(`\n#${i + 1}`);
    console.log(`Title: ${e.title}`);
    console.log(`ID:    ${e.officialEventId}`);
    console.log(`URL:   ${e.url}`);
  }

  console.log("");
  console.log("Test completed. No Supabase/site data was changed.");
})().catch(err => {
  console.error("");
  console.error(`[ERROR] ${err?.stack || err}`);
  console.error("No Supabase/site data was changed.");
  process.exit(1);
});
