(()=>{'use strict';
const $=s=>document.querySelector(s);
function sync(){
  const today=document.body.dataset.sport==='bankroll';
  $('#todayView')?.setAttribute('aria-pressed',String(today));
  $('#exploreView')?.setAttribute('aria-pressed',String(!today));
  const heading=$('.brand-block h1');
  if(today&&heading)heading.textContent='TODAY';
}
function foldLegReasons(){
  const mobile=window.matchMedia('(max-width:600px)').matches;
  if(!mobile){
    document.querySelectorAll('#results .leg-details[data-mobile-fold]').forEach(details=>{
      const reason=details.querySelector('.leg-reason');
      if(reason)details.replaceWith(reason);
    });
    return;
  }
  document.querySelectorAll('#results .leg-reason').forEach(reason=>{
    if(reason.closest('.leg-details'))return;
    const details=document.createElement('details'),summary=document.createElement('summary');
    details.className='leg-details';details.dataset.mobileFold='';
    summary.textContent='Projection & context';
    reason.before(details);details.append(summary,reason);
  });
}
function compactSummaries(){
  document.querySelectorAll('#results>.parlay-card:not(.td-watch)>.summary').forEach(full=>{
    const text=full.textContent.trim(),short=full.dataset.shortText||
      (text.length>90?text.slice(0,90).replace(/\s+\S*$/,'')+'…':text);
    const thesis=document.createElement('p'),details=document.createElement('details'),label=document.createElement('summary');
    thesis.className='card-thesis';thesis.textContent=short;
    details.className='card-explanation';label.textContent='Why these legs?';
    full.before(thesis,details);details.append(label,full);
  });
}
function syncCards(){compactSummaries();foldLegReasons()}
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
  const results=$('#results');
  if(results)new MutationObserver(syncCards).observe(results,{childList:true,subtree:true});
  window.addEventListener('resize',foldLegReasons);
  syncCards();
  sync();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
