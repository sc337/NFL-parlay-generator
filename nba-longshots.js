// A separate research shortlist. Never feeds the straight or parlay builders.
(()=>{'use strict';
const labels={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'Threes',pra:'Pts + Reb + Ast'};
let host;
function choose(rows,context,model){
 const Q=window.PICK_QUALITY,seen=new Set(),candidates=[];
 for(const m of rows||[]){
  if(!m.player||!labels[m.kind]||!['yes','over'].includes(m.side)||!Number.isFinite(m.line)||m.line%1!==.5||m.game_status!=='pre'||m._invalidRoster||m.context_unmatched)continue;
  const player=context.players?.[String(m.player_id)],start=Date.parse(m.game_time),now=Date.now();
  if(!player?.availability_checked||!Number.isFinite(start)||start<=now)continue;
  const fields=m.kind==='pra'?['points','rebounds','assists']:[m.kind];
  const history=(player.games||[]).filter(r=>fields.every(k=>Number.isFinite(r[k]))&&r.team===m.team_code&&[2,3].includes(r.season_type)&&r.minutes>0&&Date.parse(r.date)<Math.min(now,start)&&Date.parse(r.date)>start-240*86400000);
  if(history.length<8)continue;
  const f=model(m);if(!f||f.marketAnchored||!Number.isFinite(f.projectedLine)||f.modelP<.20||f.modelP>.45||f.projectedMinutes<24||f.roleStability<.75)continue;
  const q=Q.assess('nba',m,f,{longshotResearch:true});
  if(!q.pass||q.coverage<.5||q.conservativeP<.12||!Number.isFinite(q.minimumOdds))continue;
  const unpriced=window.NBA_PROP_TARGETS?.isTarget(m)===true;
  // Quotes must clear the same selection buffer. Unpriced targets cannot claim value.
  if(!unpriced&&!q.pricePass)continue;
  const key=[m.game_id,m.player_id,m.kind,m.line].join('|');if(seen.has(key))continue;seen.add(key);
  const changed=f.roleChange?.status==='rising',why=changed?'Recent minutes increased; opportunity scenarios checked':'Stable minutes and verified same-team production';
  candidates.push({market:m,forecast:f,quality:q,unpriced,sample:Math.min(history.length,12),why,rank:(unpriced?0:20)+q.coverage*20+f.roleStability*10+q.conservativeP*20});
 }
 const players=new Set();return candidates.sort((a,b)=>b.rank-a.rank||String(a.market.selection_id||a.market.ticker).localeCompare(String(b.market.selection_id||b.market.ticker))).filter(x=>{const key=x.market.player_id;if(players.has(key))return false;players.add(key);return true}).slice(0,3);
}
function clear(){if(host){host.hidden=true;host.replaceChildren()}}
function show({rows,context,model,media=()=>''}){
 if(window.__ACTIVE_SPORT!=='nba'){clear();return}
 const picks=choose(rows,context,model),esc=window.MARKET_GUARDS.esc;
 if(!host){host=document.createElement('section');host.id='nbaLongshots';document.querySelector('#results')?.after(host)}
 const open=!!host.querySelector('details')?.open;host.hidden=false;
 host.innerHTML='<details class="longshots-panel"'+(open?' open':'')+'><summary>Longshots <span>'+picks.length+' candidates</span></summary><p class="longshots-intro">Experimental individual research targets · Higher variance. No verified advantage or combined parlay probability.</p>'+(picks.length?picks.map(({market:m,forecast:f,quality:q,unpriced,sample,why})=>'<article class="longshot-pick"><div class="longshot-heading">'+media(m)+'<div><h3>'+esc(m.player)+'</h3><strong>'+esc((m.line+.5)+'+ '+labels[m.kind])+'</strong><p>'+esc(m.game_label)+'</p></div></div><div class="longshot-metrics"><span>Est. '+Math.round(f.modelP*100)+'%</span><span>Buffered '+Math.round(q.conservativeP*100)+'%</span><span>Proj. '+f.projectedLine.toFixed(1)+'</span></div><p>'+esc(why)+' · '+sample+' games · '+Math.round(f.projectedMinutes)+' projected minutes</p><p class="longshot-price">'+esc(unpriced?'Unpriced target · Availability and value unchecked':QLabel(m))+'</p><p class="longshot-threshold">Model price threshold '+esc((q.minimumOdds>0?'+':'')+q.minimumOdds)+' or better · Same exact line</p><small>'+esc(q.context?.starterEvidence?.lineupLabel||'Confirm participation before tipoff')+' · Estimates are unvalidated.</small></article>').join(''):'<p class="longshots-empty">No qualifying longshots for the selected date and matchup.</p>')+'</details>';
}
function QLabel(m){return window.PICK_QUALITY.quoteLabel('nba',m)}
window.NBA_LONGSHOTS={choose,show,clear};
// Clear promptly on navigation, even when the next sport has not loaded yet.
if(typeof MutationObserver!=='undefined'&&document.body)new MutationObserver(()=>{if(window.__ACTIVE_SPORT!=='nba')clear()}).observe(document.body,{attributes:true,attributeFilter:['data-sport']});
})();
