const assert=require('node:assert/strict');
const {record,mlbStart}=require('../scripts/update_forecast_audit');
const {metrics,totals,nflLineCalibration,build}=require('../scripts/build_forecast_report');
const now=Date.parse('2026-09-27T18:00:00Z');
const game={away:'Away',home:'Home',commence_time:'2026-09-28T00:00:00Z',context:{event_id:'123'}};
const market={ticker:'KXNFLTOTAL-26SEP27AWAHOM-45',type:'totals',marketKey:'totals',side:'over',point:44.5,
  prob:.51,quoteProbability:.53,sourceQuality:80};
const forecast={modelP:.54,rawModelP:.54,coverage:.21,projectedLine:45.8};
const row=record('nfl',{market,forecast,game},{},now);
assert.equal(row.forecastType,'model');
assert.equal(row.projectedLine,45.8);
assert.equal(row.eventId,'123');
assert.equal(row.checkpoint,'6h');
const early=record('nfl',{market,forecast,game},{updated_at:'2026-09-26T18:00:00Z'},Date.parse('2026-09-26T18:00:00Z'));
assert.equal(early.checkpoint,null);
const close=record('nfl',{market,forecast,game},{updated_at:'2026-09-27T19:00:00Z'},Date.parse('2026-09-27T19:00:00Z'));
assert.equal(close.checkpoint,'6h');assert.notEqual(close.id,early.id,'pregame checkpoint cannot overwrite the first forecast');
const late=record('nfl',{market,forecast,game},{updated_at:'2026-09-27T23:20:00Z'},Date.parse('2026-09-27T23:20:00Z'));
assert.equal(late.checkpoint,'60m');
const final=record('nfl',{market,forecast,game},{updated_at:'2026-09-27T23:50:00Z'},Date.parse('2026-09-27T23:50:00Z'));
assert.equal(final.checkpoint,'15m');assert.notEqual(final.id,late.id);
const studyForecast={...forecast,forecastVersion:'nfl-team-distribution-v1',featureAsOf:'2026-09-27T23:19:00Z',
  studyVariants:Object.fromEntries(['market','formOnly','weatherOnly','halfForm','current'].map(name=>[name,{line:45,probability:.52}]))};
const studyRow=record('nfl',{market,forecast:studyForecast,game},{updated_at:'2026-09-27T23:20:00Z'},Date.parse('2026-09-27T23:20:00Z'));
assert.equal(studyRow.studyVariants.halfForm.line,45);assert.match(studyRow.id,/nfl-total-shadow-20261027-v1/);
assert.equal(record('nfl',{market,forecast:{...studyForecast,featureAsOf:'2026-09-28T00:01:00Z'},game},
  {updated_at:'2026-09-27T23:20:00Z'},Date.parse('2026-09-27T23:20:00Z')).studyVariants,null,'post-kickoff features are never studied');
assert.equal(record('nfl',{market:{...market,quotedAt:'2026-09-28T00:00:01Z'},forecast,game},{},now),null,'reject post-kickoff quotes');
assert.equal(record('nfl',{market:{...market,quotedAt:'2026-09-27T17:20:00Z'},forecast,game},{},now),null,'reject stale team-market quotes');
assert(row.quotedEV>0);
assert.equal(record('nfl',{market,forecast,game},{},Date.parse(game.commence_time)),null,'no kickoff leakage');
assert.equal(record('nfl',{market:{...market,quoteProbability:null},forecast,game},{},now),null,'no missing quote');
assert.equal(mlbStart('KXMLBTOTAL-26SEP261915CHCBOS'),'2026-09-26T23:15:00.000Z');
assert.equal(mlbStart('KXMLBTOTAL-26NOV261915CHCBOS'),'2026-11-27T00:15:00.000Z');
const m=record('mlb',{market:{ticker:'KXMLBGAME-26SEP261915CHCBOS-CHC',event_ticker:'KXMLBGAME-26SEP261915CHCBOS',kind:'moneyline',probability:.6,yes_ask:.62,spread:.02,volume:100},forecast:{modelP:.64,context:{coverage:.48}}},{},Date.parse('2026-09-26T18:00:00Z'));
assert.equal(m.eventTime,'2026-09-26T23:15:00.000Z');
const simulated=record('mlb',{market:{ticker:'KXMLBTOTAL-26SEP261915CHCBOS-9',event_ticker:'KXMLBTOTAL-26SEP261915CHCBOS',kind:'total',game_id:'99',game_time:'2026-09-26T23:15:00Z',probability:.5,yes_ask:.52,spread:.02,volume:100},forecast:{modelP:.57,rawModelP:.57,coverage:.51,experimental:true,projectedLine:8.7}},{},Date.parse('2026-09-26T18:00:00Z'));
assert.equal(simulated.forecastType,'experimental');
assert.equal(simulated.projectedLine,8.7);
assert.equal(simulated.quotedEV,null,'unvalidated MLB totals must not enter the positive-EV audit');
assert.equal(record('mlb',{market:{ticker:'X',probability:.6,yes_ask:.62,spread:.02,volume:100},forecast:{}},{},now),null,'unknown start time excluded');
const college=record('ncaaf',{market:{ticker:'C',kind:'moneyline',game_id:'99',game_time:'2026-09-28T00:00:00Z',close_time:'2026-09-28T01:00:00Z',
  game_status:'pre',probability:.55,yes_ask:.57,spread:.03,volume:200},forecast:{modelP:.62,rawModelP:.62,coverage:.75,experimental:true}},
  {updated_at:'2026-09-27T17:45:00Z'},now);
assert.equal(college.forecastType,'experimental');
assert.equal(college.modelP,.62);
assert.equal(college.quotedEV,null,'unvalidated college estimate is not an EV claim');
const newCollege=record('ncaaf',{market:{ticker:'C',kind:'spread',game_id:'99',game_time:'2026-09-28T00:00:00Z',close_time:'2026-09-28T01:00:00Z',
  game_status:'pre',probability:.55,yes_ask:.57,spread:.03,volume:200},forecast:{modelP:.65,rawModelP:.65,coverage:.75,experimental:true,
    forecastVersion:'ncaaf-errors-stress-v1',projectedMargin:6.2,probabilityMethod:'Historical error blend',errorSample:100},
  qualification:{pass:false,reason:'NCAAF sensitivity check failed',sensitivity:{pass:false,worstP:.5,requiredP:.59}}},
  {updated_at:'2026-09-27T17:45:00Z'},now);
assert.equal(newCollege.forecastVersion,'ncaaf-errors-stress-v1');assert.match(newCollege.id,/ncaaf-errors-stress-v1/);
assert.equal(newCollege.marginProjection,6.2);assert.equal(newCollege.errorSample,100);assert.equal(newCollege.sensitivity.pass,false);
const touchdown=record('nfl',{market:{...market,type:'td',marketKey:'player_anytime_td',player:'Scorer',name:'Scorer anytime TD',point:null,ticker:'KXNFLTD-26SEP27AWAHOM-SCORER-1'},
  forecast:{modelP:.43,rawModelP:.36,coverage:.38,experimental:true,projectedLine:null},game},{},now);
assert.equal(touchdown.forecastType,'experimental');
assert.equal(touchdown.marketGroup,'touchdown_scorer');
assert.equal(touchdown.quotedEV,null);
assert.equal(record('nfl',{market:{...market,type:'td',player:'Scorer'},forecast:{modelP:.43,coverage:.38,experimental:false},game},{},now).forecastType,'market_only');
const rows=[{...row,result:'win',actualTotal:42},{...row,id:'under',result:'loss',actualTotal:42},
  {...row,id:'other',eventId:'456',result:'loss',actualTotal:50,point:47.5,projectedLine:48}];
assert.equal(metrics(rows).settled,3);
assert.equal(totals(rows).games,2,'over and under of one game count once');
assert.equal(totals(rows).modelMAE,2.9);
const alt={...row,id:'alt',contractId:'nfl|ALT|yes',isAltLine:true,marketGroup:'totals',point:30.5,marketP:.9,modelP:.9,result:'win'};
assert.equal(totals([...rows,alt]).games,2,'alternate thresholds do not add independent game forecasts');
assert.equal(nflLineCalibration([...rows,alt])['totals|alt'].settled,1);
assert.equal(nflLineCalibration([...rows,alt])['totals|standard'].settled,1,'one latest snapshot per contract');
const scoreSettled={...row,result:null,actualTotal:50,point:44.5,direction:'over'};
assert.equal(nflLineCalibration([scoreSettled])['totals|standard'].winRate,1,'final score evaluates an unsettled total');
assert.equal(nflLineCalibration([scoreSettled,{...scoreSettled,checkpoint:'24h',recordedAt:'2026-09-27T17:00:00Z'}])['totals|standard'].settled,1);
const propAlt={...alt,contractId:'nfl|PASS-ALT|yes',marketGroup:'player_pass_yds',player:'Quarterback',result:'loss',actualTotal:null};
assert.equal(nflLineCalibration([propAlt])['player_pass_yds|alt'].settled,1,'settled player ALT legs get a separate calibration bin');
assert.equal(metrics(rows).independentEvents,2);
assert.equal(metrics(rows).positiveEV.distinctEvents,2);
assert.equal(build([{...row,snapshotAt:'2026-09-29T00:00:00Z'}]).pregameViolations,1);
assert.equal(metrics([{...college,result:'win'}]).experimentalComparison.settled,1);
console.log('Prospective forecast audit fixtures passed');

const underAudit=record("mlb",{market:{ticker:"PAIR",kind:"total",side:"no",quoteSide:"no",label:"Under 8.5 runs scored",game_time:"2026-09-28T00:00:00Z",probability:.55,yes_ask:.55,spread:.02,volume:100},forecast:{}},{},now);
assert.equal(underAudit.side,"no");
assert.equal(underAudit.id,"mlb|PAIR|no");

const hockey=record('nhl',{market:{ticker:'KXNHLPTS-26OCT03BOSNYR-PLAYER-1',kind:'points',line:.5,player_id:'100',game_id:'nhl1',game_status:'pre',game_time:'2026-09-28T00:00:00Z',probability:.55,yes_ask:.57,spread:.02,volume:100},forecast:{modelP:.65,rawModelP:.65,coverage:.5,experimental:true,projectedLine:1.1}},{updated_at:'2026-09-27T17:45:00Z'},now);
assert.equal(hockey.forecastType,'experimental');assert.equal(hockey.quotedEV,null);assert.equal(hockey.point,.5);
assert.equal(build([{...hockey,result:'win'}]).sports.nhl.experimentalRecorded,1);
