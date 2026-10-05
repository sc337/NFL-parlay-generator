(()=>{'use strict';
const clamp=n=>Math.max(2,Math.min(6,Number(n)||2));
function sport(){return window.__ACTIVE_SPORT||'nfl'}
function count(){return clamp(document.querySelector('#legsSelect')?.value)}
let running=null,queued=false;
function syncLabel(){const b=document.querySelector('#generateBtn');if(!b)return;const s=sport();if(running&&running.sport===s&&running.token===window.__SPORT_TOKEN){b.disabled=true;b.textContent='Generating…';b.setAttribute('aria-busy','true');return}if(window.DASHBOARD_UI?.isUpdating?.()){b.disabled=true;b.textContent='Updating picks…';b.setAttribute('aria-busy','true');return}b.removeAttribute('aria-busy');const available=s==='ufc'?window.UFC_DASHBOARD?.availableCount?.():null;const missingNfl=s==='nfl'&&window.NFL_NO_DEMO&&!window.NFL_NO_DEMO.hasLiveGames();b.disabled=missingNfl||available!==null&&available!==undefined&&available<count();b.textContent=missingNfl?'Refresh NFL feed':b.disabled?'No positive-EV UFC '+count()+'-Leg Available':s==='nfl'?'Generate NFL '+count()+'-Leg Parlays':'Generate Best '+s.toUpperCase()+' '+count()+'-Leg Parlay'}
async function run(){
 if(running&&running.sport===sport()&&running.token===window.__SPORT_TOKEN){if(running.count!==count())queued=true;return}

 const s=sport(),token=window.__SPORT_TOKEN,n=count(),b=document.querySelector('#generateBtn');
 const job={sport:s,token,count:n};running=job;window.DASHBOARD_UI?.put(s,'legs',n);const uiRequest=window.DASHBOARD_UI?.begin(s);
 if(b){b.disabled=true;b.textContent='Generating…';b.setAttribute('aria-busy','true')}
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(s!==sport()||token!==window.__SPORT_TOKEN){if(running===job)running=null;window.DASHBOARD_UI?.end(uiRequest);syncLabel();return}
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
   }else if(s==='nhl'){
     if(!window.NHL_DASHBOARD?.setLegs)throw Error('NHL generator unavailable');
     window.NHL_DASHBOARD.setLegs(n);
   }else if(s==='ufc'){
     if(!window.UFC_DASHBOARD?.setLegs)throw Error('UFC generator unavailable');
     window.UFC_DASHBOARD.setLegs(n);
   }
 }catch(e){
   if(s!==sport()||token!==window.__SPORT_TOKEN)return;
   console.error('Parlay generation failed',e);
   const r=document.querySelector('#results');if(r)r.innerHTML='<div class="empty">Parlay generator error: '+String(e.message||e)+'</div>';
 }finally{window.DASHBOARD_UI?.end(uiRequest);if(running===job){running=null;syncLabel();if(queued){queued=false;run()}}}
}
function init(){
 const sel=document.querySelector('#legsSelect'),btn=document.querySelector('#generateBtn');
 if(sel){sel.onchange=null;sel.addEventListener('change',()=>{syncLabel();run()})}
 if(btn){btn.onclick=null;btn.addEventListener('click',e=>{e.preventDefault();run()})}
 syncLabel();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
window.PARLAY_GENERATOR={run,syncLabel,count};
})();
