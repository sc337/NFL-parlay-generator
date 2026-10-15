// Chronological, game-clustered fitting. Never backfill a missing historical
// feature or infer when an outcome became available from its kickoff time.
const fs=require('node:fs'),path=require('node:path'),L=require('../model-learning');
const root=path.resolve(__dirname,'..'),round=x=>x==null?null:+x.toFixed(6);
function dedupEvents(rows){const seen=new Set();return rows.filter(r=>{const k=L.eventKey(r);if(seen.has(k))return false;seen.add(k);return true})}
function fitBuffer(rows){
 const split=L.split(rows),empty={active:false,modelVersion:L.VERSION,trainingEvents:0,validationEvents:0,reason:'Need 60 earlier and 30 later settled events, with pregame versioned forecasts'};
 if(!split)return empty;
 const {train,validation}=split,base=dedupEvents(train),bins=[];
 for(let lo=0;lo<1;lo+=.1){const part=base.filter(r=>r.modelP>=lo-1e-8&&r.modelP<lo+.1-1e-8);if(part.length<25)continue;
  const p=L.mean(part.map(r=>r.modelP)),win=L.mean(part.map(r=>r.result==='win'?1:0)),n=part.length,z=1.64;
  const lower=(win+z*z/(2*n)-z*Math.sqrt(win*(1-win)/n+z*z/(4*n*n)))/(1+z*z/n);
  bins.push({lo:round(lo),hi:round(lo+.1),events:n,buffer:round(Math.max(.015,p-lower)),predicted:round(p),observed:round(win)});
 }
 const score=L.eventScore(validation,r=>(r.modelP-(r.result==='win'?1:0))**2),market=L.eventScore(validation,r=>(r.marketP-(r.result==='win'?1:0))**2);
 const covered=dedupEvents(validation).filter(r=>bins.some(b=>r.modelP>=b.lo&&r.modelP<b.hi));
 const simple=L.compare(validation).simpleMean,beatsSimple=!simple||simple.events<30||simple.modelBrier<=simple.baselineBrier;
 const active=bins.length>0&&covered.length>=25&&score<=market-.002&&beatsSimple;
 return {...empty,active,trainingEvents:new Set(train.map(L.eventKey)).size,validationEvents:new Set(validation.map(L.eventKey)).size,
  trainedThrough:split.trainedThrough,validationFrom:split.validationFrom,validationThrough:validation.at(-1).eventTime,
  bins,validationBrier:round(score),marketBrier:round(market),reason:active?'Later event forecasts beat market baseline; empirical selection buffers enabled':'Later evidence insufficient or baseline not improved'};
}
function pairs(rows){
 const events=new Map(),out=new Map();
 // One representative line per subject/market/direction/event prevents ladders
 // from turning a single game into hundreds of apparent observations.
 for(const r of rows){if(!r.marketFamily||!r.direction||!r.modelVersion)continue;const k=L.eventKey(r);if(!events.has(k))events.set(k,new Map());const sub=[r.player||r.team||'game',r.marketFamily,r.direction].join('|'),group=events.get(k),old=group.get(sub);
  if(!old||Math.abs(r.marketP-.5)<Math.abs(old.marketP-.5)||Math.abs(r.marketP-.5)===Math.abs(old.marketP-.5)&&r.id<old.id)group.set(sub,r);
 }
 for(const group of events.values()){const entries=[...group.values()],selected=new Map();for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j],key=L.pairKey(a,b);if(!key)continue;
  const distance=Math.abs(a.marketP-.5)+Math.abs(b.marketP-.5),old=selected.get(key);if(old&&old.distance<=distance)continue;
  selected.set(key,{a,b,distance,id:a.id+'+'+b.id,sport:a.sport,eventId:a.eventId,event:a.event,eventTime:a.eventTime,recordedAt:new Date(Math.min(Date.parse(a.recordedAt),Date.parse(b.recordedAt))).toISOString(),settledAt:new Date(Math.max(Date.parse(a.settledAt),Date.parse(b.settledAt))).toISOString()});
 }for(const [key,row] of selected){if(!out.has(key))out.set(key,[]);out.get(key).push(row)}}
 return out;
}
function pairLoss(row,rho){const {a,b}=row,p=a.modelP,q=b.modelP,both=L.both(p,q,rho),aw=a.result==='win',bw=b.result==='win';const probability=aw&&bw?both:aw?p-both:bw?q-both:1-p-q+both;return -Math.log(Math.max(1e-8,probability))}
function fitPair(rows){
 const empty={active:false,modelVersion:L.VERSION,trainingEvents:0,validationEvents:0,reason:'Need 60 earlier and 30 later paired game outcomes'};
 const split=L.split(rows);if(!split)return empty;
 const grid=[-.6,-.45,-.3,-.15,0,.15,.3,.45,.6];
 const trained=grid.map(rho=>({rho,loss:L.eventScore(split.train,r=>pairLoss(r,rho))})).sort((a,b)=>a.loss-b.loss||Math.abs(a.rho)-Math.abs(b.rho))[0];
 const loss=L.eventScore(split.validation,r=>pairLoss(r,trained.rho)),independent=L.eventScore(split.validation,r=>pairLoss(r,0));
 return {...empty,active:loss<independent-.005,rho:trained.rho,trainingEvents:new Set(split.train.map(L.eventKey)).size,validationEvents:new Set(split.validation.map(L.eventKey)).size,
  trainedThrough:split.trainedThrough,validationFrom:split.validationFrom,validationThrough:split.validation.at(-1).eventTime,validationLogLoss:round(loss),independenceLogLoss:round(independent),
  reason:loss<independent-.005?'Held-out pair likelihood improved; full SGP remains unvalidated':'Dependence did not beat independence on later events'};
}
function walkForward(rows){
 const dates=[...new Set(rows.map(L.day))].sort(),folds=[];if(dates.length<6)return folds;
 for(const fraction of [.5,.67,.83]){
  const from=dates[Math.floor(dates.length*fraction)],through=dates[Math.min(dates.length-1,Math.floor(dates.length*(fraction+.16)))];
  const validation=rows.filter(r=>L.day(r)>=from&&L.day(r)<=through),heldOut=new Set(validation.map(L.eventKey)),before=Math.min(...validation.map(r=>Date.parse(r.recordedAt))),train=rows.filter(r=>!heldOut.has(L.eventKey(r))&&L.day(r)<from&&Date.parse(r.settledAt)<before);
  if(new Set(train.map(L.eventKey)).size<30||new Set(validation.map(L.eventKey)).size<10)continue;
  folds.push({trainingEvents:new Set(train.map(L.eventKey)).size,validationEvents:new Set(validation.map(L.eventKey)).size,trainedThrough:new Date(Math.max(...train.map(r=>Date.parse(r.settledAt)))).toISOString(),validationFrom:from,validationThrough:through,comparisons:L.compare(validation)});
 }
 return folds;
}
function baselineGate(rows){const split=L.split(rows);if(!split)return {active:false,modelVersion:L.VERSION,reason:'Collecting 60 earlier and 30 later events'};
 const comparisons=L.compare(split.validation),usable=Object.entries(comparisons).filter(([,c])=>c.events>=30),hasSimple=usable.some(([k])=>k!=='market');
 return {active:hasSimple&&usable.every(([,c])=>c.modelBrier<=c.baselineBrier-.002),modelVersion:L.VERSION,
  trainingEvents:new Set(split.train.map(L.eventKey)).size,validationEvents:new Set(split.validation.map(L.eventKey)).size,
  trainedThrough:split.trainedThrough,validationFrom:split.validationFrom,validationThrough:split.validation.at(-1).eventTime,comparisons,
  reason:'Validated status requires later-event Brier improvement over market and available simple/ablation baselines'};
}
function build(rows,now=Date.now()){
 const cleaned=L.clean(rows,now).filter(r=>r.modelVersion===L.VERSION),sports={};
 for(const sport of ['mlb','nba','ncaaf','nfl','nhl','ufc']){
  const selected=cleaned.filter(r=>r.sport===sport),buffers={},dependence={},groups={};
  for(const family of new Set(selected.map(r=>r.marketGroup).filter(Boolean))){const rows=selected.filter(r=>r.marketGroup===family);buffers[family]=fitBuffer(rows);groups[family]={baselineGate:baselineGate(rows),walkForward:walkForward(rows)}}
  if(sport==='nfl')for(const [key,part] of pairs(selected))dependence[key]=fitPair(part);
  sports[sport]={buffers,pairs:dependence,report:{groups,recordedVersionedOutcomes:selected.length,distinctEvents:new Set(selected.map(L.eventKey)).size,comparisons:L.compare(selected),walkForward:walkForward(selected),status:selected.length?'Collecting chronological evidence':'Waiting for settled forecasts from this model version'}};
 }
 return {schemaVersion:1,modelVersion:L.VERSION,updated_at:new Date(now).toISOString(),method:'Versioned pregame forecasts only; outcome availability enforced; whole events and UTC dates separated; event-weighted scores',sports};
}
function main(){const target=path.join(root,'data/model-learning.js'),audit=path.join(root,'data/forecast-audit.json'),rows=fs.existsSync(audit)?JSON.parse(fs.readFileSync(audit,'utf8')).records||[]:[],data=build(rows);fs.writeFileSync(target,'window.MODEL_LEARNING_DATA='+JSON.stringify(data)+';\n');console.log('Learning rules:',Object.entries(data.sports).map(([s,x])=>s+' '+x.report.distinctEvents+' versioned events').join('; '));}
if(require.main===module)main();
module.exports={fitBuffer,pairs,fitPair,walkForward,baselineGate,build,pairLoss};
