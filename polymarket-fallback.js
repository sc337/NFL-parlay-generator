(() => {
  const CACHE_KEY='nflParlayPolymarketFallback:v4';
  const CACHE_TTL=10*60*1000;
  const NFL_TEAMS=[
    ['Arizona Cardinals',['arizona cardinals','cardinals','ari']],['Atlanta Falcons',['atlanta falcons','falcons','atl']],['Baltimore Ravens',['baltimore ravens','ravens','bal']],['Buffalo Bills',['buffalo bills','bills','buf']],['Carolina Panthers',['carolina panthers','panthers','car']],['Chicago Bears',['chicago bears','bears','chi']],['Cincinnati Bengals',['cincinnati bengals','bengals','cin']],['Cleveland Browns',['cleveland browns','browns','cle']],['Dallas Cowboys',['dallas cowboys','cowboys','dal']],['Denver Broncos',['denver broncos','broncos','den']],['Detroit Lions',['detroit lions','lions','det']],['Green Bay Packers',['green bay packers','packers','gb']],['Houston Texans',['houston texans','texans','hou']],['Indianapolis Colts',['indianapolis colts','colts','ind']],['Jacksonville Jaguars',['jacksonville jaguars','jaguars','jax']],['Kansas City Chiefs',['kansas city chiefs','chiefs','kc']],['Las Vegas Raiders',['las vegas raiders','raiders','lv']],['Los Angeles Chargers',['los angeles chargers','la chargers','chargers','lac']],['Los Angeles Rams',['los angeles rams','la rams','rams','lar']],['Miami Dolphins',['miami dolphins','dolphins','mia']],['Minnesota Vikings',['minnesota vikings','vikings','min']],['New England Patriots',['new england patriots','patriots','ne']],['New Orleans Saints',['new orleans saints','saints','no']],['New York Giants',['new york giants','ny giants','giants','nyg']],['New York Jets',['new york jets','ny jets','jets','nyj']],['Philadelphia Eagles',['philadelphia eagles','eagles','phi']],['Pittsburgh Steelers',['pittsburgh steelers','steelers','pit']],['San Francisco 49ers',['san francisco 49ers','49ers','niners','sf']],['Seattle Seahawks',['seattle seahawks','seahawks','sea']],['Tampa Bay Buccaneers',['tampa bay buccaneers','buccaneers','bucs','tb']],['Tennessee Titans',['tennessee titans','titans','ten']],['Washington Commanders',['washington commanders','commanders','was']]
  ];
  const PROP_STATS=[
    {re:/passing yards?/i,type:'passing',marketKey:'player_pass_yds',label:'passing yards'},
    {re:/passing (?:touchdowns?|tds?)|touchdowns? thrown/i,type:'passing',marketKey:'player_pass_tds',label:'passing TDs'},
    {re:/pass(?:ing)? attempts?/i,type:'passing',marketKey:'player_pass_attempts',label:'pass attempts'},
    {re:/pass(?:ing)? completions?|completions?/i,type:'passing',marketKey:'player_pass_completions',label:'completions'},
    {re:/rushing yards?/i,type:'rushing',marketKey:'player_rush_yds',label:'rushing yards'},
    {re:/rush(?:ing)? attempts?|carries/i,type:'rushing',marketKey:'player_rush_attempts',label:'rush attempts'},
    {re:/receiving yards?/i,type:'receiving',marketKey:'player_reception_yds',label:'receiving yards'},
    {re:/receptions?|catches/i,type:'receiving',marketKey:'player_receptions',label:'receptions'},
    {re:/anytime (?:touchdown|td)|score (?:a |an )?touchdown|touchdown scorer/i,type:'td',marketKey:'player_anytime_td',label:'anytime TD',td:true}
  ];

  function parseArray(v){if(Array.isArray(v))return v;if(typeof v!=='string')return [];try{const x=JSON.parse(v);return Array.isArray(x)?x:[];}catch{return [];}}
  function num(...vals){for(const v of vals){const n=Number(v);if(Number.isFinite(n))return n;}return 0;}
  function americanFromProbability(p){p=Number(p);if(!Number.isFinite(p)||p<=0||p>=1)return null;return p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);}
  function findTeams(text){const s=String(text||'').toLowerCase(),hits=[];for(const [name,aliases] of NFL_TEAMS){let best=-1;for(const alias of aliases){const re=new RegExp('(^|[^a-z0-9])'+alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i'),m=s.match(re);if(m){best=m.index??0;break;}}if(best>=0)hits.push({name,index:best});}return hits.sort((a,b)=>a.index-b.index).map(x=>x.name);}
  function teamMention(text,teams){return findTeams(text).find(t=>teams.includes(t))||null;}
  function pricePairs(m){const outcomes=parseArray(m.outcomes),prices=parseArray(m.outcomePrices).map(Number);return outcomes.map((name,i)=>({name:String(name),prob:prices[i]})).filter(x=>Number.isFinite(x.prob)&&x.prob>0&&x.prob<1);}
  function sourceQuality(m,prob){
    let q=50;const liquidity=num(m.liquidityNum,m.liquidity,m.liquidityClob),volume=num(m.volumeNum,m.volume,m.volume24hr,m.volume1wk),bid=num(m.bestBid),ask=num(m.bestAsk);
    if(prob>=.15&&prob<=.85)q+=8;else if(prob<.06||prob>.94)q-=22;else q-=5;
    if(liquidity>=10000)q+=14;else if(liquidity>=2500)q+=9;else if(liquidity>=500)q+=4;else if(liquidity>0&&liquidity<100)q-=8;
    if(volume>=25000)q+=12;else if(volume>=5000)q+=8;else if(volume>=1000)q+=4;else if(volume>0&&volume<100)q-=5;
    if(bid>0&&ask>0&&ask>=bid){const spread=ask-bid;if(spread<=.03)q+=10;else if(spread<=.07)q+=5;else if(spread>.15)q-=18;}
    if(m.acceptingOrders===false)q-=12;return Math.max(0,Math.min(100,Math.round(q)));
  }
  function addMarket(markets,leg,m){
    if(!leg||typeof leg.price!=='number')return;const quality=sourceQuality(m,leg.prob);if(quality<45)return;
    const enriched={...leg,source:'Polymarket',confidence:Math.round(leg.prob*100),polymarketProbability:leg.prob,sourceQuality:quality,liquidity:num(m.liquidityNum,m.liquidity,m.liquidityClob),volume:num(m.volumeNum,m.volume,m.volume24hr,m.volume1wk)};
    const key=[leg.marketKey||leg.type,leg.player||leg.team,leg.side||'',leg.point??''].join('|');const idx=markets.findIndex(x=>[x.marketKey||x.type,x.player||x.team,x.side||'',x.point??''].join('|')===key);
    if(idx<0)markets.push(enriched);else if((markets[idx].sourceQuality||0)<quality)markets[idx]=enriched;
  }
  function plausiblePoint(type,point){if(!Number.isFinite(point))return false;if(type==='spreads')return Math.abs(point)<=20;if(type==='totals')return point>=25&&point<=75;if(type==='passing')return point>=0&&point<=500;if(type==='rushing'||type==='receiving')return point>=0&&point<=250;return true;}

  function inferPlayerName(m,stat){
    const candidates=[m.groupItemTitle,m.question,m.slug].filter(Boolean).map(String);
    for(const raw of candidates){
      let s=raw.replace(/[-_]/g,' ').replace(/\b(player props?|pro football|nfl)\b/ig,' ').replace(/\s+/g,' ').trim();
      if(!s||findTeams(s).length) continue;
      const idx=s.search(stat.re);if(idx>0)s=s.slice(0,idx);
      s=s.replace(/\b(will|does|to|record|have|finish with|go|over|under|at least|more than|less than|fewer than)\b/ig,' ')
        .replace(/[?:,+]/g,' ').replace(/\b\d+(?:\.\d+)?\+?\b/g,' ').replace(/\s+/g,' ').trim();
      const words=s.split(' ').filter(Boolean).filter(w=>!/^(the|a|an|his|their)$/i.test(w));
      if(words.length>=2){
        const name=words.slice(-4).join(' ').replace(/\b(vs|versus)\b.*$/i,'').trim();
        if(name.split(' ').length>=2 && name.length<=40) return name;
      }
    }
    return null;
  }

  function propPoint(text,stat){
    if(stat.td)return null;
    const lower=String(text||'');
    const before=lower.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?=(?:passing yards?|passing (?:touchdowns?|tds?)|touchdowns? thrown|pass(?:ing)? attempts?|pass(?:ing)? completions?|completions?|rushing yards?|rush(?:ing)? attempts?|carries|receiving yards?|receptions?|catches))/i);
    if(before)return Number(before[1]);
    const ou=lower.match(/(?:over|under|at least|more than|less than|fewer than)[^0-9]*(\d+(?:\.\d+)?)/i);
    if(ou)return Number(ou[1]);
    return null;
  }

  function parsePlayerProp(m,markets){
    const text=[m.question,m.groupItemTitle,m.slug].filter(Boolean).join(' '),stat=PROP_STATS.find(x=>x.re.test(text));
    if(!stat)return false;
    const player=inferPlayerName(m,stat);if(!player)return false;
    const pairs=pricePairs(m);if(!pairs.length)return false;
    const point=propPoint(text,stat);if(!stat.td && !plausiblePoint(stat.type,point))return false;
    const byName=new Map(pairs.map(p=>[p.name.toLowerCase(),p]));
    const over=byName.get('over'),under=byName.get('under'),yes=byName.get('yes'),no=byName.get('no');

    const emit=(side,p)=>{if(!p)return;const odds=americanFromProbability(p.prob);if(odds==null)return;const name=stat.td?`${player} anytime TD`:`${player} ${side==='over'?'Over':'Under'} ${point} ${stat.label}`;addMarket(markets,{type:stat.type,marketKey:stat.marketKey,player,name,team:'Player',price:odds,prob:p.prob,side:stat.td?'yes':side,point},m);};

    if(stat.td){emit('yes',yes||over);return !!(yes||over);}
    if(over||under){emit('over',over);emit('under',under);return true;}
    if(yes){
      const lower=text.toLowerCase();let yesSide='over';
      if(/\bunder\b|less than|fewer than/.test(lower))yesSide='under';
      emit(yesSide,yes);if(no)emit(yesSide==='over'?'under':'over',no);return true;
    }
    return false;
  }

  function normalizeEvent(event){
    let teams=findTeams(event.title||'');if(teams.length!==2){const eventText=[event.title,event.subtitle,event.slug,event.seriesSlug].filter(Boolean).join(' ');teams=[...new Set(findTeams(eventText))];}if(teams.length!==2)return null;
    const markets=[];
    for(const m of event.markets||[]){
      if(m.closed||m.active===false)continue;
      if(parsePlayerProp(m,markets))continue;
      const text=[m.question,m.marketType,m.groupItemTitle,m.slug].filter(Boolean).join(' '),lower=text.toLowerCase(),pairs=pricePairs(m);if(!pairs.length)continue;
      const byTeam=pairs.filter(p=>teams.some(t=>findTeams(p.name).includes(t)));
      if(byTeam.length>=2){for(const p of byTeam){const t=teamMention(p.name,teams),odds=americanFromProbability(p.prob);if(t&&odds!=null)addMarket(markets,{type:'h2h',name:t+' ML',team:t,price:odds,prob:p.prob},m);}continue;}
      const yes=pairs.find(p=>p.name.toLowerCase()==='yes'),no=pairs.find(p=>p.name.toLowerCase()==='no'),mentioned=teamMention(text,teams),other=mentioned?teams.find(t=>t!==mentioned):null;
      const looksSpread=/spread|cover|\+\d|\-\d/.test(lower),looksTotal=/total|over|under/.test(lower),looksMoneyline=/moneyline|winner|\bwin\b|\bbeat\b/.test(lower);
      if(looksSpread&&yes&&mentioned){const match=text.match(/([+-]\s*\d+(?:\.\d+)?)/);if(match){const point=Number(match[1].replace(/\s/g,'')),odds=americanFromProbability(yes.prob);if(plausiblePoint('spreads',point)&&odds!=null)addMarket(markets,{type:'spreads',name:mentioned+' '+(point>0?'+':'')+point,team:mentioned,price:odds,prob:yes.prob,point},m);}continue;}
      if(looksTotal&&yes){const match=text.match(/(?:over|under|total(?:\s+of)?)[^0-9]*(\d+(?:\.\d+)?)/i);if(match){const point=Number(match[1]);if(!plausiblePoint('totals',point))continue;const side=/under/i.test(text)?'under':'over',yesOdds=americanFromProbability(yes.prob);if(yesOdds!=null)addMarket(markets,{type:'totals',name:(side==='over'?'Over ':'Under ')+point,team:'Game',price:yesOdds,prob:yes.prob,side,point},m);if(no){const noSide=side==='over'?'under':'over',noOdds=americanFromProbability(no.prob);if(noOdds!=null)addMarket(markets,{type:'totals',name:(noSide==='over'?'Over ':'Under ')+point,team:'Game',price:noOdds,prob:no.prob,side:noSide,point},m);}}continue;}
      if((looksMoneyline||(!looksSpread&&!looksTotal))&&yes&&mentioned){const yesOdds=americanFromProbability(yes.prob);if(yesOdds!=null)addMarket(markets,{type:'h2h',name:mentioned+' ML',team:mentioned,price:yesOdds,prob:yes.prob},m);if(no&&other){const noOdds=americanFromProbability(no.prob);if(noOdds!=null)addMarket(markets,{type:'h2h',name:other+' ML',team:other,price:noOdds,prob:no.prob},m);}}
    }
    if(!markets.length)return null;const ranked=markets.sort((a,b)=>(b.sourceQuality||0)-(a.sourceQuality||0));const start=event.startTime||event.eventDate||event.startDate||event.markets?.[0]?.gameStartTime||event.markets?.[0]?.startDate;
    return{id:'demo-poly-'+event.id,away:teams[0],home:teams[1],commence_time:start||new Date().toISOString(),markets:ranked,dataSource:'Polymarket',polymarketEvent:event.slug||event.id};
  }
  function readCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY));if(x?.time&&Date.now()-x.time<CACHE_TTL&&Array.isArray(x.games))return x.games;}catch{}return null;}
  function writeCache(games){try{localStorage.setItem(CACHE_KEY,JSON.stringify({time:Date.now(),games}));}catch{}}
  async function getJson(url){const res=await fetch(url);if(!res.ok)throw new Error('Polymarket '+res.status);return res.json();}
  async function fetchGames(){
    const cached=readCache();if(cached?.length)return cached;let events=[];
    try{const tag=await getJson('https://gamma-api.polymarket.com/tags/slug/nfl');if(tag?.id){const url=new URL('https://gamma-api.polymarket.com/events');url.searchParams.set('tag_id',tag.id);url.searchParams.set('active','true');url.searchParams.set('closed','false');url.searchParams.set('limit','200');url.searchParams.set('order','startDate');url.searchParams.set('ascending','true');const raw=await getJson(url);events=Array.isArray(raw)?raw:(raw.events||[]);}}catch(err){console.warn('Polymarket NFL tag lookup failed',err);}
    if(!events.length){for(const q of ['NFL Player Props','NFL','National Football League']){try{const url=new URL('https://gamma-api.polymarket.com/search');url.searchParams.set('q',q);url.searchParams.set('limit_per_type','100');url.searchParams.set('keep_closed_markets','0');url.searchParams.set('search_profiles','false');const raw=await getJson(url);events.push(...(raw.events||[]));}catch(err){console.warn('Polymarket search failed',q,err);}}}
    const unique=[...new Map(events.map(e=>[e.id||e.slug,e])).values()];
    const now=Date.now()-6*60*60*1000,horizon=Date.now()+14*24*60*60*1000;
    const games=unique.filter(e=>!e.closed&&e.active!==false&&!e.ended).map(normalizeEvent).filter(Boolean).filter(g=>{const t=Date.parse(g.commence_time);return !Number.isFinite(t)||(t>=now&&t<=horizon);}).sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time));
    if(games.length)writeCache(games);return games;
  }
  function markSource(games){const note=document.querySelector('.source-note');if(note)note.textContent='Caesars = primary lines & props • Polymarket = filtered fallback lines & player props • ESPN/nflverse = context';const p=document.getElementById('polymarketStatus');if(p){const props=games.reduce((n,g)=>n+g.markets.filter(m=>m.player).length,0);p.textContent=games.length?`Active • ${props} props`:'Unavailable';}}
  async function loadFallback(){
    try{
      setStatus('Loading quality-filtered Polymarket NFL lines & props…');const games=await fetchGames();if(!games.length)throw new Error('No quality NFL markets returned by Polymarket');
      state.games=games;state.propsLoaded.clear();hydrateGames();markSource(games);
      try{await Promise.all(games.map(g=>enrichGameContext(g)));}catch(err){console.warn('Polymarket prop roster enrichment skipped',err);}
      const marketCount=games.reduce((n,g)=>n+g.markets.length,0),propCount=games.reduce((n,g)=>n+g.markets.filter(m=>m.player).length,0);
      setStatus(`Polymarket fallback • ${games.length} NFL games • ${propCount} player props • ${marketCount} total markets`);await generate();
      const title=document.getElementById('resultsTitle');if(title&&state.mode==='sgp')title.textContent=propCount?'Polymarket fallback • lines + player props':'Polymarket fallback • team markets';
      window.NFL_PARLAY_DAILY_PICKS?.refresh?.();window.NFL_BANKROLL?.refresh?.();return true;
    }catch(err){console.warn('Polymarket fallback unavailable',err);markSource([]);state.games=structuredClone(demoGames);hydrateGames();setStatus('Live sources unavailable — demo data active');await generate();return false;}
  }
  const originalLoadData=loadData;loadData=async function(){if(!state.apiKey)return loadFallback();await originalLoadData();const status=document.getElementById('dataStatus')?.textContent||'';if(/API unavailable|demo data active/i.test(status))return loadFallback();};
  window.NFL_POLYMARKET_FALLBACK={load:loadFallback,fetchGames,clearCache:()=>{['nflParlayPolymarketFallback:v1','nflParlayPolymarketFallback:v2','nflParlayPolymarketFallback:v3',CACHE_KEY].forEach(k=>localStorage.removeItem(k));}};
  ['nflParlayPolymarketFallback:v1','nflParlayPolymarketFallback:v2','nflParlayPolymarketFallback:v3'].forEach(k=>localStorage.removeItem(k));
  if(!state.apiKey)loadFallback();
})();