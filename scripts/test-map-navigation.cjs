"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const context=vm.createContext({console});context.window=context;
for(const name of ["map-registry.js","world-routes.js","map-transports.js","map-navigation.js"]){
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../dist/assets",name),"utf8"),context,{filename:name});
}
const nav=context.XenMapNavigation,transports=context.XEN_MAP_TRANSPORTS,world=context.XEN_WORLD_ROUTES;
let checks=0;
function check(name,fn){fn();checks++;console.log("PASS: "+name);}
const emptyWorld={nodes:[],edges:[]};
check("verified transport lists have exactly 50 directed edges and eight origins",()=>{
  assert.equal(transports.edges.length,50);
  assert.equal(new Set(transports.edges.map(e=>e.a)).size,8);
  assert(transports.edges.every(e=>e.directed===true&&e.kind==="transporter"&&e.verified===true));
  assert.equal(new Set(transports.edges.map(e=>e.a+"|"+e.b)).size,50);
});
check("all explicitly provided destination level gates are preserved",()=>{
  const expected={
    "Essene":{"Arcarinas Square":1,"Midori Spa":55,"Jotunheim":60,"Abundance Town":30,"Albatross City":35,"Eir":40,"Candy Vault":25},
    "Arcarinas Square":{"Essene":16,"Midori Spa":55,"Jotunheim":60,"Abundance Town":30,"Albatross City":35,"Eir":40,"Candy Vault":25},
    "Abundance Town":{"Essene":16,"Arcarinas Square":1,"Midori Spa":55,"Jotunheim":60,"Eir":40,"Candy Vault":25},
    "Midori Spa":{"Essene":16,"Arcarinas Square":1,"Jotunheim":60,"Yvel":100,"Eir":40,"Candy Vault":25,"Abundance Town":30},
    "Jotunheim":{"Essene":16,"Arcarinas Square":1,"Midori Spa":55,"Yvel":100,"Eir":40,"Candy Vault":25,"Abundance Town":30},
    "Yvel":{"Jotunheim":60},
    "Candy Vault":{"Essene":16,"Arcarinas Square":1,"Midori Spa":55,"Jotunheim":60,"Eir":40,"Abundance Town":30},
    "Eir":{"Essene":16,"Arcarinas Square":1,"Midori Spa":55,"Town of Deceased":100,"Jotunheim":60,"Candy Vault":25,"Abundance Town":30,"Albatross City":35,"Oasis":80}
  };
  for(const [origin,destinations] of Object.entries(expected)){
    const actual=Object.fromEntries(transports.edges.filter(e=>e.a===origin).map(e=>[e.b,e.minLevel]));
    assert.deepEqual(actual,destinations);
  }
});
check("Essene to Brynhilld Lv1 and return Essene Lv16 retain different gates",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  assert.equal(nav.findRoute(graph,"Essene","Brynhild",{level:1}).steps[0].minLevel,1);
  assert.equal(nav.findRoute(graph,"Brynhild","Essene",{level:15}),null);
  assert.equal(nav.findRoute(graph,"Brynhild","Essene",{level:16}).steps[0].minLevel,16);
});
check("Yvel offers exactly its verified Jotunheim direction, not inferred returns",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  assert.deepEqual(Array.from(graph.get("Yvel"),e=>e.to),["Jotunheim"]);
  assert.equal(nav.findRoute(graph,"Yvel","Jotunheim",{level:59}),null);
  assert.equal(nav.findRoute(graph,"Yvel","Jotunheim",{level:60}).steps[0].minLevel,60);
  assert.equal(graph.get("Albatross City").length,0);
});
check("transports disabled excludes both town services and airship stages",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert(!graph.edges.some(e=>e.kind==="transporter"||e.kind==="transport"));
  assert(graph.edges.some(e=>e.kind==="dock"));
  assert(graph.edges.some(e=>e.kind==="dungeon"));
});
check("documented airship dock stage stays directed after Garcia route override",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:true});
  const stages=graph.edges.filter(e=>e.kind==="transport");
  assert.equal(stages.length,1);
  assert.equal(stages[0].from,"Airship Boarding Gate");
  assert.equal(stages[0].to,"Floating Island of Dragons Dock");
  assert(!stages.some(e=>e.to==="Essene"||e.from==="Floating Island of Dragons Dock"));
});

check("unverified generic town transport edge is ignored",()=>{
  const graph=nav.buildGraph({nodes:["Eir","Oasis"],edges:[{a:"Eir",b:"Oasis",kind:"transport"}]},[],{transports:{edges:[]}});
  assert.equal(nav.findRoute(graph,"Eir","Oasis"),null);
});
check("canonical aliases support Japanese and different spellings without floor merges",()=>{
  assert.equal(nav.canonicalMapName("エスネ"),"Essene");
  assert.equal(nav.canonicalMapName("Village of Abundance"),"Abundance Town");
  assert.equal(nav.canonicalMapName("Albatross Village"),"Albatross City");
  assert.equal(nav.canonicalMapName("candyvault"),"Candy Vault");
  assert.equal(nav.canonicalMapName("Brynhild"),"Arcarinas Square");
  assert.notEqual(nav.canonicalMapName("Brynhilld Culvert B1F"),nav.canonicalMapName("Brynhilld Culvert B2F"));
});
check("normal world graph retains explicit edges and has no guessed unknown connection",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.deepEqual(Array.from(nav.findRoute(graph,"Arcana's Square","Summerhill Street").path),["Arcarinas Square","Summer Hill Street"]);
  assert.equal(nav.findRoute(graph,"Unknown Forest","Essene"),null);
  assert.equal(nav.findRoute(graph,"Essene","Unknown Forest"),null);
  assert.equal(nav.findRoute(graph,"Unknown Forest","Unknown Forest"),null);
});
check("duplicate gated edge cannot bypass its Lv30 restriction",()=>{
  const graph=nav.buildGraph({nodes:[],edges:[{a:"Candy Vault",b:"Alicia Forest"},{a:"Candy Vault",b:"Alicia Forest",minLevel:30,note:"L30+"}]},[],{includeTransports:false,transports:{edges:[]}});
  assert.equal(graph.edges.length,2);
  assert.equal(nav.findRoute(graph,"Candy Vault","Alicia Forest",{level:29}),null);
  const allowed=nav.findRoute(graph,"Candy Vault","Alicia Forest",{level:30});
  assert.equal(allowed.requiredLevel,30);assert.equal(allowed.steps[0].condition,"L30+");
  const restricted=nav.findRoute(graph,"Candy Vault","Alicia Forest",{level:29,ignoreLevel:true});
  assert.equal(restricted.restricted,true);
});
check("optional level retains condition in every step",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  const route=nav.findRoute(graph,"Midori Spa","Yvel",{});
  assert.equal(route.steps[0].minLevel,100);assert.match(route.steps[0].condition,/100/);
  assert.equal(route.steps[0].source,"利用者のゲーム内確認");assert.equal(route.steps[0].landingPointKnown,false);
});
check("merged city aliases retain distinct districts and confirmed Summer Hill departures",()=>{
  const graph=nav.buildGraph(world,[],{transports});
  const edge=graph.get("Arcarinas Square").find(e=>e.to==="Eir"&&e.kind==="transporter");
  assert.equal(edge.sourceTown,"Arcarinas Square");assert.equal(edge.minLevel,40);
  assert.equal(nav.findRoute(graph,"Brynhilld","Eir",{level:40}).steps[0].kind,"transporter");
  assert.deepEqual(Array.from(nav.findRoute(graph,"Brinhilld","Arcarinas Square",{level:1}).path),["Arcarinas Square"]);
  assert(!graph.nodes.includes("Brynhilld"));assert(!graph.get("Arcarinas Square").some(e=>e.to==="Arcarinas Square"));
  assert(graph.get("Arcarinas Square").some(e=>e.to==="Summer Hill Street"&&e.kind==="normal"));
  assert(graph.get("Summer Hill Street").some(e=>e.to==="Eir"&&e.kind==="transporter"));
  assert.deepEqual(Array.from(transports.cityOriginMaps["Arcarinas Square"]),["Summer Hill Street"]);
});

check("source city transporter uses only exact saved point on Summer Hill variant",()=>{
  const maps=[{id:"summer",map_name:"Summerhill Street",map_image_url:"summer.webp"}];
  const rows=[{id:"npc",map_id:"summer",npc_name:"Transporter",x_norm:"223",y_norm:"340"}];
  const graph=nav.buildGraph(emptyWorld,[],{transports,maps,mapNpcs:rows});
  const summer=graph.get("Summer Hill Street").find(e=>e.to==="Eir");
  assert.equal(summer.exit.x,223);assert.equal(summer.exit.y,340);
  assert.equal(graph.get("Arcarinas Square").find(e=>e.to==="Eir").exit,null);
});
check("map groups preserve both original image IDs and linked NPC coordinates",()=>{
  const maps=[{id:"one",map_name:"Brunen Basin",map_image_url:"one.webp"},{id:"two",map_name:"Brunnen Basin",map_image_url:"two.webp"}];
  const groups=nav.groupMaps(maps);
  assert.equal(groups.length,1);assert.equal(groups[0].map_variants.length,2);
  const rows=[{map_id:"one",npc_name:"A",x_norm:10,y_norm:20},{map_id:"two",npc_name:"B",x_norm:30,y_norm:40},{map_id:"unrelated",npc_name:"C"}];
  assert.equal(nav.linkedNpcRows(groups[0],rows).length,2);
  assert.equal(nav.selectExit({from:"Brunen Basin",to:"B"},maps[0],rows),null);
});
check("Essene screenshot East Gate destination matches registered exact gate coordinate",()=>{
  const map={id:"essene",map_name:"Essene"};
  const npcs=[{id:"east",map_id:"essene",npc_name:"East Gate",x_norm:"895.17",y_norm:"423.67"}];
  const graph=nav.buildGraph(world,[],{includeTransports:false,maps:[map],mapNpcs:npcs});
  const step=graph.get("Essene").find(e=>e.to==="Evergal Grove");
  assert.equal(step.exit.x,895.17);assert.equal(step.exit.y,423.67);
  assert.equal(nav.selectExit(graph.get("Essene").find(e=>e.to==="Engrave Path"),map,npcs),null);
});
check("NPC/exit name matching never fuzzily invents coordinates",()=>{
  const map={id:"eir",map_name:"Eir"};
  const rows=[{map_id:"eir",npc_name:"Titanus Merchant",x_norm:500,y_norm:500}];
  assert.equal(nav.selectExit({from:"Eir",to:"Titanus Plains"},map,rows),null);
  rows.push({map_id:"eir",npc_name:"Exit (Titans Plains)",x_norm:0,y_norm:1000});
  assert.equal(nav.selectExit({from:"Eir",to:"Titanus Plains"},map,rows).x,0);
});
check("conflicting exact saved coordinates remain unresolved",()=>{
  const rows=[{map_id:"eir",npc_name:"Titanus Plains",x_norm:100,y_norm:100},{map_id:"eir",npc_name:"Titans Plains",x_norm:900,y_norm:900}];
  assert.equal(nav.selectExit({from:"Eir",to:"Titanus Plains"},{id:"eir",map_name:"Eir"},rows),null);
});
check("manual exit points bind to map ID and original image",()=>{
  const map={id:"essene",map_name:"Essene",map_image_url:"new.webp",source_image_hash:"new"};
  const step={from:"Essene",to:"Eir",kind:"transporter",exit:{map_id:"essene",x:250,y:650,map_image_url:"new.webp",source_image_hash:"new"}};
  assert.equal(nav.selectExit(step,map,[]).x,250);
  step.exit.map_image_url="old.webp";assert.equal(nav.selectExit(step,map,[]),null);
  step.exit.map_image_url="new.webp";step.exit.map_id="other";assert.equal(nav.selectExit(step,map,[]),null);
});
check("blank, null, non-finite and out-of-image coordinates are rejected",()=>{
  for(const value of [null,undefined,"",NaN,Infinity,-1,1001,"not a number"]) assert.equal(nav.validCoordinate(value),null);
  assert.equal(nav.validCoordinate(0),0);assert.equal(nav.validCoordinate("1000"),1000);
});
check("verified learned spatial edges stay directed and dialogue branches are ignored",()=>{
  const graph=nav.buildGraph(emptyWorld,[
    {from_map:"Unknown Forest",to_map:"Essene",verified:true,note:"confirmed exit"},
    {from_map:"Essene",to_map:"Fake Forest"},
    {from_record_id:"dialogue-a",to_record_id:"dialogue-b",verified:true}
  ],{includeTransports:false});
  assert(nav.findRoute(graph,"Unknown Forest","Essene"));
  assert.equal(nav.findRoute(graph,"Essene","Unknown Forest"),null);
  assert.equal(nav.findRoute(graph,"Essene","Fake Forest"),null);
  assert(!graph.nodes.includes("dialogue-a"));
});
check("explicit bidirectional learned edge preserves separate exit points",()=>{
  const graph=nav.buildGraph(emptyWorld,[{from:"A",to:"B",source:"manual",bidirectional:true,
    exit:{map_id:"a",x:100,y:200},returnExit:{map_id:"b",x:900,y:800}}],{includeTransports:false});
  assert.equal(nav.findRoute(graph,"A","B").steps[0].exit.map_id,"a");
  assert.equal(nav.findRoute(graph,"B","A").steps[0].exit.map_id,"b");
});
check("name search folds accents and width while preserving Japanese",()=>{
  assert.equal(nav.searchKey("Éir"),nav.searchKey("Eir"));assert.equal(nav.searchKey("Ｔransporter"),nav.searchKey("Transporter"));
  assert.equal(nav.searchKey("エ ス ネ"),"エスネ");assert.equal(nav.searchKey(null),"");
});
check("Oasis and Albatross have incoming travel only and no Transporter service",()=>{
  assert.deepEqual(Array.from(transports.noTransporterTowns),["Oasis","Albatross City"]);
  assert(!transports.edges.some(e=>e.a==="Oasis"||e.a==="Albatross City"));
  assert.equal(transports.edges.find(e=>e.a==="Eir"&&e.b==="Oasis").minLevel,80);
  assert.equal(transports.edges.find(e=>e.a==="Essene"&&e.b==="Albatross City").minLevel,35);
});
check("unverified Town of Deceased identity stays separate and no guessed foot route exists",()=>{
  assert.equal(nav.canonicalMapName("Town of Deceased"),"Town of Deceased");
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.equal(nav.findRoute(graph,"Town of Deceased","Village of the Dead"),null);
  const service=transports.edges.find(e=>e.a==="Eir"&&e.b==="Town of Deceased");
  assert.equal(service.minLevel,100);
});

check("NPC-specific service data contains all four distinct Library destinations and Garcia",()=>{
  assert.equal(transports.specialRoutes.length,7);
  assert.deepEqual(Array.from(transports.specialRoutes.filter(e=>e.npcName==="Logather"),e=>e.b),["Library","Library B2","Library B4","Library room"]);
  assert(transports.specialRoutes.every(e=>e.directed&&e.verified&&(e.kind==="npc-transport"||e.kind==="event-transport")));
  assert.equal(transports.specialRoutes.find(e=>e.b==="Library B2").costKron,5000);
  assert.equal(transports.specialRoutes.find(e=>e.b==="Library B4").costKron,10000);
});
check("Logather requires Lv70 and Library Card and never infers a return",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  assert.equal(nav.findRoute(graph,"Essene","Library B2",{level:70,items:[]}),null);
  assert.equal(nav.findRoute(graph,"Essene","Library B2",{level:69,items:["Library Card"]}),null);
  const allowed=nav.findRoute(graph,"Essene","Library B2",{level:70,items:new Set(["Library Card"])});
  assert.equal(allowed.steps[0].npcName,"Logather");assert.equal(allowed.steps[0].costKron,5000);
  assert.equal(allowed.requiredLevel,70);assert.deepEqual(Array.from(allowed.requiredItems),["Library Card"]);
  assert.equal(nav.findRoute(graph,"Library B2","Essene",{level:200,items:["Library Card"]}),null);
});
check("unknown Library Card possession is labeled while explicit missing card is reported",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  const unknown=nav.findRoute(graph,"Essene","Library");
  assert.deepEqual(Array.from(unknown.requiredItems),["Library Card"]);assert.equal(unknown.restrictedItems,false);
  const blocked=nav.findRoute(graph,"Essene","Library",{level:70,items:[],ignoreConditions:true});
  assert.equal(blocked.restricted,true);assert.equal(blocked.restrictedItems,true);
  assert.deepEqual(Array.from(blocked.missingItems),["Library Card"]);
});
check("Library floors and room are not interchangeable nodes",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  for(const name of ["Library","Library B2","Library B4","Library room"]) assert.equal(nav.canonicalMapName(name),name);
  assert.equal(nav.findRoute(graph,"Library B2","Library B4",{level:200,items:["Library Card"]}),null);
});
check("specific NPC arrows require exact Logather position on selected image",()=>{
  const map={id:"essene",map_name:"Essene",map_image_url:"essene.webp"};
  const rows=[{map_id:"essene",npc_name:"Logather",x_norm:210,y_norm:330},{map_id:"other",npc_name:"Logather",x_norm:810,y_norm:930}];
  const graph=nav.buildGraph(emptyWorld,[],{transports,maps:[map],mapNpcs:rows});
  const step=nav.findRoute(graph,"Essene","Library",{level:70,items:["Library Card"]}).steps[0];
  assert.equal(nav.selectExit(step,map,rows).x,210);
  assert.equal(nav.selectExit(step,{id:"variant",map_name:"Essene",map_image_url:"variant.webp"},rows),null);
});
check("Garcia prerequisite cannot be bypassed through old Airship Boarding Gate route",()=>{
  const graph=nav.buildGraph(world,[],{transports});
  assert(!graph.get("Essene").some(e=>e.to==="Airship Boarding Gate"&&e.kind==="transport"));
  assert.equal(nav.findRoute(graph,"Essene","Shipdock",{level:100,flags:[]}),null);
  assert.equal(nav.findRoute(graph,"Essene","Shipdock",{level:99,flags:["garciaQuest"]}),null);
  const allowed=nav.findRoute(graph,"Essene","Shipdock",{level:100,flags:["garciaQuest"]});
  assert.equal(allowed.steps[0].npcName,"Expedition Transporter Garcia");
  assert.equal(allowed.steps[0].costKron,15000);assert.equal(allowed.steps[0].feeKron,15000);
  assert.deepEqual(Array.from(allowed.steps[0].requiredFlags),["garciaQuest"]);
  assert.equal(nav.findRoute(graph,"Shipdock","Essene",{level:200,flags:["garciaQuest"]}),null);
});
check("Garcia flag supports arrays, Sets and explicit completed boolean objects",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  for(const flags of [["garciaQuest"],new Set(["garciaQuest"]),{garciaQuest:true}]){
    assert(nav.findRoute(graph,"Essene","Shipdock",{level:100,flags}));
  }
  for(const flags of [[],new Set(),{garciaQuest:false},{garciaQuest:"true"}]){
    assert.equal(nav.findRoute(graph,"Essene","Shipdock",{level:100,flags}),null);
  }
  const blocked=nav.findRoute(graph,"Essene","Shipdock",{level:100,flags:[],ignoreConditions:true});
  assert.equal(blocked.restrictedFlags,true);assert.equal(blocked.restricted,true);
  assert.deepEqual(Array.from(blocked.missingFlags),["garciaQuest"]);
});
check("Eir to Midori Spa Lv55 is now confirmed",()=>{
  const edge=transports.edges.find(e=>e.a==="Eir"&&e.b==="Midori Spa");
  assert.equal(edge.minLevel,55);assert.equal(edge.levelConfirmation,"確認済み");assert(!edge.condition.includes("要確認"));
});

check("specific NPC service never substitutes a similarly named walking portal",()=>{
  const map={id:"essene",map_name:"Essene"};
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  const step=nav.findRoute(graph,"Essene","Library",{level:70,items:["Library Card"]}).steps[0];
  assert.equal(nav.selectExit(step,map,[{map_id:"essene",npc_name:"Library",x_norm:500,y_norm:500}]),null);
});

check("Aisen Event Guide route requires manual server-weekend confirmation",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  assert.equal(nav.findRoute(graph,"Essene","Aisen",{flags:[]}),null);
  const allowed=nav.findRoute(graph,"Essene","Aisen",{flags:["fourSeasonsWeekend"]});
  const step=allowed.steps[0];
  assert.equal(step.kind,"event-transport");assert.equal(step.npcName,"Event Guide");
  assert.deepEqual(Array.from(step.schedule.days),[0,6]);assert.equal(step.schedule.timeZone,undefined);
  assert.match(step.condition,/サーバー時間の土日/);
  assert.equal(step.minLevel,null);assert.equal(step.costKron,null);
  assert.equal(nav.findRoute(graph,"Aisen","Essene",{flags:["fourSeasonsWeekend"]}),null);
});
check("weekday-only or unrelated flags do not authorize the Four Seasons route",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  assert.equal(nav.findRoute(graph,"Essene","Aisen",{flags:["garciaQuest"]}),null);
  assert.equal(nav.findRoute(graph,"Essene","Aisen",{flags:{fourSeasonsWeekend:false}}),null);
  const blocked=nav.findRoute(graph,"Essene","Aisen",{flags:[],ignoreConditions:true});
  assert.deepEqual(Array.from(blocked.missingFlags),["fourSeasonsWeekend"]);assert.equal(blocked.restrictedFlags,true);
  assert.equal(nav.findRoute(nav.buildGraph(emptyWorld,[],{transports,includeTransports:false}),"Essene","Aisen",{flags:["fourSeasonsWeekend"]}),null);
});
check("Event Guide arrows bind exact named saved point and never substitute an Aisen portal",()=>{
  const map={id:"essene",map_name:"Essene"};
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  const step=nav.findRoute(graph,"Essene","Aisen",{flags:["fourSeasonsWeekend"]}).steps[0];
  assert.equal(nav.selectExit(step,map,[{map_id:"essene",npc_name:"Aisen",x_norm:500,y_norm:500}]),null);
  const found=nav.selectExit(step,map,[{map_id:"essene",npc_name:"Event Guide",x_norm:664.83,y_norm:118.5}]);
  assert.equal(found.x,664.83);assert.equal(found.y,118.5);
});

check("Officer Jack provides directed Pirates Ship dock route without invented conditions",()=>{
  const graph=nav.buildGraph(emptyWorld,[],{transports});
  const route=nav.findRoute(graph,"Arcarinas Square","Pirates Ship dock",{level:1,items:[],flags:[]});
  assert(route);assert.equal(route.steps[0].npcName,"Officer Jack");assert.equal(route.steps[0].minLevel,null);
  assert.deepEqual(Array.from(route.steps[0].requiredItems),[]);assert.deepEqual(Array.from(route.steps[0].requiredFlags),[]);
  assert.equal(nav.findRoute(graph,"Pirates Ship dock","Arcarinas Square",{level:200,items:[],flags:[]}),null);
  assert.notEqual(nav.canonicalMapName("Pirates Ship dock"),nav.canonicalMapName("Pirate Ship"));
  assert.deepEqual(Array.from(transports.noExpandedMapMaps),["Pirates Ship dock","Brynhilld Culvert"]);
});
check("Officer Jack arrow uses the registered original-map NPC point",()=>{
  const map={id:"square",map_name:"Arcarinas Square"};
  const rows=[{map_id:"square",npc_name:"Officer Jack",x_norm:515,y_norm:630}];
  const graph=nav.buildGraph(emptyWorld,[],{transports,maps:[map],mapNpcs:rows});
  const step=nav.findRoute(graph,"Arcarinas Square","Pirates Ship dock",{level:1,items:[],flags:[]}).steps[0];
  assert.equal(step.exit.x,515);assert.equal(step.exit.y,630);
  assert.equal(nav.selectExit(step,{id:"other",map_name:"Arcarinas Square"},rows),null);
});
check("repeated canonical unknown-map lookups resolve once and respect registry replacement",()=>{
  const original=context.XEN_MAP_REGISTRY;let calls=0;
  context.XEN_MAP_REGISTRY=Object.assign({},original,{resolve(value){calls++;return original.resolve(value);}});
  for(let i=0;i<50;i++) assert.equal(nav.canonicalMapName("Unknown Faraway Vale"),"Unknown Faraway Vale");
  assert.equal(calls,1);
  context.XEN_MAP_REGISTRY=Object.assign({},original,{resolve(value){return value==="Unknown Faraway Vale"?"Replacement Registered Map":original.resolve(value);}});
  assert.equal(nav.canonicalMapName("Unknown Faraway Vale"),"Replacement Registered Map");
  context.XEN_MAP_REGISTRY=original;
  assert.equal(nav.canonicalMapName("Unknown Faraway Vale"),"Unknown Faraway Vale");
});

check("Mall Street upper-right dungeon entrance works without transport services",()=>{
  const graph=nav.buildGraph(world,[],{transports,includeTransports:false});
  const route=nav.findRoute(graph,"Mall Street","Brynhilld Culvert",{level:1,items:[],flags:[]});
  assert(route);assert.equal(route.steps.length,1);const step=route.steps[0];
  assert.equal(step.kind,"dungeon");assert.equal(step.direction,"top-right");
  assert.equal(step.minLevel,null);assert.equal(step.costKron,null);assert.equal(step.npcName,"");
  assert.match(step.condition,/右上/);assert.equal(transports.extraConnections.length,1);
  assert(transports.noExpandedMapMaps.includes("Brynhilld Culvert"));
  assert.equal(nav.findRoute(graph,"Brynhilld Culvert","Mall Street",{level:200,items:[],flags:[]}),null);
});
check("Culvert floors stay separate and direction does not invent a coordinate",()=>{
  const graph=nav.buildGraph(world,[],{transports,includeTransports:false});
  const step=nav.findRoute(graph,"Mall Street","Brynhilld Culvert").steps[0];
  assert.notEqual(nav.canonicalMapName("Brynhilld Culvert"),nav.canonicalMapName("Brynhilld Culvert B1F"));
  assert.equal(nav.findRoute(graph,"Brynhilld Culvert","Brynhilld Culvert B1F"),null);
  assert.equal(nav.selectExit(step,{id:"mall",map_name:"Mall Street"},[]),null);
});
check("Culvert uses only exact registered exit alias, never ambiguous Quarter OCR label",()=>{
  const map={id:"mall",map_name:"Mall Street"};
  const graph=nav.buildGraph(world,[],{transports,includeTransports:false});
  const step=nav.findRoute(graph,"Mall Street","Brynhilld Culvert").steps[0];
  const known=nav.selectExit(step,map,[{map_id:"mall",npc_name:"Brynhild Culvert",x_norm:918.33,y_norm:248.67}]);
  assert.equal(known.x,918.33);assert.equal(known.y,248.67);
  assert.equal(nav.selectExit(step,map,[{map_id:"mall",npc_name:"Brynhild Quarter",x_norm:915,y_norm:217}]),null);
});

check("game-confirmed Bradlely Forest replaces prior typo without altering known routes or floors",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.equal(nav.canonicalMapName("Bradley Forest"),"Bradlely Forest");
  assert(graph.nodes.includes("Bradlely Forest"));assert(!graph.nodes.includes("Bradley Forest"));
  const route=nav.findRoute(graph,"Bradley Forest","Kryston Forest");
  assert.deepEqual(Array.from(route.path),["Bradlely Forest","Kryston Forest"]);
  assert.deepEqual(Array.from(nav.findRoute(graph,"Bradlely Forest","Belpharen Forest").path),["Bradlely Forest","Belpharen Forest"]);
  assert.equal(nav.canonicalMapName("Bradley Forest B1F"),"Bradley Forest B1F");
  const maps=[{id:"old-bradley-id",map_name:"Bradley Forest",map_image_url:"old-photo"},{id:"new-bradlely-id",map_name:"Bradlely Forest",map_image_url:"new-photo"}];
  const grouped=nav.groupMaps(maps);assert.equal(grouped.length,1);
  assert(grouped[0].map_variants.some(row=>row.id==="old-bradley-id"&&row.map_image_url==="old-photo"));
});

check("game-confirmed Theglaia Forest resolves prior typo with original IDs and route links",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.equal(nav.canonicalMapName("Theglia Forest"),"Theglaia Forest");
  assert(graph.nodes.includes("Theglaia Forest"));assert(!graph.nodes.includes("Theglia Forest"));
  assert.deepEqual(Array.from(nav.findRoute(graph,"Theglia Forest","Bernald Forest").path),["Theglaia Forest","Bernald Forest"]);
  assert.deepEqual(Array.from(nav.findRoute(graph,"Theglaia Forest","Othellos Forest").path),["Theglaia Forest","Othellos Forest"]);
  assert.equal(nav.canonicalMapName("Theglia Forest B1F"),"Theglia Forest B1F");
  const maps=[{id:"raw-theglia-id",map_name:"Theglia Forest",map_image_url:"original-photo"},{id:"game-theglaia-id",map_name:"Theglaia Forest",map_image_url:"game-photo"}];
  const grouped=nav.groupMaps(maps);assert.equal(grouped.length,1);
  assert(grouped[0].map_variants.some(row=>row.id==="raw-theglia-id"&&row.map_image_url==="original-photo"));
});

check("game-confirmed Castella Forest and old Japanese names preserve route nodes and raw IDs",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.equal(nav.canonicalMapName("Costella Forest"),"Castella Forest");assert(graph.nodes.includes("Castella Forest"));assert(!graph.nodes.includes("Costella Forest"));
  assert.deepEqual(Array.from(nav.findRoute(graph,"ロエムの谷","カステルラの森").path),["Loem Valley","Castella Forest"]);
  assert.deepEqual(Array.from(nav.findRoute(graph,"Castella Forest","Callisto Gorge").path),["Castella Forest","Callisto Gorge"]);
  assert.equal(nav.canonicalMapName("Costella Forest B1F"),"Costella Forest B1F");assert.equal(nav.canonicalMapName("カステルラの森 B1F"),"カステルラの森 B1F");
  const grouped=nav.groupMaps([{id:"raw-costella-id",map_name:"Costella Forest",map_image_url:"original-photo"},{id:"game-castella-id",map_name:"Castella Forest",map_image_url:"game-photo"}]);assert.equal(grouped.length,1);
  assert(grouped[0].map_variants.some(row=>row.id==="raw-costella-id"&&row.map_image_url==="original-photo"));
});
check("reviewed old Japanese labels keep English primary and leave unknown names unchanged",()=>{
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../dist/assets/map-japanese-names.js"),"utf8"),context);
  assert.equal(context.XEN_MAP_JAPANESE_NAME_META.label,"旧日本語名");
  assert.equal(context.XEN_MAP_JAPANESE_NAME_META.source.kind,"user-provided-old-japanese-map");
  assert.equal(context.XEN_MAP_JAPANESE_NAMES["Kryston Forest"],"クリスタンの森");
  assert.equal(context.XenMapJapaneseNames.get("Costella Forest"),"カステルラの森");
  assert.equal(context.XenMapJapaneseNames.mapLabel("カステルラの森"),"Castella Forest（旧日本語名：カステルラの森）");
  assert.equal(context.XenMapJapaneseNames.get("Unknown Floor"),"");assert.equal(context.XenMapJapaneseNames.mapLabel("Unknown Floor"),"Unknown Floor");
  assert.equal(nav.canonicalMapName("氷の迷宮"),"氷の迷宮");
});
check("all curated Japanese map aliases are unique and source reviewed",()=>{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,"../dist/assets/map-japanese-names.json"),"utf8"));
  assert.equal(Object.keys(data.names).length,102);
  assert.equal(new Set(Object.values(data.names)).size,102);
  for(const [english,japanese] of Object.entries(data.names)){assert.equal(nav.canonicalMapName(japanese),english);assert(world.nodes.includes(english));}
  assert.equal(nav.canonicalMapName("北ブリンヒルド"),"Guild Plaza");
  assert.equal(nav.canonicalMapName("南ブリンヒルド"),"Arcarinas Square");
  assert.equal(nav.canonicalMapName("西ブリンヒルド"),"Mall Street");
  assert.equal(nav.canonicalMapName("東ブリンヒルド"),"Summer Hill Street");
});

check("game-confirmed Taisen Plains preserves Toisen records, routes and reviewed Japanese name",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.equal(nav.canonicalMapName("Toisen Plains"),"Taisen Plains");assert.equal(nav.canonicalMapName("タイセン沼地"),"Taisen Plains");
  assert(graph.nodes.includes("Taisen Plains"));assert(!graph.nodes.includes("Toisen Plains"));
  assert.deepEqual(Array.from(nav.findRoute(graph,"Toisen Plains","Realto Plains").path),["Taisen Plains","Realto Plains"]);
  assert.deepEqual(Array.from(nav.findRoute(graph,"タイセン沼地","Lombard Plains").path),["Taisen Plains","Lombard Plains"]);
  assert.equal(nav.canonicalMapName("Toisen Plains B1F"),"Toisen Plains B1F");
  const grouped=nav.groupMaps([{id:"raw-toisen-id",map_name:"Toisen Plains",map_image_url:"retained-photo"},{id:"game-taisen-id",map_name:"Taisen Plains",map_image_url:"game-photo"}]);assert.equal(grouped.length,1);
  assert(grouped[0].map_variants.some(row=>row.id==="raw-toisen-id"&&row.map_image_url==="retained-photo"));
  assert.equal(context.XEN_MAP_JAPANESE_NAMES["Taisen Plains"],"タイセン沼地");assert.equal(context.XEN_MAP_JAPANESE_NAMES["Toisen Plains"],undefined);
});

check("all standalone city spellings resolve directly to the expanded Arcarinas map",()=>{
  for(const name of ["Brynhilld","Brynhild","Brinhilld","Brynnhild","Brynhildr","ブリンヒルド"]){
    assert.equal(nav.canonicalMapName(name),"Arcarinas Square");
    assert.equal(context.XEN_MAP_REGISTRY.aliases[context.XEN_MAP_REGISTRY.key(name)],"Arcarinas Square");
  }
  assert(!context.XEN_MAP_REGISTRY.names.includes("Brynhilld"));
  for(const name of ["Guild Plaza","Mall Street","Summer Hill Street","Lost Brynhilld","Brynhilld Culvert B1F","Brynhildr Trisects"])assert.equal(nav.canonicalMapName(name),name);
});
check("merged map default retains the existing Arcarinas image and every original ID",()=>{
  const rows=[{id:"old-city-id",map_name:"Brynhilld",map_image_url:null,updated_at:"2030-01-01"},{id:"expanded-id",map_name:"Arcarinas Square",map_image_url:"arcarinas-photo",updated_at:"2020-01-01"}];
  const groups=nav.groupMaps(rows);assert.equal(groups.length,1);assert.equal(groups[0].id,"expanded-id");
  assert.equal(groups[0].map_image_url,"arcarinas-photo");assert.equal(groups[0].map_variants.length,2);
  const markers=[{id:"old-npc",map_id:"old-city-id",npc_name:"Guard",x_norm:100,y_norm:200},{id:"expanded-npc",map_id:"expanded-id",npc_name:"Guard",x_norm:800,y_norm:900}];
  assert.equal(nav.linkedNpcRows(groups[0],markers).length,2);
  const step={from:"Arcarinas Square",to:"Guard"};
  assert.equal(nav.selectExit(step,rows[1],markers).x,800);
});
check("Trisects entry aliases point to Arcarinas without inventing an exit position",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  const route=nav.findRoute(graph,"Brynhild Trisects","Brinhilld");
  assert.deepEqual(Array.from(route.path),["Brynhildr Trisects","Arcarinas Square"]);
  assert.equal(route.steps[0].direction,"top");
  const map={id:"trisects",map_name:"Brynhild Trisects"};
  assert.equal(nav.selectExit(route.steps[0],map,[]),null);
  const point=nav.selectExit(route.steps[0],map,[{id:"verified-exit",map_id:"trisects",npc_name:"Brinhilld",x_norm:510,y_norm:40}]);
  assert.equal(point.x,510);assert.equal(point.map_id,"trisects");
});

check("game-confirmed Clingon Plains corrects legacy Chingon without changing IDs or routes",()=>{
  const graph=nav.buildGraph(world,[],{includeTransports:false});
  assert.equal(nav.canonicalMapName("Chingon Plains"),"Clingon Plains");
  assert(graph.nodes.includes("Clingon Plains"));assert(!graph.nodes.includes("Chingon Plains"));
  assert.deepEqual(Array.from(nav.findRoute(graph,"Chingon Plains","Lifeline Basin").path),["Clingon Plains","Lifeline Basin"]);
  assert.equal(nav.canonicalMapName("Chingon Plains B1F"),"Chingon Plains B1F");
  const grouped=nav.groupMaps([{id:"legacy-chingon",map_name:"Chingon Plains",map_image_url:"retained-photo"},{id:"game-clingon",map_name:"Clingon Plains",map_image_url:"game-photo"}]);assert.equal(grouped.length,1);
  assert(grouped[0].map_variants.some(row=>row.id==="legacy-chingon"&&row.map_image_url==="retained-photo"));
  assert.equal(context.XEN_MAP_JAPANESE_NAMES["Clingon Plains"],undefined);
});

check("Rosetar, Paladino and Ashely corrections preserve their original connections and image keys",()=>{
 const graph=nav.buildGraph(world,[],{includeTransports:false});
 for(const [oldName,newName,left,right,jp]of [['Rosestar Basin','Rosetar Basin','Tolkin Gorge','Pharaday Gorge','ロジタ盆地'],['Pladino Grove','Paladino Grove','Onix Hill','Engrave Path','パルラディノグローブ'],['Ashley Forest','Ashely Forest','Lavy Basin','Onix Hill',null]]){
  assert.equal(nav.canonicalMapName(oldName),newName);assert(graph.nodes.includes(newName));assert(!graph.nodes.includes(oldName));assert.deepEqual(Array.from(nav.findRoute(graph,oldName,left).path),[newName,left]);assert.deepEqual(Array.from(nav.findRoute(graph,oldName,right).path),[newName,right]);assert.equal(nav.canonicalMapName(oldName+' B1F'),oldName+' B1F');
  const groups=nav.groupMaps([{id:'raw-id',map_name:oldName,map_image_url:'retained-photo'},{id:'new-id',map_name:newName,map_image_url:'game-photo'}]);assert.equal(groups.length,1);assert(groups[0].map_variants.some(row=>row.id==='raw-id'&&row.map_image_url==='retained-photo'&&row.map_name_original===oldName));if(jp){assert.equal(context.XEN_MAP_JAPANESE_NAMES[newName],jp);assert.equal(context.XEN_MAP_JAPANESE_NAMES[oldName],undefined);assert.equal(nav.canonicalMapName(jp),newName);}else assert.equal(context.XEN_MAP_JAPANESE_NAMES[newName],undefined);
 }
 assert.equal(world.edges.length,211);assert.equal(transports.edges.length,50);
});
check("monster display corrections keep source anchors and original reference map evidence",()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/assets/monsters-data.json'),'utf8'));
 assert.equal(data.monsters.filter(m=>m.map==='Rosetar Basin').length,4);assert.equal(data.monsters.filter(m=>m.map==='Paladino Grove').length,4);assert.equal(data.monsters.filter(m=>m.map==='Clingon Plains').length,5);assert.equal(data.monsters.filter(m=>m.map==='Ashely Forest').length,5);
 for(const m of data.monsters.filter(m=>m.map==='Rosetar Basin')){assert(m.id.includes('rosestar-basin'));assert(m.sourceAnchor.includes('Rosestar'));}
 for(const m of data.monsters.filter(m=>m.map==='Paladino Grove')){assert(m.id.includes('pladino-grove'));assert(m.sourceAnchor.includes('Pladino'));}
 const ros=data.references.filter(r=>r.map==='Rosetar Basin'),pal=data.references.filter(r=>r.map==='Paladino Grove');assert.equal(ros.length,4);assert.equal(pal.length,2);assert(ros.every(r=>r.originalMap.startsWith('Rosestar Basin')&&r.name.startsWith('Rosetar Basin')));assert(pal.every(r=>r.originalMap==='Pladino Grove'&&r.name==='Paladino Grove'));assert(ros.some(r=>r.name==='Rosetar Basin (non-HHs)'&&r.originalMap==='Rosestar Basin (non-HHs)'));
});
check("complete Shylphaen MAP connects north Baskerville and east Corlona only",()=>{
 const graph=nav.buildGraph(world,[],{includeTransports:false});assert.equal(nav.canonicalMapName('Sylphaen Forest'),'Shylphaen Forest');assert(!graph.nodes.includes('Sylphaen Forest'));assert(graph.nodes.includes('Corlona Forest'));assert.notEqual(nav.canonicalMapName('Corlona Forest'),nav.canonicalMapName('Colorado Forest'));const exits=graph.get('Shylphaen Forest');assert.equal(exits.length,2);const north=exits.find(e=>e.to==='Baskerville Forest'),east=exits.find(e=>e.to==='Corlona Forest');assert(north&&east);assert.equal(north.direction,'top');assert.equal(east.direction,'right');assert.equal(north.minLevel,null);assert.equal(east.minLevel,null);assert(!exits.some(e=>e.to==='Berdena Forest'));
 const map={id:'shyl-map',map_name:'Sylphaen Forest'};assert.equal(nav.selectExit(north,map,[]),null);assert.equal(nav.selectExit(east,map,[]),null);const point=nav.selectExit(east,map,[{id:'verified-east',map_id:'shyl-map',npc_name:'Corlona Forest',x_norm:980,y_norm:390}]);assert.equal(point.x,980);assert.equal(nav.selectExit(east,{id:'different-crop',map_name:'Shylphaen Forest'},[{map_id:'shyl-map',npc_name:'Corlona Forest',x_norm:980,y_norm:390}]),null);
 assert.equal(context.XenMapJapaneseNames.get('Sylphaen Forest'),'シルバエンの森');assert.equal(context.XenMapJapaneseNames.get('Corlona Forest'),'コルロナの森');assert.equal(nav.canonicalMapName('Sylphaen Forest B1F'),'Sylphaen Forest B1F');assert.equal(world.edges.length,211);assert.equal(transports.edges.length,50);const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/assets/monsters-data.json'),'utf8'));assert.equal(d.monsters.filter(m=>m.map==='Shylphaen Forest').length,6);const refs=d.references.filter(r=>r.map==='Shylphaen Forest');assert.equal(refs.length,2);assert(refs.every(r=>r.name==='Shylphaen Forest'&&r.originalMap==='Sylphaen Forest'));
});
check("generic Grave and Entrance are one node without guessed return route",()=>{
 const graph=nav.buildGraph(world,[],{includeTransports:false});
 assert.equal(nav.canonicalMapName('Sleepless Grave'),'Sleepless Grave (Entrance)');
 assert(!graph.nodes.includes('Sleepless Grave'));
 assert.deepEqual(Array.from(nav.findRoute(graph,'Eir','Sleepless Grave').path),['Eir','Sleepless Grave (Entrance)']);
 assert(!graph.get('Sleepless Grave (Entrance)').some(e=>e.to==='Eir'));
 const grouped=nav.groupMaps([{id:'generic-photo',map_name:'Sleepless Grave',map_image_url:'old-photo'},{id:'entrance-photo',map_name:'Sleepless Grave (Entrance)',map_image_url:'entrance-photo'}]);
 assert.equal(grouped.length,1);assert.equal(grouped[0].map_variants.length,2);assert(grouped[0].map_variants.some(m=>m.id==='generic-photo'));
 const v={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/assets/map-schematics.js'),'utf8'),v);
 assert.equal(v.window.XEN_MAP_SCHEMATICS['Sleepless Grave'],undefined);
 assert(v.window.XEN_MAP_SCHEMATICS['Sleepless Grave (Entrance)'].path.includes('entrance-clean'));
});
check("video-confirmed Grave floors stay separate with only observed transitions",()=>{
 const graph=nav.buildGraph(world,[],{includeTransports:false});
 assert.equal(nav.canonicalMapName('Turneit Desert'),'Turmeit Desert');
 assert(nav.findRoute(graph,'Eir','Sleepless Grave (Level 2)'));
 assert(graph.get('Sleepless Grave (Level 1)').some(e=>e.to==='Sleepless Grave (Level 2)'));
 assert(!graph.get('Sleepless Grave (Level 2)').some(e=>e.to==='Sleepless Grave (Level 1)'));
 assert(!graph.get('Sleepless Grave (Entrance)').some(e=>e.to==='Eir'));
 assert.notEqual(nav.canonicalMapName('Sleepless Grave (Level 1)'),nav.canonicalMapName('Sleepless Grave (Level 2)'));
});
console.log("PASS: "+checks+" route, transport, level, canonical map and exact-coordinate checks.");
