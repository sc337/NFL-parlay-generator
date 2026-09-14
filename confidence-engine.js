(() => {
  const clamp=n=>Math.max(0,Math.min(100,n));
  const implied=o=>o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);
  function confidence(m){
    if(!m||!Number.isFinite(Number(m.price)))return 0;
    const price=Number(m.price),q=Number(m.sourceQuality)||60;
    let s=q*.58;
    // Price discipline: confidence is not simply favorite probability.
    if(price>=-160&&price<=115)s+=14;else if(price>=-220&&price<=150)s+=9;else s+=3;
    // Data integrity and source hierarchy.
    if(m.source==='Caesars'||m.source==='Caesars override')s+=9;
    else if(m.source==='Kalshi')s+=4;
    if(m.player){if(m._rosterVerified===true)s+=8;else return 0;}
    // Main markets are more stable than long-tail outcomes.
    if(m.type==='h2h')s+=8;
    else if(m.type==='spreads')s+=6;
    else if(['passing','rushing','receiving'].includes(m.type))s+=5;
    else if(m.type==='totals')s+=4;
    else if(m.type==='td')s-=7;
    if(/_alternate$/.test(m.marketKey||''))s-=5;
    // Avoid pretending extremely short prices are automatically high-value picks.
    const p=implied(price);
    if(p>.72)s-=5;if(p<.35)s-=8;
    // Stale prediction-market snapshots remain usable, but confidence falls.
    const age=Number(m.snapshotAgeMinutes??m.dataAgeMinutes);
    if(Number.isFinite(age)){if(age>120)s-=12;else if(age>60)s-=7;else if(age>30)s-=3;}
    return Math.round(clamp(s));
  }
  function grade(s){return s>=92?'A+':s>=88?'A':s>=84?'A-':s>=80?'B+':s>=76?'B':'PASS';}
  function eligible(m,kind='straight'){
    const s=confidence(m);
    const floor=kind==='prop'?82:kind==='sgp'?80:80;
    return s>=floor;
  }
  function decorate(){
    try{for(const g of state.games||[])for(const m of g.markets||[]){m.confidenceScore=confidence(m);m.confidence=m.confidenceScore;}}
    catch{}
  }
  const observer=new MutationObserver(()=>decorate());
  const start=()=>{decorate();observer.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.NFL_CONFIDENCE={score:confidence,grade,eligible,refresh:decorate};
})();