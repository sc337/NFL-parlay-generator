(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.ESPN_INTEL=api;})(()=>{'use strict';
const SPORTS=['nfl','nba','nhl','mlb','ncaaf','ufc'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='espn.com'||u.hostname.endsWith('.espn.com'))?u.href:''}catch{return ''}}
function fresh(g,now=Date.now()){const at=Date.parse(g.checkedAt);return Number.isFinite(at)&&at<=now+300000&&now-at<=7200000&&g.status==='ok'}
function gamesFor(feed,date,day,now=Date.now()){return (feed?.games||[]).filter(g=>Date.parse(g.startAt)>now&&day(g.startAt)===date)}
function normalizeLiveSummary(g,summary,now=Date.now()){
 const header=summary?.header,comp=header?.competitions?.[0],ids=(g.teams||[]).map(t=>String(t.id)).sort();
 if(String(header?.id)!==String(g.eventId)||Date.parse(comp?.date)!==Date.parse(g.startAt)||
   ids.length!==2||JSON.stringify((comp?.competitors||[]).map(c=>String(c.team?.id)).sort())!==JSON.stringify(ids))return null;
 const probabilities=['homeTeam','awayTeam'].map(side=>summary.predictor?.[side]).filter(p=>ids.includes(String(p?.id))&&Number.isFinite(Number(p?.gameProjection))&&Number(p.gameProjection)>=0&&Number(p.gameProjection)<=100).map(p=>({teamId:String(p.id),percent:Number(p.gameProjection)}));
 if(probabilities.length!==2||new Set(probabilities.map(p=>p.teamId)).size!==2||Math.abs(probabilities.reduce((a,p)=>a+p.percent,0)-100)>2)probabilities.length=0;
 const statistics=(summary.boxscore?.teams||[]).filter(b=>ids.includes(String(b.team?.id))).map(b=>({teamId:String(b.team.id),values:Object.fromEntries((b.statistics||[]).filter(s=>typeof s.name==='string'&&typeof s.displayValue==='string').map(s=>[s.name,s.displayValue]))}));
 const injuries=(summary.injuries||[]).filter(b=>ids.includes(String(b.team?.id))).flatMap(b=>(b.injuries||[]).filter(r=>r.athlete?.displayName&&typeof r.status==='string'&&Number.isFinite(Date.parse(r.date))&&Date.parse(r.date)<=now+300000&&now-Date.parse(r.date)<=14*86400000).map(r=>({teamId:String(b.team.id),player:r.athlete.displayName,position:r.athlete.position?.abbreviation||'',status:r.status,reportedAt:r.date})));
 return {...g,checkedAt:new Date(now).toISOString(),status:'ok',probabilities,statistics,injuries,evidence:[],recentResults:[],leaders:[]};
}
const link=(url,text)=>safeLink(url)?'<a href="'+esc(safeLink(url))+'" target="_blank" rel="noopener noreferrer">'+esc(text)+'</a>':'';
function analystHTML(g,now=Date.now()){
 const coverage=g.analystCoverage,at=Date.parse(coverage?.checkedAt),current=Date.parse(g.startAt)>now&&coverage?.status==='ok'&&Number.isFinite(at)&&at<=now+300000&&now-at<=7200000;
 const safe=u=>{try{const v=new URL(u);return v.protocol==='https:'&&['covers.com','www.covers.com','www.sportsbookreview.com'].includes(v.hostname)?v.href:''}catch{return ''}};
 const groups=current?(g.analystConsensus||[]).filter(row=>row.picks?.length&&row.picks.every(p=>safe(p.sourceUrl)&&p.author&&p.checkedAt===coverage.checkedAt&&p.startAt===g.startAt&&p.eventId===g.eventId)):[];
 const best=[...groups].sort((a,b)=>(b.total-a.total)||Number(b.market==='moneyline')-Number(a.market==='moneyline'))[0];
 const source=safe('https://www.covers.com/picks/'+(g.sport||''));
 const sbr=safe('https://www.sportsbookreview.com/picks/'+(g.sport==='ncaaf'?'college-football':g.sport||'')+'/');
 const sourceLinks=[source&&'<a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Covers</a>',sbr&&'<a href="'+esc(sbr)+'" target="_blank" rel="noopener noreferrer">Sportsbook Review</a>'].filter(Boolean).join(' · ');
 const age=current?Math.max(0,Math.floor((now-at)/60000)):0;
 const emptyLabel=!coverage?'Not checked yet':coverage.status==='unavailable'?'Analyst sources unavailable':!current?'Source refresh pending':'No matched picks';
 const emptyCaption=current?'Sources checked '+(age<1?'just now':age+'m ago')+' · No published opinion matched this game.':coverage?.status==='unavailable'?'Analyst lookup failed. Scheduled retry pending.':'Waiting for a current analyst lookup.';
 const signal='<div class="intel-signal"><span class="intel-eyebrow">Analyst consensus</span><div class="intel-value">'+esc(best?.label||emptyLabel)+'</div><span class="intel-caption">'+(best?esc((best.selection?best.selection+' · ':'')+best.agree+' of '+best.total+' analysts at this line'):esc(emptyCaption)+' '+sourceLinks)+'</span></div>';
 let details='';
 if(groups.length)details='<details data-intel-detail="published-analysts"><summary><span>Published analyst picks</span><span class="intel-detail-count">'+groups.length+' market'+(groups.length===1?'':'s')+'</span></summary>'+groups.map(row=>'<div class="intel-section-title">'+esc(row.player||row.market.replaceAll('_',' '))+' · '+esc(row.label)+' · '+row.agree+' of '+row.total+'</div><ul>'+row.picks.map(p=>'<li><span>'+esc(p.author)+' · '+esc(p.selection)+'</span><b>'+esc((p.odds>0?'+':'')+p.odds)+'</b><small><a href="'+esc(safe(p.sourceUrl))+'" target="_blank" rel="noopener noreferrer">'+esc(p.source||'Covers')+'</a> · '+(p.publishedLabel==='Time not shown'?'Publication time not shown': 'Published '+esc(p.publishedLabel)+' (source label)')+' · Checked '+esc(new Date(p.checkedAt).toLocaleTimeString())+'</small></li>').join('')+'</ul>').join('')+'<p class="intel-meta">Agreement at the published line, not win probability or proven value. One vote per analyst per exact market. Relative publication times are shown as supplied by the source. Research only · Does not change picks.</p></details>';
 return {signal,details};
}
function additionalHTML(g,now=Date.now()){
 if((g.sport||'nfl')==='nfl'||Date.parse(g.startAt)<=now)return '';
 const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['official.nba.com','ak-static.cms.nba.com','www.rotowire.com','www.dailyfaceoff.com','baseballsavant.mlb.com','www.ufc.com','ufc.com','www.actionnetwork.com','www.teamrankings.com','www.secsports.com','stats.vsinstats.com','vsin.com'].includes(u.hostname)?u.href:''}catch{return ''}};
 const freshRow=(at,hours=2)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now+300000&&now-Date.parse(at)<=Math.min(48,hours)*3600000;
 const rows=(g.additionalIntel||[]).filter(r=>safe(r.sourceUrl)&&r.text&&freshRow(r.checkedAt,r.maxAgeHours||2));
 const checks=(g.additionalSourceChecks||[]).filter(r=>safe(r.sourceUrl)&&freshRow(r.checkedAt));
 if(!rows.length&&!checks.length)return '';
 let h='<details data-intel-detail="additional-sources"><summary><span>Additional sources</span><span class="intel-detail-count">'+rows.length+' matched fact'+(rows.length===1?'':'s')+'</span></summary>';
 if(rows.length)h+='<ul>'+rows.map(r=>'<li><span>'+esc(r.label)+'</span><b>'+esc(r.source)+'</b><small>'+esc(r.text)+'<br><a href="'+esc(safe(r.sourceUrl))+'" target="_blank" rel="noopener noreferrer">Source</a> · Checked '+esc(new Date(r.checkedAt).toLocaleString())+(r.publishedAt?' · Report '+esc(new Date(r.publishedAt).toLocaleString()):'')+'</small></li>').join('')+'</ul>';
 if(checks.length)h+='<details class="intel-source-health"><summary>Source coverage</summary><ul>'+checks.map(r=>'<li><span><a href="'+esc(safe(r.sourceUrl))+'" target="_blank" rel="noopener noreferrer">'+esc(r.source)+'</a></span><b class="intel-status-pill" data-tone="'+(r.state==='available'?'ready':r.state==='review_only'?'review':'muted')+'">'+esc(r.state==='available'?'Available':r.state==='review_only'?'Review source':'Access unavailable')+'</b>'+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</li>').join('')+'</ul></details>';
 return h+'<p class="intel-meta">Availability reports do not confirm starters. Statistics describe past performance. These facts stay separate from analyst votes and model projections.</p></details>';
}
function rawGameHTML(g,now=Date.now(),sourceOK=true){
 const teams=[...g.teams].sort((a,b)=>(a.side==='away'?0:1)-(b.side==='away'?0:1));
 const name=id=>teams.find(t=>t.id===id)?.code||id;
 const date=value=>{const d=new Date(value);return Number.isFinite(+d)?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Date unavailable'};
 const stamp=new Date(g.checkedAt).toLocaleString();
 const age=Math.max(0,Math.floor((now-Date.parse(g.checkedAt))/60000));
 if(!sourceOK||!fresh(g,now)){const analysts=(g.sport||'nfl')==='nfl'?null:analystHTML(g,now);return '<div class="intel-unavailable"><b>Current ESPN evidence unavailable</b><p>Last checked '+esc(stamp)+'. Refresh pending.</p>'+link(g.url,'View matchup on ESPN')+'</div>'+(analysts?'<div class="intel-signals">'+analysts.signal+'</div><div class="intel-disclosures">'+analysts.details+additionalHTML(g,now)+'</div>':'')}
 let html='<div class="intel-status"><span>'+((g.sport||'nfl')==='nfl'?'Research only · Does not change picks':'Matchup context · Prop availability screened separately')+'</span><span title="'+esc(stamp)+'">Checked '+(age<1?'just now':esc(age)+'m ago')+'</span></div>';
 const probabilities=[...(g.probabilities||[])].sort((a,b)=>b.percent-a.percent);
 const favorite=probabilities.length===2&&probabilities[0].percent>probabilities[1].percent?probabilities[0]:null;
 const picks=g.expertPicks||[],votes={};picks.forEach(p=>{if(p.winnerId)votes[p.winnerId]=(votes[p.winnerId]||0)+1});
 const leaders=Object.entries(votes).sort((a,b)=>b[1]-a[1]);
 const leader=leaders.length&&(!leaders[1]||leaders[0][1]>leaders[1][1])?leaders[0]:null;
 html+='<div class="intel-signals"><div class="intel-signal"><span class="intel-eyebrow">ESPN win probability</span>';
 if(favorite){html+='<div class="intel-value">'+esc(name(favorite.teamId))+' <strong>'+esc(favorite.percent.toFixed(1))+'%</strong></div><div class="intel-meter" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,favorite.percent))+'%"></i></div><span class="intel-caption">'+esc(name(probabilities[1].teamId))+' '+esc(probabilities[1].percent.toFixed(1))+'% · Game winner only</span>'}
 else html+='<div class="intel-value">'+(probabilities.length===2?'Even matchup':'Unavailable')+'</div><span class="intel-caption">Game winner probability</span>';
 if((g.sport||'nfl')==='nfl'){
 html+='</div><div class="intel-signal"><span class="intel-eyebrow">Analyst picks</span><div class="intel-value">'+(leader?esc(name(leader[0]))+' <strong>'+leader[1]+' of '+picks.length+'</strong>':picks.length?'Split picks':'Unavailable')+'</div><span class="intel-caption">'+(leader?(favorite&&favorite.teamId!==leader[0]?'Analysts differ from ESPN model':leader[1]===picks.length?'All listed analysts agree':'Analysts are not unanimous'):picks.length?'No single-team consensus':'No current score picks')+'</span></div></div>';
 }else html+='</div>'+analystHTML(g,now).signal+'</div>';
 const evidence=(g.evidence||[]).filter(r=>safeLink(r.url)&&['Availability','Matchup','Prop context'].includes(r.label)&&(!r.publishedAt||(Number.isFinite(Date.parse(r.publishedAt))&&Date.parse(r.publishedAt)<=now+300000&&now-Date.parse(r.publishedAt)<= (r.kind==='Preview report'?7:14)*86400000))).slice(0,3);
 if(evidence.length)html+='<div class="intel-takeaways" aria-label="Matchup evidence">'+evidence.map(r=>'<div class="intel-takeaway" data-tone="'+(r.label==='Availability'?statusTone((r.text.match(/—\s*(Out|Doubtful|Questionable|Inactive|Suspended)\b/i)||[])[1]||''):'muted')+'"><span class="intel-eyebrow">'+esc(r.label)+'</span><p>'+esc(r.text)+'</p><span class="intel-caption">'+esc(r.kind)+(r.publishedAt?' · '+esc(date(r.publishedAt)):'')+' · '+link(r.url,'Source')+'</span>'+(r.caveat?'<span class="intel-caveat">'+esc(r.caveat)+'</span>':'')+'</div>').join('')+'</div>';
 const sport=g.sport||'nfl';
 const football=[['totalPointsPerGame','Points scored'],['totalPointsPerGameAllowed','Points allowed'],['rushingYardsPerGame','Rushing yards'],['rushingYardsPerGameAllowed','Rushing yards allowed'],['passingYardsPerGame','Passing yards'],['passingYardsPerGameAllowed','Passing yards allowed']];
 const metrics=({nba:[['avgPoints','Points scored'],['avgPointsAgainst','Points allowed'],['avgRebounds','Rebounds'],['avgAssists','Assists'],['fieldGoalPct','Field goal %'],['threePointFieldGoalPct','3-point %']],nhl:[['avgGoals','Goals scored'],['avgGoalsAgainst','Goals allowed'],['avgShots','Shots'],['avgShotsAgainst','Shots allowed'],['powerPlayPct','Power play %'],['penaltyKillPct','Penalty kill %']],mlb:[['runs','Runs'],['avg','Batting average'],['onBasePct','On-base %'],['slugAvg','Slugging'],['ERA','ERA'],['WHIP','WHIP']],ufc:[]})[sport]||football;
 const available=metrics.filter(([key])=>g.statistics?.some(s=>s.values[key]!=null));
 if(sport==='ufc')html+='<div class="intel-evidence"><div class="intel-section-title">'+esc(g.eventName||'Fight matchup')+'</div>'+teams.map(t=>'<p>'+esc(t.name)+(t.record?' · '+esc(t.record):'')+'</p>').join('')+'<p class="intel-meta">Fight listing only · Probability and injuries unavailable.</p></div>';
 const table=rows=>'<table><thead><tr><th scope="col">Statistic</th>'+teams.map(t=>'<th scope="col">'+esc(t.code)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([key,title])=>'<tr><th scope="row">'+title+'</th>'+teams.map(t=>'<td>'+esc(g.statistics?.find(s=>s.teamId===t.id)?.values[key]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 if(available.length&&!evidence.length)html+='<div class="intel-evidence"><div class="intel-section-title">Matchup comparison <span>Season statistics</span></div>'+table(available.slice(0,2))+'</div>';
 const qb=(g.injuries||[]).filter(r=>r.position==='QB'&&/out|doubtful|questionable|inactive/i.test(r.status));
 if(qb.length&&!evidence.some(r=>r.label==='Availability'))html+='<div class="intel-alert"><b>QB availability</b><span>'+qb.map(r=>esc(name(r.teamId)+' · '+r.player+' — '+r.status)).join('; ')+'</span></div>';
 html+='<div class="intel-disclosures">';
 if((g.sport||'nfl')!=='nfl')html+=analystHTML(g,now).details+additionalHTML(g,now);
 const recent=(g.recentResults||[]).filter(r=>teams.some(t=>t.id===r.teamId));
 if(recent.length)html+='<details data-intel-detail="recent"><summary><span>Recent results</span><span class="intel-detail-count">Last 5 available</span></summary>'+recent.map(r=>'<div class="intel-section-title">'+esc(name(r.teamId))+'</div><ul>'+r.games.filter(v=>Number.isFinite(Date.parse(v.date))&&Date.parse(v.date)<now).slice(0,5).map(v=>'<li><span>'+esc(date(v.date)+' · '+v.opponent)+'</span><b>'+esc(v.result+' · '+v.score)+'</b></li>').join('')+'</ul>').join('')+'</details>';
 const playerLeaders=(g.leaders||[]).filter(r=>teams.some(t=>t.id===r.teamId)).slice(0,6);
 if(playerLeaders.length)html+='<details data-intel-detail="leaders"><summary><span>Season leaders</span><span class="intel-detail-count">Player context</span></summary><ul>'+playerLeaders.map(r=>'<li><span>'+esc(name(r.teamId)+' · '+r.player)+'</span><b>'+esc(r.category+' · '+r.value)+'</b></li>').join('')+'</ul><p class="intel-meta">Season totals · Does not confirm starters or forecast the next game.</p></details>';
 if(picks.length)html+='<details data-intel-detail="analysts"><summary><span>Analyst score picks</span><span class="intel-detail-count">'+picks.length+' analysts</span></summary><ul>'+picks.map(p=>'<li><span>'+esc(p.author)+'</span><b>'+teams.map(t=>esc(t.code)+' '+esc(p.scores[t.id]??'—')).join(' · ')+'</b></li>').join('')+'</ul><p class="intel-meta">'+link(g.expertSource?.url,'ESPN weekly preview')+' · '+esc(date(g.expertSource?.publishedAt))+'<br>Editorial picks, not model probabilities or measured hit rates.</p></details>';
 if(available.length&&(evidence.length||available.length>2))html+='<details data-intel-detail="stats"><summary><span>'+ (evidence.length?'Matchup statistics':'More matchup stats') +'</span><span class="intel-detail-count">Season statistics</span></summary>'+table(evidence.length?available:available.slice(2))+'</details>';
 if(sport!=='ufc')html+='<details class="intel-injuries" data-intel-detail="injuries"><summary><span>Injury reports</span><span class="intel-detail-count">'+(g.injuries?.length||0)+' reported</span></summary><ul>'+(g.injuries||[]).map(r=>'<li><span>'+esc(name(r.teamId)+' · '+r.player+' '+r.position)+'</span><b class="intel-status-pill" data-tone="'+statusTone(r.status)+'">'+esc(r.status)+'</b><small>Reported '+esc(new Date(r.reportedAt).toLocaleString())+'</small></li>').join('')+'</ul><p class="intel-meta">No report ≠ confirmed availability. Check report dates.</p></details>';
 html+='</div>';
 const sources=[link(g.url,'ESPN matchup'),link(g.expertSource?.url,'Weekly picks'+(g.expertSource?.publishedAt?' · '+date(g.expertSource.publishedAt):'')),link(g.preview?.url,'Game preview'+(g.preview?.publishedAt?' · '+date(g.preview.publishedAt):''))].filter(Boolean);
 html+='<div class="intel-sources"><span>Sources</span>'+sources.join('<span aria-hidden="true">·</span>')+'</div>';
 return html;
}
function statusTone(status){return /out|inactive|suspended|doubtful/i.test(status)?'out':/questionable|unknown|unconfirmed|day.to.day/i.test(status)?'review':/^(available|active|confirmed)$/i.test(status)?'ready':'muted'}
const categories={'additional-sources':'players',injuries:'players',leaders:'players',recent:'matchup',stats:'matchup',analysts:'analysts','published-analysts':'analysts'};
function gameHTML(g,now=Date.now(),sourceOK=true){
 const raw=rawGameHTML(g,now,sourceOK);
 const tabs=[['overview','Overview'],['players','Players'],['matchup','Matchup'],['analysts','Analysts']];
 return '<div class="intel-research" data-intel-view="overview"><nav class="intel-tabs" aria-label="Research views">'+tabs.map(([id,label])=>'<button type="button" data-intel-view-button="'+id+'" aria-pressed="'+(id==='overview')+'">'+label+'</button>').join('')+'</nav>'+raw.replace(/<details([^>]*data-intel-detail="([^"]+)"[^>]*)>/g,(_,attrs,id)=>'<details'+attrs+' data-intel-category="'+(categories[id]||'matchup')+'">')+'<p class="intel-view-empty" hidden>No current evidence in this view. Use Sources for more detail.</p></div>';
}
function selectView(research,view){
 if(!research||!['overview','players','matchup','analysts'].includes(view))return;
 research.dataset.intelView=view;
 for(const button of research.querySelectorAll('[data-intel-view-button]'))button.setAttribute('aria-pressed',String(button.dataset.intelViewButton===view));
 const details=[...research.querySelectorAll('[data-intel-category]')],shown=details.filter(d=>d.dataset.intelCategory===view);
 for(const d of details)d.hidden=d.dataset.intelCategory!==view;
 if(shown.length&&!shown.some(d=>d.open))shown[0].open=true;
 const empty=research.querySelector('.intel-view-empty');if(empty)empty.hidden=view==='overview'||shown.length>0;
}
if(typeof document!=='undefined'){
 const feeds={},pending=new Set(),attempts={},liveState={};
 let feed=null,host,selected='',signature='',renderedGame='',selectedView='overview';
 function render(){
  if(!host)return;const sport=window.__ACTIVE_SPORT||'nfl';const heading=host.querySelector('.intel-title');if(heading)heading.textContent=sport==='nfl'?'ESPN Matchup Intel':'Matchup Intel';host.hidden=!SPORTS.includes(sport);if(host.hidden)return;feed=feeds[sport]||null;if(!attempts[sport]&&!pending.has(sport))refresh(sport);
  const day=window.SLATE_UI?.day|| (v=>new Date(v).toLocaleDateString('en-CA'));
  const date=window.SLATE_UI?.date(sport)||day(Date.now());const rows=gamesFor(feed,date,day);
  if(!rows.some(g=>g.eventId===selected))selected=rows[0]?.eventId||'';
  const key=JSON.stringify([sport,feed?.lastAttemptAt,date,selected,rows.map(g=>[g.eventId,g.checkedAt,fresh(g)]),feed?.status,liveState[sport+'|'+selected]?.status,Math.floor(Date.now()/60000)]);if(key===signature)return;signature=key;
  const content=host.querySelector('.intel-content');
  if(!feed&&pending.has(sport)){content.innerHTML='<p class="intel-meta">Looking up ESPN matchups…</p>';return}
  if(!feed){content.innerHTML='<p class="intel-meta">ESPN unavailable · Retrying automatically.</p>';return}
  if(!rows.length){content.innerHTML='<p class="intel-meta">'+(feed.status==='unavailable'?'ESPN lookup unavailable.':'No upcoming ESPN matchups on this date.')+'</p>';return}
  const expanded=renderedGame===selected?[...content.querySelectorAll('details[open][data-intel-detail]')].map(el=>el.dataset.intelDetail):[];
  const state=liveState[sport+'|'+selected]||{};
  content.innerHTML='<label class="intel-select">Matchup<select aria-label="ESPN matchup">'+rows.map(g=>'<option value="'+esc(g.eventId)+'"'+(g.eventId===selected?' selected':'')+'>'+esc([...g.teams].sort((a,b)=>a.side==='away'?-1:1).map(t=>t.code).join(sport==='ufc'?' vs ':' at '))+'</option>').join('')+'</select></label><div class="intel-refresh"><button type="button" data-intel-refresh'+(state.status==='loading'?' disabled':'')+'>Refresh matchup intel</button><span role="status">'+esc(state.status==='loading'?'Checking ESPN…':state.status==='error'?'ESPN unavailable · Showing saved intel':state.status==='ok'?'Checked ESPN just now':'ESPN lookup on demand')+'</span></div>'+gameHTML(rows.find(g=>g.eventId===selected),Date.now(),feed.status!=='unavailable');
  if(renderedGame!==selected)selectedView='overview';renderedGame=selected;for(const detail of content.querySelectorAll('details[data-intel-detail]'))detail.open=expanded.includes(detail.dataset.intelDetail);
  selectView(content.querySelector('.intel-research'),selectedView);
  for(const button of content.querySelectorAll('[data-intel-view-button]'))button.addEventListener('click',()=>{selectedView=button.dataset.intelViewButton;selectView(content.querySelector('.intel-research'),selectedView)});
  content.querySelector('select').addEventListener('change',e=>{selected=e.target.value;render()});
  content.querySelector('[data-intel-refresh]').addEventListener('click',()=>refreshSelected(sport,selected));
 }
 async function refreshSelected(sport,eventId){
  const key=sport+'|'+eventId,state=liveState[key]||{};if(state.status==='loading'||Date.now()-(state.at||0)<60000)return;
  const g=feeds[sport]?.games?.find(row=>row.eventId===eventId);if(!g)return;
  liveState[key]={status:'loading',at:Date.now()};signature='';render();
  try{
   const league={nfl:'football/nfl',nba:'basketball/nba',nhl:'hockey/nhl',mlb:'baseball/mlb',ncaaf:'football/college-football',ufc:'mma/ufc'}[sport];
   const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/'+league+'/summary?event='+encodeURIComponent(eventId),{cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('ESPN unavailable');const updated=normalizeLiveSummary(g,await response.json());if(!updated)throw Error('Matchup identity mismatch');
   feeds[sport]={...feeds[sport],status:'ok',games:feeds[sport].games.map(row=>row.eventId===eventId?updated:row)};
   liveState[key]={status:'ok',at:Date.now()};
  }catch{liveState[key]={status:'error',at:Date.now()}}finally{signature='';render()}
 }
 async function refresh(sport=window.__ACTIVE_SPORT||'nfl'){if(!SPORTS.includes(sport)||pending.has(sport))return;pending.add(sport);attempts[sport]=Date.now();try{const r=await fetch('data/espn-intel-'+sport+'.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP');const d=await r.json();if(d.schemaVersion!==1||!Array.isArray(d.games)||(d.sport&&d.sport!==sport)||d.games.some(g=>g.sport&&g.sport!==sport))throw Error('Schema');feeds[sport]=d}catch{if(feeds[sport])feeds[sport]={...feeds[sport],status:'unavailable'}}finally{pending.delete(sport);signature='';render()}}

 function mount(){const results=document.querySelector('#results');if(!results)return;host=document.createElement('section');host.id='espnIntel';host.className='espn-intel';host.innerHTML='<details class="parlay-card"><summary class="intel-title">Matchup Intel</summary><div class="intel-content"><p class="intel-meta">Looking up ESPN matchups…</p></div></details>';results.after(host);new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['data-sport']});document.addEventListener('change',()=>setTimeout(render,0));document.addEventListener('click',e=>{if(e.target.closest('#slateControls'))setTimeout(render,0)});refresh();setInterval(()=>{if(!document.hidden)refresh()},300000);setInterval(render,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()})}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
}
return {SPORTS,safeLink,fresh,gamesFor,gameHTML,analystHTML,additionalHTML,statusTone,categories,normalizeLiveSummary};
});
