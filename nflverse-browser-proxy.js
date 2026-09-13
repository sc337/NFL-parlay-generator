(() => {
  const originalFetch=window.fetch.bind(window);
  const legacy='https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv.gz';
  const csv='https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';
  const proxy='https://r.jina.ai/http://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';
  function setStatus(text){const el=document.getElementById('nflverseStatus');if(el)el.textContent=text;}
  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    if(raw!==legacy) return originalFetch(input,init);
    setStatus('Loading…');
    const start=performance.now();
    for(const url of [csv,proxy]){
      try{
        const res=await originalFetch(url,init);
        if(!res.ok) throw new Error('HTTP '+res.status);
        const text=await res.text();
        if(!/player|season|week/i.test(text.slice(0,500))) throw new Error('Unexpected stats response');
        setStatus('Ready');
        window.NFL_DIAGNOSTICS?.add?.({source:'nflverse',url,status:res.status,ok:true,count:text.split('\n').length-1,ms:Math.round(performance.now()-start),note:'browser CSV fallback'});
        return new Response(text,{status:200,headers:{'content-type':'text/csv'}});
      }catch(err){window.NFL_DIAGNOSTICS?.add?.({source:'nflverse',url,status:'ERR',ok:false,error:String(err.message||err),ms:Math.round(performance.now()-start),note:'browser CSV fallback'});}
    }
    setStatus('Unavailable');
    return originalFetch(input,init);
  };
})();