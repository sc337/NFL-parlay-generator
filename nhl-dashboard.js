(()=>{'use strict';
const G=window.MARKET_GUARDS,$=s=>document.querySelector(s),PROPS=['goals','assists','points','shots','saves'];
let markets=[],context=null,legs=2,generation=0,lastLoaded=0,lastStatus='',snapshotAt='',loadSequence=0,modelCache=new Map(),modelTick=0;
function eligible(m){const prop=PROPS.includes(m.kind),ask=G.quote(m);return ['moneyline','spread','total',...PROPS].includes(m.kind)&&(!prop||m.player_verified===true)&&m.game_status==='pre'&&G.pregame(m)&&!!m.game_id&&ask!==null&&Number.isFinite(m.yes_bid)&&m.yes_bid>0&&m.yes_bid<=ask&&Number.isFinite(m.spread)&&m.spread>=0&&m.spread<=(prop?.10:.08)&&Number(m.volume)>=(prop?25:100)&&ask>=(prop?.10:.35)&&ask<=.85}
function quality(m){return Math.round(Math.max(0,Math.min(99,65+Math.min(20,Math.log10((+m.volume||0)+1)*4)-(+m.spread||0)*180)))}
function fresh(){return !!lastLoaded&&G.fresh({updated_at:snapshotAt},2)}
function model(m){const tick=Math.floor(Date.now()/30000);if(tick!==modelTick){modelTick=tick;modelCache.clear()}if(!modelCache.has(m))modelCache.set(m,window.NHL_MODEL?.estimate?.(m,context)||null);return modelCache.get(m)}
function score(m){const f=model(m);return f?.modelP!=null?f.modelP*70+quality(m)*.3:quality(m)*.6}
function ranked(rows){return rows.sort((a,b)=>score(b)-score(a)||(+b.volume||0)-(+a.volume||0)||String(a.selection_id).localeCompare(String(b.selection_id)))}
function pool(){if(!fresh())return [];return ranked(markets.filter(eligible).filter(m=>{const f=model(m);return !f||f.modelP>=.4&&f.modelP<=.9}))}
function propPool(){if(!fresh())return [];return ranked(markets.filter(m=>PROPS.includes(m.kind)&&eligible(m)).filter(m=>{const f=model(m);return !f||f.modelP>=.15&&f.modelP<=.9}))}
function media(m){return window.SPORT_MEDIA?.nhl?.(m)||''}
function note(m){const f=model(m);if(!f)return 'Market only · No independent estimate'+(m.kind==='saves'?' · Starter unconfirmed':'');const projection=f.projectedLine!=null?' · Proj. '+f.projectedLine.toFixed(1):f.projectedAway!=null?' · Proj. '+f.projectedAway.toFixed(1)+'–'+f.projectedHome.toFixed(1):'';return 'Experimental estimate '+Math.round(f.modelP*100)+'%'+projection+(m.player?' · If playing':' · Goalies unconfirmed')}
function row(m,i){return '<div class="leg sport-visual-leg" data-event-time="'+G.esc(m.game_time)+'" data-matchup="'+G.esc(m.game_label)+'">'+media(m)+'<div class="sport-visual-copy"><div class="leg-title">'+(i!=null?(i+1)+'. ':'')+G.esc(m.label)+'</div><div class="leg-sub">'+G.esc(m.game_label)+' · '+G.esc(note(m))+(m.season_type===1?' · Preseason':'')+'</div></div><div class="leg-quote">Kalshi '+Math.round(G.quote(m)*100)+'¢</div></div>'}
function card(rows){const odds=G.estOdds(rows),fmt=o=>o>0?'+'+o:String(o),modeled=rows.filter(m=>model(m)),all=modeled.length===rows.length;return '<article class="parlay-card"><div class="parlay-top"><div><span class="grade">'+(modeled.length?'EXPERIMENTAL':'MARKET ONLY')+'</span><h3 class="parlay-name">Balanced '+rows.length+'-Leg</h3></div><div class="odds-wrap"><span class="odds-label">Price est.</span><div class="odds">'+(odds===null?'—':fmt(odds))+'</div></div></div><p class="summary">'+(modeled.length?'Independent NHL stats projections; experimental and unvalidated. '+(all?'':'Some legs use market quotes only. '):'Market quotes only. No independent estimate. ')+'One leg per game. Price estimate uses Kalshi asks, excludes fees and may differ from your book.'+(rows.some(m=>m.player)?' Confirm player participation.':'')+(rows.some(m=>m.season_type===1)?' Preseason: confirm lineups.':'')+'</p><div class="legs">'+rows.map(row).join('')+'</div><div class="card-footer"><span>'+(modeled.length?'Experimental model · '+modeled.length+'/'+rows.length+' legs covered':'Quote quality '+Math.round(rows.reduce((v,m)=>v+quality(m),0)/rows.length)+'/100 · Not win chance')+'</span><span>Distinct matchups</span></div></article>'}
function propsCard(){const seen=new Set(),rows=propPool().filter(m=>{if(seen.has(m.player_id))return false;seen.add(m.player_id);return true}).slice(0,4);if(!rows.length)return '<div class="empty">No qualifying NHL player props · Pass.</div>';return '<article class="parlay-card"><div class="parlay-top"><div><span class="grade">PLAYER PROPS</span><h3 class="parlay-name">NHL Props</h3></div></div><p class="summary">'+(rows.length?'Goals, assists and points where quoted. Projections assume the player participates; verify your book’s line.':'No qualifying player props · Pass.')+'</p><div class="legs">'+rows.map(m=>row(m,null)).join('')+'</div></article>'}
function render(){
 if(window.__ACTIVE_SPORT!=='nhl')return;
 if(lastLoaded&&!fresh()){$('#dataStatus').textContent='NHL feed stale';window.PICK_OF_DAY?.show?.('nhl');$('#resultsTitle').textContent='NHL Recommendations';$('#results').innerHTML='<div class="empty">NHL feed stale · Refresh markets.</div>';window.PARLAY_GENERATOR?.syncLabel?.();return}
 window.SPORT_LEGS?.mount?.('nhl',legs,n=>{legs=n;render()});
 const ranked=pool(),today=ranked.find(m=>window.PICK_OF_DAY?.today?.(m.game_time));
 window.PICK_OF_DAY?.show?.('nhl',today&&{market:today,eventTime:today.game_time,label:today.label,event:today.game_label,media:media(today),note:note(today)});
 const games=G.unique(ranked,Infinity),covered=ranked.filter(m=>model(m)).length;
 lastStatus='Kalshi NHL · '+games.length+' qualified games · '+(covered?'Experimental NHL model':'Market only');$('#dataStatus').textContent=lastStatus;
 const start=games.length?generation%games.length:0,rotated=games.slice(start).concat(games.slice(0,start)),selected=rotated.slice(0,legs);
 $('#resultsTitle').textContent='NHL Recommendations';
 $('#results').innerHTML=(selected.length===legs&&G.independent(selected)?card(selected):'<div class="empty">'+(games.length?games.length+' of '+legs+' games qualify · Try fewer legs.':'No qualifying NHL picks · Pass.')+'</div>')+propsCard();
 window.PARLAY_GENERATOR?.syncLabel?.();
}
async function load(){
 const token=window.__SPORT_TOKEN,request=++loadSequence;
 if(window.__ACTIVE_SPORT==='nhl')$('#results').innerHTML='<div class="empty">Loading NHL markets…</div>';
 try{
  const contextRequest=fetch('data/nhl-context.json?ts='+Date.now(),{cache:'no-store'}).then(res=>res.ok?res.json():null).catch(()=>null);
  const res=await fetch('data/kalshi-nhl.json?ts='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('NHL feed unavailable');
  const data=await res.json(),ctx=await contextRequest;
  if(data.status==='initializing')throw Error('NHL feed initializing');if(!G.fresh(data,2))throw Error('NHL feed stale');if(!Array.isArray(data.markets))throw Error('Invalid NHL feed');
  if(window.__ACTIVE_SPORT!=='nhl'||window.__SPORT_TOKEN!==token||request!==loadSequence)return;
  markets=data.markets;context=ctx;modelCache.clear();snapshotAt=data.updated_at;lastLoaded=Date.now();window.FEED_FRESHNESS?.set?.('nhl',snapshotAt);render();window.COMPACT_UI?.refresh?.();
 }catch(error){
  if(window.__ACTIVE_SPORT!=='nhl'||window.__SPORT_TOKEN!==token||request!==loadSequence)return;
  markets=[];context=null;lastLoaded=0;$('#dataStatus').textContent=String(error.message||'NHL feed unavailable');window.PICK_OF_DAY?.show?.('nhl');$('#resultsTitle').textContent='NHL Recommendations';$('#results').innerHTML='<div class="empty">'+G.esc(error.message||'NHL feed unavailable')+' · Refresh shortly.</div>';window.COMPACT_UI?.refresh?.();
 }
}
function showCached(){if(!lastLoaded||Date.now()-lastLoaded>60000||!fresh())return false;render();window.COMPACT_UI?.refresh?.();return true}
function historyPicks(){const m=pool().find(m=>window.PICK_OF_DAY?.today?.(m.game_time));return m?[{market:m,forecast:model(m)||{}}]:[]}
window.setInterval?.(()=>{if(window.__ACTIVE_SPORT==='nhl'&&lastLoaded){render();window.COMPACT_UI?.refresh?.()}},30000);
window.NHL_DASHBOARD={load,render,showCached,eligible,quality,model,historyPicks,availableCount:()=>lastLoaded?G.unique(pool(),Infinity).length:null,setLegs:n=>{legs=Math.max(2,Math.min(6,Number(n)||2));generation++;render();window.COMPACT_UI?.refresh?.()}};
})();
