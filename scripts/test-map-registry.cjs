const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const context={window:{},console,crypto:{randomUUID:()=> 'test-device'},localStorage:{getItem(){return null;},setItem(){}},document:{getElementById(){return null;}}};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'dist/assets/map-registry.js'),'utf8'),context);
const registry=context.window.XEN_MAP_REGISTRY;
const pairs=[
["Sylphaen Forest","Shylphaen Forest"],["Shylphaen Forest","Shylphaen Forest"],["Sylphaen Forest B1F","Sylphaen Forest B1F"],["シルバエンの森","Shylphaen Forest"],["コルロナの森","Corlona Forest"],["Colorado Forest","Colorado Forest"],
["Rosestar Basin","Rosetar Basin"],["Rosetar Basin","Rosetar Basin"],["Rosestar Basin B1F","Rosestar Basin B1F"],["ロジタ盆地","Rosetar Basin"],
["Pladino Grove","Paladino Grove"],["Paladino Grove","Paladino Grove"],["Pladino Grove B1F","Pladino Grove B1F"],["パルラディノグローブ","Paladino Grove"],
["Ashley Forest","Ashely Forest"],["Ashely Forest","Ashely Forest"],["Ashley Forest B1F","Ashley Forest B1F"],
["Chingon Plains","Clingon Plains"],["Clingon Plains","Clingon Plains"],["Chingon Plains B1F","Chingon Plains B1F"],["Clingon Plains B2F","Clingon Plains B2F"],
["Brynhilld","Arcarinas Square"],["Brynhild","Arcarinas Square"],["Brinhilld","Arcarinas Square"],["Brynhildr","Arcarinas Square"],["ブリンヒルド","Arcarinas Square"],
["Toisen Plains","Taisen Plains"],["Taisen Plains","Taisen Plains"],["Toisen Plains B1F","Toisen Plains B1F"],["タイセン沼地","Taisen Plains"],
["Costella Forest","Castella Forest"],["Castella Forest","Castella Forest"],["Costella Forest B1F","Costella Forest B1F"],["Castella Forest B2F","Castella Forest B2F"],["カステルラの森","Castella Forest"],["ロエムの谷","Loem Valley"],["オテロスの森","Othellos Forest"],["クリスタンの森","Kryston Forest"],["カステルラの森 B1F","カステルラの森 B1F"],
["Theglia Forest","Theglaia Forest"],["Theglaia Forest","Theglaia Forest"],["Theglia Forest B1F","Theglia Forest B1F"],["Theglaia Forest B2F","Theglaia Forest B2F"],
["Bradley Forest","Bradlely Forest"],["Bradlely Forest","Bradlely Forest"],["Bradley Forest B1F","Bradley Forest B1F"],["Bradlely Forest B2F","Bradlely Forest B2F"],
["Arcana's Square","Arcarinas Square"],["Arcania Square","Arcarinas Square"],["Arcaria's Square","Arcarinas Square"],["Brynnhild","Arcarinas Square"],["Brunnen Basin","Brunen Basin"],["Titarius Plains","Titanus Plains"],["Titans Plains","Titanus Plains"],["Jotunnheim","Jotunheim"],["Candyvault","Candy Vault"],["Village of Abundance","Abundance Town"],["Albatross Village","Albatross City"],["エスネ","Essene"],["Ｅｓｓｅｎｅ","Essene"],["Wavim Plains","Wavin Plains"],["Beryl City","Beryl City"],["East Gate","East Gate"],["Eternity","Eternity"],["Gardia","Gardia"],["Tartarus Plains","Tartarus Plains"],["Brynhild Culvert B1F","Brynhild Culvert B1F"],["Brynhilld Culvert 1F","Brynhilld Culvert 1F"],["Brynhilld Culvert B2F","Brynhilld Culvert B2F"],["Shenzhen Waterfall Entrance","Shenzhen Waterfall Entrance"],["Shenzhen Waterfall Exit","Shenzhen Waterfall Exit"]
];for(const [from,to] of pairs)assert.equal(registry.resolve(from),to,from);
const groups=registry.groups([{id:'a',map_name:'Brunen Basin',map_image_url:'photo-a'},{id:'b',map_name:'Brunnen Basin',map_image_url:'photo-b'}]);
assert.equal(groups.length,1);assert.equal(groups[0].map_variants.length,2);assert.equal(groups[0].map_variants[1].map_image_url,'photo-b');
const gameTitleGroups=registry.groups([{id:'raw-bradley',map_name:'Bradley Forest',map_image_url:'old-map-photo'},{id:'correct-bradlely',map_name:'Bradlely Forest',map_image_url:'new-map-photo'}]);
assert.equal(gameTitleGroups.length,1);assert.equal(gameTitleGroups[0].map_name,'Bradlely Forest');
assert.equal(gameTitleGroups[0].map_variants.length,2);assert(gameTitleGroups[0].map_variants.some(row=>row.id==='raw-bradley'&&row.map_image_url==='old-map-photo'&&row.map_name_original==='Bradley Forest'));
const theglaiaGroups=registry.groups([{id:'raw-theglia',map_name:'Theglia Forest',map_image_url:'retained-theglia-photo'},{id:'correct-theglaia',map_name:'Theglaia Forest',map_image_url:'game-theglaia-photo'}]);
assert.equal(theglaiaGroups.length,1);assert.equal(theglaiaGroups[0].map_name,'Theglaia Forest');assert.equal(theglaiaGroups[0].map_variants.length,2);
assert(theglaiaGroups[0].map_variants.some(row=>row.id==='raw-theglia'&&row.map_image_url==='retained-theglia-photo'&&row.map_name_original==='Theglia Forest'));
const castellaGroups=registry.groups([{id:'raw-costella',map_name:'Costella Forest',map_image_url:'retained-costella-photo'},{id:'correct-castella',map_name:'Castella Forest',map_image_url:'game-castella-photo'}]);
assert.equal(castellaGroups.length,1);assert.equal(castellaGroups[0].map_name,'Castella Forest');assert.equal(castellaGroups[0].map_variants.length,2);
assert(castellaGroups[0].map_variants.some(row=>row.id==='raw-costella'&&row.map_image_url==='retained-costella-photo'&&row.map_name_original==='Costella Forest'));
const elements={};const element=id=>elements[id]||(elements[id]={value:'',innerHTML:'',textContent:'',style:{},querySelectorAll(){return[];},classList:{toggle(){}},setAttribute(){},addEventListener(){}});
context.document={getElementById:element};context.window.XEN_GLOSSARY_CONFIG={};const rpcCalls=[];context.window.supabase={createClient(){return{async rpc(name,args){rpcCalls.push({name,args});return{data:{saved:true,id:'replay-id'}};}};}};
let source=fs.readFileSync(path.join(root,'dist/assets/capture.js'),'utf8');
source=source.slice(0,source.indexOf('  $("route-destination").addEventListener'))+' window.mapTest={set(recordsInput,mapsInput){records=recordsInput.map(canonicalMapRecord);gameMaps=mapsInput.map(canonicalMapRecord);},buildFilters,renderMapDatabase,selectVariant(id){activeMapVariantId=id;renderMapDatabase();},selectedGameMap,canonicalRouteMapName,profileKey,mapWriteName,profileWriteMapName,dialogueReplayRecord,sameDialogueContext,autoSaveAiResult,setProfiles(input){npcProfiles=input.map(canonicalMapRecord);},stubAncillary(){loadRecords=async function(){};rememberKnownNpcSignature=async function(){};renderRecords=function(){};}};})();';
vm.runInContext(source,context);
context.window.mapTest.set([{id:'r1',npc_name:'Officer Jack',map_name:"Arcana's Square"},{id:'r2',npc_name:'Farmer Ocado',map_name:'Arcarinas Square'}],[{id:'a',map_name:'Brunen Basin',map_image_url:'photo-a'},{id:'b',map_name:'Brunnen Basin',map_image_url:'photo-b'}]);
context.window.mapTest.buildFilters();assert.equal((element('map-filter').innerHTML.match(/Arcarinas Square<\/option>/g)||[]).length,1);assert(!element('map-filter').innerHTML.includes("Arcana&#39;s"));
context.window.mapTest.renderMapDatabase();assert.equal((element('map-db-select').innerHTML.match(/Brunen Basin<\/option>/g)||[]).length,1);assert(element('map-db-list').innerHTML.includes('data-map-variant="b"'));
context.window.mapTest.selectVariant('b');assert.equal(context.window.mapTest.selectedGameMap().id,'b');assert(element('map-db-canvas').style.backgroundImage.includes('photo-b'));assert.equal(context.window.mapTest.canonicalRouteMapName('Brynhilld Culvert 1F'),'Brynhilld Culvert 1F');assert.equal(context.window.mapTest.profileKey('Officer Jack',"Arcana's Square"),context.window.mapTest.profileKey('Officer Jack','Arcarinas Square'));
context.window.mapTest.setProfiles([{npc_name:'Officer Jack',map_name:"Arcana's Square",image_url:'old-photo'}]);assert.equal(context.window.mapTest.mapWriteName('Brunnen Basin'),'Brunen Basin');assert.equal(context.window.mapTest.profileWriteMapName('Officer Jack','Arcarinas Square'),"Arcana's Square");assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Officer Jack',map_name:'Arcarinas Square'}).id,'r1');assert.equal(context.window.mapTest.sameDialogueContext({npc_name:'Guard',map_name:'Eir'},{npc_name:'Guard',map_name:'Essene'}),false);
context.window.mapTest.set([{id:'game-map-dialogue',npc_name:'Guard',map_name:'Bradley Forest',english_text:'Forest greeting.'}],[{id:'game-map-original-id',map_name:'Bradley Forest',map_image_url:'retained-photo'}]);
context.window.mapTest.setProfiles([{id:'game-npc-original-id',npc_name:'Guard',map_name:'Bradley Forest',image_url:'retained-npc-photo'}]);
assert.equal(context.window.mapTest.mapWriteName('Bradlely Forest'),'Bradley Forest');
assert.equal(context.window.mapTest.profileWriteMapName('Guard','Bradlely Forest'),'Bradley Forest');
assert.equal(context.window.mapTest.profileKey('Guard','Bradley Forest'),context.window.mapTest.profileKey('Guard','Bradlely Forest'));
assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Guard',map_name:'Bradlely Forest',english_text:'Forest greeting.'}).id,'game-map-dialogue');
context.window.mapTest.set([{id:'theglaia-dialogue',npc_name:'Guard',map_name:'Theglia Forest',english_text:'A forest greeting.'}],[{id:'theglia-original-id',map_name:'Theglia Forest',map_image_url:'retained-map-photo'}]);
context.window.mapTest.setProfiles([{id:'theglia-profile-id',npc_name:'Guard',map_name:'Theglia Forest',image_url:'retained-profile-photo'}]);
assert.equal(context.window.mapTest.mapWriteName('Theglaia Forest'),'Theglia Forest');
assert.equal(context.window.mapTest.profileWriteMapName('Guard','Theglaia Forest'),'Theglia Forest');
assert.equal(context.window.mapTest.profileKey('Guard','Theglia Forest'),context.window.mapTest.profileKey('Guard','Theglaia Forest'));
assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Guard',map_name:'Theglaia Forest',english_text:'A forest greeting.'}).id,'theglaia-dialogue');
context.window.mapTest.set([{id:'castella-dialogue',npc_name:'Guard',map_name:'Costella Forest',english_text:'A castle forest greeting.'}],[{id:'costella-original-id',map_name:'Costella Forest',map_image_url:'retained-map-photo'}]);
context.window.mapTest.setProfiles([{id:'costella-profile-id',npc_name:'Guard',map_name:'Costella Forest',image_url:'retained-profile-photo'}]);
assert.equal(context.window.mapTest.mapWriteName('Castella Forest'),'Costella Forest');
assert.equal(context.window.mapTest.mapWriteName('カステルラの森'),'Costella Forest');
assert.equal(context.window.mapTest.profileWriteMapName('Guard','カステルラの森'),'Costella Forest');
assert.equal(context.window.mapTest.profileKey('Guard','Costella Forest'),context.window.mapTest.profileKey('Guard','カステルラの森'));
assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Guard',map_name:'カステルラの森',english_text:'A castle forest greeting.'}).id,'castella-dialogue');
context.window.mapTest.set([{id:'taisen-dialogue',npc_name:'Guard',map_name:'Toisen Plains',english_text:'A plains greeting.'}],[{id:'toisen-original-id',map_name:'Toisen Plains',map_image_url:'retained-plains-photo'}]);
context.window.mapTest.setProfiles([{id:'toisen-profile-id',npc_name:'Guard',map_name:'Toisen Plains',image_url:'retained-profile-photo'}]);
assert.equal(context.window.mapTest.mapWriteName('Taisen Plains'),'Toisen Plains');
assert.equal(context.window.mapTest.mapWriteName('タイセン沼地'),'Toisen Plains');
assert.equal(context.window.mapTest.profileWriteMapName('Guard','タイセン沼地'),'Toisen Plains');
assert.equal(context.window.mapTest.profileKey('Guard','Toisen Plains'),context.window.mapTest.profileKey('Guard','Taisen Plains'));
assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Guard',map_name:'Taisen Plains',english_text:'A plains greeting.'}).id,'taisen-dialogue');
const mergedCity=registry.groups([{id:'legacy-city',map_name:'Brynhilld',map_image_url:null,updated_at:'2030-01-01'},{id:'actual-expanded',map_name:'Arcarinas Square',map_image_url:'existing-arcarinas-photo',updated_at:'2020-01-01'}]);
assert.equal(mergedCity.length,1);assert.equal(mergedCity[0].id,'actual-expanded');assert.equal(mergedCity[0].map_variants.length,2);
context.window.mapTest.set([{id:'legacy-city-dialogue',npc_name:'Transporter',map_name:'Brynhild',english_text:'Transport greeting.'}],[{id:'legacy-city-map-id',map_name:'Brynhild',map_image_url:'retained-city-photo'}]);
context.window.mapTest.setProfiles([{id:'legacy-city-profile-id',npc_name:'Transporter',map_name:'Brynhild',image_url:'retained-transporter-photo'}]);
assert.equal(context.window.mapTest.mapWriteName('Arcarinas Square'),'Brynhild');
assert.equal(context.window.mapTest.profileWriteMapName('Transporter','Arcarinas Square'),'Brynhild');
assert.equal(context.window.mapTest.profileKey('Transporter','Brinhilld'),context.window.mapTest.profileKey('Transporter','Arcarinas Square'));
assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Transporter',map_name:'Arcarinas Square',english_text:'Transport greeting.'}).id,'legacy-city-dialogue');
const clingonGroups=registry.groups([{id:'legacy-chingon-id',map_name:'Chingon Plains',map_image_url:'retained-plains-photo'},{id:'game-clingon-id',map_name:'Clingon Plains',map_image_url:'game-plains-photo'}]);
assert.equal(clingonGroups.length,1);assert.equal(clingonGroups[0].map_name,'Clingon Plains');
assert(clingonGroups[0].map_variants.some(row=>row.id==='legacy-chingon-id'&&row.map_image_url==='retained-plains-photo'));
context.window.mapTest.set([{id:'chingon-dialogue-id',npc_name:'Guard',map_name:'Chingon Plains',english_text:'Clingon greeting.'}],[{id:'legacy-chingon-id',map_name:'Chingon Plains',map_image_url:'retained-plains-photo'}]);
context.window.mapTest.setProfiles([{id:'chingon-profile-id',npc_name:'Guard',map_name:'Chingon Plains',image_url:'retained-profile-photo'}]);
assert.equal(context.window.mapTest.mapWriteName('Clingon Plains'),'Chingon Plains');
assert.equal(context.window.mapTest.profileWriteMapName('Guard','Clingon Plains'),'Chingon Plains');
assert.equal(context.window.mapTest.dialogueReplayRecord({npc_name:'Guard',map_name:'Clingon Plains',english_text:'Clingon greeting.'}).id,'chingon-dialogue-id');
(async()=>{context.window.mapTest.stubAncillary();context.window.mapTest.set([{id:'replay-id',npc_name:'Officer Jack',map_name:"Arcana's Square",english_text:'Welcome.',dialogue_text_en:'Welcome.',choices_en:[]}],[]);const replay=await context.window.mapTest.autoSaveAiResult({npc_name:'Officer Jack',map_name:'Arcarinas Square',english_text:'Welcome.',dialogue_text_en:'Welcome.',choices_en:[],screen_type:'npc_dialog',confidence:99},'same-screen');assert.equal(replay.id,'replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'replay-id');assert.equal(rpcCalls[0].args.p_map_name,"Arcana's Square");rpcCalls.length=0;
context.window.mapTest.set([{id:'bradlely-replay-id',npc_name:'Guard',map_name:'Bradley Forest',english_text:'Forest greeting.',dialogue_text_en:'Forest greeting.',choices_en:[]}],[{id:'game-map-original-id',map_name:'Bradley Forest',map_image_url:'retained-photo'}]);
const correctedReplay=await context.window.mapTest.autoSaveAiResult({npc_name:'Guard',map_name:'Bradlely Forest',english_text:'Forest greeting.',dialogue_text_en:'Forest greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'game-map-replay');
assert.equal(correctedReplay.id,'bradlely-replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'bradlely-replay-id');assert.equal(rpcCalls[0].args.p_map_name,'Bradley Forest');
rpcCalls.length=0;
context.window.mapTest.set([{id:'theglaia-replay-id',npc_name:'Guard',map_name:'Theglia Forest',english_text:'A forest greeting.',dialogue_text_en:'A forest greeting.',choices_en:[]}],[{id:'theglia-original-id',map_name:'Theglia Forest',map_image_url:'retained-map-photo'}]);
const theglaiaReplay=await context.window.mapTest.autoSaveAiResult({npc_name:'Guard',map_name:'Theglaia Forest',english_text:'A forest greeting.',dialogue_text_en:'A forest greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'theglaia-game-map-replay');
assert.equal(theglaiaReplay.id,'theglaia-replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'theglaia-replay-id');assert.equal(rpcCalls[0].args.p_map_name,'Theglia Forest');
rpcCalls.length=0;
context.window.mapTest.set([{id:'castella-replay-id',npc_name:'Guard',map_name:'Costella Forest',english_text:'A castle forest greeting.',dialogue_text_en:'A castle forest greeting.',choices_en:[]}],[{id:'costella-original-id',map_name:'Costella Forest',map_image_url:'retained-map-photo'}]);
const castellaReplay=await context.window.mapTest.autoSaveAiResult({npc_name:'Guard',map_name:'カステルラの森',english_text:'A castle forest greeting.',dialogue_text_en:'A castle forest greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'castella-game-map-replay');
assert.equal(castellaReplay.id,'castella-replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'castella-replay-id');assert.equal(rpcCalls[0].args.p_map_name,'Costella Forest');
rpcCalls.length=0;
context.window.mapTest.set([{id:'taisen-replay-id',npc_name:'Guard',map_name:'Toisen Plains',english_text:'A plains greeting.',dialogue_text_en:'A plains greeting.',choices_en:[]}],[{id:'toisen-original-id',map_name:'Toisen Plains',map_image_url:'retained-plains-photo'}]);
const taisenReplay=await context.window.mapTest.autoSaveAiResult({npc_name:'Guard',map_name:'Taisen Plains',english_text:'A plains greeting.',dialogue_text_en:'A plains greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'taisen-game-map-replay');
assert.equal(taisenReplay.id,'taisen-replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'taisen-replay-id');assert.equal(rpcCalls[0].args.p_map_name,'Toisen Plains');
rpcCalls.length=0;
context.window.mapTest.set([{id:'merged-city-replay-id',npc_name:'Transporter',map_name:'Brynhild',english_text:'Transport greeting.',dialogue_text_en:'Transport greeting.',choices_en:[]}],[{id:'legacy-city-map-id',map_name:'Brynhild',map_image_url:'retained-city-photo'}]);
const cityReplay=await context.window.mapTest.autoSaveAiResult({npc_name:'Transporter',map_name:'Arcarinas Square',english_text:'Transport greeting.',dialogue_text_en:'Transport greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'city-alias-replay');
assert.equal(cityReplay.id,'merged-city-replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'merged-city-replay-id');assert.equal(rpcCalls[0].args.p_map_name,'Brynhild');
rpcCalls.length=0;
context.window.mapTest.set([{id:'clingon-replay-id',npc_name:'Guard',map_name:'Chingon Plains',english_text:'Clingon greeting.',dialogue_text_en:'Clingon greeting.',choices_en:[]}],[{id:'legacy-chingon-id',map_name:'Chingon Plains',map_image_url:'retained-plains-photo'}]);
const clingonReplay=await context.window.mapTest.autoSaveAiResult({npc_name:'Guard',map_name:'Clingon Plains',english_text:'Clingon greeting.',dialogue_text_en:'Clingon greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'clingon-game-map-replay');
assert.equal(clingonReplay.id,'clingon-replay-id');assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,'clingon-replay-id');assert.equal(rpcCalls[0].args.p_map_name,'Chingon Plains');
for(const [oldName,newName]of [['Rosestar Basin','Rosetar Basin'],['Pladino Grove','Paladino Grove'],['Ashley Forest','Ashely Forest'],['Sylphaen Forest','Shylphaen Forest']]){
 const id='retained-'+newName;rpcCalls.length=0;
 const groups=registry.groups([{id:'raw-map-'+newName,map_name:oldName,map_image_url:'retained-photo'},{id:'game-map-'+newName,map_name:newName,map_image_url:'game-photo'}]);assert.equal(groups.length,1);assert.equal(groups[0].map_variants.length,2);assert(groups[0].map_variants.some(row=>row.id==='raw-map-'+newName&&row.map_name_original===oldName&&row.map_image_url==='retained-photo'));
 context.window.mapTest.set([{id,npc_name:'Guard',map_name:oldName,english_text:newName+' greeting.',dialogue_text_en:newName+' greeting.',choices_en:[]}],[{id:'raw-map-'+newName,map_name:oldName,map_image_url:'retained-photo'}]);context.window.mapTest.setProfiles([{id:'retained-profile-'+newName,npc_name:'Guard',map_name:oldName,image_url:'retained-profile-photo'}]);assert.equal(context.window.mapTest.mapWriteName(newName),oldName);assert.equal(context.window.mapTest.profileWriteMapName('Guard',newName),oldName);
 const replay=await context.window.mapTest.autoSaveAiResult({npc_name:'Guard',map_name:newName,english_text:newName+' greeting.',dialogue_text_en:newName+' greeting.',choices_en:[],screen_type:'npc_dialog',confidence:99},'corrected-map-'+newName);assert.equal(replay.id,id);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'game_knowledge_merge_fragment');assert.equal(rpcCalls[0].args.p_record_id,id);assert.equal(rpcCalls[0].args.p_map_name,oldName);
}
console.log('PASS: game-confirmed spellings and all earlier aliases retain raw map/profile/image keys and real replay IDs.');})().catch(e=>{console.error(e);process.exitCode=1;});
console.log('PASS: '+pairs.length+' aliases/unknown/floor/direction cases, duplicate dropdown grouping, retained photo variants, image switching, profile lookup, conservative route recognition.');
