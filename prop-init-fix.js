(() => {
  let running=false;
  let initialized=false;

  function setReady(ready){
    document.documentElement.classList.toggle('recommendations-ready',!!ready);
    document.documentElement.classList.toggle('recommendations-verifying',!ready);
  }

  async function verifyProps(){
    if(running) return;
    const sel=window.NFL_SELECTIVITY;
    if(!sel?.verifyGameRoster || typeof state==='undefined') return;
    const games=(state.games||[]).filter(g=>(g.markets||[]).some(m=>m.player));
    if(!games.length){
      initialized=true;
      setReady(true);
      sel.refresh?.();
      return;
    }

    running=true;
    setReady(false);
    try{
      const selectedId=document.getElementById('gameSelect')?.value;
      const selected=games.find(g=>g.id===selectedId);
      const targets=[selected,...games]
        .filter(Boolean)
        .filter((g,i,a)=>a.findIndex(x=>x.id===g.id)===i)
        .slice(0,6);

      await Promise.all(targets.map(g=>sel.verifyGameRoster(g)));
      initialized=true;
      sel.refresh?.();
      if(typeof generate==='function') await generate();
      // Do not call the legacy QoL refresh here. It renders raw props first and
      // causes the visible prop -> PASS flicker before the strict engine redraws.
      sel.refresh?.();
      setReady(true);
    }catch(err){
      console.warn('Player prop initialization failed',err);
      // Show the strict engine state even if browser-side context is unavailable.
      sel.refresh?.();
      setReady(true);
    }finally{
      running=false;
    }
  }

  function boot(){
    setReady(false);
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(window.NFL_SELECTIVITY?.verifyGameRoster && typeof state!=='undefined' && (state.games||[]).length){
        clearInterval(timer);
        verifyProps();
      }else if(tries>=100){
        clearInterval(timer);
        setReady(true);
      }
    },100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  document.getElementById('gameSelect')?.addEventListener('change',()=>setTimeout(verifyProps,0));
  window.addEventListener('nfl-diagnostics-updated',()=>{if(!initialized)setTimeout(verifyProps,50)});
  window.NFL_PROP_INIT_FIX={refresh:verifyProps};
})();
