const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../model-learning'),T=require('../scripts/train_model_learning');
const start=Date.parse('2025-01-01T20:00:00Z'),now=Date.parse('2026-10-15T16:00:00Z');
function row(i,patch={}){const time=start+i*86400000;return {id:'r'+i,sport:'nfl',eventId:'g'+i,eventTime:new Date(time).toISOString(),recordedAt:new Date(time-3600000).toISOString(),snapshotAt:new Date(time-7200000).toISOString(),settledAt:new Date(time+4*3600000).toISOString(),marketGroup:'player_pass_yds',marketFamily:'player_pass_yds',direction:'over',player:'QB',team:'Home',modelP:.7,marketP:.5,modelVersion:L.VERSION,result:i%10<7?'win':'loss',baselines:{market:.5,simpleMean:.5},...patch}}
test('opportunity projections expose carries and target/catch/efficiency components',()=>{
 const a=L.opportunity([100,100,100,100,100],[20,20,20,20,20]);assert.equal(a.projectedExposure,20);assert.equal(a.efficiency,5);assert.equal(a.projection,100);
 const b=L.opportunity([60,60,60,60,60],[10,10,10,10,10],{conversion:[5,5,5,5,5]});assert.equal(b.conversionRate,.5);assert.equal(b.efficiency,12);assert.equal(b.projection,60);
 assert.equal(L.opportunity([1,2],[1,2]),null);assert.equal(L.opportunity([1,1,1,1,1],[1,1,1,1,1],{conversion:[2,2,2,2,2]}),null);
});
test('falling and rising opportunities are explicit while thin samples remain unknown',()=>{assert.equal(L.roleChange([20,20,20,4,4]).status,'falling');assert.equal(L.roleChange([10,10,10,20,20]).status,'rising');assert.equal(L.roleChange([19,20,21,20,20]).status,'stable');assert.equal(L.roleChange([20,1]).status,'insufficient')});
test('postgame forecasts, missing settlement times and future outcomes cannot train rules',()=>{const a=row(1),bad=[{...a,id:'post',recordedAt:a.eventTime},{...a,id:'future',settledAt:new Date(now+1000).toISOString()},{...a,id:'unknown',settledAt:null}];assert.equal(L.clean([a,...bad],now).length,1);assert.equal(T.build([{...a,modelVersion:'legacy'}],now).sports.nfl.report.distinctEvents,0)});
test('splits keep whole events/dates together and require outcomes known before validation',()=>{
 const rows=Array.from({length:120},(_,i)=>row(i)),split=L.split(rows);assert.ok(split);assert.ok(split.train.every(r=>L.day(r)<L.day(split.validation[0])));assert.ok(split.train.every(r=>Date.parse(r.settledAt)<Math.min(...split.validation.map(v=>Date.parse(v.recordedAt)))));
 const event=split.validation[0];assert.ok(!split.train.some(r=>r.eventId===event.eventId));
 const late=rows.map(r=>({...r,settledAt:new Date(now-1000).toISOString()}));assert.equal(L.split(late),null);
});
test('game-weighted comparison prevents alternate ladders from inflating the sample',()=>{const a=row(0),b=row(1,{result:'loss'}),rows=[...Array.from({length:100},(_,i)=>({...a,id:'alt'+i})),b];const x=L.compare(rows).simpleMean;assert.equal(x.events,2);assert.ok(Math.abs(x.modelBrier-(.09+.49)/2)<1e-8)});
test('empirical buffers and baseline approval need later improvement with adequate events',()=>{const rows=Array.from({length:150},(_,i)=>row(i));const b=T.fitBuffer(rows);assert.equal(b.active,true);assert.ok(b.bins[0].buffer>.015);assert.equal(T.baselineGate(rows).active,true);assert.equal(T.fitBuffer(rows.slice(0,40)).active,false);const worse=rows.map(r=>({...r,modelP:.99}));assert.equal(T.baselineGate(worse).active,false)});
test('Gaussian joint probabilities preserve independence and the sign of dependence',()=>{assert.equal(L.both(.5,.5,0),.25);assert.ok(Math.abs(L.both(.5,.5,.5)-1/3)<.001);assert.ok(L.both(.5,.5,-.5)<.2)});
test('historical dependence fits only complete pairs and tests later games',()=>{
 const rows=Array.from({length:120},(_,i)=>{const a=row(i,{modelP:.5,result:i%2?'win':'loss'}),b={...a,id:'receiver'+i,player:'WR',marketGroup:'player_reception_yds',marketFamily:'player_reception_yds'};return [a,b]}).flat();
 const groups=T.pairs(rows);assert.equal(groups.size,1);const fit=T.fitPair([...groups.values()][0]);assert.equal(fit.active,true);assert.ok(fit.rho>0);assert.ok(fit.trainedThrough<fit.validationFrom);assert.ok(fit.validationLogLoss<fit.independenceLogLoss);
 const a=rows[0],b=rows[1];assert.notEqual(L.pairKey({...a,direction:'under'},b),L.pairKey(a,{...b,direction:'under'}));
});
test('runtime refuses mismatched versions, stale rules and insufficient holdouts',()=>{
 const window={};class Clock extends Date{static now(){return now}};vm.runInNewContext(fs.readFileSync('model-learning.js','utf8'),{window,Date:Clock});
 const fit=T.fitBuffer(Array.from({length:150},(_,i)=>row(i)));window.MODEL_LEARNING_DATA={modelVersion:L.VERSION,updated_at:new Date(now).toISOString(),sports:{nfl:{buffers:{player_pass_yds:fit}}}};
 assert.ok(window.MODEL_LEARNING.learnedBuffer('nfl','player_pass_yds',.7));fit.modelVersion='old';assert.equal(window.MODEL_LEARNING.learnedBuffer('nfl','player_pass_yds',.7),null);
 fit.modelVersion=L.VERSION;fit.validationEvents=29;assert.equal(window.MODEL_LEARNING.learnedBuffer('nfl','player_pass_yds',.7),null);
});
