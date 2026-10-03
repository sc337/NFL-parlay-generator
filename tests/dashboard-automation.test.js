const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {captureRecord,mergeRecords,settle,dayKey,collect}=require('../scripts/snapshot_daily_picks');
const {build,checkSport}=require('../scripts/check_dashboard_health');
const now=Date.parse('2026-10-03T06:00:00Z'),at=new Date(now).toISOString(),future=new Date(now+86400000).toISOString();
const market=(id,patch={})=>({ticker:'T'+id,kind:'total',label:'Over 8.5 runs scored',title:'Over 8.5 runs scored',game_id:String(id),game_time:future,close_time:future,game_status:'pre',game_label:'Away at Home',yes_ask:.6,probability:.59,yes_bid:.58,volume:1000,spread:.02,...patch});
const forecast={modelP:.7,coverage:.65,experimental:true,confidence:70};
const recommendation=(patch={})=>({requestedLegs:2,profile:'best',mode:'multi',legs:[1,2].map(id=>({market:market(id),forecast})),...patch});
test('daily snapshots use LA dates, retain real lines and original prices, and deduplicate builds',()=>{
 const first=captureRecord('mlb',recommendation(),{updated_at:at},now,'commit1');
 assert.equal(dayKey(now),'2026-10-02');assert.equal(first.day,'2026-10-02');assert.equal(first.legs[0].line,8.5);assert.equal(first.legs[0].modelP,.7);assert.equal(first.sourceVersion,'commit1');assert.equal(first.actualLegs,2);
 const repriced=recommendation();repriced.legs[0].market.yes_ask=.7;repriced.legs[0].forecast={...forecast,modelP:.8};
 const second=captureRecord('mlb',repriced,{updated_at:at},now+60000,'commit2');
 assert.equal(first.id,second.id);const merged=mergeRecords([first],[second]);assert.equal(merged.length,1);assert.equal(merged[0].legs[0].ask,.6);assert.equal(merged[0].legs[0].modelP,.7);
 const changed=recommendation();changed.legs[0].market=market(3);assert.equal(mergeRecords(merged,[captureRecord('mlb',changed,{updated_at:at},now,'commit2')]).length,2);
});
test('stale, started, missing-price or unverified games never become archived recommendations',()=>{
 for(const patch of [{game_time:null},{game_time:new Date(now-1).toISOString()},{yes_ask:null},{game_status:'Live'}]){
  const build=recommendation();build.legs[0].market={...build.legs[0].market,...patch};assert.equal(captureRecord('mlb',build,{updated_at:at},now,'c'),null);
 }
 assert.equal(captureRecord('mlb',recommendation(),{updated_at:new Date(now-31*60000).toISOString()},now,'c'),null);
 const sgp=recommendation({mode:'sgp'}),record=captureRecord('mlb',sgp,{updated_at:at},now,'c');assert.equal(record.priceEstimate,null);
});
test('settlement attaches actual contract outcomes without rewriting captured forecasts',()=>{
 const record=captureRecord('mlb',recommendation(),{updated_at:at},now,'c');
 settle([record],{records:[{id:record.legs[0].id,result:'win'},{id:record.legs[1].id,result:'void'}]});assert.equal(record.result,'win');assert.equal(record.legs[0].ask,.6);
 settle([record],{records:[{id:record.legs[0].id,result:'loss'}]});assert.equal(record.result,'loss');
});
function feeds(){return Object.fromEntries(['nfl','mlb','ncaaf','nhl','ufc'].map(s=>['kalshi-'+s+'.json',{updated_at:at,...(s==='nfl'?{games:[]}:{markets:[]})}]).concat([['daily-picks.json',{updated_at:at,sports:{}}]]))}
test('empty offseason feeds are healthy but stale feeds and failed refreshes alert',()=>{
 const data=feeds();assert.equal(build(data,{},now).status,'healthy');
 data['kalshi-mlb.json'].updated_at=new Date(now-31*60000).toISOString();const warning=build(data,{},now);assert.equal(warning.alerts[0].id,'mlb:stale');
 const repeat=build(data,warning,now+60000);assert.equal(repeat.alerts[0].firstSeen,warning.alerts[0].firstSeen);assert.equal(repeat.alerts[0].changedAt,warning.alerts[0].changedAt);
 data['kalshi-mlb.json'].updated_at=at;assert.deepEqual(build(data,warning,now).resolved.map(r=>r.id),['mlb:stale']);
 assert.equal(build(data,{},now,'failure').status,'critical');
});
test('market-drop alerts compare still-upcoming games and ignore completed games',()=>{
 const previous={snapshotAt:at,futureEvents:[1,2,3].map(id=>({id:String(id),time:future})),playerCounts:{}};
 assert.ok(checkSport('mlb',{updated_at:at,markets:[market(1)]},previous,now).alerts.some(a=>a.code==='market-drop'));
 previous.futureEvents.forEach(e=>e.time=new Date(now-1).toISOString());assert.equal(checkSport('mlb',{updated_at:at,markets:[]},previous,now).alerts.length,0);
});
test('missing player data and player-market disappearance raise targeted alerts',()=>{
 const props=[1,2].map(id=>market(id,{kind:'goals',player:'Player',player_id:null}));
 assert.ok(checkSport('nhl',{updated_at:at,markets:props},{},now).alerts.some(a=>a.code==='player-data'));
 const prev={snapshotAt:at,futureEvents:[{id:'1',time:future},{id:'2',time:future}],playerCounts:{'1':3,'2':2}};
 assert.ok(checkSport('mlb',{updated_at:at,markets:[market(1),market(2)]},prev,now).alerts.some(a=>a.code==='props-missing'));
});
test('capture uses the actual MLB builder, including its honest partial fallback',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recommendation-test-'));
 try{
  const actualNow=Date.now(),start=new Date(actualNow+86400000).toISOString(),pairs=['CWSCLE','SDMIL','NYYTB'];
  const markets=pairs.map((pair,i)=>market(i+1,{game_time:start,close_time:start,event_ticker:'KXMLBTOTAL-26OCT031300'+pair}));
  fs.writeFileSync(path.join(dir,'kalshi-mlb.json'),JSON.stringify({updated_at:new Date(actualNow).toISOString(),markets}));
  fs.writeFileSync(path.join(dir,'mlb-context.json'),JSON.stringify({updated_at:new Date(actualNow).toISOString(),games:[],players:{},pitchers:{}}));
  const result=await collect('mlb',dir,actualNow,'fixture');
  const six=result.records.find(r=>r.mode==='multi'&&r.requestedLegs===6);assert.equal(six.actualLegs,3);assert.equal(six.legs[0].forecastType,'market_only');assert.equal(six.legs[0].modelP,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
