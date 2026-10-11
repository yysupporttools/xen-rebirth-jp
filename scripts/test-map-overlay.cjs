const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console});context.window=context;
for(const file of ['map-registry.js','world-routes.js','map-transports.js','map-navigation.js','map-image-audit.js','map-route-overlay.js','map-navigator.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/assets',file),'utf8'),context);
const overlay=context.XenMapRouteOverlay,nav=context.XenMapNavigation,ui=context.XenMapNavigator;
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('manual advance follows actual current map and stops at arrival',()=>{
 const plan={steps:[{from:'Essene',to:'Candy Vault'}]};
 assert.equal(overlay.nextStep(plan,'Essene',false).to,'Candy Vault');assert.equal(overlay.nextStep(plan,'Candy Vault',false),null);assert.equal(overlay.nextStep(plan,'Essene',true),null);assert.equal(overlay.nextStep({steps:[]},'Essene',false),null);
});
test('transporter wording includes destination',()=>assert.equal(overlay.guidanceText({kind:'transporter',to:'Essene'},n=>n),'トランスポーターで Essene へ移動'));
test('manual replacement invalidates reviewed exit',()=>{
 const row=context.XEN_MAP_IMAGE_AUDIT.images.find(m=>m.name==='Verazium Plateau'),map={id:row.id,map_name:row.name,map_image_url:row.url,source_image_hash:row.hash,image_source:'manual'};
 const p=overlay.exit(map,row.exits[0].to,[]);assert(p);assert(ui.pointOnImage(p,map));assert.equal(overlay.exit({...map,map_image_url:'new.webp'},row.exits[0].to,[]),null);assert.equal(ui.pointOnImage(p,{...map,source_image_hash:'new'}),null);
});
test('shared portal wins only for the exact image',()=>{
 const row=context.XEN_MAP_IMAGE_AUDIT.images[0],map={id:row.id,map_name:row.name,map_image_url:row.url,source_image_hash:row.hash};
 const portal={kind:'exit',destination:'Essene',image_key:overlay.imageKey(map),x_norm:200,y_norm:300};assert.equal(overlay.exit(map,'Essene',[portal]).x,200);assert.equal(overlay.exit({...map,map_image_url:'new'},'Essene',[portal]),null);
});
test('transport landing is never inferred from a return portal',()=>{
 const row=context.XEN_MAP_IMAGE_AUDIT.images[0],map={id:row.id,map_name:row.name,map_image_url:row.url,source_image_hash:row.hash};assert.equal(overlay.entrance(map,{map:map.map_name,from:row.exits[0].to,kind:'transporter'},[]),null);
});
test('shortest walking path goes around walls',()=>{
 const grid={width:5,height:5,runs:[0,2,3,4,8,4,13,4,18,7]};
 const p=overlay.shortestPath(grid,{x:100,y:100},{x:900,y:100});assert(p);assert(p.some(n=>n.y>=900));
});
test('no diagonal corner cutting or impossible route',()=>{
 assert.equal(overlay.shortestPath({width:2,height:2,runs:[0,1,3,1]},{x:250,y:250},{x:750,y:750}),null);
});
test('image connection corrections avoid old direct shortcuts',()=>{
 const graph=nav.buildGraph(context.XEN_WORLD_ROUTES,overlay.connections(),{includeTransports:false});
 assert(!graph.get('Sherwood Valley').some(e=>e.to==='Yvel'));assert(!graph.get('Siberas Plateau').some(e=>e.to==='Fies Plateau'));assert(!graph.get('Amelia Forest').some(e=>e.to==='Mute Basin'));
 assert(graph.get('Yvel').some(e=>e.to==='Lost Wedge Valley'));assert(graph.get('Aerial Forest').some(e=>e.to==='Loem Valley'));
});
test('each reviewed mask produces a route on the matching saved photo',()=>{
 for(const row of context.XEN_MAP_IMAGE_AUDIT.walkMasks){const map={id:row.id,map_name:row.name,map_image_url:row.url,source_image_hash:row.hash};const points=row.name==='Ramia Plateau'?[{x:175,y:440},{x:790,y:450}]:[{x:170,y:540},{x:780,y:190}];assert(overlay.walkingPath(map,...points),row.name);assert.equal(overlay.walkingPath({...map,source_image_hash:'new'},...points),null);}
});
console.log(count+' overlay checks passed');
