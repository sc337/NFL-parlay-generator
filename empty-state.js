(() => {
  const EMPTY_ID='marketEmptyState';

  function marketCount(){
    try{
      return (state.games||[]).reduce((n,g)=>n+(Array.isArray(g.markets)?g.markets.length:0),0);
    }catch{return 0;}
  }

  function liveGameCount(){
    try{
      const now=Date.now();
      return (state.games||[]).filter(g=>{
        const t=Date.parse(g.commence_time||'');
        return Number.isFinite(t)&&t>now&&Array.isArray(g.markets)&&g.markets.length>0;
      }).length;
    }catch{return 0;}
  }

  function ensureEmptyCard(){
    let card=document.getElementById(EMPTY_ID);
    if(card) return card;
    card=document.createElement('section');
    card.id=EMPTY_ID;
    card.className='market-empty-state';
    card.hidden=true;
    card.innerHTML=`
      <div class="market-empty-icon">↻</div>
      <div class="market-empty-copy">
        <span>MARKET STATUS</span>
        <h2>No pregame NFL markets available</h2>
        <p id="marketEmptyDetail">Waiting for the next live Caesars or Kalshi refresh.</p>
      </div>
      <button id="marketEmptyRefresh" type="button">Refresh</button>`;
    document.querySelector('.topbar')?.insertAdjacentElement('afterend',card);
    card.querySelector('#marketEmptyRefresh')?.addEventListener('click',async()=>{
      const btn=card.querySelector('#marketEmptyRefresh');
      if(btn){btn.disabled=true;btn.textContent='Checking…';}
      try{
        if(window.NFL_KALSHI?.load) await window.NFL_KALSHI.load();
        else if(typeof loadData==='function') await loadData();
      }catch{}
      finally{
        if(btn){btn.disabled=false;btn.textContent='Refresh';}
        setTimeout(update,50);
      }
    });
    return card;
  }

  function setHidden(el,hidden){
    if(!el) return;
    el.classList.toggle('empty-state-hidden',hidden);
  }

  function update(){
    const card=ensureEmptyCard();
    const games=liveGameCount();
    const markets=marketCount();
    const empty=games===0||markets===0;

    card.hidden=!empty;
    setHidden(document.getElementById('qolV3'),empty);
    setHidden(document.querySelector('.mode-tabs'),empty);
    setHidden(document.querySelector('main'),empty);

    const detail=card.querySelector('#marketEmptyDetail');
    if(detail){
      const status=document.getElementById('dataStatus')?.textContent?.trim();
      detail.textContent=status&&status!=='Loading live market data…'
        ? status
        : 'Waiting for the next live Caesars or Kalshi refresh.';
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    update();
    setTimeout(update,400);
    setTimeout(update,1200);
  });
  window.addEventListener('nfl-qol-rendered',()=>setTimeout(update,0));
  window.addEventListener('nfl-diagnostics-updated',()=>setTimeout(update,0));

  // Kalshi can refresh after initial page load. Re-check after each provider load.
  const provider=window.NFL_KALSHI;
  if(provider?.load && !provider._emptyStateWrapped){
    const original=provider.load.bind(provider);
    provider.load=async(...args)=>{
      try{return await original(...args);}
      finally{setTimeout(update,0);}
    };
    provider._emptyStateWrapped=true;
  }

  window.NFL_EMPTY_STATE={refresh:update};
})();