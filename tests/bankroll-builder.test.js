const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const window={};
vm.runInNewContext(fs.readFileSync('bankroll-builder-core.js','utf8'),{window,Date});
const C=window.BANKROLL_CORE;
const start='2026-09-28T12:00:00Z',now=new Date(start),eventTime='2026-09-28T20:00:00Z';
const fresh=()=>({version:1,initialized:true,opening:100,bets:[],adjustments:[]});

test('does not stake without a verified price, positive EV, fresh event or bankroll',()=>{
 const ledger=fresh();
 assert.equal(C.suggestion({ledger,probability:.6,odds:'',eventTime,now}).stake,0);
 assert.equal(C.suggestion({ledger,probability:.5,odds:-110,eventTime,now}).stake,0);
 assert.equal(C.suggestion({ledger,probability:.6,odds:-110,eventTime:'2026-09-27T20:00:00Z',now}).stake,0);
 assert.equal(C.suggestion({ledger,probability:.6,odds:-110,eventTime,now,ageMs:300001}).stake,0);
 ledger.initialized=false;
 assert.equal(C.suggestion({ledger,probability:.6,odds:-110,eventTime,now}).stake,0);
});
test('flat stake is capped by bankroll and non-chasing daily exposure',()=>{
 const ledger=fresh();
 const s=C.suggestion({ledger,probability:.6,odds:-110,eventTime,now});
 assert.equal(s.stake,.5);
 assert.ok(s.ev>.02);
 ledger.bets.push({id:'1',createdAt:start,stake:1.99,status:'lost',returned:0});
 assert.equal(C.suggestion({ledger,probability:.6,odds:-110,eventTime,now}).stake,0);
 assert.equal(C.spentToday(ledger,now),1.99);
});
test('placed stake is reserved; settlements credit returns once; voids refund',()=>{
 const ledger=fresh();
 ledger.bets.push({id:'w',createdAt:start,stake:1,odds:-110,status:'pending',returned:0});
 assert.deepEqual(JSON.parse(JSON.stringify(C.balances(ledger))),{cash:99,pending:1,profit:0});
 assert.equal(C.settle(ledger,'w','won',start),true);
 assert.equal(C.settle(ledger,'w','won',start),false);
 assert.deepEqual(JSON.parse(JSON.stringify(C.balances(ledger))),{cash:100.91,pending:0,profit:.91});
 ledger.bets.push({id:'v',createdAt:start,stake:2,odds:120,status:'pending',returned:0});
 assert.equal(C.settle(ledger,'v','void',start),true);
 assert.equal(C.balances(ledger).cash,100.91);
 assert.equal(C.spentToday(ledger,now),1);
});
test('bankroll adjustments are distinct from realized profit',()=>{
 const ledger=fresh();ledger.adjustments.push({at:start,amount:25});
 ledger.bets.push({id:'l',createdAt:start,stake:1,odds:120,status:'lost',returned:0});
 assert.deepEqual(JSON.parse(JSON.stringify(C.balances(ledger))),{cash:124,pending:0,profit:-1});
});
