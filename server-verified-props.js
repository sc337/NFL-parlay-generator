(() => {
  const original = typeof window.loadEspnRoster === 'function' ? window.loadEspnRoster : null;

  function serverRoster(teamName){
    const seen=new Set(), out=[];
    try{
      for(const game of state.games||[]){
        for(const market of game.markets||[]){
          if(!market?.player || market.team!==teamName || !market._serverRosterVerified) continue;
          const key=normalizePlayerName(market.player);
          if(!key || seen.has(key)) continue;
          seen.add(key);
          out.push({name:market.player,team:teamName,position:market.position||'',source:'ESPN server'});
        }
      }
    }catch{}
    return out;
  }

  window.loadEspnRoster=async function(teamName){
    const fallback=serverRoster(teamName);
    let live=[];
    if(original){
      try{live=await original(teamName)||[];}catch(err){console.warn('Browser ESPN roster unavailable; using server verification',teamName,err);}
    }
    const merged=new Map();
    for(const p of [...live,...fallback]){
      if(!p?.name) continue;
      merged.set(normalizePlayerName(p.name),p);
    }
    return [...merged.values()];
  };

  window.NFL_SERVER_VERIFIED_PROPS={serverRoster};
})();
