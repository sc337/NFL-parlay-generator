(()=>{'use strict';
const limits={spread:7,total:15,points:5,rebounds:2,assists:2,threes:1,pra:7,pr:7,pa:7,ra:4,steals:1,blocks:1};
function classify(rows){const groups=new Map();for(const m of rows){if(m.referenceOnly){m.isAltLine=false;m.altReferenceLine=m.line;m.altDistance=0;continue}if(m.kind==='moneyline'||!Number.isFinite(m.line)||!Number.isFinite(m.probability))continue;const key=[m.game_id,m.kind,m.player_id||m.team_code||'',m.side].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m)}for(const list of groups.values()){const ref=[...list].sort((a,b)=>Math.abs(a.probability-.5)-Math.abs(b.probability-.5)||a.line-b.line)[0];for(const m of list){m.altReferenceLine=ref.line;m.altDistance=Math.abs(m.line-ref.line);m.isAltLine=m.line!==ref.line}}return rows}
function allowed(m,mode='standard'){if(m.isAltLine&&(!(m.altDistance<=limits[m.kind])||m.player&&m.side==='no'))return false;return mode==='alt'?m.isAltLine===true:mode==='both'||!m.isAltLine}
window.NBA_ALT_LINES={classify,allowed,limits};
})();
