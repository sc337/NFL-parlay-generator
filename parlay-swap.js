(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.PARLAY_SWAP=api;})(()=>{'use strict';
// Include the settlement side and exact line: YES and NO share native tickers.
function key(m){return JSON.stringify([m.selection_id||m.ticker||'',m.quoteSide||m.side||'',m.marketKey||m.kind||m.type||'',m.point??m.line??null,m.player||'',m.team||m.team_code||'',(m.selection_id||m.ticker)?'':(m.game_id||m.gameId||m.game_label||m.gameLabel||'')]);}
function constraints(s,kept,banned){const required=new Set(kept.map(key));return {sport:s,required,banned:new Set(banned),locked:(sport,m)=>sport===s&&required.has(key(m)),excluded:(sport,m)=>sport===s&&banned.has(key(m)),accepts:(sport,legs)=>sport!==s||[...required].every(k=>legs.some(m=>key(m)===k))&&legs.every(m=>!banned.has(key(m)))};}
let active=null,busy=false,serial=0;
const records=new Map(),bannedBySport=new Map();
const sport=()=>window.__ACTIVE_SPORT||'nfl';
function notify(message,undo){
 let toast=document.getElementById('parlaySwapNotice');if(!toast){toast=document.createElement('div');toast.id='parlaySwapNotice';toast.className='parlay-swap-notice';toast.setAttribute('role','status');document.body.append(toast)}
 toast.replaceChildren(document.createTextNode(message));
 if(undo){const b=document.createElement('button');b.type='button';b.textContent='Undo';b.addEventListener('click',undo,{once:true});toast.append(b)}
 toast.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{toast.hidden=true},8000);
}
function bind(host,s,entries){
 if(!host||entries.length<2)return;
 const rows=[...host.querySelectorAll('.legs > .leg')];if(rows.length!==entries.length)return;
 const id=String(++serial),record={s,entries,profile:host.dataset.profile||host.dataset.nflProfile||''};records.set(id,record);host.dataset.swapId=id;
 if(records.size>600)records.delete(records.keys().next().value);
 rows.forEach((row,i)=>{const button=document.createElement('button');button.type='button';button.className='parlay-leg-swap';button.dataset.swapIndex=String(i);button.setAttribute('aria-label','Replace leg '+(i+1));button.title='Replace with next qualifying leg';button.innerHTML='<span aria-hidden="true">↻</span>';row.append(button)});
 if(active?.sport===s)active.cards.push({host,record});
}
async function change(host,index,undoEntries,undoBanned){
 if(busy)return;
 const record=records.get(host.dataset.swapId);if(!record||record.s!==sport())return;
 const s=record.s,old=record.entries,oldBanned=new Set(bannedBySport.get(s)||[]),nextBanned=undoBanned?new Set(undoBanned):new Set(oldBanned);
 if(!undoEntries)nextBanned.add(key(old[index].market));
 const wanted=undoEntries||old.filter((_,i)=>i!==index),rule=constraints(s,wanted.map(e=>e.market),nextBanned);
 const grid=document.getElementById('results');if(!grid||!host.isConnected)return;
 const parent=host.parentNode,token=window.__SPORT_TOKEN;
 const settings=()=>JSON.stringify([...document.querySelectorAll('#parlayControls input,#parlayControls select,#slateControls input')].map(n=>[n.id,n.value,n.checked]));
 const settingsAtStart=settings(),sequence=window.__NFL_GENERATION_SEQUENCE;
 const current=()=>s===sport()&&token===window.__SPORT_TOKEN&&settings()===settingsAtStart&&(s!=='nfl'||window.__NFL_GENERATION_SEQUENCE===(sequence||0)+1);
 const previous=[...grid.childNodes],pod=document.getElementById('pickOfDay'),podNodes=pod?[...pod.childNodes]:null;
 const auxiliary=['nflPropCoverage','nflCompletionMarkets'].map(id=>document.getElementById(id)).filter(Boolean).map(node=>({node,children:[...node.childNodes]}));
 const labels=['resultsTitle','dataStatus','modeTitle'].map(id=>{const n=document.getElementById(id);return [n,n?.textContent]});
 busy=true;active={...rule,cards:[]};document.body.classList.add('parlay-swap-busy');grid.setAttribute('aria-busy','true');
 // Preserve real nodes (and their listeners), including any entered offer.
 // Keep the current ticket visible until the generator renders its result.
 let replacement=null,newRecord=null;
 try{
  if(s==='nfl')await window.generate();else await window[s.toUpperCase()+'_DASHBOARD'].refresh();
  if(!current())return;
  const found=active.cards.find(({record:r})=>r.profile===record.profile&&r.entries.length===old.length&&rule.accepts(s,r.entries.map(e=>e.market)));
  if(found){replacement=found.host;newRecord=found.record;}
 }catch(error){console.warn('Parlay replacement unavailable',error)}finally{
  const same=current();
  active=null;busy=false;document.body.classList.remove('parlay-swap-busy');grid.removeAttribute('aria-busy');
  if(same){grid.replaceChildren(...previous);if(pod)pod.replaceChildren(...podNodes);for(const {node,children}of auxiliary)node.replaceChildren(...children);for(const [n,text]of labels)if(n)n.textContent=text;}
  else replacement=null;
 }
 if(!replacement){if(s===sport()&&token===window.__SPORT_TOKEN){notify(undoEntries?'Original legs no longer qualify. Ticket kept.':'No qualifying replacement. Ticket kept.');host.querySelector('[data-swap-index="'+(index??0)+'"]')?.focus({preventScroll:true});}return;}
 // Preserve positions of kept legs; the replacement occupies the tapped row.
 const rows=[...replacement.querySelectorAll('.legs > .leg')],entries=newRecord.entries;
 const order=(undoEntries||old).map((e,i)=>entries.findIndex(x=>key(x.market)===key(e.market)));
 const unused=entries.map((_,i)=>i).filter(i=>!order.includes(i));
 for(let i=0;i<order.length;i++)if(order[i]<0)order[i]=unused.shift();
 const legHost=replacement.querySelector('.legs');order.forEach((j,i)=>{const row=rows[j];row.querySelector('.parlay-leg-swap').dataset.swapIndex=String(i);row.querySelector('.parlay-leg-swap').setAttribute('aria-label','Replace leg '+(i+1));const title=row.querySelector('.leg-title');if(title?.firstChild?.nodeType===3)title.firstChild.textContent=title.firstChild.textContent.replace(/^\d+\.\s*/, (i+1)+'. ');legHost.append(row)});newRecord.entries=order.map(j=>entries[j]);
 // This fresh card also discards the combined offer for the previous ticket.
 if(host.parentNode===parent)host.replaceWith(replacement);else return;
 bannedBySport.set(s,nextBanned);
 notify(undoEntries?'Original legs restored.':'Leg replaced.',undoEntries?null:()=>change(replacement,null,old,oldBanned));
 replacement.querySelector('[data-swap-index="'+(index??0)+'"]')?.focus({preventScroll:true});
}
if(typeof document!=='undefined')document.addEventListener('click',event=>{const b=event.target.closest?.('.parlay-leg-swap');if(b){event.preventDefault();event.stopPropagation();change(b.closest('.parlay-card'),Number(b.dataset.swapIndex))}});
return {key,constraints,bind,change,locked:(s,m)=>active?.locked(s,m)||false,excluded:(s,m)=>active?.excluded(s,m)||false,accepts:(s,legs)=>active?.accepts(s,legs)??true};
});
