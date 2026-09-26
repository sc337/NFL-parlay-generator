(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=(data,maxHours=24)=>{const at=Date.parse(data?.updated_at||data?.generated_at||'');return Number.isFinite(at)&&at<=Date.now()+300000&&Date.now()-at<=maxHours*3600000};
const pregame=m=>{const t=Date.parse(m?.start_time||m?.game_time||'');return Number.isFinite(t)&&t>Date.now()&&(!m.close_time||Date.parse(m.close_time)>Date.now())};
const futureDated=m=>{const match=String(m?.event_ticker||'').match(/-(\d{2})([A-Z]{3})(\d{2})/);if(!match)return false;const t=Date.parse('20'+match[1]+'-'+({JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'}[match[2]]||'00')+'-'+match[3]+'T00:00:00Z');return Number.isFinite(t)&&t>Date.now()};
const quote=m=>{const ask=Number(m?.yes_ask);return Number.isFinite(ask)&&ask>0&&ask<1?ask:null};
const ev=(p,ask)=>Number.isFinite(p)&&Number.isFinite(ask)&&ask>0&&ask<1?p/ask-1:null;
const gameKey=m=>m.game_id||String(m.event_ticker||'').replace(/^[^-]+-/,'');
const unique=(rows,n)=>{const out=[],seen=new Set();for(const m of rows){const k=gameKey(m);if(!k||seen.has(k))continue;seen.add(k);out.push(m);if(out.length===n)break}return out};
// Only change market family when the candidate raises confidence and the
// caller confirms the full build still clears its evidence and value gates.
function improveTypes(selected,pool,{key=gameKey,family=m=>m.kind,confidence,valid=()=>true}){
 const result=selected.slice();
 for(let i=0;i<result.length;i++){
  const original=result[i],event=key(original),base=Number(confidence(original));
  if(!event||!Number.isFinite(base))continue;
  let best=original,bestConfidence=base;
  for(const candidate of pool){
   if(candidate===original||key(candidate)!==event||family(candidate)===family(original)||result.some((m,j)=>j!==i&&m===candidate))continue;
   const next=Number(confidence(candidate));
   if(!Number.isFinite(next)||next<=bestConfidence)continue;
   const trial=result.slice();trial[i]=candidate;
   if(valid(trial,i,original,candidate)){best=candidate;bestConfidence=next}
  }
  result[i]=best;
 }
 return result;
}
const estOdds=rows=>{let d=1;for(const m of rows){const ask=quote(m);if(ask===null)return null;d/=ask}return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1))};
function watchlist(rows,sport){const selected=unique(rows.filter(m=>m&&(m.label||m.title)&&quote(m)!==null).sort((a,b)=>(+b.volume||0)-(+a.volume||0)),8);
 if(!selected.length)return '<div class="empty">No current '+esc(sport)+' markets with available ask prices.</div>';
 return '<article class="parlay-card"><div class="parlay-top"><div><span class="grade">WATCHLIST</span><h3 class="parlay-name">'+esc(sport)+' markets to review</h3></div></div><p class="summary">Market prices only. No independent positive EV has been established. Check your book’s odds before betting.</p><div class="legs">'+selected.map((m,i)=>'<div class="leg"><div class="leg-title">'+(i+1)+'. '+esc(m.label||m.title)+'</div><div class="leg-sub">'+esc(m.game_label||m.fight||'Upcoming event')+' · Kalshi ask '+Math.round(quote(m)*100)+'¢ · Volume '+Math.round(+m.volume||0)+'</div></div>').join('')+'</div></article>'}
window.MARKET_GUARDS={esc,fresh,pregame,futureDated,quote,ev,gameKey,unique,improveTypes,estOdds,watchlist};})();
