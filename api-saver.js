(() => {
  const PREFIX='nflParlayCache:v3:';
  const MODE_KEY='nflParlayApiSaverMode';
  const STATS_KEY='nflParlayApiSaverStats';
  const originalFetch=window.fetch.bind(window);

  const PROP_GROUPS={
    passing:new Set(['player_pass_yds','player_pass_yds_alternate','player_pass_tds','player_pass_attempts','player_pass_completions']),
    rushing:new Set(['player_rush_yds','player_rush_yds_alternate','player_rush_attempts']),
    receiving:new Set(['player_reception_yds','player_reception_yds_alternate','player_receptions']),
    td:new Set(['player_anytime_td'])
  };

  const TTL={
    full:{slate:10*60e3,props:15*60e3,markets:60*60e3,context:12*60*60e3,nflverse:24*60*60e3,multi:6},
    saver:{slate:30*60e3,props:45*60e3,markets:2*60*60e3,context:12*60*60e3,nflverse:24*60*60e3,multi:3},
    ultra:{slate:60*60e3,props:90*60e3,markets:4*60*60e3,context:24*60*60e3,nflverse:24*60*60e3,multi:1}
  };

  function mode(){
    const v=localStorage.getItem(MODE_KEY)||'saver';
    return TTL[v]?v:'saver';
  }

  function stats(){
    try{return JSON.parse(localStorage.getItem(STATS_KEY))||{hits:0,misses:0};}
    catch{return {hits:0,misses:0};}
  }

  function saveStats(s){
    try{localStorage.setItem(STATS_KEY,JSON.stringify(s));}catch{}
    renderStats();
  }

  function enabledPropMarkets(markets){
    const active=new Set([...document.querySelectorAll('.chip.active')].map(x=>x.dataset.market));
    const allowed=new Set();
    for(const [group,keys] of Object.entries(PROP_GROUPS)){
      if(active.has(group)) for(const key of keys) allowed.add(key);
    }
    return markets.filter(m=>allowed.has(m));
  }

  function normalizedKey(url){
    const u=new URL(url,location.href);
    u.searchParams.delete('apiKey');
    const params=[...u.searchParams.entries()].sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
    u.search='';
    for(const [k,v] of params) u.searchParams.append(k,v);
    return PREFIX+btoa(unescape(encodeURIComponent(u.toString()))).replace(/=+$/,'');
  }

  function classify(url){
    const u=new URL(url,location.href);
    const host=u.hostname;
    const path=u.pathname;
    const cfg=TTL[mode()];

    if(host==='api.the-odds-api.com'){
      if(/\/events\/[^/]+\/markets$/.test(path)) return {ttl:cfg.markets,type:'markets'};
      if(/\/events\/[^/]+\/odds$/.test(path)) return {ttl:cfg.props,type:'props'};
      if(/\/sports\/americanfootball_nfl\/odds\/?$/.test(path)) return {ttl:cfg.slate,type:'slate'};
    }
    if(host==='site.api.espn.com') return {ttl:cfg.context,type:'context'};
    if(host==='github.com' && path.includes('/nflverse/nflverse-data/releases/download/rosters/')) return {ttl:cfg.nflverse,type:'nflverse'};
    return null;
  }

  function readCache(key,ttl){
    try{
      const raw=localStorage.getItem(key);
      if(!raw) return null;
      const entry=JSON.parse(raw);
      if(!entry?.time || Date.now()-entry.time>ttl){localStorage.removeItem(key);return null;}
      return entry;
    }catch{return null;}
  }

  function writeCache(key,res,body){
    try{
      const headers={};
      for(const [k,v] of res.headers.entries()) headers[k]=v;
      localStorage.setItem(key,JSON.stringify({time:Date.now(),status:res.status,statusText:res.statusText,headers,body}));
      prune();
    }catch(err){
      // If storage is full, remove the oldest cache entries and try once more next request.
      prune(true);
      console.warn('API Saver cache write skipped',err);
    }
  }

  function cachedResponse(entry){
    const headers=new Headers(entry.headers||{});
    headers.set('x-nfl-parlay-cache','HIT');
    // A cache hit costs zero new Odds API credits.
    if(headers.has('x-requests-last')) headers.set('x-requests-last','0');
    return new Response(entry.body,{status:entry.status,statusText:entry.statusText,headers});
  }

  function prune(force=false){
    try{
      const entries=[];
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key?.startsWith(PREFIX)) continue;
        let time=0;
        try{time=JSON.parse(localStorage.getItem(key))?.time||0;}catch{}
        entries.push({key,time});
      }
      entries.sort((a,b)=>a.time-b.time);
      const keep=force?10:30;
      while(entries.length>keep){localStorage.removeItem(entries.shift().key);}
    }catch{}
  }

  function rewriteSelectiveMarkets(rawUrl){
    try{
      const u=new URL(rawUrl,location.href);
      if(u.hostname!=='api.the-odds-api.com') return u.toString();
      if(!/\/events\/[^/]+\/odds$/.test(u.pathname)) return u.toString();
      const current=(u.searchParams.get('markets')||'').split(',').filter(Boolean);
      if(!current.length) return u.toString();
      const filtered=enabledPropMarkets(current);
      if(filtered.length) u.searchParams.set('markets',filtered.join(','));
      return u.toString();
    }catch{return rawUrl;}
  }

  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    if(!raw) return originalFetch(input,init);

    const selective=rewriteSelectiveMarkets(raw);
    const rule=classify(selective);
    if(!rule) return originalFetch(input,init);

    const key=normalizedKey(selective);
    const hit=readCache(key,rule.ttl);
    const s=stats();

    if(hit){
      s.hits=(s.hits||0)+1; saveStats(s);
      return cachedResponse(hit);
    }

    s.misses=(s.misses||0)+1; saveStats(s);
    let request=selective;
    if(typeof input!=='string') request=new Request(selective,input);
    const res=await originalFetch(request,init);

    if(res.ok){
      try{writeCache(key,res,await res.clone().text());}catch{}
    }
    return res;
  };

  function clearCache(){
    const keys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach(k=>localStorage.removeItem(k));
    localStorage.setItem(STATS_KEY,JSON.stringify({hits:0,misses:0}));
    renderStats();
  }

  function renderStats(){
    const s=stats();
    const el=document.getElementById('apiCacheStats');
    if(el) el.textContent=(s.hits||0)+' cache hits • '+(s.misses||0)+' live fetches';
    const modeEl=document.getElementById('apiSaverMode');
    if(modeEl && modeEl.value!==mode()) modeEl.value=mode();
  }

  function installMultiGameLimiter(){
    const original=window.ensurePropsForMultiGame;
    if(typeof original!=='function' || original.__apiSaverWrapped) return;
    const wrapped=async function(limit=6){
      return original(Math.min(limit,TTL[mode()].multi));
    };
    wrapped.__apiSaverWrapped=true;
    window.ensurePropsForMultiGame=wrapped;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const select=document.getElementById('apiSaverMode');
    if(select){
      select.value=mode();
      select.addEventListener('change',()=>{
        localStorage.setItem(MODE_KEY,select.value);
        installMultiGameLimiter();
        renderStats();
      });
    }
    document.getElementById('clearApiCacheBtn')?.addEventListener('click',()=>{
      clearCache();
      const el=document.getElementById('apiCacheStats');
      if(el) el.textContent='Cache cleared • next request will refresh';
    });
    installMultiGameLimiter();
    renderStats();
  });

  window.NFL_PARLAY_API_SAVER={clearCache,mode,stats};
})();
