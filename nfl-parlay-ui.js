(()=>{'use strict';
const $=s=>document.querySelector(s);
function emptyMessage(report,count,state){
 if(!report)return '';
 const lead=state.recommendationTier==='ideas'?'No compatible '+count+'-leg ideas. ':'No qualifying picks for a '+count+'-leg parlay. ';
 if(!report.checked)return lead+'No selections for this date and filters. Try Next slate.';
 if(state.requirePlayerProp&&!report.eligible?.some(x=>x.market?.player))return lead+'No player prop passed. Review the exclusions or choose another game.';
 const n=report.eligible?.length||0;
 if(n)return lead+(n<count?'Only '+n+' selection'+(n===1?'':'s')+' passed. ':'The eligible legs cannot form this build. ')+(count>2?'Try fewer legs.':state.lineMode==='standard'?'Try Standard + ALT in Filters.':'Choose another game or review Filters.');
 const reason=report.reasons?.[0]?.[0]||'No selections passed the checks';
 return lead+reason+'. '+(/uncertainty buffer|50%/.test(reason)&&state.lineMode==='standard'?'Try Standard + ALT in Filters.':'Review the exclusions or choose another game.');
}
function propCategory(reason){
 if(/role|playing time|workload|opportunity|activity/i.test(reason))return 'Role';
 if(/history|projection|sample|completed.game/i.test(reason))return 'History';
 if(/price|buffer|edge|spread too wide/i.test(reason))return 'Price';
 if(/injury|unavailable|roster/i.test(reason))return 'Availability';
 return 'Reliability';
}
function propReport(game,state,forecast,isEligible=()=>true){
 const loaded=(game?.markets||[]).filter(m=>m.player),groups=new Map();let selectedQuotes=0;
 for(const m of loaded){
  if(!isEligible(m)||!window.NFL_ALT_LINES?.selected(m,state.selectedMarkets)||!window.NFL_ALT_LINES.matches(m,state.lineMode))continue;
  selectedQuotes++;
  const f=forecast(m),q={...window.PICK_QUALITY.assess('nfl',m,f,{parlay:true,game})};
  if(q.pass&&window.NFL_ALT_IDEAS?.active?.(state)&&q.conservativeP<.55){q.pass=false;q.reason='Conservative ALT requires a buffered likelihood of at least 55%';}
  if(!groups.has(m.player))groups.set(m.player,[]);groups.get(m.player).push({m,f,q});
 }
 const players=[...groups].map(([player,rows])=>{
  const passed=rows.filter(x=>x.q.pass);
  rows.sort((a,b)=>Number(b.q.pass)-Number(a.q.pass)||Number(b.q.dataPass)-Number(a.q.dataPass)||Number(a.m.point)-Number(b.m.point));
  const best=rows[0],history=best.m.propHistoryStatus,role=best.f.roleChange;
  let reason=passed.length?passed.map(x=>x.m.name).join('; '):best.q.reason||'No qualifying threshold';
  if(!passed.length&&reason==='Edge does not clear uncertainty buffer')reason='Current price does not clear the value check.';
  if(!passed.length&&reason==='Independent projection too thin')reason='Not enough verified player history for this market.';
  if(!passed.length&&reason==='Unvalidated longshot; insufficient reliability')reason='This threshold exceeds the reliability limit for an unvalidated estimate.';
  if(!passed.length&&history&&/sample|activity/i.test(reason))reason+=' ('+history.activeGames+' active game'+(history.activeGames===1?'':'s')+' in the last '+history.teamGames+' team games).';
  if(!passed.length&&/Increased role/.test(reason)&&role?.baseline!=null){
   const metric=['receiving','receptions'].includes(best.m.type)?'targets':'attempts';
   reason='Recent '+metric+' rose from '+role.baseline.toFixed(1)+' to '+role.recent.toFixed(1)+'; the adverse-workload scenario or supporting evidence does not clear the price check.';
  }
  return {player,qualified:passed.length>0,category:passed.length?'Qualified':propCategory(best.q.reason||''),reason,thresholds:rows.length,qualifiedThresholds:passed.length};
 }).sort((a,b)=>Number(b.qualified)-Number(a.qualified)||a.player.localeCompare(b.player));
 return {loadedQuotes:loaded.length,selectedQuotes,players,qualifiedPlayers:players.filter(x=>x.qualified).length};
}
// Coverage calculations remain available; the diagnostic panel is retired.
function renderPropCoverage(){
 if(typeof document!=='undefined')$('#nflPropCoverage')?.remove();
}
function mount(){
 const controls=$('#parlayControls'),tier=$('#nflRecommendationTierWrap'),markets=$('#nflMarketFilters');
 if(!controls||!tier||!markets)return;
 const main=document.createElement('div');main.id='nflMainControls';main.className='nfl-main-controls';
 const mode=document.createElement('div');mode.className='field nfl-game-mode';
 const label=document.createElement('span');label.className='nfl-control-label';label.textContent='Game mode';mode.append(label);
 const tabs=$('.mode-tabs');if(tabs)mode.append(tabs);
 main.append(mode,tier);const game=$('#gameChooserWrap');if(game)main.append(game);
 controls.prepend(main);
 const filters=document.createElement('details');filters.id='nflParlayFilters';filters.className='nfl-parlay-filters';filters.innerHTML='<summary>Filters</summary><div class="nfl-filter-content"></div>';
 const content=filters.querySelector('div'),lines=$('#nflLinesWrap'),required=$('#nflRequireProp')?.closest('label');
 if(lines)content.append(lines);if(required)content.append(required);
 markets.open=true;content.append(markets);main.after(filters);
 const quality=$('.quality-settings'),home=$('.parlay-options-row');
 function sync(){
  const nfl=(window.__ACTIVE_SPORT||'nfl')==='nfl';main.hidden=filters.hidden=!nfl;
  $('#nflManualAlt')?.remove();
  $('#nflPropCoverage')?.remove();
  if(quality&&!$('#sharedBuilder')){const target=nfl?main:home;if(target&&quality.parentElement!==target)target.append(quality);}
 }
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-sport']});sync();
}
window.NFL_PARLAY_UI={emptyMessage,propReport,renderPropCoverage};
if(typeof document!=='undefined'){
 const ready=()=>setTimeout(mount,0);
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ready,{once:true}):ready();
}
})();
