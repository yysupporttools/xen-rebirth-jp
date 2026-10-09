"use strict";
(function(root){
  const data=/* REGISTRY_DATA */;
  const key=function(value){return String(value||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");};
  const guard=function(value){
    const words=String(value||"").normalize("NFKC").toLowerCase().match(/[a-z]+|[0-9]+/g)||[];
    return words.filter(function(word){return /^(north|south|east|west|upper|lower|entrance|exit|left|right|floor|level|b[0-9]+f|[0-9]+)$/.test(word);}).sort().join("|");
  };
  const kind=function(value){
    const words=String(value||"").normalize("NFKC").toLowerCase().match(/[a-z]+/g)||[];
    return words.filter(function(word){return /^(forest|basin|valley|plains?|gorge|hill|hills|street|square|plateau|cave|caves|dock|gate|city|town|village|ship|dungeon)$/.test(word);}).map(function(word){return word==="plain"?"plains":word;}).sort().join("|");
  };
  function oneEdit(a,b){
    if(Math.abs(a.length-b.length)>1) return false;
    let i=0,j=0,edits=0;
    while(i<a.length&&j<b.length){
      if(a[i]===b[j]){i++;j++;continue;}
      if(++edits>1) return false;
      if(a.length>=b.length) i++;
      if(b.length>=a.length) j++;
    }
    return edits+(a.length-i)+(b.length-j)<=1;
  }
  function resolve(value){
    const raw=String(value||"").trim();
    const normalized=key(raw);
    if(!normalized) return raw;
    if(Object.prototype.hasOwnProperty.call(data.aliases,normalized)) return data.aliases[normalized];
    // Never guess a short, non-Latin, multi-edit, floor or directional name.
    if(normalized.length<7||!/^[a-z0-9]+$/.test(normalized)||/(?:^|[^a-z0-9])(?:b[0-9]+f|[0-9]+f|floor|level)(?:[^a-z0-9]|$)/i.test(raw)) return raw;
    const candidates=data.names.filter(function(name){return guard(name)===guard(raw)&&kind(name)===kind(raw)&&oneEdit(normalized,key(name));});
    return candidates.length===1?candidates[0]:raw;
  }
  function record(row){
    const raw=String(row.map_name||"");
    return Object.assign({},row,{map_name:resolve(row.canonical_map_name||raw),map_name_original:row.map_name_original||(resolve(row.canonical_map_name||raw)!==raw?raw:null)});
  }
  function groups(rows){
    const byName=new Map();
    rows.forEach(function(row){
      const normalized=record(row),name=normalized.map_name;
      if(!byName.has(name)) byName.set(name,[]);
      byName.get(name).push(normalized);
    });
    return Array.from(byName.values()).map(function(variants){
      // Keep every capture and its original map ID. Prefer the exact registered
      // spelling for the main canvas so coordinates retain their image context.
      variants.sort(function(a,b){
        const aExact=!a.map_name_original,bExact=!b.map_name_original;
        if(aExact!==bExact) return aExact?-1:1;
        return String(b.updated_at||"").localeCompare(String(a.updated_at||""));
      });
      return Object.assign({},variants[0],{map_variants:variants});
    }).sort(function(a,b){return a.map_name.localeCompare(b.map_name,"ja");});
  }
  root.XEN_MAP_REGISTRY={version:data.version,names:data.names.slice(),aliases:data.aliases,key:key,resolve:resolve,record:record,groups:groups};
})(typeof window!=="undefined"?window:globalThis);
