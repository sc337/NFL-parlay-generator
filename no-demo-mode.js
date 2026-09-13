(() => {
  function clearDemoState(message='No live markets available'){
    try{
      if(Array.isArray(state.games)) state.games=[];
      state.propsLoaded?.clear?.();
      state.propsLoading?.clear?.();
    }catch{}
    try{
      const sel=document.getElementById('gameSelect');
      if(sel){sel.innerHTML='';const o=document.createElement('option');o.textContent='No live games available';o.disabled=true;o.selected=true;sel.appendChild(o);}
      const results=document.getElementById('results');
      if(results) results.innerHTML='<div class="empty">Live Caesars or Polymarket data is required. No demo or placeholder markets are used.</div>';
      const title=document.getElementById('resultsTitle');
      if(title) title.textContent='No live betting recommendations';
      const btn=document.getElementById('generateBtn');
      if(btn){btn.disabled=true;btn.textContent='Live data required';}
      const status=document.getElementById('dataStatus');
      if(status) status.textContent=message;
    }catch{}
    window.NFL_PRODUCT_V2?.refresh?.();
  }

  function hasLiveGames(){
    try{return (state.games||[]).some(g=>g?.dataSource==='Polymarket'||(!String(g?.id||'').startsWith('demo-')))}catch{return false}
  }

  // Purge anything app.js may have synchronously inserted during bootstrap.
  clearDemoState(state.apiKey?'Loading Caesars markets…':'Loading Polymarket markets…');

  // Replace the legacy loader so future failures never restore demoGames.
  const caesarsLoad=async()=>{
    if(!state.apiKey){
      clearDemoState('Loading Polymarket markets…');
      return window.NFL_POLYMARKET_FALLBACK?.load?.() ?? false;
    }
    try{
      setStatus('Loading Caesars markets…');
      const url=new URL('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/');
      url.searchParams.set('apiKey',state.apiKey);
      url.searchParams.set('regions','us');
      url.searchParams.set('markets','h2h,spreads,totals');
      url.searchParams.set('oddsFormat','american');
      url.searchParams.set('bookmakers','fanduel');
      const res=await fetch(url);
      trackApiUsage(res);
      if(!res.ok) throw new Error('Odds API '+res.status);
      const raw=await res.json();
      state.games=raw.map(normalizeGame).filter(g=>g.markets.length);
      state.propsLoaded.clear();
      if(!state.games.length) throw new Error('No Caesars NFL markets returned');
      setStatus('Live Caesars markets');
      hydrateGames();
      const btn=document.getElementById('generateBtn');if(btn){btn.disabled=false;btn.textContent='Generate Parlays';}
      await generate();
      window.NFL_PRODUCT_V2?.refresh?.();
      return true;
    }catch(err){
      console.warn('Caesars unavailable, trying Polymarket',err);
      clearDemoState('Caesars unavailable — loading Polymarket…');
      const ok=await window.NFL_POLYMARKET_FALLBACK?.load?.();
      if(!ok) clearDemoState('No live Caesars or Polymarket markets available');
      return !!ok;
    }
  };

  loadData=caesarsLoad;

  // Prevent legacy generator from ever rendering demo/placeholder state.
  const originalGenerate=generate;
  generate=async function(...args){
    if(!hasLiveGames()){
      clearDemoState(state.apiKey?'Waiting for live Caesars/Polymarket data…':'Waiting for live Polymarket data…');
      return;
    }
    return originalGenerate.apply(this,args);
  };

  window.NFL_NO_DEMO={clear:clearDemoState,hasLiveGames};
})();