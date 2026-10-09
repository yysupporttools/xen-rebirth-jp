"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),registrySource=fs.readFileSync(path.join(root,"dist/assets/map-registry.js"),"utf8"),bridgeSource=fs.readFileSync(path.join(root,"dist/assets/map-location.js"),"utf8");
let now=Date.now(),storage=new Map();
function makeContext(){
  const handlers={},events=[];
  const window={localStorage:{getItem(key){return storage.get(key)||null;},setItem(key,value){storage.set(key,value);},removeItem(key){storage.delete(key);}},addEventListener(name,fn){(handlers[name]||(handlers[name]=[])).push(fn);},dispatchEvent(event){events.push(event);for(const fn of handlers[event.type]||[])fn(event);}};
  class Clock extends Date{static now(){return now;}}
  const context={window,localStorage:window.localStorage,Date:Clock,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},console,crypto:{randomUUID(){return "test-device";}}};
  vm.createContext(context);vm.runInContext(registrySource,context);vm.runInContext(bridgeSource,context);
  context.event=(name,data)=>{for(const fn of handlers[name]||[])fn(data);};context.events=events;
  return context;
}
const a=makeContext(),b=makeContext(),api=a.window.XenMapLocation;
assert.equal(api.read(),null);
let calls=0,last=null;const unsubscribe=api.subscribe(value=>{calls++;last=value;});
let value=api.publish({map:"エスネ",mapId:"image-a",x:120,y:230,source:"manual"});
assert.equal(value.map,"Essene");assert.equal(value.x,120);assert.equal(value.at,now);assert.equal(last.map,"Essene");assert.equal(calls,1);assert.equal(a.events.at(-1).type,"xen:map-location");
value.map="altered";assert.equal(api.read().map,"Essene");
for(const invalid of [
 {map:"Unknown",source:"capture",confidence:100},
 {map:"Essene",source:"capture",confidence:69},
 {map:"Essene",source:"capture",confidence:Infinity},
 {map:"Essene",source:"capture",confidence:85,method:"中央マップ名OCR"},
 {map:"Essene",source:"destination",confidence:100},
 {map:123,source:"manual"},
 {map:"Essene\u0000",source:"manual"},
])assert.equal(api.publish(invalid),null);
assert.equal(calls,1);assert.equal(api.read().x,120);
now+=1000;value=api.publish({map:"Essene",mapId:"image-b",source:"capture",confidence:90});assert(!("x" in value));assert(!("y" in value));
value=api.publish({map:"Eir",source:"manual",x:500,y:500});assert(!("x" in value));assert(!("mapId" in value));
value=api.publish({map:"Eir",mapId:"eir-image",source:"manual",x:0,y:1000});assert.equal(value.x,0);assert.equal(value.y,1000);
value=api.publish({map:"Eir",mapId:"eir-image",source:"manual",x:1001,y:100});assert(!("x" in value));assert(!("y" in value));
value=api.publish({map:"Eir",mapId:"eir-image",source:"manual",x:"",y:null});assert(!("x" in value));
let crossCalls=0;b.window.XenMapLocation.subscribe(v=>{crossCalls++;assert.equal(v.map,"Eir");});
b.event("storage",{key:api.storageKey,newValue:storage.get(api.storageKey)});assert.equal(crossCalls,1);assert.equal(b.window.XenMapLocation.read().map,"Eir");
b.event("storage",{key:api.storageKey,newValue:"{broken"});assert.equal(crossCalls,1);
b.event("storage",{key:api.storageKey,newValue:JSON.stringify({map:"Brynhilld",source:"manual",confidence:100,at:now-1000})});assert.equal(crossCalls,1);
b.event("storage",{key:api.storageKey,newValue:JSON.stringify({map:"Brynhilld",source:"manual",confidence:100,at:now+999999})});assert.equal(crossCalls,1);
unsubscribe();const priorCalls=calls;api.clear();assert.equal(api.read(),null);assert.equal(calls,priorCalls);assert(!storage.has("xen-local-current-map-v1"));
storage.set("xen-local-current-map-v1",JSON.stringify({map:"Brynnhild",source:"手動補正",confidence:100,at:now-1000}));const legacy=makeContext();assert.equal(legacy.window.XenMapLocation.read().map,"Brynhilld");assert.equal(legacy.window.XenMapLocation.read().at,now-1000);
storage.clear();storage.set("xen-local-current-map-v1",JSON.stringify({map:"Essene",source:"中央マップ名OCR",confidence:88,at:now}));assert.equal(makeContext().window.XenMapLocation.read(),null);
storage.clear();const blocked=makeContext();blocked.window.localStorage={getItem(){throw Error("blocked");},setItem(){throw Error("blocked");},removeItem(){throw Error("blocked");}};blocked.window.XenMapLocation.publish({map:"Essene",source:"manual"});assert.equal(blocked.window.XenMapLocation.read().map,"Essene");blocked.window.XenMapLocation.clear();assert.equal(blocked.window.XenMapLocation.read(),null);
console.log("PASS: map aliases, validated auto/manual state, normalized coordinates, stale coordinate clearing, old timestamp migration, local and cross-tab events, corrupt/low-confidence storage, blocked storage.");

(async()=>{
  storage.clear();const context=makeContext(),elements={},rpcCalls=[];let uploads=0,fail=false;
  const element=id=>elements[id]||(elements[id]={value:"",textContent:"",innerHTML:"",style:{},options:[],querySelectorAll(){return[];},appendChild(){},classList:{toggle(){}},setAttribute(){},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
  context.document={getElementById:element};
  context.URL=URL;context.window.location={href:"https://example.test/capture.html"};
  context.window.XEN_GLOSSARY_CONFIG={};
  context.window.supabase={createClient(){return{async rpc(name,args){rpcCalls.push({name,args});return fail?{error:{message:"failed"}}:{data:{saved:true,map_id:"original-variant",new_sightings:0}};},storage:{from(){return{async upload(){uploads++;return{};},getPublicUrl(){return{data:{publicUrl:"new-upload"}};}};}}};}};
  let source=fs.readFileSync(path.join(root,"dist/assets/capture.js"),"utf8");
  const handlersAt=source.indexOf('  $("route-destination").addEventListener');
  const currentHandlerAt=source.indexOf('  $("route-current-manual").addEventListener');
  source=source.slice(0,handlersAt)+source.slice(handlersAt,currentHandlerAt)+`
  window.captureTest={
    saveDedicatedMapAnalysis,setLocalCurrentMap,loadLocalMapState,applyRequestedNpcSearch,
    setRecords(rows){records=rows.map(canonicalMapRecord);},
    state(){return {map:routeCurrentMap,source:routeCurrentSource,confidence:routeCurrentConfidence};},
    setup(input,live){gameMaps=input.map(canonicalMapRecord);stream=live?{}:null;},
    stub(){loadMapData=async function(){};isLikelyXenGameFrame=function(){return true;};renderRoutePlanner=function(){};renderMapDatabase=function(){};}
  };})();`;
  vm.runInContext(source,context);
  const test=context.window.captureTest;test.stub();
  const maps=[{id:"preferred-main",map_name:"Brunen Basin",map_image_url:"photo-a",source_image_hash:"other-hash"},{id:"original-variant",map_name:"Brunnen Basin",map_image_url:"photo-b",source_image_hash:"same-hash"}];
  test.setup(maps,false);
  const pack={hash:"same-hash",blob:{},data:{map_visible:true,map_name:"Brunen Basin",confidence:95,npcs:[],panel_region:{x:420,y:0,width:580,height:760}}};
  assert.equal(await test.saveDedicatedMapAnalysis(pack),true);assert.equal(uploads,0);assert.equal(rpcCalls[0].name,"map_analysis_save");assert.equal(rpcCalls[0].args.p_map_name,"Brunnen Basin");assert.equal(rpcCalls[0].args.p_map_image_url,"photo-b");assert.equal(context.window.XenMapLocation.read(),null,"A historical screenshot is not current position");
  test.setup(maps,true);assert.equal(await test.saveDedicatedMapAnalysis(pack),true);assert.equal(context.window.XenMapLocation.read().map,"Brunen Basin");assert.equal(context.window.XenMapLocation.read().mapId,"original-variant");assert.equal(uploads,0);
  const savedAt=context.window.XenMapLocation.read().at;fail=true;now+=1000;await assert.rejects(test.saveDedicatedMapAnalysis(pack),/保存に失敗/);assert.equal(context.window.XenMapLocation.read().at,savedAt);fail=false;
  const before=rpcCalls.length;assert.equal(await test.saveDedicatedMapAnalysis({data:{map_visible:true,map_name:"Essene",confidence:40}}),false);assert.equal(await test.saveDedicatedMapAnalysis({data:{map_visible:true,map_name:"Unknown",confidence:99}}),false);assert.equal(await test.saveDedicatedMapAnalysis({data:{map_visible:false,map_name:"Essene",confidence:99}}),false);assert.equal(rpcCalls.length,before);
  assert.equal(test.setLocalCurrentMap("Essene","中央マップ名OCR",88,true),false);assert.equal(test.setLocalCurrentMap("Essene","ローカル拡大マップ照合",66,true),false);assert.equal(test.setLocalCurrentMap("Unknown","拡大マップの保存",95,true),false);assert.equal(context.window.XenMapLocation.read().map,"Brunen Basin");
  assert.equal(test.setLocalCurrentMap("エスネ","手動補正",100,true),true);assert.equal(context.window.XenMapLocation.read().map,"Essene");assert.equal(context.window.XenMapLocation.read().source,"manual");
  test.setup(maps,false);element("route-destination").value="Eir";element("route-destination").handlers.change.call(element("route-destination"));assert.equal(context.window.XenMapLocation.read().map,"Essene","Selecting a destination never changes current location");

  test.setRecords([{npc_name:"Guard",map_name:"Eir"},{npc_name:"Guard",map_name:"Arcana's Square"}]);
  context.window.location.href="https://example.test/capture.html?npc=Guard&map=Arcana%27s+Square#npc-database";
  assert.equal(test.applyRequestedNpcSearch(),true);assert.equal(element("knowledge-search").value,"Guard");assert.equal(element("map-filter").value,"Arcarinas Square");assert.equal(context.window.XenMapLocation.read().map,"Essene","A query target is never the current location");
  context.window.location.href="https://example.test/capture.html?npc=Event+Guide&map=Aisen#npc-database";
  assert.equal(test.applyRequestedNpcSearch(),true);assert.equal(element("map-filter").value,"Aisen");assert(element("map-filter").innerHTML.includes("会話未登録"));assert.equal(context.window.XenMapLocation.read().map,"Essene");
  context.window.location.href="https://example.test/capture.html?npc="+encodeURIComponent("Guard\u0000");
  assert.equal(test.applyRequestedNpcSearch(),false);assert.equal(element("knowledge-search").value,"Event Guide");
  context.window.location.href="https://example.test/capture.html?nav=1";assert.equal(test.applyRequestedNpcSearch(),false);
  context.window.XenMapLocation.publish({map:"Brynnhild",source:"manual"});test.loadLocalMapState();assert.equal(test.state().map,"Brynhilld");
  console.log("PASS: real capture dedicated-save path reuses original hash, map variant and raw key; failed/low-confidence saves do not publish current position; live recognized maps publish; historical uploads and destinations do not.");
})().catch(error=>{console.error(error);process.exitCode=1;});
