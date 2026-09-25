(() => {
  const SNAPSHOT='data/kalshi-nfl.json';
  const CACHE_KEY='nflKalshiSnapshotV1';
  function cached(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&Array.isArray(x.games)?x:null}catch{return null}}
  function saveCache(x){try{localStorage.setItem(CACHE_KEY,JSON.stringify(x))}catch{}}
  const WARN_AGE_MS=30*60*1000;
  const QUALITY_PENALTY_AGE_MS=2*60*60*1000;
  const MAX_AGE_MS=12*60*60*1000;
  const diag=d=>window.NFL_DIAGNOSTICS?.add?.(d);
  const isPregame=g=>{
    const kickoff=Date.parse(g?.commence_time||'');
    return g?.game_status==='pre' && Number.isFinite(kickoff) && kickoff>Date.now();
  };
  async function load(){
    const status=document.getElementById('kalshiStatus');
    const warm=cached();
    if(warm?.games?.length){const wg=warm.games.filter(isPregame);if(wg.length){state.games=wg;state.propsLoaded?.clear?.();hydrateGames();const btn=document.getElementById('generateBtn');if(btn){btn.disabled=false;btn.textContent='Generate Parlays'};setStatus('Cached Kalshi markets • refreshing…');setTimeout(()=>{window.NFL_PROJECTIONS?.refresh?.();generate()},0)}}
    if(status)status.textContent='Checking…';
    const started=performance.now();
    try{
      const url=SNAPSHOT+'?t='+Date.now();
      const res=await fetch(url,{cache:'no-store'});
      if(!res.ok) throw new Error('Snapshot HTTP '+res.status);
      const data=await res.json();
      saveCache(data);
      const rawGames=Array.isArray(data.games)?data.games:[];
      let games=rawGames.filter(isPregame);
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
      const heavilyDelayed=ageMs>QUALITY_PENALTY_AGE_MS;

      // Keep ESPN-verified pregame games visible during GitHub Actions delays,
      // but make older proxy prices harder to qualify as recommendations.
      if(heavilyDelayed){
        for(const g of games){
          for(const m of g.markets||[]){
            m.staleSnapshot=true;
            if(Number.isFinite(Number(m.sourceQuality))) m.sourceQuality=Math.max(0,Number(m.sourceQuality)-10);
          }
        }
      }

      diag({source:'Kalshi snapshot',url:SNAPSHOT,status:res.status,ok:true,count:games.length,ms:Math.round(performance.now()-started),note:`${data.updated_at||'snapshot'}${removed?` • ${removed} started games removed`:''}${delayed?' • delayed snapshot accepted for future games':''}${heavilyDelayed?' • stale-price quality penalty applied':''}`});
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
      window.NFL_PROJECTIONS?.refresh?.();
      await generate();
      return true;
    }catch(e){
      diag({source:'Kalshi snapshot',url:SNAPSHOT,status:'ERR',ok:false,error:String(e.message||e),ms:Math.round(performance.now()-started)});
      if(status&&status.textContent!=='Stale')status.textContent='Unavailable';
      return false;
    }
  }
  window.NFL_KALSHI={load,clearCache:()=>{}};
})();