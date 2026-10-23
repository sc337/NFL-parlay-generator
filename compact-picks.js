(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.COMPACT_PICKS=api;})(()=>{'use strict';
const nba={Hawks:'ATL',Celtics:'BOS',Nets:'BKN',Hornets:'CHA',Bulls:'CHI',Cavaliers:'CLE',Mavericks:'DAL',Nuggets:'DEN',Pistons:'DET',Warriors:'GSW',Rockets:'HOU',Pacers:'IND',Clippers:'LAC',Lakers:'LAL',Grizzlies:'MEM',Heat:'MIA',Bucks:'MIL',Timberwolves:'MIN',Pelicans:'NOP',Knicks:'NYK',Thunder:'OKC',Magic:'ORL','76ers':'PHI',Suns:'PHX','Trail Blazers':'POR',Kings:'SAC',Spurs:'SAS',Raptors:'TOR',Jazz:'UTA',Wizards:'WAS'};
const nfl={Cardinals:'ARI',Falcons:'ATL',Ravens:'BAL',Bills:'BUF',Panthers:'CAR',Bears:'CHI',Bengals:'CIN',Browns:'CLE',Cowboys:'DAL',Broncos:'DEN',Lions:'DET',Packers:'GB',Texans:'HOU',Colts:'IND',Jaguars:'JAX',Chiefs:'KC',Raiders:'LV',Chargers:'LAC',Rams:'LAR',Dolphins:'MIA',Vikings:'MIN',Patriots:'NE',Saints:'NO',Giants:'NYG',Jets:'NYJ',Eagles:'PHI',Steelers:'PIT','49ers':'SF',Seahawks:'SEA',Buccaneers:'TB',Titans:'TEN',Commanders:'WSH'};
function lineup(value){return String(value||'').replace(/(?:Previous|Latest known) lineup(?:\s*·\s*Not final)?/g,'Lineup unconfirmed').replace(/\s*·\s*Not final/g,'')}
function selection(market,line){
 const m=String(market||'').trim(),l=String(line||'').trim();
 if(l==='ML')return 'Moneyline';
 const side=/^([OU])\s+(.+)$/i.exec(l);
 if(side)return (side[1].toUpperCase()==='O'?'Over ':'Under ')+side[2]+' '+m;
 return [l,m].filter(Boolean).join(' ');
}
function matchup(value,sport){
 const parts=String(value||'').split(/\s+(?:vs\.?|at|@)\s+/i);
 if(parts.length!==2)return String(value||'');
 const teams=sport==='nba'?nba:sport==='nfl'?nfl:{};
 const short=team=>Object.entries(teams).find(([name])=>team===name||team.endsWith(' '+name))?.[1]||team;
 return parts.map(short).join(' @ ');
}
function metadata(sport,time,event){
 const d=new Date(time),label=matchup(event,sport);if(!Number.isFinite(+d))return label;
 const day=d.toLocaleDateString(undefined,{month:'short',day:'numeric'}),hour=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}).replace(':00','');
 return [label,day,hour].filter(Boolean).join(' · ');
}
function row(node,sport){
 if(node.dataset.pickLayout)return;
 const tile=node.querySelector('.market-tile'),heading=tile?.querySelector('.market-tile-heading'),line=tile?.querySelector('.market-tile-line'),price=tile?.querySelector('.market-tile-price');
 const title=node.querySelector('.leg-title,.pick-name'),copy=node.querySelector('.sport-visual-copy,.mlb-leg-copy,.pick-copy');
 if(!tile||!heading||!line||!price||!title||!copy)return;
 node.dataset.pickLayout='compact';node.classList.add('compact-pick-row');tile.classList.add('compact-pick-price');
 let media=[...node.children].find(x=>x.classList.contains('nfl-leg-media')||x.classList.contains('pick-media'));
 if(!media){media=document.createElement('span');copy.before(media);for(const image of [...node.children].filter(x=>String(x.tagName).toLowerCase()==='img'))media.append(image)}
 media.classList.add('compact-pick-media');
 if(media.querySelector('.sport-photo')||media.querySelector('.mlb-player-photo'))media.classList.add('compact-player-media');
 const subject=title.textContent.replace(/^\d+\.\s*/,'');if(title.textContent!==subject)title.textContent=subject;
 const choice=document.createElement('div');choice.className='compact-pick-selection';choice.textContent=selection(heading.textContent,line.textContent);
 const alt=tile.querySelector('.alt-tag');if(alt)choice.append(alt);
 title.after(choice);heading.hidden=true;line.hidden=true;
 const meta=node.querySelector('.leg-brief,.pick-meta');
 if(meta&&node.dataset.eventTime&&node.dataset.matchup){meta.title=meta.textContent;meta.textContent=metadata(sport,node.dataset.eventTime,node.dataset.matchup)}
 const warning=node.querySelector('.nba-lineup-status');if(warning){warning.title=warning.textContent;warning.textContent=lineup(warning.textContent)}
}
function card(node,sport){
 const estimate=node.querySelector('.odds-label');if(estimate&&/ est\.$/i.test(estimate.textContent)){estimate.dataset.sourceLabel=estimate.textContent;estimate.textContent='Est.'}
 const title=node.querySelector('.parlay-name');
 if(title&&!title.dataset.profileLabel){
  const original=title.textContent,profile=/^(Conservative|Balanced|Lotto)\b/.exec(original);
  if(profile){
   title.dataset.profileLabel=profile[1];title.title=original;
   const count=node.querySelectorAll('.legs>.leg').length,mode=/Same Game/i.test(original)?'same-game':/Multi-Game/i.test(original)?'multi-game':'';
   title.textContent=count+'-leg'+(mode?' '+mode:' parlay');
  }
 }
 const details=node.querySelector('.parlay-risk');
 if(details){
  const summary=details.querySelector('summary');if(summary&&summary.textContent==='Risk & price check')summary.textContent='Risk & details';
  const notice=[...node.children].find(x=>x.classList.contains('quality-market-row')&&x.textContent==='Paper study · Exact sportsbook price required');
  if(notice){
   let badge=node.querySelector('.card-status');
   if(badge&&/^Experimental$/i.test(badge.textContent))badge.textContent='Experimental · Paper only';
   else{badge=document.createElement('small');badge.className='compact-study-status';badge.textContent='Paper only';node.querySelector('.parlay-top>div')?.append(badge)}
   details.append(notice);
  }
 }
 const shared=node.querySelector('.shared-source-label'),explanation=node.querySelector('.card-explanation');
 if(shared&&explanation&&!shared.closest('.card-explanation'))explanation.append(shared);
 const thesis=node.querySelector('.card-thesis');if(sport==='nfl'&&thesis&&/^Multi-game\b/i.test(thesis.textContent)&&explanation&&!thesis.closest('.card-explanation'))explanation.append(thesis);
}
function render(){
 const sport=document.body.dataset.sport||window.__ACTIVE_SPORT||'nfl';
 document.querySelectorAll('.leg.has-market-tile,.pick-row').forEach(x=>row(x,sport));
 document.querySelectorAll('.parlay-card[data-compact]').forEach(x=>card(x,sport));
 document.querySelectorAll('#pickOfDay .pick-foot').forEach(x=>{const text=lineup(x.textContent);if(text!==x.textContent){x.title=x.textContent;x.textContent=text}});
}
let frame=null;
function schedule(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;render()})}
function start(){
 schedule();new MutationObserver(records=>{if(records.some(r=>r.target.closest?.('#results,#pickOfDayContent,#analysisSecondary,#nflParlayAlternatives')))schedule()}).observe(document.body,{childList:true,subtree:true});
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
return {selection,matchup,metadata,lineup,row,card};
});
