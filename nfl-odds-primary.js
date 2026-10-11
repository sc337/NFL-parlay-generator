(() => {
  const URL_BASE='https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/';
  let lastError='',requestId=0;
  const playerKey=m=>String(m.player||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function attachContext(game,snapshot){
    const old=(snapshot?.games||[]).find(g=>g.away===game.away&&g.home===game.home&&Math.abs(Date.parse(g.commence_time)-Date.parse(game.commence_time))<300000);
    const at=Date.parse(old?.context?.updated_at||'');
    if(!old||!Number.isFinite(at)||at>Date.now()+300000||Date.now()-at>4*3600000)return false;
    game.context=old.context;
    game.fanDuelPlayerContext=(old.markets||[]).filter(m=>m.player&&m._rosterVerified&&[game.away,game.home].includes(m.team));
    enrichProps(game);
    return true;
  }
  function enrichProps(game){
    for(const m of game.markets||[]){
      m.gameId=game.id;m.kickoff=game.commence_time;
      if(!m.player)continue;
      const previous=(game.fanDuelPlayerContext||[]).filter(x=>playerKey(x)===playerKey(m));
      if(!previous.length||new Set(previous.map(x=>x.team)).size!==1)continue;
      const p=previous.find(x=>String(x.marketKey).replace(/_alternate$/,'')===String(m.marketKey).replace(/_alternate$/,''))||previous[0];
      for(const k of ['team','position','playerId','_rosterVerified','_serverRosterVerified','contextSignals','propHistory','tdOpportunity'])if(p[k]!==undefined)m[k]=p[k];
    }
  }
  function quotaError(status,body){
    return status===401||status===403||status===429||/quota|usage limit|out of requests|invalid api key/i.test(body||'');
  }
  async function load(){
    if(!state.apiKey){lastError='No Odds API key saved';return false;}
    if(state.apiUsage.remaining===0){lastError='Odds API quota exhausted';return false;}
    const token=window.__SPORT_TOKEN,request=++requestId;
    const current=()=>request===requestId&&(window.__ACTIVE_SPORT||'nfl')==='nfl'&&token===window.__SPORT_TOKEN;
    try{
      const url=new URL(URL_BASE);
      url.searchParams.set('apiKey',state.apiKey);
      url.searchParams.set('regions','us');
      url.searchParams.set('markets','h2h,spreads,totals');
      url.searchParams.set('oddsFormat','american');
      url.searchParams.set('bookmakers','fanduel');
      const response=await fetch(url.toString(),{signal:AbortSignal.timeout(15000)});
      trackApiUsage(response);
      if(!response.ok){
        const body=await response.text();
        lastError=quotaError(response.status,body)?'Odds API key/quota unavailable ('+response.status+')':'Odds API HTTP '+response.status;
        return false;
      }
      const games=await response.json();
      if(!Array.isArray(games))throw Error('Invalid sportsbook response');
      if(!current())return false;
      const normalized=games.map(g=>{
        const book=(g.bookmakers||[]).find(b=>b.key==='fanduel');
        if(!book)return null;
        const markets=[];
        for(const m of book.markets||[])for(const out of m.outcomes||[]){
          if(!Number.isFinite(out.price))continue;
          const common={marketKey:m.key,price:out.price,confidence:Math.round(impliedProbability(out.price)*100),source:'FanDuel',quotedAt:m.last_update||book.last_update};
          if(m.key==='h2h')markets.push({...common,type:'h2h',name:out.name+' ML',team:out.name});
          if(m.key==='spreads'&&Number.isFinite(out.point))markets.push({...common,type:'spreads',point:out.point,name:out.name+' '+(out.point>0?'+':'')+out.point,team:out.name});
          if(m.key==='totals'&&Number.isFinite(out.point))markets.push({...common,type:'totals',point:out.point,name:out.name+' '+out.point,side:out.name.toLowerCase(),team:'Game'});
        }
        return markets.length?{id:g.id,away:g.away_team,home:g.home_team,commence_time:g.commence_time,game_status:'pre',markets,dataSource:'FanDuel'}:null;
      }).filter(g=>g&&Date.parse(g.commence_time)>Date.now());
      if(!normalized.length){lastError='No upcoming FanDuel NFL markets';return false;}
      // Reuse only matchup context; exchange prices never replace sportsbook quotes.
      let context={games:state.games};
      try{
        const response=await fetch('data/kalshi-nfl.json',{signal:AbortSignal.timeout(10000)});
        if(response.ok)context=await response.json();
      }catch(e){console.warn('Matchup context unavailable',e);}
      if(!current())return false;
      for(const game of normalized)attachContext(game,context);
      state.games=normalized;
      state.propsLoaded.clear();state.propsLoading.clear();
      hydrateGames();
      setStatus('FanDuel via Odds API · '+normalized.length+' games · '+(state.apiUsage.remaining??'—')+' requests remaining');
      await generate();
      if(!current())return false;
      if(normalized.some(g=>g.propStatus==='error')){
        lastError='Odds API player-prop request failed';return false;
      }
      lastError='';
      return true;
    }catch(e){lastError=String(e.message||e);console.warn('Odds API load failed; falling back to Kalshi',e);return false;}
  }
  window.NFL_ODDS_PRIMARY={load,attachContext,enrichProps,lastError:()=>lastError};
})();
