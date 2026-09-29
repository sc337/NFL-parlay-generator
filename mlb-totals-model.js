(()=>{'use strict';
const TRIALS=20000,clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
let cachedContext=null,draws=new Map();
function random(seed){let state=seed>>>0||1;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}}
function hash(value){let n=2166136261;for(const c of String(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return n>>>0}
function normal(rng){const a=Math.max(rng(),1e-12),b=rng();return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b)}
function poisson(mean,rng){let product=1,number=0,cutoff=Math.exp(-mean);do{number++;product*=Math.max(rng(),1e-12)}while(product>cutoff);return number-1}
function scoring(g,context){
 const league=context.scoring?.league,teams=context.scoring?.teams||{},away=teams[String(g.awayId)],home=teams[String(g.homeId)];
 const avg=Number(league?.runs_per_team);
 if(!Number.isFinite(avg)||avg<2||avg>7||Number(league.games)<30||!away||!home||Math.min(away.games,home.games)<8)return null;
 const avgFor=t=>(Number(t.runs_for)+12*avg)/(Number(t.games)+12);
 const avgAgainst=t=>(Number(t.runs_against)+12*avg)/(Number(t.games)+12);
 if(![away,home].every(t=>Number.isFinite(+t.runs_for)&&Number.isFinite(+t.runs_against)&&Number.isFinite(+t.games)&&t.games>=8))return null;
 const pitcher=side=>{const id=g[side+'Probable']?.id,p=context.pitchers?.[String(id)],era=Number(p?.era),ip=Number(p?.innings);return Number.isFinite(era)&&era>=1&&era<=9&&ip>=20?clamp(era/avg,.65,1.45):1};
 const awayMean=clamp(avg*Math.pow(avgFor(away)/avg,.6)*Math.pow(avgAgainst(home)/avg,.3)*Math.pow(pitcher('home'),.1)*.98,1.2,9);
 const homeMean=clamp(avg*Math.pow(avgFor(home)/avg,.6)*Math.pow(avgAgainst(away)/avg,.3)*Math.pow(pitcher('away'),.1)*1.02,1.2,9);
 const hasPitchers=pitcher('home')!==1&&pitcher('away')!==1;
 const coverage=clamp(.40+.16*Math.min(away.games,home.games)/25+(hasPitchers?.08:0),.40,.64);
 return {awayMean,homeMean,coverage};
}
function samples(g,context){
 if(context!==cachedContext){cachedContext=context;draws=new Map()}
 const key=String(g.gamePk);if(draws.has(key))return draws.get(key);
 const means=scoring(g,context);if(!means)return null;
 const rng=random(hash(key+'|'+context.updated_at+'|'+context.scoring.as_of)),totals=[],away=[],home=[];
 for(let i=0;i<TRIALS;i++){
  const shared=Math.exp(.18*normal(rng)-.0162);
  const a=poisson(means.awayMean*shared*Math.exp(.12*normal(rng)-.0072),rng);
  const h=poisson(means.homeMean*shared*Math.exp(.12*normal(rng)-.0072),rng);
  away.push(a);home.push(h);totals.push(a+h);
 }
 const mean=x=>x.reduce((sum,n)=>sum+n,0)/x.length,ordered=[...totals].sort((a,b)=>a-b);
 const result={totals,away,home,projectedTotal:mean(totals),awayRuns:mean(away),homeRuns:mean(home),range:[ordered[Math.floor(TRIALS*.10)],ordered[Math.floor(TRIALS*.90)]],coverage:means.coverage,trials:TRIALS};
 draws.set(key,result);return result;
}
function selection(m,g){
 const title=String(m.title||m.label||'').trim();
 let match=title.match(/^(Over|Under) (\d+(?:\.\d+)?) runs(?: scored)?$/i),team=null;
 if(!match){
  const named=title.match(/^Will (.+?) score (over|under) (\d+(?:\.\d+)?) runs\?$/i);
  if(!named)return null;
  const key=named[1].toLowerCase(),matches=['away','home'].filter(side=>String(g[side]||'').toLowerCase().startsWith(key));
  if(matches.length!==1)return null;team=matches[0];match=[named[0],named[2],named[3]];
 }
 const line=Number(match[2]);
 // Half-run lines have no push; integer lines need different settlement logic.
 if(!Number.isFinite(line)||line<.5||line>25||Math.abs(line%1-.5)>.001)return null;
 return {team,side:match[1].toLowerCase(),line};
}
function estimate(m,context){
 if(m?.kind!=='total'||!context?.scoring||!m.game_id)return null;
 const timestamp=Date.parse(context.updated_at||''),start=Date.parse(m.game_time||'');
 if(!Number.isFinite(timestamp)||!Number.isFinite(start)||timestamp>start||start<=Date.now()||Date.now()-timestamp>24*3600000)return null;
 const g=(context.games||[]).find(row=>String(row.gamePk)===String(m.game_id));
 if(!g||g.status==='Final'||Math.abs(Date.parse(g.gameDate||'')-start)>6*3600000)return null;
 const target=selection(m,g);if(!target)return null;
 const sim=samples(g,context);if(!sim)return null;
 const arr=target.team?sim[target.team]:sim.totals;
 const wins=arr.reduce((n,runs)=>n+(target.side==='over'?runs>target.line:runs<target.line),0);
 return {modelP:clamp(wins/TRIALS,.01,.99),coverage:sim.coverage,projectedTotal:+sim.projectedTotal.toFixed(1),projectedAway:+sim.awayRuns.toFixed(1),projectedHome:+sim.homeRuns.toFixed(1),projectedTeam:target.team?+(target.team==='home'?sim.homeRuns:sim.awayRuns).toFixed(1):null,
  range:sim.range,trials:sim.trials,experimental:true,kind:target.team?'team':'game'};
}
window.MLB_TOTALS_MODEL={estimate,scoring,selection,TRIALS};
})();
