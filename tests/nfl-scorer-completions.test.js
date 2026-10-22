const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{runtime}=require('../scripts/update_pick_history');
function setup(){const r=runtime('nfl');for(const f of ['nfl-alt-lines.js','nfl-projection-engine.js','nfl-model-v3.js','nfl-completions.js'])r.run(f);return r;}
test('TD scorer is selectable for parlay screening while completions remain straight-only',()=>{
 const r=setup(),source=fs.readFileSync('app.js','utf8');r.ctx.STRAIGHT_ONLY_MARKETS=new Set(['player_rush_attempts','player_pass_attempts','player_pass_completions']);
 vm.runInContext(source.slice(source.indexOf('function isParlayEligible('),source.indexOf('const PROP_MARKET_META')),r.ctx);
 const td={player:'Runner',marketKey:'player_anytime_td',type:'td'},completions={player:'QB',marketKey:'player_pass_completions',type:'passing'};
 assert.equal(r.window.NFL_ALT_LINES.selected(td,new Set(['td'])),true);assert.equal(r.ctx.isParlayEligible(td),true);
 assert.equal(r.window.NFL_ALT_LINES.selected(completions,new Set(['completions'])),true);assert.equal(completions.type,'completions');assert.equal(r.ctx.isParlayEligible(completions),false);
 assert.equal(r.window.NFL_ALT_LINES.matches(td,'alt'),false);assert.equal(r.window.NFL_ALT_LINES.matches(td,'both'),true);
});
test('TD scorer workload uses RB rush attempts and receiver targets, and rejects unavailable players',()=>{
 const r=setup(),history={source:'nflverse completed plays',games:5,played:5,opportunities:{player_rush_attempts:[15,15,15,15,15],targets:[5,5,5,5,5],player_pass_attempts:[0,0,0,0,0]}};
 for(const position of ['RB','WR']){const m={type:'td',position,propHistory:history};assert.ok(r.window.NFL_MODEL_V3.role(m)>=.6);m.contextSignals={injury_status:'out'};assert.ok(r.window.NFL_MODEL_V3.role(m)<.6);}
});
test('completion review uses straight checks and keeps the parlay exclusion in force',()=>{
 const r=setup(),now=Date.now(),m={type:'completions',marketKey:'player_pass_completions',player:'QB',team:'Home',side:'over',point:19.5,price:-110,prob:.5,marketProbability:.5,_rosterVerified:true,quotedAt:new Date(now).toISOString(),contextSignals:{injury_checked:true,injury_status:'none_reported'},propHistory:{source:'nflverse completed plays',played:5,games:5,latest_game:new Date(now-3*86400000).toISOString().slice(0,10),metrics:{player_pass_completions:[24,25,23,24,24]},opportunities:{player_pass_attempts:[35,35,35,35,35]}}},g={id:'g',away:'Away',home:'Home',commence_time:new Date(now+86400000).toISOString(),context:{updated_at:new Date(now).toISOString()},markets:[m]};
 r.ctx.state.games=[g];r.window.PICK_QUALITY.prepare('nfl',[m],{},[g],m.quotedAt);
 const forecast=m=>r.window.NFL_MODEL_V3.evaluate(g,m),rows=r.window.NFL_COMPLETIONS.rows([g],{mode:'multi',lineMode:'both'},forecast);
 assert.equal(rows.length,1);assert.notEqual(rows[0].check.reason,'Caesars straight only');assert.equal(r.window.PICK_QUALITY.assess('nfl',m,forecast(m),{game:g,parlay:true}).reason,'Caesars straight only');
});
