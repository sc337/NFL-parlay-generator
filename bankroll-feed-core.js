(()=>{'use strict';
const sports=['nfl','mlb','ncaaf','nhl','ufc'],Q=()=>window.PICK_QUALITY;
const start=r=>r.market.game_time||r.market.start_time||r.market.kickoff||r.game?.commence_time;
function id(r){return Q().id(r.sport,r.market)+'|'+start(r)}
function event(r){return [r.sport,start(r),r.market.game_id||r.market.gameId||r.market.game_label||r.market.fight||r.game?.id||''].join('|')}
function minimumOdds(p){if(!(p>0&&p<1))return null;const maximum=p/1.02;return Math.ceil(maximum>=.5?-100*maximum/(1-maximum):100*(1-maximum)/maximum)}
function decision(row,offered=null){
 const q=Q().assess(row.sport,row.market,row.forecast||{},{game:row.game,featured:true});
 const valid=offered&&Q().odds(offered.price)&&Number.isFinite(Date.parse(offered.at))&&Date.parse(offered.at)<=Date.now()+300000&&Date.now()-Date.parse(offered.at)<=15*60000;
 const ev=valid?q.conservativeP*Q().decimal(offered.price)-1:null;
 const independent=row.forecast?.marketAnchored!==true;
 return {quality:q,minimum:independent?minimumOdds(q.conservativeP):null,ev,ready:q.pass&&q.validated&&independent&&!q.warnings.length&&valid&&ev>=.02,offered:valid?offered:null};
}
function eligible(rows,{date='upcoming',sport='all',excluded=[],now=Date.now()}={}){
 const omit=new Set(excluded),seen=new Set(),counts={},day=new Date(now).toDateString();
 const ranked=rows.filter(r=>sports.includes(r.sport)&&(sport==='all'||sport===r.sport)&&!omit.has(id(r))&&Date.parse(start(r))>now&&Date.parse(start(r))<=now+7*86400000&&(date!=='today'||new Date(start(r)).toDateString()===day))
  .map(r=>({...r,quality:decision(r).quality})).filter(r=>r.quality.pass).sort((a,b)=>b.quality.rank-a.quality.rank||id(a).localeCompare(id(b)));
 return ranked.filter(r=>{const key=event(r);if(seen.has(key)||(counts[r.sport]||0)>=3)return false;seen.add(key);counts[r.sport]=(counts[r.sport]||0)+1;return true});
}
function gesture(dx,dy){return Math.abs(dx)>=70&&Math.abs(dx)>Math.abs(dy)*1.4?(dx>0?'save':'pass'):null}
function paperResult(record,status){if(!['won','lost','void','pending'].includes(status)||!Q().odds(record.odds))return null;return {...record,status,settledAt:status==='pending'?null:new Date().toISOString(),profit:status==='won'?Q().decimal(record.odds)-1:status==='lost'?-1:0}}
function summary(records){const settled=records.filter(r=>r.status==='won'||r.status==='lost'),wins=settled.filter(r=>r.status==='won').length,profit=settled.reduce((n,r)=>n+(Number(r.profit)||0),0);return {settled:settled.length,wins,profit,roi:settled.length?profit/settled.length:null}}
window.BANKROLL_FEED_CORE={sports,start,id,event,minimumOdds,decision,eligible,gesture,paperResult,summary};
})();
