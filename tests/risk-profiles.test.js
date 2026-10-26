const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function core(){const s=fs.readFileSync('app.js','utf8'),ctx=vm.createContext({window:{CONSERVATIVE_POLICY:require('../conservative-policy.js')}});vm.runInContext(s.slice(s.indexOf('function profileSelectionScore('),s.indexOf('function candidateScore(')),ctx);vm.runInContext(s.slice(s.indexOf('function parlaySignature('),s.indexOf('function favoriteTeam(')),ctx);return ctx}
const q=p=>({pass:true,quote:{p},conservativeP:p+.04,validated:false,coverage:.8});
function builder(){
 const source=fs.readFileSync('app.js','utf8'),window={CONSERVATIVE_POLICY:require('../conservative-policy.js')},games=Array.from({length:6},(_,i)=>({id:'game'+i,away:'Away'+i,home:'Home'+i,commence_time:new Date(Date.now()+86400000).toISOString(),markets:[.84,.65,.45].map((p,j)=>({gameId:'game'+i,ticker:'TEST-'+i+'-'+j,type:'totals',marketKey:'totals',name:'Game '+i+' Over '+(30+j*10)+'.5',point:30.5+j*10,side:'over',source:'Kalshi',price:p>=.5?-100*p/(1-p):100*(1-p)/p,marketProbability:p,modelProbability:p+.07,projectionCoverage:.8,modelUncertainty:.2}))}));
 const decimal=o=>o>0?1+o/100:1+100/Math.abs(o),ctx=vm.createContext({window,Date,state:{games,selectedMarkets:new Set(['totals']),lineMode:'both',moreCushion:true},nflSlate:()=>games,isParlayEligible:()=>true,americanToDecimal:decimal,decimalToAmerican:d=>Math.round(d>=2?(d-1)*100:-100/(d-1)),impliedProbability:o=>1/decimal(o),correlation:()=>0});
 vm.runInContext(fs.readFileSync('pick-quality.js','utf8'),ctx);window.PICK_QUALITY.prepare('nfl',games.flatMap(g=>g.markets),{},games,new Date().toISOString());
 vm.runInContext(source.slice(source.indexOf('function profileSelectionScore('),source.indexOf('function playerCount(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function parlaySignature('),source.indexOf('function favoriteTeam(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function propFamily('),source.indexOf('function reasonFor(')),ctx);
 return {ctx,games,run:(n,profile,previous=[])=>ctx.buildMulti(n,50,profile,previous)};
}
test('shared per-leg thresholds apply to both sports and fail closed',()=>{
 const policy=require('../conservative-policy.js');
 for(const sport of ['nfl','nba'])for(const [key,min] of Object.entries({safe:.75,balanced:.65,long:.50})){
  const q={pass:true,conservativeP:min,quote:{p:min-.05},coverage:.8};
  assert.equal(policy.assessProfile(sport,{},q,key).pass,true);
  for(const bad of [{...q,conservativeP:min-.001},{...q,conservativeP:null},{...q,pass:false},{...q,quote:{p:.9}}])assert.equal(policy.assessProfile(sport,{},bad,key).pass,false);
  if(key==='safe')assert.equal(policy.assessProfile(sport,{}, {...q,quote:{p:min+.01}},key).pass,false);
 }
});
test('strong legs can qualify for every profile without mandatory risk separation',()=>{
 const c=core();for(const key of ['safe','balanced','long'])assert.ok(c.profileSelectionScore(q(.80),key)>-900);
 assert.equal(c.profileSelectionScore(q(.50),'safe'),-999);assert.equal(c.profileSelectionScore(q(.60),'balanced'),-999);
 const build={legs:[{name:'a'},{name:'b'}]};assert.equal(c.distinctProfileBuild(build,[build]),true);
});
test('real multi-game builder enforces per-leg minima at 2–4 legs and keeps one game per leg',()=>{
 const policy=require('../conservative-policy.js');
 for(const n of [2,3,4]){const b=builder(),previous=[];for(const key of ['safe','balanced','long']){
  const p=b.run(n,key,previous);assert.ok(p,key+' should qualify');assert.equal(p.legs.length,n);assert.equal(new Set(p.legs.map(l=>l.gameId)).size,n);
  for(const m of p.legs){const check=b.ctx.window.PICK_QUALITY.assess('nfl',m,b.ctx.nflQualityForecast(m,key),{parlay:true});assert.ok(check.conservativeP>=policy.thresholds[key]);}
  previous.push(p);
 }assert.equal(b.ctx.parlaySignature(b.run(n,'balanced',[previous[0]])),b.ctx.parlaySignature(previous[1]));}
});
test('strong single-tier slate is allowed in all profiles; requiring props still blocks team-only builds',()=>{
 const b=builder();for(const g of b.games)g.markets=g.markets.slice(0,1);
 for(const key of ['safe','balanced','long'])assert.ok(b.run(4,key));
 b.ctx.state.requirePlayerProp=true;for(const key of ['safe','balanced','long'])assert.equal(b.run(2,key),null);
});
test('profile history freezes quotes, deduplicates and never invents SGP returns',()=>{const storage=new Map(),window={NFL_PARLAY_STATE:{games:[]},PICK_QUALITY:{odds:o=>Math.abs(o)>=100,decimal:o=>o>0?1+o/100:1+100/Math.abs(o)}};vm.runInNewContext(fs.readFileSync('nfl-profile-history.js','utf8'),{window,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date});const legs=['a','b'].map(name=>({name,gameId:name,type:'h2h',team:name,price:100,modelProbability:.6,kickoff:new Date(Date.now()+3600000).toISOString()}));const p={profile:'safe',legs};window.NFL_PROFILE_HISTORY.record([p],'sgp');window.NFL_PROFILE_HISTORY.record([p],'sgp');assert.equal(window.NFL_PROFILE_HISTORY.rows().length,1);legs[0].price=500;assert.equal(window.NFL_PROFILE_HISTORY.rows()[0].legs[0].odds,100);window.NFL_MODEL_TRACKER={rows:()=>window.NFL_PROFILE_HISTORY.rows()[0].legs.map(l=>({id:l.id,result:'win'}))};const m=window.NFL_PROFILE_HISTORY.metrics().safe;assert.equal(m.hitRate,1);assert.equal(m.referenceROI,null)});
