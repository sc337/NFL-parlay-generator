const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../espn-evidence'),now=Date.now(),at=new Date(now).toISOString(),start=new Date(now+86400000).toISOString();
function market(values=[30,32,31,12,10]){return {player:'Player',game_time:start,espnEvidence:{checkedAt:at,eventTime:start,availability:null,usage:{metric:'MIN',rows:values.map((value,i)=>({date:new Date(now-(8-i)*86400000).toISOString(),value}))}}}}
test('current out/questionable reports block picks, stale reports never masquerade as current',()=>{
 for(const status of ['Out','Doubtful','Questionable','15-Day-IL']){const m=market();m.espnEvidence.usage=null;m.espnEvidence.availability={status,reportedAt:at};assert.ok(E.inspect(m).blocked)}
 const m=market([30,31,30,32,31]);m.espnEvidence.availability={status:'Out',reportedAt:new Date(now-365*86400000).toISOString()};assert.equal(E.inspect(m).blocked,null);assert.match(E.inspect(m).warnings.join(' '),/current confirmation/);
 m.espnEvidence.checkedAt=new Date(now-3*3600000).toISOString();assert.equal(E.inspect(m).blocked,null);assert.match(E.inspect(m).warnings.join(' '),/expired/);
});
test('recent exposure changes block props; future observations cannot improve the sample',()=>{
 assert.equal(E.inspect(market()).role.status,'falling');assert.ok(E.inspect(market()).blocked);assert.equal(E.inspect(market([30,31,30,32,31])).blocked,null);
 const m=market([30,31,30,32,31]);m.espnEvidence.usage.rows[4].date=new Date(now+3600000).toISOString();assert.equal(E.inspect(m).role,null);assert.match(E.inspect(m).warnings.join(' '),/incomplete/);
});
test('a valid public contract preserves signed spread, exact participants and source event ID',()=>{
 const m={referenceOnly:true,espn_game_id:'123',kind:'spread',team_id:'2',point:3,side:'no',game_time:start,quotedAt:at,teams:[{id:'1'},{id:'2'}]};const c=E.contract('nhl',m);assert.equal(c.line,3);assert.equal(c.eventId,'123');assert.equal(c.teamId,'2');assert.equal(c.scope,'full_game');
 for(const patch of [{espn_game_id:null},{team_id:'3'},{player:'Player'},{point:null},{quotedAt:new Date(now-31*60000).toISOString()}])assert.equal(E.contract('nhl',{...m,...patch}),null);
});
test('the shared quality gate applies availability monitoring before returning a qualified pick',()=>{
 const w={ESPN_EVIDENCE:E},ctx={window:w,Date,console};vm.runInNewContext(fs.readFileSync('pick-quality.js','utf8'),ctx);const m={...market([30,31,30,32,31]),kind:'moneyline',yes_ask:.5,probability:.5,game_status:'pre'};w.PICK_QUALITY.prepare('ncaaf',[m],{},[],at);
 const f={modelP:.64,coverage:.85,experimental:true};assert.equal(w.PICK_QUALITY.assess('ncaaf',m,f).pass,true);m.espnEvidence.availability={status:'Out',reportedAt:at};assert.match(w.PICK_QUALITY.assess('ncaaf',m,f).reason,/unavailable/);
 assert.equal(w.PICK_QUALITY.group('nba',{kind:'total',referenceOnly:true}),'total:public');
});
test('public references enter the frozen archive only with a verifiable settlement contract',()=>{
 const m={referenceOnly:true,espn_game_id:'123',ticker:'ESPN:123',kind:'total',point:5.5,side:'under',game_time:start,close_time:start,quotedAt:at,teams:[{id:'1'},{id:'2'}],probability:.5,yes_ask:.5,price:100,game_status:'pre',source:'DraftKings via ESPN'};
 const f={modelP:.64,rawModelP:.64,coverage:.85,experimental:true};const r=require('../scripts/update_forecast_audit').record('nhl',{market:m,forecast:f},{updated_at:at},now);
 assert.equal(r.settlement.provider,'ESPN');assert.equal(r.marketGroup,'total:public');assert.equal(r.priceSource,'DraftKings via ESPN');assert.equal(r.modelP,.64);assert.equal(r.result,null);
});
