// Pregame-only, market-independent NCAAF score model. Experimental until a
// settled holdout demonstrates calibration and value. It never creates bet EV.
(()=>{'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const sigmoid=x=>1/(1+Math.exp(-x));
const MARGIN_VERSION='ncaaf-margin-v1',errorCache=new WeakMap();
function margin(h,a,neutral=false){
  if([h,a].some(f=>!f?.available||f.games<3||f.box_games<2||['margin','yards_for','yards_against'].some(k=>!Number.isFinite(f[k]))))return null;
  const shrink=Math.min(h.games,a.games)/(Math.min(h.games,a.games)+3);
  const yards=((h.yards_for-h.yards_against)-(a.yards_for-a.yards_against))/65;
  return clamp((neutral?0:2.5)+shrink*(.68*((h.opponent_adjusted_margin??h.margin)-(a.opponent_adjusted_margin??a.margin))+clamp(yards,-4,4)),-28,28);
}
function errors(context,game){
  const history=context.margin_errors,cutoff=Math.min(Date.now(),Date.parse(context.updated_at),Date.parse(game.kickoff));
  if(history?.version!==MARGIN_VERSION||!Number.isFinite(Date.parse(history.generated_at))||Date.parse(history.generated_at)>cutoff+300000)return [];
  let cache=errorCache.get(context);if(!cache){cache=new Map();errorCache.set(context,cache)}
  const key=String(cutoff);if(cache.has(key))return cache.get(key);
  const seen=new Set(),rows=(history.rows||[]).filter(r=>{
    const kickoff=Date.parse(r.kickoff),at=Date.parse(r.available_at),id=String(r.event_id||'');
    if(!id||seen.has(id)||!Number.isFinite(r.error)||!Number.isFinite(kickoff)||!Number.isFinite(at)||at<kickoff+8*3600000||at>=cutoff)return false;
    seen.add(id);return true;
  }).slice(-800).map(r=>r.error);
  cache.set(key,rows);return rows;
}
function marginTail(edge,orientation,residuals){
  const fallback=sigmoid(edge/13),n=residuals.length;
  if(n<80)return fallback;
  // Smooth the empirical tail over two points and shrink toward the original
  // curve. Games, not mirrored team observations, determine the sample size.
  const empirical=residuals.reduce((sum,e)=>sum+sigmoid((edge+orientation*e)/2),0)/n;
  const weight=n/(n+200);return fallback*(1-weight)+empirical*weight;
}
function spreadProbability(edge,orientation,residuals,pushLine){
  if(!pushLine)return marginTail(edge,orientation,residuals);
  const win=marginTail(edge-.5,orientation,residuals),loss=1-marginTail(edge+.5,orientation,residuals);
  return win/(win+loss);
}
function side(label,game){
  const name=norm(label);
  return ['home','away'].find(k=>(game[k]?.aliases||[]).some(alias=>{
    const key=norm(alias);return key===name||key.startsWith(name)&&name.length>=4;
  }))||null;
}
function estimate(m,context){
  const game=context?.games?.[String(m?.game_id||'')];
  const updated=Date.parse(context?.updated_at||'');
  const kickoff=Date.parse(game?.kickoff||'');
  if(!game||!Number.isFinite(updated)||Date.now()-updated>12*3600000||updated>Date.now()+300000||
     !Number.isFinite(kickoff)||kickoff<=updated||kickoff<=Date.now()||
     m?.game_status!=='pre'||!game.home?.form?.available||!game.away?.form?.available)return null;
  const h=game.home.form,a=game.away.form;
  if(h.games<3||a.games<3||h.box_games<2||a.box_games<2)return null;
  const coverage=clamp(.35+.04*Math.min(h.games,a.games)+.08*Math.min(h.box_games,a.box_games),0,.85);
  const shrink=Math.min(h.games,a.games)/(Math.min(h.games,a.games)+3);
  const projected=margin(h,a,game.neutral_site);
  if(projected===null)return null;
  const leagueTotal=Number(context.league_points_per_team)*2;
  if(!Number.isFinite(leagueTotal)||leagueTotal<25||leagueTotal>90)return null;
  const formTotal=(h.points_for+a.points_against+a.points_for+h.points_against)/2;
  let total=clamp(leagueTotal+(formTotal-leagueTotal)*shrink,28,85);
  const weather=game.weather||{};
  if(weather.indoor===false){
    const wind=Number(weather.wind_mph),precip=Number(weather.precip_probability);
    if(Number.isFinite(wind)&&wind>=15)total-=Math.min(6,(wind-12)*.35);
    if(weather.precip_probability!=null&&Number.isFinite(precip)&&precip>=50)total-=Math.min(3,(precip-40)*.04);
  }
  const title=String(m.title||m.label||'');
  let p,edge,orientation=1,selectedMargin=null,offeredLine=null,pushLine=false;
  const residuals=m.kind==='spread'?errors(context,game):[];
  const probability=e=>m.kind==='spread'?spreadProbability(e,orientation,residuals,pushLine):sigmoid(e/13);
  if(m.kind==='moneyline'){
    const named=side(title.replace(/\s+wins\s*$/i,''),game);
    if(!named)return null;
    orientation=named==='home'?1:-1;selectedMargin=orientation*projected;edge=selectedMargin;
  }else if(m.kind==='spread'&&m.referenceOnly){
    const named=['home','away'].find(k=>String(game[k]?.id)===String(m.team_id));
    if(!named||!Number.isFinite(m.point))return null;
    orientation=named==='home'?1:-1;selectedMargin=orientation*projected;offeredLine=m.point;edge=selectedMargin+offeredLine;
    if(!Number.isInteger(offeredLine*2))return null;
    pushLine=Number.isInteger(offeredLine);
  }else if(m.kind==='spread'){
    const match=title.match(/^(.+?) wins by over (\d+(?:\.\d+)?) points?$/i);
    const named=match&&side(match[1],game);
    if(!named)return null;
    orientation=named==='home'?1:-1;selectedMargin=orientation*projected;offeredLine=-Number(match[2]);edge=selectedMargin+offeredLine;
    if(!Number.isInteger(offeredLine*2))return null;
  }else if(m.kind==='total'){
    const match=title.match(/^(Over|Under) (\d+(?:\.\d+)?) points scored$/i);
    if(!match)return null;
    offeredLine=Number(match[2]);edge=(match[1].toLowerCase()==='over'?1:-1)*(total-offeredLine);
  }else return null;
  p=probability(edge);
  if(!Number.isFinite(p))return null;
  const starter=window.STARTER_STATUS?.evidence('ncaaf',m,context);
  const confirmed=starter?starter.confirmed===true:game.quarterbacksConfirmed===true;
  // Deliberately adverse policy scenarios, not measured QB effects or a
  // statistical interval. Every scenario uses the same probability function.
  const scenarios=[{name:'Projection 2 points worse',modelP:clamp(probability(edge-2),.04,.96)}];
  if(!confirmed)scenarios.push({name:'Unconfirmed QB: 3 points worse',modelP:clamp(probability(edge-3),.04,.96)});
  if(m.kind!=='moneyline')scenarios.push({name:'Line 1 point worse',modelP:clamp(probability(edge-1),.04,.96)});
  scenarios.push({name:'Combined adverse assumptions',modelP:clamp(probability(edge-2-(confirmed?0:3)-(m.kind==='moneyline'?0:1)),.04,.96)});
  return {modelP:clamp(p,.04,.96),rawModelP:clamp(p,.04,.96),marketP:Number(m.probability),
    coverage,uncertainty:clamp(.35+.4/Math.sqrt(Math.min(h.games,a.games))+(confirmed?0:.08),.35,.8),experimental:true,betEV:null,projectedMargin:+projected.toFixed(1),projectedTotal:+total.toFixed(1),
    selectedMargin,offeredLine,marginVersion:MARGIN_VERSION,forecastVersion:'ncaaf-errors-stress-v1',
    pushProbability:pushLine?marginTail(edge+.5,orientation,residuals)-marginTail(edge-.5,orientation,residuals):0,
    probabilityMethod:m.kind==='spread'?(residuals.length>=80?'Historical error blend':'Fixed curve; historical sample insufficient'):'Fixed curve',errorSample:residuals.length,
    sensitivity:{scenarios,pricePenalty:.02,quarterbacksConfirmed:confirmed},
    sources:game.sources||context.sources};
}
function explain(m,f,q={}){
  if(!f.experimental)return '';
  const pct=p=>(p*100).toFixed(1)+'%',signed=n=>(n>=0?'+':'')+n.toFixed(1);
  const projection=m.kind==='total'?'Projected total '+f.projectedTotal.toFixed(1):'Projected margin for this team '+signed(f.selectedMargin)+' points'+(m.kind==='spread'?' · Offered spread '+signed(f.offeredLine):'');
  const stress=q.sensitivity;
  return [projection,'Estimated probability '+pct(f.modelP)+(f.pushProbability>0?' on non-push outcomes; estimated push probability '+pct(f.pushProbability):''),q.buffer!=null?'Uncertainty deduction '+(q.buffer*100).toFixed(1)+' percentage points; buffered estimate '+pct(q.conservativeP):'',f.probabilityMethod+(m.kind==='spread'?' ('+f.errorSample+' historical games; 80 required to blend)':''),stress&&stress.worstP!=null?'Sensitivity '+(stress.pass?'passed':'failed')+': worst buffered estimate '+pct(stress.worstP)+' vs adverse price break-even '+pct(stress.requiredP):'',
    'Assumptions: projection 2 points worse'+(f.sensitivity?.quarterbacksConfirmed?'':', QB uncertainty 3 points worse')+(m.kind==='moneyline'?'':', line 1 point worse')+', price break-even 2 percentage points higher. These are policy scenarios.',
    'Recheck if the starting QB, spread or price changes. Injury coverage remains incomplete.'].filter(Boolean).join(' · ');
}
window.NCAAF_MODEL={estimate,margin,explain,MARGIN_VERSION};
})();
