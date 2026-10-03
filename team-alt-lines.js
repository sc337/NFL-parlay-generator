(()=>{'use strict';
const policies={mlb:{maxDistance:1,maxAsk:.8,minEdge:.03,minCoverage:.45},ncaaf:{maxDistance:3,maxAsk:.75,minEdge:.04,minCoverage:.6}};
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function descriptor(sport,m){
 const title=String(m.title||m.label||'').replace(/^Will\s+/i,'').replace(/\?$/,'').trim();let match;
 if(sport==='mlb'&&m.kind==='total'){
  match=title.match(/^(?:Over|Under)\s+([\d.]+)\s+runs?(?: scored)?$/i);
  if(match)return {family:'game-total',line:Number(match[1])};
  match=title.match(/^(.+?)\s+score\s+(?:over|under)\s+([\d.]+)\s+runs?$/i);
  if(match)return {family:'team-total|'+match[1].toLowerCase(),line:Number(match[2])};
 }
 if(sport==='ncaaf'){
  if(m.kind==='total')match=title.match(/^(?:Over|Under)\s+([\d.]+)\s+points scored$/i);
  if(match)return {family:'game-total',line:Number(match[1])};
  if(m.kind==='spread')match=title.match(/^(.+?)\s+wins by over\s+([\d.]+)\s+points?$/i);
  if(match)return {family:'spread|'+match[1].toLowerCase(),line:Number(match[2])};
 }
 return null;
}
function classify(sport,markets,snapshotAt){
 const groups=new Map();
 for(const m of markets){
  m.isAltLine=false;m.altReferenceLine=null;m.altDistance=null;m.altSnapshotAt=snapshotAt;
  // MLB run-line alternatives have no independent margin model yet. Recognize
  // them so they cannot slip into Standard/Both as unlabelled market-only picks.
  if(sport==='mlb'&&m.kind==='spread'){
   const match=String(m.title||m.label||'').match(/wins by (?:over|under)\s+([\d.]+)\s+runs?/i);
   if(match){m.isAltLine=Number(match[1])!==1.5;m.altReferenceLine=1.5;m.altDistance=Math.abs(Number(match[1])-1.5)}
   continue;
  }
  const d=descriptor(sport,m);if(!d||!m.game_id||!Number.isFinite(d.line)||d.line%1!==.5)continue;
  const key=m.game_id+'|'+d.family;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({m,...d});
 }
 for(const rows of groups.values()){
  const quoted=rows.filter(({m})=>{const bid=number(m.yes_bid),ask=number(m.yes_ask);return bid>0&&bid<=ask&&ask<1});
  if(!quoted.length)continue;
  const ref=quoted.sort((a,b)=>Math.abs((+a.m.yes_bid + +a.m.yes_ask)/2-.5)-Math.abs((+b.m.yes_bid + +b.m.yes_ask)/2-.5)||(+b.m.volume||0)-(+a.m.volume||0)||a.line-b.line||String(a.m.selection_id||a.m.ticker||a.m.label).localeCompare(String(b.m.selection_id||b.m.ticker||b.m.label)))[0];
  for(const {m,line} of rows){m.isAltLine=line!==ref.line;m.altReferenceLine=ref.line;m.altDistance=Math.abs(line-ref.line)}
 }
 return markets;
}
function qualifies(sport,m,forecast){
 if(!m.isAltLine)return true;
 const policy=policies[sport],ask=number(m.yes_ask),p=number(forecast?.modelP),coverage=number(forecast?.coverage),distance=number(m.altDistance),age=Date.now()-Date.parse(m.altSnapshotAt);
 return !!policy&&forecast?.experimental===true&&distance!==null&&distance<=policy.maxDistance&&ask>0&&ask<=policy.maxAsk&&p>=.55&&coverage>=policy.minCoverage&&p-ask>=policy.minEdge-1e-10&&Number.isFinite(age)&&age>=-300000&&age<=1800000;
}
const dateKey=time=>{const d=new Date(time);return Number.isFinite(+d)?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):''};
function create(sport,changed){
 let date='all',mode='both',rows=[];try{const saved=localStorage.getItem(sport+'LineMode');if(['standard','alt','both'].includes(saved))mode=saved}catch{}
 function matches(m){return (date==='all'||dateKey(m.game_time||m.start_time)===date)&&(mode==='both'||(mode==='alt'?m.isAltLine===true:m.isAltLine!==true))}
 function allowed(m,f){return matches(m)&&qualifies(sport,m,f)}
 function controls(){
  const host=document.querySelector('#'+sport+'LineFilters');if(!host?.querySelector)return;
  host.hidden=window.__ACTIVE_SPORT!==sport;host.style.display=host.hidden?'none':'';
  const dates=[...new Set(rows.filter(m=>window.MARKET_GUARDS.pregame(m)).map(m=>dateKey(m.game_time||m.start_time)).filter(Boolean))].sort();
  if(date!=='all'&&!dates.includes(date))dates.push(date);
  host.querySelector('select[data-date]').innerHTML='<option value="all">All dates</option>'+dates.sort().map(d=>'<option value="'+d+'">'+new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</option>').join('');
  host.querySelector('select[data-date]').value=date;host.querySelector('select[data-lines]').value=mode;
 }
 function refresh(){controls();changed();window.COMPACT_UI?.refresh?.()}
 function setDate(value){if(value==='all'||/^\d{4}-\d{2}-\d{2}$/.test(value)){date=value;refresh()}}
 function setLineMode(value){if(['standard','alt','both'].includes(value)){mode=value;try{localStorage.setItem(sport+'LineMode',mode)}catch{}refresh()}}
 document.addEventListener?.('change',e=>{const target=e.target;if(target?.closest?.('#'+sport+'LineFilters')){if(target.hasAttribute('data-date'))setDate(target.value);if(target.hasAttribute('data-lines'))setLineMode(target.value)}});
 return {allowed,matches,controls,setDate,setLineMode,filters:()=>({date,lineMode:mode}),selectedDay:m=>date==='all'?window.PICK_OF_DAY?.today?.(m.game_time||m.start_time):dateKey(m.game_time||m.start_time)===date,load:(markets,at)=>{rows=classify(sport,markets,at);controls();return rows}};
}
window.TEAM_ALT_LINES={policies,descriptor,classify,qualifies,create,dateKey};
})();
