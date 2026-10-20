const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function altApi(){const window={};vm.runInNewContext(fs.readFileSync('nba-alt-lines.js','utf8'),{window});return window.NBA_ALT_LINES}
test('NBA ALT limits cover team and player markets and keep exact quoted thresholds',()=>{
 const A=altApi();for(const [kind,limit] of Object.entries(A.limits)){
  const player=!['spread','total'].includes(kind),base={game_id:'g',kind,side:'yes',...(player?{player_id:'p',player:'Player'}:{team_code:'A'})};
  const rows=A.classify([{...base,line:20.5,probability:.5},{...base,line:20.5+limit,probability:.7},{...base,line:21.5+limit,probability:.8}]);
  assert.equal(A.allowed(rows[1],'alt'),true,kind);assert.equal(A.allowed(rows[2],'both'),false,kind);assert.equal(rows[1].line,20.5+limit);
  if(player)assert.equal(A.allowed({...rows[1],side:'no'},'alt'),false,kind);
 }
 const reference={game_id:'g',kind:'total',side:'yes',line:220.5,probability:.5};A.classify([reference]);assert.equal(A.allowed(reference,'alt'),false);
 const publicQuote={...reference,referenceOnly:true,line:210.5};A.classify([reference,publicQuote]);assert.equal(publicQuote.isAltLine,false);assert.equal(A.allowed(publicQuote,'alt'),false);
});
function dashboard(saved){
 const nodes=new Map(),writes=[],select={addEventListener(type,fn){this.change=fn}},modeSelect={addEventListener(type,fn){this.change=fn}},gameSelect={addEventListener(type,fn){this.change=fn}},gameField={},captures=[],risks=[],host={querySelector(){return null},before(field){nodes.set('#nbaLineFilters',field)}};
 nodes.set('#nbaMarketFilters',host);for(const key of ['#results','#resultsTitle','#dataStatus','#modeTitle'])nodes.set(key,{innerHTML:'',textContent:'',querySelector(){return null}});
 const document={querySelector:s=>nodes.get(s),createElement:()=>({hidden:false,querySelector:s=>s==='#nbaModeSelect'?modeSelect:s==='#nbaGameSelect'?gameSelect:s==='#nbaGameField'?gameField:select})};
 const now=Date.now(),rows=['a','b'].flatMap(game_id=>[{game_id,kind:'total',side:'yes',line:220.5,probability:.5},{game_id,kind:'total',side:'yes',line:210.5,probability:.7}]).map((m,i)=>({...m,label:'Over '+m.line,selection_id:String(i),game_time:new Date(now+86400000).toISOString(),game_status:'pre',volume:100,spread:.02}));
 const w={__ACTIVE_SPORT:'nba',__SPORT_TOKEN:1,DASHBOARD_UI:{begin(){},end(){},get:(sport,key,fallback)=>typeof saved==='object'?saved[key]??fallback:key==='lines'?saved??fallback:fallback,put:(...args)=>writes.push(args)},
  MARKET_GUARDS:{esc:String,pregame:()=>true,fresh:()=>true,unique:rows=>rows,bestBuild:rows=>rows.slice(0,2),independent:()=>true},
  PICK_QUALITY:{prepare(){},forecast:(s,m,f)=>f,assess:(s,m)=>({pass:!m.blocked,rank:1}),quoteLabel:()=>'-110',note:()=>'',estimateOdds:()=>200},
  NBA_MODEL:{estimate:()=>({modelP:.7,method:'fixture'})},SPORT_MARKETS:{allowed:m=>true,sync(){}},SLATE_UI:{matches:()=>true},RECOMMENDATION_CAPTURE:(s,x)=>captures.push(x),PARLAY_RISK:{attach:(host,s,entries,options)=>risks.push(options)}};
 const ctx={window:w,document,Date,console,fetch:async url=>({ok:true,json:async()=>url.includes('kalshi')?{markets:rows,updated_at:new Date(now).toISOString()}:{}})};
 for(const file of ['market-guards.js','nba-alt-lines.js','nba-dashboard.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx);
 return {w,nodes,select,modeSelect,gameSelect,gameField,captures,risks,writes,rows};
}
test('NBA line filter is visible outside the collapsed markets and controls picks, cards and saved preference',async()=>{
 const r=dashboard();await r.w.NBA_DASHBOARD.load();assert.equal(r.select.value,'both');assert.equal(r.nodes.get('#nbaLineFilters').hidden,false);
 assert.deepEqual([...new Set(r.captures.map(x=>x.profile))],['safe','balanced','long']);for(const profile of ['safe','balanced','long'])assert.match(r.nodes.get('#results').innerHTML,new RegExp('data-profile="'+profile+'"'));
 const alt=r.rows[1],standard=r.rows[0];assert.equal(r.w.NBA_DASHBOARD.eligible(alt),true);assert.equal(r.w.NBA_DASHBOARD.eligible(standard),true);
 r.select.change({target:{value:'alt'}});assert.equal(r.w.NBA_DASHBOARD.eligible(alt),true);assert.equal(r.w.NBA_DASHBOARD.eligible(standard),false);
 assert.match(r.nodes.get('#results').innerHTML,/data-alt-line="true"/);assert.match(r.nodes.get('#results').innerHTML,/class="alt-tag">ALT/);assert.deepEqual(r.writes.at(-1),['nba','lines','alt']);
 alt.blocked=true;assert.equal(r.w.NBA_DASHBOARD.eligible(alt),false);alt.blocked=false;
 r.select.change({target:{value:'standard'}});assert.equal(r.w.NBA_DASHBOARD.eligible(alt),false);assert.equal(r.w.NBA_DASHBOARD.eligible(standard),true);
 assert.doesNotMatch(r.nodes.get('#results').innerHTML,/data-alt-line="true"/);
 const restored=dashboard('alt');await restored.w.NBA_DASHBOARD.load();assert.equal(restored.select.value,'alt');assert.equal(restored.w.NBA_DASHBOARD.eligible(restored.rows[0]),false);
 const invalid=dashboard('invalid');await invalid.w.NBA_DASHBOARD.load();assert.equal(invalid.select.value,'both');
});
test('NBA reference lines use actual quoted ladders without inventing a sportsbook main',()=>{const window={};vm.runInNewContext(fs.readFileSync('nba-alt-lines.js','utf8'),{window});const A=window.NBA_ALT_LINES,base={game_id:'g',kind:'points',player_id:'p',player:'P',side:'yes'},rows=A.classify([{...base,line:19.5,probability:.5},{...base,line:14.5,probability:.8},{...base,line:9.5,probability:.9}]);assert.equal(rows[0].isAltLine,false);assert.equal(rows[1].isAltLine,true);assert.equal(A.allowed(rows[1],'both'),true);assert.equal(A.allowed(rows[2],'both'),false);assert.equal(A.allowed(rows[1],'standard'),false);assert.equal(A.allowed({...rows[1],side:'no'},'both'),false);assert.equal(A.allowed(rows[0],'alt'),false)});
test('NBA mode and game controls scope SGP legs, preserve multi-game uniqueness, and never synthesize SGP odds',async()=>{
 const r=dashboard();
 r.rows.push(...['a','b'].map((game_id,i)=>({...r.rows[0],game_id,kind:'points',line:20.5,player:'Player '+i,player_id:'p'+i,selection_id:'p'+i})));
 await r.w.NBA_DASHBOARD.load();assert.equal(r.modeSelect.value,'multi');assert.equal(r.gameField.hidden,true);
 assert.equal(new Set(r.captures.at(-1).legs.map(x=>x.market.game_id)).size,2);
 r.modeSelect.change({target:{value:'sgp'}});assert.equal(r.gameField.hidden,false);assert.equal(r.captures.at(-1).mode,'sgp');
 assert.equal(r.captures.at(-1).legs.length,2);assert.equal(new Set(r.captures.at(-1).legs.map(x=>x.market.game_id)).size,1);
 assert.match(r.nodes.get('#results').innerHTML,/Check book/);assert.equal(r.risks.at(-1).sgp,true);
 r.gameSelect.change({target:{value:'b'}});assert.ok(r.captures.at(-1).legs.every(x=>x.market.game_id==='b'));assert.deepEqual(r.writes.at(-1),['nba','game','b']);
 r.select.change({target:{value:'alt'}});assert.equal(r.captures.at(-1).legs.length,0,'never fill ALT SGP with standard player line');
 r.select.change({target:{value:'both'}});r.modeSelect.change({target:{value:'multi'}});assert.equal(r.risks.at(-1).sgp,false);assert.equal(new Set(r.captures.at(-1).legs.map(x=>x.market.game_id)).size,2);
 r.w.SLATE_UI.matches=()=>false;r.w.NBA_DASHBOARD.refresh();r.modeSelect.change({target:{value:'sgp'}});
 assert.equal(r.gameSelect.disabled,true);assert.equal(r.captures.at(-1).legs.length,0);assert.match(r.nodes.get('#results').innerHTML,/No upcoming NBA games for the selected date/);
 const restored=dashboard({mode:'sgp',game:'b'});await restored.w.NBA_DASHBOARD.load();assert.equal(restored.modeSelect.value,'sgp');assert.equal(restored.gameSelect.value,'b');
});
test('NBA same-game optimizer rejects conflicting, redundant and impossible combinations and returns complete deterministic builds',()=>{
 const A=dashboard().w.NBA_DASHBOARD,base={game_id:'g',side:'yes',line:20.5},m=(id,kind,patch={})=>({...base,selection_id:id,ticker:id,kind,...patch}),assess=x=>({pass:!x.blocked,rank:x.rank??10,coverage:.8});
 const money=m('ml','moneyline'),spread=m('spread','spread'),total=m('total','total',{line:220.5}),p=m('p','points',{player:'One',player_id:'1'}),q=m('q','rebounds',{player:'Two',player_id:'2'});
 for(const other of [money,spread,{...money,selection_id:'other',side:'no'},{...p,game_id:'other'}])assert.equal(A.compatibleSet([money,other]),false);
 assert.equal(A.compatibleSet([p,{...p,selection_id:'pa',ticker:'pa',kind:'assists'}]),false);
 assert.equal(A.compatibleSet([total,{...total,selection_id:'under',ticker:'under',side:'no'}]),false);
 const under=m('under','total',{side:'no',line:40.5}),second=m('p2','points',{player:'Two',player_id:'2'});
 assert.equal(A.compatibleSet([under,p,second]),false);assert.equal(A.compatibleSet([{...under,line:42.5},p,second]),true);
 const rows=[money,spread,total,p,q,{...q,selection_id:'blocked',ticker:'blocked',blocked:true,rank:100}];
 const build=A.buildSameGame(rows,4,assess);assert.equal(build.length,4);assert.equal(A.compatibleSet(build),true);assert.ok(build.every(x=>!x.blocked));
 assert.deepEqual([...build.map(x=>x.selection_id)],[...A.buildSameGame([...rows].reverse(),4,assess).map(x=>x.selection_id)]);
 assert.equal(A.buildSameGame([money,spread],2,assess).length,0);assert.equal(A.buildSameGame(rows,5,assess).length,0);
});
