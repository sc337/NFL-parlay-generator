const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('../scripts/update_pick_history');
test('ALT exclusions include early policy failures and Both requires an explicit action',async()=>{
 const now=Date.parse('2026-10-17T04:00:00Z'),at=new Date(now).toISOString(),start=new Date(now+4*3600000).toISOString(),r=runtime('ncaaf',{now}),listeners={},calls=[];
 r.ctx.document.addEventListener=(type,fn)=>{listeners[type]=fn};
 const row=(id,line,ask)=>({ticker:id,selection_id:id,game_id:id==='other'?'2':'1',game_label:'Away at Home',game_time:start,game_status:'pre',kind:'spread',
  title:'Home wins by over '+line+' points',label:'Home -'+line,yes_bid:ask-.02,yes_ask:ask,probability:ask-.01,volume:2000,open_interest:1000,spread:.02,source:'Kalshi'});
 const snapshot={updated_at:at,markets:[row('standard',7.5,.5),row('near',5.5,.55),row('far',20.5,.65),row('other',7.5,.5)]};
 r.ctx.fetch=async url=>{calls.push(String(url));assert.ok(String(url).startsWith('data/'),'no external or paid request');const data=String(url).includes('kalshi-ncaaf')?snapshot:{};return {ok:true,json:async()=>data,text:async()=>JSON.stringify(data)}};
 r.window.NCAAF_MODEL={estimate:m=>({modelP:m.game_id==='2'?.63:.66,rawModelP:m.game_id==='2'?.63:.66,coverage:.85,uncertainty:.4,experimental:true})};
 r.run('team-alt-lines.js');r.run('ncaaf-dashboard.js');const api=r.window.NCAAF_DASHBOARD;
 await api.load();api.setLineMode('alt');
 const html=r.ctx.document.querySelector('#results').innerHTML;
 assert.match(html,/2 ALT selections checked; 1 passed the ALT rules/);
 assert.match(html,/1 qualifying ALT selection from 1 game/);
 assert.match(html,/ALT more than 3 points from reference/);
 assert.match(html,/data-ncaaf-lines="both"/);assert.equal(api.filters().lineMode,'alt');
 assert.doesNotMatch(html,/<h3 class="parlay-name">/,'never silently pad ALT with standard legs');
 listeners.click({target:{closest:selector=>selector==='[data-ncaaf-lines="both"]'?{}:null}});
 assert.equal(api.filters().lineMode,'both');assert.match(r.ctx.document.querySelector('#results').innerHTML,/NCAAF 2-Leg/);
 assert.ok(calls.every(url=>url.startsWith('data/')));
});
