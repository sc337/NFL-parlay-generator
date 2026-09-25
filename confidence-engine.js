(()=>{'use strict';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const implied=o=>o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);
const over=m=>m?.side==='over'||/\bOver\b/i.test(m?.name||'');
function family(m){const k=m?.marketKey||'';if(k==='player_rush_attempts')return'rush attempts';if(k==='player_receptions')return'receptions';if(k==='player_pass_attempts')return'pass attempts';if(k==='player_pass_completions')return'completions';if(k==='player_rush_yds')return'rush yards';if(k==='player_reception_yds')return'receiving yards';if(k==='player_pass_yds')return'passing yards';if(m?.type==='td')return'anytime TD';return m?.type||'other'}
function context(m){const f=[],ctx=m?.gameContext||{},sig=m?.contextSignals||{};let d=0,cap=100;
 if(m?.player){const st=String(sig.injury_status||'none').toLowerCase();if(/out|injured reserve|ir\b/.test(st)){d-=30;cap=68;f.push('out/IR')}else if(/doubtful/.test(st)){d-=18;cap=74;f.push('doubtful')}else if(/questionable|game-time|gtd/.test(st)){d-=10;cap=82;f.push('questionable')};const b=Number(sig.market_breadth)||0;if(b>=3){d+=2;f.push('stable role')}else if(b===1){d-=5;f.push('thin role')}}
 const fam=family(m),w=ctx.weather||{};if(w.available&&w.indoor!==true){const wind=Number(w.wind_mph);if(wind>=20&&over(m)&&['passing yards','receiving yards','pass attempts','completions'].includes(fam)){d-=8;f.push('high wind')}else if(wind>=15&&over(m)&&['passing yards','receiving yards'].includes(fam)){d-=4;f.push('wind')}}
 const age=Number(m.snapshotAgeMinutes??m.dataAgeMinutes);if(age>120){d-=14;cap=Math.min(cap,78);f.push('stale data')}else if(age>60){d-=8;cap=Math.min(cap,84);f.push('aging data')}else if(age>30)d-=3;
 return{delta:d,cap,factors:f}}
function signalAgreement(m){
 const probs=[];for(const k of ['kalshiProbability','polymarketProbability','sportsbookProbability','marketProbability','quoteProbability']){const v=Number(m?.[k]);if(Number.isFinite(v)&&v>0&&v<1)probs.push(v)}
 const model=Number(m?.modelProbability);if(Number.isFinite(model)&&model>0&&model<1)probs.push(model);
 if(probs.length<2)return{score:55,count:probs.length,spread:null};
 const mean=probs.reduce((a,b)=>a+b,0)/probs.length,spread=Math.sqrt(probs.reduce((s,p)=>s+(p-mean)**2,0)/probs.length);
 return{score:clamp(100-spread*500,35,100),count:probs.length,spread}}
function score(m){if(!m||!Number.isFinite(Number(m.price)))return 0;
 const q=clamp(Number(m.sourceQuality)||60),a=signalAgreement(m),ctx=context(m);
 const modelConf=Number(m.modelConfidence),coverage=clamp(Number(m.projectionCoverage??m.coverage)||0,0,1),unc=clamp(Number(m.modelUncertainty??m.uncertainty)||.35,0,1);
 const ev=Number(m.modelEV),edge=Number(m.modelEdge),hasModel=Number.isFinite(modelConf)&&Number.isFinite(ev);
 let statistical=hasModel?clamp(modelConf):clamp(45+coverage*35-unc*20);
 let market=a.score;
 let edgeScore=50;if(Number.isFinite(ev))edgeScore=clamp(50+ev*260,20,95);else if(Number.isFinite(edge))edgeScore=clamp(50+edge*300,20,95);
 let freshness=q;
 let stability=clamp(72+(Number(m.roleStability)||.6)*18-unc*18);
 let s=statistical*.35+market*.25+edgeScore*.20+freshness*.10+stability*.10+ctx.delta;
 if(m.player&&!m._rosterVerified&&!m._serverRosterVerified)s-=5;
 if(m._invalidRoster===true)return 0;
 if(hasModel&&ev<=0)s=Math.min(s,72);
 if(hasModel&&edge<=0)s=Math.min(s,74);
 if(coverage>0&&coverage<.20)s=Math.min(s,79);
 if(a.count>=2&&a.score<65)s=Math.min(s,78);
 if(m.type==='td')s-=4;
 const ip=implied(Number(m.price));if(ip>.78||ip<.30)s-=4;
 return Math.round(Math.min(ctx.cap,clamp(s)))}
const grade=s=>s>=92?'A+':s>=88?'A':s>=84?'A-':s>=80?'B+':s>=76?'B':'PASS';
function decorate(){try{for(const g of state.games||[])for(const m of g.markets||[]){m.gameContext=g.context||null;m.confidenceScore=score(m);m.confidence=m.confidenceScore;m.propFamily=family(m)}}catch{}}
let t=null;const start=()=>{decorate();new MutationObserver(()=>{clearTimeout(t);t=setTimeout(decorate,80)}).observe(document.body,{childList:true,subtree:true})};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
window.NFL_CONFIDENCE={score,grade,eligible:(m,k='straight')=>score(m)>=(k==='prop'?80:80),explain:m=>{const c=context(m),a=signalAgreement(m);return{score:score(m),grade:grade(score(m)),contextFactors:c.factors,contextDelta:c.delta,marketFamily:family(m),signalAgreement:Math.round(a.score),signalCount:a.count,signalSpread:a.spread}},family,refresh:decorate};})();