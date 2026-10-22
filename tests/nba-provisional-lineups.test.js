const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const now=Date.parse('2026-10-22T01:03:00Z'),start='2026-10-22T02:00:00Z';
function setup(){
 let payload={schemaVersion:1,records:[]};class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const window={},ctx=vm.createContext({window,Date:Clock,URL,localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>payload})});
 for(const file of ['starter-status.js','pick-quality.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 const names=['First Player','Second Player','Third Player','Fourth Player','Fifth Player'];
 const context={games:{g:{away:'AWY',home:'HME',start,season_type:2}},players:Object.fromEntries(names.map((name,i)=>['p'+i,{name,team:'AWY',injury_status:''}]))};
 const m={game_id:'g',game_time:start,game_status:'pre',team_code:'AWY',kind:'moneyline',yes_ask:.5,probability:.51};
 window.PICK_QUALITY.prepare('nba',[m],context,[],new Date(now).toISOString());
 const row=(changes={})=>({sport:'nba',game_id:'g',start_time:start,team:'AWY',role:'lineup',players:names,status:'projected',checked_at:new Date(now).toISOString(),source_url:'https://www.nba.com/team/report',...changes});
 return {w:window,context,m,row,load:async p=>{payload={schemaVersion:1,records:[],...p};await window.STARTER_STATUS.load(true)}};
}
const forecast={modelP:.68,marketP:.51,coverage:.8,uncertainty:.2,roleStability:.9,projectedMinutes:32};
test('projected NBA lineups permit conditional straights and parlays near tipoff without confirmation claims',async()=>{
 const r=setup();await r.load({records:[r.row(),r.row({team:'HME'})]});
 for(const options of [{featured:true},{parlay:true}]){
  const q=r.w.PICK_QUALITY.assess('nba',r.m,forecast,options);assert.equal(q.pass,true);assert.equal(q.valueQualified,false);assert.match(q.warnings.join(' '),/Projected lineup · Not final/);
 }
 const prop={...r.m,kind:'points',player:'First Player',player_id:'p0',player_verified:true};
 assert.equal(r.w.PICK_QUALITY.assess('nba',prop,forecast,{parlay:true}).pass,true);
 assert.equal(r.w.PICK_QUALITY.assess('nba',prop,{...forecast,roleStability:.2},{parlay:true}).reason,'Playing time uncertain');
 for(const injury_status of ['out','questionable']){r.context.players.p0.injury_status=injury_status;assert.equal(r.w.PICK_QUALITY.assess('nba',prop,forecast,{parlay:true}).pass,false)}
});
test('old or retained confirmations become provisional; new reports supersede old starters',async()=>{
 const r=setup();const old=r.row({status:'confirmed',checked_at:new Date(now-40*60000).toISOString()});
 await r.load({records:[old]});let ev=r.w.STARTER_STATUS.evidence('nba',r.m,r.context);assert.equal(ev.confirmed,false);assert.equal(ev.sides[0].basis,'cached');assert.match(ev.lineupLabel,/Latest known.*Not final/);
 await r.load({records:[r.row({status:'confirmed',retained:true})]});assert.equal(r.w.STARTER_STATUS.evidence('nba',r.m,r.context).confirmedPlayer,false);
 const updated=r.row({players:['Replacement Player',...old.players.slice(1)]});
 await r.load({records:[old,updated]});ev=r.w.STARTER_STATUS.evidence('nba',r.m,r.context);assert.equal(ev.blocked,null);assert.equal(ev.sides[0].players[0],'Replacement Player');
});
test('previous lineup fallback requires recent explicit five-player report and unchanged current roster',async()=>{
 const r=setup(),previous=r.row({game_id:'previous',start_time:new Date(now-86400000).toISOString(),checked_at:new Date(now-25*3600000).toISOString(),status:'confirmed'});
 await r.load({nba_lineup_history:[previous]});let ev=r.w.STARTER_STATUS.evidence('nba',r.m,r.context);assert.equal(ev.sides[0].basis,'previous');assert.equal(ev.confirmed,false);assert.match(ev.lineupLabel,/Previous lineup · Not final/);
 r.context.players.p0.team='OTHER';assert.equal(r.w.STARTER_STATUS.evidence('nba',r.m,r.context).sides[0].status,'unknown');
 r.context.players.p0.team='AWY';previous.start_time=new Date(now-8*86400000).toISOString();await r.load({nba_lineup_history:[previous]});assert.equal(r.w.STARTER_STATUS.evidence('nba',r.m,r.context).sides[0].status,'unknown');
});
test('no lineup stays visibly pending; no fallback overrides started games or stale quotes',async()=>{
 const r=setup();await r.load({});let q=r.w.PICK_QUALITY.assess('nba',r.m,forecast,{parlay:true});assert.equal(q.pass,true);assert.match(q.warnings.join(' '),/Lineup pending · Not final/);
 assert.equal(r.w.PICK_QUALITY.assess('nba',{...r.m,game_status:'in'},forecast,{parlay:true}).reason,'Event already started');
 assert.equal(r.w.PICK_QUALITY.assess('nba',{...r.m,quotedAt:new Date(now-31*60000).toISOString()},forecast,{parlay:true}).reason,'Quote older than 30 minutes');
});
test('a reported-out starter blocks their props without suppressing every other conditional pick',async()=>{
 const r=setup();await r.load({records:[r.row({status:'confirmed'}),r.row({status:'confirmed',team:'HME'}),r.row({role:'availability',players:['First Player'],status:'out'})]});
 const Q=r.w.PICK_QUALITY,prop={...r.m,kind:'points',player:'First Player',player_id:'p0',player_verified:true};
 assert.equal(Q.assess('nba',prop,forecast,{parlay:true}).reason,'Player unavailable');
 assert.equal(Q.assess('nba',r.m,forecast,{parlay:true}).pass,true);
 assert.equal(Q.assess('nba',{...prop,player:'Second Player',player_id:'p1'},forecast,{parlay:true}).pass,true);
 assert.equal(r.w.STARTER_STATUS.evidence('nba',r.m,r.context).confirmed,false);
});
