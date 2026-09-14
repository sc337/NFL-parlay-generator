(() => {
  const DAY_MS=86400000;
  let wrapped=false;
  let selectedMode='date';

  const gameDate=g=>{
    const d=new Date(g?.commence_time||0);
    if(Number.isNaN(d.getTime())) return '';
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const labelDate=s=>{
    if(!s) return 'All upcoming';
    const d=new Date(`${s}T12:00:00`);
    return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  };
  const uniqueDates=()=>[...new Set((state.games||[]).map(gameDate).filter(Boolean))].sort();
  const selectedGames=()=>{
    const games=state.games||[];
    const select=document.getElementById('slateDate');
    const start=document.getElementById('slateStart');
    const end=document.getElementById('slateEnd');
    if(selectedMode==='range'){
      const a=start?.value,b=end?.value;
      return games.filter(g=>{const d=gameDate(g);return d&&(!a||d>=a)&&(!b||d<=b)});
    }
    const v=select?.value;
    return v?games.filter(g=>gameDate(g)===v):games;
  };
  function bestCandidateForGame(g,variant='balanced'){
    const confFn=window.NFL_CONFIDENCE?.score;
    const valueFn=window.NFL_SELECTIVITY?.valueScore;
    const now=Date.now(),kick=new Date(g.commence_time||0).getTime();
    const futurePlanning=kick-now>DAY_MS;
    let pool=(g.markets||[]).filter(m=>state.selectedMarkets?.has?.(m.type));
    // Future planning must remain useful before prop boards are complete.
    if(futurePlanning){
      const team=pool.filter(m=>['h2h','spreads','totals'].includes(m.type));
      if(team.length) pool=team;
    }
    const ranked=pool.map(m=>{
      const c=Number(confFn?.(m))||0;
      const v=Number(valueFn?.(m,variant));
      const value=Number.isFinite(v)&&v>-900?v:(Number(m.sourceQuality)||60);
      const price=Number(m.price);
      let score=c*.65+value*.35;
      if(['h2h','spreads'].includes(m.type)) score+=futurePlanning?8:3;
      if(m.type==='totals') score+=futurePlanning?3:0;
      if(price<-250||price>220) score-=12;
      return {...m,gameId:g.id,gameLabel:`${g.away} @ ${g.home}`,confidence:c,_plannerScore:score};
    }).filter(m=>{
      if(!Number.isFinite(Number(m.price))) return false;
      if(m.player&&m._rosterVerified!==true) return false;
      const floor=futurePlanning?64:(variant==='safe'?80:variant==='balanced'?76:70);
      return m._plannerScore>=floor;
    }).sort((a,b)=>b._plannerScore-a._plannerScore);
    return ranked[0]||null;
  }
  function buildSlateMulti(count,risk,variant){
    const games=selectedGames();
    const picks=games.map(g=>({g,m:bestCandidateForGame(g,variant)})).filter(x=>x.m);
    picks.sort((a,b)=>b.m._plannerScore-a.m._plannerScore);
    const legs=[];
    const seenPlayers=new Set();
    for(const {m} of picks){
      if(legs.length>=count) break;
      if(m.player&&seenPlayers.has(m.player)) continue;
      legs.push(m);if(m.player)seenPlayers.add(m.player);
    }
    if(legs.length<count) return null;
    if(typeof packageParlay==='function'){
      const p=packageParlay(legs,variant,false);
      if(p){p.summary=`${legs.length} independently qualified legs from ${legs.length} different games on the selected slate.`;}
      return p;
    }
    return null;
  }
  function updateSummary(){
    const host=document.getElementById('slateSummary');if(!host)return;
    const games=selectedGames();
    const marketCount=games.reduce((n,g)=>n+(g.markets||[]).length,0);
    const propCount=games.reduce((n,g)=>n+(g.markets||[]).filter(m=>m.player).length,0);
    host.textContent=`${games.length} games • ${marketCount} markets • ${propCount} player props`;
  }
  function ensureUi(){
    if(document.getElementById('slatePlanner')) return;
    const nav=document.querySelector('.mode-tabs');if(!nav)return;
    const box=document.createElement('section');box.id='slatePlanner';box.className='slate-planner';
    box.innerHTML=`<div class="slate-head"><div><span>SLATE</span><h3>Choose betting date</h3></div><button type="button" id="slateModeBtn">Date range</button></div><div class="slate-date-row"><label>Date<select id="slateDate"></select></label><div id="slateRange" hidden><label>Start<input id="slateStart" type="date"></label><label>End<input id="slateEnd" type="date"></label></div></div><p id="slateSummary"></p>`;
    nav.insertAdjacentElement('afterend',box);
    populateDates();
    document.getElementById('slateDate').addEventListener('change',()=>{updateSummary();if(state.mode==='multi') generate();});
    ['slateStart','slateEnd'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{updateSummary();if(state.mode==='multi') generate();}));
    document.getElementById('slateModeBtn').addEventListener('click',()=>{
      selectedMode=selectedMode==='date'?'range':'date';
      document.getElementById('slateRange').hidden=selectedMode!=='range';
      document.getElementById('slateDate').parentElement.hidden=selectedMode==='range';
      document.getElementById('slateModeBtn').textContent=selectedMode==='range'?'Single date':'Date range';
      updateSummary();if(state.mode==='multi') generate();
    });
    updateVisibility();updateSummary();
  }
  function populateDates(){
    const sel=document.getElementById('slateDate');if(!sel)return;
    const dates=uniqueDates(),current=sel.value;
    sel.innerHTML='<option value="">All upcoming</option>'+dates.map(d=>`<option value="${d}">${labelDate(d)}</option>`).join('');
    if(dates.includes(current)) sel.value=current;
    else {
      const future=dates.find(d=>new Date(`${d}T23:59:59`).getTime()>=Date.now());
      if(future) sel.value=future;
    }
    if(dates.length){document.getElementById('slateStart').min=dates[0];document.getElementById('slateEnd').max=dates[dates.length-1];}
  }
  function updateVisibility(){const box=document.getElementById('slatePlanner');if(box)box.hidden=state.mode!=='multi';}
  function wrapBuilder(){
    if(wrapped||typeof window.buildMulti!=='function'||!window.NFL_SELECTIVITY) return;
    window.buildMulti=function(count,risk,variant){return buildSlateMulti(count,risk,variant)};
    wrapped=true;
  }
  function boot(){
    ensureUi();
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{updateVisibility();updateSummary()},0)));
    const timer=setInterval(()=>{ensureUi();populateDates();wrapBuilder();if(wrapped)clearInterval(timer)},150);
    setTimeout(()=>clearInterval(timer),12000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.NFL_SLATE_PLANNER={games:selectedGames,refresh:updateSummary,build:buildSlateMulti};
})();