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

function ensureOverview(){
  let panel=$('#sportOverview');
  if(panel)return panel;
  const switcher=$('#sportSwitch');
  if(!switcher)return null;
  panel=document.createElement('section');
  panel.id='sportOverview';
  panel.className='sport-overview';
  panel.setAttribute('aria-live','polite');
  panel.innerHTML='<div class="overview-label"><span id="overviewSport">NFL</span><small>FEATURED PICK</small></div><div class="overview-content"><strong id="overviewPick">Loading NFL picks…</strong><span id="overviewDetail"></span></div>';
  switcher.insertAdjacentElement('afterend',panel);
  return panel;
}

function updateOverview(){
  const panel=ensureOverview();if(!panel)return;
  const sport=(window.__ACTIVE_SPORT||'nfl').toUpperCase();
  let pick='',detail='';
  if(sport==='NFL'){
    const card=$('#qolV3 .qgrid .qcard');
    if(card?.classList.contains('pass')){
      pick=/loading/i.test(card.textContent)?'Loading NFL picks…':'No bet qualifies';
      detail=/loading/i.test(card.textContent)?'':'No high-confidence edge right now';
    }else if(card){
      pick=card.querySelector('.ticket-main h3,.qtitle h3')?.textContent?.trim()||'No bet qualifies';
      detail=card.querySelector('.ticket-main p,.qcard>p')?.textContent?.trim()||'';
    }
  }else{
    const card=$('#results > .parlay-card');
    pick=card?.querySelector('.leg-title')?.textContent?.replace(/^\d+\.\s*/,'').trim()||'';
    detail=card?.querySelector('.parlay-name')?.textContent?.trim()||'';
    const context=card?.querySelector('.leg-sub')?.textContent?.split(' · ')[0]?.trim()||'';
    if(context&&!/^(moneyline|run line|team\/game total|pitcher strikeouts|hits|home runs|rbi|total bases)$/i.test(context)&&!pick.includes(context))detail+=(detail?' · ':'')+context;
    if(!pick&&$('#results > .empty')&&!/loading/i.test($('#results > .empty').textContent))pick='No qualifying pick right now';
  }
  for(const [selector,value] of [['#overviewSport',sport],['#overviewPick',pick||`Loading ${sport} picks…`],['#overviewDetail',detail]]){
    const node=panel.querySelector(selector);if(node.textContent!==value)node.textContent=value;
  }
}

function moveNflCard(){
  const card=$('#qolV3'),secondary=ensureAnalysis().querySelector('#analysisSecondary');
  if(card&&card.parentElement!==secondary)secondary.prepend(card);
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
    moveNflCard();
    compactSportResults();
    updateOverview();
    const sgp=$('#nflSgpSection');if(sgp)sgp.style.display='none';
    const week=$('#nflWeekWrap');if(week)week.style.display=(window.__ACTIVE_SPORT||'nfl')==='nfl'?'':'none';
  }finally{busy=false}
}
let timer;
const obs=new MutationObserver(muts=>{if(muts.some(m=>m.target?.closest?.('#results,#predictionPanel,#qolV3 .qgrid'))) {clearTimeout(timer);timer=setTimeout(tidy,80)}});
function init(){obs.observe(document.body,{subtree:true,childList:true});tidy()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
window.COMPACT_UI={refresh:tidy};
})();
