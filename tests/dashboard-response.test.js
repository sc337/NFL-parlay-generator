const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function starter(){
 let now=Date.parse('2026-10-22T01:00:00Z'),payload={schemaVersion:1,records:[]};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const window={},context={games:{g:{away:'AWY',home:'HME',start:'2026-10-22T02:00:00Z',season_type:2}},players:{}};
 const env={window,Date:Clock,URL,localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>payload})};
 vm.runInNewContext(fs.readFileSync('starter-status.js','utf8'),env);
 const S=window.STARTER_STATUS,m={game_id:'g',game_time:context.games.g.start,kind:'moneyline'};
 S.register('nba',[m],context);
 const row={sport:'nba',game_id:'g',team:'AWY',role:'lineup',players:['One Player','Two Player','Three Player','Four Player','Five Player'],status:'confirmed',checked_at:new Clock().toISOString(),start_time:m.game_time,source_url:'https://nba.com/report'};
 return {S,m,context,row,advance:ms=>now+=ms,load:async rows=>{payload={schemaVersion:1,records:rows};await S.load(true)}};
}
test('lineup cache is calculation-scoped and never crosses report expiry',async()=>{
 const r=starter();await r.load([r.row]);
 let previous;r.S.withCache(()=>{previous=r.S.evidence('nba',r.m,r.context);assert.equal(r.S.evidence('nba',r.m,r.context),previous);r.advance(31*60000);const expired=r.S.evidence('nba',r.m,r.context);assert.notEqual(expired,previous);assert.equal(expired.sides[0].status,'projected')});
 assert.notEqual(r.S.evidence('nba',r.m,r.context),previous);
 await r.load([{...r.row,status:'projected'}]);r.S.withCache(()=>assert.equal(r.S.evidence('nba',r.m,r.context).sides[0].status,'projected'));
});
test('lineup calculation cache is released after an exception and sees new roster evidence',()=>{
 const r=starter();assert.throws(()=>r.S.withCache(()=>{throw Error('interrupted')}));
 const a=r.S.evidence('nba',r.m,r.context),b=r.S.evidence('nba',r.m,r.context);assert.notEqual(a,b);
});
function poller(){
 let payload={records:[]},next=payload,resolve,loads=0,refreshes=0,now=Date.parse('2026-10-22T01:00:00Z');
 class Clock extends Date{static now(){return now}}
 const S={contexts:new Map(),payload:()=>payload,manual:()=>[],load:async()=>{loads++;if(resolve)await new Promise(r=>resolve=r);payload=next}},window={STARTER_STATUS:S,__ACTIVE_SPORT:'nba',__SPORT_TOKEN:1,NBA_DASHBOARD:{refresh(){refreshes++}},NHL_DASHBOARD:{refresh(){refreshes++}}};
 vm.runInNewContext(fs.readFileSync('starter-checks-ui.js','utf8'),{window,Date:Clock,document:{readyState:'loading',visibilityState:'visible',addEventListener(){}},setInterval(){}});
 return {window,S,poll:()=>window.STARTER_CHECKS_UI.poll(),next:p=>next=p,advance:ms=>now+=ms,hold(){resolve=true},release(){resolve()},counts:()=>({loads,refreshes}),now};
}
test('unchanged lineup polls do not rebuild; changed reports do',async()=>{
 const r=poller();await r.poll();assert.equal(r.counts().refreshes,0);
 r.next({updated_at:'new metadata only',records:[]});await r.poll();assert.equal(r.counts().refreshes,0);
 r.next({records:[{sport:'nba',role:'availability',status:'out'}]});await r.poll();assert.equal(r.counts().refreshes,1);
});
test('polls deduplicate requests and ignore completion after switching sports',async()=>{
 const r=poller();r.hold();r.next({records:[{sport:'nba',status:'out'}]});const pending=r.poll();await r.poll();assert.equal(r.counts().loads,1);
 r.window.__ACTIVE_SPORT='nhl';r.window.__SPORT_TOKEN++;r.release();await pending;assert.equal(r.counts().refreshes,0);
});
test('unchanged reports still refresh when a game starts or quote expires',async()=>{
 for(const markets of [[{game_time:'2026-10-22T01:00:30Z'}],[{game_time:'2026-10-22T02:00:00Z',quotedAt:'2026-10-22T00:30:30Z'}]]){
  const r=poller();r.S.contexts.set('nba',{markets});r.advance(60000);await r.poll();assert.equal(r.counts().refreshes,1);
 }
});
test('fresh report timestamps alone do not regenerate unchanged picks',async()=>{
 const r=poller(),row={sport:'nba',role:'availability',status:'confirmed',checked_at:'2026-10-22T00:59:00Z'};
 r.next({records:[row]});await r.poll();assert.equal(r.counts().refreshes,1);
 r.next({records:[{...row,checked_at:'2026-10-22T01:00:00Z'}]});await r.poll();assert.equal(r.counts().refreshes,1);
});
test('expired evidence is refreshed after a long background pause',async()=>{
 const r=poller();r.S.contexts.set('nba',{markets:[{game_time:'2026-10-22T02:00:00Z',quotedAt:'2026-10-22T00:55:00Z'}]});
 r.advance(3600000);await r.poll();assert.equal(r.counts().refreshes,1);
});
test('NFL preparation assigns parent event identity before reconciliation',()=>{
 const window={},env=vm.createContext({window,Date});
 for(const file of ['market-guards.js','pick-quality.js'])vm.runInContext(fs.readFileSync(file,'utf8'),env);
 const markets=Array.from({length:200},(_,i)=>({ticker:'contract-'+i})),start='2026-10-23T00:00:00Z';
 const games=[{id:'one',commence_time:start,markets:markets.slice(0,100)},{id:'two',commence_time:start,markets:markets.slice(100)}];
 window.PICK_QUALITY.prepare('nfl',markets,{},games,start);
 assert.equal(new Set(markets.map(window.MARKET_GUARDS.gameKey)).size,2);
 assert.equal(markets[0].gameId,'one');assert.equal(markets[100].gameId,'two');
 assert.equal(window.MARKET_GUARDS.independent([markets[0],markets[100]]),true);
 assert.equal(window.MARKET_GUARDS.independent([markets[0],markets[1]]),false);
});
