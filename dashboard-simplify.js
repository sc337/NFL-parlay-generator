(() => {
  let applying=false;
  let observer=null;

  function ensureAdvancedContainer(){
    const form=document.querySelector('#settingsDialog .dialog-card');
    if(!form)return null;
    let details=form.querySelector('#advancedDashboardSettings');
    if(!details){
      details=document.createElement('details');
      details.id='advancedDashboardSettings';
      details.className='dashboard-advanced';
      details.innerHTML='<summary>Advanced & technical</summary><div class="dashboard-advanced-body"></div>';
      const actions=form.querySelector('.dialog-actions');
      form.insertBefore(details,actions||null);
    }
    return details.querySelector('.dashboard-advanced-body');
  }

  function cleanupOldDynamicCopies(){
    const root=document.getElementById('qolV3');
    const newTracker=root?.querySelector('.qpanel .qhead span') ? [...root.querySelectorAll(':scope > .qpanel')].find(p=>p.querySelector('.qhead span')?.textContent.trim()==='BET TRACKER') : null;
    const oldTrackers=[...document.querySelectorAll('.tracker-primary')].filter(x=>x!==newTracker);
    for(const old of oldTrackers){
      const bankroll=old.querySelector('.bankroll-card');
      if(bankroll && newTracker)newTracker.appendChild(bankroll);
      old.remove();
    }
    const advanced=document.querySelector('.dashboard-advanced-body');
    if(advanced){
      [...advanced.querySelectorAll('.qdetails')].forEach(el=>el.remove());
    }
  }

  function makeHeaderStatus(){
    const top=document.querySelector('.topbar');
    const hero=document.querySelector('.hero');
    if(!top||!hero)return;
    let status=top.querySelector('.header-live-status');
    if(!status){
      status=document.createElement('div');
      status.className='header-live-status';
      const source=hero.querySelector('div');
      if(source)status.appendChild(source);
      top.querySelector('div')?.appendChild(status);
    }
    hero.hidden=true;
  }

  function moveTechnicalPanels(){
    const target=ensureAdvancedContainer();
    if(!target)return;
    for(const el of [document.querySelector('.api-usage-card'),document.querySelector('.source-status-card')]){
      if(el && el.parentElement!==target)target.appendChild(el);
    }
    const qdetails=[...document.querySelectorAll('#qolV3 .qdetails')];
    for(const el of qdetails)target.appendChild(el);
  }

  function findPanelByKicker(text){
    return [...document.querySelectorAll('#qolV3 > .qpanel')].find(p=>p.querySelector('.qhead span')?.textContent.trim()===text);
  }

  function compactMyCard(){
    const panel=findPanelByKicker('MY CARD');
    if(!panel)return;
    panel.hidden=!panel.querySelector('.qmy');
    panel.classList.add('my-card-compact');
  }

  function mergeBankrollIntoTracker(){
    const tracker=findPanelByKicker('BET TRACKER');
    const main=document.querySelector('main');
    if(!tracker||!main)return;
    let bankroll=document.querySelector('.bankroll-card');

    if(bankroll && !tracker.contains(bankroll)){
      const head=tracker.querySelector('.qhead');
      if(head)head.insertAdjacentElement('afterend',bankroll); else tracker.prepend(bankroll);
      bankroll.classList.add('bankroll-inline');
    }

    if(main.nextElementSibling!==tracker)main.insertAdjacentElement('afterend',tracker);
    tracker.classList.add('tracker-primary');

    const reset=tracker.querySelector('#resetBankrollBtn');
    if(reset){
      let menu=tracker.querySelector('.tracker-menu');
      if(!menu){
        menu=document.createElement('details');
        menu.className='tracker-menu';
        menu.innerHTML='<summary aria-label="Bankroll options">•••</summary><div></div>';
        tracker.querySelector('.qhead')?.appendChild(menu);
      }
      const body=menu.querySelector('div');
      if(body && reset.parentElement!==body)body.appendChild(reset);
    }
  }

  function simplifyParlayBuilder(){
    const control=document.querySelector('.control-card');
    if(!control)return;
    control.classList.add('compact-parlay-builder');
    const riskHelp=document.getElementById('riskBehavior');
    if(riskHelp)riskHelp.hidden=true;

    const market=document.querySelector('.market-box');
    if(market && !market.closest('.market-filter-details')){
      const details=document.createElement('details');
      details.className='market-filter-details';
      const summary=document.createElement('summary');
      summary.textContent='Markets';
      market.parentNode.insertBefore(details,market);
      details.appendChild(summary);
      details.appendChild(market);
    }

    const label=control.querySelector('.section-head .label');
    if(label)label.hidden=true;
  }

  function slimRecommendationCards(){
    document.querySelectorAll('#qolV3 .qcard > p').forEach(p=>{
      if(p.querySelector('.source-badge'))return;
      const parts=p.textContent.split(' • ');
      if(parts.length>1){
        p.textContent=parts[0];
        const source=document.createElement('small');
        source.className='source-badge';
        source.textContent=parts.slice(1).join(' • ');
        p.appendChild(source);
      }
    });
  }

  function positionQuickCard(){
    const root=document.getElementById('qolV3');
    const top=document.querySelector('.topbar');
    if(!root||!top)return;
    if(top.nextElementSibling!==root)top.insertAdjacentElement('afterend',root);
  }

  function apply(){
    if(applying)return;
    applying=true;
    if(observer)observer.disconnect();
    try{
      cleanupOldDynamicCopies();
      makeHeaderStatus();
      positionQuickCard();
      compactMyCard();
      mergeBankrollIntoTracker();
      simplifyParlayBuilder();
      moveTechnicalPanels();
      slimRecommendationCards();
      document.body.classList.add('dashboard-simplified');
    }finally{
      applying=false;
      if(observer){const root=document.getElementById('qolV3');if(root)observer.observe(root,{childList:true,subtree:false});}
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(document.getElementById('qolV3')){
        clearInterval(timer);
        apply();
        observer=new MutationObserver(()=>requestAnimationFrame(apply));
        observer.observe(document.getElementById('qolV3'),{childList:true,subtree:false});
      }else if(tries>40)clearInterval(timer);
    },50);
  });

  window.NFL_DASHBOARD_SIMPLIFY={refresh:apply};
})();