#!/usr/bin/env python3
"""Sync Xen Rebirth official class armor/weapon tables into Supabase.

Source of truth: the seven official Xen Rebirth Lexicon URLs supplied by the site owner.
The parser extracts rows and image URLs deterministically. OpenAI is used only to
translate newly discovered item/section names; it must not invent missing equipment data.
"""
import hashlib, json, os, re, sys, time
from html import unescape
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from bs4 import BeautifulSoup

SUPABASE_URL=os.environ.get("SUPABASE_URL","https://dzxxjtmpcfsmvdgkcwvn.supabase.co").rstrip("/")
SUPABASE_SECRET=os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")
OPENAI_API_KEY=os.environ.get("OPENAI_API_KEY","")
OPENAI_MODEL=os.environ.get("OPENAI_MODEL","gpt-5.6-luna")
TRANSLATE=os.environ.get("TRANSLATE","true").lower() not in {"0","false","no"}
SOURCES=[
 ("knight","Knight","ナイト","https://www.xenrebirth.com/lexicon/index.php?entry/17-knight-class-armor-and-weapons/"),
 ("mage","Mage","メイジ","https://www.xenrebirth.com/lexicon/index.php?entry/3-mage-class-armor-and-weapons/"),
 ("archer","Archer","アーチャー","https://www.xenrebirth.com/lexicon/index.php?entry/12-archer-class-armor-and-weapons/"),
 ("cleric","Cleric","クレリック","https://www.xenrebirth.com/lexicon/index.php?entry/4-cleric-class-armor-and-weapons/"),
 ("rogue","Rogue","ローグ","https://www.xenrebirth.com/lexicon/index.php?entry/10-rogue-class-armor-and-weapons/"),
 ("templar","Templar","テンプラー","https://www.xenrebirth.com/lexicon/index.php?entry/8-templar-class-armor-and-weapons/"),
 ("xenian","Xenian","ゼニアン","https://www.xenrebirth.com/lexicon/index.php?entry/91-xenian-class-armor-and-weapons/"),
]
if not SUPABASE_SECRET:
    raise SystemExit("Missing GitHub Secret: SUPABASE_SERVICE_ROLE_KEY")
if TRANSLATE and not OPENAI_API_KEY:
    raise SystemExit("Missing GitHub Secret: OPENAI_API_KEY (or run with translate=false)")

def http(url, method="GET", body=None, headers=None, timeout=45):
    data=None if body is None else json.dumps(body,ensure_ascii=False).encode()
    h={"User-Agent":"Mozilla/5.0 (compatible; XenRebirthJP-ClassEquipmentSync/1.0)",
       "Accept":"text/html,application/json;q=0.9,*/*;q=0.8"}
    if data is not None: h["Content-Type"]="application/json"
    if headers: h.update(headers)
    req=Request(url,data=data,headers=h,method=method)
    try:
        with urlopen(req,timeout=timeout) as r:
            raw=r.read().decode("utf-8","replace")
            return r.status,raw
    except HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        raise RuntimeError(f"HTTP {e.code} {url}: {raw[:800]}")

def sb(path, method="GET", body=None, prefer=None):
    h={"apikey":SUPABASE_SECRET,"Authorization":"Bearer "+SUPABASE_SECRET,"Accept":"application/json","User-Agent":"XenRebirthJP-ClassEquipmentSync/1.0"}
    if prefer: h["Prefer"]=prefer
    status,raw=http(f"{SUPABASE_URL}/rest/v1/{path}",method,body,h)
    return json.loads(raw) if raw.strip() else None

def clean(s):
    return re.sub(r"\s+"," ",unescape(str(s or ""))).strip()

def _image_candidate(value, base):
    value=clean(value)
    if not value: return None
    # srcset may contain "url 2x, url2 3x".
    value=value.split(",")[0].strip().split(" ")[0].strip("'\\\"")
    if not value or value.startswith("data:"): return None
    low=value.lower()
    if any(x in low for x in ("smilie","emoji","avatar","reaction","logo","favicon")): return None
    # Official WoltLab attachments do not always end in an image extension.
    if not (re.search(r"\\.(?:png|jpe?g|gif|webp|bmp)(?:$|[?#])",low) or
            "attachment" in low or "/images/" in low or "/image/" in low):
        return None
    return urljoin(base,value)

def image_url(row, base):
    # 1) Normal/lazy-loaded image elements.
    for img in row.find_all(["img","source"]):
        for attr in ("data-src","data-original","data-url","data-lazy-src","src","srcset","data-srcset"):
            found=_image_candidate(img.get(attr),base)
            if found: return found
    # 2) WoltLab attachment links sometimes contain no <img> in the table cell.
    for a in row.find_all("a",href=True):
        found=_image_candidate(a.get("href"),base)
        if found: return found
    # 3) Thumbnail spans/divs can use CSS background-image.
    for el in row.find_all(True):
        for attr in ("style","data-background-image","data-bg","data-image"):
            raw=el.get(attr)
            if not raw: continue
            urls=re.findall(r"url\\(([^)]+)\\)",raw,re.I) if attr=="style" else [raw]
            for value in urls:
                found=_image_candidate(value,base)
                if found: return found
    return None

def image_diagnostics(html, base):
    soup=BeautifulSoup(html,"html.parser")
    imgs=soup.find_all("img")
    links=[a.get("href","") for a in soup.find_all("a",href=True)
           if "attachment" in a.get("href","").lower() or
              re.search(r"\\.(?:png|jpe?g|gif|webp)(?:$|[?#])",a.get("href","").lower())]
    styled=[x.get("style","") for x in soup.find_all(style=True) if "url(" in x.get("style","").lower()]
    samples=[]
    for img in imgs:
        attrs={k:clean(v) for k,v in img.attrs.items()
               if k in ("src","data-src","data-original","data-url","data-lazy-src","srcset","data-srcset","alt","class")}
        row=img.find_parent("tr")
        table=img.find_parent("table")
        samples.append({
          "attrs":attrs,
          "row_text":clean(row.get_text(" ",strip=True))[:300] if row else "",
          "table_text":clean(table.get_text(" ",strip=True))[:300] if table else "",
          "parent":img.parent.name if img.parent else "",
          "resolved":next((_image_candidate(attrs.get(k),base) for k in ("data-src","data-original","data-url","data-lazy-src","src","srcset","data-srcset") if _image_candidate(attrs.get(k),base)),None)
        })
    return {"img_tags":len(imgs),"attachment_or_image_links":len(links),"background_styles":len(styled),
            "links":links[:10],"styles":styled[:5],"images":samples}

def looks_header(values):
    text=" ".join(values).lower()
    keys=("level","lvl","atk","def","mag","attack","defense","name","item","drop location","image","equipment")
    return any(k in text for k in keys) and len(values)>=2

def type_of(name):
    n=name.lower()
    mapping=[
      (("shoe","boot"),("Shoes","靴")), (("glove","gauntlet"),("Gloves","手袋")),
      (("helmet","helm","hat"),("Helmet","頭装備")), (("armor","robe","suit"),("Armor","体装備")),
      (("shield",),("Shield","盾")), (("bow",),("Bow","弓")), (("dagger",),("Dagger","短剣")),
      (("staff",),("Staff","杖")), (("cane",),("Cane","ケーン")), (("sword",),("Sword","剣")),
      (("club","mace"),("Club","鈍器")), (("main hand","right hand"),("Main Hand","メイン武器")),
      (("off hand","left hand"),("Off Hand","サブ武器")), (("weapon",),("Weapon","武器")),
    ]
    for words,val in mapping:
        if any(w in n for w in words): return val
    return ("Equipment","装備")

HEADER_JA={
 "level":"必要Lv","lvl":"必要Lv","atk":"攻撃力","attack":"攻撃力",
 "def":"防御力","defense":"防御力","mag":"魔法攻撃力","magic":"魔法攻撃力",
 "drop location":"ドロップ場所","drop locations":"ドロップ場所",
 "drop location(s)":"ドロップ場所","location":"場所","wt":"重量"
}
def stat_label(header):
    k=clean(header).lower().rstrip(":")
    return HEADER_JA.get(k,clean(header))

def parse_page(class_key,url,html):
    soup=BeautifulSoup(html,"html.parser")
    root=(soup.select_one(".lexiconEntry") or soup.select_one(".messageText") or
          soup.select_one(".message-body") or soup.select_one(".messageBody") or
          soup.select_one(".htmlContent") or soup.select_one("article") or
          soup.select_one("main") or soup)
    current_section=""
    current_topic=""
    out=[]
    seen=set()
    table_no=0
    for node in root.find_all(["h1","h2","h3","h4","h5","table"]):
        if node.name!="table":
            txt=clean(node.get_text(" ",strip=True))
            if not txt: continue
            if node.name in ("h1","h2"):
                current_section=txt
            else:
                current_topic=txt
            continue
        table_no+=1
        rows=node.find_all("tr")
        if not rows: continue
        header=[]
        first=[clean(c.get_text(" ",strip=True)) for c in rows[0].find_all(["th","td"])]
        first=[x for x in first if x]
        if rows[0].find("th") or looks_header(first):
            header=first
            data_rows=rows[1:]
        else:
            data_rows=rows
        # Many official tables use the first heading cell as the set name.
        set_name=""
        if header and header[0] and not re.search(r"^(image|item|name|equipment)$",header[0],re.I):
            if any(x in " ".join(header[1:]).lower() for x in ("level","atk","def","mag","drop")):
                set_name=header[0]
        section=" — ".join(x for x in (current_section,set_name) if x) or f"Table {table_no}"
        topic=(current_topic or "").lower()
        # Explicit skill tables are outside this equipment catalogue.
        if "skill" in topic and not any(w in topic for w in ("equipment","gear","armor","weapon")):
            continue
        for row_no,row in enumerate(data_rows,1):
            cells=row.find_all(["td","th"])
            values=[clean(c.get_text(" ",strip=True)) for c in cells]
            if not any(values): continue
            if looks_header([x for x in values if x]) and not image_url(row,url): continue
            name_idx=None
            if header:
                for i,h in enumerate(header):
                    if re.search(r"\b(name|item|equipment|weapon|armor)\b",h,re.I) and i<len(values) and values[i]:
                        name_idx=i; break
            if name_idx is None:
                for i,v in enumerate(values):
                    if v and not re.fullmatch(r"[+\-]?\d+(?:\.\d+)?",v):
                        name_idx=i; break
            if name_idx is None: continue
            name=values[name_idx]
            if not name or name.lower() in {"image","name","item","equipment"}: continue
            # Skip obvious table labels accidentally treated as data.
            if re.search(r"\bset$",name,re.I) and len([v for v in values if v])<=2: continue
            stats=[]
            for i,v in enumerate(values):
                if i==name_idx or not v: continue
                h=header[i] if i<len(header) else ""
                if h and i==0 and set_name==h: continue
                stats.append(f"{stat_label(h)}: {v}" if h else v)
            img=image_url(row,url)
            typ_en,typ_ja=type_of(name)
            key=hashlib.sha1(f"{class_key}|{section}|{name}".lower().encode()).hexdigest()[:24]
            if key in seen: continue
            seen.add(key)
            out.append({
              "source_item_key":key,"section_en":section,"section_ja":None,
              "item_type_en":typ_en,"item_type_ja":typ_ja,"name_en":name,"name_ja":None,
              "required_level":next((v for i,v in enumerate(values) if i<len(header) and re.search(r"level|lvl",header[i],re.I) and v),None),
              "stats":" | ".join(stats) or None,"description":None,"image_url":img,
              "sort_order":len(out)+1
            })
    if not out:
        raise RuntimeError(f"{class_key}: no equipment rows were extracted; official HTML structure may have changed")
    return out

def output_text(j):
    if isinstance(j.get("output_text"),str): return j["output_text"]
    for item in j.get("output",[]):
        for c in item.get("content",[]):
            if c.get("type")=="output_text" and isinstance(c.get("text"),str): return c["text"]
    return ""

def translate_new(class_name,items,existing):
    old={x.get("source_item_key"):x for x in existing}
    pending=[x for x in items if not (old.get(x["source_item_key"]) or {}).get("name_ja")]
    # Preserve existing community/API translations.
    for x in items:
        prev=old.get(x["source_item_key"]) or {}
        if prev.get("name_ja"): x["name_ja"]=prev["name_ja"]
        if prev.get("section_ja"): x["section_ja"]=prev["section_ja"]
    if not TRANSLATE or not pending: return
    for start in range(0,len(pending),40):
        batch=pending[start:start+40]
        compact=[{"key":x["source_item_key"],"name_en":x["name_en"],"section_en":x["section_en"]} for x in batch]
        schema={"type":"object","additionalProperties":False,"properties":{"items":{"type":"array","items":{"type":"object","additionalProperties":False,"properties":{"key":{"type":"string"},"name_ja":{"type":"string"},"section_ja":{"type":"string"}},"required":["key","name_ja","section_ja"]}}},"required":["items"]}
        prompt=f"""Xen Rebirthの{class_name}系統の公式装備一覧です。
各英語名を日本語攻略サイト向けに短く自然に訳してください。
ゲーム内の固有名詞として不自然な場合は英語を残して構いません。
原文にない性能・入手先・設定は絶対に追加しないでください。
section_enも見出しとして自然な日本語にしてください。
入力JSON:
{json.dumps(compact,ensure_ascii=False)}"""
        body={"model":OPENAI_MODEL,"store":False,"reasoning":{"effort":"none"},"input":prompt,
              "text":{"format":{"type":"json_schema","name":"class_equipment_translation","strict":True,"schema":schema}}}
        _,raw=http("https://api.openai.com/v1/responses","POST",body,
                   {"Authorization":"Bearer "+OPENAI_API_KEY,"Accept":"application/json"})
        parsed=json.loads(output_text(json.loads(raw)))
        bykey={x["key"]:x for x in parsed.get("items",[])}
        for x in batch:
            tr=bykey.get(x["source_item_key"],{})
            x["name_ja"]=clean(tr.get("name_ja")) or None
            x["section_ja"]=clean(tr.get("section_ja")) or None
        time.sleep(.25)

def source_row(class_key):
    rows=sb("class_equipment_sources?select=*&class_key=eq."+quote(class_key))
    if not rows: raise RuntimeError(f"Supabase source missing: {class_key}")
    return rows[0]

def sync_one(class_key,class_en,class_ja,url):
    print(f"\n=== {class_en} ===")
    _,html=http(url)
    items=parse_page(class_key,url,html)
    source=source_row(class_key)
    existing=sb("class_equipment_items?select=*&source_id=eq."+quote(str(source["id"]))) or []
    translate_new(class_en,items,existing)
    # Never erase an already captured official image just because a later HTML response
    # temporarily omits lazy-loaded thumbnails.
    old_by_key={x.get("source_item_key"):x for x in existing}
    for item in items:
        if not item.get("image_url"):
            item["image_url"]=(old_by_key.get(item["source_item_key"]) or {}).get("image_url")
    payload=[{"source_id":source["id"],**x} for x in items]
    sb("class_equipment_items?on_conflict=source_id,source_item_key","POST",payload,
       "resolution=merge-duplicates,return=minimal")
    sb("class_equipment_sources?class_key=eq."+quote(class_key),"PATCH",
       {"class_name_en":class_en,"class_name_ja":class_ja,"source_url":url,
        "last_synced_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())},
       "return=minimal")
    with open(f"class-equipment-{class_key}.json","w",encoding="utf-8") as f:
        json.dump({"class_key":class_key,"source_url":url,"items":items},f,ensure_ascii=False,indent=2)
    print(f"Extracted/upserted: {len(items)} items")
    image_count=sum(bool(x.get("image_url")) for x in items)
    print(f"With official images: {image_count}")
    if image_count == 0:
        diag=image_diagnostics(html,url)
        print(f"IMAGE DIAGNOSTIC {class_key}: img_tags={diag['img_tags']}, attachment_or_image_links={diag['attachment_or_image_links']}, background_styles={diag['background_styles']}")
        for sample in diag["images"][:8]:
            print("IMAGE TAG SAMPLE:",json.dumps(sample,ensure_ascii=False)[:1200])
        with open(f"class-equipment-debug-{class_key}.json","w",encoding="utf-8") as f:
            json.dump(diag,f,ensure_ascii=False,indent=2)

def main():
    only=os.environ.get("CLASS_KEY","all").strip().lower()
    selected=SOURCES if only in ("","all") else [x for x in SOURCES if x[0]==only]
    if not selected: raise SystemExit(f"Unknown CLASS_KEY: {only}")
    print("Xen Rebirth class equipment sync")
    print("Source: official Xen Rebirth Lexicon only")
    print(f"Translate new names: {TRANSLATE} / model={OPENAI_MODEL}")
    for src in selected: sync_one(*src)
    print("\nSYNC COMPLETE")

if __name__=="__main__":
    try: main()
    except Exception as e:
        print("SYNC FAILED:",e,file=sys.stderr)
        raise
