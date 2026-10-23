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
 if(entries.length>=2)compareControls(host,s,entries,{sgp});
}
// All subsets are explicit tickets: never infer their book payout from reference legs.
function subsets(n){const out=[];if(n<2||n>4)return out;for(let mask=1;mask<(1<<n);mask++){const ids=Array.from({length:n},(_,i)=>i).filter(i=>mask&(1<<i));if(ids.length>=2)out.push(ids)}return out.sort((a,b)=>a.length-b.length||a.join('').localeCompare(b.join('')))}
function evaluateTicket(input,now=Date.now()){
 const result=decision(input,now);
 if(result.netEV==null)return result;
 const haircut=num(input.jointHaircut??.10),maxLoss=num(input.maxLoss??.90);
 if(haircut==null||haircut<0||haircut>=1||maxLoss==null||maxLoss<=0||maxLoss>=1)return {...result,status:'research',message:'Enter valid sensitivity and loss limits',netEV:undefined};
 const ps=input.checks.map(x=>Number(x.conservativeP)),lower=Math.max(0,ps.reduce((a,b)=>a+b,0)-(ps.length-1)),upper=Math.min(...ps);
 const stressedP=result.conservativeP*(1-haircut),stressedEV=stressedP*decimal(Number(input.odds))-1-Number(input.feesPerUnit||0),lossProbability=1-stressedP;
 const eligible=stressedEV>0&&lossProbability<=maxLoss;
 return {...result,stressedP,stressedEV,lossProbability,dependenceLower:lower,dependenceUpper:upper,dependenceFloorEV:lower*decimal(Number(input.odds))-1-Number(input.feesPerUnit||0),eligible,status:eligible?'paper_candidate':'pass',message:eligible?'Positive in the selected sensitivity scenario · Paper only':'Pass under the selected sensitivity or loss limit'};
}
function compareControls(host,s,entries,{sgp=false}={}){
 const d=document.createElement('details'),summary=document.createElement('summary');d.className='card-explanation ticket-comparison';summary.textContent='Compare 2–4-leg ticket value';d.append(summary);
 const note=document.createElement('p');note.textContent='Compare subsets of these displayed legs—not the whole market. Enter each exact combined sportsbook payout separately. Reference leg prices are not executable parlay offers. All results remain unvalidated paper estimates.';d.append(note);
 const choices=subsets(entries.length),offers=new Map(),labelEntry=e=>e.market.name||e.market.label||e.market.title||e.market.team||e.market.player||'Selection';
 const label=document.createElement('label'),select=document.createElement('select');label.textContent='Exact ticket to price';select.setAttribute('aria-label','Exact ticket to price');choices.forEach((ids,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=ids.length+' legs · '+ids.map(j=>labelEntry(entries[j])).join(' + ');select.append(o)});label.append(select);d.append(label);
 const field=(text,type,value)=>{const l=document.createElement('label'),i=document.createElement('input');l.textContent=text;i.type=type;i.value=value;i.setAttribute('aria-label',text);l.append(i);d.append(l);return i};
 const book=field('Comparison sportsbook','text','Caesars'),odds=field('Exact combined American odds','number',''),fees=field('Ticket fees per $1 stake','number','0'),haircut=field('Joint probability haircut % (sensitivity, not measured correlation)','number','10'),loss=field('Maximum scenario loss probability %','number','90'),exact=field('This subset and exact lines match the sportsbook offer','checkbox','');fees.step='.001';haircut.min='0';haircut.max='99';loss.min='1';loss.max='99';
 const check=document.createElement('button'),status=document.createElement('p'),results=document.createElement('div');check.type='button';check.textContent='Compare exact offer';status.setAttribute('role','status');
 const render=()=>{results.replaceChildren();const now=Date.now(),rows=[...offers.values()].map(o=>({...o,result:evaluateTicket({...o.input,jointHaircut:Number(haircut.value)/100,maxLoss:Number(loss.value)/100},now)})),ranked=rows.filter(o=>o.result.eligible&&o.result.status==='paper_candidate').sort((a,b)=>b.result.stressedEV-a.result.stressedEV||a.ids.length-b.ids.length);
  const lead=document.createElement('p');lead.textContent=ranked.length?'Highest scenario return among current entered offers: '+ranked[0].ids.length+' legs · '+ranked[0].ids.map(j=>labelEntry(entries[j])).join(' + ')+'. Not a verified profitable bet.':'No entered offer currently clears the selected limits. Pass is a valid outcome.';results.append(lead);
  for(const row of rows.sort((a,b)=>a.ids.length-b.ids.length)){const p=document.createElement('p'),r=row.result;p.textContent=row.ids.length+' legs · '+row.ids.map(j=>labelEntry(entries[j])).join(' + ')+' · '+row.input.book+' '+(Number(row.input.odds)>0?'+':'')+row.input.odds+' · '+r.message;
   if(r.stressedEV!=null)p.textContent+=' · Buffered independence EV '+(r.netEV*100).toFixed(1)+'% · Stressed EV '+(r.stressedEV*100).toFixed(1)+'% · Scenario loss '+(r.lossProbability*100).toFixed(1)+'% · Dependence-bound hit range '+(r.dependenceLower*100).toFixed(1)+'–'+(r.dependenceUpper*100).toFixed(1)+'% · Worst dependence-bound EV '+(r.dependenceFloorEV*100).toFixed(1)+'%';results.append(p);
   if(r.stressedEV!=null)window.PAPER_LEDGER?.controls(results,s,row.ids.map(j=>entries[j]),{mode:'multi',modelP:row.input.checks.every(c=>c.modelP>0&&c.modelP<1)?row.input.checks.reduce((v,c)=>v*c.modelP,1):null,method:'Product of leg estimates; assumes independence; unvalidated'});
  }
  const coverage=document.createElement('p');coverage.textContent=offers.size+' of '+choices.length+' subsets priced. Assumes separate games are independent before the sensitivity haircut; dependence bounds are not confidence intervals. The haircut is a user-selected stress test, not calibrated evidence. No staking recommendation.';results.append(coverage);
 };
 check.addEventListener('click',()=>{const ids=choices[Number(select.value)],selected=ids.map(i=>entries[i]),Q=window.PICK_QUALITY,at=Date.now();const descriptors=window.PAPER_LEDGER?.descriptors(s,selected)||[],keys=descriptors.map(x=>x.eventId),sameEvent=sgp||keys.some(k=>!k)||new Set(keys).size!==keys.length;
  const input={checks:selected.map(e=>Q.assess(s,e.market,e.forecast||{},{game:e.game,parlay:true})),book:book.value.trim(),odds:odds.value,feesPerUnit:fees.value,confirmedLines:exact.checked,quoteAt:new Date(at).toISOString(),sgp:sameEvent,eventTimes:selected.map(e=>e.game?.commence_time||Q.gameFor(s,e.market)?.commence_time||e.market.game_time||e.market.start_time||e.market.kickoff)};
  const r=evaluateTicket({...input,jointHaircut:Number(haircut.value)/100,maxLoss:Number(loss.value)/100},at);status.textContent=r.message;if(r.breakEven!=null){offers.set(select.value,{ids,input});render();window.setTimeout?.(render,QUOTE_TTL+10)}
 });
 select.addEventListener('change',()=>{odds.value='';exact.checked=false});for(const x of [haircut,loss])x.addEventListener('input',render);
 d.append(check,status,results);host.append(d);
}
return {ID,MODEL_VERSION,paperOnly:true,QUOTE_TTL,decision,controls,subsets,evaluateTicket};
});
