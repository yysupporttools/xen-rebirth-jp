/* Shared, local current-map state. Coordinates are normalized to the saved image. */
"use strict";
(function(root){
  const KEY="xen-map-location-v1";
  const LEGACY_KEY="xen-local-current-map-v1";
  const EVENT="xen:map-location";
  const listeners=new Set();
  let memory=null;
  const own=function(value,key){return Object.prototype.hasOwnProperty.call(value,key);};
  function canonical(value){
    const raw=typeof value==="string"?value.trim():"";
    if(!raw||raw.length>150||/[\u0000-\u001f\u007f]/.test(raw)||/^(?:unknown|unidentified|none|null|undefined|map|map name|未認識|不明|マップ名不明)$/i.test(raw)) return "";
    return root.XEN_MAP_REGISTRY?root.XEN_MAP_REGISTRY.resolve(raw):raw;
  }
  function id(value){
    return typeof value==="string"&&/^[A-Za-z0-9._:-]{1,100}$/.test(value)?value:"";
  }
  function normalize(value,stored){
    if(!value||typeof value!=="object"||Array.isArray(value)) return null;
    const map=canonical(value.map);
    const source=value.source;
    if(!map||(source!=="manual"&&source!=="capture")) return null;
    const confidence=source==="manual"&&value.confidence==null?100:Number(value.confidence);
    if(!Number.isFinite(confidence)||confidence<0||confidence>100||(source==="capture"&&confidence<70)) return null;
    const method=typeof value.method==="string"?value.method.trim().slice(0,100):"";
    if(source==="capture"&&/OCR/i.test(method)&&confidence<90) return null;
    const at=stored?Number(value.at):Date.now();
    if(!Number.isFinite(at)||at<=0||at>Date.now()+60000) return null;
    const out={version:1,map:map,confidence:confidence,source:source,at:at};
    if(method) out.method=method;
    const mapId=id(value.mapId);
    if(mapId) out.mapId=mapId;
    // A coordinate pair only has meaning on the exact saved map-image variant.
    if(mapId&&own(value,"x")&&own(value,"y")&&value.x!==null&&value.y!==null&&value.x!==""&&value.y!==""){
      const x=Number(value.x),y=Number(value.y);
      if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1000&&y>=0&&y<=1000){
        out.x=x;out.y=y;
      }
    }
    return out;
  }
  function parse(raw){
    if(!raw) return null;
    try{return normalize(JSON.parse(raw),true);}catch(_){return null;}
  }
  function copy(value){return value?Object.assign({},value):null;}
  function read(){
    try{memory=parse(root.localStorage.getItem(KEY));}catch(_){}
    return copy(memory);
  }
  function notify(){
    const value=copy(memory);
    listeners.forEach(function(fn){try{fn(copy(value));}catch(_){}});
    try{root.dispatchEvent(new CustomEvent(EVENT,{detail:value}));}catch(_){}
  }
  function publish(value){
    const accepted=normalize(value,false);
    if(!accepted) return null;
    // Do not merge earlier coordinates: repeated detection proves only the map.
    memory=accepted;
    try{root.localStorage.setItem(KEY,JSON.stringify(memory));}catch(_){}
    notify();
    return copy(memory);
  }
  function clear(){
    memory=null;
    try{root.localStorage.removeItem(KEY);root.localStorage.removeItem(LEGACY_KEY);}catch(_){}
    notify();
  }
  function subscribe(fn){
    if(typeof fn!=="function") return function(){};
    listeners.add(fn);
    return function(){listeners.delete(fn);};
  }
  root.addEventListener("storage",function(event){
    if(event.key!==KEY) return;
    const incoming=parse(event.newValue);
    if(event.newValue&&!incoming) return;
    if(incoming&&memory&&incoming.at<memory.at) return;
    memory=incoming;
    notify();
  });
  memory=read();
  // Read-only migration of the previous capture state, never of a destination.
  if(!memory){
    try{
      const previous=JSON.parse(root.localStorage.getItem(LEGACY_KEY)||"null");
      if(previous&&previous.map&&previous.at){
        const migrated=normalize({map:previous.map,source:previous.source==="手動補正"?"manual":"capture",method:previous.source,confidence:previous.confidence,at:previous.at},true);
        if(migrated){memory=migrated;root.localStorage.setItem(KEY,JSON.stringify(migrated));}
      }
    }catch(_){}
  }
  root.XenMapLocation=Object.freeze({read:read,publish:publish,clear:clear,subscribe:subscribe,storageKey:KEY,eventName:EVENT});
})(typeof window!=="undefined"?window:globalThis);
