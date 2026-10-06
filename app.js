const state = {
  mode:window.DASHBOARD_UI?.get('nfl','mode','sgp')||'sgp',
  nflWeek:window.DASHBOARD_UI?.get('nfl','week','')||'',
  lineMode:'standard',
  risk:50,
  selectedMarkets:new Set(window.DASHBOARD_UI?.get('nfl','markets',['h2h','spreads','totals','passing','rushing','receiving','receptions','td'])||['h2h','spreads','totals','passing','rushing','receiving','receptions','td']),
  games:[],
  apiKey:localStorage.getItem('nflParlayOddsApiKey') || '',
  propsLoaded:new Set(),
  propsLoading:new Map(),
  apiUsage:{remaining:null,used:null,last:null},
  context:{
    espnTeamIndex:null,
    espnRosters:new Map(),
    nflverseRoster:null,
    espnStatus:'idle',
    nflverseStatus:'idle'
  }
};

const demoGames = [
  {
    id:'demo-no-det',away:'New Orleans Saints',home:'Detroit Lions',commence_time:'2026-09-13T17:00:00Z',
    markets:[
      {type:'h2h',name:'Detroit Lions ML',price:-245,team:'Detroit Lions',confidence:78},
      {type:'spreads',name:'Detroit Lions -5.5',price:-110,team:'Detroit Lions',confidence:67},
      {type:'totals',name:'Over 46.5',price:-110,team:'Game',confidence:62},
      {type:'passing',name:'Jared Goff 225+ passing yards',price:-170,team:'Detroit Lions',confidence:76,side:'over'},
      {type:'passing',name:'Saints QB 200+ passing yards',price:-150,team:'New Orleans Saints',confidence:70,side:'over'},
      {type:'receiving',name:'Amon-Ra St. Brown 60+ receiving yards',price:-185,team:'Detroit Lions',confidence:78,side:'over'},
      {type:'rushing',name:'Lions lead RB 50+ rushing yards',price:-180,team:'Detroit Lions',confidence:74,side:'over'},
      {type:'td',name:'Lions lead RB anytime TD',price:-125,team:'Detroit Lions',confidence:67},
      {type:'td',name:'Amon-Ra St. Brown anytime TD',price:+135,team:'Detroit Lions',confidence:58}
    ]
  },
  {
    id:'demo-buf-hou',away:'Buffalo Bills',home:'Houston Texans',commence_time:'2026-09-13T17:00:00Z',
    markets:[
      {type:'h2h',name:'Buffalo Bills ML',price:-145,team:'Buffalo Bills',confidence:68},
      {type:'spreads',name:'Buffalo Bills -2.5',price:-110,team:'Buffalo Bills',confidence:62},
      {type:'totals',name:'Over 48.5',price:-110,team:'Game',confidence:61},
      {type:'passing',name:'Josh Allen 225+ passing yards',price:-175,team:'Buffalo Bills',confidence:77,side:'over'},
      {type:'rushing',name:'Josh Allen 25+ rushing yards',price:-190,team:'Buffalo Bills',confidence:78,side:'over'},
      {type:'receiving',name:'Buffalo WR1 60+ receiving yards',price:-155,team:'Buffalo Bills',confidence:72,side:'over'},
      {type:'td',name:'Josh Allen anytime TD',price:+115,team:'Buffalo Bills',confidence:61}
    ]
  },
  {
    id:'demo-gb-min',away:'Green Bay Packers',home:'Minnesota Vikings',commence_time:'2026-09-13T20:25:00Z',
    markets:[
      {type:'h2h',name:'Green Bay Packers ML',price:-130,team:'Green Bay Packers',confidence:65},
      {type:'spreads',name:'Green Bay Packers -1.5',price:-110,team:'Green Bay Packers',confidence:61},
      {type:'totals',name:'Over 45.5',price:-108,team:'Game',confidence:60},
      {type:'passing',name:'Packers QB 225+ passing yards',price:-160,team:'Green Bay Packers',confidence:72,side:'over'},
      {type:'receiving',name:'Packers WR1 50+ receiving yards',price:-185,team:'Green Bay Packers',confidence:75,side:'over'},
      {type:'td',name:'Packers lead RB anytime TD',price:+105,team:'Green Bay Packers',confidence:62}
    ]
  }
];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function americanToDecimal(o){ return o > 0 ? 1 + o/100 : 1 + 100/Math.abs(o); }
function decimalToAmerican(d){ return d >= 2 ? Math.round((d-1)*100) : Math.round(-100/(d-1)); }
function fmtOdds(o){ return o > 0 ? '+'+o : String(o); }

function impliedProbability(o){ return o>0 ? 100/(o+100) : Math.abs(o)/(Math.abs(o)+100); }

function riskLabel(v){
  if(v<25) return 'Conservative';
  if(v<60) return 'Balanced';
  return 'Aggressive';
}

function setStatus(msg){ window.__NFL_STATUS=msg;if((window.__ACTIVE_SPORT||'nfl')==='nfl')$('#dataStatus').textContent=msg; }

function trackApiUsage(res){
  if(!res?.headers) return;
  const remaining=res.headers.get('x-requests-remaining');
  const used=res.headers.get('x-requests-used');
  const last=res.headers.get('x-requests-last');

  if(remaining!==null) state.apiUsage.remaining=Number(remaining);
  if(used!==null) state.apiUsage.used=Number(used);
  if(last!==null) state.apiUsage.last=Number(last);

  renderApiUsage();
}

function renderApiUsage(){
  const remaining=state.apiUsage.remaining;
  const used=state.apiUsage.used;
  const last=state.apiUsage.last;

  const r=$('#apiRemaining');
  const u=$('#apiUsed');
  const l=$('#apiLast');
  const fill=$('#apiMeterFill');

  if(r) r.textContent=remaining ?? '—';
  if(u) u.textContent=used ?? '—';
  if(l) l.textContent=last ?? '—';

  if(fill){
    if(remaining==null || used==null || remaining+used<=0){
      fill.style.width='0%';
    }else{
      const pct=Math.max(0,Math.min(100,(remaining/(remaining+used))*100));
      fill.style.width=pct+'%';
    }
  }
}

const NFL_TEAM_NAMES = {
  ARI:'Arizona Cardinals',ATL:'Atlanta Falcons',BAL:'Baltimore Ravens',BUF:'Buffalo Bills',
  CAR:'Carolina Panthers',CHI:'Chicago Bears',CIN:'Cincinnati Bengals',CLE:'Cleveland Browns',
  DAL:'Dallas Cowboys',DEN:'Denver Broncos',DET:'Detroit Lions',GB:'Green Bay Packers',
  HOU:'Houston Texans',IND:'Indianapolis Colts',JAX:'Jacksonville Jaguars',KC:'Kansas City Chiefs',
  LV:'Las Vegas Raiders',LAC:'Los Angeles Chargers',LAR:'Los Angeles Rams',LA:'Los Angeles Rams',
  MIA:'Miami Dolphins',MIN:'Minnesota Vikings',NE:'New England Patriots',NO:'New Orleans Saints',
  NYG:'New York Giants',NYJ:'New York Jets',PHI:'Philadelphia Eagles',PIT:'Pittsburgh Steelers',
  SEA:'Seattle Seahawks',SF:'San Francisco 49ers',TB:'Tampa Bay Buccaneers',TEN:'Tennessee Titans',
  WAS:'Washington Commanders'
};

function normalizePlayerName(name){
  return String(name||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

function renderContextStatus(){
  const e=$('#espnStatus');
  const n=$('#nflverseStatus');
  if(e) e.textContent=state.context.espnStatus==='ready'?'Connected':state.context.espnStatus==='error'?'Unavailable':'Idle';
  if(n) n.textContent=state.context.nflverseStatus==='ready'?'Connected':state.context.nflverseStatus==='error'?'Unavailable':'Idle';
}

async function loadEspnTeamIndex(){
  if(state.context.espnTeamIndex) return state.context.espnTeamIndex;
  state.context.espnStatus='loading'; renderContextStatus();
  try{
    const res=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
    if(!res.ok) throw new Error('ESPN teams '+res.status);
    const raw=await res.json();
    const teams=raw?.sports?.[0]?.leagues?.[0]?.teams||[];
    const index=new Map();
    for(const entry of teams){
      const t=entry.team||entry;
      if(!t?.displayName) continue;
      index.set(t.displayName,{id:t.id,displayName:t.displayName,abbreviation:t.abbreviation});
      if(t.abbreviation) index.set(t.abbreviation,{id:t.id,displayName:t.displayName,abbreviation:t.abbreviation});
    }
    state.context.espnTeamIndex=index;
    state.context.espnStatus='ready'; renderContextStatus();
    return index;
  }catch(err){
    console.warn('ESPN team index unavailable',err);
    state.context.espnStatus='error'; renderContextStatus();
    return new Map();
  }
}

async function loadEspnRoster(teamName){
  if(state.context.espnRosters.has(teamName)) return state.context.espnRosters.get(teamName);
  const index=await loadEspnTeamIndex();
  const team=index.get(teamName);
  if(!team?.id) return [];
  try{
    const res=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+team.id+'/roster');
    if(!res.ok) throw new Error('ESPN roster '+res.status);
    const raw=await res.json();
    const out=[];
    for(const group of raw.athletes||[]){
      const items=group.items||[];
      for(const athlete of items){
        out.push({
          name:athlete.displayName||athlete.fullName,
          team:team.displayName,
          id:athlete.id,
          position:athlete.position?.abbreviation||group.position||'',
          source:'ESPN'
        });
      }
    }
    state.context.espnRosters.set(teamName,out);
    return out;
  }catch(err){
    console.warn('ESPN roster unavailable for',teamName,err);
    return [];
  }
}

function parseCsv(text){
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){ cell+='"'; i++; }
      else quoted=!quoted;
    }else if(ch===',' && !quoted){ row.push(cell); cell=''; }
    else if((ch==='\n'||ch==='\r') && !quoted){
      if(ch==='\r' && text[i+1]==='\n') i++;
      row.push(cell); cell='';
      if(row.some(v=>v!=='')) rows.push(row);
      row=[];
    }else cell+=ch;
  }
  if(cell||row.length){ row.push(cell); rows.push(row); }
  if(rows.length<2) return [];
  const headers=rows[0].map(h=>h.trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

async function loadNflverseRoster(){
  if(state.context.nflverseRoster) return state.context.nflverseRoster;
  state.context.nflverseStatus='loading'; renderContextStatus();
  const season=new Date().getFullYear();
  const url='https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_'+season+'.csv';
  try{
    const res=await fetch(url);
    if(!res.ok) throw new Error('nflverse roster '+res.status);
    const rows=parseCsv(await res.text());
    const mapped=rows.map(r=>{
      const name=r.full_name||r.player_name||r.display_name||r.name||'';
      const abbr=(r.team||r.team_abbr||r.recent_team||'').toUpperCase();
      return {
        name,
        team:NFL_TEAM_NAMES[abbr]||abbr,
        position:r.position||r.depth_chart_position||'',
        source:'nflverse'
      };
    }).filter(r=>r.name);
    state.context.nflverseRoster=mapped;
    state.context.nflverseStatus='ready'; renderContextStatus();
    return mapped;
  }catch(err){
    console.warn('nflverse roster unavailable',err);
    state.context.nflverseStatus='error'; renderContextStatus();
    return [];
  }
}

async function enrichGameContext(game){
  if(!game) return;
  const [awayRoster,homeRoster,nflverse]=await Promise.all([
    loadEspnRoster(game.away),
    loadEspnRoster(game.home),
    loadNflverseRoster()
  ]);

  const lookup=new Map();
  for(const p of nflverse){
    if(p.team===game.away || p.team===game.home) lookup.set(normalizePlayerName(p.name),p);
  }
  for(const p of [...awayRoster,...homeRoster]) lookup.set(normalizePlayerName(p.name),p);

  let matched=0;
  for(const m of game.markets){
    if(!m.player) continue;
    const hit=lookup.get(normalizePlayerName(m.player));
    if(!hit) continue;
    m.team=hit.team;
    m.position=hit.position;
    m.contextSource=hit.source;
    if(hit.id) m.playerId=Number(hit.id);
    matched++;
  }
  game.contextMatched=matched;
  game.contextReady=true;
}

const PROP_MARKETS = [
  'player_pass_yds','player_pass_yds_alternate','player_pass_tds','player_pass_attempts','player_pass_completions',
  'player_rush_yds','player_rush_yds_alternate','player_rush_attempts',
  'player_reception_yds','player_reception_yds_alternate','player_receptions',
  'player_anytime_td'
];

// Caesars Sportsbook does not allow these NFL player-prop markets in parlays.
// Keep them loaded for straight-bet surfaces, but exclude them from every parlay path.
const STRAIGHT_ONLY_MARKETS = new Set([
  'player_rush_attempts',
  'player_pass_attempts',
  'player_pass_completions'
]);

function isParlayEligible(m){
  // TD scorer estimates remain experimental until prospective validation.
  return m?.type!=='td'&&!STRAIGHT_ONLY_MARKETS.has(String(m?.marketKey||'').toLowerCase());
}

const PROP_MARKET_META = {
  player_pass_yds:{type:'passing',label:'passing yards'},
  player_pass_yds_alternate:{type:'passing',label:'passing yards'},
  player_pass_tds:{type:'passing',label:'passing TDs'},
  player_pass_attempts:{type:'passing',label:'pass attempts'},
  player_pass_completions:{type:'passing',label:'completions'},
  player_rush_yds:{type:'rushing',label:'rushing yards'},
  player_rush_yds_alternate:{type:'rushing',label:'rushing yards'},
  player_rush_attempts:{type:'rushing',label:'rush attempts'},
  player_reception_yds:{type:'receiving',label:'receiving yards'},
  player_reception_yds_alternate:{type:'receiving',label:'receiving yards'},
  player_receptions:{type:'receptions',label:'receptions'},
  player_anytime_td:{type:'td',label:'anytime TD'}
};

function normalizePropOutcome(marketKey,out,quotedAt=new Date().toISOString()){
  const meta=PROP_MARKET_META[marketKey];
  if(!meta || !out?.description || typeof out.price!=='number') return null;
  const player=out.description;
  const side=(out.name||'').toLowerCase();
  const point=out.point;
  let name;
  if(marketKey==='player_anytime_td'){
    if(side && !['yes','over'].includes(side)) return null;
    name=`${player} anytime TD`;
  }else{
    if(!['over','under'].includes(side) || point==null) return null;
    name=`${player} ${out.name} ${point} ${meta.label}`;
  }
  return {
    type:meta.type,
    marketKey,
    source:'Caesars',quotedAt,
    player,
    name,
    price:out.price,
    team:'Player',
    confidence:Math.round(impliedProbability(out.price)*100),
    side:marketKey==='player_anytime_td'?'yes':side,
    point
  };
}

async function discoverCaesarsMarkets(game){
  const url=new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/markets`);
  url.searchParams.set('apiKey',state.apiKey);
  url.searchParams.set('regions','us');
  const res=await fetch(url);
  trackApiUsage(res);
  if(!res.ok) throw new Error('Event markets API '+res.status);
  const raw=await res.json();
  const book=(raw.bookmakers||[]).find(b=>b.dashboardBookSource==='Caesars'||b.key==='williamhill_us');
  return new Set((book?.markets||[]).map(m=>typeof m==='string'?m:m.key).filter(Boolean));
}

async function ensurePropsForGame(game){
  if(!game) return;
  if(game.dataSource==='Kalshi' || String(game.id||'').startsWith('kalshi-')){
    const count=(game.markets||[]).filter(m=>m.player).length;
    game.propStatus=count?'loaded':'none';
    game.availablePropMarkets=[...new Set((game.markets||[]).filter(m=>m.player).map(m=>m.marketKey).filter(Boolean))];
    state.propsLoaded.add(game.id);
    return;
  }
  if(!state.apiKey || String(game.id).startsWith('demo-') || state.propsLoaded.has(game.id)) return;
  if(state.propsLoading.has(game.id)) return state.propsLoading.get(game.id);

  const task=(async()=>{
    try{
      setStatus(`Checking Caesars props: ${game.away} @ ${game.home}…`);
      const available=await discoverCaesarsMarkets(game);
      const requested=PROP_MARKETS.filter(k=>available.has(k));

      if(!requested.length){
        game.propStatus='none';
        game.availablePropMarkets=[];
        state.propsLoaded.add(game.id);
        setStatus('Caesars has not posted supported player props for this game yet');
        return;
      }

      game.availablePropMarkets=requested;
      setStatus(`Loading ${requested.length} Caesars prop markets…`);

      const url=new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/odds`);
      url.searchParams.set('apiKey',state.apiKey);
      url.searchParams.set('regions','us');
      url.searchParams.set('markets',requested.join(','));
      url.searchParams.set('oddsFormat','american');
      url.searchParams.set('bookmakers','fanduel');

      const res=await fetch(url);
      trackApiUsage(res);
      if(!res.ok) throw new Error('Prop odds API '+res.status);
      const raw=await res.json();
      const book=(raw.bookmakers||[]).find(b=>b.dashboardBookSource==='Caesars'||b.key==='williamhill_us');
      const props=[];

      for(const m of book?.markets||[]){
        for(const out of m.outcomes||[]){
          const prop=normalizePropOutcome(m.key,out,m.last_update||book.last_update||new Date().toISOString());
          if(prop) props.push(prop);
        }
      }

      const unique=new Map();
      for(const p of props){
        const key=[p.marketKey,p.player,p.side,p.point,p.price].join('|');
        if(!unique.has(key)) unique.set(key,p);
      }

      const cleaned=[...unique.values()];
      game.markets.push(...cleaned);
      await enrichGameContext(game);
      game.propStatus=cleaned.length?'loaded':'empty';
      state.propsLoaded.add(game.id);

      setStatus(
        cleaned.length
          ? `Live Caesars markets • ${cleaned.length} player props loaded`
          : 'Caesars prop markets were listed, but no usable outcomes were returned'
      );
    }catch(err){
      console.error(err);
      game.propStatus='error';
      setStatus('Live team lines • player prop lookup failed');
    }finally{
      state.propsLoading.delete(game.id);
    }
  })();

  state.propsLoading.set(game.id,task);
  return task;
}

async function ensurePropsForMultiGame(limit=6){
  const targets=nflSlate().filter(g=>!state.propsLoaded.has(g.id)).slice(0,limit);
  for(const g of targets) await ensurePropsForGame(g);
}

async function loadData(){
  // The Kalshi provider is loaded later in the script stack; no paid-feed bootstrap.
  if(window.NFL_NO_DEMO)return window.NFL_NO_DEMO.load();
  setStatus('Loading Kalshi NFL snapshot…');
  return false;
}

function normalizeGame(g){
  const markets=[];
  const book=(g.bookmakers||[]).find(b=>b.dashboardBookSource==='Caesars'||b.key==='williamhill_us');
  for(const m of book?.markets||[]){
    for(const out of m.outcomes||[]){
      if(m.key==='h2h'){
        markets.push({type:'h2h',name:out.name+' ML',price:out.price,team:out.name,confidence:Math.round(impliedProbability(out.price)*100)});
      }
      if(m.key==='spreads'){
        markets.push({type:'spreads',marketKey:m.key,point:out.point,name:out.name+' '+(out.point>0?'+':'')+out.point,price:out.price,team:out.name,confidence:Math.round(impliedProbability(out.price)*100)});
      }
      if(m.key==='totals'){
        markets.push({type:'totals',marketKey:m.key,point:out.point,name:out.name+' '+out.point,price:out.price,team:'Game',confidence:Math.round(impliedProbability(out.price)*100),side:out.name.toLowerCase()});
      }
    }
  }
  for(const market of markets){market.source='Caesars';market.quotedAt=book?.markets?.find(m=>m.key===(market.marketKey||market.type))?.last_update||book?.last_update||new Date().toISOString();}
  return {id:g.id,away:g.away_team,home:g.home_team,commence_time:g.commence_time,markets};
}

// Thursday–Wednesday date ranges keep one NFL slate together without guessing official week numbers.
function nflWeekKey(value){
  if(!value||!Number.isFinite(Date.parse(value)))return '';
  const date=new Date(value);date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+3)%7));
  return date.toISOString().slice(0,10);
}
function nflWeeks(){return [...new Set((state.games||[]).map(g=>nflWeekKey(g.commence_time)).filter(Boolean))].sort()}
function nflSlate(){
  const weeks=nflWeeks();
  if(state.nflWeek!=='all'&&!weeks.includes(state.nflWeek))state.nflWeek=weeks[0]||'';
  return (state.games||[]).filter(g=>state.nflWeek==='all'||!state.nflWeek||nflWeekKey(g.commence_time)===state.nflWeek);
}
function nflWeekLabel(key){
  const start=new Date(key+'T12:00:00Z'),end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
  const opts={month:'short',day:'numeric',timeZone:'UTC'};
  return start.toLocaleDateString(undefined,opts)+' – '+end.toLocaleDateString(undefined,opts);
}
function syncNflWeek(){
  const select=$('#nflWeekSelect');nflSlate();if(!select)return;
  select.replaceChildren();
  for(const key of nflWeeks()){const option=document.createElement('option');option.value=key;option.textContent=nflWeekLabel(key);select.appendChild(option)}
  const all=document.createElement('option');all.value='all';all.textContent='All upcoming';select.appendChild(all);
  select.value=state.nflWeek||'all';select.disabled=!nflWeeks().length;
}

function hydrateGames(){
  syncNflWeek();
  const sel=$('#gameSelect'),previous=sel.value,selected=[...sel.options].some(o=>o.value===previous&&!o.disabled)?previous:window.DASHBOARD_UI?.get('nfl','game','');
  sel.innerHTML='';
  nflSlate().forEach(g=>{
    const o=document.createElement('option');
    o.value=g.id;
    o.textContent=[nflKickoff(g.commence_time),nflMatchup(g.away+' @ '+g.home)].filter(Boolean).join(' · ');
    sel.appendChild(o);
  });
  if([...sel.options].some(o=>o.value===selected))sel.value=selected;
}

function correlation(a,b){
  let score=0;
  const sameTeam=a.team===b.team && !['Game','Player'].includes(a.team);
  const samePlayer=a.player && b.player && a.player===b.player;
  const qbReceiverPair=sameTeam && (
    (a.position==='QB' && ['WR','TE'].includes(b.position)) ||
    (b.position==='QB' && ['WR','TE'].includes(a.position))
  );
  // An interception over is not an offensive-volume over and must not earn
  // quarterback/receiver or same-team scoring bonuses.
  const aOver=(a.side==='over' || /Over|\+ passing|\+ receiving|\+ rushing/.test(a.name)) && a.marketKey!=='player_pass_interceptions';
  const bOver=(b.side==='over' || /Over|\+ passing|\+ receiving|\+ rushing/.test(b.name)) && b.marketKey!=='player_pass_interceptions';

  if(qbReceiverPair && aOver && bOver) score+=6;
  if(samePlayer && aOver && bOver) score+=5;
  if(samePlayer && ((a.type==='td'&&bOver)||(b.type==='td'&&aOver))) score+=4;
  if(sameTeam && aOver && bOver) score+=3;
  if(sameTeam && (a.type==='h2h'||a.type==='spreads') && ['passing','rushing','receiving','td'].includes(b.type)) score+=2;
  if(sameTeam && (b.type==='h2h'||b.type==='spreads') && ['passing','rushing','receiving','td'].includes(a.type)) score+=2;
  if(sameTeam && ((a.type==='passing'&&aOver&&['receiving','receptions'].includes(b.type)&&bOver) ||
      (b.type==='passing'&&bOver&&['receiving','receptions'].includes(a.type)&&aOver))) score+=2;
  if(sameTeam && ((a.type==='passing'&&aOver&&b.type==='td')||(b.type==='passing'&&bOver&&a.type==='td'))) score+=2;
  if(a.type==='totals' && /Over/.test(a.name) && bOver) score+=2;
  if(b.type==='totals' && /Over/.test(b.name) && aOver) score+=2;
  if(a.type==='h2h'&&b.type==='spreads'&&sameTeam) score-=6;
  if(a.type==='spreads'&&b.type==='h2h'&&sameTeam) score-=6;
  return score;
}

function isTeamSide(m){ return m.type==='h2h' || m.type==='spreads'; }

function incompatible(a,b){
  if(a.type==='totals' && b.type==='totals'){
    if(a.side!==b.side) return true;
    return true;
  }

  if(isTeamSide(a) && isTeamSide(b)){
    return true;
  }

  if(a.marketKey && b.marketKey && a.player && b.player &&
     a.player===b.player && a.marketKey===b.marketKey) return true;

  return false;
}

const PROFILE_RULES = {
  safe:{
    minPrice:-450,maxPrice:125,
    targetMin:-300,targetMax:-120,
    corrWeight:5,
    propShare:.67,
    maxSamePlayer:1,
    label:'Conservative'
  },
  balanced:{
    minPrice:-220,maxPrice:180,
    targetMin:-160,targetMax:110,
    corrWeight:9,
    propShare:.75,
    maxSamePlayer:1,
    label:'Balanced'
  },
  long:{
    minPrice:-125,maxPrice:450,
    targetMin:-110,targetMax:300,
    corrWeight:7,
    propShare:.75,
    maxSamePlayer:1,
    label:'Lotto'
  }
};

function marketQuality(m,variant){
  const cfg=PROFILE_RULES[variant]||PROFILE_RULES.balanced;
  if(typeof m.price!=='number') return -999;
  if(m.price<cfg.minPrice || m.price>cfg.maxPrice) return -999;

  if(/_alternate$/.test(m.marketKey||'') && m.price<-350) return -999;

  const implied=impliedProbability(m.price)*100;
  let q=60;

  if(m.price>=cfg.targetMin && m.price<=cfg.targetMax) q+=18;
  else{
    const distance=m.price<cfg.targetMin ? cfg.targetMin-m.price : m.price-cfg.targetMax;
    q-=Math.min(24,distance/18);
  }

  if(m.marketKey && !/_alternate$/.test(m.marketKey)) q+=6;
  if(/_alternate$/.test(m.marketKey||'')) q-=4;

  if(variant==='safe'){
    q += Math.max(0,implied-55)*.25;
    if(m.type==='td') q-=16;
    if(m.price>0) q-=8;
  }else if(variant==='balanced'){
    if(m.type==='td') q-=2;
    if(m.price<-200) q-=8;
  }else{
    if(m.type==='td') q+=14;
    if(m.price>0) q+=10;
    if(m.price<-120) q-=10;
  }

  return q;
}

function candidateScore(m,risk,variant='balanced'){
  if(window.NFL_ALT_LINES&&!window.NFL_ALT_LINES.matches(m,state.lineMode))return -999;
  if(window.PICK_QUALITY){const x=window.PICK_QUALITY.assess('nfl',m,nflQualityForecast(m),{parlay:true});return x.pass?x.rank:-999;}
  const q=marketQuality(m,variant);
  if(q<=-900) return q;
  const implied=impliedProbability(m.price)*100;
  const projectionAdj=window.NFL_PROJECTIONS?.adjustment?.(m)||0;
  const conf=Number(m.confidenceScore??m.confidence)||0;
  // One quality objective: projection edge + market quality + calibrated
  // confidence + reasonable implied hit rate. No user risk bias.
  let score=q + projectionAdj*1.35 + conf*.28 + implied*.12;
  if(m.player&&m._invalidRoster===true) return -999;
  if(/_alternate$/.test(m.marketKey||'')) score-=4;
  if(m.type==='td') score-=3;
  return score;
}

function playerCount(legs,player){
  if(!player) return 0;
  return legs.filter(l=>l.player===player).length;
}

function coherentWithLegs(candidate,legs,variant){
  const cfg=PROFILE_RULES[variant]||PROFILE_RULES.balanced;
  if(legs.some(l=>incompatible(l,candidate))) return false;
  if(candidate.player && playerCount(legs,candidate.player)>=cfg.maxSamePlayer) return false;
  return true;
}

function parlaySignature(p){
  return p?.legs?.map(l=>[l.marketKey||l.type,l.player||l.team,l.side||'',l.point??'',l.name].join(':')).sort().join('|')||'';
}

function overlapCount(a,b){
  const sa=new Set((a?.legs||[]).map(l=>l.name));
  return (b?.legs||[]).filter(l=>sa.has(l.name)).length;
}

function favoriteTeam(game){
  const mls=game.markets.filter(m=>m.type==='h2h' && typeof m.price==='number');
  if(!mls.length) return null;
  return [...mls].sort((a,b)=>a.price-b.price)[0]?.team||null;
}

function underdogTeam(game){
  const fav=favoriteTeam(game);
  return [game.away,game.home].find(t=>t!==fav)||null;
}

const GAME_SCRIPTS = {
  favorite_control:{
    name:'Favorite controls the game',
    thesis:(game)=>(favoriteTeam(game)||'The favorite')+' is expected to play from ahead, keeping the game on schedule and leaning on efficient, lower-variance production.',
    legFit:(m,game)=>{
      let s=0;
      const fav=favoriteTeam(game);
      if(isTeamSide(m) && m.team===fav) s+=16;
      if(m.type==='rushing' && m.side==='over' && (!m.team || m.team===fav) && (!m.position || ['RB','QB'].includes(m.position))) s+=12;
      if(m.type==='totals' && m.side==='under') s+=5;
      if(m.type==='passing' && m.side==='under') s+=4;
      if(m.type==='td') s+=3;
      return s;
    }
  },
  shootout:{
    name:'Aerial shootout',
    thesis:()=> 'The game is expected to produce sustained passing volume and scoring, so the legs all benefit from an aggressive offensive environment.',
    legFit:(m)=>{
      let s=0;
      if(m.type==='totals' && m.side==='over') s+=16;
      if(m.type==='passing' && m.side==='over' && m.marketKey!=='player_pass_interceptions') s+=13;
      if(m.type==='receiving' && m.side==='over') s+=13;
      if(m.type==='td') s+=9;
      if(m.type==='rushing' && m.side==='under') s+=2;
      if(m.side==='under' && ['passing','receiving'].includes(m.type)) s-=12;
      return s;
    }
  },
  comeback:{
    name:'Underdog forced to throw',
    thesis:(game)=>(underdogTeam(game)||'The underdog')+' is expected to trail, creating extra dropbacks and target volume while the favorite protects the lead.',
    legFit:(m,game)=>{
      let s=0;
      const dog=underdogTeam(game);
      if(m.type==='spreads' && m.team===dog) s+=8;
      if(m.team===dog && m.type==='passing' && m.side==='over' && m.marketKey!=='player_pass_interceptions') s+=14;
      if(m.team===dog && m.type==='receiving' && m.side==='over') s+=14;
      if(m.type==='totals' && m.side==='over') s+=6;
      if(m.type==='rushing' && m.side==='under') s+=4;
      return s;
    }
  },
  grind:{
    name:'Lower-scoring control game',
    thesis:()=> 'Possessions are expected to be limited, favoring rushing volume and unders over explosive passing outcomes.',
    legFit:(m)=>{
      let s=0;
      if(m.type==='totals' && m.side==='under') s+=16;
      if(m.type==='rushing' && m.side==='over') s+=11;
      if(m.type==='passing' && m.side==='under') s+=10;
      if(m.type==='receiving' && m.side==='under') s+=8;
      if(m.type==='td') s-=8;
      return s;
    }
  }
};

function scriptCandidatesForVariant(variant){
  if(variant==='safe') return ['favorite_control','grind'];
  if(variant==='balanced') return ['shootout','comeback','favorite_control'];
  return ['shootout','comeback'];
}

function scriptMarketScore(m,game,variant,scriptKey,risk){
  const script=GAME_SCRIPTS[scriptKey];
  if(!script) return -999;
  const base=candidateScore(m,risk,variant);
  if(base<=-900) return base;
  return base + (window.PICK_QUALITY?0:script.legFit(m,game));
}

function sgpTeam(m,game){
  return [game.away,game.home].includes(m.team) ? m.team : null;
}

function mixedTeamTarget(pool,game,count,risk,variant){
  if(count<3) return 0;
  const qualified=pool.filter(m=>m.player && sgpTeam(m,game) && candidateScore(m,risk,variant)>-900);
  const top=Math.max(...qualified.map(m=>candidateScore(m,risk,variant)),-Infinity);
  const available=[game.away,game.home].map(team=>new Set(qualified.filter(m=>m.team===team && candidateScore(m,risk,variant)>=top-20).map(m=>m.player)).size);
  return Math.min(count>=5?2:1,...available);
}

function teamCounts(legs,game){
  return [game.away,game.home].map(team=>legs.filter(m=>sgpTeam(m,game)===team).length);
}

function pickDistinctAlternative(game,count,risk,variant,previous){
  const cfg=PROFILE_RULES[variant]||PROFILE_RULES.balanced;
  const scriptKeys=scriptCandidatesForVariant(variant);
  let best=null;

  for(const scriptKey of scriptKeys){
    const pool=game.markets.filter(m=>isParlayEligible(m) && state.selectedMarkets.has(m.type) && candidateScore(m,risk,variant)>-900);
    const props=pool.filter(m=>m.player);
    const desiredProps=props.length ? Math.max(1,Math.min(count-1,Math.ceil(count*cfg.propShare))) : 0;

    const sorted=[...pool].sort((a,b)=>scriptMarketScore(b,game,variant,scriptKey,risk)-scriptMarketScore(a,game,variant,scriptKey,risk));
    // Reserve candidates for each offense: a large alternate-prop slate from
    // one team must not push every opposing player out of the search pool.
    const ranked=[...new Set([...sorted.slice(0,48),
      ...[game.away,game.home].flatMap(team=>sorted.filter(m=>sgpTeam(m,game)===team).slice(0,14))])];
    const mixedTarget=mixedTeamTarget(pool,game,count,risk,variant);

    function search(target){
    let beams=[{legs:[],score:0}];

    for(let depth=0;depth<count;depth++){
      const next=[];
      for(const beam of beams){
        for(const m of ranked){
          if(beam.legs.includes(m) || !coherentWithLegs(m,beam.legs,variant)) continue;
          if(target){
            const counts=teamCounts([...beam.legs,m],game);
            if(counts.some(n=>n>count-target)) continue;
            if(counts.some(n=>n+count-beam.legs.length-1<target)) continue;
          }

          const propCount=beam.legs.filter(l=>l.player).length;
          const remainingSlots=count-beam.legs.length;
          const needProps=Math.max(0,desiredProps-propCount);
          if(needProps>=remainingSlots && !m.player) continue;

          const corr=beam.legs.reduce((s,l)=>s+correlation(l,m),0);
          const scriptFit=GAME_SCRIPTS[scriptKey].legFit(m,game);
          if(!window.PICK_QUALITY&&scriptFit<0) continue;

          const diversityPenalty=previous.reduce((pen,p)=>pen + (p?.legs?.some(l=>l.name===m.name)?18:0),0);

          const s=beam.score
            + scriptMarketScore(m,game,variant,scriptKey,risk)
            + (window.PICK_QUALITY?0:corr*cfg.corrWeight)
            + (window.PICK_QUALITY?0:scriptFit*1.2)
            - diversityPenalty;

          next.push({legs:[...beam.legs,m],score:s});
        }
      }

      next.sort((a,b)=>b.score-a.score);
      // Preserve different team-exposure paths until the final leg; otherwise
      // the highest-scoring one-team stack crowds out every mixed build.
      const diverse=[],seen=new Map();
      for(const beam of next){
        const key=teamCounts(beam.legs,game).join(':');
        const n=seen.get(key)||0;
        if(n>=24) continue;
        seen.set(key,n+1);diverse.push(beam);
        if(diverse.length>=160) break;
      }
      beams=diverse;
      if(!beams.length) break;
    }

    const finals=beams
      .filter(b=>b.legs.length===count)
      .filter(b=>!target || teamCounts(b.legs,game).every(n=>n>=target))
      .filter(b=>b.legs.filter(l=>l.player).length>=Math.min(desiredProps,count))
      .filter(b=>{
        if(window.PICK_QUALITY)return true;
        const positiveFits=b.legs.filter(l=>GAME_SCRIPTS[scriptKey].legFit(l,game)>=8).length;
        return positiveFits>=Math.min(2,count);
      })
      .map(b=>{
        const p=packageParlay(b.legs,variant,true,{
          scriptKey:window.PICK_QUALITY?'quality_mix':scriptKey,
          scriptName:window.PICK_QUALITY?'Quality-screened mix':GAME_SCRIPTS[scriptKey].name,
          thesis:window.PICK_QUALITY?'Individually qualifying picks, with both teams represented when comparable options are available. Same-game dependence and combined value remain unverified.':GAME_SCRIPTS[scriptKey].thesis(game)
        });
        if(p){p.gameLabel=`${game.away} @ ${game.home}`;p.kickoff=game.commence_time;p.teamMix=teamCounts(b.legs,game).every(n=>n>0)?'Both teams':'Concentrated';}
        return {raw:b,parlay:p};
      })
      .filter(x=>x.parlay);

    if(!finals.length) return null;
    const distinct=finals.find(x=>previous.every(p=>overlapCount(p,x.parlay)<=1)) || finals[0];
    return {...distinct,distinct:previous.every(p=>overlapCount(p,distinct.parlay)<=1)};
    }

    const selected=search(mixedTarget) || (mixedTarget ? search(0) : null);
    if(!selected) continue;
    if(!best || (selected.parlay.teamMix==='Both teams' && best.parlay.teamMix!=='Both teams') ||
      (selected.parlay.teamMix===best.parlay.teamMix && selected.distinct && !best.distinct) ||
      (selected.parlay.teamMix===best.parlay.teamMix && selected.distinct===best.distinct && selected.raw.score>best.raw.score)) best=selected;
  }

  return best?.parlay||null;
}
function buildSgp(game,count,risk,variant,previous=[]){
  count=Math.max(2,Math.min(4,Math.floor(Number(count))||2));
  window.NFL_ALT_LINES?.classify?.(game);
  const live=game.dataSource==='Caesars' && !String(game.id).startsWith('demo-');
  const props=game.markets.filter(m=>m.player && state.selectedMarkets.has(m.type));

  if(live && props.length===0) return null;

  const p=pickDistinctAlternative(game,count,risk,variant,previous);
  if(!p) return null;

  if(live && count>=3 && p.legs.filter(l=>l.player).length<2) return null;
  return p;
}

function propFamily(m){
  const k=m?.marketKey||'';
  if(k==='player_pass_yds'||k==='player_pass_yds_alternate') return 'pass_yds';
  if(k==='player_rush_yds'||k==='player_rush_yds_alternate') return 'rush_yds';
  if(k==='player_reception_yds'||k==='player_reception_yds_alternate') return 'rec_yds';
  if(k==='player_receptions') return 'receptions';
  if(k==='player_rush_attempts') return 'rush_attempts';
  if(k==='player_pass_attempts') return 'pass_attempts';
  if(k==='player_pass_completions') return 'completions';
  return m?.type||'other';
}

function buildMulti(count,risk,variant){
  count=Math.max(2,Math.min(4,Math.floor(Number(count))||2));
  window.NFL_MODEL_V3?.enrich?.();
  const targetRisk=Math.max(0,Math.min(100,risk + (variant==='safe'?-18:variant==='long'?24:0)));
  const all=[];
  for(const g of nflSlate()){
    window.NFL_ALT_LINES?.classify?.(g);
    for(const m of g.markets){
      if(!state.selectedMarkets.has(m.type) || !isParlayEligible(m)) continue;
      const score=candidateScore(m,targetRisk,variant);
      if(score<=-900) continue;
      all.push({m,g,score});
    }
  }
  all.sort((a,b)=>b.score-a.score);

  const legs=[],usedGames=new Set(),familyCounts=new Map();
  const maxFamily=count>=3?Math.max(1,Math.ceil(count/2)):1;

  // First pass: favor the strongest candidate while preventing one prop family
  // (especially receptions) from monopolizing a multi-game build.
  for(const x of all){
    if(legs.length>=count) break;
    if(usedGames.has(x.g.id)||x.m.player&&playerCount(legs,x.m.player)) continue;
    const fam=propFamily(x.m),n=familyCounts.get(fam)||0;
    if(x.m.player && n>=maxFamily) continue;
    legs.push({...x.m,gameLabel:`${x.g.away} @ ${x.g.home}`,kickoff:x.g.commence_time});
    usedGames.add(x.g.id);familyCounts.set(fam,n+1);
  }

  // Diversity is a preference, not a reason to discard an otherwise valid build.
  // Fill remaining slots from qualified markets on unused games.
  for(const x of all){
    if(legs.length>=count) break;
    if(usedGames.has(x.g.id)||x.m.player&&playerCount(legs,x.m.player)) continue;
    legs.push({...x.m,gameLabel:`${x.g.away} @ ${x.g.home}`,kickoff:x.g.commence_time});
    usedGames.add(x.g.id);
  }

  // Never fill with unqualified legs. If the requested size is unavailable,
  // return the strongest qualified build rather than pretending there are zero picks.
  const minLegs=Math.min(2,count);
  if(legs.length<(window.PICK_QUALITY?count:minLegs)) return null;
  const p=packageParlay(legs,variant,false);
  if(p&&legs.length<count){p.requestedLegs=count;p.summary=`Only ${legs.length} of ${count} requested legs cleared NFLV3. Showing the strongest qualified build instead of forcing weaker legs.`}
  return p;
}

function nflQualityForecast(m){return {marketAnchored:m.marketAnchored===true,modelP:m.modelProbability,rawModelP:m.rawModelProbability,coverage:m.projectionCoverage,uncertainty:m.modelUncertainty,roleStability:m.roleStability,marketP:m.marketProbability,experimental:m.tdExperimental||m.nflPropExperimental};}
function prepareNflQuality(){window.PICK_QUALITY?.prepare('nfl',(state.games||[]).flatMap(g=>(g.markets||[])),{},state.games,window.NFL_KALSHI?.snapshotAt?.()||null);}
function packageParlay(legs,variant,isSgp,meta={}){
  if(window.PICK_QUALITY&&!window.PICK_QUALITY.checkBuild('nfl',legs.map(m=>({market:m,forecast:nflQualityForecast(m)})),isSgp).pass)return null;
  if(!legs?.length || legs.length>4 || legs.some(m=>!isParlayEligible(m))) return null;
  const players=legs.map(l=>l.player).filter(Boolean);
  if(new Set(players).size!==players.length)return null;
  let decimal=1;
  legs.forEach(l=>decimal*=americanToDecimal(window.PICK_QUALITY?.quote('nfl',l)?.odds??l.price));
  let avg=legs.reduce((s,l)=>s+(Number(l.selectionConfidence)||Number(l.confidence)||impliedProbability(l.price)*100),0)/legs.length;
  let corr=0;
  if(isSgp){
    for(let i=0;i<legs.length;i++) for(let j=i+1;j<legs.length;j++) corr+=correlation(legs[i],legs[j]);
  }
  const names={safe:'Conservative',balanced:'Balanced',long:'Lotto'};
  const grades={safe:'CONSERVATIVE',balanced:'BEST FIT',long:'HIGHER PAYOUT'};
  return {
    name:names[variant],grade:grades[variant],legs,
    odds:decimalToAmerican(decimal),score:Math.round(avg),
    corr,
    scriptName:meta.scriptName||'',
    thesis:meta.thesis||'',
    summary:isSgp
      ? (meta.scriptName ? meta.scriptName+': '+meta.thesis : (corr>5?'Built around one coherent game script with positively related legs.':'Constraint-checked SGP with no opposing or duplicate game markets.'))
      : 'Spreads exposure across multiple games and prioritizes independently strong legs.'
  };
}

function reasonFor(leg,isSgp){
  if(leg.type==='h2h') return 'Favored outcome with a relatively strong implied win probability.';
  if(leg.type==='spreads') return 'Team line chosen as a cleaner alternative to a higher-variance prop.';
  if(leg.type==='totals') return isSgp ? 'Sets the expected scoring environment for the rest of the SGP.' : 'Game total selected from the stronger available team-market candidates.';
  if(leg.type==='passing') return 'Volume-based passing outcome that can pair naturally with receiving production.';
  if(leg.type==='receiving') return 'Receiving-yard outcome driven by target volume and efficiency.';
  if(leg.type==='receptions') return 'Reception-volume outcome driven by route participation and target share.';
  if(leg.type==='rushing') return 'Rushing-volume leg suited to favorable or neutral game scripts.';
  if(leg.type==='td') return 'Higher-variance scoring leg included only when the selected risk profile permits it.';
  return 'Selected by the current confidence and risk model.';
}

function renderNflStraight(){
  const choices=(state.games||[]).filter(g=>g.game_status==='pre'&&window.PICK_OF_DAY?.today?.(g.commence_time))
    .flatMap(g=>(g.markets||[]).filter(m=>m.type!=='td'&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,state.lineMode))&&(!m.player||m._rosterVerified)&&Number.isFinite(Number(m.price))&&m.price!==0)
      .map(m=>({g,m,x:window.NFL_MODEL_V3?.evaluate?.(g,m)})))
    .filter(row=>window.PICK_QUALITY?window.PICK_QUALITY.assess('nfl',row.m,row.x||{},{game:row.g,featured:true}).pass:row.x?.actionable&&Number(row.x.coverage)>=.2&&Number(row.x.confidence)>=55)
    .sort((a,b)=>window.PICK_QUALITY?window.PICK_QUALITY.assess('nfl',b.m,b.x,{game:b.g}).rank-window.PICK_QUALITY.assess('nfl',a.m,a.x,{game:a.g}).rank:(Number(b.x.confidence)+Math.max(0,Number(b.x.ev))*20)-(Number(a.x.confidence)+Math.max(0,Number(a.x.ev))*20));
  const best=choices[0];
  window.PICK_OF_DAY?.show?.('nfl',best&&{market:best.m,eventTime:best.g.commence_time,label:best.m.name,
    event:nflMatchup(best.g.away+' @ '+best.g.home),
    media:(window.SPORT_MEDIA?.nfl(best.m)||'')+(best.m.player&&best.m.team?window.SPORT_MEDIA?.nfl({team:best.m.team})||'':''),
    note:window.PICK_QUALITY?.note('nfl',best.m,best.x,best.g)||'Model-screened straight. Verify the current line at your sportsbook.'});
  return best?.m;
}

function nflTeamShort(value){return String(value||'').trim().split(/\s+/).at(-1)||''}
function nflMatchup(value){return String(value||'').split(/\s+(?:@|at|vs)\s+/i).map(nflTeamShort).join(' vs ')}
function nflKickoff(value,full=false){
  if(!value||!Number.isFinite(Date.parse(value)))return '';
  const date=new Date(value);
  if(full)return date.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  const day=date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const time=date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).replace(/:00(?=\s*[AP]M)/,'').replace(/\s+([AP]M)/,'$1');
  return day+' '+time;
}
window.NFL_DISPLAY={matchup:nflMatchup,team:nflTeamShort,kickoff:nflKickoff};

function render(parlays){
  if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;
  const featured=renderNflStraight();renderTdMarkets();renderNflExtras(parlays,featured);
  if(document.body.classList.contains('prediction-only')){const rows=nflSlate().filter(g=>Date.parse(g.commence_time)>Date.now()).flatMap(g=>(g.markets||[]).filter(m=>Number.isFinite(m.price)&&m.price!==0).map(m=>({...m,label:m.name,game_id:g.id,game_label:g.away+' at '+g.home,yes_ask:window.MODEL_CORE?.implied?.(m.price)})));$('#results').innerHTML=window.MARKET_GUARDS.watchlist(rows,'NFL');$('#resultsTitle').textContent='NFL Market Watchlist';return}
  const wrap=$('#results'); wrap.innerHTML='';
  const tpl=$('#parlayTemplate');
  const valid=parlays.filter(Boolean);
  if(!valid.length&&state.lineMode==='alt'){wrap.innerHTML='<div class="empty">No qualifying ALT build. Try fewer legs, another game, or Both.</div>';return;}
  if(!valid.length){
    const count=Number($('#legsSelect')?.value)||2;
    wrap.innerHTML='<div class="empty">No qualifying NFL '+count+'-leg parlay for these markets. Try other markets, fewer legs, or refresh the feed.</div>';
    if(window.PICK_QUALITY){
      const choices=nflSlate().flatMap(g=>(g.markets||[]).filter(m=>state.selectedMarkets.has(m.type)&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,state.lineMode))).map(m=>({g,m,q:window.PICK_QUALITY.assess('nfl',m,nflQualityForecast(m),{game:g})}))).filter(x=>x.q.pass).sort((a,b)=>b.q.rank-a.q.rank||String(a.m.ticker).localeCompare(String(b.m.ticker)));
      const seen=new Set(),singles=choices.filter(x=>{if(seen.has(x.g.id))return false;seen.add(x.g.id);return true}).slice(0,3);
      if(singles.length){const esc=window.MARKET_GUARDS.esc;wrap.innerHTML+='<article class="parlay-card"><div class="parlay-top"><div><span class="grade">SINGLES</span><h3 class="parlay-name">Available straight picks</h3></div></div><p class="summary">These picks qualify individually. The requested parlay could not be filled.</p><div class="legs">'+singles.map(x=>'<div class="leg" data-caesars-id="'+(window.CAESARS_COMPARE?.register('nfl',x.m)||'')+'"><div class="leg-title">'+esc(x.m.name)+'</div><div class="leg-sub">'+esc(nflMatchup(x.g.away+' @ '+x.g.home)+' · '+nflKickoff(x.g.commence_time))+'</div><div class="leg-quote">'+esc(window.PICK_QUALITY.quoteLabel('nfl',x.m))+'</div><div class="leg-reason">'+esc(x.q.warnings.join(' · ')||'Model-screened; verify current sportsbook line')+'</div></div>').join('')+'</div></article>';}
    }
    return;
  }
  for(const p of valid){
    const node=tpl.content.cloneNode(true);
    node.querySelector('.grade').textContent=window.PICK_QUALITY&&p.legs.some(m=>!window.PICK_QUALITY.validatedRule('nfl',m,nflQualityForecast(m)))?'UNVALIDATED':p.grade;
    node.querySelector('.parlay-name').textContent=p.name;
    const sb=node.querySelector('.script-badge');
    if(sb){ sb.textContent=p.scriptName||''; sb.style.display=p.scriptName?'inline-flex':'none'; }
    node.querySelector('.odds').textContent=state.mode==='sgp'?'—':fmtOdds(p.odds);node.querySelector('.odds-label').textContent=state.mode==='sgp'?'Check SGP offer':'Price est.';
    node.querySelector('.odds-label').title=state.mode==='sgp'?'Check your sportsbook for correlated SGP odds':'Combined individual quotes; actual sportsbook parlay odds may differ';
    node.querySelector('.summary').textContent=(state.mode==='sgp'&&p.gameLabel?p.gameLabel+' · ':'')+p.summary+(state.mode==='multi'?' Price estimate combines individual quotes; check your sportsbook for actual parlay odds.':'')+
      (state.mode==='sgp'&&p.teamMix==='Concentrated'?' One-team concentration: no qualifying mixed-team build was available.':'');
    const matchup=nflMatchup(p.gameLabel);
    node.querySelector('.summary').dataset.shortText=(state.mode==='sgp'?(nflKickoff(p.kickoff)?nflKickoff(p.kickoff)+' · ':'')+(matchup||'Same game'):'Multi-game · '+p.legs.length+' legs'+(state.nflWeek&&state.nflWeek!=='all'?' · '+nflWeekLabel(state.nflWeek):' · All upcoming'))+
      (p.requestedLegs&&p.legs.length<p.requestedLegs?' · '+p.legs.length+' of '+p.requestedLegs+' requested':'');
    if(state.mode==='sgp'&&p.gameLabel){const teams=p.gameLabel.split(/\s+@\s+/);if(teams.length===2){node.querySelector('.summary').dataset.away=teams[0];node.querySelector('.summary').dataset.home=teams[1]}}
    node.querySelector('.score').textContent=`Rating ${p.score}/100 · Not win chance`;
    node.querySelector('.correlation').textContent=state.mode==='sgp' ? 'Joint value unverified' : `${p.legs.length} games/legs`;
    const legs=node.querySelector('.legs');
    p.legs.forEach((l,i)=>{
      const d=document.createElement('div'); d.className='leg sport-visual-leg'; d.dataset.caesarsId=window.CAESARS_COMPARE?.register('nfl',l)||'';
      if(l.isAltLine){d.dataset.altLine='true';const milestone=window.NFL_ALT_LINES?.label?.(l);if(milestone)d.dataset.altLabel=milestone;}
      if(state.mode==='multi')d.dataset.compactMatchup=[nflKickoff(l.kickoff),nflMatchup(l.gameLabel)].filter(Boolean).join(' · ');
      const originalPx=window.NFL_PROJECTIONS?.describe?.(l)||{},quality=window.PICK_QUALITY?.assess('nfl',l,nflQualityForecast(l));const px=quality?{...originalPx,modelProbability:quality.modelP,ev:quality.ev,edge:quality.modelP-quality.quote.p}:originalPx;
      const mp=Number(px.modelProbability??px.modelP??l.modelProbability),mk=Number(px.marketProbability??px.marketP??l.marketProbability),ed=Number(px.edge??l.modelEdge),ev=Number(px.ev??l.modelEV),rawPl=px.projectedLine??px.projectionLine??l.projectedLine,pl=rawPl==null?NaN:Number(rawPl),ln=l.point==null?NaN:Number(l.point);
      const metrics=[];
      if(quality?.pass&&quality.warnings?.length)metrics.push(...quality.warnings);
      if(Number.isFinite(pl)&&Number.isFinite(ln))metrics.push('Projection '+pl.toFixed(1)+' · Line '+ln);
      if(l.nflV3Tier==='model'&&quality?.tier!=='suggestion'){
        if(Number.isFinite(mp))metrics.push('Model '+Math.round(mp*100)+'%');
        if(Number.isFinite(mk))metrics.push('Market '+Math.round(mk*100)+'%');
        if(Number.isFinite(ed))metrics.push('Estimated edge '+(ed>=0?'+':'')+Math.round(ed*100)+'%');
        if(Number.isFinite(ev))metrics.push((quality?.validated?'EV ':'Estimated return ')+(ev>=0?'+':'')+Math.round(ev*100)+'%');
      }else if(l.nflV3Tier==='market'){
        metrics.push('Market-qualified');
        metrics.push('Input quality '+Math.round(Number(l.selectionConfidence)||Number(l.confidence)||0));
      }
      d.innerHTML=`<span class="nfl-leg-media">${window.SPORT_MEDIA?.nfl({...l,game:l.gameLabel})||''}${l.player&&l.team?window.SPORT_MEDIA?.nfl({team:l.team})||'':''}</span><div class="sport-visual-copy"><div class="leg-quote-row"><div class="leg-pick"><div class="leg-title">${i+1}. ${window.MARKET_GUARDS.esc(l.name)}</div>${state.mode==='multi'?`<div class="leg-sub">${window.MARKET_GUARDS.esc((l.gameLabel||'')+(nflKickoff(l.kickoff)?' · Starts '+nflKickoff(l.kickoff,true):''))}</div>`:''}</div><strong class="leg-quote" aria-label="American odds ${fmtOdds(l.price)}">${window.PICK_QUALITY?.quoteLabel('nfl',l)||fmtOdds(l.price)}</strong></div><div class="leg-reason">${window.MARKET_GUARDS.esc(metrics.length?metrics.join(' · '):reasonFor(l,state.mode==='sgp'))}</div></div>`;
      legs.appendChild(d);
    });
    
    wrap.appendChild(node);
  }
}

function renderNflExtras(parlays,featured){
  if(!window.EXTRA_PICKS)return;
  let games=nflSlate();
  if(state.mode==='sgp'){const game=games.find(g=>g.id===$('#gameSelect').value)||games[0];games=game?[game]:[]}
  const rows=games.flatMap(g=>(g.markets||[]).filter(m=>state.selectedMarkets.has(m.type)&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,state.lineMode)))
    .map(m=>({market:m,forecast:nflQualityForecast(m),game:g})));
  window.EXTRA_PICKS?.show('nfl',{rows,selected:[...parlays.filter(Boolean).flatMap(p=>p.legs),featured].filter(Boolean),
    event:m=>{const g=games.find(g=>(g.markets||[]).includes(m));return g?nflMatchup(g.away+' @ '+g.home):''},media:m=>window.SPORT_MEDIA?.nfl(m)||''});
}

function renderTdMarkets(){
  const host=$('#tdMarketOptions');if(!host)return;
  if(!state.selectedMarkets.has('td')){host.replaceChildren();return}
  const esc=window.MARKET_GUARDS.esc;
  const rows=(state.games||[]).filter(g=>Date.parse(g.commence_time)>Date.now())
    .flatMap(g=>(g.markets||[]).filter(m=>m.type==='td'&&m.tdExperimental&&m._rosterVerified&&Number.isFinite(m.modelProbability))
      .map(m=>({m,g}))).sort((a,b)=>b.m.modelProbability-a.m.modelProbability).slice(0,4);
  if(!rows.length){host.innerHTML='<p class="td-market-note">No verified pregame TD markets available.</p>';return}
  const leg=({m,g},i)=>{
    const x=m.tdOpportunity;
    return '<div class="leg sport-visual-leg">'+(window.SPORT_MEDIA?.nfl(m)||'')+'<div class="sport-visual-copy"><div class="leg-quote-row"><div class="leg-pick"><div class="leg-title">'+(i+1)+'. '+esc(m.name)+'</div><div class="leg-sub">'+esc(g.away+' at '+g.home)+' · Experimental '+Math.round(m.modelProbability*100)+'%</div></div><strong class="leg-quote" aria-label="Market probability '+Math.round(m.marketProbability*100)+' percent">'+Math.round(m.marketProbability*100)+'%<small>market</small></strong></div><details class="leg-details"><summary>Opportunity detail</summary><div class="leg-reason">Last '+x.games+' games: '+(x.ten_rush+x.ten_target)+' opportunities inside the 10</div></details></div></div>';
  };
  host.innerHTML='<div class="td-market-head">Touchdown markets <small>Experimental · straight only until validated</small></div><div class="legs">'+rows.map((row,i)=>leg(row,i)).join('')+'</div>';
}

function countPlayerProps(game){ return game?.markets?.filter(m=>m.player).length || 0; }

async function generate(){const request=window.__NFL_GENERATION_SEQUENCE=(window.__NFL_GENERATION_SEQUENCE||0)+1;
  if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;
  for(const game of state.games)window.NFL_ALT_LINES?.classify?.(game);
  const token=window.__SPORT_TOKEN;
  const current=()=>((window.__ACTIVE_SPORT||'nfl')==='nfl'&&window.__SPORT_TOKEN===token&&request===window.__NFL_GENERATION_SEQUENCE);
  window.NFL_PROJECTIONS?.enrich?.();
  window.NFL_MODEL_V3?.enrich?.();if(typeof prepareNflQuality==='function')prepareNflQuality();
  const count=Math.max(2,Math.min(4,Math.floor(Number($('#legsSelect').value))||2));
  $('#legsSelect').value=String(count);
  const variants=['safe','balanced','long'];
  let parlays;
  if(state.mode==='sgp'){
    const slate=nflSlate();
    const game=slate.find(g=>g.id===$('#gameSelect').value) || slate[0];
    if(!game){window.PICK_OF_DAY?.show?.('nfl');$('#results').innerHTML='<div class="empty">No NFL games are loaded.</div>';return;}
    await ensurePropsForGame(game);
    if(!current())return;
    window.NFL_PROJECTIONS?.enrich?.(true);window.NFL_MODEL_V3?.enrich?.();if(typeof prepareNflQuality==='function')prepareNflQuality();
    const propCount=countPlayerProps(game);
    if(state.apiKey && propCount===0 && game?.propStatus==='none'){
      $('#resultsTitle').textContent='No Caesars player props posted yet';
    }else{
      $('#resultsTitle').textContent=propCount
        ? `Logical correlated SGPs • ${propCount} live props`
        : 'Logical correlated SGPs';
    }
    if(state.apiKey && !String(game?.id||'').startsWith('demo-') && propCount===0){
      render([]);
      $('#results').innerHTML='<div class="empty">No live Caesars player props are available for this game yet, so no SGP will be generated from team lines alone.</div>';
      return;
    }
    parlays=[];
    for(const v of variants){
      const p=buildSgp(game,count,state.risk,v,[]);
      parlays.push(p);
    }
  }else{
    await ensurePropsForMultiGame(6);
    if(!current())return;
    window.NFL_PROJECTIONS?.enrich?.(true);window.NFL_MODEL_V3?.enrich?.();if(typeof prepareNflQuality==='function')prepareNflQuality();
    parlays=variants.map(v=>buildMulti(count,state.risk,v));
  }
  // Keep the best independent build for each risk profile in swipe order.
  // Repeated generation uses the same inputs; profiles never penalize each other.
  if(current())render(parlays.filter(Boolean));
}

window.generate=generate;
window.NFL_PARLAY_STATE=state;
window.NFL_PARLAY_ELIGIBILITY={isParlayEligible,straightOnlyMarkets:[...STRAIGHT_ONLY_MARKETS]};
$$('#marketChips .chip').forEach(c=>{c.classList.toggle('active',state.selectedMarkets.has(c.dataset.market));c.setAttribute('aria-pressed',String(c.classList.contains('active')))});
$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
$('#gameChooserWrap').style.display=state.mode==='sgp'?'flex':'none';
$$('.tab').forEach(btn=>btn.addEventListener('click',async()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
  state.mode=btn.dataset.mode;
  $('#gameChooserWrap').style.display=state.mode==='sgp'?'flex':'none';
  $('#modeTitle').textContent=state.mode==='sgp'?'Same Game Parlay':'Multi-Game Parlay';
  $('#resultsTitle').textContent=state.mode==='sgp'?'Logical correlated SGPs':'Best legs across the slate';
  await generate();
}));

$('#nflWeekSelect')?.addEventListener('change',e=>{state.nflWeek=e.target.value;hydrateGames();generate()});
$('#gameSelect').addEventListener('change',()=>generate());
$$('#marketChips .chip').forEach(c=>c.addEventListener('click',()=>{
  if((window.__ACTIVE_SPORT||'nfl')!=='nfl') return;
  c.classList.toggle('active');
  c.setAttribute('aria-pressed',c.classList.contains('active')?'true':'false');
  c.classList.contains('active')?state.selectedMarkets.add(c.dataset.market):state.selectedMarkets.delete(c.dataset.market);
  if(c.dataset.market==='td')renderTdMarkets();
  const title=$('#resultsTitle');
  if(title) title.textContent=state.selectedMarkets.size?'Generating selected NFL markets…':'Select at least one NFL market';
  if(state.selectedMarkets.size) generate(); else $('#results').innerHTML='<div class="empty">Select one or more markets to build an NFL parlay.</div>';
}));

const dialog=$('#settingsDialog');
$('#settingsBtn').addEventListener('click',()=>{$('#apiKeyInput').value=state.apiKey;dialog.showModal();});
$('#saveKeyBtn').addEventListener('click',()=>{
  state.apiKey=$('#apiKeyInput').value.trim();
  if(state.apiKey)localStorage.setItem('nflParlayOddsApiKey',state.apiKey); else localStorage.removeItem('nflParlayOddsApiKey');
  dialog.close(); renderApiUsage(); window.CAESARS_COMPARE?.refresh?.();
loadData();
});
$('#clearKeyBtn').addEventListener('click',()=>{
  state.apiKey=''; localStorage.removeItem('nflParlayOddsApiKey'); dialog.close(); window.CAESARS_COMPARE?.refresh?.(); loadData();
});

loadData();
