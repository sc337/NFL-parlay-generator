(()=>{'use strict';
const request=window.fetch.bind(window),sports={nfl:'americanfootball_nfl',mlb:'baseball_mlb',ncaaf:'americanfootball_ncaaf',nhl:'icehockey_nhl',ufc:'mma_mixed_martial_arts'};
const normalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const props={goals:'player_goals',assists:'player_assists',points:'player_points',shots:'player_shots_on_goal',saves:'player_total_saves',hits:'batter_hits',hrr:'batter_hits_runs_rbis',home_runs:'batter_home_runs',rbi:'batter_rbis',total_bases:'batter_total_bases',strikeouts:'pitcher_strikeouts'};
const records=new Map(),tokens=new Map(),cache=new Map(),pending=new Set();let serial=0,timer,lastKey='';
const key=()=>{try{return localStorage.getItem('nflParlayOddsApiKey')||''}catch{return ''}};
const fresh=at=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=Date.now()+300000&&Date.now()-Date.parse(at)<15*60000;
function descriptor(s,m,g){
 if(!sports[s]||s==='nfl'&&m.source&&m.source!=='Kalshi')return null;
 const names=g?[g.away,g.home]:m.teams?.map(t=>t.name)||[m.fighter1,m.fighter2].filter(Boolean);
 const teams=names.length===2?names:String(m.game_label||'').split(/\s+(?:at|@|vs)\s+/i);
 const time=g?.commence_time||m.kickoff||m.game_time||m.start_time;
 if(teams.length!==2||teams.some(t=>!t)||!Number.isFinite(Date.parse(time))||Date.parse(time)<=Date.now())return null;
 let market=s==='nfl'?m.marketKey||({h2h:'h2h',spreads:'spreads',totals:'totals',td:'player_anytime_td'}[m.type]):({moneyline:'h2h',spread:'spreads',total:'totals'}[m.kind]||props[m.kind]);
 if(!market||m.series==='KXMLBTEAMTOTAL'||/team total/i.test(m.name||m.label||''))return null;
 market=market.replace(/_alternate$/,'');
 const player=m.player||(props[m.kind]?String(m.label||'').split(':')[0]:null);
 const line=window.PICK_QUALITY?.line(m)??null;
 const side=market==='player_anytime_td'?'yes':m.side==='no'?'under':/^(over|under)$/i.test(m.side||'')?m.side.toLowerCase():/\bunder\b/i.test(m.name||m.label||'')?'under':'over';
 let team=m.team_code?m.teams?.find(t=>t.code===m.team_code)?.name:m.team;
 if(['h2h','spreads'].includes(market)&&!team){
  const label=normalize(String(m.label||m.name||'').replace(/\s+(?:wins.*|ML|moneyline|[+−-]\d.*)$/i,''));
  const matches=teams.filter(t=>label.length>=4&&(normalize(t)===label||normalize(t).startsWith(label)));
  if(matches.length===1)team=matches[0];
 }
 if(['h2h','spreads'].includes(market)&&!teams.some(t=>normalize(t)===normalize(team)))return null;
 if(market!=='h2h'&&market!=='player_anytime_td'&&!Number.isFinite(line))return null;
 return {sport:s,teams,time,market,player:player||null,team:team||null,side,line};
}
function eventMatch(d,events){
 const matches=events.filter(e=>Math.abs(Date.parse(e.commence_time)-Date.parse(d.time))<=300000&&[normalize(e.away_team),normalize(e.home_team)].sort().join('|')===d.teams.map(normalize).sort().join('|'));
 return matches.length===1?matches[0]:null;
}
function matchingQuote(d,event){
 if(!eventMatch(d,[event]))return null;
 const book=(event.bookmakers||[]).find(b=>b.key==='williamhill_us');
 const quotes=[];
 for(const market of book?.markets||[]){
  if(market.key.replace(/_alternate$/,'').replace(/^alternate_/,'')!==d.market)continue;
  const at=market.last_update||book.last_update;if(!fresh(at))continue;
  for(const outcome of market.outcomes||[]){
   if(!Number.isFinite(outcome.price)||Math.abs(outcome.price)<100)continue;
   const player=d.player&&normalize(outcome.description)===normalize(d.player);
   if(d.player&&!player)continue;
   if(d.market==='h2h'||d.market==='spreads'){if(normalize(outcome.name)!==normalize(d.team))continue}
   else if(d.market==='player_anytime_td'){if(!['yes','over'].includes(String(outcome.name).toLowerCase()))continue}
   else if(String(outcome.name).toLowerCase()!==d.side)continue;
   if(d.market!=='h2h'&&d.market!=='player_anytime_td'&&outcome.point!==d.line)continue;
   quotes.push({price:outcome.price,at});
  }
 }
 const prices=new Set(quotes.map(q=>q.price));return prices.size===1?quotes[0]:null;
}
function register(s,m){
 const d=descriptor(s,m,window.PICK_QUALITY?.gameFor(s,m));
 const identity=d?JSON.stringify(d):JSON.stringify([s,window.PICK_QUALITY?.id(s,m)||m.ticker||m.name||m.label]);let token=tokens.get(identity);
 if(!token){token='cq'+(++serial);tokens.set(identity,token);records.set(token,{d,status:d?'loading':'unavailable',quote:null})}
 schedule();return token;
}
function paint(){
 for(const node of document.querySelectorAll('[data-caesars-id]')){
  let price=node.querySelector('.caesars-quote');
  if(!key()){price?.remove();node.querySelector('.market-tile')?.classList.remove('has-caesars-price');continue}
  const record=records.get(node.dataset.caesarsId),tile=node.classList.contains('market-tile')?node:node.querySelector('.market-tile');
  if(!record||!tile)continue;
  if(!price){price=document.createElement('small');price.className='caesars-quote';tile.append(price);tile.classList.add('has-caesars-price')}
  const q=record.quote&&fresh(record.quote.at)?record.quote:null;
  const text=q?'Caesars '+(q.price>0?'+':'')+q.price:record.status==='loading'?'Caesars checking…':'Caesars unavailable';
  if(price.textContent!==text)price.textContent=text;
  price.title=q?'Exact matching line · Updated '+new Date(q.at).toLocaleTimeString():'No current exact matching Caesars quote';
 }
}
async function json(url,credential){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{url.searchParams.set('apiKey',credential);url.searchParams.set('bookmakers','williamhill_us');url.searchParams.set('oddsFormat','american');
  const response=await request(url.href,{signal:controller.signal,cache:'no-store'});if(typeof trackApiUsage==='function')trackApiUsage(response);
  if(!response.ok)throw Error('Odds API HTTP '+response.status);return await response.json();
 }finally{clearTimeout(timeout)}
}
async function cached(id,fn){const row=cache.get(id);if(row&&Date.now()-row.at<(row.error?60000:10*60000)){if(row.error)throw Error('Comparison temporarily unavailable');return row.value}try{const value=await fn();cache.set(id,{at:Date.now(),value});return value}catch(error){cache.set(id,{at:Date.now(),error:true});throw error}}
async function update(){
 const credential=key();if(credential!==lastKey){lastKey=credential;cache.clear();for(const r of records.values()){r.quote=null;r.status=r.d?'loading':'unavailable'}}
 if(!credential){paint();return}
 const s=document.body.dataset.sport||'nfl',active=[...document.querySelectorAll('[data-caesars-id]')].map(n=>records.get(n.dataset.caesarsId)).filter(r=>r?.d?.sport===s);
 if(!active.length||pending.has(s))return;pending.add(s);
 try{
  const events=await cached(credential+':'+s+':events',()=>json(new URL('https://api.the-odds-api.com/v4/sports/'+sports[s]+'/events'),credential));
  if(!Array.isArray(events))throw Error('Invalid event response');
  const groups=new Map();for(const r of new Set(active)){const event=eventMatch(r.d,events);if(!event){r.status='unavailable';continue}if(!groups.has(event.id))groups.set(event.id,[]);groups.get(event.id).push(r)}
  for(const [id,rows] of groups){
   const alternates=new Set(['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds','player_goals','player_assists','player_points','player_shots_on_goal','player_total_saves','batter_hits','batter_total_bases','batter_home_runs','batter_hits_runs_rbis','batter_rbis','pitcher_strikeouts']);
   const markets=[...new Set(rows.flatMap(r=>['spreads','totals'].includes(r.d.market)?[r.d.market,'alternate_'+r.d.market]:alternates.has(r.d.market)?[r.d.market,r.d.market+'_alternate']:[r.d.market]))].sort();
   try{
    const event=await cached(credential+':'+s+':'+id+':'+markets.join(','),()=>{const u=new URL('https://api.the-odds-api.com/v4/sports/'+sports[s]+'/events/'+id+'/odds');u.searchParams.set('markets',markets.join(','));return json(u,credential)});
    if(key()!==credential)return;
    for(const r of rows){r.quote=matchingQuote(r.d,event);r.status=r.quote?'ready':'unavailable'}
   }catch{for(const r of rows){r.quote=null;r.status='unavailable'}}
  }
 }catch{if(key()===credential)for(const r of active){r.quote=null;r.status='unavailable'}}
 finally{pending.delete(s);if(key()===credential)paint()}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{paint();update()},100)}
window.CAESARS_COMPARE={register,descriptor,eventMatch,matchingQuote,refresh:schedule};
if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-sport']});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
window.setInterval?.(schedule,60000);
})();
