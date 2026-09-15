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
    const conf=l=>window.NFL_CONFIDENCE?.score?.(l)??0;

    function connectedAudit(legs,variant,isSgp){
      if(!legs?.length) return false;
      if(!isSgp) return !!sel.buildQuality(legs,variant,false)?.pass;

      const floor=variant==='safe'?77:variant==='balanced'?74:68;
      if(legs.some(l=>value(l,variant)<floor)) return false;
      if(variant==='safe' && legs.some(l=>l.type==='td')) return false;

      // Two-leg SGPs do not need manufactured positive correlation. They only
      // need two independently strong legs with no contradictory relationship.
      // Genuine correlation is still preferred upstream by candidate scoring.
      if(legs.length===2){
        const c=corr(legs[0],legs[1]);
        if(c<0) return false;
        const confFloor=variant==='safe'?82:variant==='balanced'?80:74;
        if(legs.some(l=>conf(l)<confFloor)) return false;
        return true;
      }

      const base=sel.buildQuality(legs,variant,true);
      if(!base?.pass) return false;
      const degree=new Array(legs.length).fill(0);
      for(let i=0;i<legs.length;i++){
        for(let j=i+1;j<legs.length;j++){
          const c=corr(legs[i],legs[j]);
          if(c<0) return false;
          if(c>=3){degree[i]++;degree[j]++;}
        }
      }
      if(degree.some(d=>d===0)) return false;
      return true;
    }

    const prevSgp=window.buildSgp;
    if(typeof prevSgp==='function'){
      window.buildSgp=function(game,count,risk,variant,previous=[]){
        // For 2-leg builds, try the normal builder first. If its old correlation
        // gate returns null, select the best non-conflicting qualified pair.
        let p=prevSgp(game,count,risk,variant,previous);
        if(count===2 && !p){
          const confFloor=variant==='safe'?82:variant==='balanced'?80:74;
          const pool=(game?.markets||[])
            .filter(m=>state.selectedMarkets?.has?.(m.type))
            .filter(m=>value(m,variant)>= (variant==='safe'?77:variant==='balanced'?74:68) && conf(m)>=confFloor)
            .sort((a,b)=>(conf(b)*.7+value(b,variant)*.3)-(conf(a)*.7+value(a,variant)*.3));
          let best=null,bestScore=-Infinity;
          for(let i=0;i<pool.length;i++) for(let j=i+1;j<pool.length;j++){
            const legs=[pool[i],pool[j]],c=corr(legs[0],legs[1]);
            if(c<0) continue;
            const score=conf(legs[0])+conf(legs[1])+value(legs[0],variant)+value(legs[1],variant)+(c*3);
            if(score>bestScore){bestScore=score;best=legs;}
          }
          if(best && typeof packageParlay==='function') p=packageParlay(best,variant,true,{scriptName:'High-confidence 2-leg',thesis:'Two independently qualified, non-conflicting legs; positive correlation is preferred when available.'});
        }
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
        const games=p.legs.map(l=>l.gameLabel||l.gameId||'');
        if(new Set(games).size!==games.length) return null;
        return p;
      };
    }

    window.NFL_FINAL_LOGIC={connectedAudit};
  });
})();