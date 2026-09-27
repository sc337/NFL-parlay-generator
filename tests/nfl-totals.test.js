const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
const state={games:[]};
const context={window,state,document:{readyState:'loading',addEventListener(){}},setTimeout(){},
  impliedProbability:()=>.5,Number,Math};
vm.runInNewContext(fs.readFileSync('model-core.js','utf8'),context);
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
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,{...over,prob:.46}).marketP,.46,'Use midpoint instead of offered price as baseline');
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,{...over,side:'under'}).projectionLine,projection.projectionLine);
game.context.weather.wind_mph=21;
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).projectionLine,projection.projectionLine-2);
game.context.weather={indoor:true,wind_mph:21,temperature_f:20};
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).projectionLine,projection.projectionLine);
game.context.recent_form.Home={available:false};
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,over).projectionLine,null);
const prop={type:'receptions',marketKey:'player_receptions',player:'Receiver',side:'over',point:5.5,price:100,prob:.5};
assert.equal(window.NFL_PROJECTIONS.marketProjection(game,prop).projectionLine,null);
assert.equal(window.NFL_MODEL_V3.evaluate(game,prop).projectionLine,null,'Missing player projection must not become zero');
console.log('NFL totals projection fixtures passed');
