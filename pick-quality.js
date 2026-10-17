(()=>{'use strict';
const data=new Map(),TTL=30*60000;
const num=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const odds=o=>num(o)!=null&&Math.abs(Number(o))>=100&&Math.abs(Number(o))<=100000;
const decimal=o=>o>0?1+o/100:1+100/Math.abs(o);
const implied=o=>odds(o)?1/decimal(Number(o)):null;
const american=p=>p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);
function group(s,m){const family=s==='nfl'?(m.type==='td'?'touchdown_scorer':m.player?m.marketKey||m.type:m.type==='h2h'?'moneyline':m.type):m.kind;return family+(m.referenceOnly?':public':'')}
function line(m){
 if(num(m.point)!=null)return num(m.point);
 const text=String(m.name||m.label||m.title||'');
 if(m.kind==='spread'){
  const signed=text.match(/\s([+−-]\d+(?:\.\d+)?)(?:\s|$)/);if(signed)return num(signed[1].replace('−','-'));
  const threshold=text.match(/wins by (over|under)\s+(\d+(?:\.\d+)?)/i);if(threshold)return Number(threshold[2])*(threshold[1].toLowerCase()==='over'?-1:1);
  if(num(m.line)!=null)return Math.abs(num(m.line))*(m.side==='no'?1:-1);
 }
 if(num(m.line)!=null)return num(m.line);
 const total=text.match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);if(total)return num(total[1]);
 const milestone=text.match(/(?:^|[\s:])(\d+)\+\s/);return milestone?Number(milestone[1])-.5:null;
}
function id(s,m){return JSON.stringify([s,m.ticker||m.selection_id||JSON.stringify([m.game_id||m.gameId||m.event_ticker||m.kickoff||'',m.name||m.label]),m.quoteSide||m.side||'yes',m.marketKey||m.kind||m.type,line(m),m.player||m.team||''])}
function prepare(s,markets,context={},games=[],at=null){window.STARTER_STATUS?.register(s,markets,context);window.ESPN_EVIDENCE?.prepare(s,markets);const byTicker=new Map(),byGame=new Map();for(const g of games){byGame.set(g.id,g);for(const m of g.markets||[])if(m.ticker)byTicker.set(m.ticker,g)}data.set(s,{markets,context,games,at,byTicker,byGame});window.SLATE_UI?.prepare(s,markets,games)}
function gameFor(s,m,game){return game||data.get(s)?.byGame?.get(m.gameId)||data.get(s)?.byTicker?.get(m.ticker)||data.get(s)?.games?.find(g=>g.id===m.gameId||(g.markets||[]).some(x=>x===m||x.ticker&&x.ticker===m.ticker))}
function quote(s,m){
 const price=num(m.price),p=price!=null?implied(price):num(m.yes_ask??m.quoteProbability);
 return {odds:p>0&&p<1?(price??american(p)):null,p,source:s==='nfl'?(m.source||gameFor(s,m)?.dataSource||'Reference feed'):(m.source||'Kalshi'),checkedAt:m.quotedAt||data.get(s)?.at||null};
}
function validatedRule(s,m,f={}){
 if(s==='ncaaf'&&f.forecastVersion&&window.MODEL_CALIBRATION?.rules(s)?.[group(s,m)+(f.experimental?':experimental':'')]?.forecastVersion!==f.forecastVersion)return false;
 if(window.MODEL_LEARNING&&!window.MODEL_LEARNING.baselineApproved(s,group(s,m)))return false;
 return window.MODEL_CALIBRATION?.validated?.(s,group(s,m)+(f.experimental?':experimental':''))===true;
}
function forecast(s,m,f={}){
 const raw=num(f.rawModelP??f.modelP),market=num(f.marketP??m.marketProbability??m.probability),key=group(s,m)+(f.experimental?':experimental':'');
 const active=validatedRule(s,m,f);
 const p=active&&raw>0&&raw<1&&market>0&&market<1?window.MODEL_CALIBRATION.apply(s,key,raw,market):raw??num(f.modelP);
 const q=quote(s,m),ev=p!=null&&q.p>0?p/q.p-1:null;
 return {...f,modelVersion:window.MODEL_LEARNING?.VERSION,baselines:{market:market,...(f.baselines||{})},modelP:p,rawModelP:raw,marketP:market,edge:p!=null&&q.p>0?p-q.p:null,betEV:ev,ev:f.experimental?null:ev,calibrationValidated:active};
}
function quoteLabel(s,m){const q=quote(s,m);if(q.odds==null)return 'Quote unavailable';const fmt=o=>o>0?'+'+o:String(o);if(m.referenceOnly)return q.source+' '+fmt(q.odds)+' · Reference';if(window.ODDS_DISPLAY)return window.ODDS_DISPLAY.label(q);return /^Caesars/.test(q.source)?'Caesars '+fmt(q.odds):s==='nfl'?(['Kalshi','FanDuel'].includes(q.source)?q.source:'Reference')+' '+fmt(q.odds):'Kalshi '+Math.round(q.p*100)+'¢';}
function estimateOdds(s,markets){if(!window.MARKET_GUARDS?.independent(markets))return null;const prices=markets.map(m=>quote(s,m).odds);if(prices.some(o=>!odds(o)))return null;const d=prices.reduce((value,o)=>value*decimal(o),1);return Math.round(d>=2?(d-1)*100:-100/(d-1));}
function participation(s,m,f,game,warnings){
 const ctx=data.get(s)?.context||{},g=gameFor(s,m,game),starter=window.STARTER_STATUS?.evidence(s,m,ctx);
 if(starter?.blocked)return starter.blocked;
 const injury=String(m.contextSignals?.injury_status||m.injury_status||m.injuryStatus||'').toLowerCase();
 if(/\b(out|doubtful|inactive|suspended|ir|pup|nfi)\b|injured reserve/.test(injury))return 'Player unavailable';
 if(s==='nfl'&&m.player){
  if(m._invalidRoster||m._rosterVerified!==true)return 'Roster unverified';
  const at=Date.parse(g?.context?.updated_at||'');
  if(/questionable/.test(injury))return 'Confirm current injury status';
  if(!injury||/unknown|unconfirmed/.test(injury)||m.contextSignals?.injury_checked!==true||!Number.isFinite(at)||Date.now()-at>4*3600000)warnings.push('Injury status unconfirmed');
  if(!(num(f.roleStability??m.roleStability)>=.6))return 'Playing time uncertain';
 }
 if(s==='mlb'){
  const event=(ctx.games||[]).find(x=>String(x.gamePk)===String(m.game_id));
  if(!event?.startersConfirmed||!event?.lineupsConfirmed)warnings.push('Pitchers and lineups unconfirmed');
  const at=Date.parse(ctx.updated_at||'');if(Number.isFinite(at)&&Date.now()-at>90*60000)warnings.push('Lineup status unconfirmed after context expired');
  if((m.player||f.player)&&m.kind!=='strikeouts'&&event?.lineupsConfirmed&&!event?.lineupPlayerIds?.includes(Number(m.player_id||m.playerId||f.playerId)))return 'Player not in confirmed lineup';
 }
 if(s==='nhl'){
  if(m.player&&m.player_verified!==true)return 'Roster unverified';
  if(m.kind==='saves')return 'Goalie usage model unavailable';
  if(m.player){if(!starter?.lineConfirmed)warnings.push('Conditional on participation and role');}
  else if(!starter?.confirmed)warnings.push('Team-average goalies; starters unconfirmed');
  else warnings.push('Goalies confirmed; projection still uses team-average goaltending');
 }
 if(s==='ncaaf'){if(!starter?.confirmed)warnings.push('Starting quarterbacks unconfirmed');warnings.push('College injury coverage incomplete; team-history projection');}
 if(s==='nba'){
  const event=ctx.games?.[String(m.game_id)];
  if(!event||![2,3].includes(event.season_type))return 'NBA preseason or unverified rotation';
  if(m.player){
   const player=ctx.players?.[String(m.player_id)];
   if(!m.player_verified||!player||player.team!==m.team_code)return 'Roster unverified';
   if(/questionable|unknown/i.test(player.injury_status||''))return 'Player availability uncertain';
   if(!(num(f.roleStability)>=.6))return 'Playing time uncertain';
   if(!starter?.confirmedPlayer)warnings.push('Confirm participation and projected minutes');
  }else if(!starter?.confirmed)warnings.push('Starting lineups unconfirmed');
 }
 return null;
}
// Missing features widen the selection buffer. They never create a favorable
// adjustment, and a confirmed exclusion always blocks a pick.
function contextEvidence(s,m,f={},game){
 const ctx=data.get(s)?.context||{},g=gameFor(s,m,game),missing=[],starter=window.STARTER_STATUS?.evidence(s,m,ctx);
 const add=(ok,label)=>{if(!ok)missing.push(label)};
 if(s==='mlb'){
  const event=(ctx.games||[]).find(x=>String(x.gamePk)===String(m.game_id));
  add(event?.startersConfirmed,'Starting pitchers');add(event?.lineupsConfirmed,'Batting lineups');
  add(event?.bullpen?.available,'Bullpen workload');add(event?.weather?.available,'Park/weather');
 }else if(s==='nba'){
  const event=ctx.games?.[String(m.game_id)],p=ctx.players?.[String(m.player_id)];
  add(starter?.confirmed===true,'Starting lineups');
  if(m.player){add(p?.availability_checked===true,'Availability check');add(Number.isFinite(f.projectedMinutes),'Projected minutes');add(Number.isFinite(f.usageRate),'Recent usage');}
 }else if(s==='nfl'){
  add(g?.context?.weather?.available||g?.context?.weather?.indoor===true,'Weather');
  if(m.player){add(m.contextSignals?.injury_checked===true,'Availability check');add(m.propHistory?.played>=3,'Recent opportunities');add(m.propHistory?.roleStable===true,'Stable recent role');}
 }else if(s==='ncaaf'){
  const event=ctx.games?.[String(m.game_id)];
  add(event?.home?.form?.opponent_adjusted_margin!=null&&event?.away?.form?.opponent_adjusted_margin!=null,'Opponent strength');
  add(starter?.confirmed===true,'Starting quarterbacks');add(event?.weather?.available||event?.weather?.indoor===true,'Weather');
 }else if(s==='nhl'){
  const event=ctx.games?.[String(m.context_game_id||m.game_id)];
  add(starter?.confirmed===true,'Starting goalies');
  if(m.player){const p=ctx.players?.[String(m.player_id)];add(starter?.lineConfirmed===true,'Line assignment');add(starter?.powerplayConfirmed===true,'Power-play role');}
 }else if(s==='ufc'){
  add(f.match?.opponentAdjusted===true,'Opponent-adjusted record');add(f.match?.weightClassVerified===true,'Weight class');
  add(f.match?.sample>=5,'Recent fight sample');
 }
 return {missing,starterEvidence:starter||null,penalty:Math.min(.04,missing.length*.008)};
}
function unsupportedAltUnder(m){
 const key=String(m?.marketKey||'').toLowerCase();
 const player=!!m?.player||key.startsWith('player_');
 const alternate=m?.isAltLine===true||/_alternate$/.test(key);
 const direction=String(m?.side||m?.direction||m?.overUnder||'').toLowerCase();
 const under=direction==='under'||!['over','under'].includes(direction)&&/\b(?:under|u)\s+\d/i.test([m?.name,m?.label,m?.title].filter(Boolean).join(' '));
 return player&&alternate&&under;
}
function assess(s,m,f={},options={}){
 const q=quote(s,m);let p=num(f.modelP??f.modelProbability??m.modelProbability),coverage=clamp(num(f.coverage??f.context?.coverage??f.match?.coverage??m.projectionCoverage)||0,0,1);
 const minCoverage=s==='nfl'&&!m.player ? .2 : s==='ncaaf' ? .6 : .45;
 const ruleKey=group(s,m)+(f.experimental?':experimental':'');const validated=validatedRule(s,m,f);
 const raw=num(f.rawModelP??m.rawModelProbability),market=num(f.marketP??m.marketProbability??m.probability);if(validated&&raw>0&&raw<1&&market>0&&market<1)p=window.MODEL_CALIBRATION.apply(s,ruleKey,raw,market);
 const uncertainty=clamp(num(f.uncertainty??m.modelUncertainty)??.5,0,1);
 // A selection buffer, not a statistical confidence interval. Unvalidated
 // models need more headroom and retain their experimental labels.
 const context=contextEvidence(s,m,f,options.game);
 const learned=s==='ncaaf'&&f.forecastVersion?null:window.MODEL_LEARNING?.learnedBuffer(s,group(s,m),p);
 const buffer=learned?learned.buffer+context.penalty:(validated ? .015 : .05)+(1-coverage)*.02+uncertainty*.015+context.penalty;
 const conservativeP=p==null?null:clamp(p-buffer,.001,.999),ev=p!=null&&q.p>0?p/q.p-1:null,conservativeEV=conservativeP!=null&&q.p>0?conservativeP/q.p-1:null;
 const warnings=[];let reason=null;
 if(window.SLATE_UI&&!window.SLATE_UI.matches(s,m,gameFor(s,m,options.game)?.commence_time))return {pass:false,rank:-Infinity,reason:'Outside selected date',warnings:[],quote:q};
 if(!validated)warnings.push('Model unvalidated; value unverified');
 if(m.referenceOnly)warnings.push('Public reference odds; verify current sportsbook price');
 if(s==='nfl'&&m.player&&f.experimental&&!validated)warnings.push('Experimental player-history estimate');
 const anchored=s==='nfl'&&!m.player&&f.marketAnchored===true;
 const quoteAge=Date.now()-Date.parse(q.checkedAt||'');
 const delayedReference=quoteAge>TTL&&quoteAge<=2*3600000;
 if(delayedReference)warnings.push('Delayed reference price; verify current line');
 const g=gameFor(s,m,options.game),start=Date.parse(options.eventTime||m.game_time||m.start_time||m.kickoff||g?.commence_time||'');
 if(unsupportedAltUnder(m))reason='ALT player-prop unders unsupported at your book';
 else if(s==='nfl'&&window.NFL_ALT_LINES?.unsupportedIncrement?.(m))reason='ALT yardage requires a quoted 10-yard milestone';
 else if(Number.isFinite(start)&&start<=Date.now()||['in','post','Live','Final'].includes(m.game_status)||['in','post'].includes(g?.game_status))reason='Event already started';
 else if(!Number.isFinite(start))reason='Event start unverified';
 else if(!q.checkedAt)reason='Quote timestamp unavailable';
 else if(q.checkedAt&&(!Number.isFinite(Date.parse(q.checkedAt))||Date.parse(q.checkedAt)>Date.now()+300000||quoteAge>TTL))reason='Quote older than 30 minutes';
 else if(m.context_unmatched===true)reason='Matchup context unverified';
 else if(m._invalidRoster===true)reason='Roster unverified';
 else if(!(q.p>0&&q.p<1))reason='Quote unavailable';
 else if(num(m.sourceQuality)!=null&&num(m.sourceQuality)<60)reason='Source quality too low';
 else if(!(p>0&&p<1)||coverage<minCoverage)reason='Independent projection too thin';
 else if(p===num(f.marketP??m.marketProbability??m.probability)&&!f.experimental)reason='Market-only estimate';
 else reason=participation(s,m,f,g,warnings);
 const monitored=window.ESPN_EVIDENCE?.inspect(m);if(monitored){warnings.push(...monitored.warnings);if(!reason&&monitored.blocked)reason=monitored.blocked;}
 const roleChange=f.roleChange??m.roleChange;
 if(!reason&&['falling','rising'].includes(roleChange?.status))reason='Recent opportunity changed; waiting for a stable role';
 const clearsValue=ev>0&&conservativeEV>0;
 // A market-anchored NFL estimate is a suggestion, never independent proof of EV.
 if(!reason&&!clearsValue)reason='Edge does not clear uncertainty buffer';
 let sensitivity=null;
 if(s==='ncaaf'&&f.sensitivity){
  const scenarios=(f.sensitivity.scenarios||[]).map(row=>{
   let estimate=num(row.modelP);
   if(validated&&estimate>0&&estimate<1&&market>0&&market<1)estimate=window.MODEL_CALIBRATION.apply(s,ruleKey,estimate,market);
   return {name:row.name,bufferedP:estimate==null?null:clamp(estimate-buffer,.001,.999)};
  });
  const requiredP=clamp((q.p||0)+.02,.001,.999),valid=scenarios.length>0&&scenarios.every(row=>row.bufferedP!=null);
  const worstP=valid?Math.min(conservativeP,...scenarios.map(row=>row.bufferedP)):null;
  const robust=valid&&worstP>requiredP;
  sensitivity={pass:robust,label:valid?(robust?'Robust':'Sensitive to assumptions'):'Sensitivity unavailable',policy:'advisory',worstP,requiredP,scenarios,pricePenalty:.02};
  if(!robust)warnings.push(sensitivity.label+'; review adverse scenarios in Details');
 }
 // Policy safeguards for provisional estimates, not measured confidence limits.
 if(!reason&&!validated&&(q.p<.35||p<.45))reason='Unvalidated longshot; insufficient reliability';
 const referenceP=market>0&&market<1?market:q.p;
 if(!reason&&!validated&&Math.abs(p-referenceP)>.15)reason='Model disagrees too strongly with market';
 if(!reason&&num(m.spread)!=null&&(num(m.spread)<0||num(m.spread)>.10))reason='Quote spread too wide';
 if(!reason&&options.featured&&(q.p<.55||conservativeP<.55))reason='Featured pick needs stronger likelihood';
 // Near kickoff there is no time to treat missing availability as a minor caveat.
 const nearStart=Number.isFinite(start)&&start-Date.now()<=90*60000;
 if(!reason&&nearStart&&(options.featured||options.parlay)){
  const availability=warnings.some(w=>/unconfirmed|confirm participation|conditional on participation/i.test(w));
  if(availability)reason='Confirm starters, availability and role before kickoff';
 }
 const tier=anchored?'suggestion':warnings.length?'conditional':'value';
 if(anchored)warnings.push('Context-supported suggestion; value unverified');
 if(options.parlay&&['player_rush_attempts','player_pass_attempts','player_pass_completions'].includes(m.marketKey))reason='Caesars straight only';
 const valueQualified=validated&&!reason&&clearsValue&&!anchored&&!warnings.length;
 const rankingP=validated?conservativeP:Math.min(conservativeP,q.p);
 // Ranking preference only: don't reject good evidence simply because the price
 // is short, but don't let extreme juice masquerade as better pick quality.
 const juicePenalty=Math.max(0,(q.p||0)-.75)*100;
 if(!reason&&juicePenalty>0)warnings.push('Short price; limited payout for the risk');
 return {pass:!reason,reason,modelP:p,conservativeP,rankingP,buffer,bufferMethod:learned?.method||'Fixed policy buffer; empirical evidence collecting',roleChange,ev,conservativeEV,coverage,validated,quote:q,warnings,tier,valueQualified,context,sensitivity,minimumOdds:conservativeP>0?american(conservativeP):null,bufferLabel:'Selection buffer; not a confidence interval',evidence:validated?'Calibrated estimate':'Unvalidated model',juicePenalty,rank:!reason?rankingP*100+coverage*8+(validated?8:0)-Math.min(warnings.length,4)+Math.min(Math.max(conservativeEV||0,0),.15)*10-juicePenalty:-999};
}
function joint(legs){
 const ps=legs.map(l=>num(l.modelP??l.modelProbability));
 if(!ps.length||ps.some(p=>!(p>0&&p<1)))return null;
 // Frechet bounds hold without inventing dependence from pairing scores.
 return {lower:Math.max(0,ps.reduce((a,b)=>a+b,0)-(ps.length-1)),upper:Math.min(...ps),method:'Dependence bounds; joint model unvalidated'};
}
function checkBuild(s,entries,sgp=false,offer=null){
 if(!entries?.length)return {pass:false,reason:'No qualifying legs',checks:[]};
 const checks=entries.map(e=>assess(s,e.market,e.forecast,{game:e.game,parlay:true}));
 if(checks.some(x=>!x.pass))return {pass:false,reason:checks.find(x=>!x.pass).reason,checks};
 const keys=entries.map(e=>String(e.game?.id||gameFor(s,e.market)?.id||e.market.gameId||e.market.game_id||e.market.event_ticker?.replace(/^[^-]+-/, '')||''));
 if(!sgp){
  if(keys.some(k=>!k)||new Set(keys).size!==keys.length)return {pass:false,reason:'One leg per verified game required',checks};
  return {pass:true,checks};
 }
 if(keys.some(k=>!k)||new Set(keys).size!==1)return {pass:false,reason:'SGP requires one verified matchup',checks};
 const bounds=joint(checks),breakEven=implied(offer);
 return {pass:true,checks,bounds,breakEven,valueStatus:breakEven==null?'Joint value unverified':bounds.lower>breakEven?'Clears marginal dependence bound; joint model unvalidated':bounds.upper<=breakEven?'Price fails even the upper bound':'Joint value unverified',actionable:false};
}
function evidence(s,m,f={},game){const x=assess(s,m,f,{game}),anchored=f.marketAnchored===true;
 const tier=anchored?'Market-supported suggestion':!(x.coverage>0)?'Market only':x.validated?'Validated model-supported':'Unvalidated model-supported';
 return {tier,likelihood:x.modelP,coverage:x.coverage,coverageLabel:x.coverage>=.75?'More complete':x.coverage>=.45?'Partial':'Limited',valueVerified:x.valueQualified===true,unconfirmed:x.warnings||[],reason:x.reason};
}
function note(s,m,f,game){const x=assess(s,m,f,{game});if(!x.pass)return x.reason;const e=evidence(s,m,f,game);return [s==='ncaaf'?window.NCAAF_MODEL?.explain?.(m,f,x):'',e.tier,'Estimated likelihood '+Math.round(e.likelihood*100)+'% (not measured accuracy)','Selection buffer '+(x.buffer*100).toFixed(1)+' percentage points; not a confidence interval',x.bufferMethod,f.opportunity?'Projection: '+f.opportunity.method+' · '+f.opportunity.projectedExposure.toFixed(1)+' opportunities × '+(f.opportunity.conversionRate*f.opportunity.efficiency).toFixed(2)+' per opportunity':'','Needs odds better than '+(x.minimumOdds>0?'+':'')+x.minimumOdds+' at the same line','Evidence '+e.coverageLabel+' · input coverage '+Math.round(e.coverage*100)+'%',x.context.starterEvidence?.note||'',window.ESPN_EVIDENCE?.inspect(m).note||'',x.context.missing.length?'Missing: '+x.context.missing.join(', '):'',...x.warnings].filter(Boolean).join(' · ');}
window.PICK_QUALITY={contextEvidence,unsupportedAltUnder,evidence,note,validatedRule,prepare,forecast,assess,quote,quoteLabel,estimateOdds,markets:s=>data.get(s)?.markets||[],context:s=>data.get(s)?.context||{},gameFor,id,line,group,joint,checkBuild,decimal,implied,odds};
})();
