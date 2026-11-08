(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.ESPN_INTEL=api;})(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='espn.com'||u.hostname.endsWith('.espn.com'))?u.href:''}catch{return ''}}
function fresh(g,now=Date.now()){const at=Date.parse(g.checkedAt);return Number.isFinite(at)&&at<=now+300000&&now-at<=7200000&&g.status==='ok'}
function gamesFor(feed,date,day,now=Date.now()){return (feed?.games||[]).filter(g=>Date.parse(g.startAt)>now&&day(g.startAt)===date)}
const link=(url,text)=>safeLink(url)?'<a href="'+esc(safeLink(url))+'" target="_blank" rel="noopener noreferrer">'+esc(text)+'</a>':'';
function gameHTML(g,now=Date.now(),sourceOK=true){
 const name=id=>g.teams.find(t=>t.id===id)?.code||id;
 const stamp=new Date(g.checkedAt).toLocaleString();
 let html='<p class="intel-meta">'+(sourceOK&&fresh(g,now)?'Checked ':'Update unavailable or older than 2 hours · Last checked ')+esc(stamp)+'</p>';
 if(!sourceOK||!fresh(g,now))return html+link(g.url,'Check matchup on ESPN');
 html+='<div class="intel-probabilities">'+(g.probabilities?.length?g.probabilities.map(p=>'<span><b>'+esc(name(p.teamId))+' '+esc(p.percent.toFixed(1))+'%</b> ESPN win probability</span>').join(''):'<span>ESPN win probability unavailable</span>')+'</div>';
 if(g.expertPicks?.length){
  const votes={};g.expertPicks.forEach(p=>{if(p.winnerId)votes[p.winnerId]=(votes[p.winnerId]||0)+1});
  const leader=Object.entries(votes).sort((a,b)=>b[1]-a[1]);
  const consensus=leader.length&&(!leader[1]||leader[0][1]>leader[1][1])?leader[0][1]+'/'+g.expertPicks.length+' pick '+name(leader[0][0]):'Split picks';
  html+='<h4>Expert score picks · '+esc(consensus)+'</h4><ul>'+g.expertPicks.map(p=>'<li><span>'+esc(p.author)+'</span><b>'+g.teams.map(t=>esc(t.code)+' '+esc(p.scores[t.id])).join(' · ')+'</b></li>').join('')+'</ul><p class="intel-meta">'+link(g.expertSource?.url,'ESPN weekly preview')+' · Published '+esc(new Date(g.expertSource?.publishedAt).toLocaleDateString())+' · Editorial picks, not model probabilities</p>';
 }else html+='<p class="intel-meta">Expert score picks not available for this matchup.</p>';
 const metrics=[['totalPointsPerGame','Points / game'],['totalPointsPerGameAllowed','Points allowed / game'],['rushingYardsPerGame','Rush yards / game'],['rushingYardsPerGameAllowed','Rush yards allowed / game'],['passingYardsPerGame','Pass yards / game'],['passingYardsPerGameAllowed','Pass yards allowed / game']];
 if(g.statistics?.length)html+='<h4>Season matchup stats</h4><table><thead><tr><th>Per game</th>'+g.teams.map(t=>'<th>'+esc(t.code)+'</th>').join('')+'</tr></thead><tbody>'+metrics.map(([key,title])=>'<tr><th>'+title+'</th>'+g.teams.map(t=>'<td>'+esc(g.statistics.find(s=>s.teamId===t.id)?.values[key]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 html+='<details class="intel-injuries"><summary>Reported injuries · '+(g.injuries?.length||0)+'</summary><ul>'+(g.injuries||[]).map(r=>'<li><span>'+esc(name(r.teamId)+' · '+r.player+' '+r.position)+'</span><b>'+esc(r.status)+'</b><small>Reported '+esc(new Date(r.reportedAt).toLocaleString())+'</small></li>').join('')+'</ul><p class="intel-meta">No report does not confirm availability.</p></details>';
 if(g.preview)html+='<p>'+link(g.preview.url,g.preview.title)+'</p><p class="intel-meta">'+esc(g.preview.byline)+' via ESPN · '+esc(new Date(g.preview.publishedAt).toLocaleDateString())+'</p>';
 return html;
}
if(typeof document!=='undefined'){
 let feed=null,host,selected='',signature='',loading=false;
 function render(){
  if(!host)return;host.hidden=(window.__ACTIVE_SPORT||'nfl')!=='nfl';if(host.hidden)return;
  const day=window.SLATE_UI?.day|| (v=>new Date(v).toLocaleDateString('en-CA'));
  const date=window.SLATE_UI?.date('nfl')||day(Date.now());const rows=gamesFor(feed,date,day);
  if(!rows.some(g=>g.eventId===selected))selected=rows[0]?.eventId||'';
  const key=JSON.stringify([feed?.lastAttemptAt,date,selected,rows.map(g=>[g.eventId,fresh(g)]),feed?.status]);if(key===signature)return;signature=key;
  const content=host.querySelector('.intel-content');
  if(!feed){content.innerHTML='<p class="intel-meta">ESPN lookup unavailable. It will retry automatically.</p>';return}
  if(!rows.length){content.innerHTML='<p class="intel-meta">'+(feed.status==='unavailable'?'ESPN lookup unavailable.':'No upcoming ESPN matchups for this date.')+'</p>';return}
  content.innerHTML='<label class="intel-select">Matchup<select aria-label="ESPN matchup">'+rows.map(g=>'<option value="'+esc(g.eventId)+'"'+(g.eventId===selected?' selected':'')+'>'+esc([...g.teams].sort((a,b)=>a.side==='away'?-1:1).map(t=>t.code).join(' at '))+'</option>').join('')+'</select></label>'+gameHTML(rows.find(g=>g.eventId===selected),Date.now(),feed.status!=='unavailable');
  content.querySelector('select').addEventListener('change',e=>{selected=e.target.value;render()});
 }
 async function refresh(){if(loading)return;loading=true;try{const r=await fetch('data/espn-intel-nfl.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP');const d=await r.json();if(d.schemaVersion!==1||!Array.isArray(d.games))throw Error('Schema');feed=d}catch{if(feed)feed={...feed,status:'unavailable'}}finally{loading=false;signature='';render()}}
 function mount(){const results=document.querySelector('#results');if(!results)return;host=document.createElement('section');host.id='espnIntel';host.className='espn-intel';host.innerHTML='<details class="parlay-card"><summary>ESPN Matchup Intel</summary><div class="intel-content"><p class="intel-meta">Looking up ESPN matchups…</p></div></details>';results.after(host);new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['data-sport']});document.addEventListener('change',()=>setTimeout(render,0));document.addEventListener('click',e=>{if(e.target.closest('#slateControls'))setTimeout(render,0)});refresh();setInterval(()=>{if(!document.hidden)refresh()},300000);setInterval(render,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()})}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
}
return {safeLink,fresh,gamesFor,gameHTML};
});
