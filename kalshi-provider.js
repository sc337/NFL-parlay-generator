(() => {
 const SNAPSHOT='data/kalshi-nfl.json',CACHE_KEY='nflKalshiSnapshotV1',MAX_AGE_MS=2*60*60*1000;
 let requestId=0,lastStamp=null,lastResult={code:'loading',message:'Loading NFL markets'};
 const diag=d=>window.NFL_DIAGNOSTICS?.add?.(d);
 function cached(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&Array.isArray(x.games)?x:null}catch{return null}}
 function saveCache(x){try{localStorage.setItem(CACHE_KEY,JSON.stringify(x))}catch{}}
 const usable=x=>{const at=Date.parse(x?.updated_at||'');return Number.isFinite(at)&&at<=Date.now()+300000&&Date.now()-at<=MAX_AGE_MS};
 const isPregame=g=>g?.game_status==='pre'&&Number.isFinite(Date.parse(g.commence_time))&&Date.parse(g.commence_time)>Date.now();
 function validate(data){if(!data||!Array.isArray(data.games)||data.games.some(g=>!Array.isArray(g.markets)))throw Error('NFL snapshot has invalid games/markets');const at=Date.parse(data.updated_at||'');if(!Number.isFinite(at)||at>Date.now()+300000)throw Error('NFL snapshot timestamp invalid');if(Date.now()-at>MAX_AGE_MS){const e=Error('NFL quotes expired ('+Math.round((Date.now()-at)/60000)+'m old)');e.code='expired';throw e}const games=data.games.filter(isPregame);if(!games.length){const e=Error('No upcoming NFL markets in the feed');e.code='empty';throw e}return games}
 async function load(){
  const uiRequest=window.DASHBOARD_UI?.begin('nfl'),request=++requestId,token=window.__SPORT_TOKEN;
  const current=()=>request===requestId&&(window.__ACTIVE_SPORT||'nfl')==='nfl'&&token===window.__SPORT_TOKEN;
  const status=document.getElementById('kalshiStatus'),warm=cached(),started=performance.now();
  async function apply(data,games,source){
   if(!current())return false;state.games=games;state.propsLoaded?.clear?.();hydrateGames();lastStamp=Date.parse(data.updated_at);
   const age=Math.max(0,Math.round((Date.now()-lastStamp)/60000)),props=games.reduce((n,g)=>n+g.markets.filter(m=>m.player).length,0),total=games.reduce((n,g)=>n+g.markets.length,0);
   window.FEED_FRESHNESS?.set?.('nfl',data.updated_at);lastResult={code:'ready',source,message:source+' · '+games.length+' upcoming NFL games · '+props+' player props · '+total+' markets · updated '+age+'m ago'};
   if(status)status.textContent=(age>30?'Delayed':'Active')+' · '+total+' markets';setStatus(lastResult.message);window.NFL_PROJECTIONS?.refresh?.();await generate();return current();
  }
  try{
   if(current()&&!state.games?.length&&usable(warm)){const games=warm.games.filter(isPregame);if(games.length){state.games=games;state.propsLoaded?.clear?.();hydrateGames();setStatus('Cached Kalshi markets · refreshing…');setTimeout(()=>{if(current()){window.NFL_PROJECTIONS?.refresh?.();generate()}},0)}}
   if(status)status.textContent='Checking…';let data,games,source='Kalshi snapshot',snapshotError;
   try{const res=await fetch(SNAPSHOT+'?t='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('NFL snapshot HTTP '+res.status);data=await res.json();if(!current())return false;games=validate(data)}catch(e){snapshotError=e}
   if(!current())return false;
   if(snapshotError){
    if(window.NFL_LIVE_RECOVERY?.load){setStatus('Recovering fresh NFL markets…');try{data=await window.NFL_LIVE_RECOVERY.load();if(!current())return false;games=validate(data);source='Kalshi live recovery'}catch(e){diag({source:'Kalshi live recovery',ok:false,error:String(e.message||e)})}}
    if(!games){if(usable(warm)){const valid=warm.games.filter(isPregame);if(valid.length){data=warm;games=valid;source='Cached Kalshi · snapshot refresh failed'}}}
    if(!games)throw snapshotError;
   }
   saveCache(data);diag({source,ok:true,count:games.length,ms:Math.round(performance.now()-started),note:data.updated_at});
   return await apply(data,games,source);
  }catch(e){
   if(!current())return false;state.games=[];window.PICK_QUALITY?.prepare('nfl',[]);state.propsLoaded?.clear?.();window.PICK_OF_DAY?.show?.('nfl');lastStamp=null;lastResult={code:e.code||'unavailable',message:String(e.message||e)};
   if(status)status.textContent=e.code==='expired'?'Stale':e.code==='empty'?'No upcoming markets':'Unavailable';setStatus(lastResult.message);diag({source:'Kalshi snapshot',ok:false,error:lastResult.message,ms:Math.round(performance.now()-started)});return false;
  }finally{window.DASHBOARD_UI?.end(uiRequest)}
 }
 window.NFL_KALSHI={load,validate,lastResult:()=>lastResult,snapshotAt:()=>lastStamp===null?null:new Date(lastStamp).toISOString(),age:()=>lastStamp===null?Infinity:Math.max(0,Date.now()-lastStamp),clearCache:()=>{try{localStorage.removeItem(CACHE_KEY)}catch{}}};
})();

