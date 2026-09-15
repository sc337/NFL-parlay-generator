(()=>{
  const MAX=8;
  const key=(m,g)=>[g?.id||m.gameId||'',m.marketKey||m.type,m.player||m.team||'',m.side||'',m.point??'',m.name||''].join('|');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const odds=n=>Number(n)>0?`+${Math.round(n)}`:String(Math.round(n));
  const score=m=>window.NFL_CONFIDENCE?.score?.(m)??0;
  const norm=s=>String(s??'').toLowerCase().replace(/\s+/g,' ').trim();
  function propIdentity(m){
    const stat=m.type||m.marketKey||'';
    return [m.gameId||'',norm(m.player),norm(stat),Number(m.point)].join('|');
  }
  function direction(m){const s=norm(m.side||m.name);if(/\bover\b/.test(s))return'over';if(/\bunder\b/.test(s))return'under';return s}
  function edge(m){
    const c=score(m),p=Number(m.price),sq=Number(m.sourceQuality)||0;
    const priceDiscipline=p>=-175&&p<=140?5:p>=-225&&p<=180?2:0;
    const role=Number(m.contextSignals?.market_breadth)||0;
    return c*10+sq+priceDiscipline+Math.min(role,4);
  }
  function candidates(){
    const raw=[];
    for(const g of state.games||[])for(const m0 of g.markets||[]){
      if(!m0.player||m0.type==='td'||m0._invalidRoster)continue;
      const p=Number(m0.price);if(!Number.isFinite(p)||p < -250||p > 200)continue;
      const m={...m0,gameId:g.id,game:`${g.away} @ ${g.home}`,source:m0.source||g.dataSource||'Live'};
      const c=score(m);if(c<76)continue;
      raw.push({...m,_carouselConfidence:c,_k:key(m,g),_edge:edge(m)});
    }
    raw.sort((a,b)=>b._edge-a._edge);
    const winners=new Map();
    for(const m of raw){const id=propIdentity(m);const prev=winners.get(id);if(!prev){winners.set(id,m);continue}if(direction(prev)===direction(m))continue;if(m._edge>prev._edge)winners.set(id,m)}
    const chosen=[...winners.values()].sort((a,b)=>b._edge-a._edge);
    const playerStatSeen=new Set(),out=[];
    for(const m of chosen){
      const family=[m.gameId,norm(m.player),norm(m.type||m.marketKey)].join('|');
      if(playerStatSeen.has(family))continue;
      playerStatSeen.add(family);out.push(m);if(out.length===MAX)break;
    }
    return out;
  }
  function card(m,i,total){return `<article class="prop-slide qcard tone-blue" data-k="${esc(m._k)}"><div class="qtop"><span><i>◆</i>PLAYER PROP ${i+1}/${total}</span><b>${m._carouselConfidence>=88?'A':m._carouselConfidence>=84?'A-':m._carouselConfidence>=80?'B+':'B'}</b></div><div class="qtitle"><h3>${esc(m.name)}</h3><strong>${odds(m.price)}</strong></div><p>${esc(m.game)} <small class="source-badge">${esc(m.source)}</small></p><div class="qmetrics"><span>Confidence <b>${Math.round(m._carouselConfidence)}</b></span>${m.contextSignals?.market_breadth?`<span>Role <b>${m.contextSignals.market_breadth}</b></span>`:''}</div><div class="qactions"><button data-act="fav">☆</button><button data-act="lock">🔓</button><button data-act="why">Why</button><button data-act="override">Caesars</button><button data-act="exclude">×</button><button data-act="bet">Add bet</button></div></article>`}
  function render(){const grid=document.querySelector('#qolV3 .qgrid');if(!grid)return;let wrap=grid.querySelector('.prop-carousel-wrap');const existing=[...grid.querySelectorAll('.qcard')].find(c=>c.querySelector('.qtop span')?.textContent?.includes('BEST PLAYER PROP'));if(!wrap&&!existing)return;const list=candidates();if(!list.length)return;if(!wrap){wrap=document.createElement('div');wrap.className='prop-carousel-wrap';existing.replaceWith(wrap)}wrap.innerHTML=`<div class="prop-carousel-head"><span>BEST PLAYER PROPS</span><small>Swipe to browse ${list.length}</small></div><div class="prop-carousel" aria-label="Best player props">${list.map((m,i)=>card(m,i,list.length)).join('')}</div><div class="prop-dots">${list.map((_,i)=>`<i class="${i===0?'active':''}"></i>`).join('')}</div>`;const rail=wrap.querySelector('.prop-carousel'),dots=[...wrap.querySelectorAll('.prop-dots i')];rail.addEventListener('scroll',()=>{const i=Math.round(rail.scrollLeft/Math.max(1,rail.clientWidth));dots.forEach((d,n)=>d.classList.toggle('active',n===i))},{passive:true})}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(render,600));window.addEventListener('nfl-qol-rendered',()=>setTimeout(render,30));window.addEventListener('nfl-diagnostics-updated',()=>setTimeout(render,80));window.NFL_PROP_CAROUSEL={refresh:render,candidates,propIdentity,direction};
})();