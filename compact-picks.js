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
function featuredSelection(market,line){
 const names={'rec yds':'receiving yards','receiving yards':'receiving yards','rush yds':'rushing yards','rushing yards':'rushing yards','pass yds':'passing yards','passing yards':'passing yards','rec':'receptions','receptions':'receptions','pass td':'passing touchdowns','passing touchdowns':'passing touchdowns','sog':'shots on goal','ks':'strikeouts','pra':'points + rebounds + assists','pts + reb + assist':'points + rebounds + assists','threes':'made threes','team total':'team total','winner':'winner'};
 const full=names[String(market||'').toLowerCase()]||(/^rbis?$/i.test(market)?'RBI':String(market||'').toLowerCase());return selection(full,line);
}
function featuredStatus(value){
 const parts=lineup(value).split(' · ').filter(x=>x&&!/^(?:Kalshi|Polymarket|ESPN|FanDuel|Caesars|Reference|Suggestion)$/i.test(x)).map(x=>x==='Confirm lineup/status'?'Lineup unconfirmed':x);
 const hasLineup=parts.some(x=>/lineup|starters|goalies/i.test(x));
 return [...new Set(parts.filter(x=>!(hasLineup&&x==='Confirm participation')))].join(' · ');
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
 if(!media){media=document.createElement('span');copy.before(media)}
 for(const visual of [...node.children].filter(x=>String(x.tagName).toLowerCase()==='img'||x.classList.contains('sport-selected-media')))media.append(visual);
 media.classList.add('compact-pick-media');
 if(media.querySelector('.sport-photo')||media.querySelector('.mlb-player-photo'))media.classList.add('compact-player-media');
 const subject=title.textContent.replace(/^\d+\.\s*/,'');if(title.textContent!==subject)title.textContent=subject;
 const choice=document.createElement('div');choice.className='compact-pick-selection';choice.textContent=node.classList.contains('pick-row')?featuredSelection(heading.title||heading.textContent,line.textContent):selection(heading.textContent,line.textContent);
 const alt=tile.querySelector('.alt-tag');if(alt)choice.append(alt);
 title.after(choice);heading.hidden=true;line.hidden=true;
 const meta=node.querySelector('.leg-brief,.pick-meta');
 if(meta&&node.dataset.eventTime&&node.dataset.matchup){meta.title=meta.textContent;meta.textContent=metadata(sport,node.dataset.eventTime,node.dataset.matchup)}
 const warning=node.querySelector('.nba-lineup-status');if(warning){warning.title=warning.textContent;warning.textContent=lineup(warning.textContent)}
}
function featuredTeamMedia(media,subject){
 const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''),name=key(subject);
 const resolved=media.querySelector('.sport-selected-media');
 if(name&&resolved&&key(resolved.dataset.selectedSubject)===name){
  for(const child of [...media.children])if(child!==resolved)child.remove();
  return true;
 }
 const images=[...media.querySelectorAll('img')],selected=images.find(x=>name&&key(x.alt).includes(name));
 // Flatten the selected image so team sizing applies consistently to nested media.
 if(selected){media.replaceChildren(selected);return true}
 media.replaceChildren();return false;
}
function featured(node){
 if(node.dataset.featuredLayout||!node.dataset.pickLayout)return;
 const host=node.closest('#pickOfDay'),details=host?.querySelector('.card-explanation'),copy=node.querySelector('.pick-copy'),meta=node.querySelector('.pick-meta'),media=node.querySelector('.compact-pick-media');
 if(!host||!copy||!meta||!media)return;
 node.dataset.featuredLayout='1';host.classList.add('featured-straight');
 const heading=host.querySelector('#pickOfDayTitle');if(heading){heading.textContent='Featured straight';if(window.STUDY_POLICY){const badge=document.createElement('span');badge.className='featured-paper-badge';badge.textContent='Paper only';heading.append(badge)}}
 const estimate=copy.querySelector('.pick-estimate');if(estimate&&details)details.append(estimate);
 node.append(meta);
 const foot=host.querySelector('.pick-foot');if(foot){foot.dataset.fullStatus=foot.textContent;foot.textContent=featuredStatus(foot.textContent);foot.hidden=!foot.textContent}
 // Team picks show the selected team. Unmatched media is omitted rather than
 // displaying an opponent as the selection's logo.
 const hasMedia=media.classList.contains('compact-player-media')?!!media.querySelector('img'):featuredTeamMedia(media,node.querySelector('.pick-name')?.textContent);
 if(!hasMedia)node.classList.add('featured-no-media');
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
 if(explanation)for(const note of [...node.children].filter(x=>x.classList.contains('summary')||x.classList.contains('card-thesis')||x.classList.contains('quality-market-row')&&x.textContent.length>100))explanation.append(note);
 if(shared&&explanation&&!shared.closest('.card-explanation'))explanation.append(shared);
 const thesis=node.querySelector('.card-thesis');if(sport==='nfl'&&thesis&&/^Multi-game\b/i.test(thesis.textContent)&&explanation&&!thesis.closest('.card-explanation'))explanation.append(thesis);
}
function render(){
 const sport=document.body.dataset.sport||window.__ACTIVE_SPORT||'nfl';
 document.querySelectorAll('.leg.has-market-tile,.pick-row').forEach(x=>row(x,sport));
 document.querySelectorAll('#pickOfDay .pick-row').forEach(featured);
 document.querySelectorAll('.parlay-card[data-compact]').forEach(x=>card(x,sport));
 document.querySelectorAll('#pickOfDay .pick-foot').forEach(x=>{const text=lineup(x.textContent);if(text!==x.textContent){x.title=x.textContent;x.textContent=text}});
}
let frame=null;
function schedule(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;render()})}
function start(){
 schedule();new MutationObserver(records=>{if(records.some(r=>r.target.closest?.('#results,#pickOfDayContent,#analysisSecondary,#nflParlayAlternatives')))schedule()}).observe(document.body,{childList:true,subtree:true});
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
return {selection,featuredSelection,featuredStatus,featuredTeamMedia,matchup,metadata,lineup,row,featured,card};
});
