const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('shared multi-game builder supports two and three, rejects larger builds',()=>{
 const window={};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),{window});
 const rows=Array.from({length:6},(_,i)=>({game_id:String(i),selection_id:String(i),kind:'moneyline'})),assess=()=>({pass:true,rank:90,coverage:1,conservativeP:.8});
 for(const n of [2,3])assert.equal(window.MARKET_GUARDS.bestBuild(rows,n,assess).length,n);
 for(const n of [4,5,6,8])assert.equal(window.MARKET_GUARDS.bestBuild(rows,n,assess).length,0);
});
test('NBA same-game builder rejects four or more before screening candidates',()=>{
 const source=fs.readFileSync('nba-dashboard.js','utf8'),ctx=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function buildSameGame('),source.indexOf('const PROFILES')),ctx);
 for(const n of [4,5,6,8])assert.equal(ctx.buildSameGame([],n,()=>{throw Error('must reject first')}).length,0);
});
test('generator caps attempted larger builds for every sport',async()=>{
 for(const sport of ['nfl','nba','mlb','ncaaf','nhl','ufc']){
  const frames=[],select={value:'8'},seen=[],window={__ACTIVE_SPORT:sport,__SPORT_TOKEN:1,DASHBOARD_UI:{begin(){},end(){},put:(s,k,n)=>seen.push(n)},generate:async()=>{},[sport.toUpperCase()+'_DASHBOARD']:{setLegs:n=>seen.push(n)}};
  vm.runInNewContext(fs.readFileSync('parlay-generator.js','utf8'),{window,document:{readyState:'loading',addEventListener(){},querySelector:s=>s==='#legsSelect'?select:null},requestAnimationFrame:f=>frames.push(f),console});
  assert.equal(window.PARLAY_GENERATOR.count(),3);const done=window.PARLAY_GENERATOR.run();while(frames.length)frames.shift()();await done;assert.ok(seen.length);assert.ok(seen.every(n=>n===3),sport);
 }
});
