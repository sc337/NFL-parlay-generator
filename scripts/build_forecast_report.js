const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'data/forecast-audit.json');
const output=path.join(root,'data/forecast-report.json');
const sportNames=['nfl','mlb','ncaaf','ufc','nhl'];
const round=x=>+x.toFixed(4);
function metrics(rows){
  const settled=rows.filter(r=>['win','loss'].includes(r.result)&&r.marketP>0&&r.marketP<1&&r.modelP>0&&r.modelP<1);
  const score=(key,fn)=>settled.length?round(settled.reduce((sum,r)=>sum+fn(r[key],r.result==='win'?1:0),0)/settled.length):null;
  const brier=(p,y)=>(p-y)**2,logLoss=(p,y)=>-(y*Math.log(p)+(1-y)*Math.log(1-p));
  const model=settled.filter(r=>r.forecastType==='model');
  const experimental=settled.filter(r=>r.forecastType==='experimental');
  const eventKey=r=>r.eventId||r.event+'|'+r.eventTime;
  const bins=[[0,.4],[.4,.6],[.6,.8],[.8,1]].map(([lo,hi])=>{
    const part=model.filter(r=>r.modelP>=lo&&r.modelP<(hi===1?1.001:hi));
    return {range:[lo,hi],count:part.length,predicted:part.length?round(part.reduce((s,r)=>s+r.modelP,0)/part.length):null,
      observed:part.length?round(part.filter(r=>r.result==='win').length/part.length):null};
  });
  const value=model.filter(r=>r.quotedEV>0&&r.ask>0&&r.ask<1);
  const ablations={};
  for(const key of new Set(model.flatMap(r=>Object.keys(r.ablations||{})))){
    const paired=model.filter(r=>r.ablations?.[key]>0&&r.ablations[key]<1);
    ablations[key]={settled:paired.length,distinctEvents:new Set(paired.map(eventKey)).size,
      fullBrier:paired.length?round(paired.reduce((s,r)=>s+(r.modelP-(r.result==='win'?1:0))**2,0)/paired.length):null,
      removedBrier:paired.length?round(paired.reduce((s,r)=>s+(r.ablations[key]-(r.result==='win'?1:0))**2,0)/paired.length):null};
  }
  const modelScore=(key,fn)=>model.length?round(model.reduce((sum,r)=>sum+fn(r[key],r.result==='win'?1:0),0)/model.length):null;
  return {recorded:rows.length,independentRecorded:rows.filter(r=>r.forecastType==='model').length,
    experimentalRecorded:rows.filter(r=>r.forecastType==='experimental').length,
    settled:settled.length,distinctEvents:new Set(settled.map(eventKey)).size,
    independentSettled:model.length,independentEvents:new Set(model.map(eventKey)).size,
    brier:{model:score('modelP',brier),market:score('marketP',brier)},
    logLoss:{model:score('modelP',logLoss),market:score('marketP',logLoss)},
    independentComparison:{brierModel:modelScore('modelP',brier),brierMarket:modelScore('marketP',brier),
      logLossModel:modelScore('modelP',logLoss),logLossMarket:modelScore('marketP',logLoss)},
    experimentalComparison:{settled:experimental.length,
      distinctEvents:new Set(experimental.map(eventKey)).size,
      brierEstimate:experimental.length?round(experimental.reduce((s,r)=>s+brier(r.modelP,r.result==='win'?1:0),0)/experimental.length):null,
      brierMarket:experimental.length?round(experimental.reduce((s,r)=>s+brier(r.marketP,r.result==='win'?1:0),0)/experimental.length):null},
    calibrationBins:bins,ablations,
    positiveEV:{settled:value.length,distinctEvents:new Set(value.map(eventKey)).size,
      grossReturnPerUnit:value.length?round(value.reduce((s,r)=>s+(r.result==='win'?1/r.ask-1:-1),0)/value.length):null}};
}
function totals(rows){
  const seen=new Set(),games=rows.filter(r=>r.sport==='nfl'&&r.marketGroup==='totals'&&
    Number.isFinite(r.projectedLine)&&Number.isFinite(r.point)&&Number.isFinite(r.actualTotal)).filter(r=>{
      const key=r.eventId||r.event+'|'+r.eventTime;
      if(seen.has(key))return false;seen.add(key);return true;
    });
  if(!games.length)return {games:0,modelMAE:null,marketMAE:null,modelBias:null,marketBias:null};
  const avg=fn=>round(games.reduce((s,r)=>s+fn(r),0)/games.length);
  return {games:games.length,modelMAE:avg(r=>Math.abs(r.projectedLine-r.actualTotal)),
    marketMAE:avg(r=>Math.abs(r.point-r.actualTotal)),modelBias:avg(r=>r.projectedLine-r.actualTotal),
    marketBias:avg(r=>r.point-r.actualTotal)};
}
function build(rows){
  const sports={};
  for(const sport of sportNames){
    const selected=rows.filter(r=>r.sport===sport),groups={};
    for(const group of new Set(selected.map(r=>r.marketGroup).filter(Boolean)))
      groups[group]=metrics(selected.filter(r=>r.marketGroup===group));
    sports[sport]={...metrics(selected),groups};
  }
  const pregameViolations=rows.filter(r=>!(Date.parse(r.recordedAt)<Date.parse(r.eventTime))||
    r.snapshotAt&&!(Date.parse(r.snapshotAt)<Date.parse(r.eventTime))).length;
  return {updated_at:new Date().toISOString(),method:'First pregame Kalshi quote per contract and side; settled contract result; no postgame feature backfill. Lower Brier/log loss is better. Market-only rows are identical by design. Gross positive-EV return excludes fees and is not a placed-bet ledger. NFL totals use final ESPN score when available.',
    pregameViolations,sports,nflTotals:totals(rows)};
}
function main(){const rows=JSON.parse(fs.readFileSync(file,'utf8')).records||[];
  const report=build(rows);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log('Forecast report',Object.entries(report.sports).map(([s,x])=>s+': '+x.settled+'/'+x.recorded).join('; '),'NFL totals',report.nflTotals.games);
}
if(require.main===module)main();
module.exports={metrics,totals,build};
