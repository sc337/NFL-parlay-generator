(()=>{'use strict';
const $=s=>document.querySelector(s),sport=()=>window.__ACTIVE_SPORT||'nfl';
const exclusions=new Map(),locks=new Map();
const straightViews=new Set();
const selectionKey=(s,m)=>window.PICK_QUALITY.id(s,m);
function excluded(s,m){return exclusions.get(s)?.has(selectionKey(s,m))===true;}
function locked(s,m){return locks.get(s)?.has(selectionKey(s,m))===true;}
function lock(s,m){if(!locks.has(s))locks.set(s,new Set());const set=locks.get(s),key=selectionKey(s,m);set.has(key)?set.delete(key):set.add(key);refresh();}
function accepts(s,rows){const keys=new Set(rows.map(m=>selectionKey(s,m)));return [...(locks.get(s)||[])].every(k=>keys.has(k));}
function exclude(s,m){locks.get(s)?.delete(selectionKey(s,m));if(!exclusions.has(s))exclusions.set(s,new Set());exclusions.get(s).add(selectionKey(s,m));refresh();}
const labels={screened:'Recommended picks',ideas:'Other picks · Value unverified'};
function refresh(){const s=sport();if(s==='nfl')window.generate?.();else window[s.toUpperCase()+'_DASHBOARD']?.refresh?.();}
function select(mode){const s=sport();mode=mode==='ideas'?'ideas':'screened';window.DASHBOARD_UI?.put(s,'selectionMode',mode);if(s==='nfl'){const el=$('#nflRecommendationTier');if(el){el.value=mode;el.dispatchEvent(new Event('change',{bubbles:true}));return}}refresh();}
function mount(){
 const controls=$('#parlayControls');if(!controls)return;
 let panel=$('#sharedSelection');
 if(!panel){panel=document.createElement('div');panel.id='sharedSelection';panel.className='shared-selection field';panel.innerHTML='<p>Other picks · Value unverified. These ideas have not passed the value screen.</p><button type="button">Back to recommended picks</button>';controls.prepend(panel);panel.querySelector('button').onclick=()=>select('screened');}
 const s=sport(),exploring=(s==='nfl'?window.NFL_PARLAY_STATE?.recommendationTier:window.DASHBOARD_UI?.get(s,'selectionMode','screened'))==='ideas';panel.hidden=!exploring;
 document.body.classList.toggle('exploring-picks',exploring);
 let view=$('#pickView');if(!view){view=document.createElement('div');view.id='pickView';view.className='field';view.innerHTML='<label for="pickViewSelect">Build</label><select id="pickViewSelect"><option value="straight">Straights</option><option value="sgp">Same Game</option><option value="multi">Multi Game</option></select>';$('#pickOfDay').before(view);view.querySelector('select').onchange=e=>{const current=sport(),value=e.target.value;if(value==='straight')straightViews.add(current);else{straightViews.delete(current);if(current==='nfl')$('.mode-tabs [data-mode="'+value+'"]')?.click();else if(current==='nba'){const mode=$('#nbaModeSelect');mode.value=value;mode.dispatchEvent(new Event('change',{bubbles:true}));}}refresh();schedule();};}
 const viewSelect=view.querySelector('select');viewSelect.querySelector('[value="sgp"]').disabled=!['nfl','nba'].includes(s);viewSelect.value=straightViews.has(s)?'straight':s==='nfl'?(window.NFL_PARLAY_STATE?.mode||'multi'):s==='nba'?($('#nbaModeSelect')?.value||'multi'):'multi';document.body.classList.toggle('straights-view',straightViews.has(s));
 let clear=$('#clearSelectionEdits');if(!clear){clear=document.createElement('button');clear.id='clearSelectionEdits';clear.type='button';clear.textContent='Clear locked / excluded picks';controls.append(clear);clear.onclick=()=>{exclusions.delete(sport());locks.delete(sport());refresh();};}clear.hidden=!(exclusions.get(s)?.size||locks.get(s)?.size);
 let gameControls=$('#sharedGameControls');if(!gameControls){gameControls=document.createElement('div');gameControls.id='sharedGameControls';panel.after(gameControls)}gameControls.hidden=s!=='nba';
 if(s==='nba')for(const el of [$('#nbaModeSelect')?.closest('.field'),$('#nbaGameField')])if(el&&el.parentElement!==gameControls)gameControls.append(el);
 // Keep sport-specific controls and listeners intact inside one filter drawer.
 if(s!=='nfl'){
  let filters=$('#sharedSportFilters');if(!filters){filters=document.createElement('details');filters.id='sharedSportFilters';filters.innerHTML='<summary>Filters</summary><div class="shared-filter-body"></div>';panel.after(filters)}filters.hidden=false;
  for(const id of ['mlbLineFilters','ncaafLineFilters','nhlMarketFilters','nbaLineFilters','mlbMarketFilters','ncaafMarketFilters','nbaMarketFilters','ufcMarketFilters']){const el=$('#'+id);if(el&&el.parentElement!==filters.lastElementChild)filters.lastElementChild.append(el)}
  let reset=filters.querySelector('.reset-filters');if(!reset){reset=document.createElement('button');reset.type='button';reset.className='reset-filters';reset.textContent='Reset filters';filters.lastElementChild.append(reset);reset.onclick=()=>{const current=sport();exclusions.delete(current);locks.delete(current);window.DASHBOARD_UI?.put(current,'lines','both');const api=window[current.toUpperCase()+'_DASHBOARD'];api?.setLineMode?.('both');if(window.SPORT_MARKETS?.options[current])window.SPORT_MARKETS.set(current,window.SPORT_MARKETS.options[current].map(x=>x[0]));const line=$('#'+current+'LinesSelect');if(line){line.value='both';line.dispatchEvent(new Event('change',{bubbles:true}))}if(current==='nhl')api?.setMarkets?.(['moneyline','spread','total','goals','assists','points','shots','saves']);refresh();};}
  const active=filters.querySelectorAll('[aria-pressed="false"]:not([disabled])');filters.querySelector('summary').textContent='Filters'+(active.length?' · customized':'');
 }else if($('#sharedSportFilters'))$('#sharedSportFilters').hidden=true;
 const count=window[s.toUpperCase()+'_DASHBOARD']?.availableCount?.();
 const legSelect=$('#legsSelect');if(legSelect){for(const option of legSelect.options){const impossible=s!=='nfl'&&!(s==='nba'&&$('#nbaModeSelect')?.value==='sgp')&&Number.isFinite(count)&&Number(option.value)>count;option.disabled=impossible;option.title=impossible?'Not enough qualified games or fights':'';}}
 let research=$('#sharedResearch');if(!research){research=document.createElement('details');research.id='sharedResearch';research.className='parlay-card';research.innerHTML='<summary>Research & alternatives</summary><div class="research-content"></div>';$('#results')?.after(research)}
 for(const id of ['extraPicks','publicSlate','espnEvidencePanel','moreAnalysis']){const el=$('#'+id);if(el&&!research.contains(el))research.lastElementChild.append(el)}
 let performance=research.querySelector('.performance-link');if(!performance){performance=document.createElement('button');performance.type='button';performance.className='performance-link';performance.textContent='Model performance & results';performance.onclick=()=>{const dialog=$('#settingsDialog');dialog?.showModal();const diagnostics=$('#settingsDiagnostics');if(diagnostics)diagnostics.open=true;window.PICK_HISTORY_REPORT?.refresh();$('#calibrationPanel')?.scrollIntoView({block:'nearest'});};research.lastElementChild.append(performance)}
 research.hidden=!Array.from(research.lastElementChild.children).some(el=>!el.hidden);
 let coverage=research.querySelector('.market-coverage');if(!coverage){coverage=document.createElement('p');coverage.className='market-coverage';research.lastElementChild.prepend(coverage)}
 const quotes=(window.PICK_QUALITY?.markets?.(s)||[]).filter(m=>!window.SLATE_UI||window.SLATE_UI.matches(s,m,window.PICK_QUALITY?.gameFor?.(s,m)?.commence_time));
 const current=quotes.filter(m=>{const q=window.PICK_QUALITY.quote(s,m),age=Date.now()-Date.parse(q.checkedAt);return q.p>0&&age>=-300000&&age<=1800000});
 const families=[...new Set(current.map(m=>m.marketKey||m.kind||m.type).filter(Boolean))];
 const coverageText=current.length+' current quoted selections across '+families.length+' market types for this date. '+(current.some(m=>m.player)?'Player props available.':'No player props in the current selection.')+' Freshness does not establish complete market coverage.';
 if(coverage.textContent!==coverageText)coverage.textContent=coverageText;
 const empty=straightViews.has(s)?$('#pickOfDayContent .pick-pass'):$('#results > .empty');
 if(empty&&!exploring&&!empty.querySelector('.qualifying-heading')){const heading=document.createElement('strong');heading.className='qualifying-heading';heading.textContent='No qualifying picks';empty.prepend(heading);}
 if(empty&&!empty.querySelector('.empty-actions')){const actions=document.createElement('div');actions.className='empty-actions';
  if(Number($('#legsSelect')?.value)>2){const b=document.createElement('button');b.type='button';b.textContent='Try 2 legs';b.onclick=()=>{const el=$('#legsSelect');el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}))};actions.append(b)}
  if(!exploring&&!(s==='nfl'&&window.NFL_PARLAY_STATE?.apiKey)){const b=document.createElement('button');b.type='button';b.textContent='Explore other picks';b.onclick=()=>select('ideas');actions.append(b)}
  if(actions.children.length)empty.append(actions);
 }
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;observer?.disconnect();mount();observe()})}
let observer;function observe(){observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sport']})}
function init(){observer=new MutationObserver(schedule);mount();observe();}
window.SELECTION_UI={select,refresh,labels,excluded,exclude,locked,lock,accepts};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else init();
})();
