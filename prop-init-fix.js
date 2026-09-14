(() => {
  let running=false;
  let initialized=false;

  async function verifyProps(){
    if(running) return;
    const sel=window.NFL_SELECTIVITY;
    if(!sel?.verifyGameRoster || typeof state==='undefined') return;
    const games=(state.games||[]).filter(g=>(g.markets||[]).some(m=>m.player));
    if(!games.length) return;

    running=true;
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
      window.NFL_QOL?.refresh?.();
      window.NFL_QOL_V3?.refresh?.();
    }catch(err){
      console.warn('Player prop initialization failed',err);
    }finally{
      running=false;
    }
  }

  function boot(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(window.NFL_SELECTIVITY?.verifyGameRoster && typeof state!=='undefined' && (state.games||[]).length){
        clearInterval(timer);
        verifyProps();
      }else if(tries>=80){
        clearInterval(timer);
      }
    },100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  document.getElementById('gameSelect')?.addEventListener('change',()=>setTimeout(verifyProps,0));
  window.addEventListener('nfl-diagnostics-updated',()=>{if(!initialized)setTimeout(verifyProps,50)});
  window.NFL_PROP_INIT_FIX={refresh:verifyProps};
})();