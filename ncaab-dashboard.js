(()=>{'use strict';
const sport='ncaab',$=s=>document.querySelector(s),esc=s=>window.MARKET_GUARDS.esc(String(s??''));
let snapshot=null,loaded=0,sequence=0;
const pregame=m=>m.game_status==='pre'&&!!m.game_id&&!!m.game_label&&window.MARKET_GUARDS.pregame(m);
const fresh=m=>{const at=Date.parse(m.quotedAt);return Number.isFinite(at)&&Date.now()-at>=-300000&&Date.now()-at<=1800000};
const rows=()=> (snapshot?.markets||[]).filter(m=>pregame(m)&&fresh(m)&&window.SPORT_MARKETS?.allowed(sport,m)&&(!window.SLATE_UI||window.SLATE_UI.matches(sport,m))&&window.MARKET_GUARDS.quote(m)!==null);
function controls(){window.SPORT_MARKETS?.activate?.()}
function render(){
 if(window.__ACTIVE_SPORT!==sport)return;
 window.EXTRA_PICKS?.clear?.();
 const markets=(snapshot?.markets||[]).filter(pregame),games=(snapshot?.slate?.games||[]).filter(pregame);
 window.SLATE_UI?.prepare(sport,[...markets,...games]);
 window.SPORT_MARKETS?.sync(sport,markets.filter(m=>!window.SLATE_UI||window.SLATE_UI.matches(sport,m)),render);
 // Reference prices are observations, never independent model forecasts.
 window.PICK_QUALITY?.prepare(sport,markets,{},[],snapshot?.updated_at);
 window.PICK_OF_DAY?.show?.(sport);
 $('#resultsTitle').textContent='NCAA Basketball';
 const selected=games.filter(g=>!window.SLATE_UI||window.SLATE_UI.matches(sport,g)).sort((a,b)=>Date.parse(a.game_time)-Date.parse(b.game_time));
 const quoted=rows();
 const when=g=>new Date(g.game_time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 let html='<div class="empty">NCAAB model picks are not available yet. Current team lines are shown below.</div>';
 for(const game of selected){
  const prices=quoted.filter(m=>String(m.game_id)===String(game.game_id));
  const logos=['away','home'].map(side=>{const t=game[side];return /^\d+$/.test(t?.id)?'<img class="sport-media-img sport-logo" src="https://a.espncdn.com/i/teamlogos/ncaa/500/'+t.id+'.png" alt="'+esc(t.displayName)+' logo" loading="lazy">':''}).join('');
  html+='<article class="control-card ncaab-market-card"><div class="parlay-top"><div><span class="grade">TEAM LINES</span><h3 class="parlay-name">'+esc(game.game_label)+'</h3></div></div><p class="summary">'+esc(when(game))+'</p><div class="legs">'+(prices.length?prices.map(m=>'<div class="leg sport-visual-leg"><div class="sport-visual-copy"><div class="leg-title">'+esc(m.label)+'</div><div class="leg-sub">'+esc(m.kind==='total'?'Game total':m.kind==='spread'?'Spread':'Moneyline')+' · Implied '+Math.round(m.probability*100)+'%</div></div><div class="leg-quote">'+esc(window.PICK_QUALITY.quoteLabel(sport,m))+'</div></div>').join(''):'<div class="leg"><div class="leg-sub">No current prices for these filters.</div></div>')+'</div><div class="card-footer"><span>'+logos+'</span><span>ESPN sportsbook reference</span></div></article>';
 }
 if(!selected.length)html='<div class="empty">No upcoming NCAA basketball games for this date.</div>';
 $('#results').innerHTML=html;
 $('#dataStatus').textContent='NCAAB · ESPN · '+selected.length+' games · '+quoted.length+' current team lines';
 window.COMPACT_UI?.refresh?.();
}
async function load(){
 const request=++sequence,token=window.__SPORT_TOKEN,ui=window.DASHBOARD_UI?.begin(sport);
 window.DASHBOARD_UI?.placeholder(sport);
 try{
  const r=await fetch('data/kalshi-ncaab.json?ts='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Feed unavailable');
  const d=await r.json();if(!Array.isArray(d.markets)||!Array.isArray(d.slate?.games)||!window.MARKET_GUARDS.fresh(d,.5))throw Error('Feed delayed');
  if(request!==sequence||window.__ACTIVE_SPORT!==sport||window.__SPORT_TOKEN!==token)return;
  snapshot=d;loaded=Date.now();window.FEED_FRESHNESS?.set(sport,d.updated_at);render();
 }catch(error){
  if(request!==sequence||window.__ACTIVE_SPORT!==sport||window.__SPORT_TOKEN!==token)return;
  snapshot=null;loaded=0;window.SLATE_UI?.prepare(sport,[]);window.SPORT_MARKETS?.sync(sport,[],render);window.PICK_QUALITY?.prepare(sport,[]);window.PICK_OF_DAY?.show?.(sport);
  $('#dataStatus').textContent='NCAAB feed unavailable or delayed';$('#results').innerHTML='<div class="empty">NCAA basketball feed is refreshing. Try again shortly.</div>';
 }finally{window.DASHBOARD_UI?.end(ui)}
}
window.NCAAB_DASHBOARD={load,refresh:render,controls,availableCount:()=>0,historyPicks:()=>[],showCached:()=>{if(!loaded||Date.now()-loaded>60000)return false;render();return true},setLegs:n=>{window.DASHBOARD_UI?.put(sport,'legs',Math.max(2,Math.min(3,Number(n)||2)));render()}};
window.setInterval?.(()=>{if(window.__ACTIVE_SPORT===sport&&loaded)render()},30000);
})();
