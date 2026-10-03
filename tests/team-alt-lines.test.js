const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){const window={},document={addEventListener(){},querySelector:()=>null};vm.runInNewContext(fs.readFileSync('team-alt-lines.js','utf8'),{window,document,Date});return window.TEAM_ALT_LINES}
const stamp=()=>new Date().toISOString();
const row=(title,ask=.5,patch={})=>({title,label:title,kind:'total',game_id:'1',yes_bid:ask-.02,yes_ask:ask,volume:1000,game_time:new Date(Date.now()+86400000).toISOString(),...patch});
test('references are stable across feed ordering, opposite sides, team totals and games',()=>{
 const api=runtime(),rows=[row('Over 8.5 runs scored'),row('Under 8.5 runs scored',.52),row('Under 9.5 runs scored',.7),row('Will Yankees score over 4.5 runs?',.5),row('Will Yankees score under 5.5 runs?',.7),row('Will Mets score over 5.5 runs?',.5),row('Over 9.5 runs scored',.5,{game_id:'2'})];
 api.classify('mlb',rows,stamp());const reference=rows.map(m=>[m.title,m.isAltLine,m.altReferenceLine]);
 api.classify('mlb',[...rows].reverse(),stamp());assert.deepEqual(rows.map(m=>[m.title,m.isAltLine,m.altReferenceLine]),reference);
 assert.equal(rows[0].isAltLine,false);assert.equal(rows[1].isAltLine,false);assert.equal(rows[2].isAltLine,true);assert.equal(rows[4].isAltLine,true);assert.equal(rows[5].isAltLine,false);assert.equal(rows[6].isAltLine,false);
});
test('ALT requires a supported independent forecast, near reference, value and fresh executable quote',()=>{
 const api=runtime(),m=row('Under 9.5 runs scored',.7,{isAltLine:true,altDistance:1,altSnapshotAt:stamp()}),forecast={experimental:true,modelP:.76,coverage:.65};
 assert.equal(api.qualifies('mlb',m,forecast),true);
 for(const patch of [{altDistance:2},{yes_ask:.85},{yes_ask:null},{altSnapshotAt:null},{altSnapshotAt:new Date(Date.now()-31*60000).toISOString()}])assert.equal(api.qualifies('mlb',{...m,...patch},forecast),false);
 for(const patch of [{experimental:false},{modelP:.71},{coverage:.3}])assert.equal(api.qualifies('mlb',m,{...forecast,...patch}),false);
 const college={...m,altDistance:3};assert.equal(api.qualifies('ncaaf',college,forecast),true);assert.equal(api.qualifies('ncaaf',{...college,altDistance:4},forecast),false);assert.equal(api.qualifies('ncaaf',college,{...forecast,coverage:.59}),false);
});
test('unsupported MLB alternative run lines cannot enter recommendations through Both',()=>{
 const api=runtime(),rows=[row('Dodgers wins by over 1.5 runs?',.5,{kind:'spread'}),row('Dodgers wins by under 2.5 runs?',.7,{kind:'spread'})];api.classify('mlb',rows,stamp());
 assert.equal(rows[0].isAltLine,false);assert.equal(rows[1].isAltLine,true);assert.equal(api.qualifies('mlb',rows[1],{experimental:false,modelP:.85,coverage:.8}),false);
});
test('date and line controls intersect and preserve an empty selected date',()=>{
 const api=runtime(),controller=api.create('mlb',()=>{}),rows=[row('Over 8.5 runs scored'),row('Under 9.5 runs scored',.7)];controller.load(rows,stamp());
 controller.setLineMode('alt');assert.equal(controller.matches(rows[0]),false);assert.equal(controller.matches(rows[1]),true);
 controller.setDate('2040-01-01');assert.equal(controller.matches(rows[1]),false);assert.equal(controller.filters().date,'2040-01-01');controller.setDate('all');assert.equal(controller.matches(rows[1]),true);
});
test('dashboard ALT mode cannot be bypassed by creator fallbacks and repeated builds stay stable',async()=>{
 for(const sport of ['mlb','ncaaf']){
  const nodes=new Map(),document={addEventListener(){},body:{classList:{contains:()=>false}},querySelector:s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{}});return nodes.get(s)}};
  const window={__ACTIVE_SPORT:sport,__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},COMPACT_UI:{refresh(){}}};
  const titles=sport==='mlb'?['Over 8.5 runs scored','Under 9.5 runs scored','Under 12.5 runs scored']:['Over 50.5 points scored','Under 52.5 points scored','Under 60.5 points scored'];
  const rows=titles.map((title,i)=>row(title,i===0?.5:i===1?.7:.85,{game_status:'pre',game_label:'Away at Home',ticker:'T'+i,selection_id:'T'+i,probability:i===0?.5:i===1?.7:.85,spread:.02,volume:2000,open_interest:500}));
  const forecast={modelP:.78,coverage:.7,experimental:true,kind:'game',projectedTotal:9,projectedAway:4,projectedHome:5,trials:20000,range:[3,15]};
  if(sport==='mlb')window.MLB_TOTALS_MODEL={estimate:()=>forecast};else window.NCAAF_MODEL={estimate:()=>forecast};
  const snapshot={updated_at:stamp(),markets:rows};const fetch=async url=>({ok:true,json:async()=>url.includes('context')?{}:snapshot,text:async()=>JSON.stringify(snapshot)});
  const env=vm.createContext({window,document,fetch,Date,Math});
  for(const file of ['market-guards.js','model-core.js','team-alt-lines.js',sport+'-dashboard.js'])vm.runInContext(fs.readFileSync(file,'utf8'),env);
  const app=window[sport.toUpperCase()+'_DASHBOARD'];await app.load();app.setLineMode('alt');
  const html=nodes.get('#results').innerHTML;assert.match(html,/data-alt-line="true"/);assert.match(html,/Kalshi 70¢/);assert.doesNotMatch(html,/Kalshi 85¢/);assert.doesNotMatch(html,/data-alt-line="false"/);
  app.setLegs(2);assert.equal(nodes.get('#results').innerHTML,html);
  app.setDate('2040-01-01');assert.doesNotMatch(nodes.get('#results').innerHTML,/class="parlay-card"/);
  app.setDate('all');snapshot.updated_at=new Date(Date.now()-31*60000).toISOString();await app.load();assert.doesNotMatch(nodes.get('#results').innerHTML,/class="parlay-card"/);
 }
});
