(()=>{'use strict';
// Reference-market ideas, not an alternative EV model. Strict PICK_QUALITY is unchanged.
const supported=new Set(['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions']);
const straightOnly=new Set(['player_rush_attempts','player_pass_attempts','player_pass_completions']);
const active=s=>!!s&&!s.apiKey&&(s.recommendationTier||'screened')==='ideas';
const likelihood=s=>s?.recommendationTier==='likelihood';
function assess(m,game,state){
 const q=window.PICK_QUALITY.quote('nfl',m),now=Date.now(),start=Date.parse(game?.commence_time||''),at=Date.parse(q.checkedAt||''),contextAt=Date.parse(game?.context?.updated_at||'');
 const key=String(m.marketKey||m.type).replace(/_alternate$/,''),injury=String(m.contextSignals?.injury_status||'').toLowerCase();
 let reason=null,coverage=0;
 if(window.SELECTION_UI?.excluded?.('nfl',m))return {pass:false,reason:'Selection excluded by you',rank:-999,coverage:0,quote:q};
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
 const altIdeas=!!window.NFL_ALT_IDEAS?.active?.(state);
 const reasons=new Map(),eligible=[],priceWatch=[];let checked=0,props=0,dataReady=0;
 for(const game of games)for(const m of game.markets||[]){
  if(!(window.NFL_ALT_LINES?.selected?.(m,state.selectedMarkets)??state.selectedMarkets.has(m.type))||!window.NFL_ALT_LINES?.matches(m,state.lineMode))continue;
  if(window.SLATE_UI&&!window.SLATE_UI.matches('nfl',m,game.commence_time))continue;
  checked++;if(m.player)props++;
  const result=active(state)?assess(m,game,state):window.PICK_QUALITY.assess('nfl',m,{selectionMode:altIdeas||likelihood(state)?'likelihood':'screened',opportunity:m.opportunity,roleChange:m.roleChange,sensitivity:m.sensitivity,modelP:m.modelProbability,rawModelP:m.rawModelProbability,marketP:m.marketProbability,coverage:m.projectionCoverage,uncertainty:m.modelUncertainty,roleStability:m.roleStability,marketAnchored:m.marketAnchored,experimental:m.tdExperimental||m.nflPropExperimental},{game,parlay:true});
  if(result.pass)eligible.push({market:m,game});else reasons.set(result.reason,(reasons.get(result.reason)||0)+1);
  if(!active(state)&&!likelihood(state)&&result.dataPass){dataReady++;if(!result.pricePass&&result.minimumOdds!=null)priceWatch.push({market:m,game,quality:result});}
 }
 const seen=new Set(),watch=priceWatch.sort((a,b)=>a.quality.priceGap-b.quality.priceGap||String(a.market.ticker).localeCompare(String(b.market.ticker))).filter(({market:m,game:g})=>{const key=g.id+'|'+(m.player||m.type);if(seen.has(key))return false;seen.add(key);return true}).slice(0,3);
 return {eligible,checked,props,screened:!active(state)&&!likelihood(state)&&!altIdeas,dataReady,priceWatch:watch,reasons:[...reasons].sort((a,b)=>b[1]-a[1]),players:new Set(eligible.filter(x=>x.market.player).map(x=>x.market.player)).size};
}
function diagnostics(report){
 if(!report)return '';
 const esc=window.MARKET_GUARDS.esc,fmt=o=>(o>0?'+':'')+o;
 const watch=report.priceWatch||[],summary=report.screened?'<p>'+report.eligible.length+' of '+report.checked+' selections qualified.</p>':'';
 const reasons=report.reasons?.length?'<details><summary>View screening details</summary><p>Data and availability: '+report.dataReady+' of '+report.checked+' passed.</p>'+report.reasons.map(([reason,n])=>'<p>'+esc(reason)+' · '+n+'</p>').join('')+'</details>':'';
 if(!watch.length)return summary+reasons;
 const labels={modelStatus:'Model validation',limitedCoverage:'Limited coverage',modelUncertainty:'Model uncertainty',missingInputs:'Missing inputs',empirical:'Learned buffer'};
 return summary+reasons+'<details><summary>Price watch · '+watch.length+' selections</summary><p>Passed the non-price checks. These are not qualified picks. Targets hold the current estimate fixed; refreshing prices can change that estimate. Recheck the model, availability and exact same line before using a new price.</p>'+watch.map(({market:m,quality:q})=>'<div class="leg"><div class="leg-title">'+esc(m.name||m.label||m.player||m.type)+'</div><div class="leg-sub">Current '+esc(fmt(q.quote.odds))+' · Minimum acceptable '+esc(fmt(q.minimumOdds))+' · Price gap '+(q.priceGap*100).toFixed(1)+' percentage points</div><div class="leg-reason">Selection buffer '+(q.buffer*100).toFixed(1)+' points: '+Object.entries(q.bufferParts).filter(([,value])=>value>0).map(([key,value])=>esc(labels[key]||key)+' '+(value*100).toFixed(1)).join(' · ')+'</div></div>').join('')+'</details>';
}
function emptyMessage(report,count,state){
 const ideas=active(state),n=report?.eligible.length||0;
 const lead='No '+count+'-leg '+(ideas?'Matchups build':likelihood(state)?'Win Chance build':'value-screened parlay')+' for these filters. ';
 if(state.requirePlayerProp&&!report?.eligible?.some(x=>x.market.player))return lead+'Require a player prop is enabled, but no player prop passed these filters. Select supported prop markets or review the exclusions below.';
 if(!report?.checked)return lead+'No selections available for the selected date and markets.';
 if(ideas&&report.props===0&&count>2)return lead+'Player props are unavailable in this feed; moneyline/spread and total can fill at most two compatible legs. Select 2 legs and Standard + ALT, or another game. '+(n?n+' selections passed individual checks.':report.checked+' selections checked; '+(report.reasons[0]?.[0]||'none qualified')+'.');
 if(!n)return lead+report.checked+' selections checked; none passed '+(ideas||likelihood(state)?'the likelihood and data-quality checks.':'the value screen. ')+(ideas||likelihood(state)?'':report.reasons.length===1&&report.reasons[0][0]==='Edge does not clear uncertainty buffer'?'All failed the model uncertainty buffer.':'Expand the exclusions below for details.');
 return lead+n+' eligible selections'+(report.props?' across '+report.players+' players':'')+'. Try fewer legs or different markets; compatible legs are still required.';
}
function refresh(){
 const host=document.querySelector('#nflRecommendationTierWrap'),s=window.NFL_PARLAY_STATE;if(!host||!s)return;
 host.hidden=(window.__ACTIVE_SPORT||'nfl')!=='nfl';
 host.querySelector('select').value=s.recommendationTier||'screened';
 const required=host.querySelector('#nflRequireProp')||document.querySelector('#nflRequireProp');if(required)required.checked=s.requirePlayerProp===true;
 const ideas=host.querySelector('option[value="ideas"]');if(ideas)ideas.disabled=!!s.apiKey;
 host.querySelector('small').textContent=likelihood(s)?'Favors buffered win estimates. Value unchecked.':active(s)?'Uses recent matchup context. Value unverified.':'Requires buffered value. May return no build.';
}
function mount(){
 const anchor=document.querySelector('#nflWeekWrap');if(!anchor)return;
 const field=document.createElement('div');field.id='nflRecommendationTierWrap';field.className='field';
 field.innerHTML='<select id="nflRecommendationTier" hidden aria-label="Recommendation view"><option value="screened">Recommended picks</option><option value="ideas">Other picks</option></select><small id="nflIdeasNote" hidden></small><label class="nfl-require-prop" for="nflRequireProp"><input id="nflRequireProp" type="checkbox"><span>Require a player prop</span></label>';
 anchor.before(field);
 field.querySelector('select').addEventListener('change',e=>{const s=window.NFL_PARLAY_STATE;s.recommendationTier=e.target.value;window.DASHBOARD_UI?.put('nfl','tier',s.recommendationTier);refresh();window.generate?.()});
 field.querySelector('#nflRequireProp').addEventListener('change',e=>{const s=window.NFL_PARLAY_STATE;s.requirePlayerProp=e.target.checked;window.DASHBOARD_UI?.put('nfl','requireProp',s.requirePlayerProp?'on':'off');window.generate?.()});
 // Keep TD Scorer selectable; the ordinary quality gates decide eligibility.
 const td=document.querySelector('#tdMarketOptions'),results=document.querySelector('#results');
 if(td&&results){const drawer=document.createElement('details');drawer.className='market-filter-details';drawer.id='nflTdStraightDrawer';drawer.innerHTML='<summary>TD Scorer · Experimental</summary>';drawer.append(td);results.after(drawer)}
 refresh();
}
window.NFL_PARLAY_IDEAS={active,likelihood,assess,checkBuild,scopedGames,report,emptyMessage,diagnostics,refresh};
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
