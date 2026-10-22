(()=>{'use strict';
function rows(games,state,forecast){
 const scoped=state.mode==='sgp'?games.filter(g=>g.id===document.querySelector('#gameSelect')?.value):games;
 return scoped.flatMap(game=>(game.markets||[]).filter(m=>m.marketKey?.replace(/_alternate$/,'')==='player_pass_completions'&&window.NFL_ALT_LINES.matches(m,state.lineMode)).map(m=>({game,market:m,check:window.PICK_QUALITY.assess('nfl',m,forecast(m),{game,parlay:false})})))
  .sort((a,b)=>Number(b.check.pass)-Number(a.check.pass)||(b.check.rank||0)-(a.check.rank||0));
}
function mount(games,state,forecast){
 if(typeof document==='undefined')return;
 let panel=document.querySelector('#nflCompletionMarkets');
 if(!panel){panel=document.createElement('details');panel.id='nflCompletionMarkets';panel.className='nfl-prop-coverage';document.querySelector('#results')?.after(panel);}
 panel.hidden=(window.__ACTIVE_SPORT||'nfl')!=='nfl'||!state.selectedMarkets?.has('completions');if(panel.hidden)return;
 const report=rows(games,state,forecast),qualified=report.filter(x=>x.check.pass),esc=window.MARKET_GUARDS.esc;
 const open=panel.open;
 panel.innerHTML='<summary>Pass Completions · Straight only · '+qualified.length+' qualifying selections</summary><p>Your Caesars configuration excludes completions from parlays. These are paper-study straight candidates; confirm the exact sportsbook line and price.</p>'+(
 qualified.length?qualified.slice(0,8).map(({game,market:m,check})=>'<p><strong>'+esc(m.name)+'</strong> · '+esc(game.away+' at '+game.home)+' · '+esc(window.PICK_QUALITY.quoteLabel('nfl',m))+' · Experimental estimate '+Math.round(check.modelP*100)+'% · Not measured accuracy</p>').join(''):
 '<p>'+(report.length?'No completion lines pass the current checks. '+esc(report[0].check.reason||'No qualifying price.'):'No quoted completion lines match this game/date and line filter.')+'</p>');panel.open=open;
}
window.NFL_COMPLETIONS={rows,mount};
})();
