(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let busy=false;

function ensureAnalysis(){
  let d=$('#moreAnalysis');
  if(d)return d;
  d=document.createElement('details');
  d.id='moreAnalysis';
  d.className='more-analysis';
  d.innerHTML='<summary><span>More Analysis</span><small>Consensus · secondary picks · diagnostics</small></summary><div id="analysisSecondary" class="analysis-secondary"></div><div id="analysisConsensus"></div>';
  const results=$('#results');
  (results?.parentElement||$('.shell'))?.appendChild(d);
  return d;
}

function moveConsensus(){
  const d=ensureAnalysis(),host=d.querySelector('#analysisConsensus'),p=$('#predictionPanel');
  if(p&&p.parentElement!==host)host.appendChild(p);
}

function compactNFLCards(){
  const grid=$('#qolV3 .qgrid'),secondary=ensureAnalysis().querySelector('#analysisSecondary');
  if(!grid)return;
  const cards=[...grid.children].filter(x=>x.classList.contains('qcard'));
  cards.forEach(c=>c.classList.remove('compact-primary','compact-secondary'));
  secondary.querySelectorAll('[data-compact-origin="nfl"]').forEach(x=>x.remove());

  const pass=cards.filter(c=>c.classList.contains('pass')||/NO BET QUALIFIES/i.test(c.textContent));
  if(cards.length&&pass.length===cards.length){
    cards.forEach((c,i)=>{c.style.display=i===0?'':'none'; if(i===0)c.classList.add('compact-primary')});
    grid.classList.add('compact-single');
    return;
  }
  grid.classList.remove('compact-single');
  cards.forEach((c,i)=>{
    const primary=i===0||i===2;
    c.style.display=primary?'':'none';
    c.classList.toggle('compact-primary',primary);
    if(!primary){
      const clone=c.cloneNode(true);clone.style.display='';clone.dataset.compactOrigin='nfl';clone.classList.add('compact-secondary');secondary.appendChild(clone);
    }
  });
}

function compactSportResults(){
  const sport=window.__ACTIVE_SPORT||'nfl';
  document.body.dataset.sport=sport;
  const secondary=ensureAnalysis().querySelector('#analysisSecondary');
  secondary.querySelectorAll('[data-compact-origin="sport"]').forEach(x=>x.remove());
  if(sport==='nfl')return;
  const cards=[...$$('#results > .parlay-card')];
  cards.forEach(c=>{c.style.display='';c.classList.remove('compact-secondary')});
  if(cards.length<=2)return;
  cards.slice(1,-1).forEach(c=>{
    const clone=c.cloneNode(true);clone.dataset.compactOrigin='sport';clone.classList.add('compact-secondary');secondary.appendChild(clone);
    c.style.display='none';
  });
}

function tidy(){
  if(busy)return;busy=true;
  try{
    ensureAnalysis();
    moveConsensus();
    compactSportResults();
    const sgp=$('#nflSgpSection');if(sgp)sgp.style.display='none';
    const week=$('#nflWeekWrap');if(week)week.style.display=(window.__ACTIVE_SPORT||'nfl')==='nfl'?'':'none';
    const title=$('#resultsTitle');if(title&&/Recommendations$/i.test(title.textContent))title.textContent='Recommended Parlay';
  }finally{busy=false}
}
let timer;
const obs=new MutationObserver(muts=>{if(muts.some(m=>m.target?.closest?.('#results,#predictionPanel'))) {clearTimeout(timer);timer=setTimeout(tidy,80)}});
function init(){obs.observe(document.body,{subtree:true,childList:true});tidy()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
window.COMPACT_UI={refresh:tidy};
})();