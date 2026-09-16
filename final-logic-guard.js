(() => {
  function ready(fn){if(window.NFL_SELECTIVITY)return fn();let tries=0;const t=setInterval(()=>{if(window.NFL_SELECTIVITY){clearInterval(t);fn()}else if(++tries>80)clearInterval(t)},100)}
  ready(()=>{
    const sel=window.NFL_SELECTIVITY,corr=sel.strictCorrelation,value=sel.valueScore,conf=l=>window.NFL_CONFIDENCE?.score?.(l)??0;
    const isKalshiProp=l=>l?.source==='Kalshi'&&!!l.player&&l._rosterVerified===true;
    const confFloor=(l,variant,count)=>{const base=variant==='safe'?82:variant==='balanced'?80:74;return count>=3&&isKalshiProp(l)?Math.max(76,base-4):base};
    function audit(legs,variant,isSgp){
      if(!legs?.length)return{pass:false,reason:'Insufficient markets'};
      if(!isSgp)return sel.buildQuality(legs,variant,false);
      const vf=variant==='safe'?77:variant==='balanced'?74:68,cs=legs.map(conf),vs=legs.map(l=>value(l,variant));
      if(vs.some(v=>v<vf))return{pass:false,reason:'Price/value'};
      if(variant==='safe'&&legs.some(l=>l.type==='td'))return{pass:false,reason:'Safe mode excludes TD'};
      if(legs.some((l,i)=>cs[i]<confFloor(l,variant,legs.length)))return{pass:false,reason:'Confidence'};
      if(legs.length===2){const c=corr(legs[0],legs[1]);return c<0?{pass:false,reason:'Negative correlation'}:{pass:true,corr:c,links:c>=3?1:0,cavg:(cs[0]+cs[1])/2};}
      const degree=new Array(legs.length).fill(0);let total=0,strong=0;
      for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){
        const c=corr(legs[i],legs[j]);
        if(c<0)return{pass:false,reason:'Negative correlation'};
        total+=c;
        if(c>=3){strong++;degree[i]++;degree[j]++;}
      }
      if(strong<1)return{pass:false,reason:'No correlation anchor'};
      // A logical SGP only needs a real correlation anchor. One neutral, high-quality
      // leg is allowed so a 3+ leg request does not disappear just because every leg
      // is not directly connected to every other leg.
      const disconnected=degree.map((d,i)=>({d,i})).filter(x=>x.d===0);
      if(disconnected.length>1)return{pass:false,reason:'Too many disconnected legs'};
      if(disconnected.length===1){
        const i=disconnected[0].i;
        if(cs[i]<84||vs[i]<78)return{pass:false,reason:'Weak neutral leg'};
      }
      const cavg=cs.reduce((a,b)=>a+b,0)/cs.length;
      if(cavg<79)return{pass:false,reason:'Parlay confidence below 79'};
      return{pass:true,corr:total,links:strong,cavg,neutral:disconnected.length};
    }
    function diagnose(game,count,variant){
      const markets=(game?.markets||[]).filter(m=>state.selectedMarkets?.has?.(m.type));const reasons={confidence:0,value:0,roster:0,price:0};let qualified=0;
      for(const m of markets){if(m.player&&m._rosterVerified!==true){reasons.roster++;continue}if(!Number.isFinite(Number(m.price))){reasons.price++;continue}if(value(m,variant)<0){reasons.value++;continue}if(conf(m)<confFloor(m,variant,count)){reasons.confidence++;continue}qualified++}
      let reason='Insufficient markets';if(qualified>=count)reason='Correlation';else if(reasons.confidence)reason='Confidence';else if(reasons.value)reason='Price/value';else if(reasons.roster)reason='Roster verification';
      return{reason,total:markets.length,qualified,...reasons};
    }
    function bestFallback(game,count,risk,variant){
      const pool=(game?.markets||[]).filter(m=>state.selectedMarkets?.has?.(m.type)).filter(m=>value(m,variant)>=0&&conf(m)>=confFloor(m,variant,count)).sort((a,b)=>(conf(b)*.7+value(b,variant)*.3)-(conf(a)*.7+value(a,variant)*.3)).slice(0,24);
      let best=null,bestScore=-Infinity;const chosen=[];function walk(start){if(chosen.length===count){const a=audit(chosen,variant,true);if(!a.pass)return;const score=a.cavg+a.corr*1.5+chosen.reduce((s,l)=>s+value(l,variant),0)/count*.2-(a.neutral||0)*2;if(score>bestScore){bestScore=score;best={legs:[...chosen],audit:a}}return}for(let i=start;i<pool.length;i++){chosen.push(pool[i]);walk(i+1);chosen.pop()}}walk(0);
      if(!best||typeof packageParlay!=='function')return null;const p=packageParlay(best.legs,variant,true,{scriptName:best.audit.neutral?'Correlated core + strong neutral':'Connected high-confidence SGP',thesis:best.audit.neutral?'Two or more legs share a clear game-script relationship, with one independently strong neutral leg added without contradiction.':'Qualified legs share a clear game-script correlation anchor with no contradictory relationships.'});if(p){p.corr=best.audit.corr;p.score=Math.min(Number(p.score)||100,Math.round(best.audit.cavg));p.logicTier=best.audit.neutral?'anchored-neutral':'connected-fallback'}return p;
    }
    const prev=window.buildSgp;if(typeof prev==='function')window.buildSgp=function(game,count,risk,variant,previous=[]){let p=prev(game,count,risk,variant,previous);if(p?.legs?.length&&audit(p.legs,variant,true).pass){window.NFL_SGP_LAST_FAILURE=null;return p}p=bestFallback(game,count,risk,variant);if(p){window.NFL_SGP_LAST_FAILURE=null;return p}window.NFL_SGP_LAST_FAILURE={gameId:game?.id,count,variant,...diagnose(game,count,variant)};return null};
    function paintFailure(){const f=window.NFL_SGP_LAST_FAILURE;if(!f||state.mode!=='sgp')return;const results=document.getElementById('results');if(!results||!results.querySelector('.empty'))return;results.querySelector('.empty').innerHTML=`<strong>No eligible SGP</strong><br><span>${f.reason} gate blocked this build • ${f.qualified}/${f.total} markets individually qualified.</span>`;}
    document.getElementById('generateBtn')?.addEventListener('click',()=>setTimeout(paintFailure,80));
    window.NFL_FINAL_LOGIC={connectedAudit:(l,v,s)=>audit(l,v,s).pass,audit,bestFallback,diagnose,paintFailure};
    // Re-render once after installing the guard so initial load and later setting
    // changes always use the exact same recommendation logic.
    setTimeout(()=>{if(typeof window.generate==='function')window.generate();else if(typeof generate==='function')generate();},100);
  });
})();