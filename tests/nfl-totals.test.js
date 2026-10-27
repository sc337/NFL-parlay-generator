const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
const state={games:[]};
const context={window,state,document:{readyState:'loading',addEventListener(){}},setTimeout(){},
  impliedProbability:()=>.5,Number,Math};
vm.runInNewContext(fs.readFileSync('model-core.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('nfl-alt-lines.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('nfl-projection-engine.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('nfl-model-v3.js','utf8'),context);
const game={away:'Away',home:'Home',context:{recent_form:{
  Away:{available:true,games:2,avg_points_for:30,avg_points_against:24},
  Home:{available:true,games:2,avg_points_for:28,avg_points_against:26}},
  weather:{indoor:false,wind_mph:null,temperature_f:null}}};
const over={type:'totals',side:'over',point:44.5,price:100,prob:.5,sourceQuality:70};
const projection=window.NFL_PROJECTIONS.marketProjection(game,over);
assert.equal(projection.team.total,54);
assert(Math.abs(projection.projectionLine-46.4)<.01,'Two games should be regressed strongly toward market');
assert(projection.modelP>.5);
assert.equal(projection.studyVariants.market.line,44.5);
assert(projection.studyVariants.halfForm.line>44.5&&projection.studyVariants.halfForm.line<projection.projectionLine);
assert.equal(projection.studyVariants.weatherOnly.line,44.5,'one-input weather candidate has no effect without a forecast');
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,{...over,prob:.46}).marketP,.46,'Use midpoint instead of offered price as baseline');
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,{...over,side:'under'}).projectionLine,projection.projectionLine);
game.context.weather.wind_mph=21;
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).projectionLine,projection.projectionLine-2);
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).studyVariants.formOnly.line,projection.projectionLine);
game.context.weather={indoor:true,wind_mph:21,temperature_f:20};
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).projectionLine,projection.projectionLine);
game.context.recent_form.Home={available:false};
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).projectionLine,null);
const prop={type:'receptions',marketKey:'player_receptions',player:'Receiver',side:'over',point:5.5,price:100,prob:.5};
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,prop).projectionLine,null);
assert.equal(window.NFL_MODEL_V3.evaluate(game,prop).projectionLine,null,'Missing player projection must not become zero');
// An exchange ladder can put a distant ALT first. The reference must be the
// quoted central threshold; all standard and ALT sides share one distribution.
game.context.recent_form.Home={available:true,games:2,avg_points_for:28,avg_points_against:26};
const totals=[30.5,44.5,54.5].flatMap((point,i)=>['over','under'].map(side=>({
  type:'totals',source:'Kalshi',marketKey:'totals',point,side,price:-110,
  marketProbability:side==='over'?[.9,.51,.2][i]:[.1,.49,.8][i]
})));
const homeSpreads=[-10.5,-2.5,7.5].map((point,i)=>({type:'spreads',source:'Kalshi',marketKey:'spreads',team:'Home',point,price:-110,marketProbability:[.2,.51,.8][i]}));
const ml={type:'h2h',source:'Kalshi',team:'Home',price:-110,marketProbability:.55};
game.markets=[...totals,...homeSpreads,ml];window.NFL_ALT_LINES.classify(game);
const base=window.NFL_PROJECTIONS.marketProjection(game,totals[2]);
assert(Math.abs(base.projectionLine-46.4)<.01,'ALT must use the central 44.5 line');
const overPs=totals.filter(m=>m.side==='over').sort((a,b)=>a.point-b.point).map(m=>window.NFL_PROJECTIONS.marketProjection(game,m).modelP);
const under=totals.filter(m=>m.side==='under').sort((a,b)=>a.point-b.point).map(m=>window.NFL_PROJECTIONS.marketProjection(game,m).modelP);
assert(overPs[0]>overPs[1]&&overPs[1]>overPs[2],'Over probability declines with threshold');
assert(under[0]<under[1]&&under[1]<under[2],'Under probability rises with threshold');
assert(Math.abs(overPs[1]+under[1]-1)<.00001,'Over and Under probabilities complement');
const spreads=homeSpreads.sort((a,b)=>a.point-b.point).map(m=>window.NFL_PROJECTIONS.marketProjection(game,m));
assert(spreads[0].modelP<spreads[1].modelP&&spreads[1].modelP<spreads[2].modelP);
assert(spreads.every(p=>Math.abs(p.marginProjection-spreads[0].marginProjection)<.00001));
const moneyline=window.NFL_PROJECTIONS.marketProjection(game,ml);
assert(Number.isFinite(moneyline.marginProjection));
assert.equal(moneyline.marginProjection,spreads[0].marginProjection,'moneyline uses the same projected team margin');
assert(Math.abs(moneyline.modelP-window.NFL_PROJECTIONS.marketProjection(game,{...homeSpreads[0],point:0}).modelP)<.00001,
  'moneyline win probability matches the zero-spread distribution');
console.log('NFL totals projection fixtures passed');
