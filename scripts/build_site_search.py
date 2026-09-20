"""Build the public site's search snapshot using only Python's standard library."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
import json
import re

ROOT = Path(__file__).resolve().parents[1] / 'dist'
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
SKIP = {'script','style','nav','form','button','dialog','noscript','template'}

class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []
    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node): yield from child.walk()
    def text(self):
        if self.tag in SKIP or 'hidden' in self.attrs: return ''
        return ' '.join(c.text() if isinstance(c,Node) else c for c in self.children)

class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.current = self.root
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        node=Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in VOID: self.current=node
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)
    def handle_endtag(self, tag):
        node=self.current
        while node.parent:
            if node.tag==tag:
                self.current=node.parent
                return
            node=node.parent
    def handle_data(self, text):self.current.children.append(text)

def clean(text):return re.sub(r'\s+',' ',str(text or '')).strip()
def first(node, tags):return next((n for n in node.walk() if n.tag in tags),None)
records=[]
def add(key, title, text, url, kind, page):
    if clean(title) and clean(text):
        records.append(dict(key=key,title=clean(title),text=clean(text),url=url,kind=kind,page=page))

for file in sorted(ROOT.glob('*.html')):
    if file.name=='search.html' or file.name.startswith('google'):continue
    tree=Tree(file.read_text(encoding='utf-8')).root
    main=first(tree,{'main'})
    if not main:continue
    h1=first(main,{'h1'})
    title=clean(h1.text() if h1 else file.stem)
    intro=next((n for n in main.walk() if 'page-intro' in n.attrs.get('class','').split()),None)
    dynamic=file.stem in {'glossary','quests','events','board'}
    page_text=(intro or main).text()[:650] if dynamic else main.text()
    add('page:'+file.stem,title,page_text,file.name,'class' if file.stem.startswith('class-') or file.stem=='classes' else 'guide',title)
    if file.stem in {'glossary','quests','events','board'}:continue
    for idx,node in enumerate(main.walk()):
        if node.tag not in {'section','article'}:continue
        # Do not duplicate a parent section's nested chapters.
        if any(n is not node and n.tag=='section' for n in node.walk()):continue
        heading=first(node,{'h2','h3','h4'})
        if not heading:continue
        anchor=node.attrs.get('id','')
        if not anchor:
            ancestor=node.parent
            while ancestor and ancestor is not main:
                if ancestor.attrs.get('id'):
                    anchor=ancestor.attrs['id'];break
                ancestor=ancestor.parent
        url=file.name+('#'+quote(anchor) if anchor else '')
        kind='class' if file.stem.startswith('class-') or file.stem=='classes' else 'guide'
        skill_rows=[n for n in node.walk() if n.tag=='tr' and any('skill-name' in c.attrs.get('class','').split() for c in n.walk())]
        if skill_rows:
            for num,row in enumerate(skill_rows):
                name=next(n for n in row.walk() if 'skill-name' in n.attrs.get('class','').split()).text()
                add(f'skill:{file.stem}:{num}',name,row.text(),url,'skill',title)
        else:
            add(f'guide:{file.stem}:{idx}',heading.text(),node.text(),url,kind,title)

for t in json.loads((ROOT/'assets/glossary.json').read_text(encoding='utf-8')):
    slug=str(t['id'])
    add('term:'+slug,t['name'],' '.join([t.get('description',''),t.get('category',''),' '.join(t.get('aliases',[]))]),'glossary.html#'+quote(slug),'glossary','用語集')
catalog=json.loads((ROOT/'assets/lucky-ball-catalog.json').read_text(encoding='utf-8'))
for g in catalog['groups']:
    title=' / '.join(filter(None,[g.get('name_ja'),g.get('name_en')]))
    url='glossary.html#lucky-ball-'+quote(g['slug'])
    add('ball:'+g['slug'],title,g.get('description','')+' ラッキーボール Lucky Ball',url,'lucky','ラッキーボール')
    for num,item in enumerate(g['items']):
        add(f'ball-item:{g["slug"]}:{num}',' / '.join(filter(None,[item.get('name_ja'),item.get('name_en')])), ' '.join(filter(None,[title,item.get('stats'),item.get('stats_en'),item.get('description')])),url,'lucky',title)

out=ROOT/'assets/site-search-index.json'
out.write_text(json.dumps({'version':1,'records':records},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Search index: {len(records)} entries, {out.stat().st_size:,} bytes')
