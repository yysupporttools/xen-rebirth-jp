"""Check static links and glossary collisions; run after build_glossary.py."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, re
from bs4 import BeautifulSoup

root=Path(__file__).resolve().parents[1]/'dist'
pages={p:BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser') for p in root.glob('*.html')}
terms=json.loads((root/'assets/glossary.json').read_text(encoding='utf-8'))
ids={t['id'] for t in terms}
assert len(ids)==len(terms)
count=0; glossary_links=0
for p,s in pages.items():
 assert len(s.select('h1'))==1,p
 all_ids=[e['id'] for e in s.select('[id]')]
 assert len(all_ids)==len(set(all_ids)),p
 assert len(s.select('nav a[href="glossary.html"]'))==1,p
 assert not s.select('a a'),p
 for e in s.select('[href], [src]'):
  url=urlsplit(e.get('href',e.get('src')))
  if url.scheme or url.netloc:continue
  dest=p.parent/unquote(url.path) if url.path else p
  assert dest.exists(),(p,e)
  if url.fragment and dest in pages:assert pages[dest].find(id=unquote(url.fragment)),(p,e)
  count+=1
 for a in s.select('a.glossary-link'):
  assert a['href'].startswith('glossary.html#')
  assert a['href'].split('#')[1] in ids
  glossary_links+=1
cleric=pages[root/'class-cleric.html']
assert not cleric.select('.skill-name a.glossary-link'), 'Skill names must not link to items'
change=pages[root/'class-change.html']
for color in ['red','blue','yellow']:
 assert change.select(f'a[href="glossary.html#{color}-demon-blood"]')
for alias in ['Caricsobana','Caricosbana']:
 a=change.find('a',string=alias)
 assert a and a['href']=='glossary.html#caricsobana'
assert len(pages[root/'glossary.html'].select('.glossary-entry'))==len(terms)
print(f'PASS: {len(pages)} pages, {count} local references, {len(terms)} terms, {glossary_links} glossary links; unique IDs, aliases and name collisions.')
