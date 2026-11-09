(()=>{'use strict';
function rows(games,state,forecast){
 const scoped=state.mode==='sgp'?games.filter(g=>g.id===document.querySelector('#gameSelect')?.value):games;
 return scoped.flatMap(game=>(game.markets||[]).filter(m=>m.marketKey?.replace(/_alternate$/,'')==='player_pass_completions'&&window.NFL_ALT_LINES.matches(m,state.lineMode)).map(m=>({game,market:m,check:window.PICK_QUALITY.assess('nfl',m,forecast(m),{game,parlay:false})})))
  .sort((a,b)=>Number(b.check.pass)-Number(a.check.pass)||(b.check.rank||0)-(a.check.rank||0));
}
// Kept for existing render callers; completions no longer have a standalone panel.
function mount(){}
window.NFL_COMPLETIONS={rows,mount};
})();
