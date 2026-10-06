const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(sport='nfl'){
 const host={hidden:true,innerHTML:'',replaceChildren(){this.innerHTML=''}},calls=[];let closed=0;
 const window={__ACTIVE_SPORT:sport,PICK_DETAILS_SHEET:{close(){closed++}},MARKET_GUARDS:{esc:s=>s.replaceAll('<','&lt;').replaceAll('"','&quot;')},PICK_QUALITY:{assess(s,m,f,o){calls.push({s,m,f,o});return {pass:m.pass!==false,rank:m.rank||0,warnings:['Model unvalidated; value unverified']}},quoteLabel:()=> 'Kalshi 60¢'},NFL_PARLAY_ELIGIBILITY:{isParlayEligible:m=>m.marketKey!=='player_pass_attempts'}};
 const document={body:{classList:{contains:()=>false}},createElement:()=>host,querySelector:()=>({after(){}})};
 vm.runInNewContext(fs.readFileSync('extra-picks.js','utf8'),{window,document,Date});return{api:window.EXTRA_PICKS,window,host,calls,closed:()=>closed};
}
test('all sports screen extras, omit main picks and duplicates, and rank independently of input order',()=>{
 for(const sport of ['nfl','mlb','ncaaf','nhl','ufc']){
  const a=setup(sport),main={ticker:'main',name:'Main'},best={ticker:'best',name:'Best',rank:90},other={ticker:'other',name:'Other',rank:70},blocked={ticker:'bad',pass:false};
  const game={id:'g'},forecast={coverage:.8};a.api.show(sport,{rows:[main,other,blocked,best,best].map(m=>({market:m,forecast,game})),selected:[{...main}]});
  assert.deepEqual([...a.api.choose(sport,[other,best].map(m=>({market:m})))].map(r=>r.market.name),['Best','Other']);
  assert.match(a.host.innerHTML,/Extra Picks <span>2/);assert.doesNotMatch(a.host.innerHTML,/>Main</);assert.doesNotMatch(a.host.innerHTML,/bad/);assert.equal(a.calls[0].o.game,game);assert.match(a.host.innerHTML,/value unverified/);
 }
});
test('extra picks include straight-only markets, escape labels, and clear stale output during navigation',()=>{
 const a=setup();a.api.show('nfl',{rows:[{market:{marketKey:'player_pass_attempts',name:'<Player>',rank:80}}]});
 assert.match(a.host.innerHTML,/Straight only/);assert.match(a.host.innerHTML,/&lt;Player>/);a.api.clear();assert.equal(a.host.hidden,true);assert.equal(a.host.innerHTML,'');
 a.window.__ACTIVE_SPORT='nhl';a.api.show('nfl',{rows:[]});assert.equal(a.host.hidden,true);a.api.show('nhl',{rows:[]});assert.match(a.host.innerHTML,/No additional picks/);assert.ok(a.closed()>0);
});
test('opposing outcomes and different lines remain distinct and output is bounded',()=>{
 const a=setup(),base={ticker:'shared',name:'Player prop'};
 assert.notEqual(a.api.key({...base,side:'over'}),a.api.key({...base,side:'under'}));assert.notEqual(a.api.key({...base,point:20}),a.api.key({...base,point:30}));
 const rows=Array.from({length:20},(_,i)=>({market:{ticker:String(i),rank:i}}));assert.equal(a.api.choose('nfl',rows).length,12);assert.equal(a.api.choose('nfl',rows)[0].market.rank,19);
});
test('selector and all sport entry points honor the four-leg cap, including saved six-leg preferences',()=>{
 const events={},window={};vm.runInNewContext(fs.readFileSync('dashboard-smooth.js','utf8'),{window,document:{addEventListener:(k,f)=>events[k]=f},localStorage:{getItem:()=>JSON.stringify({nfl:{legs:6},mlb:{legs:5}}),setItem(){} }});
 assert.equal(window.DASHBOARD_UI.get('nfl','legs',3),4);assert.equal(window.DASHBOARD_UI.get('mlb','legs',2),4);
 window.DASHBOARD_UI.put('nhl','legs',99);assert.equal(window.DASHBOARD_UI.get('nhl','legs',2),4);
 const selector=fs.readFileSync('index.html','utf8').match(/<select id="legsSelect">(.*?)<\/select>/)[1];assert.doesNotMatch(selector,/<option>5|<option>6/);
 for(const s of ['mlb','ncaaf','nhl','ufc'])assert.match(fs.readFileSync(s+'-dashboard.js','utf8'),/Math.min\(4,Math.floor\(Number\(n\)\)/);
});
