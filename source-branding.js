(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.SOURCE_BRANDING=api;})(()=>{'use strict';
const names={kalshi:'Kalshi',polymarket:'Polymarket',espn:'ESPN'},feeds=new Map(),TTL=30*60000;
const assets={kalshi:['assets/sources/kalshi-light.svg','assets/sources/kalshi-dark.svg'],polymarket:['assets/sources/polymarket.svg','assets/sources/polymarket.svg'],espn:['assets/sources/espn.png','assets/sources/espn.png']};
let host,details,selected=null,frame=null;
const stamp=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};
const fresh=(at,now)=>at!==null&&now-at>=-300000&&now-at<=TTL;
const active=()=>window.__ACTIVE_SPORT||document.body.dataset.sport||'nfl';
function provider(source){const s=String(source||'').trim();return /^Kalshi\b/i.test(s)?'kalshi':/^Polymarket\b/i.test(s)?'polymarket':/\bESPN\b/i.test(s)?'espn':null}
function state(sport,id,now=Date.now()){
 const f=feeds.get(sport),base={id,name:names[id],count:0,freshCount:0,checkedAt:null,latestQuote:null,kinds:[],scheduleCount:0};
 if(!f)return {...base,tone:'unavailable',status:'Loading',description:'Waiting for this sport’s feed.'};
 const d=f.snapshot||{},rows=f.rows??(sport==='nfl'?(d.games||[]).flatMap(g=>(g.markets||[]).map(m=>({...m,kickoff:g.commence_time}))):d.markets||[]);
 const nativeAt=d.primary_updated_at||d.updated_at||f.at,group=rows.filter(m=>{
  const game=sport==='nfl'?(d.games||[]).find(g=>g.id===m.gameId):null;
  const start=stamp(m.kickoff||m.game_time||m.start_time||game?.commence_time),kind=provider(m.source||game?.dataSource||(!m.referenceOnly&&sport!=='nfl'?'Kalshi':''));
  const ask=Number(m.yes_ask??m.quoteProbability),price=Number(m.price),quoted=(ask>0&&ask<1)||(m.price!=null&&Number.isFinite(price)&&Math.abs(price)>=100);
  return kind===id&&quoted&&(start===null||start>now)&&!['in','post','Live','Final'].includes(m.game_status||game?.game_status);
 });
 const quotes=group.map(m=>stamp(m.quotedAt||(id==='kalshi'?nativeAt:null))),current=quotes.filter(t=>fresh(t,now));
 base.count=group.length;base.freshCount=current.length;base.latestQuote=quotes.filter(t=>t!==null).sort((a,b)=>b-a)[0]??null;
 base.kinds=[...new Set(group.filter((m,i)=>fresh(quotes[i],now)).map(m=>m.type||m.kind||m.marketKey).filter(Boolean))];
 let upstreamFailed=f.failed;
 if(id==='kalshi')base.checkedAt=stamp(nativeAt);
 if(id==='polymarket'){
  const p=d.polymarket||{};upstreamFailed=upstreamFailed||p.status==='unavailable';
  base.checkedAt=p.status&&p.status!=='unavailable'?stamp(p.checked_at):null;
 }
 if(id==='espn'){
  base.checkedAt=stamp(d.slate?.updated_at);
  base.scheduleCount=(d.slate?.games||[]).filter(g=>stamp(g.game_time)>now).length;
 }
 const scheduleFresh=id==='espn'&&base.scheduleCount>0&&fresh(base.checkedAt,now);
 if(current.length||scheduleFresh){
  const partial=upstreamFailed||current.length<group.length;
  return {...base,tone:partial?'warning':'fresh',status:partial?'Partial coverage':current.length?'Fresh quotes':'Fresh schedule',description:partial?'Some quotes are delayed or the last refresh failed.':'Current data available.'};
 }
 if(group.length||base.scheduleCount)return {...base,tone:'warning',status:'Delayed',description:'Available data is older than 30 minutes. Waiting for a refresh.'};
 const checked=base.checkedAt!==null;
 return {...base,tone:'unavailable',status:checked&&!upstreamFailed?'No qualifying quotes':'Unavailable',description:checked&&!upstreamFailed?'The feed was checked; no matching pregame price passed verification.':'No verified data available for this sport.'};
}
function capture(sport,snapshot){const f=feeds.get(sport)||{};feeds.set(sport,{...f,snapshot,failed:false});schedule()}
function register(sport,rows,at){const f=feeds.get(sport)||{};feeds.set(sport,{...f,rows,at,failed:!at&&!rows.length});schedule()}
function picture(id){
 const wrap=document.createElement('span');wrap.className='source-logo';wrap.dataset.brand=id;
 for(const [i,path] of assets[id].entries()){
  if(i===1&&path===assets[id][0])continue;
  const img=document.createElement('img');img.src=path;img.alt='';img.setAttribute('aria-hidden','true');img.decoding='async';img.className=i?'source-logo-dark':'source-logo-light';if(assets[id][0]===assets[id][1])img.className='source-logo-both';
  img.addEventListener('error',()=>{wrap.classList.add('source-logo-failed')},{once:true});wrap.append(img);
 }
 const fallback=document.createElement('span');fallback.className='source-logo-fallback';fallback.dataset.name=names[id];wrap.append(fallback);return wrap;
}
function decorate(node,explicit){
 if(!node)return;
 const text=node.textContent.trim(),source=explicit||(provider(text)?text:null)||node.dataset.quoteSource||node.closest?.('.market-tile')?.dataset.quoteSource||text;
 const id=provider(source);if(!id||!/[0-9]/.test(text))return;
 if(node.dataset.sourceBrand===id&&node.dataset.sourceText===text&&node.querySelector('.source-logo'))return;
 node.dataset.sourceBrand=id;node.dataset.sourceText=text;node.classList.add('source-price');
 node.dataset.quoteSource=explicit||source;
 const logo=picture(id),copy=document.createElement('span');copy.className='source-price-copy';
 // Preserve the original textContent for existing price compaction and screen
 // readers, while the actual logo carries the visible provider name.
 const expression=id==='espn'?/^(.*?\b)(ESPN)(\s+.*)$/i:new RegExp('^('+names[id]+')(\\s+.*)$','i'),match=text.match(expression);
 const compactOdds=(id==='espn'||id==='polymarket')&&/[+-]\d{2,}(?:\.\d+)?/.exec(text);
 if(compactOdds){
  // Keep attribution available without crowding the visible price column.
  node.title=text;
  const before=document.createElement('span'),odds=document.createElement('span'),after=document.createElement('span');
  before.className=after.className='source-name-sr';
  before.textContent=text.slice(0,compactOdds.index);odds.textContent=compactOdds[0];after.textContent=text.slice(compactOdds.index+compactOdds[0].length);
  copy.append(before,odds,after);
 }else if(match){
  if(id==='espn'){
   const prefix=document.createElement('span');prefix.textContent=match[1];copy.append(prefix);
   const name=document.createElement('span');name.className='source-name-sr';name.textContent=match[2];copy.append(name,document.createTextNode(match[3]));
  }else{const name=document.createElement('span');name.className='source-name-sr';name.textContent=match[1];copy.append(name,document.createTextNode(match[2]));}
 }else copy.textContent=text;
 node.replaceChildren(logo,copy);
}
function decorateAll(){document.querySelectorAll('.leg-quote,.market-tile-price').forEach(node=>decorate(node))}
function mount(){
 if(!document.querySelector('.topbar'))return;
 if(!host){
  host=document.createElement('section');host.id='sourceStrip';host.className='source-strip';host.setAttribute('aria-label','Market data sources');
  const row=document.createElement('div');row.className='source-feed-row';
  for(const id of Object.keys(names)){
   const button=document.createElement('button');button.type='button';button.className='source-feed-button';button.dataset.source=id;button.setAttribute('aria-controls','sourceFeedDetails');button.setAttribute('aria-expanded','false');
   const dot=document.createElement('span');dot.className='source-feed-dot';dot.setAttribute('aria-hidden','true');button.append(picture(id),dot);
   button.addEventListener('click',()=>{selected=selected===id?null:id;render()});row.append(button);
  }
  details=document.createElement('div');details.id='sourceFeedDetails';details.className='source-feed-details';details.hidden=true;details.setAttribute('role','region');host.append(row,details);
  host.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected){const id=selected;selected=null;render();host.querySelector('[data-source="'+id+'"]').focus()}});
 }
 const anchor=document.querySelector('#sportDateDock')||document.querySelector('#sportSwitch')||document.querySelector('.topbar');
 if(host.previousElementSibling!==anchor)anchor.after(host);
}
function render(){
 mount();if(!host)return;
 const sport=active();host.querySelectorAll('.source-feed-button').forEach(button=>{
  const x=state(sport,button.dataset.source);button.dataset.tone=x.tone;button.setAttribute('aria-expanded',String(selected===x.id));button.setAttribute('aria-label',x.name+' feed: '+x.status+'. Show details');button.title=x.name+' · '+x.status;
 });
 details.hidden=!selected;
 if(selected){
  const x=state(sport,selected),format=t=>t===null?'Not available':new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  const lines=[sport.toUpperCase()+' · '+x.name+' · '+x.status,x.description,
   x.freshCount+' current price selections'+(x.scheduleCount?' · '+x.scheduleCount+' scheduled events':''),
   'Last successful check: '+format(x.checkedAt)+' · Latest quote: '+format(x.latestQuote),
   x.kinds.length?'Markets: '+x.kinds.map(k=>({h2h:'Moneyline',spreads:'Spread',totals:'Total',passing:'Pass yards',rushing:'Rush yards',receiving:'Receiving yards',passing_tds:'Pass TDs',td:'TD scorer',completions:'Completions'}[k]||k.replace(/_/g,' '))).join(', '):'',
   selected==='espn'?'ESPN supplies schedules and attributed sportsbook references. The sportsbook name stays with each quoted price.':selected==='polymarket'?'Exchange reference prices. Confirm the matching line, void rules and final price at Caesars.':'Primary exchange feed. A fresh quote does not establish a betting edge.'
  ].filter(Boolean);
  const signature=lines.join('\n');if(details.dataset.signature!==signature){details.dataset.signature=signature;details.replaceChildren(...lines.map((text,i)=>{const p=document.createElement(i===0?'strong':'p');p.textContent=text;return p}))}
 }
 decorateAll();
}
function schedule(){if(typeof document==='undefined'||frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;render()})}
function start(){
 render();
 if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{
  if(records.some(r=>r.type==='attributes'&&r.target===document.body||r.type==='childList'&&!r.target.closest?.('#sourceStrip')&&(r.target.closest?.('#results,#pickOfDayContent,#analysisSecondary,#nflParlayAlternatives')||r.target===document.body||r.target.classList?.contains('shell'))))schedule();
 }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sport']});
 window.setInterval?.(schedule,60000);
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
return {provider,state,capture,register,decorate,render};
});
