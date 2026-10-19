(()=>{'use strict';
const $=s=>document.querySelector(s);const savedLines=window.DASHBOARD_UI?.get('nba','lines','both');let markets=[],context={},snapshotAt=null,loaded=0,sequence=0,lineMode=['standard','alt','both'].includes(savedLines)?savedLines:'both';
const G=window.MARKET_GUARDS,Q=window.PICK_QUALITY,esc=G.esc;
let buildMode=window.DASHBOARD_UI?.get('nba','mode','multi')==='sgp'?'sgp':'multi',selectedGame=window.DASHBOARD_UI?.get('nba','game','')||'';
function compatible(a,b){
 if(!a.game_id||String(a.game_id)!==String(b.game_id))return false;
 if(a.selection_id&&a.selection_id===b.selection_id||a.ticker&&a.ticker===b.ticker)return false;
 if(a.player&&b.player&&(a.player_id&&String(a.player_id)===String(b.player_id)||a.player.trim().toLowerCase()===b.player.trim().toLowerCase()))return false;
 const side=m=>['moneyline','spread'].includes(m.kind);
 return !(side(a)&&side(b)||a.kind==='total'&&b.kind==='total');
}
function compatibleSet(legs){
 if(!legs.length||legs.some((a,i)=>legs.slice(i+1).some(b=>!compatible(a,b))))return false;
 const under=legs.find(m=>m.kind==='total'&&['no','under'].includes(m.side));
 if(under&&Number.isFinite(under.line)){
  const minimum=legs.filter(m=>m.kind==='points'&&['yes','over'].includes(m.side)&&Number.isFinite(m.line)).reduce((sum,m)=>sum+Math.floor(m.line)+1,0);
  if(minimum>=under.line)return false;
 }
 return true;
}
function buildSameGame(rows,n,assess){
 if(!Number.isInteger(n)||n<2||n>4)return [];
 const groups=new Map(),candidates=rows.map(m=>({m,q:assess(m)})).filter(x=>x.q?.pass&&Number.isFinite(x.q.rank))
  .sort((a,b)=>b.q.rank-a.q.rank||String(a.m.selection_id||a.m.ticker).localeCompare(String(b.m.selection_id||b.m.ticker)))
  .filter(({m})=>{const key=m.player_id||m.player||(['moneyline','spread'].includes(m.kind)?'team-side':m.kind),count=groups.get(key)||0;groups.set(key,count+1);return count<6}).slice(0,80);
 let beams=[{legs:[],score:0,minCoverage:1}];
 for(let i=0;i<n;i++){
  const next=[];
  for(const beam of beams)for(const {m,q} of candidates){
   const legs=[...beam.legs,m];if(!compatibleSet(legs))continue;
   const minCoverage=Math.min(beam.minCoverage,q.coverage||0),score=beam.score+q.rank;
   next.push({legs,minCoverage,score,objective:score-12*(1-minCoverage),signature:legs.map(x=>x.selection_id||x.ticker).sort().join('|')});
  }
  const seen=new Set();beams=next.sort((a,b)=>b.objective-a.objective||a.signature.localeCompare(b.signature)).filter(b=>{if(seen.has(b.signature))return false;seen.add(b.signature);return true}).slice(0,64);
  if(!beams.length)return [];
 }
 return beams[0].legs;
}
function model(m){const f=window.NBA_MODEL.estimate(m,context);return f?Q.forecast('nba',m,f):null}
function eligible(m,featured=false){const f=model(m);return !!f&&G.pregame(m)&&m.game_status==='pre'&&(m.referenceOnly||(Number(m.volume)>=50&&Number.isFinite(m.spread)&&m.spread>=0&&m.spread<=.08))&&window.SPORT_MARKETS.allowed('nba',m)&&window.NBA_ALT_LINES.allowed(m,lineMode)&&Q.assess('nba',m,f,{featured,parlay:!featured}).pass}
function ranked(){return markets.filter(m=>eligible(m)).sort((a,b)=>Q.assess('nba',b,model(b)).rank-Q.assess('nba',a,model(a)).rank||String(a.selection_id).localeCompare(String(b.selection_id)))}
function media(m){const team=(m.teams||[]).find(t=>t.code===m.team_code);return (m.headshot?'<img class="sport-photo" src="'+esc(m.headshot)+'" alt="'+esc(m.player)+' headshot">':'')+(team?.logo?'<img class="sport-logo" src="'+esc(team.logo)+'" alt="'+esc(team.short)+' logo">':'')}
function note(m){return Q.note('nba',m,model(m)||{})}
function leg(m,i){const f=model(m),q=Q.quoteLabel('nba',m);return '<div class="leg sport-visual-leg" data-event-time="'+esc(m.game_time)+'" data-alt-line="'+(m.isAltLine?'true':'false')+'" data-matchup="'+esc(m.game_label)+'">'+media(m)+'<div class="sport-visual-copy"><div class="leg-title">'+(i+1)+'. '+esc(m.label)+(m.isAltLine?' <span class="alt-tag">ALT</span>':'')+'</div><div class="leg-sub">'+esc(m.game_label)+' · Experimental estimate '+Math.round(f.modelP*100)+'%'+(f.projectedLine!=null?' · Projected '+f.projectedLine.toFixed(1):'')+'</div><div class="leg-reason">'+esc(f.method)+' · '+esc(note(m))+'</div></div><div class="leg-quote">'+esc(q)+'</div></div>'}
function render(){
 if(window.__ACTIVE_SPORT!=='nba')return;
 window.EXTRA_PICKS?.clear?.();Q.prepare('nba',markets,context,[],snapshotAt);
 window.SPORT_MARKETS.sync('nba',markets,render);controls();
 const count=window.DASHBOARD_UI?.get('nba','legs',2)||2,pool=ranked(),sgp=buildMode==='sgp';
 const scoped=sgp?pool.filter(m=>String(m.game_id)===selectedGame):pool;
 const straight=pool.find(m=>eligible(m,true)&&(window.SLATE_UI?window.SLATE_UI.matches('nba',m):window.PICK_OF_DAY?.today?window.PICK_OF_DAY.today(m.game_time):new Date(m.game_time).toDateString()===new Date().toDateString()));
 const assess=m=>Q.assess('nba',m,model(m),{parlay:true});
 const build=sgp?buildSameGame(scoped,count,assess):G.bestBuild(scoped,count,assess);
 const complete=build.length===count&&(sgp?compatibleSet(build):G.independent(build)),entries=complete?build.map(m=>({market:m,forecast:model(m)})):[];
 window.PICK_OF_DAY?.show('nba',straight&&{market:straight,eventTime:straight.game_time,label:straight.label,event:straight.game_label,media:media(straight),note:note(straight)});
 $('#resultsTitle').textContent='NBA Recommendations';
 $('#dataStatus').textContent='NBA · '+G.unique(pool,Infinity).length+' qualified games · Experimental';
 $('#modeTitle').textContent=sgp?'NBA Same Game Parlay':'NBA Multi-Game Parlay';
 window.RECOMMENDATION_CAPTURE?.('nba',{mode:buildMode,profile:'best',requestedLegs:count,legs:entries});
 const odds=complete&&!sgp?Q.estimateOdds('nba',build):null;
 const summary=sgp?'One matchup; related outcomes can move together. Verify the combined SGP price at your sportsbook. Joint win probability is unavailable.':'One leg per game. Pace, efficiency and minutes-based estimates are unvalidated. Confirm availability and your sportsbook price.';
 const empty=!markets.length?'No upcoming NBA quotes available.':sgp&&!selectedGame?'No upcoming NBA games for the selected date.':markets.some(m=>m.season_type===1)?'NBA preseason · Rotation uncertainty; no model-qualified picks.':'No qualifying NBA '+(lineMode==='alt'?'ALT ':'')+(sgp?'same-game':'multi-game')+' build · Check availability, selected date, line filter, or try fewer legs.';
 $('#results').innerHTML=complete?'<article class="parlay-card"><div class="parlay-top"><div><span class="grade">EXPERIMENTAL</span><h3 class="parlay-name">NBA '+(sgp?'Same Game':'Multi-Game')+' · '+count+' legs</h3></div><div class="odds-wrap"><span class="odds-label">'+(sgp?'SGP odds':'Price est.')+'</span><div class="odds">'+(sgp?'Check book':odds==null?'Unavailable':(odds>0?'+':'')+odds)+'</div></div></div><p class="summary">'+summary+'</p><div class="legs">'+build.map(leg).join('')+'</div></article>':'<div class="empty">'+empty+'</div>';
 window.EXTRA_PICKS?.show('nba',{rows:scoped.map(m=>({market:m,forecast:model(m)})),label:m=>(m.isAltLine?'ALT · ':'')+m.label,selected:[...build,straight].filter(Boolean),event:m=>m.game_label,media});
 window.PARLAY_RISK?.attach($('#results')?.querySelector?.('.parlay-card'),'nba',entries,{sgp});
 window.COMPACT_UI?.refresh?.();window.PARLAY_GENERATOR?.syncLabel?.();
}
async function load(){const starterRequest=window.STARTER_STATUS?.load?.();const request=++sequence,token=window.__SPORT_TOKEN,ui=window.DASHBOARD_UI?.begin('nba');try{const [r,c]=await Promise.all([fetch('data/kalshi-nba.json?ts='+Date.now(),{cache:'no-store'}),fetch('data/nba-context.json?ts='+Date.now(),{cache:'no-store'})]);if(!r.ok||!c.ok)throw Error('NBA feed unavailable');const d=await r.json(),ctx=await c.json();if(starterRequest)await starterRequest;if(!G.fresh(d,.5))throw Error('NBA feed stale');if(!Array.isArray(d.markets))throw Error('Invalid NBA feed');if(window.__ACTIVE_SPORT!=='nba'||token!==window.__SPORT_TOKEN||request!==sequence)return;window.PUBLIC_SLATE?.set('nba',d);markets=window.NBA_ALT_LINES.classify(d.markets);context=ctx;snapshotAt=d.updated_at;loaded=Date.now();window.FEED_FRESHNESS?.set?.('nba',snapshotAt);render()}catch(e){if(window.__ACTIVE_SPORT!=='nba'||token!==window.__SPORT_TOKEN||request!==sequence)return;markets=[];loaded=0;Q.prepare('nba',[]);$('#dataStatus').textContent=e.message;window.PICK_OF_DAY?.show('nba');$('#results').innerHTML='<div class="empty">'+esc(e.message)+' · Refresh markets.</div>'}finally{window.DASHBOARD_UI?.end(ui)}}
function setLegs(n){window.DASHBOARD_UI?.put('nba','legs',Math.max(2,Math.min(4,Math.floor(+n)||2)));render()}
function controls(){
 const host=$('#nbaMarketFilters');if(!host?.querySelector)return;
 let field=$('#nbaLineFilters');
 if(!field){
  field=document.createElement('div');field.id='nbaLineFilters';field.className='team-line-filters smooth-sport-filters';
  field.innerHTML='<div class="nhl-filter-fields"><div class="field"><label for="nbaModeSelect">Parlay type</label><select id="nbaModeSelect"><option value="sgp">Same Game</option><option value="multi">Multi-Game</option></select></div><div class="field"><label for="nbaLinesSelect">Lines</label><select id="nbaLinesSelect" aria-describedby="nbaLinesNote"><option value="both">Standard + ALT</option><option value="standard">Standard only</option><option value="alt">ALT only</option></select></div></div><div id="nbaGameField" class="field"><label for="nbaGameSelect">Game</label><select id="nbaGameSelect" aria-label="NBA same-game matchup"></select></div><details class="filter-policy"><summary>ALT rules</summary><small id="nbaLinesNote">Quoted spreads within 7 points, totals within 15; nearby player props, overs only. Reference = nearest 50% quoted threshold, not a verified sportsbook main line. Quality and availability checks still apply. Verify the exact line at your book.</small></details>';
  host.before(field);
  field.querySelector('#nbaLinesSelect').addEventListener('change',e=>{if(!['standard','alt','both'].includes(e.target.value))return;lineMode=e.target.value;window.DASHBOARD_UI?.put('nba','lines',lineMode);render()});
  field.querySelector('#nbaModeSelect').addEventListener('change',e=>{if(!['sgp','multi'].includes(e.target.value))return;buildMode=e.target.value;window.DASHBOARD_UI?.put('nba','mode',buildMode);render()});
  field.querySelector('#nbaGameSelect').addEventListener('change',e=>{selectedGame=e.target.value;window.DASHBOARD_UI?.put('nba','game',selectedGame);render()});
 }
 field.hidden=window.__ACTIVE_SPORT!=='nba';
 field.querySelector('#nbaLinesSelect').value=lineMode;field.querySelector('#nbaModeSelect').value=buildMode;
 const games=new Map();
 for(const m of markets)if(m.game_id&&G.pregame(m)&&(!window.SLATE_UI||window.SLATE_UI.matches('nba',m)))games.set(String(m.game_id),m);
 const options=[...games].sort((a,b)=>Date.parse(a[1].game_time)-Date.parse(b[1].game_time)||a[0].localeCompare(b[0]));
 if(!games.has(selectedGame))selectedGame=options[0]?.[0]||'';
 const select=field.querySelector('#nbaGameSelect'),html=options.length?options.map(([id,m])=>'<option value="'+esc(id)+'">'+esc(m.game_label||id)+' · '+esc(new Date(m.game_time).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))+'</option>').join(''):'<option value="">No games for selected date</option>';
 if(select.innerHTML!==html)select.innerHTML=html;select.value=selectedGame;select.disabled=!options.length;
 field.querySelector('#nbaGameField').hidden=buildMode!=='sgp';
}
window.NBA_DASHBOARD={load,refresh:render,setLegs,model,eligible,buildSameGame,compatibleSet,showCached(){if(!loaded||Date.now()-loaded>60000)return false;render();return true},historyPicks:()=>ranked().map(m=>({market:m,forecast:model(m)}))};
})();
