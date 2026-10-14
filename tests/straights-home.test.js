const test=require('node:test'),assert=require('node:assert/strict');
const {shortlist}=require('../straights-home.js');
const now=new Date(2026,9,13,12).getTime();
function row(sport,id,rank,extra={}){return {sport,market:{game_id:id,ticker:id},eventTime:new Date(now+3600000).toISOString(),check:{pass:true,rank,quote:{checkedAt:new Date(now).toISOString()}},...extra}}
test('Home ranks across sports and keeps one selection per matchup',()=>{
 const rows=[row('nfl','a',70),row('nhl','b',90),row('nfl','a',85),row('mlb','c',80),row('ufc','d',75),row('ncaaf','e',60)];
 assert.deepEqual(shortlist(rows,'all',now).map(r=>r.check.rank),[90,85,80,75]);
 assert.equal(shortlist(rows,'nfl',now).length,1);
 assert.equal(shortlist(rows,'nfl',now)[0].check.rank,85);
});
test('Home excludes started, next-day, failed and stale selections without filling gaps',()=>{
 const expired=row('nfl','a',99,{eventTime:new Date(now-1).toISOString()});
 const next=row('nhl','b',99,{eventTime:new Date(now+86400000).toISOString()});
 const failed=row('mlb','c',99);failed.check.pass=false;
 const stale=row('ufc','d',99);stale.check.quote.checkedAt=new Date(now-31*60000).toISOString();
 const missing=row('ufc','e',99);delete missing.check.quote;
 assert.deepEqual(shortlist([expired,next,failed,stale,missing],'all',now),[]);
 const good=row('nhl','f',70);assert.equal(shortlist([expired,good],'all',now).length,1);
});
test('different sports can share a numeric game ID and tied ranking is stable',()=>{
 const a=row('nfl','1',80),b=row('nhl','1',80);
 assert.equal(shortlist([a,b],'all',now).length,2);
 assert.deepEqual(shortlist([a,b],'all',now),shortlist([b,a],'all',now));
});
test('Home snapshot evaluation retains quality and ALT gates without sport navigation',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const window={__ACTIVE_SPORT:'home',NHL_MODEL:{estimate:()=>({modelP:.64,coverage:.8,experimental:true})},NHL_ALT_LINES:{classify:m=>m,qualifies:m=>!m.isAltLine}};
 const context=vm.createContext({window,document:{readyState:'loading',addEventListener(){}},Date,console});
 for(const file of ['market-guards.js','pick-quality.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const source=fs.readFileSync('straights-home.js','utf8').replace('window.STRAIGHTS_HOME={...core,open:openHome,refresh}','window.STRAIGHTS_HOME={...core,evaluate,open:openHome,refresh}');
 vm.runInContext(source,context);
 const m={ticker:'a',game_id:'a',kind:'moneyline',game_time:new Date(Date.now()+3600000).toISOString(),game_status:'pre',yes_bid:.49,yes_ask:.5,probability:.5,spread:.01,volume:1000};
 const run=market=>window.STRAIGHTS_HOME.evaluate({sport:'nhl',snapshot:{updated_at:new Date().toISOString(),markets:[market]},ctx:{}});
 assert.equal(run(m).length,1);
 assert.equal(run({...m,isAltLine:true}).length,0);
 assert.equal(run({...m,volume:1}).length,0);
 assert.equal(run({...m,game_time:new Date(Date.now()-1000).toISOString()}).length,0);
 assert.equal(window.__ACTIVE_SPORT,'home');
});
