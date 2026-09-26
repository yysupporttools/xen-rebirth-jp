const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/assets/capture.js'),'utf8');
function section(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
async function main(){
  let finish;
  const fields={'knowledge-search':{value:'Old NPC'},'map-filter':{value:'Old Map'}};
  const context=vm.createContext({Date,console,window:{Tesseract:{recognize:()=>new Promise(r=>{finish=r;})}},$:id=>fields[id]});
  vm.runInContext(`
    let autoEnabled=true,stream={},activeRecordId='old',activeNpcName='Old NPC';
    let fastDialogueOcrBusy=false,lastFastDialogueOcrAt=0,lastFastNpcName='',lastFastNpcAt=0,renders=0;
    let hit={record:{id:'new',npc_name:'Guild Office Guide',map_name:''}};
    function fastDialogueCanvas(){return {};}
    function bestSavedDialogueFromOcr(){return hit;}
    function rememberDialogueHistory(){}
    function rememberObservedDialogueTransition(){}
    function renderRecords(){renders++;}
    function setStatus(){}
    function needsTranslation(){return false;}
    ${section('  function showSavedDialogueMatch(', '  function normText(')}
    globalThis.api={fastDialogueOcrTick,showSavedDialogueMatch};
  `,context);
  const run=code=>vm.runInContext(code,context);
  for(const change of ["autoEnabled=false","stream={}","activeRecordId='manual'"]){
    run("autoEnabled=true;activeRecordId='old'");
    const pending=context.api.fastDialogueOcrTick(true);
    run(change);finish({data:{text:'New dialogue'}});
    assert.equal(await pending,false,'Discard OCR after '+change);
    assert.equal(run('renders'),0);
  }
  run("autoEnabled=true;activeRecordId='old'");
  const pending=context.api.fastDialogueOcrTick(true);finish({data:{text:'New dialogue'}});
  assert.equal(await pending,true);
  assert.equal(fields['knowledge-search'].value,'Guild Office Guide');
  assert.equal(fields['map-filter'].value,'','Old map filter cannot hide an indoor conversation');
  assert.equal(run('renders'),1);
  context.api.showSavedDialogueMatch(run('hit'));
  assert.equal(run('renders'),1,'Repeated match must not replace the same card');
  console.log('PASS: stopped/replaced stream and navigation races, stale filters, indoor display, repeated-match stability');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

