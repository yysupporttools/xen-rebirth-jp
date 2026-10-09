"use strict";
(function(root){
  function searchKey(value){return String(value==null?"":value).normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");}
  let canonicalCacheRegistry=null,canonicalCache=new Map();
  function canonicalMapName(value){
    const text=String(value==null?"":value).trim(),registry=root.XEN_MAP_REGISTRY;
    if(registry!==canonicalCacheRegistry){canonicalCacheRegistry=registry;canonicalCache.clear();}
    if(canonicalCache.has(text)) return canonicalCache.get(text);
    const name=registry&&typeof registry.resolve==="function"?registry.resolve(text):text;
    if(canonicalCache.size>=4096) canonicalCache.clear();
    canonicalCache.set(text,name);
    return name;
  }
  function groupMaps(rows){
    const registry=root.XEN_MAP_REGISTRY;
    if(registry&&typeof registry.groups==="function") return registry.groups(rows||[]);
    const groups=new Map();
    (rows||[]).forEach(function(row){
      const name=canonicalMapName(row.map_name);
      if(!groups.has(name)) groups.set(name,[]);
      groups.get(name).push(Object.assign({},row,{map_name:name}));
    });
    return Array.from(groups.values()).map(function(variants){return Object.assign({},variants[0],{map_variants:variants});})
      .sort(function(a,b){return a.map_name.localeCompare(b.map_name,"ja");});
  }
  function linkedNpcRows(map,rows){
    const variants=map&&Array.isArray(map.map_variants)?map.map_variants:[map];
    const ids=new Set(variants.filter(Boolean).map(function(row){return row.id;}));
    return (rows||[]).filter(function(row){return ids.has(row.map_id);});
  }
  function validCoordinate(value){
    if(value===null||value===undefined||String(value).trim()==="") return null;
    const number=Number(value);
    return Number.isFinite(number)&&number>=0&&number<=1000?number:null;
  }
  function point(row,mapId){
    if(!row||!mapId||String(row.map_id||"")!==String(mapId)) return null;
    const x=validCoordinate(row.x_norm===undefined?row.x:row.x_norm),y=validCoordinate(row.y_norm===undefined?row.y:row.y_norm);
    if(x===null||y===null) return null;
    return {x:x,y:y,x_norm:x,y_norm:y,map_id:mapId,npc_name:String(row.npc_name||row.name||""),
      npc_id:row.npc_id||row.id||null,confidence:row.confidence!=null&&Number.isFinite(Number(row.confidence))?Number(row.confidence):null,
      precision:"registered",source:row.source||"map_npcs",map_image_url:row.map_image_url||null,
      source_image_hash:row.source_image_hash||null,image_key:row.image_key||null};
  }
  function list(value){return Array.isArray(value)?value.filter(Boolean).map(String):(value?[String(value)]:[]);}
  function matchingName(name,hint){
    const plain=String(name||"").trim(),wanted=searchKey(hint);
    if(!wanted) return false;
    if(searchKey(plain)===wanted) return true;
    if(searchKey(canonicalMapName(plain))===searchKey(canonicalMapName(hint))) return true;
    return (plain.match(/\(([^()]+)\)/g)||[]).some(function(value){
      return searchKey(canonicalMapName(value.slice(1,-1)))===searchKey(canonicalMapName(hint));
    });
  }
  function selectExit(step,map,rows){
    if(!step||!map||!map.id||canonicalMapName(map.map_name)!==canonicalMapName(step.from)) return null;
    const rawExit=step.exit;
    const sameImage=!rawExit||(!rawExit.map_image_url||rawExit.map_image_url===map.map_image_url)&&
      (!rawExit.source_image_hash||rawExit.source_image_hash===map.source_image_hash)&&
      (!rawExit.image_key||rawExit.image_key===String(map.id)+"|"+String(map.map_image_url||""));
    const explicit=sameImage?point(rawExit,map.id):null;
    if(explicit) return explicit;
    if((step.kind==="transporter"||step.kind==="npc-transport"||step.kind==="event-transport")&&!list(step.exitNames).length&&!step.npcName) return null;
    const ownRows=(rows||[]).filter(function(row){return String(row.map_id)===String(map.id);});
    const isNpcService=step.kind==="transporter"||step.kind==="npc-transport"||step.kind==="event-transport";
    const hints=Array.from(new Set(list(step.exitNames).concat(isNpcService?(step.npcName?[step.npcName]:[]):[step.to||""])));
    for(let i=0;i<hints.length;i++){
      const matches=ownRows.filter(function(row){return matchingName(row.npc_name,hints[i]);}).map(function(row){return point(row,map.id);}).filter(Boolean);
      if(!matches.length) continue;
      const first=matches[0];
      // Never transfer coordinates between image variants or guess among conflicting points.
      if(matches.some(function(item){return Math.abs(item.x-first.x)>5||Math.abs(item.y-first.y)>5;})) return null;
      matches.sort(function(a,b){return (b.confidence||0)-(a.confidence||0);});
      return matches[0];
    }
    return null;
  }
  function minLevel(value){const number=Number(value);return Number.isFinite(number)&&number>0?Math.ceil(number):null;}
  function buildGraph(worldData,learnedTransitions,options){
    const world=worldData||{},config=options||{},nodes=new Set(),byEdge=new Map(),adjacency=new Map();
    const mapById=new Map((config.maps||[]).map(function(map){return [String(map.id),map];}));
    function mapName(value,id){return canonicalMapName(value||(mapById.get(String(id))||{}).map_name||"");}
    function add(step){
      if(!step.from||!step.to||step.from===step.to) return;
      nodes.add(step.from);nodes.add(step.to);
      const key=[step.from,step.to,step.kind,searchKey(step.npcName)].join("\u0000"),previous=byEdge.get(key);
      if(previous){
        // Several registered chains repeat a gated edge. The gate must not be bypassed.
        previous.minLevel=Math.max(previous.minLevel||0,step.minLevel||0)||null;
        previous.condition=Array.from(new Set([previous.condition,step.condition].filter(Boolean))).join(" / ");
        previous.exitNames=Array.from(new Set(previous.exitNames.concat(step.exitNames)));
        previous.requiredItems=Array.from(new Set((previous.requiredItems||[]).concat(step.requiredItems||[])));
        previous.requiredFlags=Array.from(new Set((previous.requiredFlags||[]).concat(step.requiredFlags||[])));
        if(!previous.direction&&step.direction) previous.direction=step.direction;
        if(!previous.exit&&step.exit) previous.exit=step.exit;
        return;
      }
      byEdge.set(key,step);
    }
    (world.nodes||[]).forEach(function(name){const value=canonicalMapName(name);if(value) nodes.add(value);});
    const transportData=config.transports||root.XEN_MAP_TRANSPORTS||{edges:[]};
    const supplied=(world.edges||[]).filter(function(edge){
      if(edge.a==="Essene"&&edge.b==="Airship Boarding Gate"&&edge.kind==="transport") return false;
      if(edge.kind!=="transport") return true;
      if(config.includeTransports===false) return false;
      // Preserve the two documented airship stages, never generate a town hub.
      return edge.verified===true||(edge.a==="Airship Boarding Gate"&&edge.b==="Floating Island of Dragons Dock");
    });
    supplied.push.apply(supplied,transportData.extraConnections||[]);
    if(config.includeTransports!==false){
      supplied.push.apply(supplied,transportData.edges||[]);
      supplied.push.apply(supplied,transportData.specialRoutes||[]);
      (transportData.edges||[]).forEach(function(edge){
        const originMaps=(transportData.cityOriginMaps||{})[canonicalMapName(edge.a)]||[];
        originMaps.forEach(function(name){
          const actual=canonicalMapName(name);
          if(actual!==canonicalMapName(edge.a)) supplied.push(Object.assign({},edge,{
            a:actual,sourceTown:canonicalMapName(edge.a),
            source:edge.source||transportData.source,
            exitA:actual==="Summer Hill Street"?["Transporter"]:[]
          }));
        });
      });
    }
    supplied.forEach(function(edge){
      if(edge.active===false||edge.verified===false) return;
      const a=canonicalMapName(edge.a||edge.from),b=canonicalMapName(edge.b||edge.to),reverseOnly=edge.direction==="reverse"||edge.oneWay==="b-to-a";
      const kind=edge.kind||"normal",shared={kind:kind,minLevel:minLevel(edge.minLevel||edge.min_level),
        condition:String(edge.condition||edge.note||""),source:String(edge.source||(edge.kind==="transporter"?transportData.source:world.source)||"登録済み経路"),
        destinationLabel:String(edge.destinationLabel||b),landingPointKnown:edge.landingPointKnown===true,sourceTown:edge.sourceTown||null,
        npcName:String(edge.npcName||""),requiredItems:list(edge.requiredItems),requiredFlags:list(edge.requiredFlags),
        schedule:edge.schedule?Object.assign({},edge.schedule):null,
        costKron:edge.costKron==null?(edge.feeKron==null?null:Number(edge.feeKron)):Number(edge.costKron),
        feeKron:edge.feeKron==null?(edge.costKron==null?null:Number(edge.costKron)):Number(edge.feeKron)};
      let hintsA=list(edge.exitA||edge.exitNames),hintsB=list(edge.exitB);
      if(kind==="transport"&&!hintsA.length&&edge.note){
        const named=String(edge.note).split(/\s*\/\s*/)[0].trim();
        if(/transporter/i.test(named)) hintsA=[named];
      }
      // The supplied enlarged Essene screenshot explicitly labels these destinations.
      if(a==="Essene"&&b==="Evergal Grove") hintsA=hintsA.concat("East Gate","Evergal Grove");
      if(b==="Essene"&&a==="Evergal Grove") hintsB=hintsB.concat("East Gate","Evergal Grove");
      if(a==="Essene"&&b==="Engrave Path") hintsA=hintsA.concat("North Gate","Engrave Path");
      if(b==="Essene"&&a==="Engrave Path") hintsB=hintsB.concat("North Gate","Engrave Path");
      if(!reverseOnly) add(Object.assign({},shared,{from:a,to:b,direction:edge.dirA||"",exitNames:hintsA,exit:edge.exitApoint||null}));
      if(reverseOnly||!(edge.directed===true||edge.bidirectional===false||edge.oneWay===true||edge.oneWay==="a-to-b"||kind==="transport")){
        add(Object.assign({},shared,{from:b,to:a,direction:edge.dirB||"",exitNames:hintsB,exit:edge.exitBpoint||null}));
      }
    });
    (learnedTransitions||[]).forEach(function(row){
      if(row.active===false||row.verified===false||row.status==="rejected"||row.status==="unconfirmed") return;
      if(!(row.verified===true||row.confirmed===true||row.source==="manual")) return;
      const from=mapName(row.from_map_name||row.from_map||row.from,row.from_map_id),to=mapName(row.to_map_name||row.to_map||row.to,row.to_map_id);
      const shared={kind:row.kind||"normal",minLevel:minLevel(row.minLevel||row.min_level),condition:String(row.condition||row.note||""),
        source:String(row.source||"確認済み接続"),transition_id:row.id||null,npcName:String(row.npcName||""),requiredItems:list(row.requiredItems),requiredFlags:list(row.requiredFlags),
        schedule:row.schedule?Object.assign({},row.schedule):null,
        costKron:row.costKron==null?(row.feeKron==null?null:Number(row.feeKron)):Number(row.costKron),
        feeKron:row.feeKron==null?(row.costKron==null?null:Number(row.costKron)):Number(row.feeKron)};
      add(Object.assign({},shared,{from:from,to:to,direction:row.direction||row.dir_from||"",
        exitNames:list(row.exitNames||row.exit_name||row.exit_from_name),exit:row.exit||row.exit_from||null}));
      if(row.bidirectional===true) add(Object.assign({},shared,{from:to,to:from,direction:row.dir_to||"",
        exitNames:list(row.returnExitNames||row.exit_to_name),exit:row.returnExit||row.exit_to||null}));
    });
    const groups=groupMaps(config.maps||[]),edges=Array.from(byEdge.values());
    edges.forEach(function(step){
      const map=groups.find(function(item){return item.map_name===step.from;}),saved=selectExit(step,map,config.mapNpcs||[]);
      if(saved) step.exit=saved;
      if(!adjacency.has(step.from)) adjacency.set(step.from,[]);
      adjacency.get(step.from).push(step);
    });
    return {nodes:Array.from(nodes).sort(function(a,b){return a.localeCompare(b,"ja");}),edges:edges,adjacency:adjacency,
      get:function(name){return adjacency.get(canonicalMapName(name))||[];}};
  }
  function findRoute(graph,start,target,options){
    if(!graph) return null;
    const from=canonicalMapName(start),to=canonicalMapName(target),config=options||{};
    if(!from||!to||(graph.nodes||[]).indexOf(from)<0||(graph.nodes||[]).indexOf(to)<0) return null;
    if(from===to) return {path:[from],steps:[],edges:[],restricted:false,requiredLevel:null,requiredItems:[],missingItems:[],restrictedItems:false,requiredFlags:[],missingFlags:[],restrictedFlags:false};
    const level=config.level===null||config.level===undefined||config.level===""?null:Number(config.level),validLevel=Number.isFinite(level)&&level>=0;
    const itemsKnown=config.items!==undefined&&config.items!==null;
    const ownedItems=new Set((Array.isArray(config.items)?config.items:Array.from(config.items||[])).map(searchKey));
    function missingItems(step){return (step.requiredItems||[]).filter(function(item){return !ownedItems.has(searchKey(item));});}
    const flagsKnown=config.flags!==undefined&&config.flags!==null;
    const rawFlags=Array.isArray(config.flags)?config.flags:(config.flags&&typeof config.flags[Symbol.iterator]==="function"?Array.from(config.flags):Object.keys(config.flags||{}).filter(function(key){return config.flags[key]===true;}));
    const ownedFlags=new Set(rawFlags.map(searchKey));
    function missingFlags(step){return (step.requiredFlags||[]).filter(function(flag){return !ownedFlags.has(searchKey(flag));});}
    const queue=[from],previous=new Map([[from,null]]);
    for(let i=0;i<queue.length;i++){
      const current=queue[i];
      if(current===to) break;
      const choices=typeof graph.get==="function"?graph.get(current):((graph.adjacency||new Map()).get(current)||[]);
      choices.forEach(function(step){
        if(!config.ignoreLevel&&validLevel&&step.minLevel&&level<step.minLevel) return;
        if(!config.ignoreConditions&&itemsKnown&&missingItems(step).length) return;
        if(!config.ignoreConditions&&flagsKnown&&missingFlags(step).length) return;
        if(previous.has(step.to)) return;
        previous.set(step.to,step);queue.push(step.to);
      });
    }
    if(!previous.has(to)) return null;
    const path=[to],steps=[];
    let current=to;
    while(current!==from){
      const step=previous.get(current);if(!step) return null;
      steps.unshift(Object.assign({},step));path.unshift(step.from);current=step.from;
    }
    const required=Array.from(new Set(steps.flatMap(function(step){return step.requiredItems||[];})));
    const missing=itemsKnown?required.filter(function(item){return !ownedItems.has(searchKey(item));}):[];
    const requiredFlagList=Array.from(new Set(steps.flatMap(function(step){return step.requiredFlags||[];})));
    const missingFlagList=flagsKnown?requiredFlagList.filter(function(flag){return !ownedFlags.has(searchKey(flag));}):[];
    return {path:path,steps:steps,edges:steps,restricted:missingFlagList.length>0||missing.length>0||(validLevel&&steps.some(function(step){return step.minLevel&&level<step.minLevel;})),
      requiredLevel:Math.max.apply(null,steps.map(function(step){return step.minLevel||0;}).concat(0))||null,
      requiredItems:required,missingItems:missing,restrictedItems:missing.length>0,
      requiredFlags:requiredFlagList,missingFlags:missingFlagList,restrictedFlags:missingFlagList.length>0};
  }
  root.XenMapNavigation={version:1,searchKey:searchKey,canonicalMapName:canonicalMapName,groupMaps:groupMaps,
    linkedNpcRows:linkedNpcRows,validCoordinate:validCoordinate,selectExit:selectExit,buildGraph:buildGraph,findRoute:findRoute};
})(typeof window!=="undefined"?window:globalThis);
