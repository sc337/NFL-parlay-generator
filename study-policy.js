// A prospective paper study. This release never promotes a candidate to a
// real-money instruction, including when an entered price clears its buffer.
(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.STUDY_POLICY=api;})(()=>{'use strict';
const ID='forward-20261022-v1',MODEL_VERSION='learning-20261022',QUOTE_TTL=5*60000;
const num=x=>x!==null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const validOdds=x=>Number.isInteger(num(x))&&Math.abs(Number(x))>=100&&Math.abs(Number(x))<=100000;
const decimal=o=>o>0?1+o/100:1+100/Math.abs(o);
function decision({checks=[],book,odds,quoteAt,feesPerUnit=0,confirmedLines=false,sgp=false,eventTimes=[]},now=Date.now()){
 const base={actionable:false,studyId:ID,modelVersion:MODEL_VERSION,paperOnly:true};
 if(!String(book||'').trim()||!validOdds(odds)||!confirmedLines)return {...base,status:'price_required',message:'Exact sportsbook, odds and matching lines required'};
 const age=now-Date.parse(quoteAt),fees=num(feesPerUnit);
 if(!Number.isFinite(age)||age<0||age>QUOTE_TTL)return {...base,status:'price_required',message:'Price check expired; enter a fresh exact offer'};
 if(fees===null||fees<0||fees>1)return {...base,status:'price_required',message:'Enter fees per $1 stake, including zero if none'};
 if(!eventTimes.length||eventTimes.some(t=>!(Date.parse(t)>now))||!checks.length||checks.some(x=>!x?.dataPass))return {...base,status:'pass',message:'Pass · Data, availability or event checks failed'};
 const breakEven=(1+fees)/decimal(Number(odds));
 if(sgp)return {...base,status:'research',breakEven,message:'Paper research only · SGP correlation and price edge unvalidated'};
 const probabilities=checks.map(x=>num(x.conservativeP));
 if(probabilities.some(p=>!(p>0&&p<1)))return {...base,status:'research',breakEven,message:'Paper research only · Supported probability unavailable'};
 const conservativeP=probabilities.reduce((p,x)=>p*x,1),netEV=conservativeP*decimal(Number(odds))-1-fees;
 return {...base,breakEven,conservativeP,netEV,status:netEV>0?'paper_candidate':'pass',message:netEV>0?'Paper candidate at this price · Edge unvalidated':'Pass · This price does not clear the selection buffer and fees'};
}
function controls(host,s,entries,{sgp=false}={}){
 if(typeof document==='undefined'||!host?.appendChild)return;
 const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Exact sportsbook price check';detail.className='card-explanation';detail.append(summary);
 const field=(labelText,type,value)=>{const label=document.createElement('label'),input=document.createElement('input');label.textContent=labelText;input.type=type;input.value=value;input.setAttribute('aria-label',labelText);label.append(input);detail.append(label);return input};
 const book=field('Sportsbook','text','Caesars'),odds=field('Exact American odds','number',''),fees=field('Fees per $1 stake (0 if none)','number','0');fees.step='.001';
 const exact=field('Exact selections, lines and offer terms match','checkbox','');
 const button=document.createElement('button'),status=document.createElement('p');button.type='button';button.textContent='Check exact price';status.setAttribute('role','status');status.textContent='Paper study · Exact sportsbook price required';
 button.addEventListener('click',()=>{
  const Q=window.PICK_QUALITY,checks=entries.map(e=>Q.assess(s,e.market,e.forecast||{},{game:e.game,parlay:entries.length>1})),at=Date.now();
  const result=decision({checks,book:book.value,odds:odds.value,feesPerUnit:fees.value,confirmedLines:exact.checked,sgp,quoteAt:new Date(at).toISOString(),eventTimes:entries.map(e=>e.game?.commence_time||Q.gameFor(s,e.market)?.commence_time||e.market.game_time||e.market.start_time||e.market.kickoff)},at);
  status.textContent=result.message+(result.breakEven!=null?' · Break-even '+(result.breakEven*100).toFixed(1)+'%':'');status.dataset.checkedAt=String(at);
  window.setTimeout?.(()=>{if(status.isConnected&&status.dataset.checkedAt===String(at))status.textContent='Price check expired · Recheck the exact sportsbook offer'},QUOTE_TTL);
 });
 detail.append(button,status);host.appendChild(detail);
}
return {ID,MODEL_VERSION,paperOnly:true,QUOTE_TTL,decision,controls};
});
