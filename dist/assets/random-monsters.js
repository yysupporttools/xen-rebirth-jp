(() => {
 "use strict";
 if(window.self!==window.top)return;
 const monsters=["halloween-starbear","gardiant","ice-tiger","snow-shoveler","brown-puppy","blue-rabbit","golden-warrior"];
 const randomIndex = count => Math.floor(Math.random()*count);
 const shuffled = monsters.slice();
 for(let i=shuffled.length-1;i>0;i--){const j=randomIndex(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 let cursor=0;
 function nextMonster(){
  if(cursor===shuffled.length)cursor=0;
  return shuffled[cursor++];
 }
 function artwork(kind,eager=false) {
  const image=document.createElement("img");
  image.className="xen-random-monster "+kind;
  image.src="assets/monsters/chibi/"+nextMonster()+".webp";
  image.alt="";
  image.width=384;image.height=384;
  image.decoding="async";image.loading=eager?"eager":"lazy";
  image.setAttribute("aria-hidden","true");
  image.addEventListener("error",()=>image.remove(),{once:true});
  return image;
 }
 function init(){
  if(document.documentElement.dataset.randomMonsters)return;
  const heading=document.querySelector("main h1")||document.querySelector("h1");
  if(!heading)return;
  document.documentElement.dataset.randomMonsters="ready";
  const welcome=heading.closest(".welcome");
  if(welcome){
   const foot=welcome.querySelector(".welcome-foot");
   if(foot){
    const copy=document.createElement("div");copy.className="xen-welcome-footer-copy";
    while(foot.firstChild)copy.appendChild(foot.firstChild);
    foot.append(copy,artwork("xen-random-hero",true));
    foot.classList.add("xen-random-welcome-foot");
   }
   welcome.classList.add("xen-has-random-monsters");
  }else{
   let intro=heading.closest(".page-intro");
   if(intro){
    const copy=document.createElement("div");copy.className="xen-monster-intro-copy";
    while(intro.firstChild)copy.appendChild(intro.firstChild);
    intro.append(copy,artwork("xen-random-intro",true));
   }else{
    intro=document.createElement("div");intro.className="xen-monster-heading";
    const copy=document.createElement("div");copy.className="xen-monster-intro-copy";
    const previous=heading.previousElementSibling;
    const lead=heading.nextElementSibling;
    heading.before(intro);
    if(previous?.classList.contains("eyebrow"))copy.appendChild(previous);
    copy.appendChild(heading);
    if(lead?.matches("p.lead"))copy.appendChild(lead);
    intro.append(copy,artwork("xen-random-intro",true));
   }
   intro.classList.add("xen-has-random-monsters");
  }
  document.querySelectorAll(".guide-grid .guide-card").forEach(card=>{
   card.classList.add("xen-random-guide-card");
   const footer=document.createElement("div");footer.className="xen-random-guide-footer";
   const link=card.querySelector(".card-link");
   if(link)footer.appendChild(link);
   footer.appendChild(artwork("xen-random-card"));
   card.appendChild(footer);
  });
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
