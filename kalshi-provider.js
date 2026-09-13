(() => {
  const SNAPSHOT='data/kalshi-nfl.json';
  const WARN_AGE_MS=30*60*1000;
  const MAX_AGE_MS=2*60*60*1000;
  const diag=d=>window.NFL_DIAGNOSTICS?.add?.(d);
  const isPregame=g=>{
    const kickoff=Date.parse(g?.commence_time||'');
    return g?.game_status==='pre' && Number.isFinite(kickoff) && kickoff>Date.now();
  };
  async function load(){
    const status=document.getElementById('kalshiStatus');
    if(status)status.textContent='Checking…';
    const started=performance.now();
    try{
      const url=SNAPSHOT+'?t='+Date.now();
      const res=await fetch(url,{cache:'no-store'});
      if(!res.ok) throw new Error('Snapshot HTTP '+res.status);
      const data=await res.json();
      const rawGames=Array.isArray(data.games)?data.games:[];
      const games=rawGames.filter(isPregame);
      const removed=rawGames.length-games.length;
      if(!rawGames.length && !data.updated_at){
        diag({source:'Kalshi snapshot',url:SNAPSHOT,status:202,ok:true,count:0,ms:Math.round(performance.now()-started),note:'awaiting first GitHub Actions refresh'});
        if(status)status.textContent='Initializing';
        setStatus('Kalshi feed initializing — first server refresh pending');
        return false;
      }
      const updated=Date.parse(data.updated_at||'');
      if(!Number.isFinite(updated)) throw new Error('Kalshi snapshot missing valid timestamp');
      const ageMs=Math.max(0,Date.now()-updated);
      if(ageMs>MAX_AGE_MS){
        if(status)status.textContent='Stale';
        throw new Error(`Kalshi snapshot is ${Math.round(ageMs/60000)} minutes old`);
      }
      const delayed=ageMs>WARN_AGE_MS;
      diag({source:'Kalshi snapshot',url:SNAPSHOT,status:res.status,ok:true,count:games.length,ms:Math.round(performance.now()-started),note:`${data.updated_at||'snapshot'}${removed?` • ${removed} started games removed`:''}${delayed?' • delayed snapshot accepted for future games':''}`});
      if(!games.length) throw new Error('Kalshi snapshot has no upcoming NFL markets');
      state.games=games;
      state.propsLoaded?.clear?.();
      hydrateGames();
      const props=games.reduce((n,g)=>n+(g.markets||[]).filter(m=>m.player).length,0);
      const total=games.reduce((n,g)=>n+(g.markets||[]).length,0);
      const age=Math.max(0,Math.round(ageMs/60000));
      if(status)status.textContent=`${delayed?'Delayed':'Active'} • ${total} markets`;
      setStatus(`Kalshi ${delayed?'delayed ':''}snapshot • ${games.length} upcoming NFL games • ${props} player props • ${total} markets • updated ${age}m ago`);
      const btn=document.getElementById('generateBtn');
      if(btn){btn.disabled=false;btn.textContent='Generate Parlays';}
      await generate();
      window.NFL_QOL_V3?.refresh?.();
      return true;
    }catch(e){
      diag({source:'Kalshi snapshot',url:SNAPSHOT,status:'ERR',ok:false,error:String(e.message||e),ms:Math.round(performance.now()-started)});
      if(status&&status.textContent!=='Stale')status.textContent='Unavailable';
      return false;
    }
  }
  window.NFL_KALSHI={load,clearCache:()=>{}};
})();