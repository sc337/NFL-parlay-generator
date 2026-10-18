(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.DASHBOARD_SIMPLIFY=api;})(()=>{'use strict';
function emptySummary(text,count){
 const games=text.match(/from (\d+) games?\b|Only (\d+) of \d+ games qualify|Only (\d+) qualified UFC fights|(\d+) games qualify/);
 const n=games?.slice(1).find(x=>x!==undefined);
 return 'No qualifying '+count+'-leg parlay.'+(n!==undefined?' '+n+' '+(Number(n)===1?'game qualifies.':'games qualify.'):'');
}
function mount(){
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const hidden=(node,value)=>{if(node&&node.hidden!==value)node.hidden=value};
 function policies(){
  const target=$('#filterPolicies');if(!target)return;
  const originals=$$('#parlayControls .filter-policy,#parlayControls .nfl-line-policy');
  // Preserve the comprehensive policy descriptions already in Settings.
  // Keep the original note IDs there for accessible select descriptions.
  for(const node of originals){const sport=node.closest('#nflLinesWrap')?'NFL':node.closest('#nhlMarketFilters')?'NHL':node.closest('#mlbLineFilters')?'MLB':'NCAAF';node.querySelector('summary').textContent=sport+' ALT rules';node.open=false;node.hidden=sport!=='NFL';target.append(node);}
  const tier=$('#nflIdeasNote');if(tier&&!tier.closest('details')){const details=document.createElement('details'),summary=document.createElement('summary');details.className='selection-mode-help';summary.textContent='How selection modes work';tier.before(details);details.append(summary,tier);}
  for(const id of ['nflLinesSelect','mlbLinesSelect','ncaafLinesSelect','nhlLinesSelect','nbaLinesSelect']){
   const select=$('#'+id);if(!select)continue;let note=$('#'+id+'Hint');
   if(!note){note=document.createElement('small');note.id=id+'Hint';note.className='alt-short-note';note.textContent='ALT: confirm the exact line at your sportsbook.';select.after(note);}
   hidden(note,select.value==='standard');
  }
 }
 function markets(){
  const sport=window.__ACTIVE_SPORT||'nfl';
  if(sport==='nfl'){
   const rows=window.PICK_QUALITY?.markets?.('nfl');
   if(rows)for(const b of $$('#marketChips .chip'))hidden(b,!rows.some(m=>m.type===b.dataset.market&&(!window.SLATE_UI||window.SLATE_UI.matches('nfl',m))&&(!window.NFL_ALT_LINES||window.NFL_ALT_LINES.matches(m,window.NFL_PARLAY_STATE?.lineMode||'standard'))&&window.PICK_QUALITY.quote('nfl',m).odds!==null));
  }
  for(const b of $$('#nhlMarketChips .chip'))hidden(b,b.disabled);
  for(const chips of $$('#parlayControls .chips')){
   const panel=chips.closest('details');if(!panel)continue;
   const available=[...chips.querySelectorAll('.chip')].some(b=>!b.hidden&&!b.disabled);
   // Sport controllers own their outer panel's visibility. Nested NHL markets
   // have a separate disclosure from the NHL line controls.
   panel.classList.toggle('no-market-options',!available);
  }
 }
 function emptyStates(){
  for(const node of $$('#results > .empty:not([data-simplified])')){
   const text=node.textContent.trim();if(!/^(?:No (?:complete|qualifying|\d+-leg)|Only \d+)/.test(text))continue;
   const lead=document.createElement('p'),details=document.createElement('details'),summary=document.createElement('summary');
   lead.className='empty-lead';lead.textContent=emptySummary(text,window.PARLAY_GENERATOR?.count?.()||Number($('#legsSelect')?.value)||2);
   summary.textContent='Why selections were excluded';details.append(summary);
   for(const child of [...node.childNodes]){
    if(child.nodeType===1&&child.tagName==='BUTTON')continue;
    if(child.nodeType===1&&child.tagName==='DETAILS'){for(const part of [...child.childNodes])if(part.nodeType!==1||part.tagName!=='SUMMARY')details.append(part);child.remove();}
    else details.append(child);
   }
   node.prepend(lead);node.append(details);node.dataset.simplified='true';
  }
 }
 function sources(){
  for(const card of $$('#results .parlay-card,#analysisSecondary .parlay-card')){
   const details=card.querySelector('.card-explanation');if(!details)continue;
   for(const label of card.querySelectorAll('.shared-source-label'))if(!details.contains(label))details.append(label);
   for(const price of card.querySelectorAll('.market-tile-price:not([data-source-compacted])')){
    const full=price.textContent.trim(),match=full.match(/^(.+?)\s+([+−-]\d+(?:\.\d+)?)(?:\s*·\s*Reference)?$/);
    if(!match)continue;
    const note=document.createElement('p');note.className='quote-detail';note.textContent=(price.closest('.leg')?.querySelector('.leg-title')?.textContent||'Selection')+' · '+full;details.append(note);
    price.textContent=match[2];price.dataset.sourceCompacted='true';
   }
  }
 }
 function tidy(){policies();markets();emptyStates();sources();const td=$('#nflTdStraightDrawer');hidden(td,(window.__ACTIVE_SPORT||'nfl')!=='nfl'||!td?.querySelector('#tdMarketOptions .leg'));const pass=$('#pickOfDayContent .pick-pass')?.textContent.trim();for(const node of $$('#results > .empty'))hidden(node,!!pass&&node.textContent.trim()===pass);}
 let timer;
 new MutationObserver(mutations=>{if(!mutations.some(m=>m.type==='attributes'||m.target?.closest?.('#results,#parlayControls,#tdMarketOptions')))return;clearTimeout(timer);timer=setTimeout(tidy,60)}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sport']});
 document.addEventListener('change',e=>{if(e.target.closest?.('#parlayControls'))tidy()});
 setTimeout(tidy,0);
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
return {emptySummary};
});
