(()=>{'use strict';
const supported=m=>['spreads','totals'].includes(m.type)||['player_pass_yds','player_rush_yds','player_reception_yds'].includes(String(m.marketKey||'').replace(/_alternate$/,''));
const point=m=>m.point==null||m.point===''?null:Number.isFinite(Number(m.point))?Number(m.point):null;
const family=m=>[m.player||'',String(m.marketKey||m.type).replace(/_alternate$/,''),m.type==='spreads'?m.team||'':''].join('|');
const probability=m=>m.marketProbability!=null&&Number.isFinite(Number(m.marketProbability))?Number(m.marketProbability):m.price>0?100/(m.price+100):Math.abs(m.price)/(Math.abs(m.price)+100);
function classify(game){
 const groups=new Map();
 for(const m of game.markets||[]){m.isAltLine=/_alternate$/.test(m.marketKey||'');m.altReference=false;if(!supported(m)||point(m)===null)continue;const key=family(m);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m)}
 for(const rows of groups.values()){
  // Exchanges do not label a main line: select the threshold nearest 50%.
  // Sportsbook main/alternate keys remain authoritative. Never fabricate odds.
  if(!rows.every(m=>String(m.source||'').toLowerCase()==='kalshi'))continue;
  const reference=[...rows].sort((a,b)=>Math.abs(probability(a)-.5)-Math.abs(probability(b)-.5)||(Number(b.volume)||0)-(Number(a.volume)||0)||point(a)-point(b))[0];
  for(const m of rows){m.isAltLine=point(m)!==point(reference);m.altReference=true}
 }
 return game;
}
function matches(m,mode='standard'){
 if(mode==='both')return true;
 return mode==='alt'?supported(m)&&m.isAltLine===true:!m.isAltLine;
}
function label(m){
 const n=point(m);
 // Integer yardage: O 39.5 and 40+ represent the same threshold.
 return m.isAltLine&&m.player&&m.side==='over'&&n!==null&&n%1===.5?String(Math.floor(n)+1)+'+':null;
}
window.NFL_ALT_LINES={classify,matches,label,supported};
function mount(){
 const host=document.querySelector('#nflWeekWrap');if(!host||document.querySelector('#nflLinesWrap'))return;
 const field=document.createElement('div');field.id='nflLinesWrap';field.className='field';
 field.innerHTML='<label for="nflLinesSelect">Lines</label><select id="nflLinesSelect" aria-describedby="nflLinesNote"><option value="standard">Standard</option><option value="alt">ALT</option><option value="both">Both</option></select><small id="nflLinesNote">Available quotes only. Kalshi main = threshold nearest 50%, not a sportsbook main line.</small>';
 host.after(field);
 field.querySelector('select').addEventListener('change',e=>{if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;window.NFL_PARLAY_STATE.lineMode=e.target.value;window.generate?.()});
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
