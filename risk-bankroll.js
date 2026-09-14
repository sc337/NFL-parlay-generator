(() => {
  const BANKROLL_KEY='nflParlayBankroll:v1';
  const originalCandidateScore=window.candidateScore;

  function riskBias(m,risk){
    if(!m || typeof m.price!=='number') return 0;
    const implied=typeof impliedProbability==='function' ? impliedProbability(m.price)*100 : 50;
    const r=Math.max(0,Math.min(100,Number(risk)||0));
    let bias=0;

    if(r<=25){
      bias += (implied-55)*0.75;
      if(m.price>0) bias-=18 + Math.min(18,m.price/25);
      if(m.price<=-140 && m.price>=-350) bias+=12;
      if(m.type==='td') bias-=18;
      if(/_alternate$/.test(m.marketKey||'') && m.price<-300) bias-=8;
    }else if(r<=60){
      const center=-25;
      const distance=Math.abs(m.price-center);
      bias += Math.max(-12,12-distance/22);
      if(m.price>=-170 && m.price<=120) bias+=10;
      if(['passing','rushing','receiving'].includes(m.type)) bias+=4;
      if(m.type==='td') bias-=4;
    }else{
      const aggression=(r-60)/40;
      if(m.price>0) bias+=10 + Math.min(24,m.price/18)*aggression;
      if(m.price>=100 && m.price<=325) bias+=12*aggression;
      if(m.price<-180) bias-=18*aggression;
      if(m.type==='td') bias+=16*aggression;
      if(m.price>450) bias-=25;
    }

    if(m.source==='Polymarket' && Number.isFinite(Number(m.sourceQuality))){
      bias += (Number(m.sourceQuality)-60)*0.45;
      if(Number(m.sourceQuality)<50) bias-=10;
    }
    return bias;
  }

  if(typeof originalCandidateScore==='function'){
    window.candidateScore=function(m,risk,variant='balanced'){
      const base=originalCandidateScore(m,risk,variant);
      if(base<=-900) return base;
      return base+riskBias(m,risk);
    };
  }

  function riskDescription(v){
    if(v<25) return 'Prioritizes shorter prices and higher implied hit rates.';
    if(v<60) return 'Balances hit rate, price discipline, and market quality.';
    if(v<80) return 'Allows more plus-money and higher-variance legs.';
    return 'Actively hunts payout upside; expect lower hit rates.';
  }

  function updateRiskUI(){
    const range=document.getElementById('riskRange');
    const out=document.getElementById('riskValue');
    const note=document.getElementById('riskBehavior');
    if(!range) return;
    if(out) out.textContent=range.value+'/100';
    if(note) note.textContent=riskDescription(Number(range.value));
  }

  function loadBankroll(){
    try{
      const saved=JSON.parse(localStorage.getItem(BANKROLL_KEY));
      if(saved && Number.isFinite(Number(saved.start)) && Number.isFinite(Number(saved.current))) return {start:Number(saved.start),current:Number(saved.current)};
    }catch{}
    return {start:100,current:100};
  }
  function saveBankroll(data){try{localStorage.setItem(BANKROLL_KEY,JSON.stringify(data));}catch{}}
  function money(v){const n=Number(v)||0;return n.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});}
  function stakePctFromConfidence(conf,isParlay=false){
    conf=Number(conf)||0;
    let pct=0.0025;
    if(conf>=92)pct=0.02;
    else if(conf>=88)pct=0.0175;
    else if(conf>=84)pct=0.015;
    else if(conf>=80)pct=0.0125;
    else if(conf>=75)pct=0.01;
    else if(conf>=70)pct=0.0075;
    else if(conf>=65)pct=0.005;
    if(isParlay)pct=Math.min(pct*0.4,0.0075);
    return pct;
  }
  function normalizeStake(amount){
    const n=Math.max(0,Number(amount)||0);
    return Math.round(n*100)/100;
  }
  function bankroll(){const input=document.getElementById('currentBankroll');return Math.max(0,Number(input?.value)||loadBankroll().current||0);}

  function renderBankroll(){
    const startEl=document.getElementById('startingBankroll'),currentEl=document.getElementById('currentBankroll');
    if(!startEl||!currentEl)return;
    const start=Math.max(0,Number(startEl.value)||0),current=Math.max(0,Number(currentEl.value)||0),pnl=current-start,pct=start>0?(pnl/start)*100:0;
    const pnlEl=document.getElementById('bankrollPnl'),unitEl=document.getElementById('bankrollUnit');
    if(pnlEl){pnlEl.textContent=(pnl>=0?'+':'')+money(pnl)+' ('+(pct>=0?'+':'')+pct.toFixed(1)+'%)';pnlEl.dataset.sign=pnl>=0?'positive':'negative';}
    if(unitEl)unitEl.textContent=money(current*0.01);
    saveBankroll({start,current});applyStakeSuggestions();
  }

  function confidenceFromDaily(card){
    const explicit=Number(card?.dataset?.confidence);
    if(Number.isFinite(explicit)&&explicit>0)return explicit;
    const grade=card?.querySelector('.daily-pick-grade')?.textContent||'';
    const fit=Number((grade.match(/([0-9.]+)\/10/)||[])[1]);
    if(!Number.isFinite(fit))return 0;
    return Math.max(50,Math.min(95,50+fit*4));
  }

  function ensureSuggestion(container,conf,isParlay=false){
    if(!container||!conf)return;
    const pct=stakePctFromConfidence(conf,isParlay);
    const raw=bankroll()*pct;
    const amount=normalizeStake(raw);
    const actualPct=bankroll()>0?(amount/bankroll())*100:0;
    const html=`<span>Suggested stake</span><strong>${money(amount)}</strong><small>${actualPct.toFixed(actualPct<1?2:1)}% of bankroll</small>`;
    let el=container.querySelector('.stake-suggestion');
    if(!el){el=document.createElement('div');el.className='stake-suggestion';container.appendChild(el);}
    if(el.dataset.sig!==html){el.innerHTML=html;el.dataset.sig=html;}
  }

  function applyStakeSuggestions(){
    document.querySelectorAll('.daily-pick-card').forEach(card=>{
      if(card.classList.contains('daily-pass')){card.querySelector('.stake-suggestion')?.remove();return;}
      ensureSuggestion(card,confidenceFromDaily(card),false);
    });
    document.querySelectorAll('#results .parlay-card').forEach(card=>{
      const txt=card.querySelector('.score')?.textContent||'',conf=Number((txt.match(/([0-9]+)\/100/)||[])[1]);
      if(Number.isFinite(conf))ensureSuggestion(card,conf,true);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const saved=loadBankroll(),start=document.getElementById('startingBankroll'),current=document.getElementById('currentBankroll');
    if(start)start.value=String(saved.start);if(current)current.value=String(saved.current);
    [start,current].forEach(el=>el?.addEventListener('input',renderBankroll));
    document.getElementById('resetBankrollBtn')?.addEventListener('click',()=>{const s=Math.max(0,Number(start?.value)||100);if(current)current.value=String(s);renderBankroll();});
    document.getElementById('riskRange')?.addEventListener('input',updateRiskUI);
    updateRiskUI();renderBankroll();
    const observer=new MutationObserver(()=>applyStakeSuggestions());
    const results=document.getElementById('results'),daily=document.querySelector('.daily-picks-section');
    if(results)observer.observe(results,{childList:true,subtree:true,characterData:true});
    if(daily)observer.observe(daily,{childList:true,subtree:true,characterData:true});
  });

  window.NFL_BANKROLL={current:bankroll,stakePctFromConfidence,normalizeStake,refresh:applyStakeSuggestions};
})();