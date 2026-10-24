(()=>{'use strict';
const $=s=>document.querySelector(s),sport=()=>window.__ACTIVE_SPORT||'nfl';
// Compatibility hooks used by sport generators; picks are no longer manually locked or excluded.
function excluded(){return false;}
function accepts(){return true;}
const labels={screened:'Recommended picks',ideas:'Other picks · Value unverified'};
function refresh(){const s=sport();if(s==='nfl')window.generate?.();else window[s.toUpperCase()+'_DASHBOARD']?.refresh?.();}
function select(mode){const s=sport();mode=mode==='ideas'?'ideas':'screened';window.DASHBOARD_UI?.put(s,'selectionMode',mode);if(s==='nfl'){const el=$('#nflRecommendationTier');if(el){el.value=mode;el.dispatchEvent(new Event('change',{bubbles:true}));return}}refresh();}
function mountLines(){
 for(const source of document.querySelectorAll('select[id$="LinesSelect"]')){
  const id=source.id+'Buttons';let group=$('#'+id);
  if(!group){group=document.createElement('div');group.id=id;group.className='line-options-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','Line options');
   for(const [value,label] of [['standard','Standard'],['alt','ALT'],['both','Both']])if([...source.options].some(option=>option.value===value)){const button=document.createElement('button');button.type='button';button.dataset.lineMode=value;button.textContent=label;group.append(button)}
   group.addEventListener('click',event=>{const button=event.target.closest('[data-line-mode]');if(!button||button.disabled)return;source.value=button.dataset.lineMode;source.dispatchEvent(new Event('change',{bubbles:true}));mountLines()});source.after(group);
  }
  source.classList.add('line-options-source');
  for(const button of group.querySelectorAll('[data-line-mode]')){const option=[...source.options].find(option=>option.value===button.dataset.lineMode);button.disabled=source.disabled||!option||option.disabled;button.setAttribute('aria-pressed',String(source.value===button.dataset.lineMode))}
 }
}
function resetFilters(){
 const s=sport(),api=window[s.toUpperCase()+'_DASHBOARD'];
 if(s==='nfl'){const state=window.NFL_PARLAY_STATE,buttons=[...document.querySelectorAll('#marketChips [data-market]')],kinds=buttons.map(b=>b.dataset.market);if(state)state.selectedMarkets=new Set(kinds);buttons.forEach(b=>{b.classList.add('active');b.setAttribute('aria-pressed','true')});window.DASHBOARD_UI?.put(s,'markets',kinds)}
 else if(s==='nhl')api?.setMarkets?.(['moneyline','spread','total','goals','assists','points','shots','saves']);
 else if(window.SPORT_MARKETS?.options[s])window.SPORT_MARKETS.set(s,window.SPORT_MARKETS.options[s].map(x=>x[0]));
 const lines=$('#'+s+'LinesSelect');if(lines){lines.value='both';lines.dispatchEvent(new Event('change',{bubbles:true}))}
 refresh();
}
const shortMarkets={moneyline:'ML',h2h:'ML',total:'Total',totals:'Total',game_total:'Total',points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'3PT',pr:'Pts + Reb',pa:'Pts + Ast',ra:'Reb + Ast',steals:'Steals',blocks:'Blocks',pra:'PRA',strikeouts:'Strikeouts',hrr:'H+R+RBI',method_victory:'Win Method',method_finish:'Finish',round_finish:'Finish Round',distance:'Distance'};
function tidyFilters(s){
 const root=$(s==='nfl'?'#nflParlayFilters':'#sharedSportFilters');if(!root)return;
 root.classList.add('simple-filters');
 for(const details of root.querySelectorAll('.market-filter-details')){details.open=true;details.classList.add('flat-market-section')}
 const host=$('#'+s+'MarketFilters'),grid=host?.querySelector('.chips');if(!grid)return;
 grid.classList.add('filter-market-grid');
 let heading=host.querySelector('.filter-section-title');if(!heading){heading=document.createElement('div');heading.className='filter-section-title';heading.textContent='Markets';grid.before(heading)}
 const buttons=[...grid.querySelectorAll('button')];
 for(const button of buttons){
  const kind=button.dataset.sportMarket||button.dataset.nhlMarket||button.dataset.market;
  if(shortMarkets[kind]&&button.textContent!==shortMarkets[kind]){if(!button.title)button.title=button.textContent;button.textContent=shortMarkets[kind]}
  let unavailable=button.disabled;
  if(s==='nfl'&&window.NFL_PARLAY_STATE?.games?.length){unavailable=!window.NFL_PARLAY_STATE.games.some(g=>(!window.SLATE_UI||window.SLATE_UI.matches('nfl',{},g.commence_time))&&g.markets?.some(m=>m.type===kind&&Number.isFinite(m.price)&&m.price!==0));}
  button.hidden=false;button.disabled=unavailable;
  button.dataset.availability=unavailable?'unavailable':'available';
  button.setAttribute('aria-label',button.textContent+(unavailable?' · No quotes available':''));
  button.setAttribute('aria-pressed',String(button.classList.contains('active')));
 }
 const visible=buttons.filter(b=>!b.disabled),selected=visible.filter(b=>b.classList.contains('active'));
 let empty=host.querySelector('.filter-markets-empty');if(!empty){empty=document.createElement('small');empty.className='filter-markets-empty';empty.textContent='No markets available for this selection.';grid.after(empty)}empty.hidden=visible.length>0;
 const lines=$('#'+s+'LinesSelect'),lineLabel={both:'Both',standard:'Standard',alt:'ALT'}[lines?.value];
 const summary=root.querySelector('summary'),marketLabel=!visible.length?'No markets':selected.length===visible.length?'All markets':selected.length+' markets';
 const text=['Filters',lineLabel,marketLabel].filter(Boolean).join(' · ');if(summary.textContent!==text)summary.textContent=text;
 let reset=root.querySelector('.reset-filters');if(!reset){reset=document.createElement('button');reset.type='button';reset.className='reset-filters';reset.textContent='Reset';root.lastElementChild.append(reset)}reset.onclick=resetFilters;reset.textContent='Reset';reset.hidden=(!lines||lines.value==='both')&&selected.length===visible.length;
}
// Shared builder owns layout; sport modules continue to own values and events.
function mountBuilder(s){
 const controls=$('#parlayControls');let shell=$('#sharedBuilder');
 if(!shell){shell=document.createElement('div');shell.id='sharedBuilder';shell.innerHTML='<div class="builder-main-row"><div id="builderMode" class="field"><label>Game mode</label><div id="builderModeOptions"></div></div><div id="builderLegs"></div></div><div id="builderGame"></div>';controls.prepend(shell)}
 const modeHost=$('#builderModeOptions'),gameHost=$('#builderGame'),quality=$('.quality-settings');
 if(quality&&quality.parentElement!==$('#builderLegs'))$('#builderLegs').append(quality);
 const nflMode=$('.mode-tabs'),nbaMode=$('#nbaModeSelect')?.closest('.field');
 if(nflMode&&nflMode.parentElement!==modeHost)modeHost.append(nflMode);
 if(nbaMode&&nbaMode.parentElement!==modeHost)modeHost.append(nbaMode);
 if(nflMode)nflMode.hidden=s!=='nfl';if(nbaMode)nbaMode.hidden=s!=='nba';
 let fixed=$('#builderFixedMode');if(!fixed){fixed=document.createElement('div');fixed.id='builderFixedMode';fixed.className='builder-fixed-mode';modeHost.append(fixed)}
 fixed.hidden=['nfl','nba'].includes(s);const fixedLabel=s==='ufc'?'Multi-Fight':'Multi-Game';if(fixed.textContent!==fixedLabel)fixed.textContent=fixedLabel;
 const source=$('#nbaModeSelect');if(source){
  let group=$('#nbaModeButtons');if(!group){group=document.createElement('div');group.id='nbaModeButtons';group.className='builder-mode-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','Game mode');
   for(const option of source.options){const b=document.createElement('button');b.type='button';b.dataset.modeValue=option.value;b.textContent=option.textContent;group.append(b)}
   group.addEventListener('click',e=>{const b=e.target.closest('[data-mode-value]');if(!b||b.disabled)return;source.value=b.dataset.modeValue;source.dispatchEvent(new Event('change',{bubbles:true}));schedule()});source.after(group)}
  source.classList.add('builder-mode-source');for(const b of group.children){b.setAttribute('aria-pressed',String(source.value===b.dataset.modeValue));b.disabled=source.disabled||[...source.options].find(o=>o.value===b.dataset.modeValue)?.disabled===true}
 }
 for(const id of ['gameChooserWrap','nbaGameField','ufcCardWrap']){const game=$('#'+id);if(game&&game.parentElement!==gameHost)gameHost.append(game);if(game)game.classList.toggle('builder-inactive-game',id==='gameChooserWrap'?s!=='nfl'||$('.mode-tabs .tab.active')?.dataset.mode!=='sgp':id==='nbaGameField'?s!=='nba':s!=='ufc')}
 const filters=$(s==='nfl'?'#nflParlayFilters':'#sharedSportFilters');if(filters&&shell.nextElementSibling!==filters)shell.after(filters);
 const generate=$('#generateBtn');if(generate&&filters&&filters.nextElementSibling!==generate)filters.after(generate);
}
function tidyCards(){
 // Analysis nodes temporarily leave the card while its details sheet is open.
 if(document.body.classList.contains('details-sheet-open'))return;
 for(const card of document.querySelectorAll('#results>.parlay-card[data-compact]')){
  const details=[...card.querySelectorAll('.card-explanation')];const primary=details.find(d=>!d.classList.contains('parlay-risk'))||details[0];if(!primary)continue;
  const heading=primary.querySelector('summary');if(heading&&heading.textContent!=='Risk & details')heading.textContent='Risk & details';
  for(const section of details)if(section!==primary&&!primary.contains(section)&&!section.contains(primary)){section.classList.remove('card-explanation');primary.append(section)}
 }
}
let countState={};
function mount(){
 const controls=$('#parlayControls');if(!controls)return;
 let panel=$('#sharedSelection');
 if(!panel){panel=document.createElement('div');panel.id='sharedSelection';panel.className='shared-selection field';panel.hidden=true;controls.prepend(panel);}
 const s=sport(),exploring=(s==='nfl'?window.NFL_PARLAY_STATE?.recommendationTier:window.DASHBOARD_UI?.get(s,'selectionMode','screened'))==='ideas';panel.hidden=true;
 document.body.classList.toggle('exploring-picks',exploring);
 $('#pickView')?.remove();
 document.body.classList.remove('straights-view','parlays-view');
 // Keep sport-specific controls and listeners intact inside one filter drawer.
 if(s!=='nfl'){
  let filters=$('#sharedSportFilters');if(!filters){filters=document.createElement('details');filters.id='sharedSportFilters';filters.innerHTML='<summary>Filters</summary><div class="shared-filter-body"></div>';panel.after(filters)}filters.hidden=false;
  for(const id of ['mlbLineFilters','ncaafLineFilters','nhlMarketFilters','nbaLineFilters','mlbMarketFilters','ncaafMarketFilters','nbaMarketFilters','ufcMarketFilters']){const el=$('#'+id);if(el&&el.parentElement!==filters.lastElementChild)filters.lastElementChild.append(el)}
  let reset=filters.querySelector('.reset-filters');if(!reset){reset=document.createElement('button');reset.type='button';reset.className='reset-filters';reset.textContent='Reset filters';filters.lastElementChild.append(reset);reset.onclick=()=>{const current=sport();window.DASHBOARD_UI?.put(current,'lines','both');const api=window[current.toUpperCase()+'_DASHBOARD'];api?.setLineMode?.('both');if(window.SPORT_MARKETS?.options[current])window.SPORT_MARKETS.set(current,window.SPORT_MARKETS.options[current].map(x=>x[0]));const line=$('#'+current+'LinesSelect');if(line){line.value='both';line.dispatchEvent(new Event('change',{bubbles:true}))}if(current==='nhl')api?.setMarkets?.(['moneyline','spread','total','goals','assists','points','shots','saves']);refresh();};}
  filters.querySelector('summary').textContent='Filters';
 }else if($('#sharedSportFilters'))$('#sharedSportFilters').hidden=true;
 mountLines();
 tidyFilters(s);
 mountBuilder(s);
 tidyCards();
 const grid=$('#results'), revision=grid?.firstElementChild;
 if(countState.sport!==s||countState.revision!==revision){countState={sport:s,revision,count:window[s.toUpperCase()+'_DASHBOARD']?.availableCount?.()}}
 const count=countState.count;
 const legSelect=$('#legsSelect');if(legSelect){for(const option of legSelect.options){const impossible=s!=='nfl'&&!(s==='nba'&&$('#nbaModeSelect')?.value==='sgp')&&Number.isFinite(count)&&Number(option.value)>count;option.disabled=impossible;option.title=impossible?'Not enough qualified games or fights':'';}}
 // Legacy secondary surfaces stay out of the main dashboard.
 for(const id of ['sharedResearch','extraPicks','publicSlate','espnEvidencePanel','moreAnalysis','nflTdStraightDrawer']){const node=$('#'+id);if(node)node.hidden=true;}
 const empty=$('#results > .empty');
 if(empty&&!exploring&&!empty.querySelector('.qualifying-heading')){const heading=document.createElement('strong');heading.className='qualifying-heading';heading.textContent='No qualifying picks';empty.prepend(heading);}
 if(empty&&!empty.querySelector('.empty-actions')){const actions=document.createElement('div');actions.className='empty-actions';
  if(Number($('#legsSelect')?.value)>2){const b=document.createElement('button');b.type='button';b.textContent='Try 2 legs';b.onclick=()=>{const el=$('#legsSelect');el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}))};actions.append(b)}
  if(actions.children.length)empty.append(actions);
 }
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;observer?.disconnect();mount();observe()})}
let observer;function observe(){observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sport']})}
function init(){observer=new MutationObserver(schedule);mount();observe();}
window.SELECTION_UI={select,refresh,labels,excluded,accepts,mountLines,mountBuilder};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else init();
})();
