const fs=require("fs"),vm=require("vm"),assert=require("assert/strict"),path=require("path");
const root=path.resolve(__dirname,".."),a=root+"/dist/assets/",c={console,AbortSignal,fetch:async()=>({ok:true,json:async()=>[{source_name:"Shalo Forest",corrected_name:"Shaio Forest",aliases:["Shalo Forest"],updated_at:"one"}]}),XEN_GLOSSARY_CONFIG:{SUPABASE_URL:"https://test",SUPABASE_ANON_KEY:"publishable"}};
c.window=c;vm.createContext(c);
for(const f of ["world-routes.js","map-registry.js","map-japanese-names.js","map-schematics.js","map-navigation.js"])vm.runInContext(fs.readFileSync(a+f,"utf8"),c);
const before=c.XenMapNavigation.buildGraph(c.XEN_WORLD_ROUTES,[],{includeTransports:false}),exits=before.get("Shalo Forest").map(e=>e.to).sort();
vm.runInContext(fs.readFileSync(a+"map-name-corrections.js","utf8"),c);
(async()=>{
 await c.XenMapNames.ready;assert.equal(c.XEN_MAP_REGISTRY.resolve("Shalo Forest"),"Shaio Forest");assert.equal(c.XEN_MAP_REGISTRY.resolve("Shaio Forest"),"Shaio Forest");
 assert.equal(c.XEN_MAP_REGISTRY.resolve("Shaloo Forest"),"Shaio Forest");assert.equal(c.XEN_MAP_REGISTRY.record({id:"fuzzy-id",map_name:"Shaloo Forest"}).map_name,"Shaio Forest");
 assert(c.XEN_MAP_REGISTRY.names.includes("Shaio Forest"));assert(!c.XEN_MAP_REGISTRY.names.includes("Shalo Forest"));assert.equal(c.XenMapNames.source("Shaio Forest"),"Shalo Forest");
 const row=c.XEN_MAP_REGISTRY.record({id:"original-id",map_name:"Shalo Forest",map_image_url:"retained"});assert.equal(row.id,"original-id");assert.equal(row.map_name,"Shaio Forest");assert.equal(row.map_name_original,"Shalo Forest");assert.equal(row.map_image_url,"retained");
 const after=c.XenMapNavigation.buildGraph(c.XEN_WORLD_ROUTES,[],{includeTransports:false});assert.deepEqual(Array.from(after.get("Shaio Forest"),e=>e.to).sort(),Array.from(exits));assert(!after.nodes.includes("Shalo Forest"));
 c.XenMapNames.apply([{source_name:"Shalo Forest",corrected_name:"Shaio Forest revised",aliases:["Shaio Forest"]}]);assert.equal(c.XEN_MAP_REGISTRY.resolve("Shalo Forest"),"Shaio Forest revised");assert.equal(c.XEN_MAP_REGISTRY.resolve("Shaio Forest"),"Shaio Forest revised");
 console.log("PASS: manual name corrections preserve original image IDs, aliases, graph connections and subsequent renames");
})().catch(e=>{console.error(e);process.exitCode=1;});
