const state = {
  mode:'sgp',
  risk:45,
  selectedMarkets:new Set(['h2h','spreads','totals','passing','rushing','receiving','td']),
  games:[],
  apiKey:localStorage.getItem('nflParlayOddsApiKey') || '',
  propsLoaded:new Set(),
  propsLoading:new Map()
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

const PROP_MARKETS = [
  'player_pass_yds','player_pass_tds','player_pass_attempts','player_pass_completions',
  'player_rush_yds','player_rush_attempts',
  'player_reception_yds','player_receptions',
  'player_anytime_td'
];

const PROP_MARKET_META = {
  player_pass_yds:{type:'passing',label:'passing yards'},
  player_pass_tds:{type:'passing',label:'passing TDs'},
  player_pass_attempts:{type:'passing',label:'pass attempts'},
  player_pass_completions:{type:'passing',label:'completions'},
  player_rush_yds:{type:'rushing',label:'rushing yards'},
  player_rush_attempts:{type:'rushing',label:'rush attempts'},
  player_reception_yds:{type:'receiving',label:'receiving yards'},
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
    if(side && side!=='yes') return null;
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

async function ensurePropsForGame(game){
  if(!state.apiKey || !game || String(game.id).startsWith('demo-') || state.propsLoaded.has(game.id)) return;
  if(state.propsLoading.has(game.id)) return state.propsLoading.get(game.id);

  const task=(async()=>{
    try{
      setStatus(`Loading FanDuel props: ${game.away} @ ${game.home}…`);
      const url=new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/odds`);
      url.searchParams.set('apiKey',state.apiKey);
      url.searchParams.set('regions','us');
      url.searchParams.set('markets',PROP_MARKETS.join(','));
      url.searchParams.set('oddsFormat','american');
      url.searchParams.set('bookmakers','fanduel');
      const res=await fetch(url);
      if(!res.ok) throw new Error('Prop odds API '+res.status);
      const raw=await res.json();
      const book=(raw.bookmakers||[]).find(b=>b.key==='fanduel') || raw.bookmakers?.[0];
      const props=[];
      for(const m of book?.markets||[]){
        for(const out of m.outcomes||[]){
          const prop=normalizePropOutcome(m.key,out);
          if(prop) props.push(prop);
        }
      }
      game.markets.push(...props);
      state.propsLoaded.add(game.id);
      setStatus(`Live FanDuel markets • ${props.length} player props loaded`);
    }catch(err){
      console.error(err);
      setStatus('Live team lines • player props unavailable for this game');
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

function incompatible(a,b){
  if(a.marketKey && b.marketKey && a.player && b.player && a.player===b.player && a.marketKey===b.marketKey && a.point===b.point && a.side!==b.side) return true;
  if(a.type==='h2h'&&b.type==='spreads'&&a.team===b.team) return true;
  if(a.type==='spreads'&&b.type==='h2h'&&a.team===b.team) return true;
  return false;
}

function candidateScore(m,risk){
  const implied=impliedProbability(m.price)*100;
  const priceBonus = risk<25 ? Math.max(0,implied-50)*.45 : risk<60 ? 0 : Math.max(0,55-implied)*.28;
  const tdPenalty = m.type==='td' ? (risk<25?12:risk<60?4:-2) : 0;
  return (m.confidence||implied)*.75 + implied*.25 + priceBonus - tdPenalty;
}

function buildSgp(game,count,risk,variant){
  const pool=game.markets.filter(m=>state.selectedMarkets.has(m.type));
  const targetRisk=Math.max(0,Math.min(100,risk + (variant==='safe'?-18:variant==='long'?24:0)));
  const ranked=[...pool].sort((a,b)=>candidateScore(b,targetRisk)-candidateScore(a,targetRisk));
  let legs=[];
  if(!ranked.length) return null;
  legs.push(ranked[0]);
  while(legs.length<count){
    const remaining=ranked.filter(x=>!legs.includes(x) && !legs.some(l=>incompatible(l,x)));
    if(!remaining.length) break;
    remaining.sort((a,b)=>{
      const ca=legs.reduce((s,l)=>s+correlation(l,a),0);
      const cb=legs.reduce((s,l)=>s+correlation(l,b),0);
      return (candidateScore(b,targetRisk)+cb*5)-(candidateScore(a,targetRisk)+ca*5);
    });
    legs.push(remaining[0]);
  }
  return packageParlay(legs,variant,true);
}

function buildMulti(count,risk,variant){
  const targetRisk=Math.max(0,Math.min(100,risk + (variant==='safe'?-18:variant==='long'?24:0)));
  const byGame=state.games.map(g=>({
    game:g,
    candidates:g.markets.filter(m=>state.selectedMarkets.has(m.type)).sort((a,b)=>candidateScore(b,targetRisk)-candidateScore(a,targetRisk))
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

function packageParlay(legs,variant,isSgp){
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
    summary:isSgp
      ? (corr>5?'Built around a coherent game script with positively related legs.':'Uses compatible legs while avoiding obvious duplicate exposure.')
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

async function generate(){
  const count=Number($('#legsSelect').value);
  const variants=['safe','balanced','long'];
  let parlays;
  if(state.mode==='sgp'){
    const game=state.games.find(g=>g.id===$('#gameSelect').value) || state.games[0];
    await ensurePropsForGame(game);
    parlays=variants.map(v=>buildSgp(game,count,state.risk,v));
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
  dialog.close(); loadData();
});
$('#clearKeyBtn').addEventListener('click',()=>{
  state.apiKey=''; localStorage.removeItem('nflParlayOddsApiKey'); dialog.close(); loadData();
});

loadData();
