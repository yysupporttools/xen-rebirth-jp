"""Build the static glossary and repeatable cross-page links. Requires beautifulsoup4."""
from pathlib import Path
import json, re
from bs4 import BeautifulSoup, NavigableString

ROOT=Path(__file__).resolve().parents[1]/'dist'
terms=json.loads((ROOT/'assets/glossary.json').read_text(encoding='utf-8'))
categories=['転職素材','転職用装備','スキル消耗品','ペット','基本用語']
aliases={alias:t['id'] for t in terms for alias in [t['name'],*t['aliases']]}
pattern=re.compile('|'.join(r'(?<![A-Za-z0-9])'+re.escape(a)+r'(?![A-Za-z0-9])' for a in sorted(aliases,key=len,reverse=True)))

def tag(soup,name,text=None,**attrs):
 t=soup.new_tag(name,attrs=attrs)
 if text is not None:t.string=text
 return t

# Use the site's shared shell, replacing only its main content.
soup=BeautifulSoup((ROOT/'classes.html').read_text(encoding='utf-8'),'html.parser')
soup.title.string='用語集 | Xen Rebirth 日本語攻略'
soup.html['class']='glossary-page'
soup.find('meta',attrs={'name':'description'})['content']='Xen Rebirthのアイテム・転職素材・スキル消耗品を日本語で解説。名称や別表記で検索できます。'
main=soup.main; main.clear()
intro=tag(soup,'div',**{'class':'page-intro'})
intro.append(tag(soup,'p','GLOSSARY / 名称から調べる',**{'class':'eyebrow'}))
intro.append(tag(soup,'h1','用語集'))
intro.append(tag(soup,'p','転職素材、装備、スキルで使うアイテムをまとめました。各ページの下線付きの名称から、該当する説明へ直接移動できます。'))
main.append(intro)
main.append(tag(soup,'p','英語名はゲーム内で探しやすい表記を掲載。日本語は本サイトの要約です。入手先や条件を確認できないものは推測していません。',**{'class':'note'}))
form=tag(soup,'div',**{'class':'paper glossary-controls','id':'glossary-search-panel','hidden':''})
form.append(tag(soup,'label','名称・別表記・説明で検索',**{'for':'glossary-query'}))
form.append(tag(soup,'input',**{'id':'glossary-query','type':'search','placeholder':'例：Xen Stone、転職、蘇生','autocomplete':'off'}))
form.append(tag(soup,'label','分類',**{'for':'glossary-category'}))
select=tag(soup,'select',id='glossary-category');select.append(tag(soup,'option','すべて',value=''))
for c in categories:select.append(tag(soup,'option',c,value=c))
form.append(select);form.append(tag(soup,'button','検索をクリア',type='button',id='glossary-reset'))
form.append(tag(soup,'p',f'{len(terms)}件',id='glossary-count',role='status',**{'aria-live':'polite'}));main.append(form)
nav=tag(soup,'div',**{'class':'anchor-nav','aria-label':'用語の分類'})
for i,c in enumerate(categories):nav.append(tag(soup,'a',c,href=f'#category-{i}'))
main.append(nav)
for i,c in enumerate(categories):
 section=tag(soup,'section',id=f'category-{i}',**{'class':'glossary-category'})
 section.append(tag(soup,'h2',c))
 for term in [t for t in terms if t['category']==c]:
  article=tag(soup,'article',id=term['id'],tabindex='-1',**{'class':'paper glossary-entry','data-category':c})
  article.append(tag(soup,'h3',term['name']))
  if term['aliases']:article.append(tag(soup,'p','別表記：'+' / '.join(term['aliases']),**{'class':'small'}))
  article.append(tag(soup,'p',term['description']))
  links=tag(soup,'div',**{'class':'glossary-links'})
  links.append(tag(soup,'a','関連ガイドへ',href=term['related']))
  links.append(tag(soup,'a','公式の出典 ↗',href=term['source'],target='_blank',rel='noopener noreferrer'))
  links.append(tag(soup,'a','この項目へのリンク',href='#'+term['id']))
  article.append(links);section.append(article)
 main.append(section)
main.append(tag(soup,'p','該当する用語がありません。名称を短くするか、分類を「すべて」に戻してください。',id='glossary-empty',hidden='',**{'class':'notice'}))
main.append(tag(soup,'a','用語集の先頭へ ↑',href='#main'))
soup.head.append(tag(soup,'script',src='assets/glossary.js',defer=''))
soup.footer.find_all('span')[-1].string='用語集更新：2026年9月13日'
(ROOT/'glossary.html').write_text(str(soup),encoding='utf-8')

linked=0
for p in ROOT.glob('*.html'):
 soup=BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser')
 if not soup.select_one('link[href="assets/glossary.css"]'):
  soup.head.append(tag(soup,'link',rel='stylesheet',href='assets/glossary.css'))
 edition=soup.select_one('.edition')
 if edition:edition.string='UNOFFICIAL · VER.3'
 nav=soup.select_one('nav[aria-label="メインナビゲーション"]')
 for a in nav.select('a[href="glossary.html"]'):a.decompose()
 link=tag(soup,'a','用語集',href='glossary.html')
 if p.name=='glossary.html':
  for a in nav.select('[aria-current]'):del a['aria-current']
  link['aria-current']='page'
 nav.append(link)
 if p.name!='glossary.html':
  for a in soup.main.select('a.glossary-link'):a.unwrap()
  soup.main.smooth()
  # Expand the one shared suffix so each color has its own complete item link.
  for node in list(soup.main.find_all(string=True)):
   if node.parent.name not in ['script','style']:
    new=str(node).replace('Red / Blue / Yellow Demon Blood','Red Demon Blood / Blue Demon Blood / Yellow Demon Blood').replace('赤・青・黄のDemon Blood','赤のDemon Blood・青のDemon Blood・黄のDemon Blood')
    if new!=str(node):node.replace_with(new)
  for node in list(soup.main.find_all(string=True)):
   if any(a.name in ['a','script','style','code','button','textarea','select','option'] for a in node.parents):continue
   # Jureah's Blessing is also a Cleric skill: skill names are not item references.
   if any('skill-name' in a.get('class',[]) for a in node.parents):continue
   text=str(node); matches=list(pattern.finditer(text))
   if not matches:continue
   last=0
   for m in matches:
    if m.start()>last:node.insert_before(NavigableString(text[last:m.start()]))
    node.insert_before(tag(soup,'a',m.group(),href='glossary.html#'+aliases[m.group()],**{'class':'glossary-link','title':'用語集：'+m.group()}))
    linked+=1;last=m.end()
   if last<len(text):node.insert_before(NavigableString(text[last:]))
   node.extract()
 p.write_text(str(soup),encoding='utf-8')
print(f'Built {len(terms)} terms and {linked} glossary links.')
