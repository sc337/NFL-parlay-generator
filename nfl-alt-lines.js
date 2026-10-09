(()=>{'use strict';
const supported=m=>['spreads','totals'].includes(m.type)||['player_pass_yds','player_rush_yds','player_reception_yds'].includes(String(m.marketKey||'').replace(/_alternate$/,''));
const point=m=>m.point==null||m.point===''?null:Number.isFinite(Number(m.point))?Number(m.point):null;
const family=m=>[m.player||'',String(m.marketKey||m.type).replace(/_alternate$/,''),m.type==='spreads'?m.team||'':''].join('|');
const probability=m=>m.marketProbability!=null&&Number.isFinite(Number(m.marketProbability))?Number(m.marketProbability):m.price>0?100/(m.price+100):Math.abs(m.price)/(Math.abs(m.price)+100);
const venue=m=>[String(m.source||'').toLowerCase(),m.bookmaker||m.book||''].join('|');
const quoted=m=>{
 if(!Number.isFinite(Number(m.price))||Math.abs(Number(m.price))<100||Math.abs(Number(m.price))>100000)return false;
 const q=window.PICK_QUALITY?.quote?.('nfl',m);
 return !q||(q.odds!==null&&q.checkedAt&&Date.now()-Date.parse(q.checkedAt)<=30*60000&&Date.now()-Date.parse(q.checkedAt)>=-60000);
};
const sameSide=(a,b)=>a.type==='spreads'?a.team===b.team:a.side===b.side&&['over','under'].includes(a.side);
function easier(a,b){
 if(point(a)===null||point(b)===null)return false;
 return a.type==='spreads'?point(a)>point(b):a.side==='over'?point(a)<point(b):a.side==='under'&&point(a)>point(b);
}
function reference(m,game){
 return (game?.markets||[]).filter(x=>supported(x)&&quoted(x)&&!x.isAltLine&&family(x)===family(m)&&venue(x)===venue(m)&&sameSide(x,m)&&point(x)!==null)
  .sort((a,b)=>Math.abs(probability(a)-.5)-Math.abs(probability(b)-.5)||String(a.ticker||a.name).localeCompare(String(b.ticker||b.name)))[0]||null;
}
function classify(game){
 const groups=new Map();
 for(const m of game.markets||[]){m.isAltLine=/_alternate$/.test(m.marketKey||'');m.altReference=false;m.cushionPoints=0;if(!supported(m)||point(m)===null)continue;const key=family(m)+'|'+venue(m);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m)}
 for(const rows of groups.values()){
  // Exchanges do not label a main line: select the threshold nearest 50%.
  // Sportsbook main/alternate keys remain authoritative. Never fabricate odds.
  if(!rows.every(m=>String(m.source||'').toLowerCase()==='kalshi'))continue;
  const reference=rows.filter(quoted).sort((a,b)=>Math.abs(probability(a)-.5)-Math.abs(probability(b)-.5)||(Number(b.volume)||0)-(Number(a.volume)||0)||point(a)-point(b))[0];
  if(!reference)continue;
  for(const m of rows){m.isAltLine=point(m)!==point(reference);m.altReference=true}
 }
 // Work inside small player/market families, not the entire event for every quote.
 for(const rows of groups.values())for(const m of rows){if(!m.isAltLine||!quoted(m))continue;const r=reference(m,{markets:rows});if(r&&easier(m,r))m.cushionPoints=Math.abs(point(m)-point(r))}
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
function cushionBonus(m){
 // Preference only; candidateScore still enforces shared and profile quality gates.
 if(!m.isAltLine||!quoted(m)||!(m.cushionPoints>0))return 0;
 const scale=m.type==='passing'?25:m.type==='rushing'||m.type==='receiving'?10:3;
 return Math.min(12,4+4*m.cushionPoints/scale);
}
function lineText(m){return m.type==='spreads'?(point(m)>=0?'+':'')+point(m):(m.side==='over'?'O ':'U ')+point(m)}
function quoteText(m){return String(m.source||'Source')+' '+(Number(m.price)>0?'+':'')+Number(m.price)}
function comparisonText(m,game){
 if(!game||!supported(m)||!quoted(m))return '';
 const r=reference(m,game);if(!r)return '';
 const alts=(game.markets||[]).filter(x=>x.isAltLine&&quoted(x)&&family(x)===family(m)&&venue(x)===venue(m)&&sameSide(x,m)&&easier(x,r))
  .sort((a,b)=>Math.abs(point(a)-point(r))-Math.abs(point(b)-point(r))||String(a.ticker||a.name).localeCompare(String(b.ticker||b.name)));
 const alt=m.isAltLine?m:alts[0];if(!alt||point(alt)===point(r))return '';
 const note=m.altReference?'Reference (nearest 50% quote)':'Standard';
 return note+' '+lineText(r)+' · '+quoteText(r)+' / ALT '+lineText(alt)+' · '+quoteText(alt)+' · '+(easier(alt,r)?'More cushion; compare payout':'Harder threshold')+'. Quotes are source references, not verified Caesars offers.';
}
window.NFL_ALT_LINES={classify,matches,label,supported,cushionBonus,comparisonText};
function mount(){
 const host=document.querySelector('#nflWeekWrap');if(!host||document.querySelector('#nflLinesWrap'))return;
 const field=document.createElement('div');field.id='nflLinesWrap';field.className='field';
 field.innerHTML='<label class="nfl-line-toggle"><input id="nflAltToggle" type="checkbox"> Include ALT lines</label><label class="nfl-line-toggle"><input id="nflCushionToggle" type="checkbox"> More cushion</label><label for="nflLinesSelect">Line filter</label><select id="nflLinesSelect" aria-describedby="nflLinesNote"><option value="standard">Standard only</option><option value="alt">ALT only</option><option value="both">Standard + ALT</option></select><small id="nflLinesNote">More cushion prefers easier quoted thresholds, not guaranteed value. Compare lines in Details. Kalshi reference = nearest 50% quote, not a sportsbook main line.</small>';
 host.after(field);
 const select=field.querySelector('select'),toggle=field.querySelector('#nflAltToggle'),cushion=field.querySelector('#nflCushionToggle');
 const s=window.NFL_PARLAY_STATE;select.value=s?.lineMode||'standard';toggle.checked=select.value!=='standard';cushion.checked=!!s?.moreCushion;
 function update(){if((window.__ACTIVE_SPORT||'nfl')!=='nfl')return;const s=window.NFL_PARLAY_STATE;s.lineMode=select.value;s.moreCushion=cushion.checked;window.DASHBOARD_UI?.put('nfl','lines',s.lineMode);window.DASHBOARD_UI?.put('nfl','cushion',s.moreCushion?'on':'off');window.generate?.()}
 select.addEventListener('change',()=>{toggle.checked=select.value!=='standard';if(!toggle.checked)cushion.checked=false;update()});
 toggle.addEventListener('change',()=>{select.value=toggle.checked?'both':'standard';if(!toggle.checked)cushion.checked=false;update()});
 cushion.addEventListener('change',()=>{if(cushion.checked){toggle.checked=true;if(select.value==='standard')select.value='both'}update()});
}
if(typeof document!=='undefined')document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
