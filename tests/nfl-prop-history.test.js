const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('../scripts/update_pick_history');
function setup(patch={}){const r=runtime('nfl'),now=Date.now(),m={type:'rushing',marketKey:'player_rush_yds',player:'Runner',team:'Home',point:45.5,side:'over',prob:.5,marketProbability:.5,price:100,sourceQuality:85,_rosterVerified:true,contextSignals:{injury_checked:true,injury_status:'none_reported',market_breadth:10},propHistory:{source:'nflverse completed plays',games:4,played:4,latest_game:new Date(now-3*86400000).toISOString().slice(0,10),metrics:{player_rush_yds:[85,72,90,78]}},...patch},g={commence_time:new Date(now+86400000).toISOString(),away:'Away',home:'Home',context:{updated_at:new Date(now).toISOString()},markets:[m]};r.ctx.state.games=[g];for(const f of ['nfl-projection-engine.js','nfl-model-v3.js'])r.run(f);r.window.NFL_PROJECTIONS.enrich(true);r.window.NFL_MODEL_V3.enrich();r.window.PICK_QUALITY.prepare('nfl',[m],{},[g],new Date(now).toISOString());return{...r,m,g}}
test('completed player results produce an experimental forecast but cannot bypass market-disagreement checks',()=>{const r=setup(),f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m),q=r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g,parlay:true});assert.equal(f.projection,81.25);assert.ok(f.coverage>=.45);assert.ok(f.modelP>.5&&f.modelP<.85);assert.equal(q.pass,false);assert.equal(q.reason,'Model disagrees too strongly with market');assert.equal(q.valueQualified,false);assert.match(q.warnings.join(' '),/Experimental player-history/)});
test('stale, same-day, insufficient or missing history cannot bypass the projection gate',()=>{for(const modify of [h=>h.latest_game='2025-01-01',h=>h.latest_game=new Date(Date.now()+86400000).toISOString().slice(0,10),h=>h.played=2,h=>h.metrics.player_rush_yds=[85,72],h=>h.source='quote counts']){const r=setup();modify(r.m.propHistory);const f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m);assert.ok(f.coverage<.45);assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g}).pass,false)}});
test('historical forecasts still respect roster and injury gates and straight-only attempts',()=>{for(const patch of [{_rosterVerified:false},{contextSignals:{injury_checked:true,injury_status:'out'}},{contextSignals:{injury_checked:true,injury_status:'questionable'}}]){const r=setup(patch),f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m);assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g}).pass,false)}const r=setup({price:-186,marketProbability:.65,prob:.65});r.m.marketKey='player_rush_attempts';r.m.point=10.5;r.m.propHistory.metrics.player_rush_attempts=[19,21,18,20];const f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m);assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g}).pass,true);assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g,parlay:true}).reason,'Caesars straight only')});

test('a history estimate with missing role context must clear the wider buffer',()=>{const r=setup({point:70.5}),f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m),q=r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g});assert.equal(q.pass,false);assert.equal(q.reason,'Edge does not clear uncertainty buffer');assert.equal(q.validated,false);assert.equal(q.valueQualified,false)});
test('legacy reception snapshots use count variance and preserve the quoted line and price',()=>{
 const r=setup({type:'receiving',marketKey:'player_receptions',point:5.5});r.run('nfl-alt-lines.js');
 r.m.propHistory.metrics={player_receptions:[4,5,4,5]};r.m.propHistory.opportunities={targets:[6,6,6,6]};
 const price=r.m.price,f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m);
 assert.equal(r.m.type,'receptions');assert.ok(f.sd>=1.2&&f.sd<2);assert.equal(r.m.point,5.5);assert.equal(r.m.price,price);
});
test('display hit estimates share one history distribution across ALT thresholds and ignore quote changes',()=>{
 const r=setup(),api=r.window.NFL_MODEL_V3;
 const f=api.evaluate(r.g,r.m),high=api.evaluate(r.g,{...r.m,point:65.5}),quote=api.evaluate(r.g,{...r.m,prob:.7,marketProbability:.7,price:-230});
 assert.ok(f.estimatedHitProbability>high.estimatedHitProbability);
 assert.equal(f.estimatedHitProbability,quote.estimatedHitProbability);
 assert.ok(Math.abs(f.estimatedHitProbability+api.evaluate(r.g,{...r.m,side:'under'}).estimatedHitProbability-1)<1e-8);
 assert.match(api.propSummary(r.g,r.m),/Projected 81.3 · Est. hit \d+% · Experimental · 4 games/);
 assert.match(api.propSummary(r.g,{...r.m,point:45}),/unavailable/);
 delete r.m.propHistory;assert.match(api.propSummary(r.g,r.m),/unavailable/);
});
