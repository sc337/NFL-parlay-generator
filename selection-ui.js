(()=>{'use strict';
const $=s=>document.querySelector(s),sport=()=>window.__ACTIVE_SPORT||'nfl';
const exclusions=new Map(),locks=new Map();
const selectionKey=(s,m)=>window.PICK_QUALITY.id(s,m);
function excluded(s,m){return exclusions.get(s)?.has(selectionKey(s,m))===true;}
function locked(s,m){return locks.get(s)?.has(selectionKey(s,m))===true;}
function lock(s,m){if(!locks.has(s))locks.set(s,new Set());const set=locks.get(s),key=selectionKey(s,m);set.has(key)?set.delete(key):set.add(key);refresh();}
function accepts(s,rows){const keys=new Set(rows.map(m=>selectionKey(s,m)));return [...(locks.get(s)||[])].every(k=>keys.has(k));}
function exclude(s,m){locks.get(s)?.delete(selectionKey(s,m));if(!exclusions.has(s))exclusions.set(s,new Set());exclusions.get(s).add(selectionKey(s,m));refresh();}
const labels={screened:'Value',ideas:'Matchups',likelihood:'Win Chance'};
function refresh(){const s=sport();if(s==='nfl')window.generate?.();else window[s.toUpperCase()+'_DASHBOARD']?.refresh?.();}
function select(mode){const s=sport();window.DASHBOARD_UI?.put(s,'selectionMode',mode);if(s==='nfl'){const el=$('#nflRecommendationTier');if(el){el.value=mode;el.dispatchEvent(new Event('change',{bubbles:true}));return}}refresh();}
function mount(){
 const controls=$('#parlayControls');if(!controls)return;
 let panel=$('#sharedSelection');
 if(!panel){panel=document.createElement('div');panel.id='sharedSelection';panel.className='shared-selection field';panel.innerHTML='<label for="sharedSelectionMode">Selection</label><select id="sharedSelectionMode"><option value="screened">Value</option><option value="ideas">Matchups</option><option value="likelihood">Win Chance</option></select><small id="selectionExplanation"></small>';controls.prepend(panel);panel.querySelector('select').addEventListener('change',e=>select(e.target.value));}
 const s=sport();panel.hidden=s==='nfl';panel.querySelector('select').value=window.DASHBOARD_UI?.get(s,'selectionMode','screened')||'screened';
 const descriptions={screened:'Estimated advantage after uncertainty adjustments.',ideas:'Matchup and role evidence. Price value may be unverified.',likelihood:'Estimated hit rate. Easier ALT lines may rank first.'};
 $('#selectionExplanation').textContent=descriptions[panel.querySelector('select').value];
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
 const empty=$('#results > .empty');
 if(empty&&!empty.querySelector('.empty-actions')){const actions=document.createElement('div');actions.className='empty-actions';
  if(Number($('#legsSelect')?.value)>2){const b=document.createElement('button');b.type='button';b.textContent='Try 2 legs';b.onclick=()=>{const el=$('#legsSelect');el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}))};actions.append(b)}
  if((s==='nfl'?window.NFL_PARLAY_STATE?.recommendationTier:panel.querySelector('select').value)==='screened'){const b=document.createElement('button');b.type='button';b.textContent='View Matchups';b.onclick=()=>select('ideas');actions.append(b)}
  if(actions.children.length)empty.append(actions);
 }
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;observer?.disconnect();mount();observe()})}
let observer;function observe(){observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sport']})}
function init(){observer=new MutationObserver(schedule);mount();observe();}
window.SELECTION_UI={select,refresh,labels,excluded,exclude,locked,lock,accepts};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else init();
})();
