const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(patch={},dataPatch={}){
 const nodes=new Map(),document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,{textContent:'',innerHTML:''});return nodes.get(s)}};
 let daily,refreshes=0,tick,now=Date.now();
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const window={setInterval:fn=>{tick=fn},__ACTIVE_SPORT:'nhl',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{nhl:()=>''},PICK_OF_DAY:{today:()=>true,show:(_s,p)=>daily=p},COMPACT_UI:{refresh:()=>refreshes++}};
 const make=(id)=>({kind:'moneyline',label:'Bruins ML',selection_id:id+'|yes',event_ticker:'KXNHLGAME-'+id,game_id:id,game_time:new Date(Date.now()+3600000).toISOString(),game_label:'Bruins vs Rangers',game_status:'pre',yes_bid:.58,yes_ask:.60,probability:.59,volume:1000,spread:.02});
 const a={...make('10'),...patch},b=make('20');
 const data={updated_at:new Date().toISOString(),markets:[a,{...a,kind:'total',label:'Over 5.5 goals',selection_id:'total|yes'},b],...dataPatch};
 const context=vm.createContext({window,document,Date:Clock,console,fetch:async()=>({ok:true,json:async()=>data})});
 for(const file of ['market-guards.js','nhl-dashboard.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return {window,nodes,a,b,context,data,advance:ms=>{now+=ms},tick:()=>tick(),daily:()=>daily,refreshes:()=>refreshes};
}
test('NHL shows compact market-only picks and one leg per distinct game',async()=>{
 const app=runtime();await app.window.NHL_DASHBOARD.load();
 const html=app.nodes.get('#results').innerHTML;
 assert.match(html,/MARKET ONLY/);assert.match(html,/Quote quality/);assert.match(html,/Kalshi 60¢/);
 assert.equal((html.match(/data-event-time=/g)||[]).length,2);
 assert.equal((html.match(/data-matchup="Bruins vs Rangers"/g)||[]).length,2);
 assert.equal(app.daily().market.game_id,'10');
 assert.match(app.daily().note,/Market only/);
 app.window.NHL_DASHBOARD.setLegs(6);assert.match(app.nodes.get('#results').innerHTML,/2 of 6/);
 assert.doesNotMatch(app.nodes.get('#results').innerHTML,/parlay-card/);
});
test('missing, stale, live and wide quotes cannot qualify',async()=>{
 const app=runtime();for(const patch of [{yes_ask:null},{yes_bid:null},{yes_bid:.8},{game_status:'in'},{game_time:null},{game_id:null},{spread:.2},{spread:-.02},{volume:0},{game_time:new Date(Date.now()-1000).toISOString()}])assert.equal(app.window.NHL_DASHBOARD.eligible({...app.a,...patch}),false);
 const stale=runtime({},{updated_at:new Date(Date.now()-3*3600000).toISOString()});await stale.window.NHL_DASHBOARD.load();assert.equal(stale.daily(),undefined);assert.match(stale.nodes.get('#results').innerHTML,/stale/);
});
test('sport-switch races cannot overwrite a different sport',async()=>{
 const app=runtime();app.window.__ACTIVE_SPORT='nfl';await app.window.NHL_DASHBOARD.load();assert.equal(app.daily(),undefined);assert.equal(app.nodes.get('#results'),undefined);
});
test('NHL puck lines and goals create correctly labeled square tiles',()=>{
 const source=fs.readFileSync('visual-refresh.js','utf8'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function compactTitle'),source.indexOf('function compactSummaries')),context);
 for(const [label,market,line] of [['Bruins -1.5 Puck line','Puck line','-1.5'],['Rangers +1.5 Puck line','Puck line','+1.5'],['Over 5.5 goals','Total','O 5.5'],['Under 5.5 goals','Total','U 5.5'],['Bruins ML','Winner','ML']]){
  const result=context.selectionParts(context.compactTitle(label,'nhl',''),'Bruins vs Rangers');assert.equal(result.market,market);assert.equal(result.line,line);
 }
});

test('expired loaded feed clears picks on generation and periodic refresh',async()=>{
 for(const action of [app=>app.window.NHL_DASHBOARD.setLegs(2),app=>app.tick()]){
  const app=runtime();await app.window.NHL_DASHBOARD.load();
  // Keep games in the future so this specifically checks quote age.
  app.data.markets.forEach(m=>m.game_time=new Date(Date.now()+4*3600000).toISOString());
  app.advance(3*3600000);action(app);
  assert.equal(app.daily(),undefined);
  assert.match(app.nodes.get('#results').innerHTML,/NHL feed stale/);
  assert.doesNotMatch(app.nodes.get('#results').innerHTML,/parlay-card/);
  assert.equal(app.window.NHL_DASHBOARD.availableCount(),0);
  assert.equal(app.window.NHL_DASHBOARD.showCached(),false);
 }
});
test('overlapping NHL refreshes retain the newest response even if the older request fails',async()=>{
 for(const fail of [false,true]){
  const app=runtime(),pending=[];
  app.context.fetch=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));
  const first=app.window.NHL_DASHBOARD.load(),second=app.window.NHL_DASHBOARD.load();
  const latest={...app.data,markets:app.data.markets.map(m=>({...m,label:'Latest ML'}))};
  pending[1].resolve({ok:true,json:async()=>latest});await second;
  if(fail)pending[0].reject(Error('Old request failed'));
  else pending[0].resolve({ok:true,json:async()=>app.data});
  await first;
  assert.match(app.nodes.get('#results').innerHTML,/Latest ML/);
  assert.equal(app.daily().label,'Latest ML');
 }
});
test('cached NHL count drops when games start',async()=>{
 const app=runtime();app.data.markets.forEach(m=>m.game_time=new Date(Date.now()+10000).toISOString());
 await app.window.NHL_DASHBOARD.load();app.advance(20000);
 assert.equal(app.window.NHL_DASHBOARD.showCached(),true);
 assert.match(app.nodes.get('#dataStatus').textContent,/0 qualified games/);
 assert.equal(app.daily(),undefined);
 assert.doesNotMatch(app.nodes.get('#results').innerHTML,/parlay-card/);
});
