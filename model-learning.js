// Shared browser/training math. Training is offline; the browser only applies
// dated, held-out rules for the exact model version.
(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.MODEL_LEARNING=api;})(()=>{'use strict';
const VERSION='learning-20261015',clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=v=>typeof v==='number'&&Number.isFinite(v),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{const x=[...a].sort((a,b)=>a-b);return x.length?(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2:null};
function roleChange(values){
 if(!Array.isArray(values)||values.length<5||values.some(x=>!finite(x)||x<0))return {status:'insufficient',ratio:null,sample:values?.length||0};
 const baseline=values.slice(0,-2),recent=values.slice(-2),base=mean(baseline),last=mean(recent),ratio=base>0?last/base:null;
 const noise=Math.max(1,1.4826*median(baseline.map(x=>Math.abs(x-median(baseline)))));
 const material=Math.abs(last-base)>=Math.max(base*.25,noise);
 const status=ratio==null?'insufficient':material&&ratio<.7?'falling':material&&ratio>1.3?'rising':'stable';
 return {status,ratio,baseline:base,recent:last,sample:values.length,projectionEligible:status==='stable'};
}
function opportunity(values,exposures,{conversion=null}={}){
 if(!Array.isArray(values)||!Array.isArray(exposures)||values.length!==exposures.length||values.length<5||values.some(x=>!finite(x))||exposures.some(x=>!finite(x)||x<0))return null;
 if(conversion&&(!Array.isArray(conversion)||conversion.length!==values.length||conversion.some((x,i)=>!finite(x)||x<0||x>exposures[i])))return null;
 const role=roleChange(exposures),total=exposures.reduce((s,x)=>s+x,0);if(!(total>0))return null;
 const recent=mean(exposures.slice(-2)),base=mean(exposures),projectedExposure=base*.6+recent*.4;
 const caught=conversion?conversion.reduce((s,x)=>s+x,0):null,efficiency=values.reduce((s,x)=>s+x,0)/(conversion?caught:total);
 if(!finite(efficiency))return null;
 const conversionRate=conversion?caught/total:1,projection=projectedExposure*conversionRate*efficiency;
 const avg=mean(values),sd=Math.sqrt(values.reduce((s,x)=>s+(x-avg)**2,0)/(values.length-1));
 return {projection,projectedExposure,conversionRate,efficiency,role,simpleMean:avg,sd,sample:values.length,
  method:conversion?'Projected targets × catch rate × yards per catch':'Projected opportunity × observed production per opportunity'};
}
function eventKey(r){return [r.sport||'',r.eventId||r.gameId||[r.event||r.ticker,r.eventTime||''].join('|')].join('|')}
function day(r){return String(r.eventTime||'').slice(0,10)}
function clean(rows,now=Date.now()){
 const seen=new Set();return rows.filter(r=>{
  const at=Date.parse(r.recordedAt),start=Date.parse(r.eventTime),settled=Date.parse(r.settledAt);
  if(!['win','loss'].includes(r.result)||!finite(r.modelP)||r.modelP<=0||r.modelP>=1||!finite(r.marketP)||r.marketP<=0||r.marketP>=1||!(at<start&&start<now&&settled>=start&&settled<=now)||r.snapshotAt&&!(Date.parse(r.snapshotAt)<start))return false;
  const id=r.id+'|'+(r.modelVersion||'legacy');if(seen.has(id))return false;seen.add(id);return true;
 }).sort((a,b)=>Date.parse(a.eventTime)-Date.parse(b.eventTime)||String(a.id).localeCompare(String(b.id)));
}
// Every event on a UTC date stays on one side of a split. Training outcomes
// must have settled before the first forecast in the validation window.
function split(rows,minTrain=60,minValidation=30){
 const dates=[...new Set(rows.map(day))].sort();
 for(let i=dates.length-1;i>0;i--){
  const validation=rows.filter(r=>day(r)>=dates[i]);if(new Set(validation.map(eventKey)).size<minValidation)continue;
  const heldOut=new Set(validation.map(eventKey)),before=Math.min(...validation.map(r=>Date.parse(r.recordedAt))),train=rows.filter(r=>!heldOut.has(eventKey(r))&&day(r)<dates[i]&&Date.parse(r.settledAt)<before);
  if(new Set(train.map(eventKey)).size>=minTrain)return {train,validation,cutoff:dates[i],trainedThrough:new Date(Math.max(...train.map(r=>Date.parse(r.settledAt)))).toISOString(),validationFrom:new Date(before).toISOString()};
 }
 return null;
}
function eventScore(rows,fn){const groups=new Map();for(const r of rows){const k=eventKey(r);if(!groups.has(k))groups.set(k,[]);const value=fn(r);if(finite(value))groups.get(k).push(value)}return mean([...groups.values()].filter(a=>a.length).map(mean))}
const brier=(p,y)=>(p-y)**2;
function compare(rows){
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r.baselines||{})))],result={};
 for(const key of keys){const paired=rows.filter(r=>finite(r.baselines?.[key])&&r.baselines[key]>0&&r.baselines[key]<1);
  result[key]={events:new Set(paired.map(eventKey)).size,rows:paired.length,modelBrier:eventScore(paired,r=>brier(r.modelP,r.result==='win'?1:0)),baselineBrier:eventScore(paired,r=>brier(r.baselines[key],r.result==='win'?1:0))};
 }
 return result;
}
function cdf(x){const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=1-d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>=0?p:1-p}
function quantile(p){let a=-7,b=7;for(let i=0;i<40;i++){const x=(a+b)/2;if(cdf(x)<p)a=x;else b=x}return(a+b)/2}
// Numerical integration of a Gaussian copula joint win probability. This is
// fitted from pregame probabilities and later binary outcomes, not postgame inputs.
function both(p,q,rho){if(Math.abs(rho)<1e-9)return p*q;const a=quantile(p),b=quantile(q),n=100,lo=-8,step=(a-lo)/n,sd=Math.sqrt(1-rho*rho);let sum=0;for(let i=0;i<=n;i++){const x=lo+i*step,v=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI)*cdf((b-rho*x)/sd);sum+=(i===0||i===n?1:i%2?4:2)*v}return clamp(sum*step/3,Math.max(0,p+q-1)+1e-8,Math.min(p,q)-1e-8)}
function pairKey(a,b){
 if(a.player&&a.player===b.player)return null;
 const family=r=>String(r.marketFamily||r.marketGroup||r.market||'').replace(/_alternate$/,'');
 const kinds=[family(a),family(b)];if(kinds.some(k=>!k))return null;
 const relation=a.team&&b.team?(a.team===b.team?'same-team':'opponents'):'game';
 return [family(a)+':'+(a.direction||'yes'),family(b)+':'+(b.direction||'yes')].sort().join('+')+'|'+relation;
}
function payload(){return typeof window!=='undefined'?window.MODEL_LEARNING_DATA:null}
function ready(rule,now=Date.now()){
 const d=payload(),at=Date.parse(d?.updated_at||'');return d?.modelVersion===VERSION&&Number.isFinite(at)&&at<=now&&now-at<7*86400000&&rule?.active===true&&rule.modelVersion===VERSION&&rule.trainingEvents>=60&&rule.validationEvents>=30&&Date.parse(rule.trainedThrough)<Date.parse(rule.validationFrom)&&Date.parse(rule.validationThrough)<now;
}
function learnedBuffer(s,group,p){
 const r=payload()?.sports?.[s]?.buffers?.[group];if(!ready(r))return null;
 const bin=r.bins?.find(b=>p>=b.lo&&p<b.hi&&b.events>=25);return bin&&finite(bin.buffer)?{buffer:clamp(bin.buffer,.015,.25),events:bin.events,method:'Held-out event calibration shortfall; selection buffer, not a confidence interval'}:null;
}
function correlation(s,a,b){const key=pairKey(a,b),r=payload()?.sports?.[s]?.pairs?.[key];return key&&ready(r)&&finite(r.rho)?{rho:r.rho,key,trainingEvents:r.trainingEvents,validationEvents:r.validationEvents}:null}
function baselineApproved(s,group){return ready(payload()?.sports?.[s]?.report?.groups?.[group]?.baselineGate)}
function describe(s){const x=payload()?.sports?.[s];return {version:VERSION,updatedAt:payload()?.updated_at||null,buffers:Object.values(x?.buffers||{}).filter(r=>ready(r)).length,pairs:Object.values(x?.pairs||{}).filter(r=>ready(r)).length,report:x?.report||null};}
return {VERSION,finite,mean,median,roleChange,opportunity,eventKey,day,clean,split,eventScore,compare,cdf,quantile,both,pairKey,ready,learnedBuffer,correlation,baselineApproved,describe};
});
