const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const provider=fs.readFileSync('kalshi-provider.js','utf8');
function runtime({age=10,cacheAge=age}={}){
 const snapshot=a=>({updated_at:new Date(Date.now()-a*60000).toISOString(),games:[{id:'live',game_status:'pre',commence_time:new Date(Date.now()+86400000).toISOString(),markets:[]}]});
 const nodes=new Map();let hydrated=0,generated=0,saved=0;
 const ctx=vm.createContext({window:{__ACTIVE_SPORT:'nfl',__SPORT_TOKEN:1},state:{games:[],propsLoaded:new Set()},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id)}},localStorage:{getItem:()=>JSON.stringify(snapshot(cacheAge)),setItem:()=>saved++,removeItem:()=>{}},fetch:async()=>({ok:true,status:200,json:async()=>snapshot(age)}),performance:{now:()=>0},setTimeout:()=>{},hydrateGames:()=>hydrated++,generate:async()=>generated++,setStatus:()=>{},Date});
 vm.runInContext(provider,ctx);return {ctx,load:()=>ctx.window.NFL_KALSHI.load(),stats:()=>({hydrated,generated,saved})};
}
test('expired NFL cache and response never enter live recommendations',async()=>{const app=runtime({age:257});assert.equal(await app.load(),false);assert.equal(app.ctx.state.games.length,0);assert.deepEqual(app.stats(),{hydrated:0,generated:0,saved:0})});
test('fresh NFL response can recover from an expired cache',async()=>{const app=runtime({age:5,cacheAge:257});assert.equal(await app.load(),true);assert.equal(app.ctx.state.games.length,1);assert.deepEqual(app.stats(),{hydrated:1,generated:1,saved:1})});
test('older overlapping NFL requests cannot overwrite a newer refresh',async()=>{
 const app=runtime({cacheAge:257});let resolveOld;let n=0;
 app.ctx.fetch=async()=>({ok:true,status:200,json:()=>++n===1?new Promise(r=>resolveOld=r):Promise.resolve({updated_at:new Date().toISOString(),games:[{id:'new',game_status:'pre',commence_time:new Date(Date.now()+86400000).toISOString(),markets:[]}]})});
 const old=app.load();await Promise.resolve();await app.load();resolveOld({updated_at:new Date().toISOString(),games:[{id:'old',game_status:'pre',commence_time:new Date(Date.now()+86400000).toISOString(),markets:[]}]});assert.equal(await old,false);assert.equal(app.ctx.state.games[0].id,'new');
});
test('an unavailable NFL profile displays the requested count instead of an eight-market watchlist',()=>{
 const source=fs.readFileSync('app.js','utf8'),nodes=new Map();
 const ctx=vm.createContext({window:{__ACTIVE_SPORT:'nfl'},document:{body:{classList:{contains:()=>false}}},state:{lineMode:'both'},renderNflStraight:()=>{},renderTdMarkets:()=>{},$:s=>{if(!nodes.has(s))nodes.set(s,{value:'2',innerHTML:''});return nodes.get(s)}});
 vm.runInContext(source.slice(source.indexOf('function render(parlays){'),source.indexOf('function renderTdMarkets(){')),ctx);ctx.render([]);assert.match(nodes.get('#results').innerHTML,/No qualifying NFL 2-leg parlay/);assert.doesNotMatch(nodes.get('#results').innerHTML,/markets to review/);
});
test('live recovery replaces an expired scheduled feed without relaxing quote age',async()=>{const app=runtime({age:257,cacheAge:257});app.ctx.window.NFL_LIVE_RECOVERY={load:async()=>({updated_at:new Date().toISOString(),games:[{id:'recovered',game_status:'pre',commence_time:new Date(Date.now()+86400000).toISOString(),markets:[]}]})};assert.equal(await app.load(),true);assert.equal(app.ctx.state.games[0].id,'recovered');assert.equal(app.ctx.window.NFL_KALSHI.lastResult().source,'Kalshi live recovery')});
test('a transient request failure retains only a still-valid cached feed',async()=>{const app=runtime({cacheAge:15});app.ctx.fetch=async()=>{throw Error('network unavailable')};assert.equal(await app.load(),true);assert.equal(app.ctx.state.games.length,1);assert.match(app.ctx.window.NFL_KALSHI.lastResult().source,/Cached/);const expired=runtime({cacheAge:257});expired.ctx.fetch=app.ctx.fetch;assert.equal(await expired.load(),false);assert.equal(expired.ctx.state.games.length,0)});
test('failed live recovery gives the actual stale-feed cause instead of a generic outage',async()=>{const app=runtime({age:257,cacheAge:257});app.ctx.window.NFL_LIVE_RECOVERY={load:async()=>{throw Error('CORS denied')}};assert.equal(await app.load(),false);assert.equal(app.ctx.window.NFL_KALSHI.lastResult().code,'expired');assert.match(app.ctx.window.NFL_KALSHI.lastResult().message,/257m/)});
