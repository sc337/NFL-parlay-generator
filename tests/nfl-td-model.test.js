const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const window={},state={games:[]};
const context={window,state,document:{readyState:'loading',addEventListener(){}},setTimeout(){},impliedProbability:()=>.5,Number,Math};
for(const file of ['model-core.js','nfl-td-model.js','nfl-projection-engine.js','nfl-model-v3.js'])
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const game={away:'San Francisco 49ers',home:'Las Vegas Raiders',commence_time:'2026-10-04T20:00:00Z',
 context:{recent_form:{'San Francisco 49ers':{available:true,avg_points_for:27}}}};
const market={type:'td',marketKey:'player_anytime_td',player:'Christian McCaffrey',team:'San Francisco 49ers',
 price:120,prob:.45,_rosterVerified:true,tdOpportunity:{games:3,share:.25,team_tds_per_game:2.5,
 latest_game:'2026-09-27',rush:45,target:10,ten_rush:4,ten_target:1}};

test('opportunity estimate is conservative, experimental, and never actionable',()=>{
 const forecast=window.NFL_PROJECTIONS.marketProjection(game,market);
 assert.equal(forecast.experimental,true);
 assert(forecast.modelP>.3&&forecast.modelP<.55);
 assert.equal(forecast.projectedLine,null);
 const evaluated=window.NFL_MODEL_V3.evaluate(game,market);
 assert.equal(evaluated.actionable,false);
 state.games=[{...game,markets:[market]}];window.NFL_PROJECTIONS.enrich(true);window.NFL_MODEL_V3.enrich();
 assert.equal(market.tdExperimental,true);
 assert.equal(market.nflV3Actionable,false);
});
test('missing, unverified, thin, future or stale play history stays market-only',()=>{
 for(const patch of [{tdOpportunity:null},{_rosterVerified:false},{contextSignals:{injury_status:'out'}},{tdOpportunity:{...market.tdOpportunity,games:1}},
    {tdOpportunity:{...market.tdOpportunity,latest_game:'2026-10-05'}},
    {tdOpportunity:{...market.tdOpportunity,latest_game:'2026-08-01'}}]){
  const p=window.NFL_PROJECTIONS.marketProjection(game,{...market,...patch});
  assert.equal(p.experimental,false);assert.equal(p.modelP,.45);
 }
});
