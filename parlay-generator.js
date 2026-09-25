(()=>{'use strict';
const clamp=n=>Math.max(2,Math.min(6,Number(n)||2));
function sport(){return window.__ACTIVE_SPORT||'nfl'}
function count(){return clamp(document.querySelector('#legsSelect')?.value)}
function syncLabel(){const b=document.querySelector('#generateBtn');if(!b)return;const s=sport();b.disabled=false;b.textContent='Generate '+s.toUpperCase()+' '+count()+'-Leg Parlay'}
async function run(){
 const s=sport(),token=window.__SPORT_TOKEN,n=count(),b=document.querySelector('#generateBtn');
 if(b){b.disabled=true;b.textContent='Generating…'}
 try{
   if(s==='nfl'){
     if(typeof window.generate==='function')await window.generate();
     else throw Error('NFL generator unavailable');
   }else if(s==='mlb'){
     if(!window.MLB_DASHBOARD?.setLegs)throw Error('MLB generator unavailable');
     window.MLB_DASHBOARD.setLegs(n);
   }else if(s==='ncaaf'){
     if(!window.NCAAF_DASHBOARD?.setLegs)throw Error('NCAAF generator unavailable');
     window.NCAAF_DASHBOARD.setLegs(n);
   }else if(s==='ufc'){
     if(!window.UFC_DASHBOARD?.setLegs)throw Error('UFC generator unavailable');
     window.UFC_DASHBOARD.setLegs(n);
   }
 }catch(e){
   if(s!==sport()||token!==window.__SPORT_TOKEN)return;
   console.error('Parlay generation failed',e);
   const r=document.querySelector('#results');if(r)r.innerHTML='<div class="empty">Parlay generator error: '+String(e.message||e)+'</div>';
 }finally{syncLabel()}
}
function init(){
 const sel=document.querySelector('#legsSelect'),btn=document.querySelector('#generateBtn');
 if(sel){sel.onchange=null;sel.addEventListener('change',()=>{syncLabel();run()})}
 if(btn){btn.onclick=null;btn.addEventListener('click',e=>{e.preventDefault();run()})}
 document.addEventListener('click',e=>{if(e.target.closest?.('.sport-switch [data-sport]'))setTimeout(syncLabel,0)});
 syncLabel();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
window.PARLAY_GENERATOR={run,syncLabel,count};
})();