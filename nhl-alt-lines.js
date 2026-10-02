(()=>{'use strict';
const kinds=['total','goals','assists','points','shots','saves'];
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function classify(markets){
 const groups=new Map();
 for(const m of markets){
  m.isAltLine=false;m.altReference=false;const line=number(m.line);
  if(line===null||line<.5||line%1!==.5)continue;
  // Conventional NHL puck lines are +/-1.5 goals.
  if(m.kind==='spread'){m.isAltLine=line!==1.5;continue}
  if(!kinds.includes(m.kind)||!m.game_id)continue;
  const key=[m.game_id,m.kind,m.player_id||''].join('|');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);
 }
 for(const rows of groups.values()){
  const quoted=rows.filter(m=>{const bid=number(m.yes_bid),ask=number(m.yes_ask);return bid>0&&ask>0&&bid<=ask&&ask<1});
  if(!quoted.length)continue;
  // Kalshi does not identify a sportsbook main total/prop. Choose a stable
  // reference threshold nearest 50% using quoted midpoint, never model output.
  const ref=[...quoted].sort((a,b)=>Math.abs((number(a.yes_bid)+number(a.yes_ask))/2-.5)-Math.abs((number(b.yes_bid)+number(b.yes_ask))/2-.5)||(Number(b.volume)||0)-(Number(a.volume)||0)||a.line-b.line||String(a.selection_id).localeCompare(String(b.selection_id)))[0];
  for(const m of rows){m.isAltLine=number(m.line)!==number(ref.line);m.altReference=true}
 }
 return markets;
}
function matches(m,mode='both'){return mode==='alt'?m.isAltLine===true:mode==='standard'?m.isAltLine!==true:true}
window.NHL_ALT_LINES={classify,matches};
})();
