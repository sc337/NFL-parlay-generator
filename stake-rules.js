(() => {
  const BETS_KEY='nflQolBetsV3';
  const MIN_STAKE=5;
  const STEP=5;
  const normalize=n=>{
    n=Math.max(0,Number(n)||0);
    if(n<=MIN_STAKE) return MIN_STAKE;
    return Math.max(MIN_STAKE,Math.round(n/STEP)*STEP);
  };
  const readBets=()=>{try{return JSON.parse(localStorage.getItem(BETS_KEY)||'[]')}catch{return[]}};
  const saveBets=a=>localStorage.setItem(BETS_KEY,JSON.stringify(a));
  const marketByKey=k=>{
    try{
      for(const g of state.games||[]){
        for(const m of g.markets||[]){
          if(window.NFL_QOL?.key?.(m,g)===k) return {...m,game:`${g.away} @ ${g.home}`,source:m.source||g.dataSource||'Live'};
        }
      }
    }catch{}
    return null;
  };
  const suggestedForMarket=m=>{
    const bank=window.NFL_BANKROLL?.current?.()||0;
    let pct=.01;
    if(m?.confidence>=80)pct=.02;
    else if(m?.confidence>=75)pct=.015;
    else if(m?.confidence>=70)pct=.0125;
    else if(m?.confidence>=65)pct=.01;
    else if(m?.confidence>=60)pct=.0075;
    else if(m?.confidence>=55)pct=.005;
    return normalize(bank*pct);
  };

  document.addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn) return;

    // Normalize manual tracker stake before the existing tracker handler reads it.
    if(btn.id==='qAddBet'){
      const input=document.getElementById('qStake');
      if(input) input.value=String(normalize(input.value));
      return;
    }

    // Override recommendation-card Add bet so it obeys the $5 betting unit rule.
    if(btn.dataset.act==='bet'){
      const host=btn.closest('[data-k]');
      const k=host?.dataset.k;
      const m=k&&marketByKey(k);
      if(!m) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const bets=readBets();
      const stake=suggestedForMarket(m);
      bets.push({
        id:String(Date.now()),
        selection:m.name,
        stake,
        odds:Number(m.price),
        source:m.source,
        grade:'',
        result:'',
        createdAt:new Date().toISOString()
      });
      saveBets(bets);
      window.NFL_QOL?.refresh?.();
    }
  },true);

  document.addEventListener('input',e=>{
    if(e.target?.id==='qStake'){
      e.target.min=String(MIN_STAKE);
      e.target.step=String(STEP);
    }
  });

  window.NFL_STAKE_RULES={normalize,min:MIN_STAKE,step:STEP};
})();