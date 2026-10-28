(()=>{'use strict';
const $=s=>document.querySelector(s);const savedLines=window.DASHBOARD_UI?.get('nba','lines','both');let markets=[],context={},snapshotAt=null,loaded=0,sequence=0,lineMode=['standard','alt','both'].includes(savedLines)?savedLines:'both';
const G=window.MARKET_GUARDS,Q=window.PICK_QUALITY,esc=G.esc,forecastCache=new Map();
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
 const teamProps=new Map();
 for(const m of legs)if(m.player){const team=String(m.team_code||'unknown').trim().toUpperCase(),n=(teamProps.get(team)||0)+1;if(n>2)return false;teamProps.set(team,n)}
 const under=legs.find(m=>m.kind==='total'&&['no','under'].includes(m.side));
 if(under&&Number.isFinite(under.line)){
  const minimum=legs.filter(m=>m.kind==='points'&&['yes','over'].includes(m.side)&&Number.isFinite(m.line)).reduce((sum,m)=>sum+Math.floor(m.line)+1,0);
  if(minimum>=under.line)return false;
 }
 return true;
}
function buildSameGame(rows,n,assess,{balanced=false,acceptBuild=()=>true,diversityBonus=0}={}){
 if(!Number.isInteger(n)||n<2||n>4)return [];
 const groups=new Map(),candidates=rows.map(m=>({m,q:assess(m)})).filter(x=>x.q?.pass&&Number.isFinite(x.q.rank))
  .sort((a,b)=>(Number(window.SELECTION_UI?.locked?.('nba',b.m))-Number(window.SELECTION_UI?.locked?.('nba',a.m)))*10000||b.q.rank-a.q.rank||String(a.m.selection_id||a.m.ticker).localeCompare(String(b.m.selection_id||b.m.ticker)))
  .filter(({m})=>{const key=m.player_id||m.player||(['moneyline','spread'].includes(m.kind)?'team-side':m.kind),count=groups.get(key)||0;groups.set(key,count+1);return count<6}).slice(0,80);
 let beams=[{legs:[],checks:[],score:0,minCoverage:1}];
 for(let i=0;i<n;i++){
  const next=[];
  for(const beam of beams)for(const {m,q} of candidates){
   const legs=[...beam.legs,m];if(!compatibleSet(legs))continue;
   const minCoverage=Math.min(beam.minCoverage,q.coverage||0),score=beam.score+q.rank+(window.SELECTION_UI?.locked?.('nba',m)?10000:0);
   const checks=[...beam.checks,q];if(legs.length===n&&!acceptBuild(legs,checks))continue;
   next.push({legs,checks,minCoverage,score,objective:score-(balanced?G.balancedPenalty(checks,legs):12*(1-minCoverage))+diversityBonus*new Set(legs.map(x=>x.kind)).size,signature:legs.map(x=>x.selection_id||x.ticker).sort().join('|')});
  }
  const seen=new Set();beams=next.sort((a,b)=>b.objective-a.objective||a.signature.localeCompare(b.signature)).filter(b=>{if(seen.has(b.signature))return false;seen.add(b.signature);return true}).slice(0,64);
  if(!beams.length)return [];
 }
 return beams.find(b=>!window.SELECTION_UI?.accepts||window.SELECTION_UI.accepts('nba',b.legs))?.legs||[];
}
function model(m){if(forecastCache.has(m))return forecastCache.get(m);const f=window.NBA_MODEL.estimate(m,context),result=f?Q.forecast('nba',m,f):null;forecastCache.set(m,result);return result}
function eligible(m,featured=false){if(featured&&window.NBA_PROP_TARGETS?.isTarget(m))return false;if(!G.pregame(m)||m.game_status!=='pre'||!window.SPORT_MARKETS.allowed('nba',m)||!window.NBA_ALT_LINES.allowed(m,lineMode)||window.SLATE_UI&&!window.SLATE_UI.matches('nba',m)||!(window.NBA_PROP_TARGETS?.isTarget(m)||m.referenceOnly||Number(m.volume)>=50&&Number.isFinite(m.spread)&&m.spread>=0&&m.spread<=.08))return false;const f=model(m);return !!f&&Q.assess('nba',m,f,{featured,parlay:!featured}).pass}
function ranked(){return markets.filter(m=>{if(!G.pregame(m)||m.game_status!=='pre'||!window.SPORT_MARKETS.allowed('nba',m)||!window.NBA_ALT_LINES.allowed(m,lineMode)||window.SLATE_UI&&!window.SLATE_UI.matches('nba',m)||!(window.NBA_PROP_TARGETS?.isTarget(m)||m.referenceOnly||Number(m.volume)>=50&&Number.isFinite(m.spread)&&m.spread>=0&&m.spread<=.08)||!model(m))return false;return PROFILES.some(profile=>{const q=assessProfile(m,profile);return q.pass&&profile.allows(q)})}).sort((a,b)=>String(a.selection_id).localeCompare(String(b.selection_id)))}
const PROFILES=[
 {key:'safe',name:'Conservative',allows:q=>q.profileBufferedP>=.75,score:q=>q.conservativeRank??(q.profileBufferedP*100+(q.coverage||0)*12-(q.juicePenalty||0)),description:window.CONSERVATIVE_POLICY?.description||'Prioritizes buffered win likelihood within price limits. Market-informed selections do not establish value.'},
 {key:'balanced',name:'Balanced',allows:q=>q.profileBufferedP>=.65,score:q=>(q.coverage||0)*20-Math.abs(q.profileBufferedP-.52)*45-Math.max(0,q.profileP-q.profileBufferedP)*30,description:'Requires 65%+ buffered estimated likelihood per leg. Balances evidence and price; positive value is not required for team markets. Shared scoring drivers receive a concentration penalty, not an independence claim. Estimates remain unvalidated.'},
 {key:'long',name:'Lotto',allows:q=>q.profileBufferedP>=.50,score:q=>(1-q.profileP)*35+q.profileBufferedP*35+(q.coverage||0)*15-Math.max(0,q.profileP-q.profileBufferedP)*30,description:'Requires 50%+ buffered estimated likelihood per leg. Targets higher payouts and higher variance. Experimental estimates remain unvalidated.'}
];
// Product of buffered leg estimates is a construction index, not a calibrated
// joint probability (especially for SGPs). Never infer risk from payout alone.
function profileRisk(checks){return checks.reduce((p,q)=>p*Math.max(0,Math.min(1,Number(q.profileBufferedP??q.conservativeP??q.modelP)||0)),1)}
function profileFits(legs,checks,profile,previous=[]){
 return checks.length===legs.length&&checks.every(q=>q.pass&&profile.allows(q));
}

function assessProfile(m,profile){const q=Q.assess('nba',m,model(m)||{},{parlay:true,nbaProfile:profile?.key}),price=Number(q.quote?.p??m.probability),buffered=Number(q.conservativeP??q.modelP??model(m)?.modelP??price);const conservative=window.CONSERVATIVE_POLICY?.assessProfile('nba',m,q,profile?.key)||{pass:false,reason:'Profile policy unavailable',rank:-999};return {...q,...(conservative?{pass:q.pass&&conservative.pass,reason:conservative.reason,conservativeRank:conservative.rank}:{}),profileP:Number.isFinite(price)?price:.5,profileBufferedP:Number.isFinite(buffered)?buffered:.5}}
function unavailableBuild(rows,count,sgp,mode){
 const label=mode==='alt'?'ALT ':'';
 let available=rows.length?1:0;
 if(sgp){for(let n=Math.min(count,4);n>=2;n--)if(buildSameGame(rows,n,()=>({pass:true,rank:1,coverage:1})).length===n){available=n;break}}
 else available=Math.min(count,G.unique(rows,Infinity).length);
 if(available>=count)return 'No '+label+'build meets the per-leg likelihood, quality and compatibility checks. Try fewer legs or review Filters.';
 const teams=[...new Set(rows.filter(m=>m.player).map(m=>m.team_code||'unknown'))];
 const concentration=sgp&&teams.length===1&&new Set(rows.filter(m=>m.player).map(m=>m.player_id||m.player)).size>2?' Player props currently qualify from '+teams[0]+' only; maximum two per team.':'';
 return 'Only '+available+' compatible qualifying '+label+'leg'+(available===1?'':'s')+' available for a '+count+'-leg build.'+concentration+' '+(available<2?'Review Filters or wait for supported player data.':mode==='alt'?'Try Both lines or fewer legs.':'Try fewer legs or review Filters.');
}
function pendingAvailability(rows,qualified){
 const eligibleTeams=new Set(qualified.filter(m=>m.player).map(m=>m.team_code)),pending=new Map();
 for(const m of rows){if(!m.player||!m.team_code||eligibleTeams.has(m.team_code)||pending.has(m.team_code))continue;const f=model(m);if(!f)continue;
  if(Q.assess('nba',m,f,{parlay:true}).reason==='Confirm starters, availability and role before kickoff')pending.set(m.team_code,(m.teams||[]).find(t=>t.code===m.team_code)?.short||m.team_code);
 }
 return [...pending.values()].slice(0,2).map(team=>team+' player availability/lineup confirmation pending.').join(' ');
}
function profileBuild(rows,count,sgp,profile,previous=[]){
 const assess=m=>assessProfile(m,profile);
 const candidates=rows.filter(m=>{const q=assess(m);return q.pass&&profile.allows(q)}).sort((a,b)=>profile.score(assess(b))-profile.score(assess(a))||String(a.selection_id||a.ticker).localeCompare(String(b.selection_id||b.ticker)));
 const shaped=m=>{const q=assess(m);return {...q,rank:(q.conservativeRank??profile.score(q))-previous.reduce((sum,b)=>sum+(b.legs.some(x=>(x.selection_id||x.ticker)===(m.selection_id||m.ticker))?2:0),0)}};
 const options={balanced:profile.key==='balanced',diversityBonus:3,acceptBuild:(legs,checks)=>profileFits(legs,checks,profile,previous)};
 const build=sgp?buildSameGame(candidates,count,shaped,options):G.bestBuild(candidates,count,shaped,options);
 return build.length===count&&(sgp?compatibleSet(build):G.independent(build))?build:[];
}
function media(m){const team=(m.teams||[]).find(t=>t.code===m.team_code);return (m.headshot?'<img class="sport-photo" src="'+esc(m.headshot)+'" alt="'+esc(m.player)+' headshot">':'')+(team?.logo?'<img class="sport-logo" src="'+esc(team.logo)+'" alt="'+esc(team.short)+' logo">':'')}
function lineup(m){return window.STARTER_STATUS?.evidence('nba',m,context)}
function note(m){return (lineup(m)?.lineupLabel||'Lineup pending · Not final')+' · '+Q.note('nba',m,model(m)||{})}
function leg(m,i){const f=model(m),q=Q.quoteLabel('nba',m),status=lineup(m);return '<div class="leg sport-visual-leg" data-event-time="'+esc(m.game_time)+'" data-alt-line="'+(m.isAltLine?'true':'false')+'" data-matchup="'+esc(m.game_label)+'"'+(window.NBA_PROP_TARGETS?.isTarget(m)&&Number.isFinite(m.line)?' data-alt-label="'+(m.line+.5)+'+"':'')+'>'+media(m)+'<div class="sport-visual-copy"><div class="leg-title">'+(i+1)+'. '+esc(m.label)+(m.isAltLine?' <span class="alt-tag">ALT</span>':'')+'</div><div class="nba-lineup-status" data-tone="'+(status?.confirmed?'neutral':'warning')+'">'+esc(status?.lineupLabel||'Lineup pending · Not final')+'</div>'+ (window.NBA_PROP_TARGETS?.isTarget(m)?'<div class="nba-target-projection">Model estimate'+(Number.isFinite(f.projectedLine)?' · Projected '+f.projectedLine.toFixed(1):' · Yes milestone')+'</div>':'')+'<div class="leg-sub">'+esc(m.game_label)+' · '+(f.marketAnchored?'Market-informed likelihood ':'Experimental estimate ')+Math.round(f.modelP*100)+'%'+(f.projectedLine!=null?' · Projected '+f.projectedLine.toFixed(1):'')+'</div><div class="leg-reason">'+esc(f.method)+' · '+esc(note(m))+'</div></div><div class="leg-quote">'+esc(window.NBA_PROP_TARGETS?.isTarget(m)?'Check Caesars':q)+'</div></div>'}
let qualifiedCount=null;
function render(){return window.STARTER_STATUS?.withCache?window.STARTER_STATUS.withCache(renderFresh):renderFresh()}
function renderFresh(){
 if(window.__ACTIVE_SPORT!=='nba')return;
 forecastCache.clear();window.EXTRA_PICKS?.clear?.();Q.prepare('nba',markets,context,[],snapshotAt);
 window.SPORT_MARKETS.sync('nba',markets,render);controls();
 const count=window.DASHBOARD_UI?.get('nba','legs',2)||2,pool=ranked(),sgp=buildMode==='sgp';
 qualifiedCount=G.unique(pool,Infinity).length;
 const scoped=sgp?pool.filter(m=>String(m.game_id)===selectedGame):pool;
 const marketCounts=markets.filter(m=>G.pregame(m)&&(!window.SLATE_UI||window.SLATE_UI.matches('nba',m))).reduce((a,m)=>(a[m.kind]=(a[m.kind]||0)+1,a),{}),eligibleCounts=pool.reduce((a,m)=>(a[m.kind]=(a[m.kind]||0)+1,a),{});
 const host=$('#nbaMarketFilters'),marketNote=host?.querySelector?.('[data-market-note]');if(marketNote)marketNote.textContent='Eligible / available (quotes + model targets): '+Object.entries(marketCounts).map(([kind,n])=>kind+' '+(eligibleCounts[kind]||0)+'/'+n).join(' · ')+'. Comparable market types compete; missing player evidence remains a pass.';
 const straightPool=markets.filter(m=>eligible(m,true)&&(window.SLATE_UI?window.SLATE_UI.matches('nba',m):window.PICK_OF_DAY?.today?window.PICK_OF_DAY.today(m.game_time):new Date(m.game_time).toDateString()===new Date().toDateString()));
 const straight=Q.bestStraight?Q.bestStraight('nba',straightPool.map(m=>({market:m,forecast:model(m)})))?.market:straightPool.sort((a,b)=>Q.assess('nba',b,model(b)).rank-Q.assess('nba',a,model(a)).rank)[0];
 const builds=[];
 for(const profile of PROFILES){const legs=profileBuild(scoped,count,sgp,profile,builds);builds.push({profile,legs,risk:profileRisk(legs.map(m=>assessProfile(m,profile)))})}
 window.PICK_OF_DAY?.show('nba',straight&&{market:straight,eventTime:straight.game_time,label:straight.label,event:straight.game_label,media:media(straight),note:note(straight)});
 $('#resultsTitle').textContent='NBA Recommendations';
 $('#dataStatus').textContent='NBA · '+G.unique(pool,Infinity).length+' qualified games · Experimental';
 $('#modeTitle').textContent=sgp?'NBA Same Game Parlay':'NBA Multi-Game Parlay';
 builds.forEach(({profile,legs})=>window.RECOMMENDATION_CAPTURE?.('nba',{mode:buildMode,profile:profile.key,requestedLegs:count,legs:legs.map(m=>({market:m,forecast:model(m)}))}));
 const summary=sgp?'One matchup; related outcomes can move together. Verify the combined SGP price at your sportsbook. Joint win probability is unavailable.':'One leg per game. Thin-history team markets use fresh two-way prices at the exact quoted line; value is unverified. Other estimates use pace, efficiency and minutes. Confirm availability and your sportsbook price.';
 const displayedSignatures=new Set(),visibleBuilds=builds.filter(({legs})=>{if(legs.length!==count)return false;const key=legs.map(m=>m.selection_id||m.ticker).sort().join('|');if(displayedSignatures.has(key))return false;displayedSignatures.add(key);return true;});
 const hasBuild=visibleBuilds.length>0;
 const canBuildTwo=PROFILES.some(profile=>profileBuild(scoped,2,sgp,profile).length===2);
 const empty=hasBuild?'':!markets.length?'No upcoming NBA quotes available.':sgp&&!selectedGame?'No upcoming NBA games for the selected date.':markets.some(m=>m.season_type===1)?'NBA preseason · Rotation uncertainty; no model-qualified picks.':unavailableBuild(scoped,count,sgp,lineMode)+' '+pendingAvailability(markets.filter(m=>(!sgp||String(m.game_id)===selectedGame)&&(!window.SLATE_UI||window.SLATE_UI.matches('nba',m))),scoped);
 $('#results').innerHTML=visibleBuilds.map(({profile,legs})=>{
  const unpriced=legs.some(m=>window.NBA_PROP_TARGETS?.isTarget(m)),odds=!sgp&&!unpriced?Q.estimateOdds('nba',legs):null;
  return '<article class="parlay-card" data-profile="'+profile.key+'"><div class="parlay-top"><div><span class="grade">EXPERIMENTAL</span><h3 class="parlay-name">'+profile.name+' · NBA '+(sgp?'Same Game':'Multi-Game')+' · '+count+' legs</h3></div><div class="odds-wrap"><span class="odds-label">'+(unpriced?'Caesars price':sgp?'Check book':'Price est.')+'</span><div class="odds">'+(unpriced?'Check Caesars':sgp?'—':odds==null?'Unavailable':(odds>0?'+':'')+odds)+'</div></div></div><p class="summary">'+profile.description+' Every leg must clear its profile’s buffered likelihood threshold. Model-only targets have no quoted price or verified value. Profiles compare buffered leg likelihood across all market types; comparable mixed-market builds receive a small preference. More legs reduce combined win likelihood. Joint estimates are unvalidated. '+summary+'</p><div class="legs">'+legs.map(leg).join('')+'</div></article>';
 }).join('')||'<div class="empty" role="status" data-can-build-two="'+canBuildTwo+'">'+esc(empty.trim())+'</div>';
 $('#results').innerHTML+='<details class="card-explanation"><summary>Profile availability</summary><p class="summary">'+PROFILES.map(profile=>{const checks=markets.filter(m=>(!sgp||String(m.game_id)===selectedGame)&&G.pregame(m)&&window.SPORT_MARKETS.allowed('nba',m)&&window.NBA_ALT_LINES.allowed(m,lineMode)&&(!window.SLATE_UI||window.SLATE_UI.matches('nba',m))).map(m=>({...assessProfile(m,profile),subject:m.player_id||m.player||m.selection_id})),qualified=new Set(checks.filter(q=>q.pass&&profile.allows(q)).map(q=>q.subject)).size,reasons=[...new Set(checks.filter(q=>!q.pass).map(q=>q.reason).filter(Boolean))];return esc(profile.name+': '+qualified+' qualifying players/selections. '+(builds.find(b=>b.profile.key===profile.key)?.legs.length===count?'Build available.':qualified>=count?'Build compatibility or complete-build checks failed.':reasons.join('; ')));}).join(' · ')+'</p></details>';
 window.EXTRA_PICKS?.show('nba',{rows:scoped.map(m=>({market:m,forecast:model(m)})),label:m=>(m.isAltLine?'ALT · ':'')+m.label,selected:[...builds.flatMap(x=>x.legs),straight].filter(Boolean),event:m=>m.game_label,media});
 builds.filter(({legs})=>legs.length===count).forEach(({profile,legs})=>window.PARLAY_RISK?.attach($('#results')?.querySelector?.('[data-profile="'+profile.key+'"]'),'nba',legs.map(m=>({market:m,forecast:model(m)})),{sgp}));
 window.COMPACT_UI?.refresh?.();window.PARLAY_GENERATOR?.syncLabel?.();
}
async function load(){const starterRequest=window.STARTER_STATUS?.load?.();const request=++sequence,token=window.__SPORT_TOKEN,ui=window.DASHBOARD_UI?.begin('nba');try{const [r,c]=await Promise.all([fetch('data/kalshi-nba.json?ts='+Date.now(),{cache:'no-store'}),fetch('data/nba-context.json?ts='+Date.now(),{cache:'no-store'})]);if(!r.ok||!c.ok)throw Error('NBA feed unavailable');const d=await r.json(),ctx=await c.json();if(starterRequest)await starterRequest;if(!G.fresh(d,.5))throw Error('NBA feed stale');if(!Array.isArray(d.markets))throw Error('Invalid NBA feed');if(window.__ACTIVE_SPORT!=='nba'||token!==window.__SPORT_TOKEN||request!==sequence)return;window.PUBLIC_SLATE?.set('nba',d);context=ctx;markets=[...window.NBA_ALT_LINES.classify(d.markets),...(window.NBA_PROP_TARGETS?.expand(d.markets,ctx)||[])];snapshotAt=d.updated_at;loaded=Date.now();window.FEED_FRESHNESS?.set?.('nba',snapshotAt);render()}catch(e){if(window.__ACTIVE_SPORT!=='nba'||token!==window.__SPORT_TOKEN||request!==sequence)return;markets=[];loaded=0;Q.prepare('nba',[]);$('#dataStatus').textContent=e.message;window.PICK_OF_DAY?.show('nba');$('#results').innerHTML='<div class="empty">'+esc(e.message)+' · Refresh markets.</div>'}finally{window.DASHBOARD_UI?.end(ui)}}
function setLegs(n){window.DASHBOARD_UI?.put('nba','legs',Math.max(2,Math.min(4,Math.floor(+n)||2)));render()}
function controls(){
 const host=$('#nbaMarketFilters');if(!host?.querySelector)return;
 let field=$('#nbaLineFilters');
 if(!field){
  field=document.createElement('div');field.id='nbaLineFilters';field.className='team-line-filters smooth-sport-filters';
  field.innerHTML='<div class="nhl-filter-fields"><div class="field"><label for="nbaModeSelect">Parlay type</label><select id="nbaModeSelect"><option value="sgp">Same Game</option><option value="multi">Multi-Game</option></select></div><div class="field"><label for="nbaLinesSelect">Lines</label><select id="nbaLinesSelect" aria-describedby="nbaLinesNote"><option value="both">Standard + ALT</option><option value="standard">Standard only</option><option value="alt">ALT only</option></select></div></div><div id="nbaGameField" class="field"><label for="nbaGameSelect">Game</label><select id="nbaGameSelect" aria-label="NBA same-game matchup"></select></div><details class="filter-policy"><summary>ALT rules</summary><small id="nbaLinesNote">Player targets use 1-unit increments (overs) and Yes milestones; model-only targets require exact Caesars availability and price checks. Quoted spreads within 7 points, totals within 15; quoted player alternatives retain their distance checks. Reference = nearest 50% quoted threshold, not a verified sportsbook main line. Quality and availability checks still apply. Verify the exact line at your book.</small></details>';
  host.before(field);
  field.querySelector('#nbaLinesSelect').addEventListener('change',e=>{if(!['standard','alt','both'].includes(e.target.value))return;lineMode=e.target.value;window.DASHBOARD_UI?.put('nba','lines',lineMode);render()});
  ($('#nbaModeSelect')||field.querySelector('#nbaModeSelect')).addEventListener('change',e=>{if(!['sgp','multi'].includes(e.target.value))return;buildMode=e.target.value;window.DASHBOARD_UI?.put('nba','mode',buildMode);render()});
  ($('#nbaGameSelect')||field.querySelector('#nbaGameSelect')).addEventListener('change',e=>{selectedGame=e.target.value;window.DASHBOARD_UI?.put('nba','game',selectedGame);render()});
 }
 field.hidden=window.__ACTIVE_SPORT!=='nba';
 field.querySelector('#nbaLinesSelect').value=lineMode;($('#nbaModeSelect')||field.querySelector('#nbaModeSelect')).value=buildMode;
 const games=new Map();
 for(const m of markets)if(m.game_id&&G.pregame(m)&&(!window.SLATE_UI||window.SLATE_UI.matches('nba',m)))games.set(String(m.game_id),m);
 const options=[...games].sort((a,b)=>Date.parse(a[1].game_time)-Date.parse(b[1].game_time)||a[0].localeCompare(b[0]));
 if(!games.has(selectedGame))selectedGame=options[0]?.[0]||'';
 const select=($('#nbaGameSelect')||field.querySelector('#nbaGameSelect')),html=options.length?options.map(([id,m])=>'<option value="'+esc(id)+'">'+esc(m.game_label||id)+' · '+esc(new Date(m.game_time).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))+'</option>').join(''):'<option value="">No games for selected date</option>';
 if(select.innerHTML!==html)select.innerHTML=html;select.value=selectedGame;select.disabled=!options.length;
 ($('#nbaGameField')||field.querySelector('#nbaGameField')).hidden=buildMode!=='sgp';
}
window.NBA_DASHBOARD={availableCount:()=>loaded?qualifiedCount:null,load,refresh:render,setLegs,model,eligible,profileBuild,PROFILES,buildSameGame,compatibleSet,profileFits,profileRisk,unavailableBuild,showCached(){if(!loaded||Date.now()-loaded>60000)return false;render();return true},historyPicks:()=>ranked().map(m=>({market:m,forecast:model(m)}))};
})();

