(()=>{'use strict';
const KEY='sportsBankrollBuilder:v1',C=window.BANKROLL_CORE,$=s=>document.querySelector(s),esc=s=>window.MARKET_GUARDS.esc(s);
const cash=n=>Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
let ledger={version:1,initialized:false,opening:0,bets:[],adjustments:[]},candidates=[],selected='',refreshed=0,notice='';
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===1&&Array.isArray(x.bets)&&Array.isArray(x.adjustments)&&C.validMoney(x.opening))ledger=x}catch{}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(ledger));return true}catch{notice='Browser storage unavailable. Nothing was recorded.';return false}}
function eventTime(row){return row.eventTime||row.market.game_time||row.market.start_time||row.market.close_time}
function id(row){return row.sport+'|'+(row.market.ticker||row.market.marketKey||row.market.label||'')+'|'+(row.market.quoteSide||row.market.side||'yes')}
function bestOf(rows){const now=new Date();return rows.filter(row=>C.today(eventTime(row),now)&&Date.parse(eventTime(row))>+now&&Number(row.forecast?.modelP)>.28&&Number(row.forecast?.modelP)<.85&&Number(row.forecast?.coverage)>=.2&&Number(row.forecast?.confidence)>=55)
  .filter(row=>!ledger.bets.some(b=>b.pickId===id(row)&&b.status!=='void'))
  .sort((a,b)=>{const score=x=>Math.max(0,C.ev(x.forecast.modelP,x.referenceOdds)||0)*20+Number(x.forecast.confidence)/100+Number(x.forecast.coverage)/4;return score(b)-score(a)}).slice(0,12)}
async function refresh(){const requestAt=Date.now();try{
 const [nfl,mlb,ufc,ncaaf]=await Promise.all([
  fetch('data/kalshi-nfl.json?ts='+requestAt,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
  window.MLB_DASHBOARD?.bankrollCandidates?.()||[],window.UFC_DASHBOARD?.bankrollCandidates?.()||[],window.NCAAF_DASHBOARD?.bankrollCandidates?.()||[]]);
 const rows=[];
 if(nfl&&window.MARKET_GUARDS.fresh(nfl,2)){
  window.NFL_MODEL_V3?.enrich?.();
  for(const g of window.NFL_PARLAY_STATE?.games||[]){if(g.game_status&&g.game_status!=='pre')continue;
   for(const m of g.markets||[]){if(!m.nflV3Actionable||Number(m.projectionCoverage)<.2||Number(m.modelConfidence)<55||m._invalidRoster||m.player&&!m._rosterVerified||!C.validOdds(m.price))continue;
    rows.push({sport:'nfl',market:{...m,label:m.name,game_time:g.commence_time,game_id:g.id,game_label:g.away+' at '+g.home},forecast:{modelP:m.modelProbability,confidence:m.modelConfidence,coverage:m.projectionCoverage},referenceOdds:m.price})}}
 }
 for(const row of [...mlb,...ufc,...ncaaf]){
  const ask=window.MARKET_GUARDS.quote(row.market);
  if(ask===null)continue;
  const odds=ask>=.5?Math.round(-100*ask/(1-ask)):Math.round(100*(1-ask)/ask);
  rows.push({...row,referenceOdds:odds});
 }
 candidates=bestOf(rows);refreshed=Date.now();
 if(!candidates.some(x=>id(x)===selected)){selected=candidates[0]?id(candidates[0]):'';const odds=$('#builderOdds');if(odds)odds.value=''}
 render();
 }catch{candidates=[];refreshed=0;notice='Markets could not be refreshed.';render()}}
function candidate(){return candidates.find(x=>id(x)===selected)}
function quote(){return $('#builderOdds')?.value?.trim()||''}
function calculate(){const row=candidate(),now=new Date();return row?C.suggestion({ledger,probability:Number(row.forecast.modelP),odds:quote(),eventTime:eventTime(row),now,ageMs:Date.now()-refreshed}):{stake:0,reason:'No qualifying pregame pick today. Pass.'}}
function chart(){let value=Number(ledger.opening)||0;const points=[value];
 const events=[...(ledger.adjustments||[]).map(x=>({at:x.at,delta:x.amount})),...(ledger.bets||[]).flatMap(b=>[{at:b.createdAt,delta:-b.stake},...(b.settledAt?[{at:b.settledAt,delta:b.returned}]:[])])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 for(const e of events){value+=Number(e.delta)||0;points.push(C.cents(value))}
 const recent=points.slice(-30),lo=Math.min(...recent),hi=Math.max(...recent),spread=Math.max(1,hi-lo);
 const path=recent.map((n,i)=>`${i? 'L':'M'}${(i/Math.max(1,recent.length-1)*280).toFixed(1)} ${(58-(n-lo)/spread*48).toFixed(1)}`).join(' ');
 return `<svg viewBox="0 0 280 64" role="img" aria-label="Bankroll change from ${cash(points[0])} to ${cash(points.at(-1))}"><path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`}
function render(){const root=$('#bankrollBuilder');if(!root)return;
 const {cash:balance,pending,profit}=C.balances(ledger),amount=$('#builderAmount'),input=$('#builderBankroll'),pick=$('#builderPick'),odds=$('#builderOdds');
 if(!input||!pick||!odds)return;
 if(document.activeElement!==input)input.value=ledger.initialized?balance.toFixed(2):'';
 const prev=pick.value;pick.replaceChildren();
 if(candidates.length)for(const row of candidates){const opt=new Option(row.sport.toUpperCase()+' · '+(row.market.label||row.market.name),id(row));pick.add(opt)}
 else pick.add(new Option('No qualified straight today',''));
 pick.value=candidates.some(x=>id(x)===selected)?selected:(prev&&candidates.some(x=>id(x)===prev)?prev:'');
 const row=candidate();
 $('#builderGame').textContent=row?(row.market.game_label||row.market.fight||'Upcoming event')+' · '+new Date(eventTime(row)).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'NFL · MLB · NCAAF · UFC checked. NCAAF is experimental and not stake eligible.';
 $('#builderEstimate').textContent=row?'Model '+Math.round(Number(row.forecast.modelP)*100)+'% · Kalshi reference '+(row.referenceOdds>0?'+':'')+row.referenceOdds+' · unvalidated estimate':'No bet is required today.';
 const s=calculate();amount.textContent=cash(s.stake);
 $('#builderReason').textContent=s.reason;
 $('#builderRecord').disabled=s.stake<.01;
 $('#builderBalance').textContent=ledger.initialized?cash(balance):'—';
 $('#builderMeta').textContent=ledger.initialized?`${cash(pending)} pending · ${cash(profit)} settled P/L · ${cash(Math.max(0,balance*.02-C.spentToday(ledger)))} daily budget left`:'Set your starting bankroll. Only recorded bets change it.';
 $('#builderNotice').textContent=notice;
 $('#builderTrend').innerHTML=ledger.initialized?chart():'';
 const list=$('#builderLog');list.innerHTML=ledger.bets.length?ledger.bets.slice(-8).reverse().map(b=>`<div class="builder-log-row"><span>${esc(b.sport.toUpperCase()+' · '+b.selection)}<small>${esc(b.event)} · ${cash(b.stake)} at ${b.odds>0?'+':''}${b.odds} · ${esc(b.status)}</small></span>${b.status==='pending'?`<span class="builder-settle"><button data-id="${esc(b.id)}" data-result="won">Win</button><button data-id="${esc(b.id)}" data-result="lost">Loss</button><button data-id="${esc(b.id)}" data-result="void">Void</button></span>`:''}</div>`).join(''):'<p class="builder-muted">No bets recorded yet.</p>';
}
function setBalance(){const input=$('#builderBankroll'),n=Number(input.value);if(!input.value.trim()||!C.validMoney(n)){notice='Enter a valid bankroll amount.';render();return}
 const current=C.balances(ledger).cash;
 const previous={initialized:ledger.initialized,opening:ledger.opening,adjustments:ledger.adjustments.length};
 if(!ledger.initialized){ledger.opening=C.cents(n);ledger.initialized=true}
 else {const delta=C.cents(n-current);if(!delta){render();return}ledger.adjustments.push({at:new Date().toISOString(),amount:delta})}
 if(!save()){ledger.initialized=previous.initialized;ledger.opening=previous.opening;ledger.adjustments.length=previous.adjustments;render();return}
 notice='Bankroll saved. Adjustments are kept in the history.';render();
}
function record(){const row=candidate(),s=calculate();if(!row||s.stake<.01){render();return}
 if(!confirm('Record a real '+cash(s.stake)+' bet at '+quote()+' on '+(row.market.label||row.market.name)+'?'))return;
 const b={id:crypto.randomUUID(),pickId:id(row),createdAt:new Date().toISOString(),sport:row.sport,event:row.market.game_label||row.market.fight||'Upcoming event',selection:row.market.label||row.market.name,start:eventTime(row),odds:Number(quote()),probability:row.forecast.modelP,stake:s.stake,status:'pending',returned:0};
 ledger.bets.push(b);if(!save()){ledger.bets.pop();render();return}notice='Bet recorded. Mark the result after it settles.';selected='';refresh();
}
function settle(id,status){if(!confirm('Mark this bet '+status+'?'))return;
 const row=ledger.bets.find(x=>x.id===id),old=row?{...row}:null;
 if(!C.settle(ledger,id,status))return;
 if(!save()){Object.assign(row,old);render();return}notice='Result saved.';render();
}
function download(){const file=new Blob([JSON.stringify(ledger,null,2)],{type:'application/json'}),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download='bankroll-bets-'+C.localDay(new Date())+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function mount(){load();const root=$('#bankrollBuilder');if(!root)return;
 root.addEventListener('click',e=>{if(e.target.closest('#builderSave'))setBalance();else if(e.target.closest('#builderRecord'))record();else if(e.target.closest('#builderRefresh'))refresh();else if(e.target.closest('#builderExport'))download();else if(e.target.closest('[data-result]')){const btn=e.target.closest('[data-result]');settle(btn.dataset.id,btn.dataset.result)}});
 root.addEventListener('change',e=>{if(e.target.id==='builderPick'){selected=e.target.value;$('#builderOdds').value='';render()}else if(e.target.id==='builderOdds')render()});
 root.addEventListener('input',e=>{if(e.target.id==='builderOdds'){const s=calculate();$('#builderAmount').textContent=cash(s.stake);$('#builderReason').textContent=s.reason;$('#builderRecord').disabled=s.stake<.01}});
 root.addEventListener('keydown',e=>{if(e.target.id==='builderBankroll'&&e.key==='Enter'){e.preventDefault();setBalance()}});
 render();setTimeout(refresh,2500);setTimeout(refresh,12000);setInterval(refresh,120000);
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
window.BANKROLL_BUILDER={refresh,ledger:()=>ledger,candidates:()=>candidates};
})();
