(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const sigmoid=x=>1/(1+Math.exp(-x));

  function teamForm(game,team){
    const f=game?.context?.recent_form?.[team];
    return f?.available?f:null;
  }
  function teamProjection(game){
    const a=teamForm(game,game.away),h=teamForm(game,game.home);
    if(!a||!h)return null;
    // Blend each offense with opponent points allowed. Recent form is deliberately
    // regressed toward the market environment rather than treated as a standalone truth.
    const awayPts=(num(a.avg_points_for)+num(h.avg_points_against))/2;
    const homePts=(num(h.avg_points_for)+num(a.avg_points_against))/2;
    if(!Number.isFinite(awayPts)||!Number.isFinite(homePts))return null;
    return {awayPts,homePts,total:awayPts+homePts,homeMargin:homePts-awayPts,coverage:.45};
  }
  function injuryPenalty(m){
    const s=String(m?.contextSignals?.injury_status||'').toLowerCase();
    if(!s||s==='none_reported')return 0;
    if(/out|injured reserve/.test(s))return -1;
    if(/doubtful/.test(s))return -.55;
    if(/questionable/.test(s))return -.18;
    return -.08;
  }
  function weatherFactor(game,m){
    const w=game?.context?.weather||{};
    if(w.indoor===true)return 0;
    const wind=num(w.wind_mph),temp=num(w.temperature_f);
    let z=0;
    if(wind!=null&&wind>=20&&['passing','receiving','receptions','totals'].includes(m.type))z-=.18;
    else if(wind!=null&&wind>=15&&['passing','receiving','totals'].includes(m.type))z-=.09;
    if(temp!=null&&temp<=25&&['passing','receiving','totals'].includes(m.type))z-=.05;
    return z;
  }
  function usageProjection(game,m){
    if(!m?.player)return null;
    const same=(game.markets||[]).filter(x=>x.player===m.player);
    const get=k=>same.find(x=>x.marketKey===k&&x.side==='over'&&num(x.point)!=null);
    const attempts=get('player_pass_attempts'),comps=get('player_pass_completions'),rush=get('player_rush_attempts'),rec=get('player_receptions');
    let line=null,coverage=0;
    if(m.marketKey==='player_pass_yds'&&attempts){line=num(attempts.point)*7.05;coverage=.32;}
    if(m.marketKey==='player_rush_yds'&&rush){line=num(rush.point)*4.15;coverage=.32;}
    if(m.marketKey==='player_reception_yds'&&rec){line=num(rec.point)*11.3;coverage=.32;}
    if(m.marketKey==='player_receptions'&&comps){line=num(comps.point)*.24;coverage=.18;}
    return line==null?null:{line,coverage};
  }
  function marketProjection(game,m){
    const marketP=typeof impliedProbability==='function'?impliedProbability(m.price):num(m.prob);
    if(!Number.isFinite(marketP))return null;
    let z=0,coverage=0;
    const tp=teamProjection(game);
    if(tp){
      if(m.type==='totals'&&num(m.point)!=null){
        const d=tp.total-num(m.point);z+=clamp(d/13,-.45,.45)*(m.side==='under'?-1:1);coverage+=.25;
      }else if(m.type==='spreads'&&num(m.point)!=null&&m.team){
        const teamMargin=m.team===game.home?tp.homeMargin:-tp.homeMargin;
        z+=clamp((teamMargin+num(m.point))/9,-.45,.45);coverage+=.25;
      }else if(m.type==='h2h'&&m.team){
        const teamMargin=m.team===game.home?tp.homeMargin:-tp.homeMargin;
        z+=clamp(teamMargin/16,-.32,.32);coverage+=.2;
      }
    }
    if(m.player){
      const up=usageProjection(game,m);
      if(up&&num(m.point)!=null){
        const scale=m.type==='passing'?38:m.type==='rushing'?14:m.type==='receiving'?18:m.type==='receptions'?1.7:20;
        const d=(up.line-num(m.point))/scale;
        z+=clamp(d,-.38,.38)*(m.side==='under'?-1:1);coverage+=up.coverage;
      }
      const breadth=num(m?.contextSignals?.market_breadth)||1;
      z+=clamp((breadth-2)*.025,0,.12);coverage+=.08;
      const ip=injuryPenalty(m);z+=ip;coverage+=ip? .22:0;
      const wf=weatherFactor(game,m);z+=wf;coverage+=wf? .12:0;
    } else {
      const wf=weatherFactor(game,m);z+=wf;coverage+=wf? .1:0;
    }
    // Keep the first projection layer conservative until it is backtested:
    // market probability remains the anchor, context can move it only modestly.
    const marketLogit=Math.log(clamp(marketP,.03,.97)/(1-clamp(marketP,.03,.97)));
    const modelP=clamp(sigmoid(marketLogit+z),.04,.96);
    const edge=modelP-marketP;
    const upFinal=usageProjection(game,m);
    const lineEdge=(upFinal&&num(m.point)!=null)?upFinal.line-num(m.point):null;
    return {marketP,modelP,edge,coverage:clamp(coverage,0,1),team:tp,projectionLine:upFinal?.line??null,lineEdge};
  }
  let enrichedRef=null;
  function enrich(force=false){
    if(!force&&enrichedRef===state.games)return;
    for(const g of state.games||[])for(const m of g.markets||[]){
      const p=marketProjection(g,m);if(!p)continue;
      m.modelProbability=p.modelP;
      m.marketProbability=p.marketP;
      m.modelEdge=p.edge;
      m.projectionCoverage=p.coverage;
      m.fairPrice=typeof decimalToAmerican==='function'?decimalToAmerican(1/p.modelP):null;
      m.projectedLine=p.projectionLine;
    }
    enrichedRef=state.games;
  }
  function adjustment(m){
    const edge=num(m?.modelEdge),cov=num(m?.projectionCoverage)||0;
    if(edge==null||cov<.08)return 0;
    // Coverage-gated model-v-market edge. Thin projections cannot overpower
    // the market; richer context can move a candidate more materially.
    const gate=clamp((cov-.08)/.42,0,1);
    return clamp(edge*100,-12,12)*(.30+.70*gate);
  }
  function describe(m){
    const mp=num(m?.marketProbability),p=num(m?.modelProbability),e=num(m?.modelEdge),cov=num(m?.projectionCoverage);
    if(mp==null||p==null||e==null)return null;
    return {
      marketProbability:mp,modelProbability:p,edge:e,coverage:cov||0,
      fairPrice:m.fairPrice??null,projectedLine:m.projectedLine??null,
      actionable:(cov||0)>=.20&&Math.abs(e)>=.025
    };
  }
  function refresh(){enrich(true);setTimeout(()=>window.NFL_SELECTIVITY?.refresh?.(),0)}
  window.NFL_PROJECTIONS={enrich,marketProjection,adjustment,describe,refresh};
  const init=()=>setTimeout(refresh,0);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();