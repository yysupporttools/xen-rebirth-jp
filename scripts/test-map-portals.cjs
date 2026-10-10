const fs=require("fs"),vm=require("vm"),assert=require("assert/strict"),path=require("path");
const site=path.resolve(__dirname,"..");
const html=fs.readFileSync(site+"/dist/map.html","utf8"),code=fs.readFileSync(site+"/dist/assets/map-portals.js","utf8");
class Element{
 constructor(id){this.id=id;this.value="";this.hidden=false;this.checked=true;this.disabled=false;this.textContent="";this.innerHTML="";this.listeners={};this.classList={add(){},remove(){}};}
 addEventListener(t,f){(this.listeners[t]||=[]).push(f);}
 async trigger(t,e={}){e.preventDefault||=()=>{};e.stopImmediatePropagation||=()=>{};e.target||=this;for(const f of this.listeners[t]||[])await f(e);}
 click(){return this.trigger("click");}
 getBoundingClientRect(){return {left:100,top:200,width:500,height:250};}
}
function make(isAdmin){
 let rows=[{id:"shared",map_name:"A",image_key:"image-A",kind:"entrance",label:"門",destination:"B",x_norm:100,y_norm:200,updated_at:"one"},{id:"old",map_name:"A",image_key:"old-image",kind:"exit",label:"old",destination:"B",x_norm:700,y_norm:800,updated_at:"one"}],mutations=0,fail=false;
 const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
 const listeners={},db={auth:{getUser:async()=>({data:{user:isAdmin?{}:null}}),onAuthStateChange(){}},rpc:async()=>({data:isAdmin}),from(){
  let mode="read",payload=null,filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},insert(p){mode="insert";payload=p;return q;},update(p){mode="update";payload=p;return q;},delete(){mode="delete";return q;},
   then(resolve,reject){try{
    let result=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
    if(mode!=="read"){mutations++;if(!isAdmin||fail)return Promise.resolve({error:{message:"denied"},data:null}).then(resolve,reject);
     if(mode==="insert"){const r={...payload,id:"new-"+mutations};rows.push(r);result=[r];}
     if(mode==="update")for(const r of result)Object.assign(r,payload);
     if(mode==="delete")rows=rows.filter(r=>!result.includes(r));
    }
    return Promise.resolve({data:result,error:null}).then(resolve,reject);
   }catch(e){return Promise.reject(e).then(resolve,reject);}}
  };return q;
 }};
 const sandbox={console,setTimeout,document:{getElementById:id=>elements.get(id)},XEN_GLOSSARY_CONFIG:{},XenMapNavigator:{esc:s=>String(s??"").replaceAll("<","&lt;").replaceAll('"',"&quot;"),mapLabel:s=>s},
 XenMapNavigation:{canonicalMapName:s=>s},XEN_MAP_REGISTRY:{names:["A","B"]},supabase:{createClient:()=>db},confirm:()=>true,
 addEventListener:(t,f)=>(listeners[t]||=[]).push(f)};
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(code,sandbox);
 return {e:id=>elements.get(id),sandbox,view:async(d)=>{for(const f of listeners["xen-map-view"]||[])await f({detail:d});await tick();},count:()=>mutations,rows:()=>rows,fail:()=>{fail=true;}};
}
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const guest=make(false);await tick();await guest.view({mapName:"A",imageKey:"image-A"});
 assert.equal(guest.e("map-portal-edit").hidden,true);assert(guest.e("map-portal-pins").innerHTML.includes("門"));assert(!guest.e("map-portal-pins").innerHTML.includes("old"));
 await guest.e("map-portal-edit").trigger("click");assert.equal(guest.e("map-portal-form").hidden,true);
 const admin=make(true);await tick();await admin.view({mapName:"A",imageKey:"image-A"});
 assert.equal(admin.e("map-portal-edit").hidden,false);
 const point=admin.sandbox.XenMapPortals.point({clientX:350,clientY:325},admin.e("map-image"));assert.equal(point.x_norm,500);assert.equal(point.y_norm,500);
 assert.equal(admin.sandbox.XenMapPortals.point({clientX:99,clientY:325},admin.e("map-image")),null);
 await admin.e("map-portal-edit").trigger("click");await admin.e("map-portal-place").trigger("click");await admin.e("map-viewport").trigger("click",{clientX:350,clientY:325});
 admin.e("map-portal-destination").value="unknown";await admin.e("map-portal-form").trigger("submit");assert.equal(admin.count(),0);
 admin.e("map-portal-destination").value="B";await admin.e("map-portal-form").trigger("submit");assert.equal(admin.count(),1);assert.equal(admin.rows().find(r=>r.id==="new-1").x_norm,500);
 await admin.e("map-portal-form").trigger("submit");assert.equal(admin.count(),1,"closed form must not duplicate saves");
 await admin.e("map-portal-list").trigger("click",{target:{closest:sel=>sel.includes("edit")?{dataset:{editPortal:"new-1"}}:null}});
 await admin.e("map-portal-place").trigger("click");await admin.e("map-viewport").trigger("click",{clientX:450,clientY:375});await admin.e("map-portal-form").trigger("submit");assert.equal(admin.rows().find(r=>r.id==="new-1").x_norm,700);
 await admin.view({mapName:"A",imageKey:"new-image"});assert.equal(admin.e("map-portal-pins").innerHTML,"","image replacement must hide older coordinates");
 await admin.view({mapName:"A",imageKey:"image-A"});
 await admin.e("map-portal-list").trigger("click",{target:{closest:sel=>sel.includes("delete")?{dataset:{deletePortal:"new-1"}}:null}});assert(!admin.rows().some(r=>r.id==="new-1"));
 await admin.e("map-portal-edit").trigger("click");await admin.e("map-portal-place").trigger("click");await admin.e("map-viewport").trigger("click",{clientX:350,clientY:325});admin.fail();await admin.e("map-portal-form").trigger("submit");assert.match(admin.e("map-portal-status").textContent,/保存できません/);assert.equal(admin.e("map-portal-save").disabled,false);
 console.log("PASS: shared portal read, admin-only controls, image isolation, zoom coordinates, create/move/delete, unknown destination rejection, save failure and duplicate protection");
})().catch(e=>{console.error(e);process.exitCode=1;});
