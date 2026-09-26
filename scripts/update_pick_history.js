// Runs after the scheduled snapshots. Uses the same browser models and gates to
// preserve the first pregame forecast for each selected Kalshi contract.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const outFile=path.join(root,'data/pick-history.json');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));

function runtime(sport){
  const elements=new Map();
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',style:{},classList:{contains:()=>false}});return elements.get(selector)};
  const document={readyState:'loading',addEventListener(){},querySelector:element,body:{classList:{contains:()=>false}}};
  const window={__ACTIVE_SPORT:sport,__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},COMPACT_UI:{refresh(){}},SPORT_MEDIA:{load:async()=>{},nfl:()=>'',mlb:()=>'',ncaaf:()=>'',ufc:()=>''}};
  const fetch=async url=>{const name=String(url).split('?')[0];if(!/^data\/[a-z0-9-]+\.json$/.test(name))throw Error('Unexpected fetch '+url);const data=read(name.slice(5));return{ok:true,json:async()=>data,text:async()=>JSON.stringify(data)}};
  const ctx=vm.createContext({window,document,fetch,console,setTimeout(){},localStorage:{getItem:()=>null},state:{games:[]},impliedProbability:o=>o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100)});
  const run=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  run('market-guards.js');run('data/model-calibration.js');run('model-calibration.js');run('model-core.js');
  return{window,ctx,run};
}

async function candidates(sport){
  const r=runtime(sport),w=r.window;
  if(sport==='nfl'){
    const snapshot=read('kalshi-nfl.json');r.ctx.state.games=snapshot.games||[];
    for(const file of ['nfl-projection-engine.js','nfl-model-v3.js','confidence-engine.js','recommendation-engine-v2.js'])r.run(file);
    w.NFL_PROJECTIONS.enrich(true);w.NFL_MODEL_V3.enrich();
    return{snapshot,rows:w.NFL_SELECTIVITY.historyPicks().map(m=>({market:m,forecast:{modelP:m.modelProbability,rawModelP:m.rawModelProbability,confidence:m.modelConfidence,coverage:m.projectionCoverage,betEV:m.modelEV},game:(snapshot.games||[]).find(g=>g.id===m.gameId)}))};
  }
  r.run(sport==='mlb'?'mlb-dashboard.js':sport==='ncaaf'?'ncaaf-dashboard.js':'ufc-dashboard.js');
  const api=w[sport.toUpperCase()+'_DASHBOARD'];await api.load();
  return{snapshot:read('kalshi-'+sport+'.json'),rows:api.historyPicks()};
}

function readCalibrationVersion(){try{return JSON.parse(fs.readFileSync(path.join(root,'data/model-calibration.js'),'utf8').replace(/^window\.MODEL_CALIBRATION_DATA=/,'').replace(/;\s*$/,'')).updated_at}catch{return null}}
function record(sport,entry,now){
  const m=entry.market||{},f=entry.forecast||{},g=entry.game||{};
  const ticker=String(m.ticker||'');const side=sport==='nfl'&&m.quoteSide==='no'?'no':'yes';
  const close=m.close_time||g.commence_time||m.game_time;
  const eventDate=String(m.event_ticker||ticker).match(/-(\d{2})([A-Z]{3})(\d{2})(?:\d{4})?[A-Z]/);
  const month={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
  const inferred=eventDate&&month[eventDate[2]]!=null?new Date(Date.UTC(2000+Number(eventDate[1]),month[eventDate[2]],Number(eventDate[3])+1)).toISOString():null;
  const eventTime=g.commence_time||m.game_time||m.start_time||inferred;
  const marketP=Number(m.probability??m.marketProbability);
  const modelP=Number(f.modelP),rawModelP=Number(f.rawModelP??f.modelP);
  if(!ticker||!Number.isFinite(Date.parse(close))||Date.parse(close)<=now||!Number.isFinite(Date.parse(eventTime))||Date.parse(eventTime)<=now||!(marketP>0&&marketP<1))return null;
  const independent=sport==='nfl'?(Number(f.coverage)>=.2&&Number.isFinite(modelP)):sport==='mlb'?m.kind==='moneyline'&&Number(f.context?.coverage)>=.45&&Number.isFinite(f.betEV)&&f.betEV>0:sport==='ufc'?Number(f.match?.coverage)>=.45&&Number.isFinite(f.betEV)&&f.betEV>0:false;
  const p=independent?modelP:marketP;
  return{id:[sport,ticker,side].join('|'),sport,ticker,side,market:m.marketKey||m.kind||m.type,
    marketGroup:sport==='nfl'?(m.player?'player_prop':m.type==='h2h'?'moneyline':m.type):m.kind,selection:m.name||m.label||m.title||'',event:g.away&&g.home?g.away+' @ '+g.home:m.game_label||m.fight||'',
    closeTime:close,eventTime,recordedAt:new Date(now).toISOString(),marketP,modelP:p,rawModelP:independent?rawModelP:null,calibrationVersion:independent?(readCalibrationVersion()):null,
    forecastType:independent?'model':'market_only',confidence:Number.isFinite(+f.confidence)?+f.confidence:null,
    ask:sport==='nfl'?m.quoteProbability:m.yes_ask,modelEV:independent?Number(f.betEV):null,result:null};
}

async function main(){
  const now=Date.now(),old=fs.existsSync(outFile)?JSON.parse(fs.readFileSync(outFile,'utf8')):{records:[]};
  const rows=Array.isArray(old.records)?old.records:[],seen=new Set(rows.map(r=>r.id));
  for(const sport of ['nfl','mlb','ncaaf','ufc']){
    try{const {rows:choices}=await candidates(sport);for(const choice of choices){const r=record(sport,choice,now);if(r&&!seen.has(r.id)){rows.push(r);seen.add(r.id)}}}
    catch(error){console.warn('History candidates unavailable for',sport,error)}
  }
  // Never drop an unsettled forecast. Keep a bounded settled archive.
  const pending=rows.filter(r=>!r.result),settled=rows.filter(r=>r.result).slice(-3000);
  const payload={updated_at:new Date(now).toISOString(),records:[...settled,...pending]};
  fs.writeFileSync(outFile,JSON.stringify(payload,null,2)+'\n');
  console.log('History',payload.records.length,'records;',pending.length,'pending');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={record,candidates};
