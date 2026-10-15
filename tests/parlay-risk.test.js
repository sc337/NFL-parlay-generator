const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const window={};const ctx=vm.createContext({window,Date,console});for(const file of ['market-guards.js','model-calibration.js','pick-quality.js','parlay-risk.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);return window}
function fixture(w){
 const start=new Date(Date.now()+86400000).toISOString(),stamp=new Date().toISOString();
 const g={id:'game',away:'Away',home:'Home',commence_time:start,game_status:'pre',context:{updated_at:stamp,weather:{available:true}}};
 const rows=['passing','receiving'].map((type,i)=>({market:{ticker:'p'+i,gameId:g.id,type,marketKey:i?'player_reception_yds':'player_pass_yds',point:i?49.5:199.5,side:'over',team:'Home',player:i?'WR':'QB',_rosterVerified:true,price:100,source:'Kalshi',marketProbability:.5,quotedAt:stamp,contextSignals:{injury_checked:true,injury_status:'none_reported'},propHistory:{played:5,roleStable:true}},forecast:{modelP:.64,marketP:.5,coverage:.8,roleStability:.8,uncertainty:.3},game:g}));
 g.markets=rows.map(e=>e.market);w.PICK_QUALITY.prepare('nfl',g.markets,{},[g],stamp);return rows;
}
test('shared QB/receiver scenarios differ from multiplying marginals and stay unvalidated',()=>{
 const w=setup(),entries=fixture(w),x=w.PARLAY_RISK.summarize('nfl',entries,{sgp:true,offer:400,checkedAt:new Date().toISOString()});
 assert.equal(x.pass,true);assert.ok(x.modelP>.64**2+.02);assert.ok(x.modelP<.64);assert.equal(x.scenario.trials,24000);assert.equal(x.valueVerified,false);assert.equal(x.priceStatus,'SGP value unverified');assert.match(x.warning,/not a confidence interval/);
 const again=w.PARLAY_RISK.summarize('nfl',entries,{sgp:true});assert.deepEqual(x.scenario,again.scenario);
});
test('opposing directions cannot receive a positive-correlation uplift',()=>{const w=setup(),e=fixture(w);const over=w.PARLAY_RISK.summarize('nfl',e,{sgp:true});e[1].market.side='under';const under=w.PARLAY_RISK.summarize('nfl',e,{sgp:true});assert.ok(under.modelP<over.modelP-.03)});
test('duplicate games fail multi-game checks; no weak leg can enter a parlay',()=>{const w=setup(),e=fixture(w);assert.equal(w.PARLAY_RISK.summarize('nfl',e).pass,false);e[1].forecast.modelP=.51;assert.equal(w.PARLAY_RISK.summarize('nfl',e,{sgp:true}).pass,false)});
test('independent builds use a buffered likelihood and need an actual current offer',()=>{const w=setup(),e=fixture(w);e[1].game={...e[1].game,id:'other'};e[1].market.gameId='other';const x=w.PARLAY_RISK.summarize('nfl',e);assert.equal(x.modelP,.64**2);assert.ok(x.conservativeP<x.modelP);assert.equal(x.breakEven,null);assert.equal(x.valueVerified,false);assert.equal(w.PARLAY_RISK.summarize('nfl',e,{offer:400,checkedAt:new Date(Date.now()-16*60000).toISOString()}).breakEven,null);assert.match(w.PARLAY_RISK.summarize('nfl',e,{offer:-200,checkedAt:new Date().toISOString()}).priceStatus,/does not clear/)});
test('missing role or team identification never produces an invented joint estimate',()=>{const w=setup(),e=fixture(w);e[1].market.team='Unknown';const x=w.PARLAY_RISK.summarize('nfl',e,{sgp:true});assert.equal(x.modelP,null);assert.equal(x.scenario,null);assert.equal(x.valueVerified,false)});
test('risk categories reflect estimated likelihood, not offered payout',()=>{const w=setup();assert.equal(w.PARLAY_RISK.profile(.4),'Conservative');assert.equal(w.PARLAY_RISK.profile(.2),'Balanced');assert.equal(w.PARLAY_RISK.profile(.08),'Lotto')});
test('historical pair rules replace assumed relationships only with sufficient held-out evidence',()=>{
 const w=setup(),entries=fixture(w);vm.runInNewContext(fs.readFileSync('model-learning.js','utf8'),{window:w,Date});
 const version=w.MODEL_LEARNING.VERSION,key=w.MODEL_LEARNING.pairKey({marketFamily:'player_pass_yds',direction:'over',player:'QB',team:'Home'},{marketFamily:'player_reception_yds',direction:'over',player:'WR',team:'Home'});
 const rule={active:true,modelVersion:version,trainingEvents:60,validationEvents:30,trainedThrough:new Date(Date.now()-10*86400000).toISOString(),validationFrom:new Date(Date.now()-9*86400000).toISOString(),validationThrough:new Date(Date.now()-86400000).toISOString(),rho:.6};
 w.MODEL_LEARNING_DATA={modelVersion:version,updated_at:new Date().toISOString(),sports:{nfl:{pairs:{[key]:rule}}}};
 const x=w.PARLAY_RISK.summarize('nfl',entries,{sgp:true});assert.equal(x.scenario.empiricalPairs,1);assert.match(x.scenario.method,/Held-out historical/);assert.equal(x.valueVerified,false);assert.equal(x.scenario.validated,false);
 rule.validationEvents=29;assert.equal(w.PARLAY_RISK.summarize('nfl',entries,{sgp:true}).scenario.empiricalPairs,0);
});
