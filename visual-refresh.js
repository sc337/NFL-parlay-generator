(()=>{'use strict';
const $=s=>document.querySelector(s);
function sync(){
  const today=document.body.dataset.sport==='bankroll';
  $('#todayView')?.setAttribute('aria-pressed',String(today));
  $('#exploreView')?.setAttribute('aria-pressed',String(!today));
  const heading=$('.brand-block h1');
  if(today&&heading)heading.textContent='TODAY';
}
function mount(){
  const main=$('main');
  if(!main||$('#explorePanelToggle'))return;
  const views=$('.view-switch'),sports=$('#sportSwitch');
  if(views&&sports){views.insertAdjacentElement('afterend',sports);const overview=$('#sportOverview');if(overview)sports.insertAdjacentElement('afterend',overview)}
  const toggle=document.createElement('button');
  toggle.type='button';toggle.id='explorePanelToggle';toggle.className='explore-panel-toggle';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','parlayControls');
  toggle.textContent='Parlay options';
  main.prepend(toggle);
  toggle.addEventListener('click',()=>{
    const open=document.body.classList.toggle('explore-expanded');
    toggle.setAttribute('aria-expanded',String(open));
    toggle.textContent=open?'Hide parlay options':'Parlay options';
  });
  $('#todayView')?.addEventListener('click',()=>$('.sport-switch [data-sport="bankroll"]')?.click());
  $('#exploreView')?.addEventListener('click',()=>{
    if(document.body.dataset.sport==='bankroll')($('.sport-switch [data-sport="nfl"]')||$('.sport-switch [data-sport]:not([data-sport="bankroll"])'))?.click();
  });
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-sport']});
  sync();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
