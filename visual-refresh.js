(()=>{'use strict';
const $=s=>document.querySelector(s);
function sync(){
  const heading=$('.brand-block h1');
  if(heading)heading.textContent=(document.body.dataset.sport||'nfl').toUpperCase();
}
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
function compactBrief(sport,sub){
  const market=sub.match(/\bMarket\s+(\d+)%/i)||sub.match(/\bKalshi\s+(\d+)%/i);
  const model=sub.match(/\b(?:Simulated|Model|Experimental estimate)\s+(\d+)%/i);
  const parts=[];
  if(sport==='ufc'){
    const fight=sub.split(' · ')[0]||'';
    const opponent=fight.split(/\s+vs\s+/i)[1];if(opponent)parts.push('vs '+opponent);
  }
  if(sport==='nfl'){
    const game=sub.split(' · ')[0];if(game)parts.push(game.replace(/\s+at\s+/i,' @ '));
  }
  if(market)parts.push('Mkt '+market[1]+'%');
  if(model)parts.push((/Simulated/i.test(sub)?'Sim':'Model')+' '+model[1]+'%');
  if(/Market-only|no independent estimate/i.test(sub))parts.push('Market only');
  else if(/Experimental/i.test(sub))parts.push('Experimental');
  return parts.join(' · ');
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
    details.className='card-explanation';label.textContent='Why these picks?';
    const footer=card.querySelector('.card-footer');(footer||card).after(details);
    details.append(label,full);
  });
}
function compactParlays(){
  document.querySelectorAll('#results>.parlay-card:not(.td-watch):not([data-compact])').forEach(card=>{
    card.dataset.compact='1';const sport=document.body.dataset.sport||'nfl',legs=[...card.querySelectorAll(':scope>.legs>.leg')],details=card.querySelector('.card-explanation');
    if(!details)return;
    const title=card.querySelector('.parlay-name');
    if(title){const name=title.textContent.replace(/\s+\d+-Leg$/i,'').replace(/^Market$/i,'Market only');title.textContent=name+' · '+legs.length+' '+(legs.length===1?'leg':'legs')}
    if(sport==='nfl'){
      const odds=card.querySelector('.odds'),label=card.querySelector('.odds-label');
      if(odds?.textContent.trim()==='—'){odds.textContent='Check book';odds.classList.add('quote-unavailable');if(label)label.textContent='SGP odds'}
    }
    legs.forEach((leg,i)=>{
      const title=leg.querySelector('.leg-title'),sub=leg.querySelector('.leg-sub'),reason=leg.querySelector('.leg-reason');
      if(!title)return;
      const original=title.textContent.trim(),subText=sub?.textContent.trim()||'',reasonText=reason?.textContent.trim()||'';
      title.textContent=(i+1)+'. '+compactTitle(original,sport,subText);
      if(sport!=='nfl'||subText){const brief=compactBrief(sport,subText);if(brief){const line=document.createElement('div');line.className='leg-brief';line.textContent=brief;title.after(line)}}
      if(subText||reasonText){const row=document.createElement('div');row.className='card-detail-row';const heading=document.createElement('strong');heading.textContent=original;row.append(heading);if(sub)row.append(sub);if(reason)row.append(reason);details.append(row)}
    });
    const footer=card.querySelector('.card-footer'),pairing=footer?.querySelector('.correlation');
    if(pairing){const note=document.createElement('div');note.className='card-detail-row';note.append(pairing);if(sport==='nfl'&&/Pairing score/i.test(note.textContent)){const small=document.createElement('small');small.textContent='Internal pairing heuristic, not a probability.';note.append(small)}details.append(note)}
    footer?.querySelector('.corr-map')?.remove();
    const score=footer?.firstElementChild;if(score&&sport==='mlb')score.textContent=score.textContent.replace('MLB quality','Quality');
    if(score&&sport==='nfl')score.textContent=score.textContent.replace('Confidence','Rating');
    if(score&&/quality|confidence|composite/i.test(score.textContent))score.title='Rating, not the chance this parlay wins';
  });
}
function syncCards(){compactSummaries();compactParlays()}
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
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
