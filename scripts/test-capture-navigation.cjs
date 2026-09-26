const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../dist/assets/capture.js'),'utf8');
function section(start,end){const at=source.indexOf(start);assert.ok(at>=0,start);const to=source.indexOf(end,at);assert.ok(to>at,end);return source.slice(at,to);}
const context=vm.createContext({console,Date,Set,Map});
vm.runInContext(`
let records=[],routeCurrentMap='',activeRecordId='',activeNpcName='';
let autoEnabled=true,stream={},lastFastNpcName='',lastFastNpcAt=0;
const dialogueHistory=[],dialogueNavStacks=new Map();
let cache={},ocrCalls=0,npcProfiles=[];
function readKnownNpcSignatures(){return cache;}
function npcSignatureFromVideo(){return '0000';}
async function fastDialogueOcrTick(){ocrCalls++;return true;}
function transitionFor(){return null;}
function choicesArray(a){return a||[];}
function renderDialogueCard(r,key){return key+':'+r.id;}
${section('  function signatureDistance(', '  async function rememberKnownNpcSignature(')}
${section('  function bestKnownNpcMatch(', '  function fastDialogueCanvas(')}
${section('  function tokenSet(', '  async function rememberObservedDialogueTransition(')}
${section('  function normText(', '  function choicesArray(')}
${section('  function profileKey(', '  async function applyAiResult(')}
${section('  function portraitFallbackRegion(', '  async function autoSaveNpcPortrait(')}
${section('  function openDialogueTarget(', '  $("route-destination").addEventListener')}
globalThis.api={bestKnownNpcMatch,bestSavedDialogueFromOcr,inferChoiceIndexBetween,fastKnownNpcTick,openDialogueTarget,goDialogueBack};
`,context);
function run(code){return vm.runInContext(code,context);}
async function main(){
run(`npcProfiles=[{npc_name:'Guide',map_name:'Town',image_url:'town'}]`);
assert.equal(run(`findNpcProfile('Guide','Forest')`),null,'Never borrow an NPC portrait from another map');
assert.equal(run(`findNpcProfile('Guide','Town').image_url`),'town');
assert.equal(run(`portraitFallbackRegion({dialog_window_region:{x:0,y:0,width:600,height:600}})`),null,'Do not guess portrait from dialogue window');
assert.equal(run(`portraitFallbackRegion({npc_portrait_region:{x:950,y:0,width:100,height:200}})`),null,'Reject out of bounds crop');
assert.equal(run(`portraitFallbackRegion({npc_portrait_region:{x:100,y:100,width:100,height:200}}).x`),100);
run(`cache={a:{npc_name:'A',signatures:[{bits:'0'.repeat(100)},{bits:'0'.repeat(100)}]},b:{npc_name:'B',signatures:[{bits:'1'+'0'.repeat(99)}]}}`);
assert.equal(context.api.bestKnownNpcMatch('0'.repeat(100)),null,'Competing NPC cannot hide behind two signatures from one NPC');
run(`records=[{id:'a',npc_name:'Guide',map_name:'Town',dialogue_text_en:'Take the crystal to the northern tower'}, {id:'b',npc_name:'Guide',map_name:'Forest',dialogue_text_en:'Take the crystal to the northern tower'}]`);
assert.equal(context.api.bestSavedDialogueFromOcr('Guide'),null,'NPC name alone cannot identify dialogue');
assert.equal(context.api.bestSavedDialogueFromOcr('Guide Take the crystal to the northern tower'),null,'Identical conversations require disambiguation');
run(`routeCurrentMap='Forest'`);
assert.equal(context.api.bestSavedDialogueFromOcr('Guide Take the crystal to the northern tower').record.id,'b');
run(`records=[{id:'indoor',npc_name:'Guild Office Guide',map_name:'',dialogue_text_en:'This is the first floor of the guild office',choices_en:['Hotel Manager Request']}];routeCurrentMap='Essene'`);
assert.equal(context.api.bestSavedDialogueFromOcr('Guild Office Guide This is the first floor of the guild office Hotel Manager Request').record.id,'indoor','Indoor dialogue remains matchable without a map label');
assert.equal(context.api.inferChoiceIndexBetween({id:'a',npc_name:'A',choices_en:['Trade']},{id:'b',npc_name:'B',dialogue_text_en:'Trade'}),-1);
assert.equal(context.api.inferChoiceIndexBetween({id:'a',npc_name:'A',map_name:'Town',choices_en:['Trade']},{id:'b',npc_name:'A',map_name:'Forest',dialogue_text_en:'Trade'}),-1);
run(`cache={a:{npc_name:'A',signatures:[{bits:'0000'}]}}`);
await context.api.fastKnownNpcTick();
assert.ok(run('ocrCalls')>0,'Visual match must still verify dialogue');
run(`records=[{id:'a',npc_name:'A'},{id:'b',npc_name:'A'},{id:'c',npc_name:'A'}]; activeRecordId='a'`);
const card={dataset:{cardKey:'a',recordId:'a'},outerHTML:''};
for(const id of ['b','c']){context.api.openDialogueTarget({closest:()=>card,dataset:{dialogueTarget:id}});card.dataset.recordId=id;}
context.api.goDialogueBack({closest:()=>card});assert.equal(card.outerHTML,'a:b');card.dataset.recordId='b';
context.api.goDialogueBack({closest:()=>card});assert.equal(card.outerHTML,'a:a');card.dataset.recordId='a';
assert.equal(run('dialogueHistory.length'),0,'Back must consume mirrored history');
context.api.goDialogueBack({closest:()=>card});assert.equal(card.outerHTML,'a:a');
console.log('PASS: competing signatures, NPC-only rejection, identical dialogue ambiguity, map identity, cross-NPC/map transitions, OCR verification and repeated back');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

