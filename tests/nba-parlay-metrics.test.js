const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function forecastUI(f={modelP:.88,projectedLine:24.6},target=false){
 const source=fs.readFileSync('nba-dashboard.js','utf8'),env={window:{NBA_PROP_TARGETS:{isTarget:()=>target},NBA_MODEL:{estimate:m=>({projectedLine:{points:22.4,rebounds:11.3,assists:3.2}[m.kind]})}},context:{},model:()=>f,Q:{quoteLabel:()=> 'Kalshi -317',assess:()=>({conservativeP:.79})},lineup:()=>({lineupLabel:'Projected lineup'}),esc:String,media:()=>'',note:()=>''};
 vm.runInNewContext(source.slice(source.indexOf('function visibleLegEstimate'),source.indexOf('let longshotTargets'))+';this.leg=leg;this.metrics=visibleLegEstimate;',env);return env;
}
test('quoted NBA props emit visible estimate/projection data independent of target registration or profile',()=>{
 const env=forecastUI(),m={label:'Norman Powell Over 14.5 Points',kind:'points',player:'Norman Powell',game_time:'future',game_label:'CHI @ BOS',line:14.5};
 const html=env.leg(m,0);assert.match(html,/data-nba-estimate="79"/);assert.match(html,/data-nba-projection="24.6"/);assert.match(html,/Kalshi -317/);assert.doesNotMatch(html,/data-model-estimate=/);
 const anchored=env.metrics({kind:'moneyline'},{marketAnchored:true},.8);assert.equal(anchored.label,'Market est.');assert.equal(anchored.projection,'Unavailable');assert.equal(env.metrics(m,{},null),null);
});
test('double-double and triple-double show component projections rather than an invented milestone total',()=>{
 for(const target of [true,false]){
  const env=forecastUI({modelP:.88,projectedLine:null},target),m={label:'Karl-Anthony Towns Double Double (Yes)',kind:'double_double',line:null};
  const html=env.leg(m,0);assert.match(html,/data-nba-estimate="79"/);assert.match(html,/22.4 PTS · 11.3 REB · 3.2 AST/);assert.doesNotMatch(html,/data-model-estimate=/);
 }
});
test('compact transforms keep conservative prop and milestone metrics visible while retaining actual quoted odds',()=>{
 const fixture=fs.readFileSync('tests/nhl-display.test.js','utf8'),env={require:id=>id==='node:test'?()=>{}:require(id)};
 vm.runInNewContext(fixture+';this.slip=slip;this.display=display;this.make=el;',env);
 for(const label of ['Norman Powell Over 14.5 Points','Karl-Anthony Towns Double Double (Yes)','Player Triple Double (Yes)']){
  const card=env.slip(),leg=card.querySelector('.leg');leg.querySelector('.leg-title').textContent=label;leg.querySelector('.leg-quote').textContent='Kalshi -317';Object.assign(leg.dataset,{nbaEstimate:'79',nbaEstimateLabel:'Est.',nbaEstimateBand:'high',nbaProjection:'24.6'});
  const display=env.display([card],'nba');display.run();const tile=leg.querySelector('.market-tile');assert.ok(tile,label);
  const find=leg.querySelector.bind(leg);leg.querySelector=sel=>sel.split(',').map(s=>find(s)).find(Boolean)||null;
  const runtime={module:{exports:{}},document:{readyState:'loading',addEventListener(){},createElement:tag=>env.make(tag,'')}};
  vm.runInNewContext(fs.readFileSync('compact-picks.js','utf8'),runtime);runtime.module.exports.row(leg,'nba');runtime.module.exports.row(leg,'nba');
  const metrics=leg.querySelector('.nba-visible-projection');assert.ok(metrics);assert.equal(metrics.closest('.card-explanation'),null);assert.match(metrics.textContent,/Est\. 79%Proj\. 24.6/);assert.equal(leg.querySelectorAll('.nba-visible-projection').length,1);assert.equal(tile.querySelector('.market-tile-price').textContent,'Kalshi -317');
 }
});
