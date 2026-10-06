(() => {
  function clearLiveState(message='No live markets available'){
    try{if(Array.isArray(state.games))state.games=[];state.propsLoaded?.clear?.();state.propsLoading?.clear?.()}catch{}
    if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;
    window.PICK_QUALITY?.prepare('nfl',[]);
    try{
      const sel=document.getElementById('gameSelect');if(sel){sel.innerHTML='';const o=document.createElement('option');o.textContent='No live games available';o.disabled=true;o.selected=true;sel.appendChild(o)}
      const results=document.getElementById('results');if(results){const note=document.createElement('div');note.className='empty';note.textContent=message;results.replaceChildren(note)}
      const title=document.getElementById('resultsTitle');if(title)title.textContent='No live betting recommendations';
      const btn=document.getElementById('generateBtn');if(btn){btn.disabled=true;btn.textContent='Live data required'}
      const status=document.getElementById('dataStatus');if(status)status.textContent=message;window.__NFL_STATUS=message;
    }catch{}
    window.NFL_PRODUCT_V2?.refresh?.();
  }
  function hasLiveGames(){try{return (state.games||[]).some(g=>g?.dataSource==='Kalshi'||g?.dataSource==='Caesars'||(!String(g?.id||'').startsWith('demo-')))}catch{return false}}
  async function kalshiFallback(){const token=window.__SPORT_TOKEN;
    if(!hasLiveGames())clearLiveState('Loading Kalshi NFL snapshot…');else setStatus('Refreshing NFL markets…');
    try{if(await window.NFL_KALSHI?.load?.())return true}catch(e){console.warn('Kalshi fallback failed',e)}
    if((window.__ACTIVE_SPORT||'nfl')!=='nfl'||token!==window.__SPORT_TOKEN)return false;
    const failure=window.NFL_KALSHI?.lastResult?.();clearLiveState(failure?.message||'NFL feed temporarily unavailable. Retrying automatically.');
    return false;
  }
  // Keep Kalshi as the recommendation source when a comparison API key is set.
  const caesarsLoad=async()=>{
    if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return false;
    const ok=await kalshiFallback();
    window.CAESARS_COMPARE?.refresh?.();
    return ok;
  };
  loadData=caesarsLoad;
  const originalGenerate=generate;
  generate=async function(...args){if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;if(!hasLiveGames()){clearLiveState('Waiting for Kalshi data…');return}return originalGenerate.apply(this,args)};
  window.NFL_NO_DEMO={clear:clearLiveState,hasLiveGames,load:caesarsLoad,fallback:kalshiFallback};
  clearLiveState('Loading Kalshi NFL snapshot…');
  let loadAttempts=0;
  async function bootLoad(){loadAttempts++;const ok=await caesarsLoad();if(!ok&&loadAttempts<3)setTimeout(bootLoad,1200*loadAttempts)}
  setTimeout(bootLoad,60);
})();
