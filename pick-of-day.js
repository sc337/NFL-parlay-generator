(()=>{'use strict';
const $=s=>document.querySelector(s);
const today=time=>{const d=new Date(time),now=new Date();return Number.isFinite(+d)&&d>now&&d.toDateString()===now.toDateString()};
const money=n=>Number(n)>0?'+'+Math.round(n):String(Math.round(n));
function selection(label){
  let m=label.match(/^(?:Game Total\s+)?(Over|Under)\s+([\d.]+)(?:\s+(?:runs?|points?))?$/i);
  if(m)return {market:'Total',line:(/^Over$/i.test(m[1])?'O ':'U ')+m[2]};
  m=label.match(/^(.+?)\s+(Over|Under)\s+([\d.]+)\s+(.+)$/i);
  if(m)return {subject:m[1],market:m[4],line:(/^Over$/i.test(m[2])?'O ':'U ')+m[3]};
  m=label.match(/^(.+?)\s+wins by (?:over|more than)\s+([\d.]+)\s+points?$/i);
  if(m)return {subject:m[1],market:'Spread',line:'−'+m[2]};
  m=label.match(/^(.+?)\s+(?:ML|moneyline)$/i);
  if(m)return {subject:m[1],market:'Winner',line:'ML'};
  return {subject:label,market:'Winner',line:'ML'};
}
function loading(){const host=$('#pickOfDayContent');if(host)host.textContent='Checking today’s qualified pregame markets…'}
function show(sport,pick){if(window.__ACTIVE_SPORT!==sport)return;const host=$('#pickOfDayContent');if(!host)return;
  const status=$('#dataStatus')?.textContent||'',age=/updated\s+(\d+)m/i.exec(status),tooOld=sport==='nfl'&&age&&Number(age[1])>120;
  host.replaceChildren();
  if(!pick||!today(pick.eventTime)||tooOld){const note=document.createElement('p');note.className='pick-pass';note.textContent=tooOld?'Feed delayed · Pass':/unavailable|stale|failed/i.test(status)?'Feed unavailable · Pass':'No pick today · Pass';host.append(note);return}
  const row=document.createElement('div'),media=document.createElement('span'),copy=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('span'),reference=document.createElement('small'),foot=document.createElement('small'),tile=document.createElement('div'),heading=document.createElement('span'),line=document.createElement('strong');
  row.className='pick-row';media.className='pick-media';copy.className='pick-copy';name.className='pick-name';meta.className='pick-meta';reference.className='market-tile-price';foot.className='pick-foot';tile.className='market-tile pick-market-tile';heading.className='market-tile-heading';line.className='market-tile-line';
  const parsed=selection(pick.label||pick.market?.name||pick.market?.label||'Qualified straight');
  media.innerHTML=pick.media||'';name.textContent=sport==='mlb'?(window.DISPLAY_COPY?.mlbTeam?.(parsed.subject)||parsed.subject||pick.event||'Upcoming event'):(parsed.subject||pick.event||'Upcoming event');
  meta.textContent=[window.DISPLAY_COPY?.date?.(pick.eventTime)||new Date(pick.eventTime).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}),parsed.subject?(window.DISPLAY_COPY?.matchup?.(pick.event)||pick.event||'Upcoming event'):''].filter(Boolean).join(' · ');
  const ask=window.MARKET_GUARDS?.quote?.(pick.market);
  reference.textContent=sport==='nfl'&&Number.isFinite(Number(pick.market?.price))?money(pick.market.price):ask!=null?'Kalshi '+Math.round(ask*100)+'¢':'Line check';
  foot.textContent=pick.note||'Reference only. Verify the current line at your sportsbook.';
  heading.textContent=parsed.market;line.textContent=parsed.line;tile.setAttribute('aria-label',parsed.market+' '+parsed.line+', '+reference.textContent);
  tile.append(heading,line,reference);copy.append(name,meta);row.append(media,copy,tile);host.append(row,foot);
}
window.PICK_OF_DAY={show,loading,today};
})();
