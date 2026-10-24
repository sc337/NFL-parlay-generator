(()=>{'use strict';
const data=new Map(),TTL=30*60000;
const num=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const odds=o=>num(o)!=null&&Math.abs(Number(o))>=100&&Math.abs(Number(o))<=100000;
const decimal=o=>o>0?1+o/100:1+100/Math.abs(o);
const implied=o=>odds(o)?1/decimal(Number(o)):null;
const american=p=>p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);
function acceptableOdds(p){
 if(!(p>0&&p<1))return null;
 let o=Math.ceil(p>=.5?-100*p/(1-p):100*(1-p)/p);
 if(o>-100&&o<100)o=100;
 while(odds(o)&&implied(o)>=p){o++;if(o>-100&&o<100)o=100;}
 return odds(o)?o:null;
}
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
function prepare(s,markets,context={},games=[],at=null){if(s==='nfl')for(const g of games)for(const m of g.markets||[]){m.gameId=g.id}window.MARKET_GUARDS?.reconcile?.(s,markets);window.STARTER_STATUS?.register(s,markets,context,at);window.ESPN_EVIDENCE?.prepare(s,markets);const byTicker=new Map(),byGame=new Map();for(const g of games){byGame.set(g.id,g);for(const m of g.markets||[])if(m.ticker)byTicker.set(m.ticker,g)}data.set(s,{markets,context,games,at,byTicker,byGame});window.SOURCE_BRANDING?.register(s,markets,at);window.SLATE_UI?.prepare(s,markets,games)}
function gameFor(s,m,game){return game||data.get(s)?.byGame?.get(m.gameId)||data.get(s)?.byTicker?.get(m.ticker)||data.get(s)?.games?.find(g=>g.id===m.gameId||(g.markets||[]).some(x=>x===m||x.ticker&&x.ticker===m.ticker))}
function quote(s,m){
 const price=num(m.price),p=price!=null?implied(price):num(m.yes_ask??m.quoteProbability);
 return {odds:p>0&&p<1?(price??american(p)):null,p,source:s==='nfl'?(m.source||gameFor(s,m)?.dataSource||'Reference feed'):(m.source||'Kalshi'),checkedAt:m.quotedAt||data.get(s)?.at||null};
}
function validatedRule(s,m,f={}){
 if(window.STUDY_POLICY?.paperOnly)return false;
 if(s==='nba'&&f.marketAnchored===true)return false;
 if(s==='ncaaf'&&f.forecastVersion&&window.MODEL_CALIBRATION?.rules(s)?.[group(s,m)+(f.experimental?':experimental':'')]?.forecastVersion!==f.forecastVersion)return false;
 if(window.MODEL_LEARNING&&!window.MODEL_LEARNING.baselineApproved(s,group(s,m)))return false;
 return window.MODEL_CALIBRATION?.validated?.(s,group(s,m)+(f.experimental?':experimental':''))===true;
}
function forecast(s,m,f={}){
 const raw=num(f.rawModelP??f.modelP),market=num(f.marketP??m.marketProbability??m.probability),key=group(s,m)+(f.experimental?':experimental':'');
 const active=validatedRule(s,m,f);
 const p=active&&raw>0&&raw<1&&market>0&&market<1?window.MODEL_CALIBRATION.apply(s,key,raw,market):raw??num(f.modelP);
 const q=quote(s,m),ev=p!=null&&q.p>0?p/q.p-1:null;
 return {...f,modelVersion:window.MODEL_LEARNING?.VERSION,baselines:{market:market,...(f.baselines||{})},modelP:p,rawModelP:raw,marketP:market,edge:p!=null&&q.p>0?p-q.p:null,betEV:s==='nba'&&f.marketAnchored?null:ev,ev:f.experimental||s==='nba'&&f.marketAnchored?null:ev,calibrationValidated:active};
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
  else if(!f.goalieAdjusted)warnings.push('Goalies confirmed; individual save-rate evidence incomplete');
 }
 if(s==='ncaaf'){if(!starter?.confirmed)warnings.push('Starting quarterbacks unconfirmed');warnings.push('College injury coverage incomplete; team-history projection');}
 if(s==='nba'){
  const event=ctx.games?.[String(m.game_id)];
  if(!event||![2,3].includes(event.season_type))return 'NBA preseason or unverified rotation';
  if(m.player){
   const player=ctx.players?.[String(m.player_id)];
   if(!m.player_verified||!player||player.team!==m.team_code)return 'Roster unverified';
   if(/\b(out|doubtful|inactive|suspended)\b/i.test(player.injury_status||''))return 'Player unavailable';
   if(/questionable|unknown/i.test(player.injury_status||''))return 'Player availability uncertain';
   if(!(num(f.roleStability)>=.6))return 'Playing time uncertain';
   if(!starter?.confirmedPlayer)warnings.push((starter?.lineupLabel||'Lineup pending · Not final')+'; conditional on participation and projected minutes');
  }else if(!starter?.confirmed)warnings.push(starter?.lineupLabel||'Lineup pending · Not final');
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
  if(m.player){
   add(m.contextSignals?.injury_checked===true,'Availability check');add(m.propHistory?.played>=3,'Recent opportunities');
   const role=f.roleChange??m.roleChange,history=m.propHistory;
   const metric=(m.type==='rushing'||m.type==='td'&&['RB','QB'].includes(m.position))?'player_rush_attempts':(['receiving','receptions'].includes(m.type)||m.type==='td')?'targets':'player_pass_attempts',samples=history?.opportunities?.[metric]||history?.metrics?.[metric];
   const measuredRole=Array.isArray(samples)&&samples.length>=3&&samples.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&samples.some(v=>v>0);
   const modeledStable=measuredRole&&history?.source==='nflverse completed plays'&&history.played>=3&&history.games>=3&&num(f.roleStability??m.roleStability)>=.6&&!['rising','falling'].includes(role?.status);
   add(history?.roleStable===true||history?.roleStable==null&&modeledStable,'Stable recent role');
  }
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
 if(s==='nfl')window.NFL_ALT_LINES?.normalize?.(m);
 const nbaMoneyline=s==='nba'&&m.kind==='moneyline',nbaTeam=s==='nba'&&['moneyline','spread','total'].includes(m.kind),nbaProfile=nbaTeam?options.nbaProfile:null;
 const saferMode=!options.featured&&window.PARLAY_POLICY?.saferLegs===true&&(s==='nba'?nbaProfile==='safe':true);
 const selectionMode=options.featured?'screened':saferMode?'likelihood':nbaProfile==='safe'?'likelihood':nbaProfile?'ideas':f.selectionMode||window.DASHBOARD_UI?.get(s,'selectionMode','screened')||'screened';
 const likelihoodMode=selectionMode==='likelihood',matchupMode=selectionMode==='ideas';
 const q=quote(s,m);let p=num(f.modelP??f.modelProbability??m.modelProbability),coverage=clamp(num(f.coverage??f.context?.coverage??f.match?.coverage??m.projectionCoverage)||0,0,1);
 const minCoverage=s==='nfl'&&!m.player ? .2 : s==='ncaaf' ? .6 : .45;
 const ruleKey=group(s,m)+(f.experimental?':experimental':'');const validated=validatedRule(s,m,f);
 const raw=num(f.rawModelP??m.rawModelProbability),market=num(f.marketP??m.marketProbability??m.probability);if(validated&&raw>0&&raw<1&&market>0&&market<1)p=window.MODEL_CALIBRATION.apply(s,ruleKey,raw,market);
 const uncertainty=clamp(num(f.uncertainty??m.modelUncertainty)??.5,0,1);
 // A selection buffer, not a statistical confidence interval. Unvalidated
 // models need more headroom and retain their experimental labels.
 const context=contextEvidence(s,m,f,options.game);
 const monitored=window.ESPN_EVIDENCE?.inspect(m),roleChange=f.roleChange??m.roleChange;
 const increasedRole=roleChange?.status==='rising'||monitored?.role?.status==='rising';
 const learned=window.STUDY_POLICY?.paperOnly||s==='ncaaf'&&f.forecastVersion?null:window.MODEL_LEARNING?.learnedBuffer(s,group(s,m),p);
 const bufferParts=learned?{empirical:learned.buffer,missingInputs:context.penalty}:{modelStatus:(validated ? .015 : .04),limitedCoverage:(1-coverage)*.02,modelUncertainty:uncertainty*.015,missingInputs:context.penalty};
 if(increasedRole)bufferParts.changedRole=.015;
 const buffer=Object.values(bufferParts).reduce((sum,value)=>sum+value,0);
 const conservativeP=p==null?null:clamp(p-buffer,.001,.999),ev=p!=null&&q.p>0?p/q.p-1:null,conservativeEV=conservativeP!=null&&q.p>0?conservativeP/q.p-1:null;
 const warnings=[];let reason=null;
 if(window.SLATE_UI&&!window.SLATE_UI.matches(s,m,gameFor(s,m,options.game)?.commence_time))return {pass:false,rank:-Infinity,reason:'Outside selected date',warnings:[],quote:q};
 if(!validated)warnings.push('Model unvalidated; value unverified');
 if(m.referenceOnly)warnings.push('Public reference odds; verify current sportsbook price');
 if(m.source==='Polymarket')warnings.push('Exchange reference; Caesars price, fees and player void rules can differ');
 if(s==='nfl'&&m.player&&f.experimental&&!validated)warnings.push('Experimental player-history estimate');
 const anchored=(nbaTeam||s==='nfl'&&!m.player)&&f.marketAnchored===true;
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
 else if(!(p>0&&p<1)||coverage<minCoverage){
  const history=s==='nfl'&&m.player?m.propHistoryStatus:null;
  reason=history?.status==='insufficient_recent_sample'?'Insufficient recent completed-game sample':
    history?.status==='inactive_latest_game'?'No activity in latest completed team game':
    history?.status==='identity_unresolved'?'Player history identity unresolved':'Independent projection too thin';
 }
 else if(p===num(f.marketP??m.marketProbability??m.probability)&&!f.experimental)reason='Market-only estimate';
 else reason=participation(s,m,f,g,warnings);
 if(monitored){warnings.push(...monitored.warnings);if(!reason&&monitored.blocked)reason=monitored.blocked;}
 if(!reason&&roleChange?.status==='falling')reason='Recent opportunity decreased; waiting for a stable role';
 if(increasedRole)warnings.push('Increased role · Not final; wider opportunity checks applied');
 const clearsValue=ev>0&&conservativeEV>0;
 if(!reason&&options.featured&&!clearsValue)reason='Featured straight price does not clear the selection buffer';
  const potentialValue=ev>0&&!clearsValue&&!validated&&!anchored;
 // A market-anchored NFL estimate is a suggestion, never independent proof of EV.
 let sensitivity=null;
 if(f.sensitivity){
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
 // A promotion is usable only when actual opportunity data and adverse
 // exposure scenarios support it. ESPN-only changes cannot silently bypass a
 // model that still assumes the old role. Decreased roles remain excluded.
 if(!reason&&increasedRole&&!(f.opportunity?.sample>=5&&roleChange?.status==='rising'&&roleChange.ratio<=1.75&&sensitivity?.scenarios.length>=3&&sensitivity.pass))reason='Increased role needs a supported projection and robust opportunity scenarios';
 // Policy safeguards for provisional estimates, not measured confidence limits.
 if(!reason&&!validated&&(q.p<.30||p<.45)&&!(nbaTeam&&anchored&&q.p>=.30&&p>=.30))reason='Unvalidated longshot; insufficient reliability';
 const referenceP=market>0&&market<1?market:q.p;
 if(!reason&&!validated&&Math.abs(p-referenceP)>.18)reason='Model disagrees too strongly with market';
 if(!reason&&num(m.spread)!=null&&(num(m.spread)<0||num(m.spread)>.10))reason='Quote spread too wide';
 if(!reason&&options.featured&&likelihoodMode&&conservativeP<.55)reason='Featured pick needs stronger likelihood';
 // Pending reports are advisory for every sport. Specific injury, roster,
 // starter exclusions and role checks above remain hard gates. Missing inputs
 // already widen the probability buffer; the clock alone is not new evidence.
 const nearStart=Number.isFinite(start)&&start-Date.now()<=90*60000;
 if(!reason&&nearStart&&(options.featured||options.parlay)){
  const availability=warnings.some(w=>/unconfirmed|confirm participation|conditional on participation/i.test(w));
  if(availability)warnings.push('Lineup pending · Not final; confirm participation before game time');
 }
 const tier=anchored?'suggestion':warnings.length?'conditional':'value';
 if(anchored)warnings.push('Context-supported suggestion; value unverified');
 const parlayKey=String(m.marketKey||'').replace(/_alternate$/,'');
 if(options.parlay&&['player_rush_attempts','player_pass_attempts','player_pass_completions'].includes(parlayKey))reason='Caesars straight only';
 else if(options.parlay&&s==='nfl'&&parlayKey==='player_pass_interceptions')reason='Unsupported SGP player market';
 if(!reason&&likelihoodMode&&conservativeP<.5)reason='Win Chance needs a buffered estimate of at least 50%';
 if(!reason&&nbaTeam&&q.p>.85)reason='NBA team-market price too short';
 if(!reason&&nbaTeam&&matchupMode&&q.p-conservativeP>.10)reason='NBA team-market price exceeds buffered likelihood by over 10 points';
 if(!reason&&likelihoodMode&&q.p>.85)reason='Price too short for Win Chance';
 if(!reason&&window.SELECTION_UI?.excluded?.(s,m))reason='Selection excluded by you';
 const dataReason=reason,dataPass=!dataReason;
 if(!reason&&saferMode&&conservativeP<window.PARLAY_POLICY.minBufferedP)reason='Safer legs need at least 55% buffered likelihood';
 if(!reason&&saferMode&&q.p>window.PARLAY_POLICY.maxMarketP)reason='Price too short for safer parlay selection';
 if(!reason&&saferMode&&q.p-conservativeP>window.PARLAY_POLICY.maxPriceGap)reason='Price exceeds buffered likelihood by over 6 points';
 if(potentialValue&&!likelihoodMode&&!matchupMode)warnings.push('Potential value only; positive raw EV does not clear uncertainty buffer');
 if(!reason&&!clearsValue&&!likelihoodMode&&!matchupMode)reason='Edge does not clear uncertainty buffer';
 if(likelihoodMode)warnings.push('Win Chance prioritizes estimated likelihood; price may be poor value');
 const minimumOdds=nbaTeam&&anchored?null:acceptableOdds(conservativeP);
 const valueQualified=!likelihoodMode&&!matchupMode&&validated&&!reason&&clearsValue&&!anchored&&!warnings.length;
  const provisionalValue=potentialValue&&!likelihoodMode&&!matchupMode;
 const rankingP=conservativeP;
 if(matchupMode)warnings.push('Matchup selection; positive price value is not established');
 // Ranking preference only: don't reject good evidence simply because the price
 // is short, but don't let extreme juice masquerade as better pick quality.
 const juicePenalty=Math.max(0,(q.p||0)-.75)*100;
 if(!reason&&juicePenalty>0)warnings.push('Short price; limited payout for the risk');
 return {pass:!reason,reason,selectionMode,dataPass,dataReason,pricePass:!(nbaTeam&&anchored)&&clearsValue,provisionalValue,priceGap:conservativeP!=null&&q.p>0?Math.max(0,q.p-conservativeP):null,modelP:p,conservativeP,rankingP,buffer,bufferParts,bufferMethod:learned?.method||'Fixed policy buffer; empirical evidence collecting',roleChange,ev:nbaTeam&&anchored?null:ev,conservativeEV:nbaTeam&&anchored?null:conservativeEV,coverage,validated,quote:q,warnings,tier:likelihoodMode?'likelihood':provisionalValue?'potential':tier,valueQualified,context,sensitivity,minimumOdds,bufferLabel:'Selection buffer; not a confidence interval',evidence:validated?'Calibrated estimate':'Unvalidated model',juicePenalty,rank:!reason?(likelihoodMode?rankingP*100:matchupMode?coverage*60+rankingP*30:Math.min(conservativeEV||0,.30)*100+coverage*20+rankingP*10)+(validated?8:0)-Math.min(warnings.length,4)-juicePenalty:-999};
}
function joint(legs){
 const ps=legs.map(l=>num(l.modelP??l.modelProbability));
 if(!ps.length||ps.some(p=>!(p>0&&p<1)))return null;
 // Frechet bounds hold without inventing dependence from pairing scores.
 return {lower:Math.max(0,ps.reduce((a,b)=>a+b,0)-(ps.length-1)),upper:Math.min(...ps),method:'Dependence bounds; joint model unvalidated'};
}
function checkBuild(s,entries,sgp=false,offer=null){
 if(window.SELECTION_UI?.accepts&&!window.SELECTION_UI.accepts(s,(entries||[]).map(e=>e.market)))return {pass:false,reason:'Locked selections cannot form this build; clear locks or adjust filters',checks:[]};
 if(!entries?.length)return {pass:false,reason:'No qualifying legs',checks:[]};
 const checks=entries.map(e=>assess(s,e.market,e.forecast,{game:e.game,parlay:true}));
 if(checks.some(x=>!x.pass))return {pass:false,reason:checks.find(x=>!x.pass).reason,checks};
 const keys=entries.map(e=>String(e.market.canonical_event_id||e.game?.id||gameFor(s,e.market)?.id||e.market.gameId||e.market.game_id||e.market.event_ticker?.replace(/^[^-]+-/, '')||''));
 if(!sgp){
  if(keys.some(k=>!k)||new Set(keys).size!==keys.length||entries.some((e,i)=>entries.slice(0,i).some(x=>window.MARKET_GUARDS?.sameEvent?.(e.market,x.market))))return {pass:false,reason:'One leg per verified game required',checks};
  return {pass:true,checks};
 }
 if(keys.some(k=>!k)||new Set(keys).size!==1)return {pass:false,reason:'SGP requires one verified matchup',checks};
 const bounds=joint(checks),breakEven=implied(offer);
 return {pass:true,checks,bounds,breakEven,valueStatus:breakEven==null?'Joint value unverified':bounds.lower>breakEven?'Clears marginal dependence bound; joint model unvalidated':bounds.upper<=breakEven?'Price fails even the upper bound':'Joint value unverified',actionable:false};
}
const straightPolicy=Object.freeze({minOdds:-250,maxOdds:-110,preferredMin:-200,preferredMax:-125,minCoverage:.6,confidenceTolerance:.02});
function straight(s,m,f={},options={}){
 // Straight selection is independent of parlay and matchup preferences.
 const x=assess(s,m,{...f,selectionMode:'screened'},{...options,featured:true});
 let reason=x.reason;
 if(!reason&&(x.quote.odds<straightPolicy.minOdds||x.quote.odds>straightPolicy.maxOdds))reason='Straight price must be -250 to -110';
 if(!reason&&x.coverage<straightPolicy.minCoverage)reason='Straight needs at least 60% input coverage';
 const starter=x.context?.starterEvidence,ctx=data.get(s)?.context||{};
 if(!reason&&s==='nba'&&!(m.player?starter?.confirmedPlayer:starter?.confirmed))reason='Straight waiting for confirmed player availability or lineups';
 if(!reason&&s==='ncaaf'&&!starter?.confirmed)reason='Straight waiting for confirmed starting quarterbacks';
 if(!reason&&s==='nhl'&&(!starter?.confirmed||m.player&&!starter?.lineConfirmed))reason='Straight waiting for confirmed goalies and player role';
 if(!reason&&s==='mlb'){
  const event=(ctx.games||[]).find(g=>String(g.gamePk)===String(m.game_id));
  if(!event?.startersConfirmed||!event?.lineupsConfirmed||x.warnings.some(w=>/lineup status unconfirmed/i.test(w)))reason='Straight waiting for confirmed pitchers and lineups';
 }
 if(!reason&&s==='nfl'&&m.player&&x.warnings.some(w=>/injury status unconfirmed/i.test(w)))reason='Straight waiting for current player availability';
 return {...x,pass:!reason,reason,preferred:x.quote?.odds>=straightPolicy.preferredMin&&x.quote?.odds<=straightPolicy.preferredMax};
}
function bestStraight(s,entries){
 const ranked=entries.map(entry=>({...entry,straight:straight(s,entry.market,entry.forecast||{},{game:entry.game,eventTime:entry.eventTime})})).filter(e=>e.straight.pass)
  .sort((a,b)=>b.straight.conservativeP-a.straight.conservativeP||b.straight.coverage-a.straight.coverage||b.straight.conservativeEV-a.straight.conservativeEV||id(s,a.market).localeCompare(id(s,b.market)));
 if(!ranked.length)return null;
 // Pay for a materially higher win estimate, not a tiny difference in an
 // unvalidated model. Within two points, prefer the intended price range.
 return ranked.find(e=>e.straight.preferred&&ranked[0].straight.conservativeP-e.straight.conservativeP<=straightPolicy.confidenceTolerance)||ranked[0];
}
function evidence(s,m,f={},game){const x=assess(s,m,f,{game}),anchored=f.marketAnchored===true;
 const tier=anchored?(s==='nba'?'Market-informed likelihood; value unverified':'Market-supported suggestion'):!(x.coverage>0)?'Market only':x.validated?'Validated model-supported':'Unvalidated model-supported';
 return {tier,likelihood:x.modelP,coverage:x.coverage,coverageLabel:x.coverage>=.75?'More complete':x.coverage>=.45?'Partial':'Limited',valueVerified:x.valueQualified===true,unconfirmed:x.warnings||[],reason:x.reason};
}
function note(s,m,f,game){const x=assess(s,m,f,{game});if(!x.pass)return x.reason;const e=evidence(s,m,f,game);return [s==='ncaaf'?window.NCAAF_MODEL?.explain?.(m,f,x):'',s!=='ncaaf'&&x.sensitivity?'Opportunity scenarios: '+x.sensitivity.scenarios.map(row=>row.name+' '+(row.bufferedP==null?'unavailable':Math.round(row.bufferedP*100)+'% buffered')).join('; ')+' (policy scenarios, not confidence intervals)':'',e.tier,'Estimated likelihood '+Math.round(e.likelihood*100)+'% (not measured accuracy)','Selection buffer '+(x.buffer*100).toFixed(1)+' percentage points; not a confidence interval',x.bufferMethod,f.opportunity?'Projection: '+f.opportunity.method+' · '+f.opportunity.projectedExposure.toFixed(1)+' opportunities × '+(f.opportunity.conversionRate*f.opportunity.efficiency).toFixed(2)+' per opportunity':'',x.minimumOdds==null?'':('Minimum acceptable odds '+(x.minimumOdds>0?'+':'')+x.minimumOdds+' at the same line'),'Evidence '+e.coverageLabel+' · input coverage '+Math.round(e.coverage*100)+'%',x.context.starterEvidence?.note||'',window.ESPN_EVIDENCE?.inspect(m).note||'',x.context.missing.length?'Missing: '+x.context.missing.join(', '):'',...x.warnings].filter(Boolean).join(' · ');}
window.PICK_QUALITY={straightPolicy,straight,bestStraight,contextEvidence,unsupportedAltUnder,evidence,note,validatedRule,prepare,forecast,assess,quote,quoteLabel,estimateOdds,markets:s=>data.get(s)?.markets||[],context:s=>data.get(s)?.context||{},gameFor,id,line,group,joint,checkBuild,decimal,implied,odds};
})();
