// Transparent experimental SGP scenarios. Dependence loadings are assumptions,
// not fitted correlations. Never promote scenario EV to validated betting value.
(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),cache=new Map(),TRIALS=8000;
const finite=x=>x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
function hash(s){let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return n>>>0}
function rng(seed){let n=seed||1;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return ((n>>>0)+.5)/4294967296}}
function normal(r){return Math.sqrt(-2*Math.log(r()))*Math.cos(2*Math.PI*r())}
function cdf(x){const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=1-d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>=0?p:1-p}
function quantile(p){let a=-7,b=7;for(let i=0;i<45;i++){const x=(a+b)/2;if(cdf(x)<p)a=x;else b=x}return(a+b)/2}
function signature(s,entries){return s+'|'+entries.map(e=>window.PICK_QUALITY.id(s,e.market)).sort().join('|')}
function profile(p){return p>=.30?'Conservative':p>=.15?'Balanced':'Lotto'}
function vector(e){
 const m=e.market,g=e.game||window.PICK_QUALITY.gameFor('nfl',m)||{},team=m.team;
 const type=m.type,under=m.side==='under',sign=under?-1:1;
 if(type==='totals')return {pace:.6,awayScore:.4,homeScore:.4,sign};
 if(type==='h2h'||type==='spreads'){
  if(!team||![g.away,g.home].includes(team))return null;
  return {homeScore:team===g.home?.7:-.7,awayScore:team===g.away?.7:-.7,sign:1};
 }
 if(!m.player||!team||![g.away,g.home].includes(team))return null;
 const supported=['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds','player_anytime_td'];
 if(!supported.includes(String(m.marketKey||'').replace(/_alternate$/,'')))return null;
 const own=team===g.home?'home':'away',other=own==='home'?'away':'home';
 const v={pace:.25,sign};
 if(type==='rushing'){
  v[own+'Rush']=.55;v[own+'Score']=.22;v[other+'Score']=-.22;
 }else if(['passing','receiving','receptions'].includes(type)){
  v[own+'Pass']=.55;v[own+'Score']=.2;v[other+'Score']=.15;
 }else if(type==='td'){v[own+'Score']=.5;v[own+'Pass']=.25}
 else return null;
 v['player:'+m.player]=.35;return v;
}
function fittedMatrix(entries){
 const L=window.MODEL_LEARNING;if(!L)return null;
 const describe=e=>({marketFamily:String(e.market.marketKey||e.market.type).replace(/_alternate$/,''),player:e.market.player,team:e.market.team,
  direction:e.market.side==='under'?'under':e.market.side==='over'?'over':e.market.quoteSide||e.market.side||'yes'});
 const matrix=entries.map((_,i)=>entries.map((_,j)=>i===j?1:0)),rules=[];
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const rule=L.correlation('nfl',describe(entries[i]),describe(entries[j]));if(!rule)return null;
  matrix[i][j]=matrix[j][i]=rule.rho;rules.push(rule);
 }
 return {matrix,rules};
}
function cholesky(matrix){const n=matrix.length,out=matrix.map(()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let sum=matrix[i][j];for(let k=0;k<j;k++)sum-=out[i][k]*out[j][k];if(i===j){if(sum<=1e-8)return null;out[i][j]=Math.sqrt(sum)}else out[i][j]=sum/out[j][j]}return out}
function scenarios(entries,checks){
 const vectors=entries.map(vector);if(vectors.some(v=>!v))return null;
 const ps=checks.map(q=>q.modelP),thresholds=ps.map(p=>quantile(1-p));
 const fitted=fittedMatrix(entries);
 const key=JSON.stringify([entries.map(e=>window.PICK_QUALITY.id('nfl',e.market)),ps,fitted?.matrix]);
 if(cache.has(key))return cache.get(key);
 const factors=[...new Set(vectors.flatMap(v=>Object.keys(v).filter(k=>k!=='sign')))];
 const outcomes=[];
 for(const scale of [.65,1,1.25]){
  const random=rng(hash(key)),scales=vectors.map(v=>{const variance=Object.entries(v).filter(([k])=>k!=='sign').reduce((s,[,x])=>s+x*x,0);return Math.min(scale,Math.sqrt(.95/variance))}),norms=vectors.map((v,i)=>Math.sqrt(1-Object.entries(v).filter(([k])=>k!=='sign').reduce((s,[,x])=>s+(x*scales[i])**2,0)));
  let wins=0,chol=null;
  if(fitted)for(const shrink of [1,.8,.6,.4,0]){chol=cholesky(fitted.matrix.map((row,i)=>row.map((v,j)=>i===j?1:clamp(v*scale*shrink,-.85,.85))));if(chol)break}
  for(let trial=0;trial<TRIALS;trial++){
   if(chol){const independent=entries.map(()=>normal(random));if(chol.every((row,i)=>row.reduce((sum,v,j)=>sum+v*independent[j],0)>thresholds[i]))wins++;continue;}
   const z=Object.fromEntries(factors.map(k=>[k,normal(random)]));let success=true;
   // Draw every leg even after a miss so sensitivity scenarios share randomness.
   vectors.forEach((v,i)=>{let shared=0;for(const [k,w] of Object.entries(v))if(k!=='sign')shared+=w*scales[i]*z[k];const value=(shared+norms[i]*normal(random))*v.sign;if(value<=thresholds[i])success=false});
   if(success)wins++;
  }
  outcomes.push(wins/TRIALS);
 }
 const result={modelP:outcomes[1],sensitivity:[Math.min(...outcomes),Math.max(...outcomes)],trials:TRIALS*3,validated:false,empiricalPairs:fitted?.rules.length||0,
  method:fitted?'Held-out historical pair correlations; positive-definite shrinkage as needed; full SGP unvalidated':'Shared pace, team scoring, passing/rushing and player factors; assumed dependence; historical pairs collecting',version:'sgp-scenarios-v2'};
 if(cache.size>64)cache.clear();cache.set(key,result);return result;
}
function summarize(s,entries,{sgp=false,offer=null,checkedAt=null}={}){
 const Q=window.PICK_QUALITY,gate=Q.checkBuild(s,entries,sgp);
 if(!gate.pass)return {pass:false,reason:gate.reason};
 const checks=gate.checks,independent=!sgp,scenario=sgp&&s==='nfl'?scenarios(entries,checks):null;
 const modelP=independent?checks.reduce((p,x)=>p*x.modelP,1):scenario?.modelP??null;
 const conservativeP=independent?checks.reduce((p,x)=>p*x.conservativeP,1):null;
 const bounds=Q.joint(checks),at=Date.parse(checkedAt||'');
 const freshOffer=Q.odds(offer)&&Number.isFinite(at)&&at<=Date.now()+60000&&Date.now()-at<=15*60000;
 const breakEven=freshOffer?Q.implied(offer):null;
 const valueVerified=independent&&freshOffer&&checks.every(x=>x.valueQualified)&&conservativeP>breakEven;
 let priceStatus='Enter current combined odds';
 if(freshOffer)priceStatus=sgp?'SGP value unverified':conservativeP>breakEven?'Clears selection buffer; value unverified':'Price does not clear selection buffer';
 if(valueVerified)priceStatus='Qualified at entered combined price';
 return {pass:true,modelP,conservativeP,bounds,scenario,profile:modelP==null?'Unrated':profile(modelP),breakEven,valueVerified,priceStatus,
  method:sgp?(scenario?'Experimental shared-game scenarios':'Joint model unavailable'):'Product of leg estimates; assumes independence',
  minimumOdds:conservativeP>0?Math.round(conservativeP>=.5?-100*conservativeP/(1-conservativeP):100*(1-conservativeP)/conservativeP):null,
  warning:sgp?(scenario?.empiricalPairs?'Historical pair relationships; full SGP remains unvalidated. ':'Assumed correlations; historical pair evidence collecting. ')+'Sensitivity range is not a confidence interval. No validated SGP edge.':'Separate games do not guarantee independence. Combined forecast is unvalidated.',checks};
}
// Details stay collapsed to preserve the compact phone layout. Entered prices
// belong to this exact rendered build; they never overwrite any feed quote.
function attach(host,s,entries,options={}){
 if(!host?.appendChild||typeof document==='undefined')return;
 const risk=summarize(s,entries,options);if(!risk.pass)return;
 const detail=document.createElement('details');detail.className='card-explanation parlay-risk';
 const summary=document.createElement('summary');summary.textContent='Risk & price check';
 const text=document.createElement('p'),status=document.createElement('p');
 const format=o=>(o>0?'+':'')+o;
 text.textContent=(risk.modelP==null?'Joint likelihood unavailable':'Estimated hit chance '+Math.round(risk.modelP*100)+'% · '+risk.profile+' risk')+' · '+risk.method+'. '+risk.warning+(risk.scenario?' Sensitivity '+risk.scenario.sensitivity.map(p=>Math.round(p*100)+'%').join('–')+' across '+risk.scenario.trials.toLocaleString()+' trials.':'')+(risk.minimumOdds!=null?' Needs better than '+format(risk.minimumOdds)+' at these exact lines.':'');
 const label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button');
 label.textContent='Current combined sportsbook odds';input.type='number';input.inputMode='decimal';input.placeholder='+400';input.setAttribute('aria-label','Current combined sportsbook American odds');button.type='button';button.textContent='Check price';
 button.addEventListener('click',()=>{const odds=finite(input.value);if(!window.PICK_QUALITY.odds(odds)){status.textContent='Enter valid American odds, such as +400 or -110.';return}const checkedAt=new Date().toISOString(),result=summarize(s,entries,{...options,offer:odds,checkedAt});status.textContent=result.pass?result.priceStatus+' · Break-even '+(result.breakEven*100).toFixed(1)+'%. Price check expires in 15 minutes; verify the same selections and lines.':result.reason;status.dataset.checkedAt=checkedAt;window.setTimeout?.(()=>{if(status.isConnected&&status.dataset.checkedAt===checkedAt)status.textContent='Price check expired. Recheck current combined odds.'},15*60000);});
 label.appendChild(input);detail.append(summary,text,label,button,status);
 window.PAPER_LEDGER?.controls(detail,s,entries,{mode:options.sgp?'sgp':'multi',modelP:risk.modelP,method:risk.method});host.appendChild(detail);
}
window.PARLAY_RISK={summarize,scenarios,signature,profile,attach,TRIALS};
})();
