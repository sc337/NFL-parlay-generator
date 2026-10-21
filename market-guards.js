(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=(data,maxHours=24)=>{const at=Date.parse(data?.updated_at||data?.generated_at||'');return Number.isFinite(at)&&at<=Date.now()+300000&&Date.now()-at<=maxHours*3600000};
const pregame=m=>{const t=Date.parse(m?.start_time||m?.game_time||'');return Number.isFinite(t)&&t>Date.now()&&(!m.close_time||Date.parse(m.close_time)>Date.now())};
const futureDated=m=>{const match=String(m?.event_ticker||'').match(/-(\d{2})([A-Z]{3})(\d{2})/);if(!match)return false;const t=Date.parse('20'+match[1]+'-'+({JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'}[match[2]]||'00')+'-'+match[3]+'T00:00:00Z');return Number.isFinite(t)&&t>Date.now()};
const quote=m=>{const ask=Number(m?.yes_ask);return Number.isFinite(ask)&&ask>0&&ask<1?ask:null};
const ev=(p,ask)=>Number.isFinite(p)&&Number.isFinite(ask)&&ask>0&&ask<1?p/ask-1:null;
const gameKey=m=>m.canonical_event_id|| (m.game_id!=null&&String(m.game_id)!==''?String(m.game_id):String(m.event_ticker||'').replace(/^[^-]+-/,''));
// Reconcile provider IDs only when matchup, start time and game number agree.
// Ambiguous identities remain separate; independence also checks close matchups.
const matchupKey=m=>String(m.game_label||m.fight||'').toLowerCase().replace(/\s+(?:at|vs\.?|@)\s+/g,'|').split('|').map(x=>x.replace(/[^a-z0-9]/g,'')).sort().join('|');
const startOf=m=>Date.parse(m.game_time||m.start_time||m.kickoff||'');
function sameEvent(a,b){
 if(gameKey(a)&&gameKey(a)===gameKey(b))return true;
 if((a.game_id??a.gameId)!=null&&(b.game_id??b.gameId)!=null&&String(a.game_id??a.gameId)===String(b.game_id??b.gameId))return true;
 if(a.event_ticker&&b.event_ticker&&String(a.event_ticker).replace(/^[^-]+-/,'')===String(b.event_ticker).replace(/^[^-]+-/,''))return true;
 const ka=matchupKey(a),kb=matchupKey(b),ta=startOf(a),tb=startOf(b);
 return ka.includes('|')&&ka===kb&&Number.isFinite(ta)&&Number.isFinite(tb)&&Math.abs(ta-tb)<=15*60000&&String(a.game_number||'')===String(b.game_number||'');
}
function reconcile(sport,rows){
 const groups=[];
 for(const m of rows){
  const group=groups.find(g=>sameEvent(g,m));
  if(group)m.canonical_event_id=group.canonical_event_id;
  else {m.canonical_event_id=m.canonical_event_id||(gameKey(m)?sport+':'+gameKey(m):'');groups.push(m);}
 }
 return rows;
}
function independent(rows){return rows.length>0&&rows.every((m,i)=>gameKey(m)&&!rows.slice(0,i).some(x=>sameEvent(x,m)));}
const unique=(rows,n)=>{const out=[],seen=new Set();for(const m of rows){const k=gameKey(m);if(!k||seen.has(k))continue;seen.add(k);out.push(m);if(out.length===n)break}return out};
// Optimize a complete independent-game build. Never reuse a game or a player,
// and penalize the weakest evidence instead of padding a requested leg count.
// Ranking policy, not a probability or fitted correlation. Penalize the weakest
// buffered estimate, missing evidence and repeated same-game scoring drivers.
function balancedPenalty(checks,markets=[]){
 if(!checks.length)return 0;
 const bounded=(x,fallback=0)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):fallback;
 const ps=checks.map(q=>bounded(q.conservativeP??q.modelP)),coverages=checks.map(q=>bounded(q.coverage));
 const weakest=Math.min(...ps),mean=ps.reduce((a,b)=>a+b,0)/ps.length;
 const drivers=new Map();let shared=0;
 for(const m of markets){
  const family=m.kind||m.type,key=gameKey(m)||m.gameId;if(!key)continue;
  const driver=['points','threes','assists','pra','total','totals'].includes(family)?'scoring':['passing','receiving','receptions'].includes(family)?'passing':family==='td'?'scoring':null;
  if(!driver)continue;
  const direction=['under','no'].includes(m.side)?'under':'over',group=key+'|'+driver+'|'+direction;
  const count=drivers.get(group)||0;shared+=count;drivers.set(group,count+1);
 }
 return 70*(1-weakest)+40*(1-Math.min(...coverages))+30*(mean-weakest)+6*shared;
}
function bestBuild(rows,n,assess,{balanced=false,acceptBuild=()=>true,diversityBonus=0}={}){
 if(!Number.isInteger(n)||n<2||n>4)return [];
 const perGame=new Map();
 const candidates=rows.map(m=>({m,q:assess(m)})).filter(x=>x.q?.pass&&Number.isFinite(x.q.rank)).sort((a,b)=>(Number(window.SELECTION_UI?.locked?.(window.__ACTIVE_SPORT,a.m))*-10000+Number(window.SELECTION_UI?.locked?.(window.__ACTIVE_SPORT,b.m))*10000)||b.q.rank-a.q.rank||String(a.m.selection_id||a.m.ticker).localeCompare(String(b.m.selection_id||b.m.ticker))).filter(({m})=>{const key=gameKey(m),n=perGame.get(key)||0;if(n>=4)return false;perGame.set(key,n+1);return true}).slice(0,120);
 let beams=[{legs:[],checks:[],score:0,minCoverage:1}];
 for(let i=0;i<n;i++){
  const next=[];
  for(const b of beams)for(const {m,q} of candidates){
   if(b.legs.some(x=>sameEvent(x,m)||m.player&&x.player===m.player)||!gameKey(m))continue;
   const legs=[...b.legs,m],minCoverage=Math.min(b.minCoverage,q.coverage||0),score=b.score+q.rank+(window.SELECTION_UI?.locked?.(window.__ACTIVE_SPORT,m)?10000:0);
   const checks=[...b.checks,q];if(legs.length===n&&!acceptBuild(legs,checks))continue;
   next.push({legs,checks,score,minCoverage,objective:score-(balanced?balancedPenalty(checks,legs):12*(1-minCoverage))+diversityBonus*new Set(legs.map(x=>x.kind||x.type)).size,signature:legs.map(x=>x.selection_id||x.ticker).sort().join('|')});
  }
  const seen=new Set();beams=next.sort((a,b)=>b.objective-a.objective||a.signature.localeCompare(b.signature)).filter(b=>{if(seen.has(b.signature))return false;seen.add(b.signature);return true}).slice(0,64);
  if(!beams.length)return [];
 }
 return beams.find(b=>!window.SELECTION_UI?.accepts||window.SELECTION_UI.accepts(window.__ACTIVE_SPORT,b.legs))?.legs||[];
}
// Only change market family when the candidate raises confidence and the
// caller confirms win probability, evidence, and value are not reduced.
function improveTypes(selected,pool,{key=gameKey,family=m=>m.kind,confidence,valid=()=>true}){
 const result=selected.slice();
 for(let i=0;i<result.length;i++){
  const original=result[i],event=key(original),base=Number(confidence(original));
  if(window.SELECTION_UI?.locked?.(window.__ACTIVE_SPORT,original))continue;
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
const estOdds=rows=>{if(!independent(rows))return null;let d=1;for(const m of rows){const ask=quote(m);if(ask===null)return null;d/=ask}return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1))};
function watchlist(rows,sport){const selected=unique(rows.filter(m=>m&&(m.label||m.title)&&quote(m)!==null).sort((a,b)=>(+b.volume||0)-(+a.volume||0)),8);
 if(!selected.length)return '<div class="empty">No current '+esc(sport)+' markets with available ask prices.</div>';
 return '<article class="parlay-card"><div class="parlay-top"><div><span class="grade">WATCHLIST</span><h3 class="parlay-name">'+esc(sport)+' markets to review</h3></div></div><p class="summary">Market prices only. No independent positive EV has been established. Check your book’s odds before betting.</p><div class="legs">'+selected.map((m,i)=>'<div class="leg"><div class="leg-title">'+(i+1)+'. '+esc(m.label||m.title)+'</div><div class="leg-sub">'+esc(m.game_label||m.fight||'Upcoming event')+' · '+esc(window.PICK_QUALITY?.quoteLabel(sport.toLowerCase(),m)||'Reference price')+(m.referenceOnly?'':' · Volume '+Math.round(+m.volume||0))+'</div></div>').join('')+'</div></article>'}
window.MARKET_GUARDS={esc,fresh,pregame,futureDated,quote,ev,gameKey,sameEvent,reconcile,independent,unique,bestBuild,balancedPenalty,improveTypes,estOdds,watchlist};})();
