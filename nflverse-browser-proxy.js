(() => {
  const originalFetch=window.fetch.bind(window);
  const legacy='https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv.gz';
  const csv='https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';
  const proxy='https://r.jina.ai/http://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';
  function setStatus(text){const el=document.getElementById('nflverseStatus');if(el)el.textContent=text;}
  function hasLiveProps(){try{return (state.games||[]).some(g=>!String(g.id||'').startsWith('demo-')&&(g.markets||[]).some(m=>m.player));}catch{return false;}}
  function idleDelay(){return new Promise(resolve=>{const run=()=>setTimeout(resolve,1200);if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:3500});else setTimeout(resolve,3000);});}
  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    if(raw!==legacy) return originalFetch(input,init);
    setStatus('Queued');
    await idleDelay();
    // Do not download/parse the large stats file until live player props actually exist.
    if(!hasLiveProps()){
      setStatus('Waiting for props');
      window.NFL_DIAGNOSTICS?.add?.({source:'nflverse',url:legacy,status:'SKIP',ok:true,count:0,ms:0,note:'deferred until live player props exist'});
      return new Response('season,week,player_display_name\n',{status:200,headers:{'content-type':'text/csv'}});
    }
    setStatus('Loading…');
    const start=performance.now();
    for(const url of [csv,proxy]){
      try{
        const res=await originalFetch(url,init);
        if(!res.ok) throw new Error('HTTP '+res.status);
        const text=await res.text();
        if(!/player|season|week/i.test(text.slice(0,500))) throw new Error('Unexpected stats response');
        setStatus('Ready');
        window.NFL_DIAGNOSTICS?.add?.({source:'nflverse',url,status:res.status,ok:true,count:text.split('\n').length-1,ms:Math.round(performance.now()-start),note:'lazy browser CSV'});
        return new Response(text,{status:200,headers:{'content-type':'text/csv'}});
      }catch(err){window.NFL_DIAGNOSTICS?.add?.({source:'nflverse',url,status:'ERR',ok:false,error:String(err.message||err),ms:Math.round(performance.now()-start),note:'lazy browser CSV'});}
    }
    setStatus('Unavailable');
    return new Response('season,week,player_display_name\n',{status:200,headers:{'content-type':'text/csv'}});
  };
})();