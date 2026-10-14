(()=>{'use strict';
const SPORTS=['nfl','nhl','mlb','ncaaf','ufc'];
function start(row){return row.eventTime||row.market.game_time||row.market.start_time||row.game?.commence_time}
function eventKey(row){const m=row.market;return row.sport+'|'+(m.game_id||m.gameId||row.game?.id||m.context_game_id||m.fight||m.game_label||m.event_ticker||start(row))}
function shortlist(rows,filter='all',now=Date.now()){
 const seen=new Set();return rows.filter(r=>filter==='all'||r.sport===filter).filter(r=>r.check?.pass&&Number.isFinite(r.check.rank)&&Number.isFinite(Date.parse(r.check.quote?.checkedAt))&&now-Date.parse(r.check.quote.checkedAt)<=30*60000&&Date.parse(r.check.quote.checkedAt)<=now+300000&&Date.parse(start(r))>now&&new Date(start(r)).toDateString()===new Date(now).toDateString())
 .sort((a,b)=>b.check.rank-a.check.rank||eventKey(a).localeCompare(eventKey(b))||String(a.market.ticker||a.market.name||a.market.label).localeCompare(String(b.market.ticker||b.market.name||b.market.label)))
 .filter(r=>{const key=eventKey(r);if(seen.has(key))return false;seen.add(key);return true}).slice(0,4);
}
const core={shortlist,start,eventKey};
if(typeof module!=='undefined'&&module.exports){module.exports=core;return}
const $=s=>document.querySelector(s),G=window.MARKET_GUARDS,Q=window.PICK_QUALITY;
let rows=[],statuses={},filter='all',busy=false,sequence=0,lastSport='nfl',updated=null,timer;
const esc=s=>G.esc(String(s??''));
const active=()=>document.body.dataset.view==='home';
async function json(path){const r=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Feed unavailable');return r.json()}
async function collect(sport){
 const [snapshot,ctx]=await Promise.all([json('data/kalshi-'+sport+'.json'),sport==='nfl'||sport==='ufc'?Promise.resolve({}):json('data/'+sport+'-context.json')]);
 if(!G.fresh(snapshot,.5))return {sport,rows:[],status:'Feed delayed'};
 return {sport,snapshot,ctx,status:'Ready'};
}
function cardDay(m){const x=String(m.event_ticker||'').match(/-(\d{2})([A-Z]{3})(\d{2})/);const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];return x&&months.includes(x[2])?'20'+x[1]+'-'+String(months.indexOf(x[2])+1).padStart(2,'0')+'-'+x[3]:''}
function evaluate({sport,snapshot,ctx}){
 if(!snapshot)return [];
 let games=snapshot.games||[],markets= sport==='nfl'?games.flatMap(g=>(g.markets||[]).map(m=>({...m,gameId:g.id,game_time:g.commence_time}))):snapshot.markets||[];
 if(sport==='nhl')markets=window.NHL_ALT_LINES?.classify?.(markets)||markets;
 if(['mlb','ncaaf'].includes(sport))window.TEAM_ALT_LINES?.classify(sport,markets,snapshot.updated_at||snapshot.generated_at);
 Q.prepare(sport,markets,ctx,games,snapshot.updated_at||snapshot.generated_at);
 return markets.flatMap(m=>{
  try{
   const game=sport==='nfl'?games.find(g=>g.id===m.gameId):null;
   const eventTime=sport==='ufc'?(snapshot.cards?.[m.card_date||cardDay(m)]?.firstBell||m.start_time):m.game_time||m.start_time||game?.commence_time;
   if(!eventTime||Date.parse(eventTime)<=Date.now()||!G.pregame({...m,start_time:eventTime}))return [];
   let forecast;
   if(sport==='nfl')forecast=window.NFL_MODEL_V3?.evaluate(game,m);
   if(sport==='nhl')forecast=window.NHL_MODEL?.estimate(m,ctx);
   if(sport==='mlb')forecast=window.MLB_DASHBOARD?.snapshotForecast(m,ctx);
   if(sport==='ncaaf')forecast=window.NCAAF_DASHBOARD?.snapshotForecast(m,ctx);
   if(sport==='ufc')forecast=window.UFC_DASHBOARD?.snapshotForecast(m,snapshot.fighter_stats||{});
   if(sport==='nfl'&&game?.game_status!=='pre')return [];
   if(sport!=='nfl'){
    const prop=!!m.player||['goals','assists','points','shots','saves'].includes(m.kind);
    const minimum=sport==='ncaaf'?150:prop?25:100;
    if(Number(m.volume)<minimum||!Number.isFinite(Number(m.volume)))return [];
    if(!Number.isFinite(m.yes_bid)||m.yes_bid<=0||m.yes_bid>m.yes_ask)return [];
    if(sport==='ufc'&&(m.kind!=='moneyline'||['in','post'].includes(m.game_status)))return [];
    if(sport==='nhl'&&(m.game_status!=='pre'||!window.NHL_ALT_LINES?.qualifies(m,forecast)))return [];
    if(['mlb','ncaaf'].includes(sport)&&!window.TEAM_ALT_LINES?.qualifies(sport,m,forecast))return [];
   }
   const check=Q.assess(sport,m,forecast||{},{game,eventTime});
   return check.pass?[{sport,market:m,forecast,check,eventTime,game}]:[];
  }catch{return []}
 });
}
async function refresh(){
 if(busy||!active())return;busy=true;const request=++sequence;render();
 const results=await Promise.allSettled(SPORTS.map(collect));
 busy=false;if(request!==sequence||!active())return;
 rows=[];statuses={};
 results.forEach((result,i)=>{const sport=SPORTS[i];if(result.status!=='fulfilled'){statuses[sport]='Unavailable';return}const data=result.value;statuses[sport]=data.status;try{rows.push(...evaluate(data))}catch{statuses[sport]='Unavailable'}});
 updated=Date.now();render();
}
function matchup(row){const m=row.market;return window.DISPLAY_COPY?.matchup?.(m.game_label||m.fight||row.game&&`${row.game.away} vs ${row.game.home}`||'')||m.game_label||m.fight||'Upcoming event'}
function card(row,index){
 const m=row.market,q=row.check,label=m.name||m.label||m.title||'Straight pick';
 const date=new Date(start(row)).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 const quote=Q.quoteLabel(row.sport,m);
 const why=row.forecast?.method||row.forecast?.context?.why||'Ranked using projection coverage, price, and quote quality.';
 return `<article class="home-pick ${index===0?'home-feature':''}">${index===0?'<span class="home-kicker">BEST AVAILABLE STRAIGHT</span>':''}<div class="home-pick-meta"><span>${esc(row.sport.toUpperCase())} · ${esc(date)}</span><span>${m.isAltLine?'ALT · ':''}${esc(quote)}</span></div><h3>${esc(label)}</h3><p class="home-matchup">${esc(matchup(row))}</p><details><summary>Why this pick</summary><p>${esc(why)}</p><p>Model estimate ${Math.round(q.modelP*100)}% · ${esc(q.evidence)}. Reference price only; confirm the same line and current odds at your sportsbook.</p><p>${esc(q.warnings.join(' · '))}</p><button type="button" data-home-sport="${row.sport}">Open ${row.sport.toUpperCase()} analysis</button></details></article>`;
}
function render(){
 const host=$('#homePicks');if(!host)return;const picks=shortlist(rows,filter);
 host.innerHTML=picks.length?picks.map(card).join(''):`<div class="home-empty"><h3>${busy?'Checking today’s markets…':'No qualifying straights today'}</h3><p>${busy?'Reviewing available pregame prices and projections.':'No bet required. Check back when fresh markets qualify.'}</p></div>`;
 $('#homeUpdated').textContent=busy?'Refreshing…':updated?'Checked '+new Date(updated).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'Checking markets…';
 $('#homeRefresh').disabled=busy;
 $('#homeFeedStatus').textContent=SPORTS.map(s=>s.toUpperCase()+': '+(statuses[s]||'Checking')).join(' · ');
 $('#homeFilters').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.homeFilter===filter)));
}
function openHome(){
 if(!active())lastSport=SPORTS.includes(window.__ACTIVE_SPORT)?window.__ACTIVE_SPORT:lastSport;
 document.body.dataset.view='home';window.__ACTIVE_SPORT='home';window.__SPORT_TOKEN=(window.__SPORT_TOKEN||0)+1;
 $('#homeHub').hidden=false;$('#homeNavHome')?.setAttribute('aria-current','page');$('#homeNavSports')?.removeAttribute('aria-current');
 document.querySelectorAll('.sport-switch [data-sport]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});
 refresh();render();
}
function openSport(sport){
 if(!SPORTS.includes(sport))sport=lastSport;
 delete document.body.dataset.view;$('#homeHub').hidden=true;
 $('#homeNavHome')?.removeAttribute('aria-current');$('#homeNavSports')?.setAttribute('aria-current','page');
 window.SPORT_NAV?.activate(sport);lastSport=sport;
}
async function showResults(){
 openHome();const box=$('#homeResults');box.open=true;box.scrollIntoView({block:'nearest',behavior:'smooth'});
 try{const data=await json('data/forecast-report.json');const list=Object.entries(data.sports||{});$('#homeResultsBody').innerHTML=list.length?'<table class="home-results-table"><thead><tr><th>Sport</th><th>Settled events</th><th>Forecast accuracy</th></tr></thead><tbody>'+list.map(([sport,r])=>{const c=r.independentComparison;const verdict=c&&Number.isFinite(c.brierModel)&&Number.isFinite(c.brierMarket)?c.brierModel<c.brierMarket?'Ahead of market':c.brierModel>c.brierMarket?'Behind market':'Matches market':'Collecting evidence';return '<tr><th>'+esc(sport.toUpperCase())+'</th><td>'+esc(r.independentEvents||0)+'</td><td>'+esc(verdict)+'</td></tr>'}).join('')+'</tbody></table><p>Lower Brier error determines this comparison. Small samples do not establish a betting edge.</p>':'No settled forecast summary available yet.'}catch{$('#homeResultsBody').textContent='Results unavailable. Try again later.'}
}
function mount(){
 const root=document.createElement('section');root.id='homeHub';root.className='home-hub';root.hidden=true;
 root.innerHTML=`<div class="home-heading"><div><span class="home-kicker">TODAY’S STRAIGHTS</span><h2>Your straight-bet hub</h2></div><button type="button" id="homeRefresh">Refresh</button></div><div id="homeFilters" class="home-filters" role="group" aria-label="Filter straight picks by sport">${['all',...SPORTS].map(s=>`<button type="button" data-home-filter="${s}" aria-pressed="${s==='all'}">${s==='all'?'All':s.toUpperCase()}</button>`).join('')}</div><div class="home-caption"><span id="homeUpdated"></span><span>One pick per matchup</span></div><div id="homePicks" aria-live="polite"></div><details class="home-info"><summary>Market availability</summary><p id="homeFeedStatus"></p><p>Reference prices from Kalshi. Estimates remain experimental or unvalidated unless explicitly labeled. No guaranteed edge or earnings.</p></details><details id="homeResults" class="home-info"><summary>Forecast results</summary><p>Prospective model audit, separate from bets you placed and actual betting profit.</p><div id="homeResultsBody">Open Results to load the latest report.</div></details>`;
 $('.shell main').before(root);
 const nav=document.createElement('nav');nav.className='home-nav';nav.setAttribute('aria-label','Main navigation');nav.innerHTML='<button type="button" id="homeNavHome">Home</button><button type="button" id="homeNavSports">Sports</button><button type="button" id="homeNavResults">Results</button><button type="button" id="homeNavSettings">Settings</button>';
 $('.dashboard-footer').before(nav);
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='homeNavHome')openHome();
  else if(b.id==='homeNavSports')openSport(lastSport);
  else if(b.id==='homeNavResults')showResults();
  else if(b.id==='homeNavSettings')$('#settingsBtn')?.click();
  else if(b.id==='homeRefresh')refresh();
  else if(b.dataset.homeFilter){filter=b.dataset.homeFilter;render()}
  else if(b.dataset.homeSport)openSport(b.dataset.homeSport);
 },false);
 // Leave Home before the existing sport switch receives the click.
 document.addEventListener('click',e=>{if(e.target.closest('.sport-switch [data-sport]')&&active()){delete document.body.dataset.view;root.hidden=true;$('#homeNavHome')?.removeAttribute('aria-current');$('#homeNavSports')?.setAttribute('aria-current','page')}},true);
 $('#homeResults').addEventListener('toggle',()=>{if($('#homeResults').open&&$('#homeResultsBody').textContent.startsWith('Open Results'))showResults()});
 openHome();timer=setInterval(()=>{if(active()){render();if(!updated||Date.now()-updated>120000)refresh()}},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())refresh()});
}
window.STRAIGHTS_HOME={...core,open:openHome,refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
