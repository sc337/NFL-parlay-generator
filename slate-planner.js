(() => {
  const DAY_MS=86400000;
  let wrapped=false;
  let selectedMode='date';

  const gameDate=g=>{const d=new Date(g?.commence_time||0);if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const labelDate=s=>!s?'All upcoming':new Date(`${s}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const uniqueDates=()=>[...new Set((state.games||[]).map(gameDate).filter(Boolean))].sort();
  const selectedGames=()=>{const games=state.games||[],select=document.getElementById('slateDate'),start=document.getElementById('slateStart'),end=document.getElementById('slateEnd');if(selectedMode==='range'){const a=start?.value,b=end?.value;return games.filter(g=>{const d=gameDate(g);return d&&(!a||d>=a)&&(!b||d<=b)})}const v=select?.value;return v?games.filter(g=>gameDate(g)===v):games};
  const activeMarkets=()=>[...(state.selectedMarkets||[])];
  const atdOnly=()=>{const a=activeMarkets();return a.length===1&&a[0]==='td'};
  const tdMarkets=games=>games.flatMap(g=>(g.markets||[]).filter(m=>m.type==='td').map(m=>({g,m})));

  function bestCandidateForGame(g,variant='balanced'){
    const confFn=window.NFL_CONFIDENCE?.score,valueFn=window.NFL_SELECTIVITY?.valueScore;
    const futurePlanning=new Date(g.commence_time||0).getTime()-Date.now()>DAY_MS;
    let pool=(g.markets||[]).filter(m=>state.selectedMarkets?.has?.(m.type));
    // Team-market fallback is useful for general future planning, but must never
    // suppress an explicit ATD-only request.
    if(futurePlanning&&!atdOnly()){
      const team=pool.filter(m=>['h2h','spreads','totals'].includes(m.type));
      if(team.length)pool=team;
    }
    const ranked=pool.map(m=>{
      const c=Number(confFn?.(m))||0,vRaw=Number(valueFn?.(m,variant)),value=Number.isFinite(vRaw)&&vRaw>-900?vRaw:(Number(m.sourceQuality)||60),price=Number(m.price);
      let score=c*.65+value*.35;
      if(['h2h','spreads'].includes(m.type))score+=futurePlanning?8:3;
      if(m.type==='totals')score+=futurePlanning?3:0;
      if(m.type==='td'){
        // ATD ranking rewards verified primary roles and realistic prices without
        // turning longshot payout into a quality signal.
        const breadth=Number(m.contextSignals?.market_breadth)||0;
        if(m._rosterVerified===true)score+=4;
        if(breadth>=3)score+=5;else if(breadth===1)score-=4;
        if(price>=-220&&price<=250)score+=7;
        else if(price<=400)score+=2;
        else if(price>600)score-=12;
      }
      if(price<-250||price>700)score-=12;
      return {...m,gameId:g.id,gameLabel:`${g.away} @ ${g.home}`,confidence:c,_plannerScore:score};
    }).filter(m=>{
      if(!Number.isFinite(Number(m.price)))return false;
      if(m.player&&m._rosterVerified!==true)return false;
      // ATD has naturally lower source/confidence scores than sides; use a
      // dedicated floor while retaining roster, role and price discipline.
      const floor=m.type==='td'?(futurePlanning?58:64):(futurePlanning?64:(variant==='safe'?80:variant==='balanced'?76:70));
      return m._plannerScore>=floor;
    }).sort((a,b)=>b._plannerScore-a._plannerScore);
    return ranked[0]||null;
  }

  function buildSlateMulti(count,risk,variant){
    const games=selectedGames();
    const picks=games.map(g=>({g,m:bestCandidateForGame(g,variant)})).filter(x=>x.m).sort((a,b)=>b.m._plannerScore-a.m._plannerScore);
    const legs=[],seenPlayers=new Set();
    for(const {m} of picks){if(legs.length>=count)break;if(m.player&&seenPlayers.has(m.player))continue;legs.push(m);if(m.player)seenPlayers.add(m.player)}
    if(legs.length<count)return null;
    if(typeof packageParlay==='function'){const p=packageParlay(legs,variant,false);if(p)p.summary=atdOnly()?`${legs.length} verified ATD scorers from ${legs.length} different games on the selected slate.`:`${legs.length} independently qualified legs from ${legs.length} different games on the selected slate.`;return p}
    return null;
  }

  function updateSummary(){
    const host=document.getElementById('slateSummary');if(!host)return;
    const games=selectedGames(),marketCount=games.reduce((n,g)=>n+(g.markets||[]).length,0),propCount=games.reduce((n,g)=>n+(g.markets||[]).filter(m=>m.player).length,0),tdCount=tdMarkets(games).length;
    host.textContent=`${games.length} games • ${marketCount} markets • ${propCount} player props${atdOnly()?` • ${tdCount} ATD`:''}`;
    updateAtdState(games,tdCount);
  }
  function updateAtdState(games,tdCount){
    let note=document.getElementById('slateAtdStatus');const box=document.getElementById('slatePlanner');if(!box)return;
    if(!note){note=document.createElement('div');note.id='slateAtdStatus';note.className='slate-atd-status';box.appendChild(note)}
    if(state.mode!=='multi'||!atdOnly()){note.hidden=true;return}
    note.hidden=false;
    if(tdCount===0){note.innerHTML='<strong>ATD markets not posted yet</strong><span>This slate has no verified anytime-touchdown prices yet. The snapshot refreshes automatically; legs will populate when ATD markets become available.</span>';}
    else{const gamesWithTd=new Set(tdMarkets(games).map(x=>x.g.id)).size;note.innerHTML=`<strong>${tdCount} verified ATD markets available</strong><span>Touchdown legs are ranked by confidence, verified roster/role, price discipline and one scorer per game. ${gamesWithTd} games currently have ATD pricing.</span>`;}
  }
  function ensureUi(){
    if(document.getElementById('slatePlanner'))return;
    const nav=document.querySelector('.mode-tabs');if(!nav)return;
    const box=document.createElement('section');box.id='slatePlanner';box.className='slate-planner';box.innerHTML=`<div class="slate-head"><div><span>SLATE</span><h3>Choose betting date</h3></div><button type="button" id="slateModeBtn">Date range</button></div><div class="slate-date-row"><label>Date<select id="slateDate"></select></label><div id="slateRange" hidden><label>Start<input id="slateStart" type="date"></label><label>End<input id="slateEnd" type="date"></label></div></div><p id="slateSummary"></p>`;nav.insertAdjacentElement('afterend',box);populateDates();
    document.getElementById('slateDate').addEventListener('change',()=>{updateSummary();if(state.mode==='multi')generate()});
    ['slateStart','slateEnd'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{updateSummary();if(state.mode==='multi')generate()}));
    document.getElementById('slateModeBtn').addEventListener('click',()=>{selectedMode=selectedMode==='date'?'range':'date';document.getElementById('slateRange').hidden=selectedMode!=='range';document.getElementById('slateDate').parentElement.hidden=selectedMode==='range';document.getElementById('slateModeBtn').textContent=selectedMode==='range'?'Single date':'Date range';updateSummary();if(state.mode==='multi')generate()});
    // Market chips change the meaning of future planning, especially ATD-only.
    document.getElementById('marketChips')?.addEventListener('click',()=>setTimeout(()=>{updateSummary();if(state.mode==='multi')generate()},0));
    updateVisibility();updateSummary();
  }
  function populateDates(){const sel=document.getElementById('slateDate');if(!sel)return;const dates=uniqueDates(),current=sel.value;sel.innerHTML='<option value="">All upcoming</option>'+dates.map(d=>`<option value="${d}">${labelDate(d)}</option>`).join('');if(dates.includes(current))sel.value=current;else{const future=dates.find(d=>new Date(`${d}T23:59:59`).getTime()>=Date.now());if(future)sel.value=future}if(dates.length){document.getElementById('slateStart').min=dates[0];document.getElementById('slateEnd').max=dates[dates.length-1]}}
  function updateVisibility(){const box=document.getElementById('slatePlanner');if(box)box.hidden=state.mode!=='multi'}
  function wrapBuilder(){if(wrapped||typeof window.buildMulti!=='function'||!window.NFL_SELECTIVITY)return;window.buildMulti=function(count,risk,variant){return buildSlateMulti(count,risk,variant)};wrapped=true}
  function boot(){ensureUi();document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{updateVisibility();updateSummary()},0)));const timer=setInterval(()=>{ensureUi();populateDates();wrapBuilder();if(wrapped)clearInterval(timer)},150);setTimeout(()=>clearInterval(timer),12000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.NFL_SLATE_PLANNER={games:selectedGames,refresh:updateSummary,build:buildSlateMulti};
})();