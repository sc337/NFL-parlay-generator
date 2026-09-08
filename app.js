const state = {
  mode:'sgp',
  risk:45,
  selectedMarkets:new Set(['h2h','spreads','totals','passing','rushing','receiving','td']),
  games:[],
  apiKey:localStorage.getItem('nflParlayOddsApiKey') || '',
  propsLoaded:new Set(),
  propsLoading:new Map(),
  apiUsage:{remaining:null,used:null,last:null}
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

function setStatus(msg){ $('#dataStatus').textContent=msg; }

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

const PROP_MARKETS = [
  'player_pass_yds','player_pass_yds_alternate','player_pass_tds','player_pass_attempts','player_pass_completions',
  'player_rush_yds','player_rush_yds_alternate','player_rush_attempts',
  'player_reception_yds','player_reception_yds_alternate','player_receptions',
  'player_anytime_td'
];

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
  player_receptions:{type:'receiving',label:'receptions'},
  player_anytime_td:{type:'td',label:'anytime TD'}
};

function normalizePropOutcome(marketKey,out){
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
  const res=await fetch(url);
  trackApiUsage(res);
  if(!res.ok) throw new Error('Event markets API '+res.status);
  const raw=await res.json();
  const book=(raw.bookmakers||[]).find(b=>b.key==='fanduel');
  return new Set((book?.markets||[]).map(m=>typeof m==='string'?m:m.key).filter(Boolean));
}

async function ensurePropsForGame(game){
  if(!state.apiKey || !game || String(game.id).startsWith('demo-') || state.propsLoaded.has(game.id)) return;
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

      const res=await fetch(url);
      trackApiUsage(res);
      if(!res.ok) throw new Error('Prop odds API '+res.status);
      const raw=await res.json();
      const book=(raw.bookmakers||[]).find(b=>b.key==='fanduel');
      const props=[];

      for(const m of book?.markets||[]){
        for(const out of m.outcomes||[]){
          const prop=normalizePropOutcome(m.key,out);
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
  const targets=state.games.filter(g=>!state.propsLoaded.has(g.id)).slice(0,limit);
  for(const g of targets) await ensurePropsForGame(g);
}

async function loadData(){
  if(!state.apiKey){
    state.games = structuredClone(demoGames);
    setStatus('Demo market data');
    hydrateGames();
    generate();
    return;
  }
  try{
    setStatus('Loading FanDuel markets…');
    const url = new URL('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/');
    url.searchParams.set('apiKey',state.apiKey);
    url.searchParams.set('regions','us');
    url.searchParams.set('markets','h2h,spreads,totals');
    url.searchParams.set('oddsFormat','american');
    url.searchParams.set('bookmakers','fanduel');
    const res = await fetch(url);
    trackApiUsage(res);
    if(!res.ok) throw new Error('Odds API '+res.status);
    const raw = await res.json();
    state.games = raw.map(normalizeGame).filter(g=>g.markets.length);
    state.propsLoaded.clear();
    setStatus('Live FanDuel team markets');
    hydrateGames();
    await generate();
  }catch(err){
    console.error(err);
    state.games = structuredClone(demoGames);
    setStatus('API unavailable — demo data active');
    hydrateGames();
    generate();
  }
}

function normalizeGame(g){
  const markets=[];
  const book=(g.bookmakers||[]).find(b=>b.key==='fanduel') || g.bookmakers?.[0];
  for(const m of book?.markets||[]){
    for(const out of m.outcomes||[]){
      if(m.key==='h2h'){
        markets.push({type:'h2h',name:out.name+' ML',price:out.price,team:out.name,confidence:Math.round(impliedProbability(out.price)*100)});
      }
      if(m.key==='spreads'){
        markets.push({type:'spreads',name:out.name+' '+(out.point>0?'+':'')+out.point,price:out.price,team:out.name,confidence:Math.round(impliedProbability(out.price)*100)});
      }
      if(m.key==='totals'){
        markets.push({type:'totals',name:out.name+' '+out.point,price:out.price,team:'Game',confidence:Math.round(impliedProbability(out.price)*100),side:out.name.toLowerCase()});
      }
    }
  }
  return {id:g.id,away:g.away_team,home:g.home_team,commence_time:g.commence_time,markets};
}

function hydrateGames(){
  const sel=$('#gameSelect');
  sel.innerHTML='';
  state.games.forEach(g=>{
    const o=document.createElement('option');
    o.value=g.id;
    o.textContent=`${g.away} @ ${g.home}`;
    sel.appendChild(o);
  });
}

function correlation(a,b){
  let score=0;
  const sameTeam=a.team===b.team && !['Game','Player'].includes(a.team);
  const samePlayer=a.player && b.player && a.player===b.player;
  const aOver=a.side==='over' || /Over|\+ passing|\+ receiving|\+ rushing/.test(a.name);
  const bOver=b.side==='over' || /Over|\+ passing|\+ receiving|\+ rushing/.test(b.name);

  if(samePlayer && aOver && bOver) score+=5;
  if(samePlayer && ((a.type==='td'&&bOver)||(b.type==='td'&&aOver))) score+=4;
  if(sameTeam && aOver && bOver) score+=3;
  if(sameTeam && (a.type==='h2h'||a.type==='spreads') && ['passing','rushing','receiving','td'].includes(b.type)) score+=2;
  if(sameTeam && (b.type==='h2h'||b.type==='spreads') && ['passing','rushing','receiving','td'].includes(a.type)) score+=2;
  if((a.type==='passing'&&b.type==='receiving')||(b.type==='passing'&&a.type==='receiving')) score+=2;
  if((a.type==='passing'&&b.type==='td')||(b.type==='passing'&&a.type==='td')) score+=2;
  if(a.type==='totals' && /Over/.test(a.name) && bOver) score+=2;
  if(b.type==='totals' && /Over/.test(b.name) && aOver) score+=2;
  if(a.type==='h2h'&&b.type==='spreads'&&sameTeam) score-=6;
  if(a.type==='spreads'&&b.type==='h2h'&&sameTeam) score-=6;
  return score;
}

function isTeamSide(m){ return m.type==='h2h' || m.type==='spreads'; }

function incompatible(a,b){
  // Never mix opposite game totals in one SGP.
  if(a.type==='totals' && b.type==='totals'){
    if(a.side!==b.side) return true;
    return true; // only one game-total leg per SGP
  }

  // Keep one coherent team-side opinion. No ML/spread stacking and no opposite teams.
  if(isTeamSide(a) && isTeamSide(b)){
    return true;
  }

  // Do not pair a team-side leg with an explicitly opposite team-side player/team assignment.
  if(isTeamSide(a) && b.team && !['Game','Player',a.team].includes(b.team)) return true;
  if(isTeamSide(b) && a.team && !['Game','Player',b.team].includes(a.team)) return true;

  // Never mix two prices/thresholds from the same underlying player market.
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
    label:'Safer'
  },
  balanced:{
    minPrice:-220,maxPrice:180,
    targetMin:-160,targetMax:110,
    corrWeight:9,
    propShare:.75,
    maxSamePlayer:1,
    label:'Best Balance'
  },
  long:{
    minPrice:-125,maxPrice:450,
    targetMin:-110,targetMax:300,
    corrWeight:7,
    propShare:.75,
    maxSamePlayer:2,
    label:'Longshot'
  }
};

function marketQuality(m,variant){
  const cfg=PROFILE_RULES[variant]||PROFILE_RULES.balanced;
  if(typeof m.price!=='number') return -999;
  if(m.price<cfg.minPrice || m.price>cfg.maxPrice) return -999;

  // Avoid buying fake certainty through extreme alternate-line juice.
  if(/_alternate$/.test(m.marketKey||'') && m.price<-350) return -999;

  const implied=impliedProbability(m.price)*100;
  let q=60;

  // Reward prices near each profile's intended band.
  if(m.price>=cfg.targetMin && m.price<=cfg.targetMax) q+=18;
  else{
    const distance=m.price<cfg.targetMin ? cfg.targetMin-m.price : m.price-cfg.targetMax;
    q-=Math.min(24,distance/18);
  }

  // Standard main lines are more informative than deeply shaded alternates.
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
  const q=marketQuality(m,variant);
  if(q<=-900) return q;
  const implied=impliedProbability(m.price)*100;
  let score=q + implied*.22;

  // User risk slider nudges the profile but does not override its market discipline.
  if(risk<25 && m.price>0) score-=8;
  if(risk>65 && m.price>0) score+=7;
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
      if(m.type==='rushing' && m.side==='over') s+=10;
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
      if(m.type==='passing' && m.side==='over') s+=13;
      if(m.type==='receiving' && m.side==='over') s+=13;
      if(m.type==='td') s+=9;
      if(m.type==='rushing' && m.side==='under') s+=2;
      if(m.side==='under' && ['passing','receiving'].includes(m.type)) s-=12;
      return s;
    }
  },
  comeback:{
    name:'Underdog forced to throw',
    thesis:(game)=>(underdogTeam(game)||'The underdog')+' is expected to trail or play from behind, creating extra dropbacks and receiving volume while the favorite protects the lead.',
    legFit:(m,game)=>{
      let s=0;
      const dog=underdogTeam(game);
      if(m.type==='spreads' && m.team===dog) s+=8;
      if(m.type==='passing' && m.side==='over') s+=12;
      if(m.type==='receiving' && m.side==='over') s+=12;
      if(m.type==='totals' && m.side==='over') s+=6;
      if(m.type==='rushing' && m.side==='under') s+=4;
      return s;
    }
  },
  grind:{
    name:'Low-scoring grind',
    thesis:()=> 'The game is expected to stay compressed, with fewer explosive plays and a heavier reliance on rushing and conservative offensive volume.',
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
  return base + script.legFit(m,game);
}

function pickDistinctAlternative(game,count,risk,variant,previous){
  const cfg=PROFILE_RULES[variant]||PROFILE_RULES.balanced;
  const scriptKeys=scriptCandidatesForVariant(variant);
  let best=null;

  for(const scriptKey of scriptKeys){
    const pool=game.markets.filter(m=>state.selectedMarkets.has(m.type) && marketQuality(m,variant)>-900);
    const props=pool.filter(m=>m.player);
    const desiredProps=props.length ? Math.max(1,Math.min(count-1,Math.ceil(count*cfg.propShare))) : 0;

    const ranked=[...pool]
      .sort((a,b)=>scriptMarketScore(b,game,variant,scriptKey,risk)-scriptMarketScore(a,game,variant,scriptKey,risk))
      .slice(0,56);

    let beams=[{legs:[],score:0}];

    for(let depth=0;depth<count;depth++){
      const next=[];
      for(const beam of beams){
        for(const m of ranked){
          if(beam.legs.includes(m) || !coherentWithLegs(m,beam.legs,variant)) continue;

          const propCount=beam.legs.filter(l=>l.player).length;
          const remainingSlots=count-beam.legs.length;
          const needProps=Math.max(0,desiredProps-propCount);
          if(needProps>=remainingSlots && !m.player) continue;

          const corr=beam.legs.reduce((s,l)=>s+correlation(l,m),0);
          const scriptFit=GAME_SCRIPTS[scriptKey].legFit(m,game);
          if(scriptFit<0) continue;

          const diversityPenalty=previous.reduce((pen,p)=>pen + (p?.legs?.some(l=>l.name===m.name)?18:0),0);

          const s=beam.score
            + scriptMarketScore(m,game,variant,scriptKey,risk)
            + corr*cfg.corrWeight
            + scriptFit*1.2
            - diversityPenalty;

          next.push({legs:[...beam.legs,m],score:s});
        }
      }

      next.sort((a,b)=>b.score-a.score);
      beams=next.slice(0,100);
      if(!beams.length) break;
    }

    const finals=beams
      .filter(b=>b.legs.length===count)
      .filter(b=>b.legs.filter(l=>l.player).length>=Math.min(desiredProps,count))
      .filter(b=>{
        const positiveFits=b.legs.filter(l=>GAME_SCRIPTS[scriptKey].legFit(l,game)>=8).length;
        return positiveFits>=Math.min(2,count);
      })
      .map(b=>{
        const p=packageParlay(b.legs,variant,true,{
          scriptKey,
          scriptName:GAME_SCRIPTS[scriptKey].name,
          thesis:GAME_SCRIPTS[scriptKey].thesis(game)
        });
        return {raw:b,parlay:p};
      })
      .filter(x=>x.parlay);

    if(!finals.length) continue;

    const distinct=finals.find(x=>previous.every(p=>overlapCount(p,x.parlay)<=1)) || finals[0];
    if(!best || distinct.raw.score>best.raw.score) best=distinct;
  }

  return best?.parlay||null;
}
function buildSgp(game,count,risk,variant,previous=[]){
  const live=state.apiKey && !String(game.id).startsWith('demo-');
  const props=game.markets.filter(m=>m.player && state.selectedMarkets.has(m.type));

  if(live && props.length===0) return null;

  const p=pickDistinctAlternative(game,count,risk,variant,previous);
  if(!p) return null;

  // Live 3+ leg SGPs must have meaningful prop participation.
  if(live && count>=3 && p.legs.filter(l=>l.player).length<2) return null;
  return p;
}

function buildMulti(count,risk,variant){
  const targetRisk=Math.max(0,Math.min(100,risk + (variant==='safe'?-18:variant==='long'?24:0)));
  const byGame=state.games.map(g=>({
    game:g,
    candidates:g.markets.filter(m=>state.selectedMarkets.has(m.type)).sort((a,b)=>candidateScore(b,targetRisk,variant)-candidateScore(a,targetRisk,variant))
  })).filter(x=>x.candidates.length);
  let legs=[];
  let idx=0;
  while(legs.length<count && byGame.length){
    const slot=byGame[idx%byGame.length];
    const cand=slot.candidates.shift();
    if(cand) legs.push({...cand,gameLabel:`${slot.game.away} @ ${slot.game.home}`});
    idx++;
    if(idx>50) break;
  }
  return packageParlay(legs,variant,false);
}

function packageParlay(legs,variant,isSgp,meta={}){
  if(!legs?.length) return null;
  let decimal=1;
  legs.forEach(l=>decimal*=americanToDecimal(l.price));
  let avg=legs.reduce((s,l)=>s+(l.confidence||impliedProbability(l.price)*100),0)/legs.length;
  let corr=0;
  if(isSgp){
    for(let i=0;i<legs.length;i++) for(let j=i+1;j<legs.length;j++) corr+=correlation(legs[i],legs[j]);
  }
  const names={safe:'Safer',balanced:'Best Balance',long:'Longshot'};
  const grades={safe:'HIGHER HIT RATE',balanced:'BEST FIT',long:'HIGHER PAYOUT'};
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
  if(leg.type==='receiving') return 'Usage-driven receiving leg; strongest when paired with corresponding passing volume.';
  if(leg.type==='rushing') return 'Rushing-volume leg suited to favorable or neutral game scripts.';
  if(leg.type==='td') return 'Higher-variance scoring leg included only when the selected risk profile permits it.';
  return 'Selected by the current confidence and risk model.';
}

function render(parlays){
  const wrap=$('#results'); wrap.innerHTML='';
  const tpl=$('#parlayTemplate');
  const valid=parlays.filter(Boolean);
  if(!valid.length){wrap.innerHTML='<div class="empty">No eligible legs for the current settings.</div>';return;}
  for(const p of valid){
    const node=tpl.content.cloneNode(true);
    node.querySelector('.grade').textContent=p.grade;
    node.querySelector('.parlay-name').textContent=p.name;
    const sb=node.querySelector('.script-badge');
    if(sb){ sb.textContent=p.scriptName||''; sb.style.display=p.scriptName?'inline-flex':'none'; }
    node.querySelector('.odds').textContent=fmtOdds(p.odds);
    node.querySelector('.summary').textContent=p.summary;
    node.querySelector('.score').textContent=`Confidence ${p.score}/100`;
    node.querySelector('.correlation').textContent=state.mode==='sgp' ? `Correlation +${Math.max(0,p.corr)}` : `${p.legs.length} games/legs`;
    const legs=node.querySelector('.legs');
    p.legs.forEach((l,i)=>{
      const d=document.createElement('div'); d.className='leg';
      d.innerHTML=`<div class="leg-title">${i+1}. ${l.name}</div><div class="leg-sub">${l.gameLabel||''} ${fmtOdds(l.price)}</div><div class="leg-reason">${reasonFor(l,state.mode==='sgp')}</div>`;
      legs.appendChild(d);
    });
    wrap.appendChild(node);
  }
}

function countPlayerProps(game){ return game?.markets?.filter(m=>m.player).length || 0; }

async function generate(){
  const count=Number($('#legsSelect').value);
  const variants=['safe','balanced','long'];
  let parlays;
  if(state.mode==='sgp'){
    const game=state.games.find(g=>g.id===$('#gameSelect').value) || state.games[0];
    await ensurePropsForGame(game);
    const propCount=countPlayerProps(game);
    if(state.apiKey && propCount===0 && game?.propStatus==='none'){
      $('#resultsTitle').textContent='No FanDuel player props posted yet';
    }else{
      $('#resultsTitle').textContent=propCount
        ? `Logical correlated SGPs • ${propCount} live props`
        : 'Logical correlated SGPs';
    }
    if(state.apiKey && !String(game?.id||'').startsWith('demo-') && propCount===0){
      render([]);
      $('#results').innerHTML='<div class="empty">No live FanDuel player props are available for this game yet, so no SGP will be generated from team lines alone.</div>';
      return;
    }
    parlays=[];
    for(const v of variants){
      const p=buildSgp(game,count,state.risk,v,parlays.filter(Boolean));
      parlays.push(p);
    }
  }else{
    await ensurePropsForMultiGame(6);
    parlays=variants.map(v=>buildMulti(count,state.risk,v));
  }
  render(parlays);
}

$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
  state.mode=btn.dataset.mode;
  $('#gameChooserWrap').style.display=state.mode==='sgp'?'flex':'none';
  $('#modeTitle').textContent=state.mode==='sgp'?'Same Game Parlay':'Multi-Game Parlay';
  $('#resultsTitle').textContent=state.mode==='sgp'?'Logical correlated SGPs':'Best legs across the slate';
  generate();
}));

$('#riskRange').addEventListener('input',e=>{state.risk=Number(e.target.value);$('#riskText').textContent=riskLabel(state.risk);generate();});
$('#legsSelect').addEventListener('change',generate);
$('#gameSelect').addEventListener('change',()=>generate());
$('#generateBtn').addEventListener('click',()=>generate());
$$('.chip').forEach(c=>c.addEventListener('click',()=>{
  c.classList.toggle('active');
  c.classList.contains('active')?state.selectedMarkets.add(c.dataset.market):state.selectedMarkets.delete(c.dataset.market);
  generate();
}));

const dialog=$('#settingsDialog');
$('#settingsBtn').addEventListener('click',()=>{$('#apiKeyInput').value=state.apiKey;dialog.showModal();});
$('#saveKeyBtn').addEventListener('click',()=>{
  state.apiKey=$('#apiKeyInput').value.trim();
  if(state.apiKey)localStorage.setItem('nflParlayOddsApiKey',state.apiKey); else localStorage.removeItem('nflParlayOddsApiKey');
  dialog.close(); renderApiUsage();
loadData();
});
$('#clearKeyBtn').addEventListener('click',()=>{
  state.apiKey=''; localStorage.removeItem('nflParlayOddsApiKey'); dialog.close(); loadData();
});

loadData();
