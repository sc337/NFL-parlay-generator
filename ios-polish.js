(()=>{'use strict';
const snapshots={};
const sport=()=>window.__ACTIVE_SPORT||'nfl';
const source=()=>document.querySelector('#dataStatus')?.textContent||'';
const minutes=s=>Number.isFinite(snapshots[s])?Math.max(0,Math.floor((Date.now()-snapshots[s])/60000)):null;
function label(s,{loading=false,unavailable=false,delayed=false}={}){
  if(unavailable)return 'Feed unavailable';
  if(loading)return 'Refreshing…';
  const age=minutes(s);
  if(age===null)return null;
  return (delayed||age>30?'Delayed · ':'Updated ')+(age<1?'just now':age+'m ago');
}
function update(){
  const s=sport(),raw=source(),age=minutes(s),unavailable=/unavailable|no live|error|failed/i.test(raw),loading=/loading|refreshing|initializing|waiting|checking/i.test(raw),delayed=/\bdelayed\b|\bstale\b/i.test(raw)||age!==null&&age>30;
  const status=document.querySelector('.header-status');
  document.body.classList.toggle('feed-delayed',!!delayed&&!loading&&!unavailable);
  if(status){status.classList.toggle('is-delayed',!!delayed&&!loading&&!unavailable);status.classList.toggle('is-unavailable',unavailable);const badge=status.querySelector('#statusLabel');const short=label(s,{loading,unavailable,delayed});if(badge&&short)badge.textContent=short;status.title=raw}
}
function set(s,stamp){const ms=Date.parse(stamp||'');if(Number.isFinite(ms)){snapshots[s]=ms;update()}}
async function refresh(){
  const button=document.querySelector('#feedRefresh');if(!button||button.disabled)return;
  const active=sport();button.disabled=true;button.classList.add('refreshing');
  try{
    const status=document.querySelector('#dataStatus');if(status)status.textContent='Refreshing '+active.toUpperCase()+' markets…';
    update();
    if(active==='nfl')await window.NFL_NO_DEMO?.load?.();
    else if(active==='mlb')await window.MLB_DASHBOARD?.load?.();
    else if(active==='ncaaf')await window.NCAAF_DASHBOARD?.load?.();
    else if(active==='nhl')await window.NHL_DASHBOARD?.load?.();
    else if(active==='ufc')await window.UFC_DASHBOARD?.load?.();
    else if(active==='bankroll')await window.BANKROLL_FEED?.refresh?.();
  }finally{button.disabled=false;button.classList.remove('refreshing');update()}
}
function mount(){
  const status=document.querySelector('.header-status');
  if(status&&!document.querySelector('#feedRefresh')){
    const button=document.createElement('button');button.id='feedRefresh';button.type='button';button.className='feed-refresh';button.setAttribute('aria-label','Refresh current sport markets');button.title='Refresh current sport markets';button.textContent='↻';
    status.after(button);button.addEventListener('click',refresh);
  }
  new MutationObserver(update).observe(document.querySelector('#dataStatus'),{childList:true,characterData:true,subtree:true});
  new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['data-sport']});
  setInterval(update,60000);update();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
window.FEED_FRESHNESS={set,label,update};
})();
