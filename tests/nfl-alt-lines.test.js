const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const window={};const env=vm.createContext({window,Math,Number,Map});vm.runInContext(fs.readFileSync('nfl-alt-lines.js','utf8'),env);return {api:window.NFL_ALT_LINES,window,env};}
test('exchange ladders use one balanced reference and keep both sides at that threshold',()=>{
 const {api}=setup();const game={markets:[19.5,39.5,59.5].flatMap((point,i)=>['over','under'].map(side=>({source:'Kalshi',type:'rushing',marketKey:'player_rush_yds',player:'RB',point,side,marketProbability:side==='over'?[.8,.51,.25][i]:[.2,.49,.75][i],price:-110})))};
 const original=JSON.stringify(game.markets.map(m=>[m.point,m.price]));api.classify(game);
 assert.equal(game.markets.filter(m=>!m.isAltLine).length,2);
 assert.ok(game.markets.filter(m=>!m.isAltLine).every(m=>m.point===39.5));
 assert.equal(JSON.stringify(game.markets.map(m=>[m.point,m.price])),original);
 assert.equal(api.label(game.markets[0]),'20+');assert.equal(api.label(game.markets[1]),null);
 assert.ok(game.markets.filter(m=>api.matches(m,'alt')).every(m=>m.isAltLine));
 assert.equal(game.markets.filter(m=>api.matches(m,'both')).length,4);
});
test('explicit sportsbook ALT labels win and unsupported markets stay out of ALT-only',()=>{
 const {api}=setup();const rows=[{type:'passing',marketKey:'player_pass_yds',point:224.5},{type:'passing',marketKey:'player_pass_yds_alternate',point:174.5,player:'QB',side:'over'},{type:'h2h',price:-150}];api.classify({markets:rows});
 assert.equal(rows[0].isAltLine,false);assert.equal(rows[1].isAltLine,true);
 assert.equal(api.matches(rows[2],'alt'),false);assert.equal(api.matches(rows[2],'standard'),true);
 assert.equal(api.label(rows[1]),'175+');assert.equal(api.label({...rows[1],point:175}),null);
});
test('single exchange threshold is never invented into an ALT',()=>{
 const {api}=setup();const market={source:'Kalshi',type:'totals',marketKey:'totals',point:44.5,price:-110};api.classify({markets:[market]});assert.equal(market.isAltLine,false);assert.equal(api.matches(market,'alt'),false);
});
test('unsupported player ALT unders cannot bypass any line filter or cushion comparison',()=>{
 const {api}=setup(),standard={source:'Caesars',type:'rushing',marketKey:'player_rush_yds',player:'RB',point:49.5,side:'under',price:-110},alt={...standard,marketKey:'player_rush_yds_alternate',point:69.5};
 const game={markets:[standard,alt]};api.classify(game);
 for(const mode of ['standard','alt','both'])assert.equal(api.matches(alt,mode),false);
 assert.equal(api.matches(standard,'both'),true);
 assert.equal(api.matches({...alt,side:'over'},'both'),true);
 assert.equal(api.matches({...alt,player:null,type:'totals',marketKey:'totals'},'both'),true);
 assert.equal(api.cushionBonus(alt),0);
 assert.equal(api.comparisonText(standard,game),'');
});
test('alternate yard thresholds share a projection and probabilities change with the threshold',()=>{
 const {window,env}=setup();env.impliedProbability=o=>o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);
 env.document={readyState:'loading',addEventListener(){}};
 vm.runInContext(fs.readFileSync('nfl-projection-engine.js','utf8'),env);
 vm.runInContext(fs.readFileSync('nfl-model-v3.js','utf8'),env);
 const main={type:'rushing',marketKey:'player_rush_yds',player:'RB',point:49.5,side:'over',price:-110};
 const alt={...main,marketKey:'player_rush_yds_alternate',point:29.5};const game={markets:[main,alt,{...main,marketKey:'player_rush_attempts',point:14.5}]};
 const a=window.NFL_MODEL_V3.evaluate(game,main),b=window.NFL_MODEL_V3.evaluate(game,alt);
 assert.equal(a.projection,b.projection);assert.ok(b.modelP>a.modelP);
});

