"use strict";
(function(root){
 const canonical=value=>root.XenMapNavigation.canonicalMapName(value);
 const imageKey=map=>String(map?.id||"")+"|"+String(map?.map_image_url||"")+"|"+String(map?.source_image_hash||"");
 function audited(map){return (root.XEN_MAP_IMAGE_AUDIT?.images||[]).find(row=>row.id===map?.id&&row.url===map.map_image_url&&row.hash===(map.source_image_hash||""));}
 function bound(map,p,name){return p?{map_id:map.id,x:p.x??p.x_norm,y:p.y??p.y_norm,name:name||p.name||p.label,image_key:imageKey(map),imageVerified:true}:null;}
 function consistent(rows){if(!rows.length)return null;const first=rows[0];return rows.every(p=>Math.abs((p.x??p.x_norm)-(first.x??first.x_norm))<30&&Math.abs((p.y??p.y_norm)-(first.y??first.y_norm))<30)?first:null;}
 function exit(map,to,portals){
  const shared=consistent((portals||[]).filter(p=>p.kind==='exit'&&p.image_key===imageKey(map)&&canonical(p.destination)===canonical(to)));
  if(shared)return bound(map,shared,to);
  return bound(map,consistent((audited(map)?.exits||[]).filter(p=>canonical(p.to)===canonical(to))),to);
 }
 function service(map,name){return bound(map,consistent((audited(map)?.services||[]).filter(p=>String(p.name).toLowerCase()===String(name||'Transporter').toLowerCase())),name||'Transporter');}
 function guidanceText(step,label){if(!step)return '';if(step.kind==='transporter')return 'トランスポーターで '+label(step.to)+' へ移動';if(['transport','npc-transport','event-transport'].includes(step.kind))return (step.npcName||'移動NPC')+'で '+label(step.to)+' へ移動';return label(step.to)+' への出口';}
 function nextStep(plan,current,ambiguous){const first=plan?.steps?.[0];return first&&!ambiguous&&canonical(first.from)===canonical(current)?first:null;}
 function connections(){
  const result=[...(root.XEN_MAP_IMAGE_AUDIT?.connections||[])];
  for(const row of root.XEN_MAP_IMAGE_AUDIT?.images||[])for(const point of row.exits)result.push({from:row.name,to:point.to,verified:true,bidirectional:false,source:'登録済みマップ画像の出口を確認（2026-10-12）'});
  return result;
 }
 function entrance(map,previous,portals){
  if(!previous||previous.kind!=='normal'||canonical(previous.map)!==canonical(map.map_name))return null;
  const shared=consistent((portals||[]).filter(p=>p.kind==='entrance'&&p.image_key===imageKey(map)&&canonical(p.destination)===canonical(previous.from)));
  return shared?bound(map,shared,'入口'):exit(map,previous.from,portals);
 }
 function arrow(points){
  if(!points||points.length<2)return '';
  const coordinates=points.map(p=>Number(p.x).toFixed(1)+','+Number(p.y).toFixed(1)).join(' ');
  return '<defs><marker id="map-arrow-head" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#e3342f"/></marker></defs><polyline points="'+coordinates+'" fill="none" stroke="white" stroke-width="11" stroke-linejoin="round"/><polyline points="'+coordinates+'" fill="none" stroke="#e3342f" stroke-width="6" stroke-linejoin="round" marker-end="url(#map-arrow-head)"/>';
 }
 function shortestPath(grid,start,end){
  if(!grid||!start||!end)return null;
  const w=grid.width,h=grid.height,cells=new Uint8Array(w*h);
  for(let i=0;i<grid.runs.length;i+=2)cells.fill(1,grid.runs[i],grid.runs[i]+grid.runs[i+1]);
  function nearest(p){
   if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1000||p.y>1000)return -1;
   const px=p.x*w/1000,py=p.y*h/1000;
   let found=-1,distance=Infinity;
   for(let i=0;i<cells.length;i++)if(cells[i]){const d=(i%w+.5-px)**2+(Math.floor(i/w)+.5-py)**2;if(d<distance){found=i;distance=d;}}
   return distance<=(Math.min(w,h)*.15)**2?found:-1;
  }
  const from=nearest(start),to=nearest(end);if(from<0||to<0)return null;
  const distances=new Float64Array(w*h).fill(Infinity),previous=new Int32Array(w*h).fill(-1),heap=[];
  function push(node,cost){let i=heap.length;heap.push([node,cost]);while(i){const parent=(i-1)>>1;if(heap[parent][1]<=cost)break;heap[i]=heap[parent];i=parent;}heap[i]=[node,cost];}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1][1]<heap[child][1])child++;if(heap[child][1]>=last[1])break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
  distances[from]=0;push(from,0);
  while(heap.length){
   const [at,cost]=pop();if(cost!==distances[at])continue;if(at===to)break;
   const x=at%w,y=Math.floor(at/w);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nx=x+dx,ny=y+dy,next=ny*w+nx;
    if(nx<0||ny<0||nx>=w||ny>=h||!cells[next])continue;
    if(dx&&dy&&(!cells[y*w+nx]||!cells[ny*w+x]))continue;
    const value=cost+(dx&&dy?Math.SQRT2:1);
    if(value<distances[next]){distances[next]=value;previous[next]=at;push(next,value);}
   }
  }
  if(!Number.isFinite(distances[to]))return null;
  const raw=[];for(let at=to;at!==-1;at=previous[at]){raw.push(at);if(at===from)break;}raw.reverse();
  const reduced=raw.filter((n,i)=>!i||i===raw.length-1||n-raw[i-1]!==raw[i+1]-n);
  return reduced.map(n=>({x:(n%w+.5)*1000/w,y:(Math.floor(n/w)+.5)*1000/h}));
 }
 function walkingPath(map,start,end){
  const grid=(root.XEN_MAP_IMAGE_AUDIT?.walkMasks||[]).find(row=>row.id===map?.id&&row.url===map.map_image_url&&row.hash===(map.source_image_hash||''));
  return shortestPath(grid,start,end);
 }
 root.XenMapRouteOverlay={imageKey,audited,exit,service,guidanceText,nextStep,connections,entrance,arrow,shortestPath,walkingPath};
})(typeof window!=='undefined'?window:globalThis);
