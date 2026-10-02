(()=>{'use strict';
const $=s=>document.querySelector(s);
function sync(){
  const footer=$('.footer-minimal');if(footer){const zone=new Intl.DateTimeFormat(undefined,{timeZoneName:'short'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value||'local time';footer.textContent='Times in '+zone+' · Bet responsibly.';const note=$('#timezoneNote');if(note)note.textContent='Times in '+zone}
  const heading=$('.brand-block h1');
  if(heading)heading.textContent=(document.body.dataset.sport||'nfl').toUpperCase();
}
function compactDate(value,dateOnly=false){
  if(!value)return '';const d=new Date(value);if(!Number.isFinite(+d))return '';
  const date=d.toLocaleDateString(undefined,{month:'short',day:'numeric',...(dateOnly?{timeZone:'UTC'}:{})});
  return dateOnly?date:date+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).replace(':00','').replace(/\s/g,'');
}
function shortMatchup(value){return String(value||'').replace(/\s+(?:at|@)\s+/gi,' vs ')}
function shortMlbTeam(value){return String(value||'').replace(/^(?:Los Angeles|New York|Chicago|San Diego|San Francisco|Kansas City|Tampa Bay|St\. Louis|Arizona|Atlanta|Baltimore|Boston|Cincinnati|Cleveland|Colorado|Detroit|Houston|Miami|Milwaukee|Minnesota|Oakland|Philadelphia|Pittsburgh|Seattle|Texas|Toronto|Washington)\s+/,'')}
function compactTitle(value,sport,sub){
  let text=value.replace(/^\d+\.\s*/,'');
  if(sport==='ncaaf')text=text.replace(/wins by (?:over|more than)\s+([\d.]+)\s+points?/i,'−$1 Spread');
  text=text.replace(/\bUnder\s+/gi,'U ').replace(/\bOver\s+/gi,'O ')
    .replace(/passing touchdowns?/gi,'Pass TD').replace(/receiving touchdowns?/gi,'Rec TD')
    .replace(/rushing touchdowns?/gi,'Rush TD').replace(/receptions/gi,'Rec')
    .replace(/receiving yards?/gi,'Rec Yds').replace(/rushing yards?/gi,'Rush Yds')
    .replace(/passing yards?/gi,'Pass Yds').replace(/moneyline/gi,'ML')
    .replace(/\s+at\s+/gi,' @ ').replace(/Game Total\s+/gi,'Game ')
    .replace(/Team Total\s+/gi,'Team ');
  if(sport==='ncaaf'){
    if(/\bMONEYLINE\b/i.test(sub)&&!/[+−-]\d|\bML\b/.test(text))text+=' ML';
  }
  if(sport==='ufc'&&/\bWinner\b/i.test(sub)&&!text.includes(' ML'))text+=' ML';
  return text.replace(/\s+/g,' ').trim();
}
function compactBrief(sport,sub,opponent=''){
  const market=sub.match(/\bMarket\s+(\d+)%/i)||sub.match(/\bKalshi\s+(\d+)%/i);
  const model=sub.match(/\b(?:Simulated|Model|Experimental estimate)\s+(\d+)%/i);
  const parts=[];
  const starts=sub.match(/ · Starts (.+)$/);if(starts)parts.push(starts[1]);
  if(sport==='ufc'){
    const fight=sub.split(' · ')[0]||'';
    if(opponent)parts.push('vs '+opponent);else if(fight)parts.push(fight);
  }
  if(sport==='nfl'){
    const game=sub.split(' · ')[0];if(game)parts.push(game.replace(/\s+at\s+/i,' @ '));
  }
  if(market)parts.push('Mkt '+market[1]+'%');
  if(sport==='ncaaf'){const game=sub.split(' · ')[0];if(game)parts.unshift(game.replace(/\s+at\s+/i,' @ '))}
  if(model)parts.push((['ncaaf','nhl'].includes(sport)?'Exp':/Simulated/i.test(sub)?'Sim':'Model')+' '+model[1]+'%');
  if(/Market-only|no independent estimate/i.test(sub))parts.push('Market only');
  else if(/Experimental/i.test(sub)&&sport!=='ncaaf')parts.push('Experimental');
  return parts.join(' · ');
}
function selectionParts(value,sub=''){
  const text=value.replace(/^\d+\.\s*/,'').trim();
  const total=text.match(/^([OU])\s+([\d.]+)$/i);
  if(total)return {subject:'Game total',market:'Total',line:total[1].toUpperCase()+' '+total[2]};
  const puckLine=text.match(/^(.+?)\s+([+−-][\d.]+)\s+Puck\s+Line$/i);
  if(puckLine)return {subject:puckLine[1],market:'Puck line',line:puckLine[2]};
  const runLine=text.match(/^(.+?)\s+([+−-][\d.]+)\s+Run\s+Line$/i);
  if(runLine)return {subject:runLine[1],market:'Run line',line:runLine[2]};
  const spread=text.match(/^(.+?)\s+([+−-][\d.]+)$/);
  if(spread)return {subject:spread[1],market:'Spread',line:spread[2]};
  let match=text.match(/^(.+?)\s*·\s*(?:Game\s+)?([OU])\s+([\d.]+)$/i);
  if(match)return {subject:match[1],market:'Total',line:match[2].toUpperCase()+' '+match[3]};
  match=text.match(/^(.+?)\s+([OU])\s+([\d.]+)\s+(.+)$/i);
  if(match)return {subject:match[1],market:match[4],line:match[2].toUpperCase()+' '+match[3]};
  match=text.match(/^([OU])\s+([\d.]+)\s+(?:points?|runs?|goals?)(?:\s+scored)?$/i);
  if(match)return {subject:(sub.split(' · ')[0]||'Game').replace(/\s+at\s+/i,' @ '),market:'Total',line:match[1].toUpperCase()+' '+match[2]};
  match=text.match(/^(.+?)\s+([+−-][\d.]+)\s+Spread$/i);
  if(match)return {subject:match[1],market:'Spread',line:match[2]};
  match=text.match(/^(.+?)\s+ML$/i);
  if(match)return {subject:match[1],market:'Winner',line:'ML'};
  return {subject:text,market:'Pick',line:''};
}
function compactSummaries(){
  document.querySelectorAll('#results>.parlay-card:not(.td-watch)>.summary').forEach(full=>{
    const card=full.closest('.parlay-card'),sport=document.body.dataset.sport||'nfl';
    if(sport==='nfl'){
      const short=(full.dataset.shortText||'').replace('Lower-scoring control game','Low scoring').replace('Favorite controls the game','Favorite control').replace('Underdog forced to throw','Underdog passing');
      const thesis=document.createElement('p');thesis.className='card-thesis';
      if(full.dataset.away&&full.dataset.home&&window.SPORT_MEDIA?.nfl){
        const logos=document.createElement('span');logos.className='matchup-logos';
        logos.innerHTML=window.SPORT_MEDIA.nfl({team:full.dataset.away})+window.SPORT_MEDIA.nfl({team:full.dataset.home});
        thesis.append(logos,document.createTextNode(short));
      }else thesis.textContent=short;
      full.before(thesis);
    }
    const details=document.createElement('details'),label=document.createElement('summary');
    details.className='card-explanation';label.textContent='Details';details.open=false;
    const footer=card.querySelector('.card-footer');(footer||card).after(details);
    details.append(label,full);
  });
}
function compactParlays(){
  document.querySelectorAll('#results>.parlay-card:not(.td-watch):not([data-compact])').forEach(card=>{
    card.dataset.compact='1';const sport=document.body.dataset.sport||'nfl',legs=[...card.querySelectorAll(':scope>.legs>.leg')],details=card.querySelector('.card-explanation');
    if(!details)return;
    const title=card.querySelector('.parlay-name');
    if(title){const name=title.textContent.replace('Best Balance','Balanced').replace(/\s+\d+-Leg$/i,'').replace(/^Market$/i,'Market only');title.textContent=name+' · '+legs.length+' '+(legs.length===1?'leg':'legs')}
    if(sport==='nfl'){
      const odds=card.querySelector('.odds'),label=card.querySelector('.odds-label');
      if(odds?.textContent.trim()==='—'){odds.textContent='Check book';odds.classList.add('quote-unavailable');if(label)label.textContent='SGP odds'}
    }
    legs.forEach((leg,i)=>{
      const title=leg.querySelector('.leg-title'),sub=leg.querySelector('.leg-sub'),reason=leg.querySelector('.leg-reason');
      if(!title)return;
      const original=title.textContent.trim(),subText=sub?.textContent.trim()||'',reasonText=reason?.textContent.trim()||'';
      const selection=selectionParts(compactTitle(original,sport,subText),subText),quote=leg.querySelector('.leg-quote');
      const subject=sport==='nfl'&&['Winner','Spread'].includes(selection.market)?(window.NFL_DISPLAY?.team?.(selection.subject)||selection.subject):sport==='mlb'?shortMlbTeam(selection.subject):selection.subject;
      title.textContent=(i+1)+'. '+shortMatchup(subject);
      if(sport!=='nfl'||subText){const brief=(sport==='nfl'&&leg.dataset.compactMatchup?leg.dataset.compactMatchup:leg.dataset.eventTime?[compactDate(leg.dataset.eventTime),shortMatchup(leg.dataset.matchup||''),compactBrief(sport,subText,leg.dataset.opponent||'').split(' · ').filter(x=>/^(?:Model|Sim|Exp) \d+%$|^Market only$|^vs /.test(x)).join(' · ')].filter(Boolean).join(' · '):compactBrief(sport,subText,leg.dataset.opponent||'')).replace(/(?:^| · )Mkt \d+%(?= · |$)/,'').replace(/^ · /,'');if(brief){const line=document.createElement('div');line.className='leg-brief';line.textContent=brief;title.after(line)}}
      if(selection.line){
        const tile=document.createElement('div'),heading=document.createElement('span'),line=document.createElement('strong'),price=document.createElement('small');
        tile.className='market-tile';heading.className='market-tile-heading';line.className='market-tile-line';price.className='market-tile-price';
        heading.textContent=selection.market;line.textContent=selection.line;
        if(leg.dataset.altLine==='true'){const badge=document.createElement('span');badge.className='alt-tag';badge.textContent='ALT';tile.append(badge);if(leg.dataset.altLabel)line.textContent=leg.dataset.altLabel;}
        const market=subText.match(/\b(?:Market|Kalshi)\s+(\d+)%/i);
        price.textContent=quote?.textContent.trim()|| (market?'Mkt '+market[1]+'%':'Line check');
        tile.setAttribute('aria-label',(leg.dataset.altLine==='true'?'ALT ':'')+selection.market+' '+line.textContent+', '+price.textContent);
        tile.append(heading,line,price);quote?.remove();leg.append(tile);leg.classList.add('has-market-tile');
      }
      if(subText||reasonText){const row=document.createElement('div');row.className='card-detail-row';const heading=document.createElement('strong');heading.textContent=original;row.append(heading);if(sub)row.append(sub);if(reason)row.append(reason);details.append(row)}
    });
    const footer=card.querySelector('.card-footer'),pairing=footer?.querySelector('.correlation');
    if(pairing){const note=document.createElement('div');note.className='card-detail-row';note.append(pairing);if(sport==='nfl'&&/Pairing score/i.test(note.textContent)){const small=document.createElement('small');small.textContent='Internal pairing heuristic, not a probability.';note.append(small)}details.append(note)}
    footer?.querySelector('.corr-map')?.remove();
    const score=footer?.firstElementChild;
    if(sport==='ufc'){const dates=[...new Set(legs.map(l=>l.dataset.eventDate).filter(Boolean))];if(dates.length){const event=document.createElement('p');event.className='card-thesis';event.textContent=dates.map(d=>compactDate(d+'T12:00:00Z',true)).join(' · ');card.querySelector('.parlay-top').after(event)}}
    if(sport==='mlb'&&/Experimental/i.test(details.textContent)){const badge=document.createElement('span');badge.className='grade card-status';badge.textContent='Experimental';card.querySelector('.parlay-name').after(badge)}
    if(sport==='ncaaf'&&/Experimental/i.test(details.textContent))card.querySelector('.grade')?.classList.add('card-status');
    if(footer){const note=footer.children[1];if(note&&/^(Distinct matchups|Separate games|Independent fights)$/.test(note.textContent)){note.textContent=note.textContent.replace('Independent fights','Separate fights');const row=document.createElement('div');row.className='card-detail-row';row.append(note);details.append(row)}}
    if(score&&sport==='ufc')score.textContent=score.textContent.replace(/^Rating/,'Model rating');
    if(score&&sport==='mlb')score.textContent=score.textContent.replace('MLB quality','Model rating')+' · Not win chance';
    if(score&&sport==='nfl')score.textContent=score.textContent.replace('Confidence','Rating').replace(/^Rating/,'Model rating');
    if(score){score.title='Selection score, not the chance this parlay wins';const definition=document.createElement('div');definition.className='card-detail-row';definition.textContent=['ncaaf','nhl'].includes(sport)?'Quote quality: liquidity and spread, not win probability.':'Model rating: selection score, not win probability.';details.append(definition)}
  });
}
function dockMatchups(){
  const host=$('#analysisSecondary'),matchups=$('#results>.ufc-matchups');
  if(host&&matchups)host.append(matchups);
  if(document.body.dataset.sport!=='ufc')host?.querySelectorAll('.ufc-matchups').forEach(node=>node.remove());
}
function syncCards(){compactSummaries();compactParlays();dockMatchups()}
function mount(){
  const main=$('main');
  if(!main||$('#explorePanelToggle'))return;
  const toggle=document.createElement('button');
  toggle.type='button';toggle.id='explorePanelToggle';toggle.className='explore-panel-toggle';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','parlayControls');
  toggle.textContent='Parlay options';
  main.prepend(toggle);
  toggle.addEventListener('click',()=>{
    const open=document.body.classList.toggle('explore-expanded');
    toggle.setAttribute('aria-expanded',String(open));
    toggle.textContent=open?'Hide parlay options':'Parlay options';
  });
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-sport']});
  const results=$('#results');
  if(results)new MutationObserver(syncCards).observe(results,{childList:true,subtree:true});
  syncCards();
  sync();
}
window.DISPLAY_COPY={date:compactDate,matchup:shortMatchup,mlbTeam:shortMlbTeam};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
