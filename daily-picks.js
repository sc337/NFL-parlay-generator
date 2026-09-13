(() => {
  const DAILY_PROP_PRICE_MIN=-220;
  const DAILY_PROP_PRICE_MAX=180;
  const DAILY_TEAM_PRICE_MIN=-220;
  const DAILY_TEAM_PRICE_MAX=140;
  let refreshTimer=null;
  let loading=false;
  let lastSignature='';

  function gameLabel(game){
    return game ? `${game.away} @ ${game.home}` : '';
  }

  function fit10(score){
    return Math.max(1,Math.min(10,Math.round((score/10)*10)/10));
  }

  function propScore(m){
    if(!m?.player || typeof m.price!=='number') return -999;
    if(m.price<DAILY_PROP_PRICE_MIN || m.price>DAILY_PROP_PRICE_MAX) return -999;
    if(typeof marketQuality==='function' && marketQuality(m,'balanced')<=-900) return -999;

    let score=typeof candidateScore==='function' ? candidateScore(m,45,'balanced') : (m.confidence||0);
    if(m.marketKey && !/_alternate$/.test(m.marketKey)) score+=7;
    if(/_alternate$/.test(m.marketKey||'')) score-=7;
    if(['passing','rushing','receiving'].includes(m.type)) score+=5;
    if(m.type==='td') score-=4;
    if(m.position) score+=3;
    if(m.team && !['Game','Player'].includes(m.team)) score+=3;
    if(m.price>=-165 && m.price<=125) score+=5;
    if(m.price<-200) score-=6;
    return score;
  }

  function teamScore(m){
    if(!m || !['h2h','spreads'].includes(m.type) || typeof m.price!=='number') return -999;
    if(m.price<DAILY_TEAM_PRICE_MIN || m.price>DAILY_TEAM_PRICE_MAX) return -999;

    let score=typeof candidateScore==='function' ? candidateScore(m,38,'balanced') : (m.confidence||0);
    if(m.type==='spreads') score+=4;
    if(m.type==='h2h' && m.price>=-180 && m.price<=115) score+=5;
    if(m.price>=-150 && m.price<=110) score+=4;
    if(m.price<-200) score-=8;
    return score;
  }

  function allCandidates(){
    const props=[];
    const teamLines=[];
    for(const game of state.games||[]){
      for(const market of game.markets||[]){
        const item={market,game};
        if(market.player) props.push(item);
        if(['h2h','spreads'].includes(market.type)) teamLines.push(item);
      }
    }
    return {props,teamLines};
  }

  function chooseBest(items,scorer,minScore){
    return items
      .map(x=>({...x,score:scorer(x.market)}))
      .filter(x=>x.score>=minScore)
      .sort((a,b)=>b.score-a.score)[0]||null;
  }

  function reasonForProp(pick){
    const m=pick.market;
    const parts=[];
    if(m.marketKey && !/_alternate$/.test(m.marketKey)) parts.push('main-line market');
    if(['passing','rushing','receiving'].includes(m.type)) parts.push('volume-based prop');
    if(m.position && m.team && !['Game','Player'].includes(m.team)) parts.push(`${m.position} role verified`);
    if(m.price>=-165 && m.price<=125) parts.push('disciplined price range');
    return `Top standalone player-prop fit from the scanned Caesars slate${parts.length ? ': '+parts.join(', ') : ''}.`;
  }

  function reasonForTeam(pick){
    const m=pick.market;
    const type=m.type==='h2h'?'moneyline':'spread';
    return `Top standalone ${type} fit across the Caesars slate after price discipline and implied-probability screening.`;
  }

  function renderCard(id,pick,type){
    const card=document.getElementById(id);
    if(!card) return;
    const title=card.querySelector('.daily-pick-title');
    const odds=card.querySelector('.daily-pick-odds');
    const game=card.querySelector('.daily-pick-game');
    const reason=card.querySelector('.daily-pick-reason');
    const grade=card.querySelector('.daily-pick-grade');

    if(!pick){
      title.textContent='No qualifying pick';
      odds.textContent='—';
      game.textContent=type==='prop'?'No player prop cleared the daily threshold.':'No team line cleared the daily threshold.';
      reason.textContent='The section stays empty rather than forcing a low-quality recommendation.';
      grade.textContent='PASS';
      card.classList.add('daily-pass');
      return;
    }

    card.classList.remove('daily-pass');
    title.textContent=pick.market.name;
    odds.textContent=fmtOdds(pick.market.price);
    game.textContent=gameLabel(pick.game);
    reason.textContent=type==='prop'?reasonForProp(pick):reasonForTeam(pick);
    grade.textContent=`MODEL FIT ${fit10(pick.score)}/10`;
  }

  function renderCoverage(){
    const el=document.getElementById('dailyCoverage');
    if(!el) return;
    const games=(state.games||[]).length;
    const propGames=(state.games||[]).filter(g=>(g.markets||[]).some(m=>m.player)).length;
    const mode=window.NFL_PARLAY_API_SAVER?.mode?.()||'full';
    el.textContent=`${games} games screened • ${propGames} prop games loaded • ${mode.replace('_',' ')} mode`;
  }

  async function refreshDailyPicks(loadProps=false){
    if(loading) return;
    if(!state?.games?.length) return;

    const sig=(state.games||[]).map(g=>`${g.id}:${g.markets?.length||0}`).join('|');
    if(!loadProps && sig===lastSignature) return;

    loading=true;
    try{
      if(loadProps && state.apiKey && typeof window.ensurePropsForMultiGame==='function'){
        await window.ensurePropsForMultiGame(6);
      }
      const {props,teamLines}=allCandidates();
      const bestProp=chooseBest(props,propScore,82);
      const bestTeam=chooseBest(teamLines,teamScore,80);
      renderCard('dailyPropCard',bestProp,'prop');
      renderCard('dailyTeamCard',bestTeam,'team');
      renderCoverage();
      lastSignature=(state.games||[]).map(g=>`${g.id}:${g.markets?.length||0}`).join('|');
    }catch(err){
      console.warn('Daily picks refresh failed',err);
    }finally{
      loading=false;
    }
  }

  function schedule(loadProps=false,delay=250){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>refreshDailyPicks(loadProps),delay);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const results=document.getElementById('results');
    if(results){
      new MutationObserver(()=>schedule(false,80)).observe(results,{childList:true,subtree:true});
    }

    document.getElementById('refreshDailyPicksBtn')?.addEventListener('click',()=>schedule(true,0));
    document.getElementById('generateBtn')?.addEventListener('click',()=>schedule(true,350));
    document.getElementById('apiSaverMode')?.addEventListener('change',()=>schedule(true,150));

    // Initial slate scan. The API Saver wrapper caps prop games according to Full/Saver/Ultra mode.
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(state?.games?.length){
        clearInterval(timer);
        schedule(true,150);
      }else if(attempts>30){
        clearInterval(timer);
      }
    },200);
  });

  window.NFL_PARLAY_DAILY_PICKS={refresh:()=>refreshDailyPicks(true)};
})();
