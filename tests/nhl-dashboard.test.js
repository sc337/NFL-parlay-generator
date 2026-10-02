const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(patch={},dataPatch={},storage){
 const ready=[],nodes=new Map(),document={readyState:'loading',addEventListener:(_event,fn)=>ready.push(fn),querySelector:s=>{if(!nodes.has(s))nodes.set(s,{textContent:'',innerHTML:''});return nodes.get(s)}};
 let daily,refreshes=0,tick,now=Date.now();
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const window={setInterval:fn=>{tick=fn},__ACTIVE_SPORT:'nhl',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{nhl:()=>''},PICK_OF_DAY:{today:()=>true,show:(_s,p)=>daily=p},COMPACT_UI:{refresh:()=>refreshes++}};
 const make=(id)=>({kind:'moneyline',label:'Bruins ML',selection_id:id+'|yes',event_ticker:'KXNHLGAME-'+id,game_id:id,game_time:new Date(Date.now()+3600000).toISOString(),game_label:'Bruins vs Rangers',game_status:'pre',yes_bid:.58,yes_ask:.60,probability:.59,volume:1000,spread:.02});
 const a={...make('10'),...patch},b=make('20');
 const data={updated_at:new Date().toISOString(),markets:[a,{...a,kind:'total',label:'Over 5.5 goals',selection_id:'total|yes'},b],...dataPatch};
 const context=vm.createContext({window,document,Date:Clock,console,localStorage:storage,fetch:async()=>({ok:true,json:async()=>data})});
 for(const file of ['market-guards.js','nhl-alt-lines.js','nhl-dashboard.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return {window,nodes,a,b,context,data,start:()=>ready.forEach(fn=>fn()),advance:ms=>{now+=ms},tick:()=>tick(),daily:()=>daily,refreshes:()=>refreshes};
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
  app.context.fetch=url=>String(url).includes('nhl-context')?Promise.resolve({ok:true,json:async()=>null}):new Promise((resolve,reject)=>pending.push({resolve,reject}));
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

test('verified player props display independently of the parlay game count',async()=>{
 const prop={kind:'points',player:'Test Player',player_id:'100',player_verified:true,label:'Test Player Over 0.5 Points',volume:50};
 const app=runtime(prop);await app.window.NHL_DASHBOARD.load();
 assert.match(app.nodes.get('#results').innerHTML,/NHL Props/);
 assert.match(app.nodes.get('#results').innerHTML,/Test Player Over 0.5 Points/);
 assert.equal(app.window.NHL_DASHBOARD.eligible({...app.a,player_verified:false}),false);
});

test('scheduled NHL history can record a featured forecast without browser widgets',async()=>{
 const app=runtime();delete app.window.PICK_OF_DAY;await app.window.NHL_DASHBOARD.load();
 // Recorder has no browser Pick of the Day widget.
 app.data.markets.forEach(m=>m.game_time=new Date(Date.now()+1000).toISOString());
 const picks=app.window.NHL_DASHBOARD.historyPicks();assert.equal(picks.length,1);assert.ok(picks[0].market.game_id);
});

test('NHL Generate keeps the highest-ranked distinct games for the selected leg count',async()=>{
 const app=runtime();
 const more={...app.b,game_id:'30',event_ticker:'KXNHLGAME-30',selection_id:'30|yes',label:'Third ML',spread:.05,yes_bid:.55};
 app.data.markets.push(more);await app.window.NHL_DASHBOARD.load();
 const first=app.nodes.get('#results').innerHTML;
 for(let i=0;i<4;i++){app.window.NHL_DASHBOARD.setLegs(2);assert.equal(app.nodes.get('#results').innerHTML,first)}
 assert.doesNotMatch(first,/Third ML/);
 app.window.NHL_DASHBOARD.setLegs(3);assert.match(app.nodes.get('#results').innerHTML,/Third ML/);
 app.window.NHL_DASHBOARD.setLegs(2);assert.equal(app.nodes.get('#results').innerHTML,first);
});

test('NHL selected markets filter the parlay, featured pick and prop list',async()=>{
 const app=runtime();await app.window.NHL_DASHBOARD.load();
 app.window.NHL_DASHBOARD.setMarkets(['moneyline']);
 assert.doesNotMatch(app.nodes.get('#results').innerHTML,/Over 5.5|NHL Props/);
 assert.equal(app.daily().market.kind,'moneyline');
 app.window.NHL_DASHBOARD.setMarkets(['total']);
 assert.match(app.nodes.get('#results').innerHTML,/1 of 2 games qualify/);
 assert.equal(app.daily().market.kind,'total');
 assert.equal(app.window.NHL_DASHBOARD.availableCount(),1);
 app.window.NHL_DASHBOARD.setMarkets([]);
 assert.match(app.nodes.get('#results').innerHTML,/Select at least one NHL market/);
 assert.equal(app.daily(),undefined);assert.equal(app.window.NHL_DASHBOARD.availableCount(),0);
});
test('NHL market preferences survive reload independently of NFL settings',async()=>{
 const saved=new Map([['nflSelectedMarkets','unchanged']]),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
 const app=runtime({}, {},storage);app.window.NHL_DASHBOARD.setMarkets(['points','bogus']);
 const restored=runtime({}, {},storage);assert.deepEqual([...restored.window.NHL_DASHBOARD.selectedMarkets()],['points']);
 restored.window.NHL_DASHBOARD.setMarkets([]);assert.deepEqual([...runtime({}, {},storage).window.NHL_DASHBOARD.selectedMarkets()],[]);
 assert.equal(saved.get('nflSelectedMarkets'),'unchanged');
});
test('NHL market buttons handle clicks, disabled feeds and sport switching',async()=>{
 const app=runtime();let click;const note={textContent:''};
 const buttons=['moneyline','total','shots','saves'].map(kind=>({dataset:{nhlMarket:kind},classList:{toggle(){}},setAttribute(k,v){this[k]=v}}));
 const host={style:{},querySelectorAll:()=>buttons,querySelector:()=>note,addEventListener:(type,fn)=>{if(type==='click')click=fn}};app.nodes.set('#nhlMarketFilters',host);app.start();await app.window.NHL_DASHBOARD.load();
 assert.equal(host.hidden,false);assert.equal(buttons[2].disabled,true);assert.match(buttons[2].title,/No current quotes/);
 click({target:{closest:()=>buttons[0]}});assert.equal(buttons[0]['aria-pressed'],'false');assert.equal(app.daily().market.kind,'total');
 const before=[...app.window.NHL_DASHBOARD.selectedMarkets()];click({target:{closest:()=>buttons[2]}});assert.deepEqual([...app.window.NHL_DASHBOARD.selectedMarkets()],before);
 app.window.__ACTIVE_SPORT='nfl';app.window.NHL_DASHBOARD.controls();assert.equal(host.hidden,true);assert.equal(host.style.display,'none');
});
test('NHL filter markup uses dedicated kinds and accessible pressed states',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const kind of ['moneyline','spread','total','goals','assists','points','shots','saves'])assert.match(html,new RegExp('data-nhl-market="'+kind+'" aria-pressed="true"'));
 assert.match(html,/id="nhlMarketFilters"[^>]+hidden/);assert.match(fs.readFileSync('app.js','utf8'),/#marketChips \.chip/);
});

test('NHL controls live outside the collapsed parlay panel',()=>{
 const app=runtime(),main={insertBefore(host,pick){this.moved=host;this.before=pick}},pick={parentElement:null};pick.parentElement=main;
 const host={style:{},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
 app.nodes.set('main',main);app.nodes.set('#pickOfDay',pick);app.nodes.set('#nhlMarketFilters',host);app.start();
 assert.equal(main.moved,host);assert.equal(main.before,pick);assert.equal(host.hidden,false);
 assert.match(fs.readFileSync('ufc-dashboard.js','utf8'),/show\('\.market-filter-details:not\(#nhlMarketFilters\)',nfl\)/);
 app.window.__ACTIVE_SPORT='mlb';app.window.NHL_DASHBOARD.controls();assert.equal(host.hidden,true);
});

test('NHL props rank price-adjusted value rather than raw chance and exclude overpriced estimates',async()=>{
 const app=runtime(),make=(id,kind,label,ask,p,coverage=.5)=>({...app.a,game_id:id,selection_id:id+'|yes',player_id:id,player:'Player '+id,player_verified:true,kind,label,yes_ask:ask,yes_bid:ask-.02,probability:ask-.01,forecast:{modelP:p,coverage}});
 app.data.markets=[make('1','goals','Expensive goal under',.85,.88),make('2','points','Better value points over',.6,.76),make('3','assists','Overpriced assist under',.8,.7),make('4','goals','Equal price goals',.7,.7)];
 app.window.NHL_MODEL={estimate:m=>m.forecast};await app.window.NHL_DASHBOARD.load();
 const html=app.nodes.get('#results').innerHTML,props=html.slice(html.indexOf('NHL Props'));
 assert.ok(props.indexOf('Better value points over')<props.indexOf('Expensive goal under'));
 assert.doesNotMatch(html,/Overpriced assist under|Equal price goals/);
 assert.match(html,/Experimental, unvalidated/);assert.match(html,/not a forced over\/under mix/);
 const first=html;app.window.NHL_DASHBOARD.setLegs(2);assert.equal(app.nodes.get('#results').innerHTML,first);
 app.window.NHL_DASHBOARD.setMarkets(['goals']);assert.doesNotMatch(app.nodes.get('#results').innerHTML,/Better value points over/);
});

test('NHL prop ranking discounts weak coverage and keeps market-only props labeled',async()=>{
 const app=runtime(),make=(id,p,coverage)=>({...app.a,kind:'points',label:'Prop '+id,selection_id:id+'|yes',player_id:id,player:'Player '+id,player_verified:true,forecast:p==null?null:{modelP:p,coverage}});
 app.data.markets=[make('weak',.8,.2),make('covered',.8,.7),make('unmodeled',null,null)];
 app.window.NHL_MODEL={estimate:m=>m.forecast};await app.window.NHL_DASHBOARD.load();
 const props=app.nodes.get('#results').innerHTML.split('NHL Props')[1];
 assert.ok(props.indexOf('Prop covered')<props.indexOf('Prop weak'));
 assert.ok(props.indexOf('Prop weak')<props.indexOf('Prop unmodeled'));
 assert.match(props,/Market only · No independent estimate/);
});

test('NHL Standard / ALT / Both filter all recommendations and preserve stable generation',async()=>{
 const app=runtime(),spread=(id,line,label)=>({...app.a,game_id:id,event_ticker:'KXNHLGAME-'+id,selection_id:id+'-'+line,kind:'spread',line,label});
 app.data.markets=[spread('1',1.5,'Standard 1'),spread('1',2.5,'ALT 1'),spread('2',1.5,'Standard 2'),spread('2',2.5,'ALT 2')];
 app.window.NHL_MODEL={estimate:()=>({modelP:.75,coverage:.5})};
 await app.window.NHL_DASHBOARD.load();app.window.NHL_DASHBOARD.setLineMode('alt');
 const html=app.nodes.get('#results').innerHTML;assert.match(html,/ALT 1|ALT 2/);assert.doesNotMatch(html,/Standard 1|Standard 2/);assert.equal((html.match(/data-alt-line="true"/g)||[]).length,2);assert.equal(app.daily().market.isAltLine,true);
 app.window.NHL_DASHBOARD.setLegs(2);assert.equal(app.nodes.get('#results').innerHTML,html);
 app.window.NHL_DASHBOARD.setLineMode('standard');assert.doesNotMatch(app.nodes.get('#results').innerHTML,/ALT 1|ALT 2/);assert.equal(app.daily().market.isAltLine,false);
 app.window.NHL_DASHBOARD.setLineMode('both');assert.equal(app.window.NHL_DASHBOARD.availableCount(),2);
});
test('NHL date selection filters parlay, props, featured pick and available game count',async()=>{
 const app=runtime(),now=new Date(Date.now()+3600000),later=new Date(Date.now()+2*86400000),api=app.window.NHL_DASHBOARD;
 const make=(id,time,prop=false)=>({...app.a,game_id:id,selection_id:id,game_time:time.toISOString(),kind:prop?'points':'moneyline',player_verified:prop,player_id:prop?id:undefined,label:'Pick '+id});
 app.data.markets=[make('today',now),make('laterA',later),make('laterB',later),make('laterProp',later,true)];await api.load();api.setDate(api.dateKey(later));
 assert.equal(api.availableCount(),3);assert.doesNotMatch(app.nodes.get('#results').innerHTML,/Pick today/);assert.match(app.nodes.get('#results').innerHTML,/Pick laterProp/);assert.match(app.daily().label,/later/);
 api.setDate(api.dateKey(now));assert.equal(api.availableCount(),1);assert.doesNotMatch(app.nodes.get('#results').innerHTML,/Pick later/);
 const state=api.filters().date;api.setDate('2026-02-31');assert.equal(api.filters().date,state);
 api.setDate('all');assert.equal(api.availableCount(),4);
});
test('NHL date keys use local calendar dates and line preferences persist independently',()=>{
 const storage=new Map(),saved={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},app=runtime({}, {},saved),api=app.window.NHL_DASHBOARD;
 const nearMidnight=new Date(2026,9,3,0,15);assert.equal(api.dateKey(nearMidnight),'2026-10-03');assert.equal(api.dateKey('invalid'),'');
 api.setLineMode('alt');api.setDate('2026-10-03');const restored=runtime({}, {},saved).window.NHL_DASHBOARD;
 assert.equal(restored.filters().lineMode,'alt');assert.equal(restored.filters().date,'all');assert.equal(storage.get('nflLineMode'),undefined);
});
test('NHL date and ALT controls populate available dates and handle change events',async()=>{
 const app=runtime(),listeners={},date={innerHTML:'',value:''},lines={value:''},host={style:{},querySelectorAll:()=>[],querySelector:s=>s==='#nhlDateSelect'?date:s==='#nhlLinesSelect'?lines:null,addEventListener:(type,fn)=>listeners[type]=fn};
 app.nodes.set('#nhlMarketFilters',host);app.start();await app.window.NHL_DASHBOARD.load();
 const key=app.window.NHL_DASHBOARD.dateKey(app.a.game_time);assert.match(date.innerHTML,new RegExp('value="'+key+'"'));assert.equal(lines.value,'both');
 listeners.change({target:{id:'nhlLinesSelect',value:'alt'}});assert.equal(app.window.NHL_DASHBOARD.filters().lineMode,'alt');assert.equal(app.window.NHL_DASHBOARD.availableCount(),0);
 listeners.change({target:{id:'nhlDateSelect',value:key}});assert.equal(app.window.NHL_DASHBOARD.filters().date,key);
 app.window.__ACTIVE_SPORT='nfl';listeners.change({target:{id:'nhlDateSelect',value:'all'}});assert.equal(app.window.NHL_DASHBOARD.filters().date,key);
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/id="nhlDateSelect"/);assert.match(html,/id="nhlLinesSelect"/);assert.match(html,/nhl-alt-lines\.js/);
});
test('NHL rejects the distant heavily priced ALT totals in the screenshots',async()=>{
 const app=runtime(),make=(id,line,ask,p)=>({...app.a,kind:'total',game_id:id,event_ticker:'Game-'+id,selection_id:id+'-'+line,line,label:'Total '+id+' '+line,yes_ask:ask,yes_bid:ask-.02,forecast:{modelP:p,coverage:.5}});
 app.data.markets=[make('NYR',5.5,.5,.5),make('NYR',8.5,.85,.852),make('VGK',6.5,.5,.5),make('VGK',4.5,.84,.84),make('NYR',6.5,.57,.606),make('VGK',5.5,.65,.667)];
 app.window.NHL_MODEL={estimate:m=>m.forecast};await app.window.NHL_DASHBOARD.load();app.window.NHL_DASHBOARD.setLineMode('alt');
 assert.equal(app.window.NHL_DASHBOARD.availableCount(),1);assert.equal(app.daily().market.line,6.5);
 assert.doesNotMatch(app.nodes.get('#results').innerHTML,/Total NYR 8.5|Total VGK 4.5/);
 app.window.NHL_DASHBOARD.setLineMode('standard');assert.equal(app.window.NHL_DASHBOARD.availableCount(),2);
});
test('NHL ALT forecasts are withheld after 30 minutes, while standard quotes retain existing freshness gate',async()=>{
 const app=runtime(),base={...app.a,kind:'spread',game_id:'1',event_ticker:'Game-1',forecast:{modelP:.75,coverage:.5}};
 app.data.markets=[{...base,line:1.5,selection_id:'std'},{...base,line:2.5,selection_id:'alt'}];app.window.NHL_MODEL={estimate:m=>m.forecast};await app.window.NHL_DASHBOARD.load();
 app.window.NHL_DASHBOARD.setLineMode('alt');assert.equal(app.window.NHL_DASHBOARD.availableCount(),1);app.advance(31*60000);assert.equal(app.window.NHL_DASHBOARD.availableCount(),0);
 app.window.NHL_DASHBOARD.setLineMode('standard');assert.equal(app.window.NHL_DASHBOARD.availableCount(),1);
});
test('NHL team-line ranking balances price advantage against raw win chance',async()=>{
 const app=runtime(),make=(id,p,ask)=>({...app.a,kind:'total',line:5.5,game_id:id,event_ticker:'Game-'+id,selection_id:id,label:'Pick '+id,yes_ask:ask,yes_bid:ask-.02,forecast:{modelP:p,coverage:.5}});
 app.data.markets=[make('expensive',.85,.84),make('value',.76,.6)];app.window.NHL_MODEL={estimate:m=>m.forecast};await app.window.NHL_DASHBOARD.load();
 assert.equal(app.daily().market.game_id,'value');assert.ok(app.nodes.get('#results').innerHTML.indexOf('Pick value')<app.nodes.get('#results').innerHTML.indexOf('Pick expensive'));
});
