(() => {
  const BETS_KEY='nflQolBetsV3';
  const normalize=n=>Math.round(Math.max(0,Number(n)||0)*100)/100;
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
    const conf=Number(m?.confidence)||Number(m?.confidenceScore)||0;
    const pct=window.NFL_BANKROLL?.stakePctFromConfidence?.(conf,false) ?? (conf>=90?.0175:conf>=85?.0125:conf>=80?.01:.005);
    return normalize(bank*pct);
  };

  document.addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn) return;
    if(btn.id==='qAddBet'){
      const input=document.getElementById('qStake');
      if(input) input.value=String(normalize(input.value));
      return;
    }
    if(btn.dataset.act==='bet'){
      const host=btn.closest('[data-k]');
      const k=host?.dataset.k;
      const m=k&&marketByKey(k);
      if(!m) return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const bets=readBets();
      bets.push({id:String(Date.now()),selection:m.name,stake:suggestedForMarket(m),odds:Number(m.price),source:m.source,grade:'',result:'',createdAt:new Date().toISOString()});
      saveBets(bets);window.NFL_QOL?.refresh?.();
    }
  },true);

  document.addEventListener('focusin',e=>{
    if(e.target?.id==='qStake'){
      e.target.min='0.01';
      e.target.step='0.01';
    }
  });

  window.NFL_STAKE_RULES={normalize,min:.01,step:.01};
})();