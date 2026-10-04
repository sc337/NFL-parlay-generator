const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function build(markets,count=2){
 const games=markets.map((m,i)=>({id:String(i),away:'Away '+i,home:'Home '+i,commence_time:'2026-10-05T17:00:00Z',markets:Array.isArray(m)?m:[m]}));
 const context=vm.createContext({window:{},state:{selectedMarkets:new Set(games.flatMap(g=>g.markets.map(m=>m.type))),lineMode:'both'},nflSlate:()=>games,isParlayEligible:m=>m.type!=='td',impliedProbability:o=>o<0?-o/(-o+100):100/(o+100),playerCount:(legs,p)=>legs.filter(l=>l.player===p).length,americanToDecimal:o=>o<0?1+100/-o:1+o/100,decimalToAmerican:d=>Math.round((d-1)*100)});
 vm.runInContext(source.slice(source.indexOf('const PROFILE_RULES ='),source.indexOf('function playerCount('))+source.slice(source.indexOf('function propFamily('),source.indexOf('function reasonFor(')),context);
 return context.buildMulti(count,50,'balanced');
}
const ml=(price=-130)=>({type:'h2h',marketKey:'h2h',price,name:'Winner',team:'Team'});
const prop=(player,type='receiving')=>({type,marketKey:type==='receiving'?'player_reception_yds':'player_rush_yds',player,price:-120,name:player});
test('moneyline-only NFL selection builds two through six legs across distinct games',()=>{for(let count=2;count<=6;count++){const p=build(Array.from({length:6},()=>ml()),count);assert.equal(p.legs.length,count);assert.equal(new Set(p.legs.map(l=>l.gameLabel)).size,count)}});
test('single prop family fills requested slots from distinct players and games',()=>{assert.equal(build([prop('A'),prop('B'),prop('C')],3).legs.length,3)});
test('multi-game diversity still prefers different available prop families',()=>{const p=build([prop('A'),prop('B'),prop('C','rushing')]);assert.equal(new Set(p.legs.map(l=>l.type)).size,2)});
test('completion does not reuse games, duplicate players, or out-of-band quotes',()=>{assert.equal(build([[ml(),ml()],ml(900)]),null);assert.equal(build([prop('A'),prop('A')]),null);const p=build([ml(),ml(),ml(900)],3);assert.equal(p.legs.length,2);assert.equal(p.requestedLegs,3)});
