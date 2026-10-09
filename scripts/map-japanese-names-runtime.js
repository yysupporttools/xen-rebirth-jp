"use strict";
(function(root){
  const data=/* JAPANESE_MAP_DATA */{names:{}};
  root.XEN_MAP_JAPANESE_NAMES=Object.assign({},data.names);
  root.XEN_MAP_JAPANESE_NAME_META={version:data.version,label:data.label,source:data.source};
  function canonical(value){const registry=root.XEN_MAP_REGISTRY;return registry&&registry.resolve?registry.resolve(value):String(value||"").trim();}
  function get(value){return root.XEN_MAP_JAPANESE_NAMES[canonical(value)]||"";}
  function mapLabel(value){const english=canonical(value),japanese=get(english);return english+(japanese?"（旧日本語名："+japanese+"）":"");}
  root.XenMapJapaneseNames={get:get,mapLabel:mapLabel};
})(typeof window!=="undefined"?window:globalThis);
