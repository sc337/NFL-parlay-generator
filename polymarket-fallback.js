(() => {
  const CACHE_KEY='nflParlayPolymarketFallback:v2';
  const CACHE_TTL=10*60*1000;

  const NFL_TEAMS=[
    ['Arizona Cardinals',['arizona cardinals','cardinals','ari']],['Atlanta Falcons',['atlanta falcons','falcons','atl']],['Baltimore Ravens',['baltimore ravens','ravens','bal']],['Buffalo Bills',['buffalo bills','bills','buf']],['Carolina Panthers',['carolina panthers','panthers','car']],['Chicago Bears',['chicago bears','bears','chi']],['Cincinnati Bengals',['cincinnati bengals','bengals','cin']],['Cleveland Browns',['cleveland browns','browns','cle']],['Dallas Cowboys',['dallas cowboys','cowboys','dal']],['Denver Broncos',['denver broncos','broncos','den']],['Detroit Lions',['detroit lions','lions','det']],['Green Bay Packers',['green bay packers','packers','gb']],['Houston Texans',['houston texans','texans','hou']],['Indianapolis Colts',['indianapolis colts','colts','ind']],['Jacksonville Jaguars',['jacksonville jaguars','jaguars','jax']],['Kansas City Chiefs',['kansas city chiefs','chiefs','kc']],['Las Vegas Raiders',['las vegas raiders','raiders','lv']],['Los Angeles Chargers',['los angeles chargers','la chargers','chargers','lac']],['Los Angeles Rams',['los angeles rams','la rams','rams','lar']],['Miami Dolphins',['miami dolphins','dolphins','mia']],['Minnesota Vikings',['minnesota vikings','vikings','min']],['New England Patriots',['new england patriots','patriots','ne']],['New Orleans Saints',['new orleans saints','saints','no']],['New York Giants',['new york giants','ny giants','giants','nyg']],['New York Jets',['new york jets','ny jets','jets','nyj']],['Philadelphia Eagles',['philadelphia eagles','eagles','phi']],['Pittsburgh Steelers',['pittsburgh steelers','steelers','pit']],['San Francisco 49ers',['san francisco 49ers','49ers','niners','sf']],['Seattle Seahawks',['seattle seahawks','seahawks','sea']],['Tampa Bay Buccaneers',['tampa bay buccaneers','buccaneers','bucs','tb']],['Tennessee Titans',['tennessee titans','titans','ten']],['Washington Commanders',['washington commanders','commanders','was']]
  ];

  function parseArray(value){if(Array.isArray(value))return value;if(typeof value!=='string')return [];try{const x=JSON.parse(value);return Array.isArray(x)?x:[];}catch{return [];}}
  function americanFromProbability(p){p=Number(p);if(!Number.isFinite(p)||p<=0||p>=1)return null;return p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);}
  function findTeams(text){const s=String(text||'').toLowerCase(),hits=[];for(const [name,aliases] of NFL_TEAMS){let best=-1;for(const alias of aliases){const re=new RegExp('(^|[^a-z0-9])'+alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i'),m=s.match(re);if(m){best=m.index??0;break;}}if(best>=0)hits.push({name,index:best});}return hits.sort((a,b)=>a.index-b.index).map(x=>x.name);}
  function teamMention(text,teams){return findTeams(text).find(t=>teams.includes(t))||null;}
  function pricePairs(m){const outcomes=parseArray(m.outcomes),prices=parseArray(m.outcomePrices).map(Number);return outcomes.map((name,i)=>({name:String(name),prob:prices[i]})).filter(x=>Number.isFinite(x.prob)&&x.prob>0&&x.prob<1);}
  function addMarket(markets,leg){if(!leg||typeof leg.price!=='number')return;const key=[leg.type,leg.team,leg.side||'',leg.point??'',leg.name].join('|');if(markets.some(x=>[x.type,x.team,x.side||'',x.point??'',x.name].join('|')===key))return;markets.push({...leg,source:'Polymarket',confidence:Math.round(leg.prob*100),polymarketProbability:leg.prob});}

  function normalizeEvent(event){
    const eventText=[event.title,event.subtitle,event.slug,event.seriesSlug].filter(Boolean).join(' '),teams=findTeams(eventText).slice(0,2);if(teams.length<2)return null;
    const markets=[];
    for(const m of event.markets||[]){
      if(m.closed||m.active===false)continue;
      const text=[m.question,m.marketType,m.groupItemTitle,m.slug].filter(Boolean).join(' '),lower=text.toLowerCase(),pairs=pricePairs(m);if(!pairs.length)continue;
      const byTeam=pairs.filter(p=>teams.some(t=>findTeams(p.name).includes(t)));
      if(byTeam.length>=2){for(const p of byTeam){const t=teamMention(p.name,teams),odds=americanFromProbability(p.prob);if(t&&odds!=null)addMarket(markets,{type:'h2h',name:t+' ML',team:t,price:odds,prob:p.prob});}continue;}
      const yes=pairs.find(p=>p.name.toLowerCase()==='yes'),no=pairs.find(p=>p.name.toLowerCase()==='no'),mentioned=teamMention(text,teams),other=mentioned?teams.find(t=>t!==mentioned):null;
      const looksSpread=/spread|cover|\+\d|\-\d/.test(lower),looksTotal=/total|over|under/.test(lower),looksMoneyline=/moneyline|winner|\bwin\b|\bbeat\b/.test(lower);
      if(looksSpread&&yes&&mentioned){const match=text.match(/([+-]\s*\d+(?:\.\d+)?)/);if(match){const point=Number(match[1].replace(/\s/g,'')),odds=americanFromProbability(yes.prob);if(Number.isFinite(point)&&odds!=null)addMarket(markets,{type:'spreads',name:mentioned+' '+(point>0?'+':'')+point,team:mentioned,price:odds,prob:yes.prob,point});}continue;}
      if(looksTotal&&yes){const match=text.match(/(?:over|under|total(?:\s+of)?)[^0-9]*(\d+(?:\.\d+)?)/i)||text.match(/(\d+(?:\.\d+)?)/);if(match){const point=Number(match[1]),side=/under/i.test(text)?'under':'over',yesOdds=americanFromProbability(yes.prob);if(yesOdds!=null)addMarket(markets,{type:'totals',name:(side==='over'?'Over ':'Under ')+point,team:'Game',price:yesOdds,prob:yes.prob,side,point});if(no){const noSide=side==='over'?'under':'over',noOdds=americanFromProbability(no.prob);if(noOdds!=null)addMarket(markets,{type:'totals',name:(noSide==='over'?'Over ':'Under ')+point,team:'Game',price:noOdds,prob:no.prob,side:noSide,point});}}continue;}
      if((looksMoneyline||(!looksSpread&&!looksTotal))&&yes&&mentioned){const yesOdds=americanFromProbability(yes.prob);if(yesOdds!=null)addMarket(markets,{type:'h2h',name:mentioned+' ML',team:mentioned,price:yesOdds,prob:yes.prob});if(no&&other){const noOdds=americanFromProbability(no.prob);if(noOdds!=null)addMarket(markets,{type:'h2h',name:other+' ML',team:other,price:noOdds,prob:no.prob});}}
    }
    if(!markets.length)return null;const start=event.startTime||event.eventDate||event.startDate||event.markets?.[0]?.gameStartTime||event.markets?.[0]?.startDate;
    return{id:'demo-poly-'+event.id,away:teams[0],home:teams[1],commence_time:start||new Date().toISOString(),markets,dataSource:'Polymarket',polymarketEvent:event.slug||event.id};
  }

  function readCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY));if(x?.time&&Date.now()-x.time<CACHE_TTL&&Array.isArray(x.games))return x.games;}catch{}return null;}
  function writeCache(games){try{localStorage.setItem(CACHE_KEY,JSON.stringify({time:Date.now(),games}));}catch{}}
  async function getJson(url){const res=await fetch(url);if(!res.ok)throw new Error('Polymarket '+res.status);return res.json();}

  async function fetchGames(){
    const cached=readCache();if(cached?.length)return cached;
    let events=[];
    // Use the documented NFL tag first. This is more reliable than full-text search.
    try{
      const tag=await getJson('https://gamma-api.polymarket.com/tags/slug/nfl');
      if(tag?.id){
        const url=new URL('https://gamma-api.polymarket.com/events');
        url.searchParams.set('tag_id',tag.id);url.searchParams.set('active','true');url.searchParams.set('closed','false');url.searchParams.set('limit','100');url.searchParams.set('order','startDate');url.searchParams.set('ascending','true');
        const raw=await getJson(url);events=Array.isArray(raw)?raw:(raw.events||[]);
      }
    }catch(err){console.warn('Polymarket NFL tag lookup failed',err);}
    // Search is the documented fallback. /public-search was removed/deprecated.
    if(!events.length){
      for(const q of ['NFL','National Football League']){
        try{
          const url=new URL('https://gamma-api.polymarket.com/search');url.searchParams.set('q',q);url.searchParams.set('limit_per_type','100');url.searchParams.set('keep_closed_markets','0');url.searchParams.set('search_profiles','false');
          const raw=await getJson(url);events=raw.events||[];if(events.length)break;
        }catch(err){console.warn('Polymarket search failed',q,err);}
      }
    }
    const now=Date.now()-6*60*60*1000,horizon=Date.now()+14*24*60*60*1000;
    const games=events.filter(e=>!e.closed&&e.active!==false&&!e.ended).map(normalizeEvent).filter(Boolean).filter(g=>{const t=Date.parse(g.commence_time);return !Number.isFinite(t)||(t>=now&&t<=horizon);}).sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time));
    if(games.length)writeCache(games);return games;
  }

  function markSource(games){const note=document.querySelector('.source-note');if(note)note.textContent='Caesars = primary lines & props • Polymarket = free fallback implied prices • ESPN/nflverse = context';const sourceCard=document.querySelector('.source-status-card');if(sourceCard&&!document.getElementById('polymarketStatus')){const div=document.createElement('div');div.innerHTML='<span>Polymarket <b id="polymarketStatus">Fallback ready</b></span>';sourceCard.insertBefore(div,sourceCard.querySelector('.source-note'));}const p=document.getElementById('polymarketStatus');if(p)p.textContent=games.length?'Active fallback':'Unavailable';}
  async function loadFallback(){try{setStatus('Loading free Polymarket NFL markets…');const games=await fetchGames();if(!games.length)throw new Error('No active NFL markets returned by Polymarket');state.games=games;state.propsLoaded.clear();hydrateGames();markSource(games);const legs=document.getElementById('legsSelect');if(state.mode==='sgp'&&legs&&Number(legs.value)>2)legs.value='2';setStatus(`Polymarket fallback • ${games.length} NFL games • implied market prices`);await generate();const title=document.getElementById('resultsTitle');if(title&&state.mode==='sgp')title.textContent='Polymarket fallback • team markets only';window.NFL_PARLAY_DAILY_PICKS?.refresh?.();return true;}catch(err){console.warn('Polymarket fallback unavailable',err);markSource([]);state.games=structuredClone(demoGames);hydrateGames();setStatus('Live sources unavailable — demo data active');await generate();return false;}}
  const originalLoadData=loadData;loadData=async function(){if(!state.apiKey)return loadFallback();await originalLoadData();const status=document.getElementById('dataStatus')?.textContent||'';if(/API unavailable|demo data active/i.test(status))return loadFallback();};
  window.NFL_POLYMARKET_FALLBACK={load:loadFallback,fetchGames,clearCache:()=>{localStorage.removeItem(CACHE_KEY);localStorage.removeItem('nflParlayPolymarketFallback:v1');}};
  if(!state.apiKey)loadFallback();
})();