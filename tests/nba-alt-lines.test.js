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
 const nodes=new Map(),writes=[],select={addEventListener(type,fn){this.change=fn}},host={querySelector(){return null},before(field){nodes.set('#nbaLineFilters',field)}};
 nodes.set('#nbaMarketFilters',host);for(const key of ['#results','#resultsTitle','#dataStatus','#modeTitle'])nodes.set(key,{innerHTML:'',textContent:'',querySelector(){return null}});
 const document={querySelector:s=>nodes.get(s),createElement:()=>({hidden:false,querySelector:()=>select})};
 const now=Date.now(),rows=['a','b'].flatMap(game_id=>[{game_id,kind:'total',side:'yes',line:220.5,probability:.5},{game_id,kind:'total',side:'yes',line:210.5,probability:.7}]).map((m,i)=>({...m,label:'Over '+m.line,selection_id:String(i),game_time:new Date(now+86400000).toISOString(),game_status:'pre',volume:100,spread:.02}));
 const w={__ACTIVE_SPORT:'nba',__SPORT_TOKEN:1,DASHBOARD_UI:{begin(){},end(){},get:(sport,key,fallback)=>key==='lines'?saved??fallback:fallback,put:(...args)=>writes.push(args)},
  MARKET_GUARDS:{esc:String,pregame:()=>true,fresh:()=>true,unique:rows=>rows,bestBuild:rows=>rows.slice(0,2),independent:()=>true},
  PICK_QUALITY:{prepare(){},forecast:(s,m,f)=>f,assess:(s,m)=>({pass:!m.blocked,rank:1}),quoteLabel:()=>'-110',note:()=>'',estimateOdds:()=>200},
  NBA_MODEL:{estimate:()=>({modelP:.7,method:'fixture'})},SPORT_MARKETS:{allowed:m=>true,sync(){}},SLATE_UI:{matches:()=>true}};
 const ctx={window:w,document,Date,console,fetch:async url=>({ok:true,json:async()=>url.includes('kalshi')?{markets:rows,updated_at:new Date(now).toISOString()}:{}})};
 for(const file of ['nba-alt-lines.js','nba-dashboard.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx);
 return {w,nodes,select,writes,rows};
}
test('NBA line filter is visible outside the collapsed markets and controls picks, cards and saved preference',async()=>{
 const r=dashboard();await r.w.NBA_DASHBOARD.load();assert.equal(r.select.value,'both');assert.equal(r.nodes.get('#nbaLineFilters').hidden,false);
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
