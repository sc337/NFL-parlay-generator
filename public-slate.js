(()=>{'use strict';
const feeds=new Map();let host;
function set(sport,snapshot){feeds.set(sport,snapshot?.slate||null);render()}
function render(){
 const sport=window.__ACTIVE_SPORT||'nfl',slate=feeds.get(sport);
 if(sport==='ncaaf'||!slate?.games?.length){if(host)host.hidden=true;return}
 const esc=window.MARKET_GUARDS?.esc;if(!esc)return;
 const games=slate.games.filter(g=>Date.parse(g.game_time)>Date.now()&&(!window.SLATE_UI||window.SLATE_UI.matches(sport,g)));
 if(!games.length){if(host)host.hidden=true;return}
 if(!host){host=document.createElement('section');host.id='publicSlate';document.querySelector('#results')?.after(host)}
 const markets=window.PICK_QUALITY?.markets(sport)||[],age=Date.now()-Date.parse(slate.updated_at),expired=!Number.isFinite(age)||age>2*3600000;
 const rows=games.sort((a,b)=>Date.parse(a.game_time)-Date.parse(b.game_time)).map(g=>{
  const quotes=markets.filter(m=>String(m.game_id||m.gameId)===String(g.game_id));
  const refs=quotes.filter(m=>m.referenceOnly&&Date.now()-Date.parse(m.quotedAt)<=1800000).length;
  const current=quotes.filter(m=>{const q=window.PICK_QUALITY.quote(sport,m);return q.p>0&&Date.now()-Date.parse(q.checkedAt)<=1800000}).length;
  const note=expired?'Schedule reference expired':!current?'Schedule only · No current quoted markets':refs?refs+' public reference selections · Verify at your book':'Native market coverage';
  const when=new Date(g.game_time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  return '<div class="leg"><div class="leg-title">'+esc(g.game_label)+'</div><div class="leg-sub">'+esc(when)+' · '+esc(note)+'</div></div>';
 }).join('');
 const html='<details class="parlay-card"><summary>Full '+sport.toUpperCase()+' Slate · '+games.length+' '+(sport==='ufc'?'fights':'games')+'</summary><p class="summary">ESPN schedule · Public sportsbook references fill missing selections. Independent models and availability checks still apply.</p><div class="legs">'+rows+'</div></details>';
 host.hidden=false;if(host.__markup!==html){host.__markup=html;host.innerHTML=html}
}
window.PUBLIC_SLATE={set,render};
const init=()=>{if(typeof MutationObserver==='undefined')return;const observer=new MutationObserver(render);const results=document.querySelector('#results');if(results)observer.observe(results,{childList:true});observer.observe(document.body,{attributes:true,attributeFilter:['data-sport']})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
