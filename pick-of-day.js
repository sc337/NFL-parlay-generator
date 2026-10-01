(()=>{'use strict';
const $=s=>document.querySelector(s);
const today=time=>{const d=new Date(time),now=new Date();return Number.isFinite(+d)&&d>now&&d.toDateString()===now.toDateString()};
const money=n=>Number(n)>0?'+'+Math.round(n):String(Math.round(n));
function loading(){const host=$('#pickOfDayContent');if(host)host.textContent='Checking today’s qualified pregame markets…'}
function show(sport,pick){if(window.__ACTIVE_SPORT!==sport)return;const host=$('#pickOfDayContent');if(!host)return;
  const status=$('#dataStatus')?.textContent||'',age=/updated\s+(\d+)m/i.exec(status),tooOld=sport==='nfl'&&age&&Number(age[1])>120;
  host.replaceChildren();
  if(!pick||!today(pick.eventTime)||tooOld){const note=document.createElement('p');note.className='pick-pass';note.textContent=tooOld?'NFL feed is delayed. No verified straight until it refreshes.':/unavailable|stale|failed/i.test(status)?'Feed unavailable. No verified straight right now.':'No qualified pregame straight today. Pass.';host.append(note);return}
  const row=document.createElement('div'),media=document.createElement('span'),copy=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('span'),reference=document.createElement('span'),foot=document.createElement('small');
  row.className='pick-row';media.className='pick-media';copy.className='pick-copy';name.className='pick-name';meta.className='pick-meta';reference.className='pick-reference';foot.className='pick-foot';
  media.innerHTML=pick.media||'';name.textContent=pick.label||pick.market?.name||pick.market?.label||'Qualified straight';
  meta.textContent=(pick.event||'Upcoming event')+' · '+new Date(pick.eventTime).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  const ask=window.MARKET_GUARDS?.quote?.(pick.market);
  reference.textContent=sport==='nfl'&&Number.isFinite(Number(pick.market?.price))?money(pick.market.price):ask!=null?'Kalshi '+Math.round(ask*100)+'¢':'Price unavailable';
  foot.textContent=pick.note||'Reference only. Verify the current line at your sportsbook.';
  copy.append(name,meta);row.append(media,copy,reference);host.append(row,foot);
}
window.PICK_OF_DAY={show,loading,today};
})();
