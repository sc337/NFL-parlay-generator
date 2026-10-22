(()=>{'use strict';
const S=window.STARTER_STATUS;if(!S)return;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let panel,sport='nba',gameId='';
const links={nba:[['RotoWire lineups','https://www.rotowire.com/basketball/nba-lineups.php']],nhl:[['Daily Faceoff goalies','https://www.dailyfaceoff.com/starting-goalies/'],['Line combinations','https://www.dailyfaceoff.com/teams']],ncaaf:[['SEC availability','https://www.secsports.com/fbreports']]};
function options(values,selected){return values.map(([value,label])=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>').join('')}
function refresh(){if(!panel||!panel.open)return;const data=S.contexts.get(sport),ctx=data?.context||{},games=Object.entries(ctx.games||{}).filter(([,g])=>Date.parse(g.start||g.kickoff)>Date.now());if(!games.some(([id])=>id===gameId))gameId=games[0]?.[0]||'';
 const g=ctx.games?.[gameId],teams=S.teamList(sport,g),roles=sport==='nba'?[['lineup','Starting five'],['availability','Player participation']]:sport==='nhl'?[['goalie','Starting goalie'],['line','Skater line'],['powerplay','Power-play unit']]:[['qb','Starting quarterback']];
 panel.querySelector('.starter-body').innerHTML='<p>Public reports are checked automatically. Manual checks stay on this device and expire within two hours or at game time.</p><label>Sport<select id="starterSport">'+options([['nba','NBA'],['nhl','NHL'],['ncaaf','NCAAF']],sport)+'</select></label><label>Game<select id="starterGame">'+options(games.map(([id,g])=>[id,S.teamList(sport,g).join(' vs ')+' · '+new Date(g.start||g.kickoff).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})]),gameId)+'</select></label>'+(games.length?'':'<p>Open this sport first to load upcoming games.</p>')+'<p>'+links[sport].map(([name,url])=>'<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+name+'</a>').join(' · ')+'</p><div id="starterEvidence"></div>'+(g?'<form id="starterManual"><label>Team<select name="team">'+options(teams.map(t=>[t,t]),teams[0])+'</select></label><label>Role<select name="role">'+options(roles,roles[0][0])+'</select></label><label>Full player name'+(sport==='nba'?'s (five for starting five; otherwise one)':'')+'<input name="players" required maxlength="520" autocomplete="off"></label><label>Line / PP unit (when applicable)<input name="assignment" maxlength="40" placeholder="e.g. Line 1 or PP1"></label><label>Status<select name="status">'+options([['confirmed','Confirmed'],['projected','Projected'],['out','Out'],['unknown','Unknown']],'confirmed')+'</select></label><label>Announcement URL<input name="source" type="url" placeholder="https://…" required></label><label class="starter-attest"><input name="attested" type="checkbox" required>I checked this source for this game. An availability report or depth chart alone does not confirm a starter.</label><p>Manual entries are user-confirmed, not independently verified. They do not establish minutes, goalie performance or QB impact.</p><div class="starter-actions"><button type="submit">Save check</button><button type="button" id="starterClear">Clear manual checks</button></div><p id="starterMessage" role="status"></p></form>':'');
 panel.querySelector('#starterSport').onchange=e=>{sport=e.target.value;gameId='';refresh()};panel.querySelector('#starterGame').onchange=e=>{gameId=e.target.value;refresh()};
 const rows=[...S.payload().records,...S.manual()].filter(r=>r.sport===sport&&r.game_id===gameId);
 const report=panel.querySelector('#starterEvidence');
 const renderRow=r=>{const expired=Date.now()-Date.parse(r.checked_at)>(r.method==='manual'?120:30)*60000,provisional=sport==='nba'&&r.role==='lineup'&&(r.retained||expired||r.basis==='previous'||r.status==='projected'),label=provisional?(r.basis==='previous'?'Previous lineup · Not final':r.retained||expired?'Latest known lineup · Not final':'Projected lineup · Not final'):r.status;return '<p data-tone="'+(provisional||expired?'warning':r.status==='out'?'danger':['unknown','projected'].includes(r.status)?'warning':'neutral')+'">'+esc(r.team)+' · '+esc(r.role)+' · '+esc(r.players.join(', '))+' — '+esc(label)+(r.method==='manual'?' (user-confirmed)':'')+' · Last checked '+esc(new Date(r.checked_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}))+(r.changed_at?' · Changed '+esc(new Date(r.changed_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})):'')+(expired&&!provisional?' · Expired':'')+' <a href="'+esc(S.safeURL(r.source_url)||'#')+'" target="_blank" rel="noopener noreferrer">Source</a></p>'};
 const primary=rows.filter(r=>!['line','powerplay'].includes(r.role)),units=rows.filter(r=>['line','powerplay'].includes(r.role));
 if(sport==='nba'&&g)for(const r of S.evidence('nba',{game_id:gameId,game_time:g.start},ctx).sides)if(r.basis==='previous'&&!primary.some(p=>p.role==='lineup'&&p.team===r.team))primary.push(r);
 report.innerHTML=(primary.length?primary.map(renderRow).join(''):'<p>No current starter evidence for this game.</p>')+(units.length?'<details><summary>Reported skater roles ('+units.length+')</summary>'+units.map(renderRow).join('')+'</details>':'');
 const failed=(S.payload().checks||[]).filter(c=>!c.ok&&(sport==='nba'?c.source.includes('NBA'):sport==='nhl'?c.source.includes('Faceoff'):false));
 if(failed.length)report.insertAdjacentHTML('beforeend','<p>Public source unavailable: '+failed.map(c=>esc(c.source)).join(', ')+'. Confirmation remains unknown.</p>');
 if(sport==='ncaaf')report.insertAdjacentHTML('beforeend','<p>QB confirmation requires a game-specific school or coach announcement. Availability alone is insufficient.</p>');
 if(g){panel.querySelector('#starterManual').onsubmit=e=>{e.preventDefault();const f=e.target.elements;try{S.save({sport,game_id:gameId,team:f.team.value,role:f.role.value,players:f.players.value.split(','),assignment:f.assignment.value,status:f.status.value,source_url:f.source.value,attested:f.attested.checked});panel.querySelector('#starterMessage').textContent='Saved. Affected picks recalculated.'}catch(error){panel.querySelector('#starterMessage').textContent=error.message}};panel.querySelector('#starterClear').onclick=()=>S.clear(sport,gameId);}
}
function mount(){const host=document.querySelector('#settingsDialog .settings-content');if(!host)return;panel=document.createElement('details');panel.className='settings-section starter-checks';panel.innerHTML='<summary>Starter checks</summary><div class="starter-body"></div>';host.append(panel);panel.addEventListener('toggle',()=>{if(panel.open){sport=['nba','nhl','ncaaf'].includes(window.__ACTIVE_SPORT)?window.__ACTIVE_SPORT:'nba';S.load().then(refresh);refresh()}});}
window.STARTER_CHECKS_UI={refresh};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
// Reassess even on fetch failure so expired evidence cannot leave picks displayed.
let polling=false;const pollStartedAt=Date.now(),checkedAt=new Map();
function signature(at,active){
 const rows=[...(S.payload().records||[]),...(S.payload().nba_lineup_history||[]),...S.manual()].filter(r=>r.sport===active);
 const data=S.contexts.get(active),ctx=data?.context||{},deadline=t=>Number.isFinite(t)&&at>=t;
 // Unchanged lineups must not keep started events or expired quotes visible.
 const marketTimes=(data?.markets||[]).map(m=>[Date.parse(m.game_time||m.start_time),Date.parse(m.quotedAt||data.at)+30*60000].map(deadline));
 const contextTimes=[Date.parse(ctx.updated_at)+90*60000,Date.parse(ctx.updated_at)+4*3600000,...Object.values(ctx.games||{}).map(g=>Date.parse(g.start||g.kickoff))].map(deadline);
 return JSON.stringify([marketTimes,contextTimes,rows.map(r=>{const {checked_at,changed_at,expires_at,...report}=r;return [report,[Date.parse(r.checked_at)-300000,Date.parse(r.checked_at)+(r.method==='manual'?120:30)*60000,Date.parse(r.checked_at)+86400000,Date.parse(r.start_time),Date.parse(r.start_time)+7*86400000,Date.parse(r.expires_at)].map(deadline)]})]);
}
async function poll(){
 const active=window.__ACTIVE_SPORT,token=window.__SPORT_TOKEN;
 if(polling||document.visibilityState==='hidden'||!['nba','nhl','ncaaf'].includes(active))return;
 polling=true;
 try{
  const before=signature(checkedAt.get(active)??pollStartedAt,active);await S.load(true);
  const changed=before!==signature(Date.now(),active);checkedAt.set(active,Date.now());
  if(active!==window.__ACTIVE_SPORT||token!==window.__SPORT_TOKEN||!changed)return;
  window[active.toUpperCase()+'_DASHBOARD']?.refresh?.();
  if(panel?.open&&!panel.querySelector('#starterManual')?.contains(document.activeElement))refresh();
 }finally{polling=false}
}
window.STARTER_CHECKS_UI.poll=poll;
setInterval(poll,60000);
})();
