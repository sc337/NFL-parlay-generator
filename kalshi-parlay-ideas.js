(()=>{'use strict';
// Reference-market ideas, not an alternative EV model. Strict PICK_QUALITY is unchanged.
const supported=new Set(['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions']);
const straightOnly=new Set(['player_rush_attempts','player_pass_attempts','player_pass_completions']);
const active=s=>!!s&&!s.apiKey&&(s.recommendationTier||'screened')==='ideas';
function assess(m,game,state){
 const q=window.PICK_QUALITY.quote('nfl',m),now=Date.now(),start=Date.parse(game?.commence_time||''),at=Date.parse(q.checkedAt||''),contextAt=Date.parse(game?.context?.updated_at||'');
 const key=String(m.marketKey||m.type).replace(/_alternate$/,''),injury=String(m.contextSignals?.injury_status||'').toLowerCase();
 let reason=null,coverage=0;
 if(window.SLATE_UI&&!window.SLATE_UI.matches('nfl',m,game?.commence_time))reason='Outside selected date';
 else if(!active(state))reason='Matchup ideas require reference-feed mode';
 else if(m.context_unmatched===true)reason='Matchup context unverified';
 else if(m.referenceOnly ? !window.ESPN_EVIDENCE?.contract('nfl',m,game,now) : q.source!=='Kalshi'||game?.dataSource!=='Kalshi')reason='Verified Kalshi or ESPN reference required';
 else if(!Number.isFinite(start)||start<=now||game.game_status!=='pre')reason='Verified upcoming game required';
 else if(!Number.isFinite(at)||at>now+60000||now-at>30*60000)reason='Quote older than 30 minutes';
 else if(!(q.p>=.40&&q.p<=.85))reason='Reference price outside idea limits';
 else if(!Number.isFinite(Number(m.sourceQuality))||Number(m.sourceQuality)<60)reason='Source quality too low';
 else if(m.type==='td')reason='TD estimates remain straight only';
 else if(straightOnly.has(key))reason='Caesars straight only';
 else if(window.PICK_QUALITY.unsupportedAltUnder(m))reason='ALT player-prop unders unsupported at your book';
 else if(window.NFL_ALT_LINES?.unsupportedIncrement?.(m))reason='ALT yardage requires a quoted 10-yard milestone';
 else if(m.spread!=null&&(!Number.isFinite(Number(m.spread))||Number(m.spread)<0||Number(m.spread)>.10))reason='Quote spread too wide';
 else if(!Number.isFinite(contextAt)||contextAt>now+60000||now-contextAt>4*3600000)reason='Matchup context stale or unavailable';
 else if(m.player){
  const h=m.propHistory,values=h?.metrics?.[key],latest=Date.parse(h?.latest_game+'T23:59:59Z');
  if(!supported.has(key))reason='Unsupported parlay-idea prop';
  else if(m._rosterVerified!==true||m._invalidRoster||![game.away,game.home].includes(m.team))reason='Roster unverified';
  else if(!injury||/unknown|unconfirmed/.test(injury)||m.contextSignals?.injury_checked!==true)reason='Injury status unconfirmed';
  else if(/out|doubtful|inactive|questionable|suspended|injured reserve|\bir\b|pup|nfi/.test(injury))reason='Player availability uncertain';
  else if(h?.source!=='nflverse completed plays'||h.games<3||h.played<3||h.played>h.games||h.played/h.games<.6||!Array.isArray(values)||values.length!==h.games||values.some(v=>typeof v!=='number'||!Number.isFinite(v))||!Number.isFinite(latest)||latest>=now||latest>=start||start-latest>28*86400000)reason='Insufficient recent player usage';
  else if(m.point==null||m.point===''||!Number.isFinite(Number(m.point))||Number(m.point)<0)reason='Prop threshold unavailable';
  else coverage=Math.min(.55,.3+.05*h.games);
 }else if(!['h2h','spreads','totals'].includes(m.type))reason='Unsupported team market';
 else if(m.type!=='h2h'&&(m.point==null||m.point===''||!Number.isFinite(Number(m.point))))reason='Team threshold unavailable';
 else {
  const form=game.context.recent_form;
  if([game.away,game.home].some(t=>!form?.[t]?.available||form[t].games<3))reason='Insufficient recent team context';
  else coverage=.3;
 }
 if(!reason&&m.player&&window.MODEL_LEARNING){
  const h=m.propHistory,key=m.type==='rushing'?'player_rush_attempts':['receiving','receptions'].includes(m.type)?'targets':'player_pass_attempts';
  const change=window.MODEL_LEARNING.roleChange(h?.opportunities?.[key]||h?.metrics?.[key]);
  if(['falling','rising'].includes(change.status))reason='Recent opportunity changed; waiting for a stable role';
 }
 if(!reason&&m.isAltLine){
  const reference=(game.markets||[]).filter(x=>!x.isAltLine&&x.source===m.source&&x.type===m.type&&String(x.marketKey||x.type).replace(/_alternate$/,'')===key&&x.player===m.player&&(m.type!=='spreads'||x.team===m.team)&&x.side===m.side&&x.point!=null&&Number.isFinite(Number(x.point)))
   .sort((a,b)=>Math.abs(window.PICK_QUALITY.quote('nfl',a).p-.5)-Math.abs(window.PICK_QUALITY.quote('nfl',b).p-.5))[0];
  const limit=m.type==='passing'?50:['rushing','receiving'].includes(m.type)?20:m.type==='receptions'?2:7;
  if(!reference||Math.abs(Number(m.point)-Number(reference.point))>limit)reason='ALT threshold too far from reference';
 }
 const monitored=window.ESPN_EVIDENCE?.inspect(m,now);
 if(!reason&&monitored?.blocked)reason=monitored.blocked;
 const warnings=['Matchup idea; value and win probability unverified',q.source+' reference; verify exact line and SGP price on Caesars',...(monitored?.warnings||[])];
 return {pass:!reason,reason,quote:q,coverage,tier:'idea',validated:false,valueQualified:false,modelP:null,conservativeP:q.p,rankingP:q.p,ev:null,conservativeEV:null,warnings,rank:reason?-999:q.p*100+coverage*8};
}
function checkBuild(legs,state){
 const checks=legs.map(m=>assess(m,window.PICK_QUALITY.gameFor('nfl',m),state));
 return {pass:checks.length>0&&checks.every(x=>x.pass),checks,reason:checks.find(x=>!x.pass)?.reason||null};
}
function scopedGames(games,state,selected){
 return state.mode==='sgp'?games.filter(g=>g.id===selected):games;
}
function report(games,state){
 const reasons=new Map(),eligible=[];let checked=0,props=0;
 for(const game of games)for(const m of game.markets||[]){
  if(!state.selectedMarkets.has(m.type)||!window.NFL_ALT_LINES?.matches(m,state.lineMode))continue;
  if(window.SLATE_UI&&!window.SLATE_UI.matches('nfl',m,game.commence_time))continue;
  checked++;if(m.player)props++;
  const result=active(state)?assess(m,game,state):window.PICK_QUALITY.assess('nfl',m,{modelP:m.modelProbability,rawModelP:m.rawModelProbability,marketP:m.marketProbability,coverage:m.projectionCoverage,uncertainty:m.modelUncertainty,roleStability:m.roleStability,marketAnchored:m.marketAnchored,experimental:m.tdExperimental||m.nflPropExperimental},{game,parlay:true});
  if(result.pass)eligible.push({market:m,game});else reasons.set(result.reason,(reasons.get(result.reason)||0)+1);
 }
 return {eligible,checked,props,reasons:[...reasons].sort((a,b)=>b[1]-a[1]),players:new Set(eligible.filter(x=>x.market.player).map(x=>x.market.player)).size};
}
function emptyMessage(report,count,state){
 const ideas=active(state),n=report?.eligible.length||0;
 const lead='No '+count+'-leg '+(ideas?'matchup idea':'value-screened parlay')+' for these filters. ';
 if(!report?.checked)return lead+'No selections available for the selected date and markets.';
 if(!n)return lead+report.checked+' selections checked; none passed '+(ideas?'the context and data-quality checks.':'the value screen. ')+(ideas?'':report.reasons.length===1&&report.reasons[0][0]==='Edge does not clear uncertainty buffer'?'All failed the model uncertainty buffer.':'Expand the exclusions below for details.');
 return lead+n+' eligible selections'+(report.props?' across '+report.players+' players':'')+'. Try fewer legs or different markets; compatible legs are still required.';
}
function refresh(){
 const host=document.querySelector('#nflRecommendationTierWrap'),s=window.NFL_PARLAY_STATE;if(!host||!s)return;
 host.hidden=!!s.apiKey||(window.__ACTIVE_SPORT||'nfl')!=='nfl';
 host.querySelector('select').value=s.recommendationTier||'screened';
 host.querySelector('small').textContent=active(s)?'Ranks supported matchups using Kalshi or ESPN/DraftKings reference prices and recent context. Value unverified. Verify each line and combined price on Caesars.':'Requires the probability estimate, after an uncertainty deduction, to beat the quoted price. Models remain unvalidated; this mode may return no qualifying picks.';
}
function mount(){
 const anchor=document.querySelector('#nflWeekWrap');if(!anchor)return;
 const field=document.createElement('div');field.id='nflRecommendationTierWrap';field.className='field';
 field.innerHTML='<label for="nflRecommendationTier">Selection mode</label><select id="nflRecommendationTier" aria-describedby="nflIdeasNote"><option value="ideas">Matchup ideas</option><option value="screened">Value-screened</option></select><small id="nflIdeasNote"></small>';
 anchor.before(field);
 field.querySelector('select').addEventListener('change',e=>{const s=window.NFL_PARLAY_STATE;s.recommendationTier=e.target.value;window.DASHBOARD_UI?.put('nfl','tier',s.recommendationTier);refresh();window.generate?.()});
 // TD suggestions are not a parlay market. Preserve a separate scoped drawer.
 document.querySelector('#marketChips [data-market="td"]')?.remove();
 window.NFL_PARLAY_STATE?.selectedMarkets.delete('td');
 const td=document.querySelector('#tdMarketOptions'),results=document.querySelector('#results');
 if(td&&results){const drawer=document.createElement('details');drawer.className='market-filter-details';drawer.id='nflTdStraightDrawer';drawer.innerHTML='<summary>TD straight-only ideas</summary>';drawer.append(td);results.after(drawer)}
 refresh();
}
window.NFL_PARLAY_IDEAS={active,assess,checkBuild,scopedGames,report,emptyMessage,refresh};
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
