// Read-only audit of current snapshots using the dashboard's actual models.
// Usage: node scripts/audit_dashboard.js [ISO timestamp]
const fs=require('node:fs'),path=require('node:path');
const {runtime}=require('./update_pick_history');
const {start}=require('./update_forecast_audit');
async function audit(now=Date.now(),dataDir=path.resolve(__dirname,'../data')){
 const report={at:new Date(now).toISOString(),sports:{}};
 for(const sport of ['nfl','mlb','ncaaf','ufc','nhl']){
  try{const snapshot=JSON.parse(fs.readFileSync(path.join(dataDir,'kalshi-'+sport+'.json'),'utf8')),r=runtime(sport,{dataDir,now}),w=r.window;
   let markets=sport==='nfl'?(snapshot.games||[]).flatMap(g=>(g.markets||[]).map(m=>({...m,gameId:g.id}))):snapshot.markets||[];
   w.PICK_QUALITY.prepare(sport,markets,snapshot.context||{},snapshot.games||[],snapshot.updated_at);
   let forecast;
   if(sport==='nfl'){r.ctx.state.games=snapshot.games||[];for(const file of ['nfl-td-model.js','nfl-projection-engine.js','nfl-model-v3.js'])r.run(file);w.NFL_PROJECTIONS.enrich(true);w.NFL_MODEL_V3.enrich();markets=(snapshot.games||[]).flatMap(g=>(g.markets||[]).map(m=>({...m,gameId:g.id})));forecast=m=>{const g=snapshot.games.find(g=>g.id===m.gameId),x=g?.markets.find(x=>x.ticker===m.ticker&&x.side===m.side);return {modelP:x?.modelProbability,rawModelP:x?.rawModelProbability,coverage:x?.projectionCoverage,confidence:x?.modelConfidence,experimental:x?.tdExperimental}}}
   else{if(['mlb','ncaaf'].includes(sport))r.run('team-alt-lines.js');if(sport==='mlb')r.run('mlb-totals-model.js');if(sport==='ncaaf')r.run('ncaaf-model.js');if(sport==='nhl'){r.run('nhl-model.js');r.run('nhl-alt-lines.js')}r.run(sport+'-dashboard.js');const api=w[sport.toUpperCase()+'_DASHBOARD'];await api.load();forecast=sport==='ncaaf'?api.projection:api.model;}
   const reasons={},kinds={};let passed=0;
   for(const m of markets){if(sport!=='nfl'&&!m.game_time&&!m.start_time)m.start_time=start(sport,m,{},snapshot);const kind=m.kind||m.marketKey||m.type;kinds[kind]=(kinds[kind]||0)+1;const check=w.PICK_QUALITY.assess(sport,m,forecast(m)||{});if(check.pass)passed++;else reasons[check.reason]=(reasons[check.reason]||0)+1}
   const ageMinutes=(now-Date.parse(snapshot.updated_at||snapshot.generated_at))/60000;
   report.sports[sport]={snapshotAt:snapshot.updated_at||snapshot.generated_at,ageMinutes:Math.round(ageMinutes*10)/10,fresh:ageMinutes>=-5&&ageMinutes<=30,markets:markets.length,qualifiedSelections:passed,kinds,rejectionReasons:reasons};
  }catch(error){report.sports[sport]={error:error.message}}
 }
 return report;
}
if(require.main===module)audit(process.argv[2]?Date.parse(process.argv[2]):Date.now()).then(report=>{console.log(JSON.stringify(report,null,2));if(Object.values(report.sports).some(s=>s.error))process.exitCode=1}).catch(e=>{console.error(e);process.exitCode=1});
module.exports={audit};
