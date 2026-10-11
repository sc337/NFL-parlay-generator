(() => {
  const URL_BASE='https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/';
  let lastError='';
  function quotaError(status,body){
    return status===401||status===403||status===429||/quota|usage limit|out of requests|invalid api key/i.test(body||'');
  }
  async function load(){
    if(!state.apiKey){lastError='No Odds API key saved';return false;}
    if(state.apiUsage.remaining===0){lastError='Odds API quota exhausted';return false;}
    const token=window.__SPORT_TOKEN;
    try{
      const url=new URL(URL_BASE);
      url.searchParams.set('apiKey',state.apiKey);
      url.searchParams.set('regions','us');
      url.searchParams.set('markets','h2h,spreads,totals');
      url.searchParams.set('oddsFormat','american');
      url.searchParams.set('bookmakers','fanduel');
      const response=await fetch(url.toString());
      trackApiUsage(response);
      if(!response.ok){
        const body=await response.text();
        lastError=quotaError(response.status,body)?'Odds API key/quota unavailable ('+response.status+')':'Odds API HTTP '+response.status;
        return false;
      }
      const games=await response.json();
      if(!Array.isArray(games))throw Error('Invalid sportsbook response');
      if((window.__ACTIVE_SPORT||'nfl')!=='nfl'||token!==window.__SPORT_TOKEN)return false;
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
        return markets.length?{id:g.id,away:g.away_team,home:g.home_team,commence_time:g.commence_time,markets,dataSource:'FanDuel'}:null;
      }).filter(g=>g&&Date.parse(g.commence_time)>Date.now());
      if(!normalized.length){lastError='No upcoming FanDuel NFL markets';return false;}
      state.games=normalized;
      state.propsLoaded.clear();state.propsLoading.clear();
      hydrateGames();
      setStatus('FanDuel via Odds API · '+normalized.length+' games · '+(state.apiUsage.remaining??'—')+' requests remaining');
      await generate();
      lastError='';
      return true;
    }catch(e){lastError=String(e.message||e);console.warn('Odds API load failed; falling back to Kalshi',e);return false;}
  }
  window.NFL_ODDS_PRIMARY={load,lastError:()=>lastError};
})();