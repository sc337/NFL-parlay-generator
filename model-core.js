(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dec=o=>o>0?1+o/100:1+100/Math.abs(o);
const implied=o=>1/dec(o);
function ev(p,o){return p*(dec(o)-1)-(1-p)}
function confidence({coverage=.25,quality=60,uncertainty=.25,sample=0}={}){return Math.round(clamp(38+coverage*28+(quality-50)*.35-uncertainty*22+Math.min(10,Math.log10(sample+1)*3),0,99))}
function probability({marketP=.5,signal=0,coverage=.25,uncertainty=.25}={}){const p=clamp(marketP,.02,.98),logit=Math.log(p/(1-p)),trust=clamp(coverage*(1-uncertainty),.05,.85);return clamp(1/(1+Math.exp(-(logit+signal*trust))),.03,.97)}
function evaluate({marketP,odds,signal=0,coverage=.25,quality=60,uncertainty=.25,sample=0}={}){const modelP=probability({marketP,signal,coverage,uncertainty}),edge=modelP-marketP,price=Number.isFinite(+odds)?+odds:(marketP>=.5?-100*marketP/(1-marketP):100*(1-marketP)/marketP);return{marketP,modelP,edge,ev:ev(modelP,price),confidence:confidence({coverage,quality,uncertainty,sample}),quality,coverage,uncertainty,odds:price}}
function simulateBernoulli(p,n=4000){let w=0;for(let i=0;i<n;i++)if(Math.random()<p)w++;return w/n}
function parlay(legs,{correlation=0}={}){if(!legs.length)return null;let p=1,evSum=0,conf=0;for(const l of legs){p*=l.modelP;evSum+=l.ev;conf+=l.confidence}p=clamp(p*(1+clamp(correlation,-.25,.25)),.001,.999);return{modelP:p,simP:simulateBernoulli(p),confidence:Math.round(conf/legs.length),edgeEV:evSum/legs.length,correlation}}
const KEY='sportsModelLedgerV1';
function ledger(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
function record(x){const a=ledger(),id=x.id||[x.sport,x.market,x.event,x.selection].join('|');if(!a.some(y=>y.id===id)){a.push({...x,id,recordedAt:new Date().toISOString()});localStorage.setItem(KEY,JSON.stringify(a.slice(-2500)))}}
function metrics(){const a=ledger().filter(x=>x.result==='win'||x.result==='loss');if(!a.length)return{n:0};const n=a.length,w=a.filter(x=>x.result==='win').length,brier=a.reduce((s,x)=>s+(+x.modelP-(x.result==='win'?1:0))**2,0)/n;return{n,winRate:w/n,brier}}
window.MODEL_CORE={clamp,dec,implied,ev,confidence,probability,evaluate,simulateBernoulli,parlay,record,ledger,metrics};})();