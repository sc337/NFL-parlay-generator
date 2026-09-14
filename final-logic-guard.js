(() => {
  function ready(fn){
    if(window.NFL_SELECTIVITY) return fn();
    let tries=0;
    const t=setInterval(()=>{
      if(window.NFL_SELECTIVITY){clearInterval(t);fn();}
      else if(++tries>80) clearInterval(t);
    },100);
  }

  ready(()=>{
    const sel=window.NFL_SELECTIVITY;
    const corr=sel.strictCorrelation;
    const value=sel.valueScore;

    function connectedAudit(legs,variant,isSgp){
      if(!legs?.length) return false;
      const base=sel.buildQuality(legs,variant,isSgp);
      if(!base?.pass) return false;
      if(!isSgp) return true;

      const degree=new Array(legs.length).fill(0);
      for(let i=0;i<legs.length;i++){
        for(let j=i+1;j<legs.length;j++){
          const c=corr(legs[i],legs[j]);
          // Higher variance is acceptable; contradictory football logic is not.
          if(c<0) return false;
          if(c>=3){degree[i]++;degree[j]++;}
        }
      }
      // Every leg must support or be supported by at least one other leg.
      if(degree.some(d=>d===0)) return false;

      // Prevent one weak leg from hiding behind a strong average.
      const floor=variant==='safe'?77:variant==='balanced'?74:68;
      if(legs.some(l=>value(l,variant)<floor)) return false;

      // Safer builds should not contain TD volatility at all.
      if(variant==='safe' && legs.some(l=>l.type==='td')) return false;
      return true;
    }

    const prevSgp=window.buildSgp;
    if(typeof prevSgp==='function'){
      window.buildSgp=function(game,count,risk,variant,previous=[]){
        const p=prevSgp(game,count,risk,variant,previous);
        if(!p?.legs?.length) return null;
        return connectedAudit(p.legs,variant,true)?p:null;
      };
    }

    const prevMulti=window.buildMulti;
    if(typeof prevMulti==='function'){
      window.buildMulti=function(count,risk,variant){
        const p=prevMulti(count,risk,variant);
        if(!p?.legs?.length) return null;
        if(!connectedAudit(p.legs,variant,false)) return null;
        // Multi-game cards should diversify game exposure completely.
        const games=p.legs.map(l=>l.gameLabel||l.gameId||'');
        if(new Set(games).size!==games.length) return null;
        return p;
      };
    }

    window.NFL_FINAL_LOGIC={connectedAudit};
  });
})();