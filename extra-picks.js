(()=>{'use strict';
let host;
const esc=value=>window.MARKET_GUARDS.esc(String(value??''));
function key(m){return [m.selection_id||m.ticker||[m.game_id||m.gameId||m.event_ticker||m.kickoff||'',m.marketKey||m.kind||m.type].join(':'),m.player||'',m.team||'',m.side||'',m.point??m.line??'',m.label||m.name||''].join('|')}
function choose(s,rows,selected=[]){
 const exposure=m=>m.player?[m.canonical_event_id||m.game_id||m.gameId||m.event_ticker,m.player].join('|'):m.game_id||m.gameId||m.event_ticker?[m.canonical_event_id||m.game_id||m.gameId||m.event_ticker,m.team||'',m.kind||m.marketKey||m.type].join('|'):key(m);
 const seen=new Set(selected.map(key)),exposures=new Set(selected.map(exposure));
 return (rows||[]).filter(r=>r.market).map(row=>({...row,quality:window.PICK_QUALITY?.assess(s,row.market,row.forecast||{},{game:row.game})})).filter(r=>r.quality?.pass).sort((a,b)=>b.quality.rank-a.quality.rank||key(a.market).localeCompare(key(b.market))).filter(row=>{const m=row.market,k=key(m),e=exposure(m);if(seen.has(k)||exposures.has(e))return false;seen.add(k);exposures.add(e);return true}).slice(0,2);
}
function clear(){window.PICK_DETAILS_SHEET?.close?.();if(host){host.hidden=true;host.replaceChildren()}}
function show(s,options={}){
 if((window.__ACTIVE_SPORT||'nfl')!==s)return;
 if(document.body.classList.contains('prediction-only')){clear();return}
 const rows=choose(s,options.rows,options.selected);
 if(!host){host=document.createElement('section');host.id='extraPicks';host.className='extra-picks';document.querySelector('#results')?.after(host)}
 clear();if(!rows.length)return;host.hidden=false;
 const html=rows.map(({market:m,quality:q,game})=>{
  const time=m.game_time||m.start_time||m.kickoff||game?.commence_time;
  const when=time?new Date(time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'';
  const event=options.event?.(m)||m.game_label||m.gameLabel||m.fight||'';
  const straight=s==='nfl'&&window.NFL_PARLAY_ELIGIBILITY&&!window.NFL_PARLAY_ELIGIBILITY.isParlayEligible(m);
  return '<article class="extra-pick"><div class="extra-pick-head">'+(options.media?.(m)||'')+'<div><h3>'+esc(options.label?.(m)||m.label||m.name)+'</h3><p>'+esc([event,when].filter(Boolean).join(' · '))+'</p></div></div><div class="extra-pick-price" data-caesars-extra-id="'+esc(window.CAESARS_COMPARE?.register(s,m)||'')+'">'+esc(window.PICK_QUALITY.quoteLabel(s,m))+'</div><p class="extra-pick-note">'+esc([s==='nfl'?window.NFL_MODEL_V3?.propSummary?.(game,m):'',straight?'Straight only':'Individual suggestion',window.PICK_QUALITY.evidence?.(s,m,options.rows?.find(r=>r.market===m)?.forecast||{},game)?.tier||'',...q.warnings].join(' · '))+'</p></article>';
 }).join('');
 host.innerHTML='<details class="extra-picks-details"><summary>Straight alternatives <span>'+rows.length+'</span></summary><p>Other qualifying suggestions for your current filters. Each is an individual pick; combining them requires separate parlay checks.</p>'+(html||'<p class="extra-picks-empty">No additional picks meet the current quality checks. Try another date or market.</p>')+'</details>';
}
window.EXTRA_PICKS={show,clear,choose,key};
})();
