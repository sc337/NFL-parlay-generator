const assert=require('node:assert/strict');
const {record,mlbStart}=require('../scripts/update_forecast_audit');
const {metrics,totals,build}=require('../scripts/build_forecast_report');
const now=Date.parse('2026-09-27T18:00:00Z');
const game={away:'Away',home:'Home',commence_time:'2026-09-28T00:00:00Z',context:{event_id:'123'}};
const market={ticker:'KXNFLTOTAL-26SEP27AWAHOM-45',type:'totals',marketKey:'totals',side:'over',point:44.5,
  prob:.51,quoteProbability:.53,sourceQuality:80};
const forecast={modelP:.54,rawModelP:.54,coverage:.21,projectedLine:45.8};
const row=record('nfl',{market,forecast,game},{},now);
assert.equal(row.forecastType,'model');
assert.equal(row.projectedLine,45.8);
assert.equal(row.eventId,'123');
assert(row.quotedEV>0);
assert.equal(record('nfl',{market,forecast,game},{},Date.parse(game.commence_time)),null,'no kickoff leakage');
assert.equal(record('nfl',{market:{...market,quoteProbability:null},forecast,game},{},now),null,'no missing quote');
assert.equal(mlbStart('KXMLBTOTAL-26SEP261915CHCBOS'),'2026-09-26T23:15:00.000Z');
assert.equal(mlbStart('KXMLBTOTAL-26NOV261915CHCBOS'),'2026-11-27T00:15:00.000Z');
const m=record('mlb',{market:{ticker:'KXMLBGAME-26SEP261915CHCBOS-CHC',event_ticker:'KXMLBGAME-26SEP261915CHCBOS',kind:'moneyline',probability:.6,yes_ask:.62,spread:.02,volume:100},forecast:{modelP:.64,context:{coverage:.48}}},{},Date.parse('2026-09-26T18:00:00Z'));
assert.equal(m.eventTime,'2026-09-26T23:15:00.000Z');
assert.equal(record('mlb',{market:{ticker:'X',probability:.6,yes_ask:.62,spread:.02,volume:100},forecast:{}},{},now),null,'unknown start time excluded');
const college=record('ncaaf',{market:{ticker:'C',kind:'moneyline',game_id:'99',game_time:'2026-09-28T00:00:00Z',close_time:'2026-09-28T01:00:00Z',
  game_status:'pre',probability:.55,yes_ask:.57,spread:.03,volume:200},forecast:{modelP:.62,rawModelP:.62,coverage:.75,experimental:true}},
  {updated_at:'2026-09-27T17:00:00Z'},now);
assert.equal(college.forecastType,'experimental');
assert.equal(college.modelP,.62);
assert.equal(college.quotedEV,null,'unvalidated college estimate is not an EV claim');
const rows=[{...row,result:'win',actualTotal:42},{...row,id:'under',result:'loss',actualTotal:42},
  {...row,id:'other',eventId:'456',result:'loss',actualTotal:50,point:47.5,projectedLine:48}];
assert.equal(metrics(rows).settled,3);
assert.equal(totals(rows).games,2,'over and under of one game count once');
assert.equal(totals(rows).modelMAE,2.9);
assert.equal(metrics(rows).independentEvents,2);
assert.equal(metrics(rows).positiveEV.distinctEvents,2);
assert.equal(build([{...row,snapshotAt:'2026-09-29T00:00:00Z'}]).pregameViolations,1);
assert.equal(metrics([{...college,result:'win'}]).experimentalComparison.settled,1);
console.log('Prospective forecast audit fixtures passed');
