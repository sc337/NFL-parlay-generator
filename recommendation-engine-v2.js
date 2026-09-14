(() => {
  const TEAM_MARKETS=new Set(['h2h','spreads']);
  const PROP_TYPES=new Set(['passing','rushing','receiving','td']);
  const verifiedGames=new Set();
  const verifyingGames=new Map();

  const implied=o=>o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);
  const isOver=m=>m?.side==='over'||/\bOver\b/i.test(m?.name||'');
  const isUnder=m=>m?.side==='under'||/\bUnder\b/i.test(m?.name||'');
  const isTeamSide=m=>TEAM_MARKETS.has(m?.type);
  const sameTeam=(a,b)=>a?.team&&b?.team&&a.team===b.team&&!['Game','Player'].includes(a.team);
  const samePlayer=(a,b)=>a?.player&&b?.player&&a.player===b.player;
  const verifiedPlayer=m=>!m?.player || (m._rosterVerified===true && m.team && m.team!=='Player');

  async function verifyGameRoster(game){
    if(!game || verifiedGames.has(game.id)) return game;
    if(verifyingGames.has(game.id)) return verifyingGames.get(game.id);
    const task=(async()=>{
      try{
        const [away,home]=await Promise.all([loadEspnRoster(game.away),loadEspnRoster(game.home)]);
        const map=new Map();
        for(const p of [...away,...home]) if(p?.name) map.set(normalizePlayerName(p.name),p);
        let valid=0,invalid=0;
        for(const m of game.markets||[]){
          if(!m.player) continue;
          const hit=map.get(normalizePlayerName(m.player));
          if(hit){m.team=hit.team;m.position=String(hit.position||'').toUpperCase();m.contextSource='ESPN';m._rosterVerified=true;m._invalidRoster=false;valid++;}
          else{m._rosterVerified=false;m._invalidRoster=true;invalid++;}
        }
        game.rosterVerified=map.size>0;
        game.rosterVerification={valid,invalid,rosterSize:map.size};
        if(map.size>0) verifiedGames.add(game.id);
      }catch(err){console.warn('Roster verification unavailable',game?.away,game?.home,err);}
      finally{verifyingGames.delete(game.id);}
      return game;
    })();
    verifyingGames.set(game.id,task);return task;
  }

  function valueScore(m,variant='balanced'){
    if(!m||!Number.isFinite(Number(m.price)))return -999;
    const price=Number(m.price),prob=implied(price),sourceQ=Number(m.sourceQuality)||60;
    if(m._invalidRoster)return -999;if(m.player&&!verifiedPlayer(m))return -999;
    const bands={safe:{min:-240,max:105,q:72,avg:77},balanced:{min:-175,max:160,q:74,avg:77},long:{min:-110,max:350,q:68,avg:71}};
    const cfg=bands[variant]||bands.balanced;
    if(price<cfg.min||price>cfg.max||prob>.76||prob<.18||sourceQ<cfg.q)return -999;
    if(/_alternate$/.test(m.marketKey||'')&&Math.abs(price)>180)return -999;
    if(variant==='safe'&&m.type==='td')return -999;if(variant==='balanced'&&m.type==='td'&&price<-140)return -999;
    let s=sourceQ;if(price>=-145&&price<=120)s+=10;else if(price>=-175&&price<=160)s+=5;
    if(m.source==='Caesars'||m.source==='Caesars override')s+=7;if(m.player&&m._rosterVerified)s+=5;if(m.type==='td')s-=variant==='long'?-1:7;
    return Math.max(0,Math.min(100,s));
  }

  function strictCorrelation(a,b){
    if(!a||!b)return 0;let s=0;const st=sameTeam(a,b),sp=samePlayer(a,b),ao=isOver(a),bo=isOver(b),au=isUnder(a),bu=isUnder(b);
    const qbRec=st&&((a.position==='QB'&&['WR','TE'].includes(b.position))||(b.position==='QB'&&['WR','TE'].includes(a.position)));
    if(qbRec&&ao&&bo)s+=9;if(qbRec&&au&&bu)s+=6;if(sp&&((a.type==='td'&&bo)||(b.type==='td'&&ao)))s+=5;if(sp&&((a.type==='td'&&bu)||(b.type==='td'&&au)))s-=8;
    if(a.type==='totals'&&a.side==='over'&&bo&&['passing','receiving','td'].includes(b.type))s+=4;if(b.type==='totals'&&b.side==='over'&&ao&&['passing','receiving','td'].includes(a.type))s+=4;
    if(a.type==='totals'&&a.side==='under'&&bu&&['passing','receiving'].includes(b.type))s+=3;if(b.type==='totals'&&b.side==='under'&&au&&['passing','receiving'].includes(a.type))s+=3;
    if(st&&isTeamSide(a)&&b.type==='rushing'&&bo&&['RB','QB'].includes(b.position||''))s+=4;if(st&&isTeamSide(b)&&a.type==='rushing'&&ao&&['RB','QB'].includes(a.position||''))s+=4;
    if(st&&isTeamSide(a)&&b.type==='td')s+=2;if(st&&isTeamSide(b)&&a.type==='td')s+=2;
    if(st&&ao&&bo&&['passing','receiving'].includes(a.type)&&['passing','receiving'].includes(b.type))s+=2;if(st&&au&&bu&&['passing','receiving'].includes(a.type)&&['passing','receiving'].includes(b.type))s+=1;
    if(!st&&!sp&&au&&bu&&PROP_TYPES.has(a.type)&&PROP_TYPES.has(b.type))s-=2;if(st&&((ao&&bu)||(au&&bo))&&['passing','receiving'].includes(a.type)&&['passing','receiving'].includes(b.type))s-=5;return s;
  }
  function strictIncompatible(a,b){if(!a||!b)return false;if(a.type==='totals'&&b.type==='totals')return true;if(isTeamSide(a)&&isTeamSide(b))return true;if(a.marketKey&&b.marketKey&&samePlayer(a,b)&&a.marketKey===b.marketKey)return true;if(samePlayer(a,b)&&a.type==='td'&&isUnder(b))return true;if(samePlayer(a,b)&&b.type==='td'&&isUnder(a))return true;if(a.player&&!verifiedPlayer(a))return true;if(b.player&&!verifiedPlayer(b))return true;return false;}
  function buildQuality(legs,variant='balanced',isSgp=true){
    if(!legs?.length)return{pass:false,reason:'No legs'};const qs=legs.map(l=>valueScore(l,variant));if(qs.some(q=>q<0))return{pass:false,reason:'A leg failed the market-value gate'};
    const avg=qs.reduce((a,b)=>a+b,0)/qs.length,avgFloor=variant==='safe'?77:variant==='balanced'?77:71;if(avg<avgFloor)return{pass:false,reason:'Average market quality is too low'};if(!isSgp)return{pass:true,avg,corr:0,links:0};
    let corr=0,links=0,negative=0;for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){if(strictIncompatible(legs[i],legs[j]))return{pass:false,reason:'Conflicting legs'};const c=strictCorrelation(legs[i],legs[j]);corr+=c;if(c>=3)links++;if(c<0)negative++;}
    const needLinks=Math.max(1,legs.length-1),corrFloor=variant==='safe'?5:variant==='balanced'?7:6;if(links<needLinks)return{pass:false,reason:'Not enough genuinely linked legs'};if(corr<corrFloor)return{pass:false,reason:'Correlation score is too weak'};if(negative>0&&variant!=='long')return{pass:false,reason:'Contains a conflicting relationship'};return{pass:true,avg,corr,links};
  }

  window.correlation=strictCorrelation;window.incompatible=strictIncompatible;
  const originalMarketQuality=window.marketQuality;if(typeof originalMarketQuality==='function')window.marketQuality=function(m,variant){const strict=valueScore(m,variant);if(strict<0)return-999;const old=originalMarketQuality(m,variant);return old<=-900?-999:(old*.45+strict*.55);};
  const originalCoherent=window.coherentWithLegs;if(typeof originalCoherent==='function')window.coherentWithLegs=function(candidate,legs,variant){if(!verifiedPlayer(candidate))return false;if(legs.some(l=>strictIncompatible(l,candidate)))return false;return originalCoherent(candidate,legs,variant);};
  const originalBuildSgp=window.buildSgp;if(typeof originalBuildSgp==='function')window.buildSgp=function(game,count,risk,variant,previous=[]){const p=originalBuildSgp(game,count,risk,variant,previous);if(!p)return null;const q=buildQuality(p.legs,variant,true);if(!q.pass)return null;p.corr=q.corr;p.score=Math.min(p.score,Math.round(q.avg));p.summary=(p.summary||'')+' Selectivity gate: '+q.links+' strong relationship'+(q.links===1?'':'s')+' verified.';return p;};
  const originalBuildMulti=window.buildMulti;if(typeof originalBuildMulti==='function')window.buildMulti=function(count,risk,variant){const p=originalBuildMulti(count,risk,variant);if(!p?.legs?.length)return null;const q=buildQuality(p.legs,variant,false);if(!q.pass)return null;if(new Set(p.legs.map(l=>l.gameLabel||l.gameId||'')).size<p.legs.length)return null;p.score=Math.min(p.score,Math.round(q.avg));return p;};

  function strictPool(kind='balanced'){const out=[];for(const g of state.games||[])for(const m of g.markets||[]){const x={...m,gameId:g.id,game:`${g.away} @ ${g.home}`,source:m.source||g.dataSource||'Live'};if(valueScore(x,kind)>=0)out.push(x);}return out;}
  function rankMarket(m,variant='balanced'){let s=valueScore(m,variant);if(m.type==='h2h')s+=4;if(m.type==='spreads')s+=2;if(m.player&&m._rosterVerified)s+=3;if(m.type==='td')s-=5;return s;}
  function fmt(o){return Number(o)>0?'+'+Math.round(o):String(Math.round(o))}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function key(m){return[m.gameId||'',m.marketKey||m.type,m.player||m.team||'',m.side||'',m.point??'',m.name||''].join('|')}
  function topCard(title,m,tone,icon){if(!m)return`<article class="qcard pass tone-${tone}"><div class="qtop"><span><i>${icon}</i>${title}</span></div><h3>PASS</h3><p>No qualifying pick.</p></article>`;const grade=rankMarket(m)>=94?'A':rankMarket(m)>=88?'A-':rankMarket(m)>=82?'B+':'B';return`<article class="qcard tone-${tone}" data-k="${esc(key(m))}"><div class="qtop"><span><i>${icon}</i>${title}</span><b>${grade}</b></div><div class="qtitle"><h3>${esc(m.name)}</h3><strong>${fmt(m.price)}</strong></div><p>${esc(m.game)} <small class="source-badge">${esc(m.source)}</small></p><div class="qmetrics"><span>Value <b>${Math.round(valueScore(m,'balanced'))}</b></span><span>Verified <b>${m.player?'Roster':'Market'}</b></span></div><div class="qactions"><button data-act="fav">☆</button><button data-act="lock">🔓</button><button data-act="why">Why</button><button data-act="override">Caesars</button><button data-act="exclude">×</button><button data-act="bet">Add bet</button></div></article>`;}
  function parlayOdds(legs){let d=1;for(const l of legs)d*=l.price>0?1+l.price/100:1+100/Math.abs(l.price);return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1))}
  function mini(title,legs,tone,icon,variant='balanced'){const q=buildQuality(legs,variant,title==='BEST SGP');if(!legs?.length||!q.pass)return`<article class="qcard pass tone-${tone}"><div class="qtop"><span><i>${icon}</i>${title}</span></div><h3>PASS</h3><p>${esc(q.reason||'No qualifying pick.')}</p></article>`;const keys=legs.map(key);return`<article class="qcard tone-${tone}"><div class="qtop"><span><i>${icon}</i>${title}</span><b>${q.avg>=86?'A-':'B+'}</b></div><div class="qtitle"><h3>${legs.length}-Leg Build</h3><strong>${fmt(parlayOdds(legs))}</strong></div><ol>${legs.map(x=>`<li>${esc(x.name)} <small>${fmt(x.price)}</small></li>`).join('')}</ol><div class="qmetrics"><span>Value <b>${Math.round(q.avg)}</b></span>${title==='BEST SGP'?`<span>Links <b>${q.links}</b></span><span>Corr <b>+${q.corr}</b></span>`:''}</div><div class="qactions"><button data-parlay='${esc(JSON.stringify(keys))}'>Add build to My Card</button></div></article>`;}
  function chooseTwo(){const pool=strictPool('balanced').sort((a,b)=>rankMarket(b)-rankMarket(a));for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){if(pool[i].gameId===pool[j].gameId)continue;const legs=[pool[i],pool[j]];if(buildQuality(legs,'balanced',false).pass)return legs;}return[];}
  function chooseSgp(){let best=null;for(const g of state.games||[]){const pool=(g.markets||[]).map(m=>({...m,gameId:g.id,game:`${g.away} @ ${g.home}`,source:m.source||g.dataSource||'Live'})).filter(m=>valueScore(m,'balanced')>=0).sort((a,b)=>rankMarket(b)-rankMarket(a)).slice(0,18);for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++)for(let k=j+1;k<pool.length;k++){const legs=[pool[i],pool[j],pool[k]],q=buildQuality(legs,'balanced',true);if(!q.pass)continue;const score=q.avg+q.corr*1.5;if(!best||score>best.score)best={legs,q,score};}}return best?.legs||[];}
  function refreshTopCards(){const grid=document.querySelector('#qolV3 .qgrid');if(!grid)return;const pool=strictPool('balanced').sort((a,b)=>rankMarket(b)-rankMarket(a));const straight=pool.find(m=>!m.player&&rankMarket(m)>=82)||null;const prop=pool.find(m=>m.player&&m.type!=='td'&&rankMarket(m)>=84)||null;grid.innerHTML=topCard('BEST BET',straight,'green','●')+topCard('BEST PLAYER PROP',prop,'blue','◆')+mini('BEST 2-LEG',chooseTwo(),'purple','⛓','balanced')+mini('BEST SGP',chooseSgp(),'gold','★','balanced');}

  async function verifyPriorityGames(){
    const games=state.games||[];if(!games.length)return;
    const selected=games.find(g=>g.id===document.getElementById('gameSelect')?.value);
    const candidates=games.filter(g=>(g.markets||[]).some(m=>m.player));
    const targets=[selected,...candidates].filter(Boolean).filter((g,i,a)=>a.findIndex(x=>x.id===g.id)===i).slice(0,6);
    await Promise.all(targets.map(verifyGameRoster));refreshTopCards();
  }
  const oldGenerate=window.generate;if(typeof oldGenerate==='function')window.generate=async function(...args){const game=(state.games||[]).find(g=>g.id===document.getElementById('gameSelect')?.value)||state.games?.[0];if(game)await verifyGameRoster(game);const result=await oldGenerate.apply(this,args);setTimeout(refreshTopCards,0);return result;};

  // This script is dynamically injected after DOMContentLoaded, so initialize immediately.
  const init=()=>setTimeout(verifyPriorityGames,50);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('nfl-qol-rendered',()=>{const hasUnverified=(state.games||[]).some(g=>(g.markets||[]).some(m=>m.player&&!m._rosterVerified&&!m._invalidRoster));if(hasUnverified)setTimeout(verifyPriorityGames,20);else setTimeout(refreshTopCards,20);});
  document.getElementById('gameSelect')?.addEventListener('change',()=>setTimeout(verifyPriorityGames,0));
  window.NFL_SELECTIVITY={verifyGameRoster,valueScore,strictCorrelation,buildQuality,refresh:refreshTopCards,verify:verifyPriorityGames};
})();