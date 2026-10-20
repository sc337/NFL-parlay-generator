const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(){const window={};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),{window});return window.MARKET_GUARDS}
const row=(id,game,rank,player)=>({selection_id:id,ticker:id,game_id:game,player,rank});const assess=m=>({pass:true,rank:m.rank,coverage:.6});
test('complete builds avoid duplicate games and cross-game player concentration',()=>{const G=api(),rows=[row('a','1',100,'P'),row('b','2',99,'P'),row('c','2',97,'Q'),row('d','3',90,'R')],b=G.bestBuild(rows,3,assess);assert.equal(b.length,3);assert.equal(new Set(b.map(m=>m.game_id)).size,3);assert.equal(new Set(b.map(m=>m.player)).size,3);assert.ok(b.some(m=>m.selection_id==='c'))});
test('optimizer never pads missing slots and results are deterministic',()=>{const G=api(),rows=[row('a','1',80),row('b','2',75)];assert.equal(G.bestBuild(rows,3,assess).length,0);assert.deepEqual(G.bestBuild(rows,2,assess),G.bestBuild([...rows].reverse(),2,assess));assert.equal(G.bestBuild(rows,5,assess).length,0)});
test('large same-game ladders cannot crowd every other game out of the search',()=>{const G=api(),rows=Array.from({length:130},(_,i)=>row('a'+i,'1',100-i/100)).concat([row('b','2',70),row('c','3',69)]);assert.equal(G.bestBuild(rows,3,assess).length,3)});
test('failed quality checks cannot enter the optimized build',()=>{const G=api(),rows=[row('a','1',100),row('b','2',99),row('c','3',95)];assert.ok(G.bestBuild(rows,2,m=>({...assess(m),pass:m.game_id!=='2'})).every(m=>m.game_id!=='2'))});
test('Balanced prefers stronger weakest-leg evidence over a higher average rank',()=>{
 const G=api(),a={...row('a','1',100),p:.7,c:.9},weak={...row('weak','2',110),p:.35,c:.6},strong={...row('strong','2',100),p:.6,c:.9};
 const check=m=>({pass:true,rank:m.rank,coverage:m.c,conservativeP:m.p});
 assert.ok(G.bestBuild([a,weak,strong],2,check).includes(weak));
 assert.ok(G.bestBuild([a,weak,strong],2,check,{balanced:true}).includes(strong));
 const thin={...weak,p:.6,c:.45,rank:108};assert.ok(G.bestBuild([a,thin,strong],2,check,{balanced:true}).includes(strong));
 assert.deepEqual(G.bestBuild([a,thin,strong],2,check,{balanced:true}),G.bestBuild([strong,thin,a],2,check,{balanced:true}));
});
test('Balanced penalizes shared same-game drivers without inventing cross-game correlations',()=>{
 const G=api(),checks=[{conservativeP:.6,coverage:.8},{conservativeP:.6,coverage:.8}],legs=[{game_id:'g',kind:'total',side:'yes'},{game_id:'g',kind:'points',side:'yes'}];
 assert.equal(G.balancedPenalty(checks,legs)-G.balancedPenalty(checks,[legs[0],{...legs[1],game_id:'other'}]),6);
 assert.equal(G.balancedPenalty(checks,[legs[0],{...legs[1],kind:'rebounds'}]),G.balancedPenalty(checks,[]));
});
