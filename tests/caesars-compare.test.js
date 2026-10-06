const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const time=new Date(Date.now()+86400000).toISOString(),teams=['Toronto Maple Leafs','Vegas Golden Knights'];
const event=()=>({id:'game',away_team:teams[0],home_team:teams[1],commence_time:time,bookmakers:[{key:'williamhill_us',markets:[{key:'alternate_spreads',last_update:new Date().toISOString(),outcomes:[{name:teams[1],point:2.5,price:-125},{name:teams[0],point:-2.5,price:105}]}]}]});
const pick={kind:'spread',label:'Vegas +2.5 Puck line',side:'no',line:2.5,game_time:time,team_code:'VGK',teams:[{name:teams[0],code:'TOR'},{name:teams[1],code:'VGK'}]};
function runtime(credential='',failure=false){
 const calls=[],timers=new Map(),nodes=[];let serial=0,key=credential;
 const document={body:{dataset:{sport:'nhl'}},querySelectorAll:()=>nodes,addEventListener(){},createElement:()=>({textContent:'',title:'',remove(){}})};
 const window={fetch:async url=>{calls.push(new URL(url));return {ok:!failure,status:failure?429:200,json:async()=>url.includes('/odds?')?event():[event()]}},setInterval(){}};
 const context=vm.createContext({window,document,URL,Date,AbortController,localStorage:{getItem:()=>key},setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(fs.readFileSync('pick-quality.js','utf8'),context);vm.runInContext(fs.readFileSync('caesars-compare.js','utf8'),context);
 const api=window.CAESARS_COMPARE;
 function mount(token){let price;const tile={classList:{contains:()=>true,add(){},remove(){}},append(p){price=p}},node={dataset:{caesarsId:token},classList:{contains:()=>false},querySelector:s=>s==='.caesars-quote'?price:tile};nodes.push(node);return ()=>price?.textContent}
 async function flush(){const entry=[...timers.entries()][0];if(entry){timers.delete(entry[0]);entry[1]()}for(let i=0;i<20;i++)await Promise.resolve()}
 return {api,calls,mount,flush,setKey:x=>key=x};
}
test('exact NHL alternate selection uses the signed line and actual Caesars book',()=>{
 const {api}=runtime('fixture'),d=api.descriptor('nhl',pick);assert.equal(d.line,2.5);assert.equal(d.team,teams[1]);assert.equal(api.matchingQuote(d,event()).price,-125);
 for(const mutate of [e=>e.bookmakers[0].key='fanduel',e=>e.bookmakers[0].markets[0].outcomes[0].point=1.5,e=>e.bookmakers[0].markets[0].outcomes[0].name=teams[0],e=>e.commence_time=new Date(Date.parse(time)+3600000).toISOString(),e=>e.bookmakers[0].markets[0].last_update=new Date(Date.now()-16*60000).toISOString()]){const e=event();mutate(e);assert.equal(api.matchingQuote(d,e),null)}
 const fake=event();fake.bookmakers[0].key='fanduel';fake.bookmakers[0].dashboardBookSource='Caesars';assert.equal(api.matchingQuote(d,fake),null);
 assert.equal(api.eventMatch(d,[event(),event()]),null);
});
test('player props require the same player, side, game and numerical milestone',()=>{
 const {api}=runtime('fixture'),d=api.descriptor('nhl',{...pick,kind:'shots',player:'Test Player',side:'no',line:2.5});
 const e=event();e.bookmakers[0].markets[0]={key:'player_shots_on_goal_alternate',last_update:new Date().toISOString(),outcomes:[{name:'Under',description:'Test Player',point:2.5,price:110}]};
 assert.equal(api.matchingQuote(d,e).price,110);e.bookmakers[0].markets[0].outcomes[0].name='Over';assert.equal(api.matchingQuote(d,e),null);e.bookmakers[0].markets[0].outcomes[0].name='Under';e.bookmakers[0].markets[0].outcomes[0].description='Another Player';assert.equal(api.matchingQuote(d,e),null);
});
test('NFL descriptors retain Kalshi provenance and convert milestone to exact half line',()=>{
 const {api}=runtime('fixture'),g={away:teams[0],home:teams[1],commence_time:time},m={source:'Kalshi',marketKey:'player_rush_yds_alternate',player:'Runner',name:'Runner 50+ rushing yards',point:49.5,side:'over'};
 const d=api.descriptor('nfl',m,g);assert.equal(d.market,'player_rush_yds');assert.equal(d.line,49.5);assert.equal(api.descriptor('nfl',{...m,source:'Caesars'},g),null);
});
test('no key makes no paid API requests',async()=>{const app=runtime();assert.equal(app.api.register('nhl',pick),'');app.api.refresh();await app.flush();assert.equal(app.calls.length,0)});
test('unsupported selections show unavailable and make no API request',async()=>{const app=runtime('fixture'),read=app.mount(app.api.register('nhl',{...pick,kind:'unsupported'}));await app.flush();assert.equal(read(),'Caesars unavailable');assert.equal(app.calls.length,0)});
test('quotes populate the same tile, request only Caesars and reuse cached event prices',async()=>{
 const app=runtime('fixture'),read=app.mount(app.api.register('nhl',pick));await app.flush();assert.equal(read(),'Caesars -125');assert.equal(app.calls.length,2);
 assert.ok(app.calls.every(u=>u.searchParams.get('bookmakers')==='williamhill_us'));assert.match(app.calls[1].searchParams.get('markets'),/alternate_spreads/);
 app.api.refresh();await app.flush();assert.equal(app.calls.length,2);
});
test('quota failures show unavailable without mutating Kalshi picks or repeated immediate requests',async()=>{
 const app=runtime('fixture',true),before=JSON.stringify(pick),read=app.mount(app.api.register('nhl',pick));await app.flush();assert.equal(read(),'Caesars unavailable');assert.equal(JSON.stringify(pick),before);app.api.refresh();await app.flush();assert.equal(app.calls.length,1);
});
test('API-mode NFL loader retains Kalshi recommendations',async()=>{
 let calls=0,refresh=0;
 const context=vm.createContext({window:{__ACTIVE_SPORT:'nfl',NFL_KALSHI:{load:async()=>{calls++;return true}},CAESARS_COMPARE:{refresh:()=>refresh++}},state:{apiKey:'fixture',games:[],propsLoaded:new Set(),propsLoading:new Set()},document:{getElementById:()=>null},setStatus(){},generate:async()=>{},loadData:()=>{},setTimeout(){},console});
 vm.runInContext(fs.readFileSync('no-demo-mode.js','utf8'),context);assert.equal(await context.loadData(),true);assert.equal(calls,1);assert.equal(refresh,1);
});
