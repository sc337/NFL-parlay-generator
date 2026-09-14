(() => {
  let running=false,initialized=false,pending=false,requestId=0;
  function setReady(ready){document.documentElement.classList.toggle('recommendations-ready',!!ready);document.documentElement.classList.toggle('recommendations-verifying',!ready)}
  async function verifyProps(){
    const myId=++requestId;
    if(running){pending=true;return}
    const sel=window.NFL_SELECTIVITY;if(!sel?.verifyGameRoster||typeof state==='undefined')return;
    const games=(state.games||[]).filter(g=>(g.markets||[]).some(m=>m.player));
    if(!games.length){initialized=true;setReady(true);sel.refresh?.();return}
    running=true;pending=false;setReady(false);
    try{
      const selectedId=document.getElementById('gameSelect')?.value;
      const selected=games.find(g=>g.id===selectedId);
      // Verify only the currently selected game on a dropdown change. Background
      // verification of unrelated games caused overlapping renders and Safari flicker.
      if(selected) await sel.verifyGameRoster(selected);
      else await Promise.all(games.slice(0,4).map(g=>sel.verifyGameRoster(g)));
      initialized=true;
      if(myId===requestId){
        sel.refresh?.();
        // Do not call generate() here. app.js owns builder generation on game change.
        // Calling it from both layers caused duplicate async renders.
        setReady(true);
      }
    }catch(err){console.warn('Player prop verification failed',err);if(myId===requestId){sel.refresh?.();setReady(true)}}
    finally{
      running=false;
      if(pending){pending=false;queueMicrotask(verifyProps)}
    }
  }
  function boot(){setReady(false);let tries=0;const timer=setInterval(()=>{tries++;if(window.NFL_SELECTIVITY?.verifyGameRoster&&typeof state!=='undefined'&&(state.games||[]).length){clearInterval(timer);verifyProps()}else if(tries>=100){clearInterval(timer);setReady(true)}},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  // app.js already generates the builder on change. This listener only refreshes
  // the verified top-card model after the selection settles.
  document.getElementById('gameSelect')?.addEventListener('change',()=>{setReady(false);setTimeout(verifyProps,0)});
  window.addEventListener('nfl-diagnostics-updated',()=>{if(!initialized)setTimeout(verifyProps,50)});
  window.NFL_PROP_INIT_FIX={refresh:verifyProps};
})();