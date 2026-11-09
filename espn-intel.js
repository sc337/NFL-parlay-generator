(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.ESPN_INTEL=api;})(()=>{'use strict';
const SPORTS=['nfl','nba','nhl','mlb','ncaaf','ufc'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='espn.com'||u.hostname.endsWith('.espn.com'))?u.href:''}catch{return ''}}
function fresh(g,now=Date.now()){const at=Date.parse(g.checkedAt);return Number.isFinite(at)&&at<=now+300000&&now-at<=7200000&&g.status==='ok'}
function gamesFor(feed,date,day,now=Date.now()){return (feed?.games||[]).filter(g=>Date.parse(g.startAt)>now&&day(g.startAt)===date)}
const link=(url,text)=>safeLink(url)?'<a href="'+esc(safeLink(url))+'" target="_blank" rel="noopener noreferrer">'+esc(text)+'</a>':'';
function gameHTML(g,now=Date.now(),sourceOK=true){
 const teams=[...g.teams].sort((a,b)=>(a.side==='away'?0:1)-(b.side==='away'?0:1));
 const name=id=>teams.find(t=>t.id===id)?.code||id;
 const date=value=>{const d=new Date(value);return Number.isFinite(+d)?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Date unavailable'};
 const stamp=new Date(g.checkedAt).toLocaleString();
 const age=Math.max(0,Math.floor((now-Date.parse(g.checkedAt))/60000));
 if(!sourceOK||!fresh(g,now))return '<div class="intel-unavailable"><b>Current evidence unavailable</b><p>Last checked '+esc(stamp)+'. Refresh pending.</p>'+link(g.url,'View matchup on ESPN')+'</div>';
 let html='<div class="intel-status"><span>Research only · Does not change picks</span><span title="'+esc(stamp)+'">Checked '+(age<1?'just now':esc(age)+'m ago')+'</span></div>';
 const probabilities=[...(g.probabilities||[])].sort((a,b)=>b.percent-a.percent);
 const favorite=probabilities.length===2&&probabilities[0].percent>probabilities[1].percent?probabilities[0]:null;
 const picks=g.expertPicks||[],votes={};picks.forEach(p=>{if(p.winnerId)votes[p.winnerId]=(votes[p.winnerId]||0)+1});
 const leaders=Object.entries(votes).sort((a,b)=>b[1]-a[1]);
 const leader=leaders.length&&(!leaders[1]||leaders[0][1]>leaders[1][1])?leaders[0]:null;
 html+='<div class="intel-signals"><div class="intel-signal"><span class="intel-eyebrow">ESPN win probability</span>';
 if(favorite){html+='<div class="intel-value">'+esc(name(favorite.teamId))+' <strong>'+esc(favorite.percent.toFixed(1))+'%</strong></div><div class="intel-meter" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,favorite.percent))+'%"></i></div><span class="intel-caption">'+esc(name(probabilities[1].teamId))+' '+esc(probabilities[1].percent.toFixed(1))+'% · Game winner only</span>'}
 else html+='<div class="intel-value">'+(probabilities.length===2?'Even matchup':'Unavailable')+'</div><span class="intel-caption">Game winner probability</span>';
 html+='</div><div class="intel-signal"><span class="intel-eyebrow">Analyst picks</span><div class="intel-value">'+(leader?esc(name(leader[0]))+' <strong>'+leader[1]+' of '+picks.length+'</strong>':picks.length?'Split picks':'Unavailable')+'</div><span class="intel-caption">'+(leader?(favorite&&favorite.teamId!==leader[0]?'Analysts differ from ESPN model':leader[1]===picks.length?'All listed analysts agree':'Analysts are not unanimous'):picks.length?'No single-team consensus':'No current score picks')+'</span></div></div>';
 const sport=g.sport||'nfl';
 const football=[['totalPointsPerGame','Points scored'],['totalPointsPerGameAllowed','Points allowed'],['rushingYardsPerGame','Rushing yards'],['rushingYardsPerGameAllowed','Rushing yards allowed'],['passingYardsPerGame','Passing yards'],['passingYardsPerGameAllowed','Passing yards allowed']];
 const metrics=({nba:[['avgPoints','Points scored'],['avgPointsAgainst','Points allowed'],['avgRebounds','Rebounds'],['avgAssists','Assists'],['fieldGoalPct','Field goal %'],['threePointFieldGoalPct','3-point %']],nhl:[['avgGoals','Goals scored'],['avgGoalsAgainst','Goals allowed'],['avgShots','Shots'],['avgShotsAgainst','Shots allowed'],['powerPlayPct','Power play %'],['penaltyKillPct','Penalty kill %']],mlb:[['runs','Runs'],['avg','Batting average'],['onBasePct','On-base %'],['slugAvg','Slugging'],['ERA','ERA'],['WHIP','WHIP']],ufc:[]})[sport]||football;
 const available=metrics.filter(([key])=>g.statistics?.some(s=>s.values[key]!=null));
 if(sport==='ufc')html+='<div class="intel-evidence"><div class="intel-section-title">'+esc(g.eventName||'Fight matchup')+'</div>'+teams.map(t=>'<p>'+esc(t.name)+(t.record?' · '+esc(t.record):'')+'</p>').join('')+'<p class="intel-meta">Fight listing only · Probability and injuries unavailable.</p></div>';
 const table=rows=>'<table><thead><tr><th scope="col">Statistic</th>'+teams.map(t=>'<th scope="col">'+esc(t.code)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([key,title])=>'<tr><th scope="row">'+title+'</th>'+teams.map(t=>'<td>'+esc(g.statistics?.find(s=>s.teamId===t.id)?.values[key]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 if(available.length)html+='<div class="intel-evidence"><div class="intel-section-title">Matchup comparison <span>Season statistics</span></div>'+table(available.slice(0,2))+'</div>';
 const qb=(g.injuries||[]).filter(r=>r.position==='QB'&&/out|doubtful|questionable|inactive/i.test(r.status));
 if(qb.length)html+='<div class="intel-alert"><b>QB availability</b><span>'+qb.map(r=>esc(name(r.teamId)+' · '+r.player+' — '+r.status)).join('; ')+'</span></div>';
 html+='<div class="intel-disclosures">';
 if(picks.length)html+='<details data-intel-detail="analysts"><summary><span>Analyst score picks</span><span class="intel-detail-count">'+picks.length+' analysts</span></summary><ul>'+picks.map(p=>'<li><span>'+esc(p.author)+'</span><b>'+teams.map(t=>esc(t.code)+' '+esc(p.scores[t.id]??'—')).join(' · ')+'</b></li>').join('')+'</ul><p class="intel-meta">'+link(g.expertSource?.url,'ESPN weekly preview')+' · '+esc(date(g.expertSource?.publishedAt))+'<br>Editorial picks, not model probabilities or measured hit rates.</p></details>';
 if(available.length>2)html+='<details data-intel-detail="stats"><summary><span>More matchup stats</span><span class="intel-detail-count">Season statistics</span></summary>'+table(available.slice(2))+'</details>';
 if(sport!=='ufc')html+='<details class="intel-injuries" data-intel-detail="injuries"><summary><span>Injury reports</span><span class="intel-detail-count">'+(g.injuries?.length||0)+' reported</span></summary><ul>'+(g.injuries||[]).map(r=>'<li><span>'+esc(name(r.teamId)+' · '+r.player+' '+r.position)+'</span><b>'+esc(r.status)+'</b><small>Reported '+esc(new Date(r.reportedAt).toLocaleString())+'</small></li>').join('')+'</ul><p class="intel-meta">No report ≠ confirmed availability. Check report dates.</p></details>';
 html+='</div>';
 const sources=[link(g.url,'ESPN matchup'),link(g.expertSource?.url,'Weekly picks'+(g.expertSource?.publishedAt?' · '+date(g.expertSource.publishedAt):'')),link(g.preview?.url,'Game preview'+(g.preview?.publishedAt?' · '+date(g.preview.publishedAt):''))].filter(Boolean);
 html+='<div class="intel-sources"><span>Sources</span>'+sources.join('<span aria-hidden="true">·</span>')+'</div>';
 return html;
}
if(typeof document!=='undefined'){
 const feeds={},pending=new Set(),attempts={};
 let feed=null,host,selected='',signature='',renderedGame='';
 function render(){
  if(!host)return;const sport=window.__ACTIVE_SPORT||'nfl';host.hidden=!SPORTS.includes(sport);if(host.hidden)return;feed=feeds[sport]||null;if(!attempts[sport]&&!pending.has(sport))refresh(sport);
  const day=window.SLATE_UI?.day|| (v=>new Date(v).toLocaleDateString('en-CA'));
  const date=window.SLATE_UI?.date(sport)||day(Date.now());const rows=gamesFor(feed,date,day);
  if(!rows.some(g=>g.eventId===selected))selected=rows[0]?.eventId||'';
  const key=JSON.stringify([sport,feed?.lastAttemptAt,date,selected,rows.map(g=>[g.eventId,fresh(g)]),feed?.status,Math.floor(Date.now()/60000)]);if(key===signature)return;signature=key;
  const content=host.querySelector('.intel-content');
  if(!feed&&pending.has(sport)){content.innerHTML='<p class="intel-meta">Looking up ESPN matchups…</p>';return}
  if(!feed){content.innerHTML='<p class="intel-meta">ESPN unavailable · Retrying automatically.</p>';return}
  if(!rows.length){content.innerHTML='<p class="intel-meta">'+(feed.status==='unavailable'?'ESPN lookup unavailable.':'No upcoming ESPN matchups on this date.')+'</p>';return}
  const expanded=renderedGame===selected?[...content.querySelectorAll('details[open][data-intel-detail]')].map(el=>el.dataset.intelDetail):[];
  content.innerHTML='<label class="intel-select">Matchup<select aria-label="ESPN matchup">'+rows.map(g=>'<option value="'+esc(g.eventId)+'"'+(g.eventId===selected?' selected':'')+'>'+esc([...g.teams].sort((a,b)=>a.side==='away'?-1:1).map(t=>t.code).join(sport==='ufc'?' vs ':' at '))+'</option>').join('')+'</select></label>'+gameHTML(rows.find(g=>g.eventId===selected),Date.now(),feed.status!=='unavailable');
  renderedGame=selected;for(const detail of content.querySelectorAll('details[data-intel-detail]'))detail.open=expanded.includes(detail.dataset.intelDetail);
  content.querySelector('select').addEventListener('change',e=>{selected=e.target.value;render()});
 }
 async function refresh(sport=window.__ACTIVE_SPORT||'nfl'){if(!SPORTS.includes(sport)||pending.has(sport))return;pending.add(sport);attempts[sport]=Date.now();try{const r=await fetch('data/espn-intel-'+sport+'.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP');const d=await r.json();if(d.schemaVersion!==1||!Array.isArray(d.games)||(d.sport&&d.sport!==sport)||d.games.some(g=>g.sport&&g.sport!==sport))throw Error('Schema');feeds[sport]=d}catch{if(feeds[sport])feeds[sport]={...feeds[sport],status:'unavailable'}}finally{pending.delete(sport);signature='';render()}}

 function mount(){const results=document.querySelector('#results');if(!results)return;host=document.createElement('section');host.id='espnIntel';host.className='espn-intel';host.innerHTML='<details class="parlay-card"><summary>ESPN Matchup Intel</summary><div class="intel-content"><p class="intel-meta">Looking up ESPN matchups…</p></div></details>';results.after(host);new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['data-sport']});document.addEventListener('change',()=>setTimeout(render,0));document.addEventListener('click',e=>{if(e.target.closest('#slateControls'))setTimeout(render,0)});refresh();setInterval(()=>{if(!document.hidden)refresh()},300000);setInterval(render,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()})}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
}
return {SPORTS,safeLink,fresh,gamesFor,gameHTML};
});
