(()=>{'use strict';
const $=s=>document.querySelector(s);
function emptyMessage(report,count,state){
 if(!report)return '';
 const mode={screened:'Value',ideas:'Matchups',likelihood:'Win Chance'}[state.recommendationTier]||'Value';
 const lead='No '+count+'-leg '+mode+' build. ';
 if(!report.checked)return lead+'No selections for this date and filters. Try Next slate.';
 if(state.requirePlayerProp&&!report.eligible?.some(x=>x.market?.player))return lead+'No player prop passed. Review the exclusions or choose another game.';
 const n=report.eligible?.length||0;
 if(n)return lead+(n<count?'Only '+n+' selection'+(n===1?'':'s')+' passed. ':'The eligible legs cannot form this build. ')+(count>2?'Try fewer legs.':state.lineMode==='standard'?'Try Standard + ALT in Filters.':'Choose another game or review Filters.');
 const reason=report.reasons?.[0]?.[0]||'No selections passed the checks';
 return lead+reason+'. '+(/uncertainty buffer|50%/.test(reason)&&state.lineMode==='standard'?'Try Standard + ALT in Filters.':'Review the exclusions or choose another game.');
}
function mount(){
 const controls=$('#parlayControls'),tier=$('#nflRecommendationTierWrap'),markets=$('#nflMarketFilters');
 if(!controls||!tier||!markets)return;
 const main=document.createElement('div');main.id='nflMainControls';main.className='nfl-main-controls';
 const mode=document.createElement('div');mode.className='field nfl-game-mode';
 const label=document.createElement('span');label.className='nfl-control-label';label.textContent='Game mode';mode.append(label);
 const tabs=$('.mode-tabs');if(tabs)mode.append(tabs);
 main.append(mode,tier);const game=$('#gameChooserWrap');if(game)main.append(game);
 controls.prepend(main);
 const filters=document.createElement('details');filters.id='nflParlayFilters';filters.className='nfl-parlay-filters';filters.innerHTML='<summary>Filters</summary><div class="nfl-filter-content"></div>';
 const content=filters.querySelector('div'),lines=$('#nflLinesWrap'),required=$('#nflRequireProp')?.closest('label');
 if(lines)content.append(lines);if(required)content.append(required);
 markets.open=true;content.append(markets);main.after(filters);
 const quality=$('.quality-settings'),home=$('.parlay-options-row');
 function sync(){
  const nfl=(window.__ACTIVE_SPORT||'nfl')==='nfl';main.hidden=filters.hidden=!nfl;
  if(quality){const target=nfl?main:home;if(target&&quality.parentElement!==target)target.append(quality);}
 }
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-sport']});sync();
}
window.NFL_PARLAY_UI={emptyMessage};
if(typeof document!=='undefined'){
 const ready=()=>setTimeout(mount,0);
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ready,{once:true}):ready();
}
})();
