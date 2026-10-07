(()=>{'use strict';
const C=window.BANKROLL_FEED_CORE,Q=window.PICK_QUALITY,G=window.MARKET_GUARDS,KEY='sportsBankrollSwipe:v1';
let root,rows=[],sources={},state={version:1,passed:[],records:[]},date='upcoming',sport='all',view='feed',notice='',history=[],loading=false,sequence=0,loadedAt=0;
const quoteTokens=new Map();
const esc=x=>G.esc(String(x??'')),fmt=o=>o>0?'+'+o:String(o),active=()=>window.__ACTIVE_SPORT==='bankroll';
try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===1&&Array.isArray(x.passed)&&Array.isArray(x.records)){state={version:1,passed:x.passed.filter(r=>typeof r.id==='string'&&Date.now()-r.at<7*86400000).slice(-500),records:x.records.filter(r=>typeof r.id==='string'&&Q.odds(r.odds)&&['pending','won','lost','void'].includes(r.status)).slice(-500)}}}catch{}
function write(next){try{localStorage.setItem(KEY,JSON.stringify(next));state=next;return true}catch{notice='Storage is unavailable. This action was not saved.';return false}}
function available(){return C.eligible(rows,{date,sport,excludedEvents:state.records.map(r=>r.eventId).filter(Boolean),excluded:[...state.passed.map(r=>r.id),...state.records.map(r=>r.pickId)]})}
function current(){return available()[0]}
function time(r){return new Date(C.start(r)).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}
function book(r){return window.CAESARS_COMPARE?.lookup?.(quoteTokens.get(C.id(r)))||null}
function json(file){return fetch('data/'+file+'?ts='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json()})}
function collect(s,d,ctx){
 const at=d.updated_at||d.generated_at;let markets=[],games=[];
 if(s==='nfl'){games=d.games||[];markets=games.flatMap(g=>(g.markets||[]).map(m=>({...m,game_id:g.id,game_label:g.away+' vs '+g.home,kickoff:g.commence_time,quotedAt:at,game_status:g.game_status})));}
 else markets=(d.markets||[]).map(m=>({...m,quotedAt:at}));
 if(['mlb','ncaaf'].includes(s))window.TEAM_ALT_LINES?.classify?.(s,markets,at);
 if(s==='nhl')window.NHL_ALT_LINES?.classify?.(markets,at);
 if(s==='ufc'){const months={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};markets=markets.map(m=>{const x=String(m.event_ticker||'').match(/-(\d{2})([A-Z]{3})(\d{2})/),day=x?'20'+x[1]+'-'+String(months[x[2]]).padStart(2,'0')+'-'+x[3]:'';return {...m,start_time:d.cards?.[day]?.firstBell||null}})}
 Q.prepare(s,markets,ctx||{},games,at);
 return markets.flatMap(m=>{
  try{
   const g=s==='nfl'?games.find(g=>g.id===m.game_id):null;
   const forecast=s==='nfl'?window.NFL_MODEL_V3?.evaluate?.(g,m):s==='mlb'?window.MLB_DASHBOARD?.snapshotForecast?.(m,ctx):s==='ncaaf'?window.NCAAF_DASHBOARD?.snapshotForecast?.(m,ctx):s==='nhl'?window.NHL_MODEL?.estimate?.(m,ctx):window.UFC_DASHBOARD?.snapshotForecast?.(m,d.fighter_stats||{});
   if(!forecast)return [];
   if(m.isAltLine&&(s==='nhl'?!window.NHL_ALT_LINES?.qualifies?.(m,forecast):['mlb','ncaaf'].includes(s)&&!window.TEAM_ALT_LINES?.qualifies?.(s,m,forecast)))return [];
   if(s==='ufc'&&m.kind!=='moneyline')return [];
   const row={sport:s,market:m,forecast,game:g,label:s==='mlb'?window.MLB_DASHBOARD.pickLabel(m):m.label||m.name,event:m.game_label||m.fight||'',snapshotAt:at};
   if(!C.decision(row).quality.pass)return [];
   row.media=s==='mlb'?'':window.SPORT_MEDIA?.[s]?.(s==='ncaaf'?{...m,college_teams:ctx?.games?.[m.game_id]?[ctx.games[m.game_id].away,ctx.games[m.game_id].home]:[]}:m)||'';
   return [row];
  }catch{return []}
 });
}
async function refresh(){
 if(!active())return;mount();const request=++sequence,token=window.__SPORT_TOKEN;loading=true;notice='';render();
 const files=[...C.sports.map(s=>'kalshi-'+s+'.json'),'mlb-context.json','ncaaf-context.json','nhl-context.json'];
 const results=await Promise.allSettled(files.map(json));
 if(!active()||token!==window.__SPORT_TOKEN||request!==sequence)return;
 const data=Object.fromEntries(files.map((f,i)=>[f,results[i].status==='fulfilled'?results[i].value:null]));
 const next=[];sources={};
 for(const s of C.sports){const d=data['kalshi-'+s+'.json'],ctx=data[s+'-context.json'];sources[s]=!d?'Unavailable':!G.fresh(d,.5)?'Stale':(['mlb','ncaaf','nhl'].includes(s)&&(!ctx||!G.fresh(ctx,12)))?'Context unavailable':'Fresh';if(sources[s]==='Fresh')next.push(...collect(s,d,ctx));}
 rows=next;loading=false;loadedAt=Date.now();render();
}
function pricing(r){const d=C.decision(r,book(r));return '<span class="bankroll-evidence">'+(d.ready?'Validated · Price qualifies':'Paper tracking')+'</span><p class="bankroll-price-state">'+(d.ready?'Verified price meets the conservative threshold':d.offered?(d.quality.validated&&!d.quality.warnings.length&&d.minimum!=null?'Caesars price verified · Below the minimum price':'Caesars price verified · Model/lineup validation pending'):'Price check needed · Reference price shown')+'</p>'}
function render(){
 if(!root||!active())return;const list=available(),r=list[0],stats=C.summary(state.records);
 const options='<option value="all">All sports</option>'+C.sports.map(s=>'<option value="'+s+'"'+(sport===s?' selected':'')+'>'+s.toUpperCase()+'</option>').join('');
 root.innerHTML='<header class="bankroll-feed-head"><div><span class="bankroll-kicker">STRAIGHT PICKS</span><h2>'+(view==='saved'?'Saved paper picks':'One pick at a time')+'</h2></div><button type="button" data-bank-action="'+(view==='saved'?'feed':'saved')+'">'+(view==='saved'?'Back to picks':'Saved · '+state.records.length)+'</button></header><p class="bankroll-intro">Paper tracking first. Saving a pick does not place a bet or change your bankroll.</p><div class="bankroll-filters"><label>Sport<select id="bankrollSport">'+options+'</select></label><label>Date<select id="bankrollDate"><option value="upcoming"'+(date==='upcoming'?' selected':'')+'>Next 7 days</option><option value="today"'+(date==='today'?' selected':'')+'>Today</option></select></label><button type="button" data-bank-action="refresh"'+(loading?' disabled':'')+'>'+(loading?'Refreshing…':'Refresh')+'</button></div><p class="bankroll-notice" role="status">'+esc(notice)+'</p>';
 if(view==='saved'){
  root.innerHTML+='<div class="bankroll-paper-stats"><span>'+stats.settled+' settled</span><span>'+stats.wins+' wins</span><span>'+(stats.profit>=0?'+':'')+stats.profit.toFixed(2)+'u paper P/L</span><span>Paper ROI '+(stats.roi==null?'—':(stats.roi*100).toFixed(1)+'%')+'</span></div><p class="bankroll-muted">Each saved pick simulates 1 unit at its frozen price. These are paper results, not actual betting returns.</p><div class="bankroll-saved-list">'+(state.records.length?state.records.slice().reverse().map(b=>'<article class="bankroll-saved-card"><small>'+esc(b.sport.toUpperCase()+' · '+b.status)+'</small><h3>'+esc(b.label)+'</h3><p>'+esc(b.event)+' · '+esc(b.oddsSource)+' '+fmt(b.odds)+'</p><small>Saved '+esc(new Date(b.createdAt).toLocaleString())+' · '+esc(b.evidence)+'</small><div class="bankroll-settle">'+(b.status==='pending'?['won','lost','void'].map((s,i)=>'<button type="button" data-paper-id="'+esc(b.id)+'" data-paper-result="'+s+'">'+['Win','Loss','Void'][i]+'</button>').join(''):'<button type="button" data-paper-id="'+esc(b.id)+'" data-paper-result="pending">Undo result</button>')+'</div></article>').join(''):'<p class="bankroll-empty">Save a card to start your paper history.</p>')+'</div>';
 }else if(r){
  r.token=window.CAESARS_COMPARE?.register(r.sport,r.market)||'';quoteTokens.set(C.id(r),r.token);const d=C.decision(r,book(r));
  root.innerHTML+='<div class="bankroll-progress">'+list.length+' available · One pick per event · No forced bets</div><div class="bankroll-card-stage"><article class="bankroll-swipe-card" tabindex="0" aria-label="'+esc(r.label)+'. Swipe right to save a paper pick or left to pass."><div class="bankroll-card-top"><span>'+r.sport.toUpperCase()+'</span><div id="bankrollPricing">'+pricing(r)+'</div></div><div class="bankroll-pick-media">'+r.media+'</div><h3>'+esc(r.label)+'</h3><p class="bankroll-matchup">'+esc(r.event)+'<br>'+esc(time(r))+'</p><div class="bankroll-quote market-tile" data-caesars-id="'+esc(r.token)+'"><small>Reference price</small><strong>'+esc(Q.quoteLabel(r.sport,r.market))+'</strong></div><p class="bankroll-threshold">'+(d.minimum==null?'Price floor unavailable for a market-anchored estimate':'Provisional minimum odds: '+fmt(d.minimum)+' or better')+'</p><p class="bankroll-confidence">'+(d.quality.validated?'Validated estimate':'Model unvalidated · Value unverified')+'</p><details class="bankroll-reasons"><summary>Why this pick?</summary><p>'+esc(d.quality.warnings.join(' · ')||'Fresh quote and independently calibrated projection.')+'</p><p>Ranked by conservative likelihood and model coverage. The price floor uses a selection buffer and a 2% estimated return margin; it is not a statistical confidence bound or proof of profitability.</p></details></article></div><div class="bankroll-actions"><button type="button" data-bank-action="pass">← Pass</button><button type="button" data-bank-action="save">Save paper pick →</button></div><div class="bankroll-bottom"><button type="button" data-bank-action="undo"'+(!history.length?' disabled':'')+'>Undo</button><span>Swipe left to pass · Right to save</span></div>';
 }else root.innerHTML+='<div class="bankroll-empty"><h3>'+(loading?'Checking five sport feeds…':'No qualifying picks right now')+'</h3><p>'+(loading?'Fresh prices and projections are being checked.':'Try Next 7 days or another sport. We pass when price, coverage or freshness checks fail.')+'</p><button type="button" data-bank-action="review">Review passed picks</button></div>';
 root.innerHTML+='<details class="bankroll-sources"><summary>Feed status'+(loadedAt?' · '+new Date(loadedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'')+'</summary><p>'+C.sports.map(s=>s.toUpperCase()+': '+(sources[s]||'Checking')).join(' · ')+'</p></details>';
}
function act(action){
 if(action==='saved'||action==='feed'){view=action;render();return}
 if(action==='refresh'){refresh();return}
 if(action==='review'){if(write({...state,passed:[]})){history=[];notice='Passed picks are back in the feed.'}render();return}
 if(action==='undo'){
  const last=history.at(-1);if(!last)return;
  const changed=state.records.find(b=>b.id===last.recordId&&b.status!=='pending');if(changed){notice='Undo the result before undoing this save.';render();return}
  if(write({...state,passed:state.passed.filter(p=>p.id!==last.pickId),records:state.records.filter(b=>b.id!==last.recordId)})){history.pop();notice='Last swipe undone.'}render();return;
 }
 const r=current();if(!r)return;const d=C.decision(r,book(r));if(!d.quality.pass){notice='This pick expired or no longer qualifies. Refresh the feed.';render();return}
 const pickId=C.id(r);
 if(action==='pass'){if(write({...state,passed:[...state.passed,{id:pickId,at:Date.now()}].slice(-500)})){history.push({pickId});notice='Passed. Swipe or choose the next pick.'}}
 if(action==='save'){
  const odds=d.offered?.price||d.quality.quote.odds,record={id:crypto.randomUUID(),pickId,eventId:C.event(r),sport:r.sport,label:r.label,event:r.event,start:C.start(r),createdAt:new Date().toISOString(),snapshotAt:r.snapshotAt,odds,oddsSource:d.offered?'Caesars':'Simulated '+d.quality.quote.source,modelP:d.quality.modelP,conservativeP:d.quality.conservativeP,evidence:d.quality.validated?'Validated estimate':'Unvalidated estimate',status:'pending',profit:0};
  if(write({...state,records:[...state.records,record].slice(-500)})){history.push({pickId,recordId:record.id});notice='Saved to paper tracking at '+fmt(odds)+'.'}
 }
 render();
}
function mount(){
 if(root)return;root=document.createElement('section');root.id='bankrollFeed';root.setAttribute('aria-label','Bankroll straight picks');document.querySelector('main')?.prepend(root);
 root.addEventListener('click',e=>{const button=e.target.closest('[data-bank-action]');if(button){act(button.dataset.bankAction);return}const result=e.target.closest('[data-paper-result]');if(result){const records=state.records.map(b=>b.id===result.dataset.paperId?C.paperResult(b,result.dataset.paperResult)||b:b);if(write({...state,records}))notice='Paper result saved.';render()}});
 root.addEventListener('change',e=>{if(e.target.id==='bankrollSport')sport=e.target.value;if(e.target.id==='bankrollDate')date=e.target.value;render()});
 root.addEventListener('keydown',e=>{if(!e.target.matches('.bankroll-swipe-card')||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();act(e.key==='ArrowRight'?'save':'pass')});
 let pointer=null;
 root.addEventListener('pointerdown',e=>{const card=e.target.closest('.bankroll-swipe-card');if(!card||e.target.closest('button,input,select,summary,details,a')||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,card,pickId:current()&&C.id(current())};card.setPointerCapture?.(e.pointerId)});
 root.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)>Math.abs(dy)*1.4)pointer.card.style.transform='translateX('+Math.max(-150,Math.min(150,dx))+'px) rotate('+(dx/30)+'deg)'});
 root.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const unchanged=current()&&C.id(current())===pointer.pickId,action=unchanged?C.gesture(e.clientX-pointer.x,e.clientY-pointer.y):null;pointer.card.style.transform='';pointer=null;if(action)act(action)});
 root.addEventListener('pointercancel',()=>{if(pointer)pointer.card.style.transform='';pointer=null});
 document.addEventListener('caesars-quotes-updated',()=>{if(!active()||view!=='feed')return;const r=current(),node=root.querySelector('#bankrollPricing');if(r&&node){const html=pricing(r);if(node.innerHTML!==html)node.innerHTML=html}});
}
function activate(){mount();view='feed';render();refresh()}
window.BANKROLL_FEED={activate,refresh,collect,records:()=>state.records.slice(),candidates:()=>available(),act};
document.addEventListener('DOMContentLoaded',mount,{once:true});
window.setInterval?.(()=>{if(active())refresh()},120000);
})();
