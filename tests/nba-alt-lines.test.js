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
test('NBA profile candidates survive a rejecting default pre-screen',async()=>{const r=dashboard();r.w.PICK_QUALITY.assess=(s,m,f,o={})=>({pass:!!o.nbaProfile,rank:1,conservativeP:.7,coverage:.7,quote:{p:.7}});await r.w.NBA_DASHBOARD.load();assert.ok(r.captures.some(c=>c.legs.length===2))});
test('NBA line filter is visible outside the collapsed markets and controls picks, cards and saved preference',async()=>{
 const r=dashboard();await r.w.NBA_DASHBOARD.load();assert.equal(r.select.value,'both');assert.equal(r.nodes.get('#nbaLineFilters').hidden,false);
 assert.deepEqual([...new Set(r.captures.map(x=>x.profile))],['safe','balanced','long']);assert.match(r.nodes.get('#results').innerHTML,/data-profile="safe"/);assert.doesNotMatch(r.nodes.get('#results').innerHTML,/profile-pass|data-profile="(?:balanced|long)"/);
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
 const latest=()=>r.captures.slice(-3).find(x=>x.legs.length)||r.captures.at(-1);
 r.rows.push(...['a','b'].map((game_id,i)=>({...r.rows[0],game_id,kind:'points',probability:.6,line:20.5,player:'Player '+i,player_id:'p'+i,selection_id:'p'+i})));
 await r.w.NBA_DASHBOARD.load();assert.equal(r.modeSelect.value,'multi');assert.equal(r.gameField.hidden,true);
 assert.equal(new Set(latest().legs.map(x=>x.market.game_id)).size,2);
 r.modeSelect.change({target:{value:'sgp'}});assert.equal(r.gameField.hidden,false);assert.equal(r.captures.at(-1).mode,'sgp');
 assert.equal(latest().legs.length,2);assert.equal(new Set(latest().legs.map(x=>x.market.game_id)).size,1);
 assert.match(r.nodes.get('#results').innerHTML,/Check book/);assert.equal(r.risks.at(-1).sgp,true);
 r.gameSelect.change({target:{value:'b'}});assert.ok(latest().legs.every(x=>x.market.game_id==='b'));assert.deepEqual(r.writes.at(-1),['nba','game','b']);
 r.select.change({target:{value:'alt'}});assert.equal(r.captures.at(-1).legs.length,0,'never fill ALT SGP with standard player line');
 r.select.change({target:{value:'both'}});r.modeSelect.change({target:{value:'multi'}});assert.equal(r.risks.at(-1).sgp,false);assert.equal(new Set(latest().legs.map(x=>x.market.game_id)).size,2);
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
test('NBA Balanced same-game builds account for shared scoring exposure',()=>{
 const A=dashboard().w.NBA_DASHBOARD,rows=[{selection_id:'a',ticker:'a',game_id:'g',kind:'points',player:'One',rank:120},{selection_id:'b',ticker:'b',game_id:'g',kind:'points',player:'Two',rank:110},{selection_id:'c',ticker:'c',game_id:'g',kind:'rebounds',player:'Three',rank:108}];
 const assess=m=>({pass:true,rank:m.rank,coverage:.8,conservativeP:.6});
 assert.deepEqual([...A.buildSameGame(rows,2,assess).map(m=>m.selection_id)].sort(),['a','b']);
 assert.deepEqual([...A.buildSameGame(rows,2,assess,{balanced:true}).map(m=>m.selection_id)].sort(),['a','c']);
});
test('NBA SGPs cap player props at two per team and search for qualified opponents',()=>{
 const A=dashboard().w.NBA_DASHBOARD,make=(id,team,rank)=>({game_id:'g',selection_id:id,ticker:id,player:id,team_code:team,kind:'points',side:'yes',line:15.5,rank});
 const home=[make('a','NYK',100),make('b','NYK',99),make('c','NYK',98),make('d','NYK',97)],away=[make('e','PHI',50),make('f','PHI',49)],assess=m=>({pass:true,rank:m.rank,coverage:.8});
 assert.equal(A.buildSameGame(home,4,assess).length,0);assert.equal(A.buildSameGame(home,3,assess).length,0);assert.equal(A.buildSameGame(home,2,assess).length,2);
 const build=A.buildSameGame([...home,...away],4,assess);assert.equal(build.length,4);assert.equal(build.filter(m=>m.team_code==='NYK').length,2);assert.equal(build.filter(m=>m.team_code==='PHI').length,2);
 assert.equal(A.buildSameGame([...home,...away],4,m=>({...assess(m),pass:m.team_code!=='PHI'})).length,0,'never fill with blocked opponents');
 const lines=[{game_id:'g',selection_id:'total',ticker:'total',kind:'total',side:'yes',line:220.5,rank:20},{game_id:'g',selection_id:'spread',ticker:'spread',kind:'spread',team_code:'NYK',side:'yes',line:2.5,rank:20}];
 assert.equal(A.buildSameGame([...home,...lines],4,assess).length,4,'team lines do not count as player props');
});
test('NBA empty states distinguish ALT shortage, team concentration and profile constraints',()=>{
 const A=dashboard().w.NBA_DASHBOARD,rows=['a','b','c','d'].map(player=>({game_id:'g',selection_id:player,ticker:player,player,team_code:'NYK',kind:'points',side:'yes',line:15.5}));
 assert.match(A.unavailableBuild(rows,4,true,'both'),/Only 2 compatible qualifying legs.*NYK only; maximum two per team/);
 assert.match(A.unavailableBuild(rows.slice(0,1),4,true,'alt'),/Only 1 compatible qualifying ALT leg.*Try Both lines or fewer legs/);
 assert.match(A.unavailableBuild(rows.slice(0,2),2,true,'both'),/No distinct profile meets the risk and combination checks/);
 assert.match(A.unavailableBuild([],3,true,'alt'),/Only 0 compatible qualifying ALT legs/);
});
test('NBA complete profile bands reject a lotto-like Balanced build and repeated exposures',()=>{
 const A=dashboard().w.NBA_DASHBOARD,legs=['a','b','c'].map((game_id,i)=>({game_id,kind:'points',player:'P'+i,side:'yes',line:20.5}));
 const checks=p=>legs.map(()=>({profileBufferedP:p}));
 assert.equal(A.profileFits(legs,checks(.70),{key:'safe'}),true);
 assert.equal(A.profileFits(legs,checks(.60),{key:'balanced'}),true);
 assert.equal(A.profileFits(legs,checks(.43),{key:'balanced'}),false);
 assert.equal(A.profileFits(legs,checks(.43),{key:'long'}),true);
 const previous=[{legs,risk:A.profileRisk(checks(.60))}];
 assert.equal(A.profileFits(legs.map(m=>({...m,line:22.5})),checks(.43),{key:'long'},previous),false,'changing only thresholds is not a distinct exposure');
 const changed=legs.map((m,i)=>i?{...m,player:'Other '+i,kind:'rebounds'}:m);
 assert.equal(A.profileFits(changed,checks(.43),{key:'long'},previous),true);
 assert.equal(A.profileFits(changed,checks(.52),{key:'long'},[{legs,risk:.16}]),false,'adjacent bands still need a three-point index gap');
});
test('NBA passes instead of filling every profile with the same risk',async()=>{
 const r=dashboard();await r.w.NBA_DASHBOARD.load();
 assert.ok(r.captures.find(x=>x.profile==='safe').legs.length);
 assert.equal(r.captures.find(x=>x.profile==='balanced').legs.length,0);
 assert.equal(r.captures.find(x=>x.profile==='long').legs.length,0);
 assert.doesNotMatch(r.nodes.get('#results').innerHTML,/profile-pass|data-profile="(?:balanced|long)"/);
 r.rows.forEach(m=>m.blocked=true);r.w.NBA_DASHBOARD.refresh();assert.match(r.nodes.get('#results').innerHTML,/class="empty"/);assert.doesNotMatch(r.nodes.get('#results').innerHTML,/parlay-card/);
});
test('new NBA combo and defensive props cannot duplicate or overlap the same player in an SGP',()=>{
 const A=dashboard().w.NBA_DASHBOARD,base={game_id:'g',player:'Player',player_id:'p',team_code:'NYK',side:'yes',kind:'points',selection_id:'points',ticker:'points'};
 for(const kind of ['pr','pa','ra','steals','blocks']){
  const other={...base,kind,selection_id:kind,ticker:kind};assert.equal(A.compatibleSet([base,other]),false,kind);
  assert.equal(A.compatibleSet([base,{...other,player:'Other',player_id:'q',team_code:'BOS'}]),true,kind);
 }
});
