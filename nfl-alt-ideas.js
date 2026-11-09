(()=>{'use strict';
const active=(state,variant='safe')=>state?.mode==='sgp'&&state?.lineMode==='alt'&&variant==='safe';
const families={player_pass_yds:'Passing yards',player_rush_yds:'Rushing yards',player_reception_yds:'Receiving yards',player_receptions:'Receptions',player_pass_tds:'Passing TDs'};
const key=m=>String(m.marketKey||'').replace(/_alternate$/,'');
function manualCheck(game,{player,marketKey,milestone,odds},now=Date.now()){
 const n=Number(milestone),yards=['player_pass_yds','player_rush_yds','player_reception_yds'].includes(marketKey);
 if(!families[marketKey]||!Number.isInteger(n)||n<=0||n>(yards?1000:30)||yards&&n%10!==0)return {pass:false,reason:'Enter a supported milestone: yardage in tens, receptions in whole numbers.'};
 if(!(Date.parse(game?.commence_time)>now)||game.game_status!=='pre')return {pass:false,reason:'Verified upcoming game required.'};
 const rows=(game.markets||[]).filter(m=>m.player===player&&key(m)===marketKey),base=rows.find(m=>m._rosterVerified&&!m._invalidRoster&&[game.away,game.home].includes(m.team));
 if(!base)return {pass:false,reason:'Player and current team are not verified for this market.'};
 const injury=String(base.contextSignals?.injury_status||''),contextAt=Date.parse(game.context?.updated_at||'');
 if(!base.contextSignals?.injury_checked||!injury||/out|doubtful|inactive|questionable|suspended|unknown|injured reserve|unconfirmed/i.test(injury)||!Number.isFinite(contextAt)||contextAt>now+60000||now-contextAt>4*3600000)return {pass:false,reason:'Current player availability is not sufficiently confirmed.'};
 const monitored=window.ESPN_EVIDENCE?.inspect(base,now);
 if(monitored?.blocked)return {pass:false,reason:monitored.blocked};
 const h=base.propHistory,values=h?.metrics?.[marketKey],latest=Date.parse(h?.latest_game+'T23:59:59Z');
 if(h?.source!=='nflverse completed plays'||h.played<3||h.games<3||h.played/h.games<.6||!Array.isArray(values)||values.length!==h.games||values.some(v=>!Number.isFinite(v))||!(latest<now&&latest<Date.parse(game.commence_time))||Date.parse(game.commence_time)-latest>28*86400000)return {pass:false,reason:'Insufficient recent verified history.'};
 const exposure=h.opportunities?.[marketKey==='player_rush_yds'?'player_rush_attempts':['player_pass_yds','player_pass_tds'].includes(marketKey)?'player_pass_attempts':'targets'];
 const role=window.MODEL_LEARNING?.roleChange(exposure);
 if(role?.status!=='stable'||!(window.NFL_MODEL_V3?.role(base)>=.6))return {pass:false,reason:'Workload is changing or uncertain; keep this leg out of the study build.'};
 if((odds==null||odds==='')&&n>values.reduce((sum,v)=>sum+v,0)/values.length)return {pass:false,reason:'Milestone exceeds the recent average; enter individual odds for a full likelihood check.'};
 const line={...base,point:n-.5,side:'over',quoteSide:'yes',name:player+' '+n+' '+families[marketKey],marketKey,isAltLine:true,source:'Manual sportsbook',ticker:'manual-unpriced:'+game.id+':'+player+':'+marketKey+':'+n,price:null,prob:null,marketProbability:null,quoteProbability:null,quotedAt:null,spread:null};
 if(odds!==''&&odds!=null){
  if(!window.PICK_QUALITY.odds(Number(odds))||!Number.isInteger(Number(odds)))return {pass:false,reason:'Enter valid American odds or leave the individual price blank.'};
  // A user-entered offer is never written into the feed or reused on another line.
  const p=window.PICK_QUALITY.implied(Number(odds));Object.assign(line,{ticker:'manual:'+game.id+':'+player+':'+marketKey+':'+n+':'+odds,source:'Manual sportsbook',price:Number(odds),prob:p,marketProbability:p,quoteProbability:p,quotedAt:new Date(now).toISOString()});
  const forecast={...window.NFL_MODEL_V3.evaluate(game,line),selectionMode:'likelihood'};
  const q=window.PICK_QUALITY.assess('nfl',line,forecast,{game,parlay:true});
  return {pass:q.pass,reason:q.reason||'Likelihood screen passed; value unchecked.',market:line,forecast,quality:q,modeled:true};
 }
 return {pass:true,reason:'History and availability checked only. Individual price missing; milestone probability unavailable.',market:line,modeled:false};
}
function review(game,legs,offer,now=Date.now()){
 if(!Array.isArray(legs)||legs.length<2||legs.length>3||new Set(legs.map(l=>l.player)).size!==legs.length)return {pass:false,message:'Use 2–3 distinct players.'};
 const checks=legs.map(l=>manualCheck(game,l,now));
 const receivers=new Map();for(const c of checks){const m=c.market;if(m&&['receiving','receptions'].includes(m.type))receivers.set(m.team,(receivers.get(m.team)||0)+1);}
 if([...receivers.values()].some(n=>n>2))return {pass:false,message:'Use at most two receiver props from one offense.',checks};
 const decision=window.STUDY_POLICY.decision({...offer,checks:checks.map(c=>({dataPass:c.pass})),sgp:true,eventTimes:[game?.commence_time]},now);
 return {pass:checks.every(c=>c.pass)&&decision.status==='research',message:decision.message,checks,breakEven:decision.breakEven};
}
// Retain the integration hook without displaying the retired ticket-review panel.
function mount(){
 if(typeof document!=='undefined')document.querySelector('#nflManualAlt')?.remove();
}
window.NFL_ALT_IDEAS={active,manualCheck,review,mount};
})();

