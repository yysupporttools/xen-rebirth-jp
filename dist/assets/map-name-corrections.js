"use strict";
(function(root){
 const original=root.XEN_MAP_REGISTRY;if(!original)return;
 const aliases={...original.aliases},names=original.names.slice(),jp={...(root.XEN_MAP_JAPANESE_NAMES||{})},schemes={...(root.XEN_MAP_SCHEMATICS||{})};
 const baseResolve=original.resolve,baseRecord=original.record,baseGroups=original.groups;
 function finalResolve(value){const name=baseResolve(value);return Object.prototype.hasOwnProperty.call(original.aliases,original.key(name))?original.aliases[original.key(name)]:name;}
 original.resolve=finalResolve;
 original.record=row=>{const result=baseRecord(row),name=finalResolve(result.map_name);return {...result,map_name:name,map_name_original:result.map_name_original||(name!==String(row.map_name||"")?row.map_name:null)};};
 original.groups=rows=>baseGroups(rows.map(original.record));
 let rows=[],failed=false;
 function source(name){const canonical=root.XEN_MAP_REGISTRY.resolve(name);return rows.find(r=>root.XEN_MAP_REGISTRY.resolve(r.source_name)===canonical)?.source_name||canonical;}
 function apply(values){
  rows=values.filter(r=>typeof r.source_name==="string"&&typeof r.corrected_name==="string"&&r.corrected_name.length<=120&&!/[<>\u0000-\u001f]/.test(r.corrected_name));
  const mapping=new Map(rows.map(r=>[aliases[original.key(r.source_name)]||r.source_name,r.corrected_name]));
  for(const k of Object.keys(original.aliases))delete original.aliases[k];
  for(const [k,v]of Object.entries(aliases))original.aliases[k]=mapping.get(v)||v;
  for(const r of rows){for(const name of [r.source_name,r.corrected_name,...(r.aliases||[])])if(typeof name==="string"&&name.length<=120)original.aliases[original.key(name)]=r.corrected_name;}
  root.XEN_MAP_REGISTRY={...original,names:[...new Set(names.map(n=>mapping.get(n)||n).concat(rows.map(r=>r.corrected_name)))]};
  const nextJP={};for(const [k,v]of Object.entries(jp))nextJP[mapping.get(k)||k]=v;root.XEN_MAP_JAPANESE_NAMES=nextJP;
  if(Object.keys(schemes).length){const next={};for(const[k,v]of Object.entries(schemes))next[mapping.get(k)||k]=v;root.XEN_MAP_SCHEMATICS=next;}
 }
 async function refresh(){
  const cfg=root.XEN_GLOSSARY_CONFIG;if(!cfg)return;
  try{
   const response=await fetch(cfg.SUPABASE_URL+"/rest/v1/map_name_corrections?select=source_name,corrected_name,aliases,updated_at&limit=1000",{headers:{apikey:cfg.SUPABASE_ANON_KEY},signal:AbortSignal.timeout(15000),cache:"no-store"});
   if(!response.ok)throw Error("names");const values=await response.json();if(!Array.isArray(values))throw Error("names");
   apply(values);failed=false;
  }catch(_){failed=true;}
 }
 root.XenMapNames={source,apply,refresh,get rows(){return rows;},get failed(){return failed;}};
 root.XenMapNames.ready=refresh();
})(window);
