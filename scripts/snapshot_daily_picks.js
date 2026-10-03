// Capture the same browser builders; preserve first prices, forecasts and source
// versions for each daily recommendation. Personal browser settings are excluded.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {runtime}=require('./update_pick_history');
const {start}=require('./update_forecast_audit');
const root=path.resolve(__dirname,'..'),timezone='America/Los_Angeles';
const finite=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const dayKey=now=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
function legRecord(sport,entry,snapshot,now){
 const m=entry.market||{},f=entry.forecast||{},g=entry.game||{};
 const eventTime=start(sport,m,g,snapshot),closeTime=m.close_time||eventTime;
 let ask=finite(sport==='nfl'?m.quoteProbability:m.yes_ask);
 if(ask===null&&sport==='nfl'&&finite(m.price)!==null&&Math.abs(m.price)>=100)ask=m.price>0?100/(100+m.price):Math.abs(m.price)/(100+Math.abs(m.price));
 if(!m.ticker||!(ask>0&&ask<1)||!Number.isFinite(Date.parse(eventTime))||Date.parse(eventTime)<=now||!Number.isFinite(Date.parse(closeTime))||Date.parse(closeTime)<=now||['Live','Final','in','post'].includes(m.game_status)||['in','post'].includes(g.game_status))return null;
 const coverage=finite(f.coverage??f.context?.coverage??f.match?.coverage),estimate=finite(f.modelP);
 const hasModel=coverage>0&&estimate>0&&estimate<1;
 return {id:[sport,m.ticker,m.quoteSide==='no'||m.side==='no'?'no':'yes'].join('|'),ticker:m.ticker,side:m.quoteSide==='no'||m.side==='no'?'no':'yes',
  eventId:String(m.game_id||g.id||''),event:g.away&&g.home?g.away+' @ '+g.home:m.game_label||m.fight||'',eventTime,closeTime,
  selection:m.name||m.label||m.title,market:m.marketKey||m.kind||m.type,line:finite(m.point??m.line??String(m.title||m.label||'').match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i)?.[1]),player:m.player||null,
  ask,referenceAmericanOdds:finite(m.price),marketP:finite(m.prob??m.probability??m.marketProbability),
  modelP:hasModel?estimate:null,rawModelP:hasModel?finite(f.rawModelP??estimate):null,coverage,confidence:finite(f.confidence),
  forecastType:hasModel?(f.experimental?'experimental':'model'):'market_only',projectedLine:finite(f.projectedLine),projectedTotal:finite(f.projectedTotal),projectedMargin:finite(f.projectedMargin),projectedAway:finite(f.projectedAway),projectedHome:finite(f.projectedHome),
  isAltLine:m.isAltLine===true,altReferenceLine:finite(m.altReferenceLine),altDistance:finite(m.altDistance),result:null};
}
function captureRecord(sport,build,snapshot,now,version){
 const at=snapshot.updated_at||snapshot.generated_at,age=now-Date.parse(at);
 if(!Number.isFinite(age)||age< -300000||age>1800000||!build.legs?.length)return null;
 const legs=build.legs.map(entry=>legRecord(sport,entry,snapshot,now));
 if(legs.some(l=>!l))return null;
 const mode=build.mode||'multi',day=dayKey(now),signature=legs.map(l=>[l.id,l.selection,l.line]).sort().map(x=>JSON.stringify(x)).join('|');
 const id=[day,sport,mode,build.profile||'best',build.requestedLegs||legs.length,build.card||build.gameId||'',crypto.createHash('sha256').update(signature).digest('hex').slice(0,16)].join('|');
 const independent=mode!=='sgp'&&new Set(legs.map(l=>l.eventId||l.event)).size===legs.length;
 const decimal=independent?legs.reduce((value,l)=>value/l.ask,1):null;
 return {id,day,sport,mode,profile:build.profile||'best',requestedLegs:build.requestedLegs||legs.length,actualLegs:legs.length,
  filters:{lines:sport==='nfl'?'standard':'both',date:'all',card:build.card||null,gameId:build.gameId||null},
  capturedAt:new Date(now).toISOString(),snapshotAt:at,sourceVersion:version,
  priceEstimate:decimal===null?null:Math.round(decimal>=2?(decimal-1)*100:-100/(decimal-1)),
  priceNote:independent?'Combined reference asks; excludes fees.':'Same-game price unavailable; verify sportsbook quote.',legs,result:null};
}
function mergeRecords(old,records){const seen=new Set(old.map(r=>r.id));return [...old,...records.filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true})]}
function settle(records,audit){
 const results=new Map((audit.records||[]).filter(r=>r.result).map(r=>[r.id,r]));
 for(const record of records){for(const leg of record.legs){const match=results.get(leg.id);if(match){leg.result=match.result;leg.settledAt=match.settledAt||null}}
  const outcomes=record.legs.map(l=>l.result);record.result=outcomes.includes('loss')?'loss':outcomes.every(x=>x==='void'||x==='push')?'void':outcomes.every(x=>['win','void','push'].includes(x))?'win':null;
 }
 return records;
}
async function collect(sport,dataDir,now,version){
 const snapshot=JSON.parse(fs.readFileSync(path.join(dataDir,'kalshi-'+sport+'.json'),'utf8')),records=[],passes=[];
 const age=now-Date.parse(snapshot.updated_at||snapshot.generated_at);
 if(!Number.isFinite(age)||age< -300000||age>1800000)return {records:[],status:{captured:0,passes:[{reason:'Feed stale or timestamp invalid'}],snapshotAt:snapshot.updated_at||snapshot.generated_at}};
 const capture=(_sport,build)=>{const record=captureRecord(sport,build,snapshot,now,version);if(record)records.push(record);else passes.push({mode:build.mode,profile:build.profile,requestedLegs:build.requestedLegs,reason:build.legs?.length?'Unverified start or stale quote':'No qualifying build'})};
 const r=runtime(sport,{dataDir,capture});
 r.window.PICK_OF_DAY={today:time=>{const at=Date.parse(time);return at>now&&dayKey(at)===dayKey(now)},show:(_sport,pick)=>{if(!pick)return;const market=pick.market;
  const forecast=sport==='nfl'?{modelP:market.modelProbability,rawModelP:market.rawModelProbability,coverage:market.projectionCoverage,confidence:market.modelConfidence,experimental:market.tdExperimental,projectedLine:market.projectedLine}:r.window[sport.toUpperCase()+'_DASHBOARD']?.[sport==='ncaaf'?'projection':'model']?.(market)||{};
  const game=sport==='nfl'?(snapshot.games||[]).find(g=>g.commence_time===pick.eventTime&&(g.markets||[]).some(m=>m.ticker===market.ticker)):null;
  capture(sport,{mode:'straight',profile:'featured',requestedLegs:1,legs:[{market,forecast,game}]});}};
 if(sport==='nfl'){
  // Load declarations through the public state export, before browser listeners.
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');const boundary=source.indexOf("$$('#marketChips .chip').forEach(c=>c.setAttribute");if(boundary<0)throw Error('NFL builder boundary missing');
  vm.runInContext(source.slice(0,boundary),r.ctx,{filename:'app.js'});
  r.window.NFL_PARLAY_STATE.games=snapshot.games||[];
  for(const file of ['nfl-alt-lines.js','nfl-td-model.js','nfl-projection-engine.js','nfl-model-v3.js','confidence-engine.js','recommendation-engine-v2.js'])r.run(file);
  r.window.NFL_PROJECTIONS.enrich(true);r.window.NFL_MODEL_V3.enrich();r.window.NFL_CONFIDENCE.refresh();
  vm.runInContext('renderNflStraight()',r.ctx);
  for(let n=2;n<=6;n++)for(const profile of ['safe','balanced','long']){
   const multi=vm.runInContext(`buildMulti(${n},50,${JSON.stringify(profile)})`,r.ctx);
   const emit=(p,mode,game)=>{capture(sport,{mode,profile:p?.name||profile,requestedLegs:n,gameId:game?.id,legs:(p?.legs||[]).map(m=>({market:m,forecast:{modelP:m.modelProbability,rawModelP:m.rawModelProbability,confidence:m.modelConfidence,coverage:m.projectionCoverage,experimental:m.tdExperimental,projectedLine:m.projectedLine},game:game||(snapshot.games||[]).find(g=>g.commence_time===m.kickoff&&(g.markets||[]).some(x=>x.ticker===m.ticker))}))})};
   emit(multi,'multi');
   // The default game chooser selects the next pregame matchup. Capture that
   // default SGP rather than spending each refresh building every future game.
   const game=(snapshot.games||[]).filter(g=>g.game_status==='pre'&&Date.parse(g.commence_time)>now).sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time))[0];
   if(game){r.ctx.captureGame=game;const p=vm.runInContext(`buildSgp(captureGame,${n},50,${JSON.stringify(profile)},[])`,r.ctx);emit(p,'sgp',game)}
  }
 }else{
  if(['mlb','ncaaf'].includes(sport))r.run('team-alt-lines.js');
  if(sport==='mlb')r.run('mlb-totals-model.js');if(sport==='ncaaf')r.run('ncaaf-model.js');if(sport==='nhl'){r.run('nhl-model.js');r.run('nhl-alt-lines.js')}
  r.run(sport+'-dashboard.js');const api=r.window[sport.toUpperCase()+'_DASHBOARD'];await api.load();
  for(let n=2;n<=6;n++)api.setLegs(n);
 }
 return {records,status:{captured:records.length,passes,snapshotAt:snapshot.updated_at||snapshot.generated_at}};
}
async function main({dataDir=process.env.SNAPSHOT_DATA_DIR||path.join(root,'data'),now=Date.now(),version=process.env.GITHUB_SHA||'local'}={}){
 process.env.TZ=timezone;
 const file=path.join(dataDir,'daily-picks.json'),archiveDir=path.join(dataDir,'daily-picks'),day=dayKey(now);
 fs.mkdirSync(archiveDir,{recursive:true});
 const dailyFile=path.join(archiveDir,day+'.json'),old=fs.existsSync(dailyFile)?JSON.parse(fs.readFileSync(dailyFile,'utf8')):{records:[]},records=[],sports={};
 for(const sport of ['nfl','mlb','ncaaf','nhl','ufc']){try{const started=Date.now();const result=await collect(sport,dataDir,now,version);records.push(...result.records);sports[sport]=result.status;console.log(sport+':',result.records.length,'captures in',Math.round((Date.now()-started)/1000),'seconds')}catch(error){sports[sport]={error:error.message};console.warn('Daily snapshot unavailable:',sport,error.message)}}
 const merged=mergeRecords(old.records||[],records),auditFile=path.join(dataDir,'forecast-audit.json');
 const audit=fs.existsSync(auditFile)?JSON.parse(fs.readFileSync(auditFile,'utf8')):{records:[]};settle(merged,audit);
 // Preserve every captured forecast. Settlement may update outcomes, never prices.
 const payload={schemaVersion:1,timezone,day,updated_at:new Date(now).toISOString(),sports,records:merged};fs.writeFileSync(dailyFile,JSON.stringify(payload,null,2)+'\n');
 const archiveDates=fs.readdirSync(archiveDir).filter(name=>/^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(name=>name.slice(0,-5)).sort();
 for(const date of archiveDates.filter(date=>date!==day)){
  const target=path.join(archiveDir,date+'.json'),raw=fs.readFileSync(target,'utf8'),past=JSON.parse(raw);settle(past.records||[],audit);
  const updated=JSON.stringify(past,null,2)+'\n';if(updated!==raw)fs.writeFileSync(target,updated);
 }
 // Small current-day entry point; dated files preserve the durable full archive.
 payload.archiveDates=archiveDates;fs.writeFileSync(file,JSON.stringify(payload,null,2)+'\n');
 console.log('Daily recommendation archive:',merged.length,'builds;',records.length,'captured this refresh');return payload;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={main,collect,captureRecord,legRecord,mergeRecords,settle,dayKey};
