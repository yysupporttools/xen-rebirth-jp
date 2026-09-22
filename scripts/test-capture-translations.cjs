// Run: node scripts/test-capture-translations.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../dist/assets/capture.js'),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function setup(seed=[]){
  const storage=new Map([['xen-validated-ja-v1',JSON.stringify(seed)]]);
  const calls=[],writes=[],cards=[];
  const context=vm.createContext({window:{},Date,console,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    document:{querySelectorAll:()=>cards},
    renderDialogueCard:(r,key)=>`${key}:${r.id}:${r.choices_ja.join('|')}`,
    db:{rpc:async(name,args)=>{writes.push({name,args});return {data:{saved:false}};}},
    contributorId:'test',setStatus(){},
  });
  vm.runInContext(section('  function choicesArray(', '  function profileKey(')+
    section('  async function autoSaveAiResult(', '  function validMapRegion(')+
    ';globalThis.api={choicesArray,validJapanese,cleanTranslations,needsTranslation,repairTranslations,translateMissingText,repairDisplayedRecord,autoSaveAiResult};',context);
  function translator(fn){context.window.Translator={create:async()=>({translate:async en=>{calls.push(en);return fn(en);},destroy(){}})};}
  return {api:context.api,context,storage,calls,writes,cards,translator};
}
const plain=x=>JSON.parse(JSON.stringify(x));
async function main(){
  let t=setup();
  for(const ja of ['',null,'Item Enhancing',' ITEM ENHANCING! ','Ｉｔｅｍ Ｅｎｈａｎｃｉｎｇ','Item Enhancin','Item Enhancingです']){
    assert.equal(t.api.validJapanese('Item Enhancing',ja),false,String(ja));
  }
  assert.equal(t.api.validJapanese('Item Enhancing','アイテム強化'),true);
  assert.equal(t.api.validJapanese('HP recovery','HP回復'),true);
  assert.deepEqual(plain(t.api.choicesArray('["","終了"]')),['','終了']);
  assert.deepEqual(plain(t.api.choicesArray('\n終了')),['','終了']);
  assert.deepEqual(plain(t.api.choicesArray('')),[]);
  const input={dialogue_text_en:'Welcome',dialogue_text_ja:'Welcome',choices_en:['Item Enhancing','Leave','Trade'],choices_ja:['Item Enhancing','終了','']};
  t.translator(en=>({Welcome:'ようこそ','Item Enhancing':'アイテム強化',Trade:'取引'})[en]);
  const repaired=await t.api.repairTranslations(input);
  assert.deepEqual(t.calls,['Welcome','Item Enhancing','Trade']);
  assert.deepEqual(plain(repaired.choices_ja),['アイテム強化','終了','取引']);
  assert.equal(repaired.dialogue_text_ja,'ようこそ');
  assert.equal(input.dialogue_text_ja,'Welcome');
  await t.api.repairTranslations(repaired);
  assert.equal(t.calls.length,3,'Valid records do not translate again');
  const cached=JSON.parse(t.storage.get('xen-validated-ja-v1'));
  const reloaded=setup(cached);
  assert.equal(reloaded.api.needsTranslation(input),false,'Validated cache survives reload');
  await reloaded.api.repairTranslations(input);
  assert.equal(reloaded.calls.length,0);
  t=setup([['itemenhancing','Item Enhancing']]);
  assert.equal(t.api.cleanTranslations(input).choices_ja[0],'','Reject corrupt existing cache');
  t.translator(en=>en==='Trade'?'取引':en);
  const partial=await t.api.repairTranslations(input);
  assert.deepEqual(plain(partial.choices_ja),['','終了','取引']);
  assert.equal(partial.dialogue_text_ja,'');
  assert.equal(partial.japanese_text,'終了\n取引');
  assert.equal(t.api.needsTranslation(partial),true);
  assert.ok(!t.storage.get('xen-validated-ja-v1').includes('Item Enhancing'));
  await t.api.autoSaveAiResult({...input,japanese_text:'Welcome\nItem Enhancing'},'hash');
  const payload=t.writes[0].args;
  assert.equal(payload.p_dialogue_text_ja,'','No combined-text fallback into dialogue');
  assert.deepEqual(plain(payload.p_choices_ja),['','終了','取引']);
  assert.equal(payload.p_japanese_text,'終了\n取引');
  t=setup();
  const unsupported=await t.api.repairTranslations(input);
  assert.equal(t.api.needsTranslation(unsupported),true);
  assert.deepEqual(plain(unsupported.choices_ja),['','終了','']);
  assert.deepEqual(JSON.parse(t.storage.get('xen-validated-ja-v1')),[['leave','終了']]);
  t=setup();
  t.translator(()=>{throw new Error('translation failed');});
  await t.api.translateMissingText('Retry');
  await t.api.translateMissingText('Retry');
  assert.equal(t.calls.length,1,'Failure cooldown prevents repeated requests');
  await t.api.translateMissingText('Retry',true);
  assert.equal(t.calls.length,2,'Explicit retry bypasses cooldown');
  t=setup();
  let resolve;
  t.translator(()=>new Promise(r=>{resolve=r;}));
  const p1=t.api.translateMissingText('Concurrent');
  const p2=t.api.translateMissingText('Concurrent');
  await new Promise(setImmediate);
  resolve('同時処理');
  assert.deepEqual(await Promise.all([p1,p2]),['同時処理','同時処理']);
  assert.equal(t.calls.length,1,'Deduplicate in-flight requests');
  t=setup();
  t.translator(()=>new Promise(r=>{resolve=r;}));
  const record={id:'old',choices_en:['Item Enhancing'],choices_ja:['Item Enhancing']};
  const card={dataset:{recordId:'old',cardKey:'root'},outerHTML:'original'};
  t.cards.push(card);
  t.api.repairDisplayedRecord(record,'root');
  await new Promise(setImmediate);
  card.dataset.recordId='next';
  resolve('アイテム強化');
  await new Promise(setImmediate);
  assert.equal(card.outerHTML,'original','Async repair must not replace the next dialogue');
  assert.equal(record.choices_ja[0],'アイテム強化');
  t=setup();
  t.translator(()=>'アイテム強化');
  const visible={id:'visible',choices_en:['Item Enhancing'],choices_ja:['Item Enhancing']};
  const sameCard={dataset:{recordId:'visible',cardKey:'root'},outerHTML:'original'};
  t.cards.push(sameCard);
  t.api.repairDisplayedRecord(visible,'root');
  await new Promise(setImmediate);
  assert.equal(sameCard.outerHTML,'root:visible:アイテム強化');
  const nav=vm.createContext({});
  vm.runInContext(`
    const records=[{id:'a',npc_name:'NPC',created_at:'2026-01-01'},
      {id:'b',npc_name:'NPC',created_at:'2026-01-02'}];
    const dialogueTransitions=[{from_record_id:'a',to_record_id:'b',choice_index:1}];
    const dialogueNavStacks=new Map();
    let activeRecordId='a',activeNpcName='NPC';
    function renderDialogueCard(r,key){return key+':'+r.id;}
    ${section('  function dialogueRowsForNpc(', '  function readKnownNpcSignatures(')}
    ${section('  function transitionFor(', '  function renderDialogueCard(')}
    ${section('  function openDialogueTarget(', '  $("capture-mini-now")')}
    globalThis.nav={dialogueRootForNpc,dialoguePageInfo,transitionFor,openDialogueTarget,goDialogueBack,dialogueNavStacks,records};
  `,nav);
  assert.equal(nav.nav.dialogueRootForNpc('NPC').id,'a');
  assert.equal(nav.nav.dialoguePageInfo(nav.nav.records[1]).index,2);
  assert.equal(nav.nav.transitionFor('a',1).to_record_id,'b');
  const navCard={dataset:{cardKey:'a',recordId:'a'},outerHTML:''};
  nav.nav.openDialogueTarget({closest:()=>navCard,dataset:{dialogueTarget:'b'}});
  assert.equal(navCard.outerHTML,'a:b');
  assert.deepEqual(plain(nav.nav.dialogueNavStacks.get('a')),['a']);
  navCard.dataset.recordId='b';
  nav.nav.goDialogueBack({closest:()=>navCard});
  assert.equal(navCard.outerHTML,'a:a');
  assert.deepEqual(plain(nav.nav.dialogueNavStacks.get('a')),[]);
  console.log('PASS: validation, positional choices, selective repair, persistence, corrupt cache, partial failure, RPC payload, unavailable translator, retry, deduplication, navigation race and visible refresh');
  console.log('PASS: NPC root, page order, choice transition and back navigation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
