const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(patch={},dataPatch={}){
 const nodes=new Map(),document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,{textContent:'',innerHTML:''});return nodes.get(s)}};
 let daily,refreshes=0;
 const window={__ACTIVE_SPORT:'nhl',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{nhl:()=>''},PICK_OF_DAY:{today:()=>true,show:(_s,p)=>daily=p},COMPACT_UI:{refresh:()=>refreshes++}};
 const make=(id)=>({kind:'moneyline',label:'Bruins ML',selection_id:id+'|yes',event_ticker:'KXNHLGAME-'+id,game_id:id,game_time:new Date(Date.now()+3600000).toISOString(),game_label:'Bruins vs Rangers',game_status:'pre',yes_bid:.58,yes_ask:.60,probability:.59,volume:1000,spread:.02});
 const a={...make('10'),...patch},b=make('20');
 const data={updated_at:new Date().toISOString(),markets:[a,{...a,kind:'total',label:'Over 5.5 goals',selection_id:'total|yes'},b],...dataPatch};
 const context=vm.createContext({window,document,Date,console,fetch:async()=>({ok:true,json:async()=>data})});
 for(const file of ['market-guards.js','nhl-dashboard.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return {window,nodes,a,b,daily:()=>daily,refreshes:()=>refreshes};
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
 const app=runtime();for(const patch of [{yes_ask:null},{yes_bid:null},{game_status:'in'},{game_time:null},{game_id:null},{spread:.2},{spread:-.02},{volume:0},{game_time:new Date(Date.now()-1000).toISOString()}])assert.equal(app.window.NHL_DASHBOARD.eligible({...app.a,...patch}),false);
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
