// Score only forecasts and input variants frozen in the same pregame audit row.
const round=x=>+x.toFixed(4);
const variants=['market','formOnly','weatherOnly','halfForm','current'];
const validTime=(at,start)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<Date.parse(start);
const avg=(rows,fn)=>rows.length?round(rows.reduce((sum,row)=>sum+fn(row),0)/rows.length):null;
const laDate=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
function weekKey(at){
  const parts=Object.fromEntries(laDate.formatToParts(new Date(at)).map(p=>[p.type,p.value]));
  const day=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day));
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+3)%7); // Thursday through Wednesday
  return day.toISOString().slice(0,10);
}
function eligiblePregame(r){
  return r.sport==='nfl'&&r.marketGroup==='totals'&&r.studyId==='nfl-total-shadow-20261027-v1'&&
    Number.isFinite(r.point)&&
    ['over','under'].includes(r.direction)&&typeof r.isAltLine==='boolean'&&
    ['recordedAt','snapshotAt','quoteAt','featureAsOf'].every(k=>validTime(r[k],r.eventTime))&&
    ['snapshotAt','quoteAt','featureAsOf'].every(k=>Date.parse(r[k])<=Date.parse(r.recordedAt)+60000)&&
    variants.every(name=>Number.isFinite(r.studyVariants?.[name]?.line)&&
      r.studyVariants[name].probability>0&&r.studyVariants[name].probability<1);
}
const eligible=r=>eligiblePregame(r)&&Number.isFinite(r.actualTotal);
function lineScores(rows){
  return Object.fromEntries(variants.map(name=>[name,{mae:avg(rows,r=>Math.abs(r.studyVariants[name].line-r.actualTotal)),
    signedError:avg(rows,r=>r.studyVariants[name].line-r.actualTotal)}]));
}
function probabilityScores(rows){
  return {contracts:rows.length,distinctGames:new Set(rows.map(r=>r.eventId||r.event)).size,
    brier:Object.fromEntries(['quotedMarket',...variants].map(name=>[name,avg(rows,r=>{
      const p=name==='quotedMarket'?r.marketP:r.studyVariants[name].probability;
      const result=r.direction==='over'?r.actualTotal>r.point:r.actualTotal<r.point;
      return (p-Number(result))**2;
    })]))};
}
function study(rows){
  const checkpointCoverage=Object.fromEntries(['24h','6h','60m','15m'].map(stage=>[stage,
    new Set(rows.filter(r=>eligiblePregame(r)&&r.direction==='over'&&r.isAltLine===false&&r.checkpoint===stage)
      .map(r=>r.eventId||r.event+'|'+r.eventTime)).size]));
  const latest=new Map();
  for(const r of rows)if(eligible(r)&&r.actualTotal!==r.point){
    const key=r.contractId||[r.sport,r.ticker,r.side].join('|');
    if(!latest.has(key)||Date.parse(r.recordedAt)>Date.parse(latest.get(key).recordedAt))latest.set(key,r);
  }
  const contracts=[...latest.values()],perGame=new Map();
  for(const r of contracts)if(r.direction==='over'&&r.isAltLine===false){
    const key=r.eventId||r.event+'|'+r.eventTime;
    if(!perGame.has(key)||Date.parse(r.recordedAt)>Date.parse(perGame.get(key).recordedAt))perGame.set(key,r);
  }
  const games=[...perGame.values()],weeks=[...new Set(games.map(r=>weekKey(r.eventTime)))].sort();
  const byWeek=Object.fromEntries(weeks.map(week=>{const a=games.filter(r=>weekKey(r.eventTime)===week);
    return [week,{games:a.length,lines:lineScores(a)}]}));
  const probabilities={};
  for(const kind of ['standard','alt'])for(const side of ['over','under']){
    const part=contracts.filter(r=>(r.isAltLine?'alt':'standard')===kind&&r.direction===side&&r.marketP>0&&r.marketP<1);
    probabilities[kind+'|'+side]=probabilityScores(part);
  }
  const lineResults=lineScores(games),enough=games.length>=50&&weeks.length>=4;
  const candidate=(name,baseline)=>{
    const weeksBetter=weeks.filter(w=>byWeek[w].lines[name].mae<byWeek[w].lines[baseline].mae).length;
    const probabilityBaseline=baseline==='market'?'quotedMarket':baseline;
    const brierBetter=['over','under'].every(side=>{
      const scores=probabilities['standard|'+side];
      return scores.contracts>=games.length/2&&scores.brier[name]<scores.brier[probabilityBaseline];
    });
    const lineBetter=lineResults[name].mae<lineResults[baseline].mae&&
      (name!=='halfForm'||lineResults[name].mae<lineResults.current.mae);
    return {status:enough&&lineBetter&&brierBetter&&weeksBetter>=Math.ceil(weeks.length*.75)?
      'review_for_promotion':'collect_more_unseen_weeks',baseline,weeksBetter,brierBetter};
  };
  return {games:games.length,weeks:weeks.length,checkpointCoverage,lines:lineResults,byWeek,probabilities,
    candidates:{halfForm:candidate('halfForm','market'),formOnly:candidate('formOnly','market'),
      weatherOnly:candidate('weatherOnly','market'),weatherAddedToForm:candidate('current','formOnly')},
    note:'All variants and feature timestamps were archived before kickoff. One latest standard Over threshold represents each game for MAE; ALT and opposite-side contracts are correlated, so their Brier counts are descriptive. A review flag requires at least 50 games across four unseen weeks, lower MAE in at least 75% of weeks, and better standard Over and Under Brier scores. No candidate automatically changes live selections.'};
}
module.exports={study,weekKey,eligible};
