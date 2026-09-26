(()=>{'use strict';
const $=s=>document.querySelector(s),esc=s=>window.MARKET_GUARDS?.esc?.(s)??String(s||'');
let records=[],updated='',loaded=false;
const sports=['nfl','mlb','ncaaf','ufc'];
function mount(){
  const host=$('#moreAnalysis');if(!host||$('#calibrationPanel'))return;
  const panel=document.createElement('section');panel.id='calibrationPanel';panel.className='calibration-panel';
  panel.innerHTML='<div class="calibration-head"><span>PICK HISTORY</span><h3>Forecast check</h3></div><div id="calibrationBody" class="calibration-body">Loading tracked picks…</div>';
  host.appendChild(panel);
}
function summary(sport){
  const rows=records.filter(r=>r.sport===sport),settled=rows.filter(r=>['win','loss'].includes(r.result));
  const model=settled.filter(r=>r.forecastType==='model'),market=settled.filter(r=>r.forecastType==='market_only');
  const sample=model.length>=30?model:market,type=model.length>=30?'model':market.length>=30?'market baseline':null;
  if(!type)return '<div class="calibration-empty">'+rows.length+' tracked · '+settled.length+' settled. Collecting at least 30 settled forecasts of one type before rating them.</div>';
  const wins=sample.filter(r=>r.result==='win').length,n=sample.length;
  const mean=sample.reduce((sum,r)=>sum+Number(r.modelP),0)/n;
  const brier=sample.reduce((sum,r)=>sum+(Number(r.modelP)-(r.result==='win'?1:0))**2,0)/n;
  const baseline=sample.reduce((sum,r)=>sum+(Number(r.marketP)-(r.result==='win'?1:0))**2,0)/n;
  const bins=[[0,.4],[.4,.6],[.6,.8],[.8,1]].map(([lo,hi])=>{const part=sample.filter(r=>r.modelP>=lo&&r.modelP<(hi===1?1.001:hi));if(part.length<10)return'';return '<span>'+Math.round(lo*100)+'–'+Math.round(hi*100)+'%: '+Math.round(part.filter(r=>r.result==='win').length/part.length*100)+'% won ('+part.length+')</span>'}).filter(Boolean);
  return '<div class="calibration-metrics"><span>'+esc(type)+' · '+n+' settled</span><span>Forecast '+Math.round(mean*100)+'% · actual '+Math.round(wins/n*100)+'%</span><span>Brier '+brier.toFixed(3)+' · market '+baseline.toFixed(3)+'</span></div>'+(bins.length?'<div class="calibration-bins">'+bins.join('')+'</div>':'');
}
function render(){
  mount();const host=$('#calibrationBody');if(!host)return;
  const sport=window.__ACTIVE_SPORT||'nfl',rows=records.filter(r=>r.sport===sport).slice(-8).reverse();
  if(!loaded){host.textContent='Loading tracked picks…';return}
  const rules=window.MODEL_CALIBRATION?.rules?.(sport)||{},active=Object.entries(rules).filter(([,r])=>r.active);
  const learning=active.length?'<div class="calibration-empty">Model adjustment active for '+active.map(([group,r])=>esc(group)+' ('+r.trainingCount+' training, '+r.validationCount+' later events; Brier '+r.rawBrier+' → '+r.adjustedBrier+')').join(', ')+'. Rechecked after 20 new settled events in that market group.</div>':
    '<div class="calibration-empty">Model adjustment off · '+Math.max(0,...Object.values(rules).map(r=>r.distinctEvents||0))+' distinct settled model events in the largest market group. Each group needs 30 training and 20 later validation events, plus a measurable improvement.</div>';
  const table=rows.length?'<div class="history-table">'+rows.map(r=>'<div class="history-row"><div><strong>'+esc(r.selection)+'</strong><small>'+esc(r.event)+' · '+esc(r.market)+'</small></div><span>'+Math.round(Number(r.modelP)*100)+'% '+(r.forecastType==='model'?'model':'market')+'</span><b class="history-'+esc(r.result||'pending')+'">'+esc(r.result||'pending')+'</b></div>').join('')+'</div>':'<div class="calibration-empty">No pregame picks have been recorded for '+sport.toUpperCase()+' yet.</div>';
  host.innerHTML='<p>Saved pregame forecasts, settled from the original Kalshi contract. Market-only forecasts are kept separate from independent model picks.</p>'+learning+summary(sport)+table+'<small>Updated '+(updated?esc(new Date(updated).toLocaleString()):'pending')+' · Historical results describe past forecasts, not future certainty.</small>';
}
async function load(){try{const response=await fetch('data/pick-history.json?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error(response.status);const data=await response.json();records=Array.isArray(data.records)?data.records:[];updated=data.updated_at||'';loaded=true;render()}catch(e){loaded=true;mount();const host=$('#calibrationBody');if(host)host.textContent='Pick history is temporarily unavailable.'}}
function init(){mount();render();load();setInterval(load,10*60*1000)}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
window.PICK_HISTORY_REPORT={refresh:render,load};
})();
