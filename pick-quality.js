(()=>{'use strict';
const data=new Map(),TTL=30*60000;
const num=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const odds=o=>num(o)!=null&&Math.abs(Number(o))>=100&&Math.abs(Number(o))<=100000;
const decimal=o=>o>0?1+o/100:1+100/Math.abs(o);
const implied=o=>odds(o)?1/decimal(Number(o)):null;
const american=p=>p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);
function group(s,m){return s==='nfl'?(m.type==='td'?'touchdown_scorer':m.player?m.marketKey||m.type:m.type==='h2h'?'moneyline':m.type):m.kind}
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
function prepare(s,markets,context={},games=[],at=null){const byTicker=new Map(),byGame=new Map();for(const g of games){byGame.set(g.id,g);for(const m of g.markets||[])if(m.ticker)byTicker.set(m.ticker,g)}data.set(s,{markets,context,games,at,byTicker,byGame})}
function gameFor(s,m,game){return game||data.get(s)?.byGame?.get(m.gameId)||data.get(s)?.byTicker?.get(m.ticker)||data.get(s)?.games?.find(g=>g.id===m.gameId||(g.markets||[]).some(x=>x===m||x.ticker&&x.ticker===m.ticker))}
function quote(s,m){
 const price=num(m.price),p=price!=null?implied(price):num(m.yes_ask??m.quoteProbability);
 return {odds:p>0&&p<1?(price??american(p)):null,p,source:s==='nfl'?(m.source||gameFor(s,m)?.dataSource||'Reference feed'):'Kalshi',checkedAt:m.quotedAt||data.get(s)?.at||null};
}
function forecast(s,m,f={}){
 const raw=num(f.rawModelP??f.modelP),market=num(f.marketP??m.marketProbability??m.probability),key=group(s,m)+(f.experimental?':experimental':'');
 const rule=window.MODEL_CALIBRATION?.rules?.(s)?.[key],active=rule?.active===true&&rule.validationCount>=20;
 const p=active&&raw>0&&raw<1&&market>0&&market<1?window.MODEL_CALIBRATION.apply(s,key,raw,market):num(f.modelP);
 const q=quote(s,m),ev=p!=null&&q.p>0?p/q.p-1:null;
 return {...f,modelP:p,rawModelP:raw,marketP:market,edge:p!=null&&q.p>0?p-q.p:null,betEV:ev,ev:f.experimental?null:ev,calibrationValidated:active};
}
function quoteLabel(s,m){const q=quote(s,m);if(q.odds==null)return 'Quote unavailable';const fmt=o=>o>0?'+'+o:String(o);return /^Caesars/.test(q.source)?'Caesars '+fmt(q.odds):s==='nfl'?(q.source==='Kalshi'?'Kalshi':'Reference')+' '+fmt(q.odds):'Kalshi '+Math.round(q.p*100)+'¢';}
function estimateOdds(s,markets){if(!window.MARKET_GUARDS?.independent(markets))return null;const prices=markets.map(m=>quote(s,m).odds);if(prices.some(o=>!odds(o)))return null;const d=prices.reduce((value,o)=>value*decimal(o),1);return Math.round(d>=2?(d-1)*100:-100/(d-1));}
function participation(s,m,f,game,warnings){
 const ctx=data.get(s)?.context||{},g=gameFor(s,m,game);
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
  if(m.player&&event?.lineupsConfirmed&&!event?.lineupPlayerIds?.includes(Number(m.player_id||m.playerId)))return 'Player not in confirmed lineup';
 }
 if(s==='nhl'){
  if(m.player&&m.player_verified!==true)return 'Roster unverified';
  if(m.kind==='saves')return 'Goalie usage model unavailable';
  warnings.push(m.player?'Conditional on participation and role':'Team-average goalies; starters unconfirmed');
 }
 if(s==='ncaaf')warnings.push('College injuries and starters unconfirmed');
 return null;
}
function assess(s,m,f={},options={}){
 const q=quote(s,m);let p=num(f.modelP??f.modelProbability??m.modelProbability),coverage=clamp(num(f.coverage??f.context?.coverage??f.match?.coverage??m.projectionCoverage)||0,0,1);
 const minCoverage=s==='nfl'&&!m.player ? .2 : s==='ncaaf' ? .6 : .45;
 const ruleKey=group(s,m)+(f.experimental?':experimental':'');const rule=window.MODEL_CALIBRATION?.rules?.(s)?.[ruleKey],validated=rule?.active===true&&rule.validationCount>=20;
 const raw=num(f.rawModelP??m.rawModelProbability),market=num(f.marketP??m.marketProbability??m.probability);if(validated&&raw>0&&raw<1&&market>0&&market<1)p=window.MODEL_CALIBRATION.apply(s,ruleKey,raw,market);
 const uncertainty=clamp(num(f.uncertainty??m.modelUncertainty)??.5,0,1);
 // A selection buffer, not a statistical confidence interval. Unvalidated
 // models need more headroom and retain their experimental labels.
 const buffer=(validated ? .015 : .035)+(1-coverage)*.02+uncertainty*.015;
 const conservativeP=p==null?null:clamp(p-buffer,.001,.999),ev=p!=null&&q.p>0?p/q.p-1:null,conservativeEV=conservativeP!=null&&q.p>0?conservativeP/q.p-1:null;
 const warnings=[];let reason=null;
 if(s==='nfl'&&m.player&&f.experimental&&!validated)warnings.push('Experimental player-history estimate');
 const anchored=s==='nfl'&&!m.player&&f.marketAnchored===true;
 const quoteAge=Date.now()-Date.parse(q.checkedAt||'');
 const delayedReference=quoteAge>TTL&&quoteAge<=2*3600000;
 if(delayedReference)warnings.push('Delayed reference price; verify current line');
 const g=gameFor(s,m,options.game),start=Date.parse(options.eventTime||m.game_time||m.start_time||m.kickoff||g?.commence_time||'');
 if(Number.isFinite(start)&&start<=Date.now()||['in','post','Live','Final'].includes(m.game_status)||['in','post'].includes(g?.game_status))reason='Event already started';
 else if(!Number.isFinite(start))reason='Event start unverified';
 else if(!q.checkedAt)reason='Quote timestamp unavailable';
 else if(q.checkedAt&&(!Number.isFinite(Date.parse(q.checkedAt))||Date.parse(q.checkedAt)>Date.now()+300000||quoteAge>TTL&&!delayedReference))reason='Quote older than 30 minutes';
 else if(m._invalidRoster===true)reason='Roster unverified';
 else if(!(q.p>0&&q.p<1))reason='Quote unavailable';
 else if(num(m.sourceQuality)!=null&&num(m.sourceQuality)<60)reason='Source quality too low';
 else if(!(p>0&&p<1)||coverage<minCoverage)reason='Independent projection too thin';
 else if(p===num(f.marketP??m.marketProbability??m.probability)&&!f.experimental)reason='Market-only estimate';
 else reason=participation(s,m,f,g,warnings);
 const clearsValue=ev>0&&conservativeEV>0;
 // A market-anchored NFL estimate is a suggestion, never independent proof of EV.
 const logicalSuggestion=anchored&&coverage>=.2&&p>=.52&&p<=.85&&q.p<=.85&&market>0&&p>market;
 if(!reason&&!clearsValue&&!logicalSuggestion)reason='Edge does not clear uncertainty buffer';
 const tier=anchored?'suggestion':warnings.length?'conditional':'value';
 if(anchored)warnings.push('Context-supported suggestion; value unverified');
 const valueQualified=!reason&&clearsValue&&!anchored&&!warnings.length;
 if(options.parlay&&['player_rush_attempts','player_pass_attempts','player_pass_completions'].includes(m.marketKey))reason='Caesars straight only';
 return {pass:!reason,reason,modelP:p,conservativeP,buffer,ev,conservativeEV,coverage,validated,quote:q,warnings,tier,valueQualified,rank:!reason?(tier==='value'?200:tier==='conditional'?100:0)+(anchored?p*70+Math.max(0,p-market)*100:conservativeEV*100)+coverage*5:-999};
}
function joint(legs){
 const ps=legs.map(l=>num(l.conservativeP??l.modelP??l.modelProbability));
 if(!ps.length||ps.some(p=>!(p>0&&p<1)))return null;
 // Frechet bounds hold without inventing dependence from pairing scores.
 return {lower:Math.max(0,ps.reduce((a,b)=>a+b,0)-(ps.length-1)),upper:Math.min(...ps),method:'Dependence bounds; joint model unvalidated'};
}
function checkBuild(s,entries,sgp=false,offer=null){
 if(!entries?.length)return {pass:false,reason:'No qualifying legs',checks:[]};
 const checks=entries.map(e=>assess(s,e.market,e.forecast,{game:e.game,parlay:true}));
 if(checks.some(x=>!x.pass))return {pass:false,reason:checks.find(x=>!x.pass).reason,checks};
 if(!sgp)return {pass:true,checks};
 const bounds=joint(checks),breakEven=implied(offer);
 return {pass:true,checks,bounds,breakEven,valueStatus:breakEven==null?'Joint value unverified':bounds.lower>breakEven?'Clears conservative dependence bound':bounds.upper<=breakEven?'Price fails even the upper bound':'Joint value unverified',actionable:breakEven!=null&&bounds.lower>breakEven&&checks.every(x=>x.valueQualified)};
}
function note(s,m,f,game){const x=assess(s,m,f,{game});return x.pass?x.warnings.join(' · '):x.reason;}
window.PICK_QUALITY={note,prepare,forecast,assess,quote,quoteLabel,estimateOdds,markets:s=>data.get(s)?.markets||[],context:s=>data.get(s)?.context||{},gameFor,id,line,group,joint,checkBuild,decimal,implied,odds};
})();

