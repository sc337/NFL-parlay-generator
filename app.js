const state = {
  mode:window.DASHBOARD_UI?.get('nfl','mode','sgp')||'sgp',
  nflWeek:window.DASHBOARD_UI?.get('nfl','week','')||'',
  lineMode:['standard','alt','both'].includes(window.DASHBOARD_UI?.get('nfl','lines','standard'))?window.DASHBOARD_UI.get('nfl','lines','standard'):'standard',
  moreCushion:false,
  requirePlayerProp:window.DASHBOARD_UI?.get('nfl','requireProp','off')==='on',
  risk:50,
  recommendationTier:window.DASHBOARD_UI?.get('nfl','tier','screened')||'screened',
  selectedMarkets:new Set(window.DASHBOARD_UI?.get('nfl','markets',['h2h','spreads','totals','passing','rushing','receiving','receptions','passing_tds','completions','td'])||['h2h','spreads','totals','passing','rushing','receiving','receptions','passing_tds','completions','td']),
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

// Enable the newly requested category once, without resetting saved filters.
if(!window.DASHBOARD_UI?.get('nfl','passingTDsAdded',false)){state.selectedMarkets.add('receiving');state.selectedMarkets.add('passing_tds');window.DASHBOARD_UI?.put('nfl','passingTDsAdded',true);window.DASHBOARD_UI?.put('nfl','markets',[...state.selectedMarkets]);}

if(!window.DASHBOARD_UI?.get('nfl','scorerCompletionsAdded',false)){state.selectedMarkets.add('td');state.selectedMarkets.add('completions');window.DASHBOARD_UI?.put('nfl','scorerCompletionsAdded',true);window.DASHBOARD_UI?.put('nfl','markets',[...state.selectedMarkets]);}

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

  const cached=res.headers.get('x-nfl-parlay-cache')==='HIT';
  if(!cached&&remaining!==null) state.apiUsage.remaining=Number(remaining);
  if(!cached&&used!==null) state.apiUsage.used=Number(used);
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
  if(m?.player&&window.NFL_ALT_LINES?.supportedProp&&!window.NFL_ALT_LINES.supportedProp(m))return false;
  // TD scorer estimates remain experimental until prospective validation.
  const altUnder=window.PICK_QUALITY?.unsupportedAltUnder?.(m)??((!!m?.player||String(m?.marketKey||'').startsWith('player_'))&&(m?.isAltLine===true||/_alternate$/.test(m?.marketKey||''))&&m?.side==='under');
  return !altUnder&&!STRAIGHT_ONLY_MARKETS.has(String(m?.marketKey||'').toLowerCase());
}

const PROP_MARKET_META = {
  player_pass_yds:{type:'passing',label:'passing yards'},
  player_pass_yds_alternate:{type:'passing',label:'passing yards'},
  player_pass_tds:{type:'passing_tds',label:'passing TDs'},
  player_pass_attempts:{type:'passing',label:'pass attempts'},
  player_pass_completions:{type:'completions',label:'completions'},
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
    source:'FanDuel',quotedAt,
    player,
    name,
    price:out.price,
    team:'Player',
    confidence:Math.round(impliedProbability(out.price)*100),
    side:marketKey==='player_anytime_td'?'yes':side,
    point
  };
}

async function discoverFanDuelMarkets(game){
  const url=new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/markets`);
  url.searchParams.set('apiKey',state.apiKey);
  url.searchParams.set('regions','us');
  url.searchParams.set('bookmakers','fanduel');
  const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
  trackApiUsage(res);
  if(!res.ok) throw new Error('Event markets API '+res.status);
  const raw=await res.json();
  const book=(raw.bookmakers||[]).find(b=>b.key==='fanduel');
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
      setStatus(`Checking FanDuel props: ${game.away} @ ${game.home}…`);
      const available=await discoverFanDuelMarkets(game);
      const requested=PROP_MARKETS.filter(k=>available.has(k));

      if(!requested.length){
        game.propStatus='none';
        game.availablePropMarkets=[];
        state.propsLoaded.add(game.id);
        setStatus('FanDuel has not posted supported player props for this game yet');
        return;
      }

      game.availablePropMarkets=requested;
      setStatus(`Loading ${requested.length} FanDuel prop markets…`);

      const url=new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/odds`);
      url.searchParams.set('apiKey',state.apiKey);
      url.searchParams.set('regions','us');
      url.searchParams.set('markets',requested.join(','));
      url.searchParams.set('oddsFormat','american');
      url.searchParams.set('bookmakers','fanduel');

      const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
      trackApiUsage(res);
      if(!res.ok) throw new Error('Prop odds API '+res.status);
      const raw=await res.json();
      const book=(raw.bookmakers||[]).find(b=>b.key==='fanduel');
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
      window.NFL_ODDS_PRIMARY?.enrichProps?.(game);
      game.propStatus=cleaned.length?'loaded':'empty';
      state.propsLoaded.add(game.id);

      setStatus(
        cleaned.length
          ? `Live FanDuel markets • ${cleaned.length} player props loaded`
          : 'FanDuel prop markets were listed, but no usable outcomes were returned'
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
  const book=(g.bookmakers||[]).find(b=>b.key==='fanduel');
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
  for(const market of markets){market.source='FanDuel';market.quotedAt=book?.markets?.find(m=>m.key===(market.marketKey||market.type))?.last_update||book?.last_update||new Date().toISOString();}
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
  return (state.games||[]).filter(g=>window.SLATE_UI?window.SLATE_UI.matches('nfl',{},g.commence_time):state.nflWeek==='all'||!state.nflWeek||nflWeekKey(g.commence_time)===state.nflWeek);
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

function profileSelectionScore(q,variant){return window.CONSERVATIVE_POLICY?.assessProfile('nfl',{},q,variant)?.rank??-999;}
function distinctProfileBuild(p,previous){return !!p;}
function candidateScore(m,risk,variant='balanced'){
  if(window.NFL_ALT_LINES&&!window.NFL_ALT_LINES.matches(m,state.lineMode))return -999;
  if(window.PICK_QUALITY){const ideas=window.NFL_PARLAY_IDEAS?.active?.(state);const x=ideas?window.NFL_PARLAY_IDEAS.assess(m,window.PICK_QUALITY.gameFor('nfl',m),state):window.PICK_QUALITY.assess('nfl',m,nflQualityForecast(m,variant),{parlay:true});const conservative=window.CONSERVATIVE_POLICY?.assessProfile('nfl',m,x,variant);const score=conservative?conservative.rank:x.pass&&(!window.NFL_ALT_IDEAS?.active?.(state,variant)||x.conservativeP>=.55)?profileSelectionScore(x,variant):-999;return score>-900?score+(window.SELECTION_UI?.locked?.('nfl',m)?10000:0)+((state.moreCushion||variant==='safe')?Math.min(3,window.NFL_ALT_LINES?.cushionBonus?.(m)||0):0):-999;}
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

// Complete-build ranking uses a bounded deterministic shortlist. Reference quotes
// are scenario inputs only; they are never promoted to independent model forecasts.
function sgpCombinationRisk(legs,game,ideas,trials=1000,variant=null){
  const entries=legs.map(m=>({market:m,forecast:nflQualityForecast(m,variant),game}));
  if(ideas){
    const gate=window.NFL_PARLAY_IDEAS.checkBuild(legs,state);
    if(!gate.pass)return null;
    const scenario=window.PARLAY_RISK?.scenarios(entries,gate.checks.map(x=>({modelP:x.quote.p})),trials);
    return scenario?{pass:true,modelP:null,referenceP:scenario.modelP,independentP:gate.checks.reduce((p,x)=>p*x.quote.p,1),scenario,validated:false}:null;
  }
  const gate=window.PICK_QUALITY?.checkBuild('nfl',entries,true);
  if(!gate?.pass)return null;
  const scenario=window.PARLAY_RISK?.scenarios(entries,gate.checks,trials);
  return scenario?{pass:true,modelP:scenario.modelP,independentP:gate.checks.reduce((p,x)=>p*x.modelP,1),scenario,validated:false}:null;
}
// Direction and threshold changes do not create a new underlying exposure.
function sgpExposure(m){
  return [m.player?'player:'+m.player:'team:'+(m.team||'Game'),String(m.marketKey||m.type).replace(/_alternate$/,'')].join('|');
}
function sgpExposureOverlap(a,b){
  const keys=new Set(a.legs.map(sgpExposure));return b.legs.filter(m=>keys.has(sgpExposure(m))).length;
}
function sgpConcentrationPass(legs){
  const counts=new Map();
  for(const m of legs){
    if(!m.player||!['receiving','receptions'].includes(m.type))continue;
    const key=m.team||'unknown';counts.set(key,(counts.get(key)||0)+1);
  }
  // Policy limit while target competition and receiver dependence are unvalidated.
  return [...counts.values()].every(n=>n<=2);
}
function sgpLikelihood(p){
  const risk=p?.risk,raw=risk?.modelP??risk?.referenceP;
  if(!Number.isFinite(raw))return null;
  // Assumed positive correlation must not be the sole reason for a safer label.
  const independent=risk.independentP,lower=risk.scenario?.sensitivity?.[0];
  return Math.min(raw,Number.isFinite(independent)?independent:raw,Number.isFinite(lower)?lower:raw);
}
function sgpProfileFits(p,variant,previous){return p?.risk?.pass===true&&Number.isFinite(sgpLikelihood(p));}
function pickDistinctAlternative(game,count,risk,variant,previous){
  const profileOverlapPenalty=(legs,previous)=>{const exposure=m=>[m.gameId||'',m.player||m.team||'Game',String(m.marketKey||m.type).replace(/_alternate$/,'')].join('|');return previous.filter(Boolean).reduce((sum,p)=>sum+legs.filter(m=>p.legs.some(x=>exposure(x)===exposure(m))).length*2,0)};
  const ideas=!!window.NFL_PARLAY_IDEAS?.active?.(state);
  const scores=new Map(),checks=new Map();
  const balancePenalty=legs=>variant==='balanced'&&window.MARKET_GUARDS?.balancedPenalty?window.MARKET_GUARDS.balancedPenalty(legs.map(m=>{if(!checks.has(m))checks.set(m,window.PICK_QUALITY.assess('nfl',m,nflQualityForecast(m),{parlay:true}));return checks.get(m)}),legs.map(m=>({...m,canonical_event_id:'nfl:'+game.id}))):0;
  const pool=game.markets.filter(m=>{
    if(!isParlayEligible(m)||!(window.NFL_ALT_LINES?.selected?.(m,state.selectedMarkets)??state.selectedMarkets.has(m.type)))return false;
    const score=candidateScore(m,risk,variant);scores.set(m,score);return score>-900;
  }).sort((a,b)=>scores.get(b)-scores.get(a)||String(a.ticker||a.name).localeCompare(String(b.ticker||b.name)));
  // Round-robin underlying exposures so one player's threshold ladder cannot
  // crowd distinct players out of the search. Keep several real quoted levels.
  const groups=new Map();
  for(const m of pool){const key=sgpExposure(m);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
  const ranked=[];
  for(let level=0;level<4&&ranked.length<96;level++)for(const rows of groups.values()){
    if(rows[level])ranked.push(rows[level]);if(ranked.length>=96)break;
  }
  const diagnostics={qualified:pool.length,players:new Set(pool.filter(m=>m.player).map(m=>m.player)).size,
    compatible:0,qualityRejected:0,riskRejected:0,profileRejected:0,concentrationRejected:0};
  game.sgpSearchDiagnostics=diagnostics;
  let beams=[{legs:[],score:0}];
  for(let depth=0;depth<count;depth++){
    const next=[],seen=new Set();
    for(const beam of beams)for(const m of ranked){
      if(beam.legs.includes(m)||!coherentWithLegs(m,beam.legs,variant))continue;
      const legs=[...beam.legs,m],signature=parlaySignature({legs});
      if(!sgpConcentrationPass(legs)){diagnostics.concentrationRejected++;continue;}
      if(seen.has(signature))continue;seen.add(signature);
      const score=beam.score+scores.get(m);next.push({legs,score,objective:score-balancePenalty(legs)-profileOverlapPenalty(legs,previous)});
    }
    next.sort((a,b)=>b.objective-a.objective||parlaySignature(a).localeCompare(parlaySignature(b)));
    const paths=new Map();beams=[];
    for(const beam of next){
      const key=beam.legs.map(sgpExposure).sort().join('|');
      const n=paths.get(key)||0;if(n>=4)continue;paths.set(key,n+1);beams.push(beam);if(beams.length>=240)break;
    }
  }
  const complete=beams.filter(b=>b.legs.length===count&&(!state.requirePlayerProp||b.legs.some(m=>m.player)));
  diagnostics.compatible=complete.length;
  // Likelihood-first research has a wider pool; keep UI work bounded while
  // preserving player-milestone paths before running joint scenarios.
  const evaluated=window.NFL_ALT_IDEAS?.active?.(state,variant)?complete.sort((a,b)=>b.legs.filter(m=>m.player).length-a.legs.filter(m=>m.player).length||b.score-a.score).slice(0,64):complete;
  const candidates=evaluated.map(b=>{
    const p=packageParlay(b.legs,variant,true,{deferRisk:true});
    if(!p){diagnostics.qualityRejected++;return null;}
    p.risk=sgpCombinationRisk(p.legs,game,ideas,1000,variant);
    if(!p.risk){diagnostics.riskRejected++;return null;}
    p.searchScore=b.score/count;
    p.balancePenalty=balancePenalty(b.legs)+profileOverlapPenalty(b.legs,previous);
    return p;
  }).filter(p=>{if(!p)return false;
    // The small search simulation only ranks candidates. Near-band candidates
    // receive the full check before the final profile label is assigned.
    const near=sgpProfileFits(p,variant,previous);
    if(!near)diagnostics.profileRejected++;return near;
  });
  // Within each risk band prefer the highest lower sensitivity scenario,
  // with individual evidence as a modest tie-breaker. No correlation bonus or EV claim.
  candidates.sort((a,b)=>(window.NFL_ALT_IDEAS?.active?.(state,variant)?b.legs.filter(m=>m.player).length-a.legs.filter(m=>m.player).length:0)||(b.risk.scenario.sensitivity[0]*100+b.searchScore*.03-b.balancePenalty)-(a.risk.scenario.sensitivity[0]*100+a.searchScore*.03-a.balancePenalty)||parlaySignature(a).localeCompare(parlaySignature(b)));
  for(const p of candidates.slice(0,12)){
    p.risk=sgpCombinationRisk(p.legs,game,ideas,8000,variant);
    if(!sgpProfileFits(p,variant,previous)){diagnostics.profileRejected++;continue;}
    p.altIdea=!!window.NFL_ALT_IDEAS?.active?.(state,variant);
    p.gameLabel=`${game.away} @ ${game.home}`;p.kickoff=game.commence_time;
    p.teamMix=teamCounts(p.legs,game).every(n=>n>0)?'Both teams':'Concentrated';
    p.scriptName=ideas?'Reference-based joint scenario':'Experimental joint scenario';
    p.summary=state.recommendationTier==='likelihood'?'Win Chance compares compatible same-game builds using the lower experimental sensitivity scenario. Joint estimates remain unvalidated; value is unchecked. Confirm exact lines and combined sportsbook price.':'Complete SGP uses per-leg buffered likelihood thresholds; no required prop mix. '+
      (ideas?'Reference prices supply scenario inputs, not a validated win forecast. ':'Model inputs and same-game dependence remain experimental. ')+
      'At most two receiver props per offense; safer labels cannot rely on assumed correlation uplift. Profile ordering is approximate. Verify exact lines and combined SGP odds on Caesars; not a proven edge.';
    if(p.altIdea)p.summary='ALT research idea · Prioritizes buffered likelihood, stable workload and distinct player milestones. Individual value unchecked; same-game dependence remains experimental. Confirm exact sportsbook lines and combined price.';
    return p;
  }
  return null;
}
function buildSgp(game,count,risk,variant,previous=[]){
  count=Math.max(2,Math.min(4,Math.floor(Number(count))||2));
  window.NFL_ALT_LINES?.classify?.(game);
  return pickDistinctAlternative(game,count,risk,variant,previous);
}

function sgpBuildReason(d,count){
  if(!d?.qualified)return 'No selections passed the selected profile and quality checks.';
  if(!d.compatible)return 'No '+count+' distinct compatible legs found. Duplicate players, opposing team markets and receiver concentration are restricted.';
  if(d.qualityRejected===d.compatible)return 'Compatible combinations failed the complete-build quality checks.';
  if(d.riskRejected&&d.qualityRejected+d.riskRejected===d.compatible)return 'Joint-risk estimates could not be verified for the compatible combinations.';
  return 'Compatible combinations could not produce a finite joint-risk estimate.';
}
function buildSgpProfiles(game,count,risk,variants){
  const requested=count,attempts=[];
  for(let size=count;size>=2;size--){
    const parlays=[],reasons=[];
    for(const v of variants){
      const p=buildSgp(game,size,risk,v,parlays.filter(Boolean));
      reasons.push(({safe:'Conservative',balanced:'Balanced',long:'Lotto'})[v]+': '+sgpBuildReason(game.sgpSearchDiagnostics,size));
      if(p&&size<requested){p.requestedLegs=requested;p.fallbackReason=attempts[0]?.reason;}
      parlays.push(p);
    }
    attempts.push({count:size,reason:[...new Set(reasons)].join(' ')});
    if(parlays.some(Boolean))return {parlays,count:size,requested,reason:size<requested?attempts[0].reason:null};
  }
  return {parlays:[],count:requested,requested,reason:attempts[0]?.reason};
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

function buildMulti(count,risk,variant,previous=[]){
  const profileOverlapPenalty=(legs,previous)=>{const exposure=m=>[m.gameId||'',m.player||m.team||'Game',String(m.marketKey||m.type).replace(/_alternate$/,'')].join('|');return previous.filter(Boolean).reduce((sum,p)=>sum+legs.filter(m=>p.legs.some(x=>exposure(x)===exposure(m))).length*2,0)};
  count=Math.max(2,Math.min(4,Math.floor(Number(count))||2));
  const checks=new Map(),balancePenalty=legs=>variant==='balanced'&&window.MARKET_GUARDS?.balancedPenalty?window.MARKET_GUARDS.balancedPenalty(legs.map(m=>{const key=m.ticker||m.name;if(!checks.has(key))checks.set(key,window.PICK_QUALITY.assess('nfl',m,nflQualityForecast(m),{parlay:true}));return checks.get(key)}),legs):0;
  window.NFL_MODEL_V3?.enrich?.();
  const targetRisk=Math.max(0,Math.min(100,risk + (variant==='safe'?-18:variant==='long'?24:0)));
  const all=[];
  for(const g of nflSlate()){
    window.NFL_ALT_LINES?.classify?.(g);
    for(const m of g.markets){
      if(!(window.NFL_ALT_LINES?.selected?.(m,state.selectedMarkets)??state.selectedMarkets.has(m.type)) || !isParlayEligible(m)) continue;
      const score=candidateScore(m,targetRisk,variant);
      if(score<=-900) continue;
      all.push({m,g,score});
    }
  }
  all.sort((a,b)=>b.score-a.score);

  const ranked=all.slice(0,80);let beams=[{legs:[],games:new Set(),score:0}];
  for(let depth=0;depth<count;depth++){
    const next=[],seen=new Set();
    for(const beam of beams)for(const x of ranked){
      if(beam.games.has(x.g.id)||x.m.player&&playerCount(beam.legs,x.m.player))continue;
      const legs=[...beam.legs,{...x.m,gameLabel:`${x.g.away} @ ${x.g.home}`,kickoff:x.g.commence_time}];
      const signature=parlaySignature({legs});if(seen.has(signature))continue;seen.add(signature);
      const families=legs.map(propFamily),same=families.filter(f=>f===propFamily(x.m)).length;
      const score=beam.score+x.score-(x.m.player&&same>Math.ceil(count/2)?8:0);
      next.push({legs,games:new Set([...beam.games,x.g.id]),score,objective:score-balancePenalty(legs)-profileOverlapPenalty(legs,previous)});
    }
    next.sort((a,b)=>b.objective-a.objective||parlaySignature(a).localeCompare(parlaySignature(b)));beams=next.slice(0,160);
  }
  for(const b of beams){if(b.legs.length!==count)continue;const p=packageParlay(b.legs,variant,false);if(p&&distinctProfileBuild(p,previous))return p;}
  return null;
}

function nflQualityForecast(m,variant=null){return {selectionMode:window.NFL_ALT_IDEAS?.active?.(state,variant)||state.recommendationTier==='likelihood'?'likelihood':'screened',modelVersion:m.modelVersion,opportunity:m.opportunity,roleChange:m.roleChange,sensitivity:m.sensitivity,baselines:m.baselines,marketAnchored:m.marketAnchored===true,modelP:m.modelProbability,rawModelP:m.rawModelProbability,coverage:m.projectionCoverage,uncertainty:m.modelUncertainty,roleStability:m.roleStability,marketP:m.marketProbability,experimental:m.tdExperimental||m.nflPropExperimental};}
function prepareNflQuality(){window.PICK_QUALITY?.prepare('nfl',(state.games||[]).flatMap(g=>(g.markets||[])),{},state.games,window.NFL_KALSHI?.snapshotAt?.()||null);}
function packageParlay(legs,variant,isSgp,meta={}){
 if(window.SELECTION_UI?.accepts&&!window.SELECTION_UI.accepts('nfl',legs))return null;
  const ideas=window.NFL_PARLAY_IDEAS?.active?.(state),likelihood=state.recommendationTier==='likelihood';
  if(ideas){if(!window.NFL_PARLAY_IDEAS.checkBuild(legs,state).pass)return null;}
  else if(window.PICK_QUALITY&&!window.PICK_QUALITY.checkBuild('nfl',legs.map(m=>({market:m,forecast:nflQualityForecast(m,isSgp?variant:null)})),isSgp).pass)return null;
  if(!legs?.length || legs.length>4 || legs.some(m=>!isParlayEligible(m))) return null;
  if(legs.some(m=>candidateScore(m,state.risk,variant)<=-900))return null;
  if(state.requirePlayerProp&&!legs.some(m=>m.player))return null;
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
  const risk=!ideas&&!meta.deferRisk?window.PARLAY_RISK?.summarize('nfl',legs.map(m=>({market:m,forecast:nflQualityForecast(m,isSgp?variant:null),game:window.PICK_QUALITY?.gameFor('nfl',m)})),{sgp:isSgp}):null;
  return {
    name:likelihood?'Win Chance':names[variant],profile:likelihood?'likelihood':variant,grade:likelihood?'WIN CHANCE':ideas?'PARLAY IDEA':grades[variant],legs,ideaTier:!!ideas,likelihoodTier:likelihood,
    odds:decimalToAmerican(decimal),score:Math.round(avg),
    risk,
    corr,
    scriptName:ideas?'Reference-market idea':meta.scriptName||'',
    thesis:meta.thesis||'',
    summary:likelihood?'Prioritizes buffered model likelihood, stable roles and evidence. Estimates are unvalidated; these selections can be poor value at the current price. Verify exact lines and the combined sportsbook offer.':ideas?({safe:window.CONSERVATIVE_POLICY?.description||'Prefers shorter reference prices and available cushion.',balanced:'Balances reference price and threshold difficulty.',long:'Uses tougher thresholds within the same participation safeguards.'}[variant]+' Recent context checked, not a proven edge. Verify exact thresholds and SGP price on Caesars.'):
    ({safe:window.CONSERVATIVE_POLICY?.description||'Prioritizes buffered likelihood with a penalty for excessive juice.',balanced:'Requires 65%+ buffered estimated likelihood per leg with price and quality checks.',long:'Requires 50%+ buffered estimated likelihood per leg; ranks higher payouts within quality checks.'}[variant]||'')+' '+(state.moreCushion?'Cushion is a small preference, not evidence of value. ':'')+(isSgp
      ? (meta.scriptName ? meta.scriptName+': '+meta.thesis : (corr>5?'Built around one coherent game script with positively related legs.':'Constraint-checked SGP with no opposing or duplicate game markets.'))
      : 'One leg per game. Combined model probability remains unvalidated; separate games do not guarantee independence.')
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
  const choices=(state.games||[]).filter(g=>g.game_status==='pre'&&(window.SLATE_UI?window.SLATE_UI.matches('nfl',{},g.commence_time):window.PICK_OF_DAY?.today?.(g.commence_time)))
    .flatMap(g=>(g.markets||[]).filter(m=>m.type!=='td'&&(window.NFL_ALT_LINES?.selected?.(m,state.selectedMarkets)??state.selectedMarkets.has(m.type))&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,state.lineMode))&&(!m.player||m._rosterVerified)&&Number.isFinite(Number(m.price))&&m.price!==0)
      .map(m=>({g,m,x:window.NFL_MODEL_V3?.evaluate?.(g,m)})))
    .filter(row=>window.PICK_QUALITY?window.PICK_QUALITY.assess('nfl',row.m,{...(row.x||{}),selectionMode:state.recommendationTier},{game:row.g,featured:true}).pass:row.x?.actionable&&Number(row.x.coverage)>=.2&&Number(row.x.confidence)>=55)
    .sort((a,b)=>window.PICK_QUALITY?window.PICK_QUALITY.assess('nfl',b.m,{...b.x,selectionMode:state.recommendationTier},{game:b.g}).rank-window.PICK_QUALITY.assess('nfl',a.m,{...a.x,selectionMode:state.recommendationTier},{game:a.g}).rank:(Number(b.x.confidence)+Math.max(0,Number(b.x.ev))*20)-(Number(a.x.confidence)+Math.max(0,Number(a.x.ev))*20));
  const chosen=window.PICK_QUALITY?.bestStraight?.('nfl',choices.map(row=>({market:row.m,forecast:row.x,game:row.g})));
  const best=window.PICK_QUALITY?.bestStraight?(chosen?{m:chosen.market,x:chosen.forecast,g:chosen.game}:null):choices[0];
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

function updateNflProfileAvailability(){
  const note=$('#profileAvailability');if(note){note.hidden=true;note.textContent='';}
}

function buildObjective(build){
 const checks=(build.legs||[]).map(m=>window.NFL_PARLAY_IDEAS?.active?.(state)?window.NFL_PARLAY_IDEAS.assess(m,window.PICK_QUALITY.gameFor('nfl',m),state):window.PICK_QUALITY?.assess('nfl',m,nflQualityForecast(m),{parlay:true}));
 if(!checks.length||checks.some(q=>!q?.pass))return -Infinity;
 return checks.reduce((sum,q)=>sum+q.rank,0)/checks.length+Math.min(...checks.map(q=>q.rank))*.35;
}
function render(parlays){
  const sgpResult=arguments[1];
  if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;
  window.NFL_PARLAY_IDEAS?.refresh?.();
  renderNflStraight();
  if(document.body.classList.contains('prediction-only')){const rows=nflSlate().filter(g=>Date.parse(g.commence_time)>Date.now()).flatMap(g=>(g.markets||[]).filter(m=>Number.isFinite(m.price)&&m.price!==0).map(m=>({...m,label:m.name,game_id:g.id,game_label:g.away+' at '+g.home,yes_ask:window.MODEL_CORE?.implied?.(m.price)})));$('#results').innerHTML=window.MARKET_GUARDS.watchlist(rows,'NFL');$('#resultsTitle').textContent='NFL Market Watchlist';return}
  const wrap=$('#results'); wrap.innerHTML='';
  const coverageGame=state.mode==='sgp'?nflSlate().find(g=>g.id===$('#gameSelect').value):null;
  window.NFL_PARLAY_UI?.renderPropCoverage?.(coverageGame,state,m=>nflQualityForecast(m,window.NFL_ALT_IDEAS?.active?.(state)?'safe':null),isParlayEligible);
  window.NFL_ALT_IDEAS?.mount?.(coverageGame,state);
  window.NFL_COMPLETIONS?.mount?.(nflSlate(),state,nflQualityForecast);renderTdMarkets();
  const tpl=$('#parlayTemplate');
  const profileOrder={safe:0,balanced:1,long:2};
  const requestedCount=Number($('#legsSelect')?.value)||2;
  const shownCount=sgpResult?.count||requestedCount;
  const displayedSignatures=new Set();
  const valid=parlays.filter(p=>{if(!p||p.legs?.length!==shownCount)return false;const key=parlaySignature(p);if(displayedSignatures.has(key))return false;displayedSignatures.add(key);return true;}).sort((a,b)=>(profileOrder[a.profile]??9)-(profileOrder[b.profile]??9));
  updateNflProfileAvailability(parlays);
  if(!valid.length){
    const count=Number($('#legsSelect')?.value)||2;
    let scoped=nflSlate();if(state.mode==='sgp')scoped=scoped.filter(g=>g.id===$('#gameSelect').value);
    const report=window.NFL_PARLAY_IDEAS?.report?.(scoped,state),esc=window.MARKET_GUARDS.esc;
    wrap.innerHTML='<div class="empty">'+esc(window.NFL_PARLAY_UI?.emptyMessage(report,count,state)||window.NFL_PARLAY_IDEAS?.emptyMessage(report,count,state)||'No qualifying NFL '+count+'-leg parlay for these filters.')+(window.NFL_PARLAY_IDEAS?.diagnostics?.(report)||'')+'</div>';
    if(state.mode==='sgp'){
      const g=scoped[0],all=g?.markets||[];
      const allowed=all.filter(isParlayEligible);
      const selected=allowed.filter(m=>(window.NFL_ALT_LINES?.selected?.(m,state.selectedMarkets)??state.selectedMarkets.has(m.type))&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,state.lineMode)));
      const profileCounts=['safe','balanced','long'].map(v=>({v,n:selected.filter(m=>candidateScore(m,state.risk,v)>-900).length}));
      const scored=selected.filter(m=>['safe','balanced','long'].some(v=>candidateScore(m,state.risk,v)>-900));
      const details=[
        all.length+' quoted markets',
        all.filter(m=>m.player).length+' player props',
        allowed.length+' parlay-eligible',
        selected.length+' selected by filters',
        profileCounts.map(({v,n})=>({safe:'Conservative 75%',balanced:'Balanced 65%',long:'Lotto 50%'})[v]+': '+n+' qualifying legs').join(' · ')
      ];
      const why=!all.length?'No quoted markets loaded. Check the NFL feed and refresh.':!selected.length?'Filters excluded every eligible market. Review Filters.':scored.length<count?'Too few qualifying legs for this build. Try fewer legs or review Filters.':'Available legs could not satisfy combination, quality, or profile checks.';
      wrap.innerHTML+='<p class="summary" role="status">SGP diagnostics: '+esc(details.join(' · '))+'. '+esc(sgpResult?.reason||why)+'</p>';
    }
    return;
  }
  for(const [index,p] of valid.entries()){
    const node=tpl.content.cloneNode(true);
    node.querySelector('.parlay-card').dataset.nflProfile=p.profile;
    if(sgpResult?.reason){
      const notice=document.createElement('p');notice.className='card-thesis sgp-build-notice';notice.setAttribute('role','status');
      notice.textContent='Showing '+shownCount+' legs of '+sgpResult.requested+' requested. '+sgpResult.reason;
      node.querySelector('.legs').before(notice);
    }
    node.querySelector('.grade').textContent=p.altIdea?'ALT IDEA · VALUE UNCHECKED':p.likelihoodTier?'WIN CHANCE · ESTIMATE':p.ideaTier?'PARLAY IDEA':window.PICK_QUALITY&&p.legs.some(m=>!window.PICK_QUALITY.validatedRule('nfl',m,nflQualityForecast(m)))?'UNVALIDATED':p.grade;
    node.querySelector('.parlay-name').textContent=p.ideaTier?'Other picks · Value unverified':p.name;
    node.querySelector('.parlay-card').dataset.profile=p.profile||'';
    const sb=node.querySelector('.script-badge');
    if(sb){ sb.textContent=p.scriptName||''; sb.style.display=p.scriptName?'inline-flex':'none'; }
    const sources=new Set(p.legs.map(m=>window.PICK_QUALITY?.quote('nfl',m)?.source||m.source));
    const estimateLabel=sources.size===1&&['FanDuel','Kalshi'].includes([...sources][0])?[...sources][0]+' est.':'Reference est.';
    node.querySelector('.odds').textContent=state.mode==='sgp'?'—':fmtOdds(p.odds);node.querySelector('.odds-label').textContent=state.mode==='sgp'?'Check SGP offer':estimateLabel;
    node.querySelector('.odds-label').title=state.mode==='sgp'?'Check your sportsbook for correlated SGP odds':'Combined individual quotes; actual sportsbook parlay odds may differ';
    node.querySelector('.summary').textContent=(state.mode==='sgp'&&p.gameLabel?p.gameLabel+' · ':'')+p.summary+(state.mode==='multi'?' Price estimate combines individual quotes; check your sportsbook for actual parlay odds.':'')+
      (state.mode==='sgp'&&p.teamMix==='Concentrated'?' One-team concentration.':'');
    const matchup=nflMatchup(p.gameLabel);
    node.querySelector('.summary').dataset.shortText=(state.mode==='sgp'?(nflKickoff(p.kickoff)?nflKickoff(p.kickoff)+' · ':'')+(matchup||'Same game'):'Multi-game · '+p.legs.length+' legs'+(state.nflWeek&&state.nflWeek!=='all'?' · '+nflWeekLabel(state.nflWeek):' · All upcoming'))+
      (p.requestedLegs&&p.legs.length<p.requestedLegs?' · '+p.legs.length+' of '+p.requestedLegs+' requested':'')+'. '+(p.altIdea?'ALT research idea; value unchecked.':p.likelihoodTier?'Favors buffered win estimates; value unchecked.':p.ideaTier?'Recent matchup context checked; value unverified.':'Each leg clears the buffered value screen; estimates unvalidated.');
    if(state.mode==='sgp'&&p.gameLabel){const teams=p.gameLabel.split(/\s+@\s+/);if(teams.length===2){node.querySelector('.summary').dataset.away=teams[0];node.querySelector('.summary').dataset.home=teams[1]}}
    node.querySelector('.score').textContent=p.likelihoodTier?'Win Chance estimate · Value unchecked':p.ideaTier?'Reference-market idea · Not verified value':`Rating ${p.score}/100 · Not win chance`;
    node.querySelector('.correlation').textContent=state.mode==='sgp' ? 'Joint value unverified' : `${p.legs.length} games/legs`;
    const legs=node.querySelector('.legs');
    p.legs.forEach((l,i)=>{
      const d=document.createElement('div'); d.className='leg sport-visual-leg'; d.dataset.caesarsId=window.CAESARS_COMPARE?.register('nfl',l)||'';
      if(l.isAltLine||state.lineMode==='alt'&&l.type==='receptions'&&l.side==='over'){d.dataset.altLine='true';const milestone=window.NFL_ALT_LINES?.label?.(l);if(milestone)d.dataset.altLabel=milestone;}
      d.dataset.eventTime=l.kickoff||'';d.dataset.matchup=l.gameLabel||'';
      if(state.mode==='multi')d.dataset.compactMatchup=[nflKickoff(l.kickoff),nflMatchup(l.gameLabel)].filter(Boolean).join(' · ');
      const originalPx=window.NFL_PROJECTIONS?.describe?.(l)||{},quality=window.PICK_QUALITY?.assess('nfl',l,nflQualityForecast(l,p.altIdea?'safe':null));const px=quality?{...originalPx,modelProbability:quality.modelP,ev:quality.ev,edge:quality.modelP-quality.quote.p}:originalPx;
      const mp=Number(px.modelProbability??px.modelP??l.modelProbability),mk=Number(px.marketProbability??px.marketP??l.marketProbability),ed=Number(px.edge??l.modelEdge),ev=Number(px.ev??l.modelEV),rawPl=px.projectedLine??px.projectionLine??l.projectedLine,pl=rawPl==null?NaN:Number(rawPl),ln=l.point==null?NaN:Number(l.point);
      const metrics=[];
      if(p.likelihoodTier&&quality)metrics.push('Buffered estimate '+Math.round(quality.conservativeP*100)+'% · Not measured accuracy');
      if(p.altIdea)metrics.push('ALT idea · Value unchecked',quality?.pricePass?'Individual price clears buffer; joint value unverified':'Individual price does not clear value buffer');
      if(p.ideaTier)metrics.push('Recent context checked · '+(l.source||'Reference')+' · Check Caesars');
      if(quality?.pass&&quality.warnings?.length)metrics.push(...quality.warnings);
      const lineComparison=window.NFL_ALT_LINES?.comparisonText?.(l,state.games.find(g=>g.id===l.gameId)||state.games.find(g=>(g.markets||[]).some(m=>m===l||m.ticker&&m.ticker===l.ticker)));
      if(lineComparison)metrics.push(lineComparison);
      if(Number.isFinite(pl)&&Number.isFinite(ln))metrics.push('Projection '+pl.toFixed(1)+' · Line '+ln);
      if(!p.altIdea&&!p.ideaTier&&!p.likelihoodTier&&l.nflV3Tier==='model'&&quality?.tier!=='suggestion'){
        if(Number.isFinite(mp))metrics.push('Model '+Math.round(mp*100)+'%');
        if(Number.isFinite(mk))metrics.push('Market '+Math.round(mk*100)+'%');
        if(Number.isFinite(ed))metrics.push('Estimated edge '+(ed>=0?'+':'')+Math.round(ed*100)+'%');
        if(Number.isFinite(ev))metrics.push((quality?.validated?'EV ':'Estimated return ')+(ev>=0?'+':'')+Math.round(ev*100)+'%');
      }else if(!p.altIdea&&!p.ideaTier&&!p.likelihoodTier&&l.nflV3Tier==='market'){
        metrics.push('Market-qualified');
        metrics.push('Input quality '+Math.round(Number(l.selectionConfidence)||Number(l.confidence)||0));
      }
      d.innerHTML=`<span class="nfl-leg-media">${window.SPORT_MEDIA?.nfl({...l,game:l.gameLabel})||''}${l.player&&l.team?window.SPORT_MEDIA?.nfl({team:l.team})||'':''}</span><div class="sport-visual-copy"><div class="leg-quote-row"><div class="leg-pick"><div class="leg-title">${i+1}. ${window.MARKET_GUARDS.esc(l.name)}</div>${state.mode==='multi'?`<div class="leg-sub">${window.MARKET_GUARDS.esc((l.gameLabel||'')+(nflKickoff(l.kickoff)?' · Starts '+nflKickoff(l.kickoff,true):''))}</div>`:''}</div><strong class="leg-quote" aria-label="American odds ${fmtOdds(l.price)}">${window.PICK_QUALITY?.quoteLabel('nfl',l)||fmtOdds(l.price)}</strong></div><div class="leg-reason">${window.MARKET_GUARDS.esc(metrics.length?metrics.join(' · '):reasonFor(l,state.mode==='sgp'))}</div></div>`;
      legs.appendChild(d);
    });
    
    if(!p.ideaTier)window.PARLAY_RISK?.attach(node.querySelector('.parlay-card'),'nfl',p.legs.map(m=>({market:m,forecast:nflQualityForecast(m,p.altIdea?'safe':null),game:window.PICK_QUALITY?.gameFor('nfl',m)})),{sgp:state.mode==='sgp'});
    wrap.appendChild(node);
  }
  const availability=$('#profileAvailability');if(availability)availability.hidden=true;

}

function renderNflExtras(parlays,featured){
  if(!window.EXTRA_PICKS)return;
  let games=nflSlate();
  if(state.mode==='sgp'){const game=games.find(g=>g.id===$('#gameSelect').value)||games[0];games=game?[game]:[]}
  const rows=games.flatMap(g=>(g.markets||[]).filter(m=>(window.NFL_ALT_LINES?.selected?.(m,state.selectedMarkets)??state.selectedMarkets.has(m.type))&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,state.lineMode)))
    .map(m=>({market:m,forecast:nflQualityForecast(m),game:g})));
  window.EXTRA_PICKS?.show('nfl',{rows,selected:[...parlays.filter(Boolean).flatMap(p=>p.legs),featured].filter(Boolean),
    event:m=>{const g=games.find(g=>(g.markets||[]).includes(m));return g?nflMatchup(g.away+' @ '+g.home):''},media:m=>window.SPORT_MEDIA?.nfl(m)||''});
}

function renderTdMarkets(){
  const host=$('#tdMarketOptions');if(!host)return;
  const drawer=$('#nflTdStraightDrawer');if(drawer)drawer.hidden=(window.__ACTIVE_SPORT||'nfl')!=='nfl'||!state.selectedMarkets?.has('td');
  const esc=window.MARKET_GUARDS.esc;
  let games=nflSlate();if(state.mode==='sgp')games=games.filter(g=>g.id===$('#gameSelect').value);
  const rows=games.filter(g=>Date.parse(g.commence_time)>Date.now())
    .flatMap(g=>(g.markets||[]).filter(m=>m.type==='td'&&m.tdExperimental&&m._rosterVerified&&Number.isFinite(m.modelProbability))
      .map(m=>({m,g}))).sort((a,b)=>b.m.modelProbability-a.m.modelProbability).slice(0,4);
  if(!rows.length){host.innerHTML='<p class="td-market-note">No verified pregame TD markets available.</p>';return}
  const leg=({m,g},i)=>{
    const x=m.tdOpportunity;
    return '<div class="leg sport-visual-leg">'+(window.SPORT_MEDIA?.nfl(m)||'')+'<div class="sport-visual-copy"><div class="leg-quote-row"><div class="leg-pick"><div class="leg-title">'+(i+1)+'. '+esc(m.name)+'</div><div class="leg-sub">'+esc(g.away+' at '+g.home)+' · Experimental '+Math.round(m.modelProbability*100)+'%</div></div><strong class="leg-quote" aria-label="Market probability '+Math.round(m.marketProbability*100)+' percent">'+Math.round(m.marketProbability*100)+'%<small>market</small></strong></div><details class="leg-details"><summary>Opportunity detail</summary><div class="leg-reason">Last '+x.games+' games: '+(x.ten_rush+x.ten_target)+' opportunities inside the 10</div></details></div></div>';
  };
  host.innerHTML='<div class="td-market-head">Touchdown markets <small>Experimental scorer estimates · Qualifying legs may enter parlays</small></div><div class="legs">'+rows.map((row,i)=>leg(row,i)).join('')+'</div>';
}

function countPlayerProps(game){ return game?.markets?.filter(m=>m.player).length || 0; }

async function generate(){const request=window.__NFL_GENERATION_SEQUENCE=(window.__NFL_GENERATION_SEQUENCE||0)+1;
  if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;
  for(const game of state.games)window.NFL_ALT_LINES?.classify?.(game);
  const token=window.__SPORT_TOKEN;
  const current=()=>((window.__ACTIVE_SPORT||'nfl')==='nfl'&&window.__SPORT_TOKEN===token&&request===window.__NFL_GENERATION_SEQUENCE);
  window.NFL_PROJECTIONS?.enrich?.();
  window.NFL_MODEL_V3?.enrich?.();if(typeof prepareNflQuality==='function')prepareNflQuality();
  if(window.SLATE_UI)hydrateGames();
  const count=Math.max(2,Math.min(4,Math.floor(Number($('#legsSelect').value))||2));
  $('#legsSelect').value=String(count);
  const variants=state.recommendationTier==='likelihood'?['safe']:['safe','balanced','long'];
  let parlays,sgpResult;
  if(state.mode==='sgp'){
    const slate=nflSlate();
    const game=slate.find(g=>g.id===$('#gameSelect').value) || slate[0];
    if(!game){window.PICK_OF_DAY?.show?.('nfl');$('#results').innerHTML='<div class="empty">No NFL games are loaded.</div>';return;}
    await ensurePropsForGame(game);
    if(!current())return;
    window.NFL_PROJECTIONS?.enrich?.(true);window.NFL_MODEL_V3?.enrich?.();if(typeof prepareNflQuality==='function')prepareNflQuality();
    const propCount=countPlayerProps(game);
    if(state.apiKey && propCount===0 && game?.propStatus==='none'){
      $('#resultsTitle').textContent='No FanDuel player props posted yet';
    }else{
      $('#resultsTitle').textContent=state.recommendationTier==='likelihood'?'Win Chance · Estimates, value unchecked':window.NFL_PARLAY_IDEAS?.active?.(state)?'Matchup ideas · Value unverified':propCount
        ? `Value-screened SGPs • ${propCount} quoted props`
        : 'Value-screened SGPs';
    }
    if(window.NFL_ALT_IDEAS?.active?.(state))$('#resultsTitle').textContent='ALT research ideas · Value unchecked';
    // A missing FanDuel prop feed must not suppress independently quoted team
    // markets (e.g. Kalshi). The normal quality and compatibility gates still apply.
    // Requiring a player prop remains an explicit user choice, not an API-key side effect.
    if(state.requirePlayerProp && propCount===0){
      render([]);
      $('#results').innerHTML='<div class="empty">No verified player props are available for this game. Turn off Require player prop in Filters to evaluate available team markets.</div>';
      return;
    }
    sgpResult=buildSgpProfiles(game,count,state.risk,variants);
    parlays=sgpResult.parlays;
  }else{
    await ensurePropsForMultiGame(6);
    if(!current())return;
    window.NFL_PROJECTIONS?.enrich?.(true);window.NFL_MODEL_V3?.enrich?.();if(typeof prepareNflQuality==='function')prepareNflQuality();
    parlays=[];for(const v of variants)parlays.push(buildMulti(count,state.risk,v,parlays.filter(Boolean)));
  }
  // Keep the best independent build for each risk profile in swipe order.
  // Repeated generation uses the same inputs; profiles never penalize each other.
  if(current()){window.NFL_PROFILE_HISTORY?.record?.(parlays.filter(p=>p&&!p.altIdea&&!p.ideaTier&&!p.likelihoodTier),state.mode);render(parlays,sgpResult);}
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
  $('#resultsTitle').textContent=state.recommendationTier==='likelihood'?'Win Chance · Estimates, value unchecked':window.NFL_PARLAY_IDEAS?.active?.(state)?'Matchup ideas · Value unverified':state.mode==='sgp'?'Value-screened SGPs':'Value-screened multi-game picks';
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
  window.NFL_COMPLETIONS?.mount?.(nflSlate(),state,nflQualityForecast);
  const title=$('#resultsTitle');
  if(title) title.textContent=state.selectedMarkets.size?'Generating selected NFL markets…':'Select at least one NFL market';
  if(state.selectedMarkets.size) generate(); else {window.EXTRA_PICKS?.clear?.();$('#results').innerHTML='<div class="empty">Select one or more markets to build an NFL parlay.</div>'}
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

