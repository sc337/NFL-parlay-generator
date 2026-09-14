(() => {
  const clamp=n=>Math.max(0,Math.min(100,n));
  const implied=o=>o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);
  const isOver=m=>m?.side==='over'||/\bOver\b/i.test(m?.name||'');
  function contextAdjust(m){
    const factors=[];let delta=0,cap=100;
    const ctx=m?.gameContext||{};const sig=m?.contextSignals||{};
    if(m?.player){
      const status=String(sig.injury_status||'none_reported').toLowerCase();
      if(/out|injured reserve|ir\b/.test(status)){delta-=25;cap=Math.min(cap,70);factors.push('injury: out/IR');}
      else if(/doubtful/.test(status)){delta-=15;cap=Math.min(cap,75);factors.push('injury: doubtful');}
      else if(/questionable|game-time|gtd/.test(status)){delta-=8;cap=Math.min(cap,82);factors.push('injury: questionable');}
      else if(/probable/.test(status)){delta-=2;factors.push('injury: probable');}
      const breadth=Number(sig.market_breadth)||0;
      if(breadth>=3){delta+=3;factors.push('stable market role');}
      else if(breadth===1){delta-=5;factors.push('thin market role');}
    }
    const weather=ctx.weather||{};
    if(weather.available&&weather.indoor!==true){
      const wind=Number(weather.wind_mph);
      if(Number.isFinite(wind)&&wind>=20){if(['passing','receiving','totals'].includes(m.type)&&isOver(m)){delta-=8;factors.push('20+ mph wind');}else if(m.type==='rushing'&&isOver(m)){delta+=2;factors.push('run-friendly weather');}}
      else if(Number.isFinite(wind)&&wind>=15&&['passing','receiving'].includes(m.type)&&isOver(m)){delta-=4;factors.push('15+ mph wind');}
    }
    const form=ctx.recent_form||{};
    if(m?.team&&form[m.team]?.available&&['h2h','spreads'].includes(m.type)){
      const margin=Number(form[m.team].avg_margin);
      if(Number.isFinite(margin)){if(margin>=6){delta+=4;factors.push('strong recent team form');}else if(margin<=-6){delta-=4;factors.push('poor recent team form');}}
    }
    if(m?.player&&m?.team&&form){
      const opp=Object.keys(form).find(t=>t!==m.team);
      const oppPa=Number(opp&&form[opp]?.avg_points_against);
      if(Number.isFinite(oppPa)&&isOver(m)&&['passing','rushing','receiving'].includes(m.type)){
        if(oppPa>=25){delta+=2;factors.push('favorable recent opponent scoring profile');}
        else if(oppPa<=18){delta-=2;factors.push('tough recent opponent scoring profile');}
      }
    }
    return{delta,cap,factors};
  }
  function confidence(m){
    if(!m||!Number.isFinite(Number(m.price)))return 0;
    const price=Number(m.price),q=Number(m.sourceQuality)||60;let s=q*.58;
    if(price>=-160&&price<=115)s+=14;else if(price>=-220&&price<=150)s+=9;else s+=3;
    if(m.source==='Caesars'||m.source==='Caesars override')s+=9;else if(m.source==='Kalshi')s+=4;
    if(m.player){if(m._rosterVerified===true)s+=8;else return 0;}
    if(m.type==='h2h')s+=8;else if(m.type==='spreads')s+=6;else if(['passing','rushing','receiving'].includes(m.type))s+=5;else if(m.type==='totals')s+=4;else if(m.type==='td')s-=7;
    if(/_alternate$/.test(m.marketKey||''))s-=5;
    const p=implied(price);if(p>.72)s-=5;if(p<.35)s-=8;
    const age=Number(m.snapshotAgeMinutes??m.dataAgeMinutes);if(Number.isFinite(age)){if(age>120)s-=12;else if(age>60)s-=7;else if(age>30)s-=3;}
    const adj=contextAdjust(m);s+=adj.delta;return Math.round(Math.min(adj.cap,clamp(s)));
  }
  function grade(s){return s>=92?'A+':s>=88?'A':s>=84?'A-':s>=80?'B+':s>=76?'B':'PASS';}
  function eligible(m,kind='straight'){const s=confidence(m),floor=kind==='prop'?82:kind==='sgp'?80:80;return s>=floor;}
  function explain(m){const score=confidence(m),adj=contextAdjust(m);return{score,grade:grade(score),contextFactors:adj.factors,contextDelta:adj.delta,contextAvailable:!!m?.gameContext?.available};}
  function decorate(){try{for(const g of state.games||[])for(const m of g.markets||[]){m.gameContext=g.context||null;m.confidenceScore=confidence(m);m.confidence=m.confidenceScore;}}catch{}}
  const observer=new MutationObserver(()=>decorate());const start=()=>{decorate();observer.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.NFL_CONFIDENCE={score:confidence,grade,eligible,explain,refresh:decorate};
})();