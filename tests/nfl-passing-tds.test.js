const test=require('node:test'),assert=require('node:assert/strict'),{runtime}=require('../scripts/update_pick_history');
function setup(){
 const r=runtime('nfl'),now=Date.now();
 r.run('nfl-alt-lines.js');r.run('nfl-projection-engine.js');r.run('nfl-model-v3.js');
 const m={player:'Quarterback',type:'passing',marketKey:'player_pass_tds',team:'Home',side:'over',point:.5,price:-300,prob:.75,marketProbability:.75,source:'Kalshi',quotedAt:new Date(now).toISOString(),_rosterVerified:true,contextSignals:{injury_checked:true,injury_status:'none_reported'},propHistory:{source:'nflverse completed plays',played:5,games:5,latest_game:new Date(now-3*86400000).toISOString().slice(0,10),metrics:{player_pass_tds:[1,2,1,2,2]},opportunities:{player_pass_attempts:[30,30,30,30,30]}}};
 const g={id:'g',away:'Away',home:'Home',commence_time:new Date(now+86400000).toISOString(),context:{updated_at:new Date(now).toISOString()},markets:[m]};r.ctx.state.games=[g];r.window.PICK_QUALITY.prepare('nfl',[m],{},[g],m.quotedAt);return {...r,m,g};
}
test('passing TDs have a separate filter and whole-number ALT milestones without changing offers',()=>{
 const r=setup(),a=r.window.NFL_ALT_LINES;a.classify(r.g);
 assert.equal(r.m.type,'passing_tds');assert.equal(a.selected(r.m,new Set(['passing'])),false);assert.equal(a.selected(r.m,new Set(['passing_tds'])),true);
 assert.equal(a.matches(r.m,'alt'),true);assert.equal(a.label(r.m),'1+');assert.equal(r.m.point,.5);assert.equal(r.m.price,-300);
});
test('passing TD probabilities use discrete counts and preserve complementary over/under outcomes',()=>{
 const r=setup(),a=r.window.NFL_MODEL_V3,p=a.countProbability(2,2,.5,'over');assert.ok(Math.abs(p-(1-Math.exp(-2)))<1e-10);
 assert.ok(Math.abs(p+a.countProbability(2,2,.5,'under')-1)<1e-10);assert.ok(a.countProbability(2,2,1.5,'over')<p);
 assert.equal(a.countProbability(2,2,1,'over'),null);assert.ok(a.countProbability(2,6,.5,'over')<p);
 const f=a.evaluate(r.g,r.m),higher=a.evaluate(r.g,{...r.m,point:1.5});
 assert.equal(f.forecastVersion,'nfl-passing-td-count-v1');r.window.NFL_MODEL_V3.enrich();assert.equal(r.m.forecastVersion,'nfl-passing-td-count-v1');assert.ok(f.sd<2);assert.ok(f.modelP>higher.modelP);
 const quoteChange=a.evaluate(r.g,{...r.m,price:100,prob:.5,marketProbability:.5});assert.equal(f.modelP,quoteChange.modelP);
});
test('passing TDs retain history, roster, injury and price screening instead of the unsupported-market block',()=>{
 const r=setup(),f=r.window.NFL_MODEL_V3.evaluate(r.g,r.m),q=r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g,parlay:true});
 assert.notEqual(q.reason,'Unsupported SGP player market');
 r.m.contextSignals.injury_status='out';assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,f,{game:r.g,parlay:true}).pass,false);
 delete r.m.propHistory;assert.ok(r.window.NFL_MODEL_V3.evaluate(r.g,r.m).coverage<.45);
});
