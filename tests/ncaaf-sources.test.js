const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {runtime}=require('../scripts/update_pick_history');
test('public sportsbook references retain their source, current price and caveat',()=>{
 const r=runtime('ncaaf'),w=r.window,m={ticker:'ESPN:1',kind:'moneyline',label:'Home',price:-150,yes_ask:.6,probability:.6,source:'DraftKings via ESPN',referenceOnly:true,quotedAt:new Date().toISOString(),game_time:new Date(Date.now()+86400000).toISOString(),game_status:'pre'};
 w.PICK_QUALITY.prepare('ncaaf',[m]);
 const q=w.PICK_QUALITY.assess('ncaaf',m,{modelP:.74,coverage:.85,uncertainty:.4,experimental:true});
 assert.equal(q.pass,true);assert.equal(q.valueQualified,false);assert.equal(q.quote.source,'DraftKings via ESPN');
 assert.match(w.PICK_QUALITY.quoteLabel('ncaaf',m),/DraftKings via ESPN -150.*Reference/);
 assert.match(q.warnings.join(' '),/Public reference odds/);
 m.quotedAt=new Date(Date.now()-31*60000).toISOString();
 assert.equal(w.PICK_QUALITY.assess('ncaaf',m,{modelP:.74,coverage:.85}).reason,'Quote older than 30 minutes');
});
test('sportsbook positive and negative spreads use the correct team and sign',()=>{
 const w={};vm.runInNewContext(fs.readFileSync('ncaaf-model.js','utf8'),{window:w,Date});
 const form={available:true,games:5,box_games:5,margin:0,yards_for:350,yards_against:350,points_for:25,points_against:25};
 const c={updated_at:new Date().toISOString(),league_points_per_team:25,games:{g:{kickoff:new Date(Date.now()+86400000).toISOString(),neutral_site:true,home:{id:'1',form},away:{id:'2',form}}}};
 const m={game_id:'g',game_status:'pre',kind:'spread',referenceOnly:true,team_id:'1',point:3};
 const plus=w.NCAAF_MODEL.estimate(m,c),minus=w.NCAAF_MODEL.estimate({...m,point:-3},c);
 assert.ok(plus.modelP>.5);assert.ok(minus.modelP<.5);assert.ok(Math.abs(plus.modelP+minus.modelP-1)<1e-10);
 assert.equal(w.NCAAF_MODEL.estimate({...m,team_id:'unknown'},c),null);
});
test('full slate includes schedule-only games without creating picks',async()=>{
 const r=runtime('ncaaf'),at=new Date().toISOString(),start=new Date(Date.now()+86400000).toISOString();
 const snapshot={updated_at:at,markets:[],slate:{updated_at:at,games:[{game_id:'g',game_time:start,game_label:'Away at Home'}]}};
 r.ctx.fetch=async url=>{const data=String(url).includes('kalshi-ncaaf')?snapshot:{};return {ok:true,json:async()=>data,text:async()=>JSON.stringify(data)}};
 for(const f of ['team-alt-lines.js','ncaaf-model.js','ncaaf-dashboard.js'])r.run(f);
 await r.window.NCAAF_DASHBOARD.load();
 const html=r.ctx.document.querySelector('#results').innerHTML;
 assert.match(html,/Full NCAAF Slate · 1 games/);assert.match(html,/Away at Home/);assert.match(html,/Schedule only/);
 assert.equal(r.window.PICK_QUALITY.markets('ncaaf').length,0);
});
test('public reference rows cannot enter exchange-only performance records',()=>{
 const m={referenceOnly:true,ticker:'ESPN:g',game_time:new Date(Date.now()+86400000).toISOString(),close_time:new Date(Date.now()+86400000).toISOString(),yes_ask:.5};
 const now=Date.now(),snapshot={updated_at:new Date(now).toISOString()};
 assert.equal(require('../scripts/update_forecast_audit').record('ncaaf',{market:m},snapshot,now),null);
 assert.equal(require('../scripts/update_pick_history').record('ncaaf',{market:m},now),null);
 assert.equal(require('../scripts/snapshot_daily_picks').legRecord('ncaaf',{market:m},snapshot,now),null);
});
