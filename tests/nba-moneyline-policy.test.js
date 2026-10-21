const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const NOW=Date.parse('2026-10-21T05:09:00Z'),START='2026-10-22T00:00:00Z';
function fixture(prices=[.76,.68,.60,.55]){
 const ctx={updated_at:new Date(NOW).toISOString(),games:{},teams:{},players:{}},markets=[];
 for(const [i,p] of prices.entries()){
  const away='A'+i,home='H'+i,game_id='g'+i;ctx.games[game_id]={away,home,start:START,season_type:2};
  for(const [team,prob] of [[away,p],[home,1-p]]){
   ctx.teams[team]={games:Array.from({length:12},(_,j)=>({date:new Date(Date.parse('2026-04-12T00:00Z')-j*86400000).toISOString(),season_type:2,points:115,allowed:111,possessions:100}))};
   markets.push({kind:'moneyline',side:'yes',team_code:team,game_id,game_time:START,game_status:'pre',selection_id:game_id+team,ticker:game_id+team,label:team+' ML',game_label:away+' vs '+home,probability:prob,yes_ask:prob+.005,spread:.01,volume:100,source:'Kalshi'});
  }
 }
 return {ctx,markets,updated_at:new Date(NOW).toISOString()};
}
function runtime(fixture,{legs=2,confirmed=false}={}){
 let now=NOW;class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const nodes=new Map(['#results','#resultsTitle','#dataStatus','#modeTitle'].map(k=>[k,{innerHTML:'',textContent:'',querySelector(){return null}}]));
 const window={__ACTIVE_SPORT:'nba',__SPORT_TOKEN:1,DASHBOARD_UI:{begin(){},end(){},get:(s,k,d)=>k==='legs'?legs:d},SPORT_MARKETS:{allowed:()=>true,sync(){}},SLATE_UI:{matches:()=>true,prepare(){}},STARTER_STATUS:{register(){},evidence:()=>({confirmed})}};
 const env={window,Date:Clock,console,document:{querySelector:s=>nodes.get(s)},fetch:async url=>({ok:true,json:async()=>url.includes('kalshi')?fixture:fixture.ctx})};
 for(const name of ['market-guards.js','nba-model.js','nba-alt-lines.js','pick-quality.js','nba-dashboard.js'])vm.runInNewContext(fs.readFileSync(name,'utf8'),env,{filename:name});
 window.PICK_QUALITY.prepare('nba',fixture.markets,fixture.ctx,[],fixture.updated_at);
 return {w:window,nodes,advance:ms=>now+=ms};
}
test('opening-week fallback normalizes both teams and cannot claim independent value',()=>{
 const f=fixture(),r=runtime(f),M=r.w.NBA_MODEL,Q=r.w.PICK_QUALITY,[a,b]=f.markets;
 const x=M.estimate(a,f.ctx),y=M.estimate(b,f.ctx);assert.ok(x.marketAnchored);assert.equal(x.marketBasis.independentWeight,0);assert.ok(Math.abs(x.modelP+y.modelP-1)<1e-12);assert.equal(x.recentGames,0);
 const forecast=Q.forecast('nba',a,x),q=Q.assess('nba',a,forecast,{parlay:true,nbaProfile:'safe'});
 assert.equal(q.pass,true);assert.equal(q.valueQualified,false);assert.equal(q.validated,false);assert.equal(q.ev,null);assert.equal(q.conservativeEV,null);assert.equal(forecast.betEV,null);assert.equal(q.minimumOdds,null);
 assert.match(Q.note('nba',a,forecast),/Market-informed likelihood; value unverified/);assert.doesNotMatch(Q.note('nba',a,forecast),/Minimum acceptable odds/);
});
test('fallback fails closed for absent, stale, mismatched, illiquid or incoherent opposing quotes',()=>{
 for(const change of ['missing','stale','future','wrong-team','wrong-start','source','spread','volume','incoherent','unmatched','started','preseason','old-context']){
  const f=fixture(),[a,b]=f.markets;
  if(change==='missing')f.markets.splice(1,1);if(change==='stale')b.quotedAt=new Date(NOW-31*60000).toISOString();if(change==='future')b.quotedAt=new Date(NOW+6*60000).toISOString();if(change==='wrong-team')b.team_code='X';if(change==='wrong-start')b.game_time='2026-10-23T00:00Z';if(change==='source')b.source='Other';if(change==='spread')b.spread=.2;if(change==='volume')b.volume=0;if(change==='incoherent')b.yes_ask=.8;if(change==='unmatched')b.context_unmatched=true;if(change==='started')f.ctx.games.g0.start=new Date(NOW-1).toISOString();if(change==='preseason')f.ctx.games.g0.season_type=1;if(change==='old-context')f.ctx.updated_at=new Date(NOW-5*3600000).toISOString();
  assert.equal(runtime(f).w.NBA_MODEL.estimate(a,f.ctx),null,change);
 }
});
test('historical team data decays and an established current-season sample stays independent',()=>{
 const f=fixture(),r=runtime(f),M=r.w.NBA_MODEL,a=f.markets[0],old=M.team(f.ctx.teams[a.team_code].games,NOW,Date.parse(START));
 for(const team of Object.values(f.ctx.teams))team.games=team.games.map((g,i)=>({...g,date:new Date(NOW-(i+1)*86400000).toISOString()}));
 const recent=M.team(f.ctx.teams[a.team_code].games,NOW,Date.parse(START));assert.ok(old.effectiveN<recent.effectiveN/10);assert.equal(old.recent,0);assert.equal(recent.recent,12);
 const x=M.estimate(a,f.ctx);assert.equal(x.marketAnchored,false);assert.equal(x.marketBasis,null);const original=x.modelP;a.yes_ask=.8;a.probability=.8;assert.equal(M.estimate(a,f.ctx).modelP,original);
});
test('NBA ML keeps price caps, injury checks and near-tip lineup gates',()=>{
 const f=fixture([.9,.7]),r=runtime(f),Q=r.w.PICK_QUALITY,M=r.w.NBA_MODEL,a=f.markets[0],b=f.markets[2];
 const assess=m=>Q.assess('nba',m,Q.forecast('nba',m,M.estimate(m,f.ctx)),{parlay:true,nbaProfile:'safe'});
 assert.match(assess(a).reason,/price too short/);b.injury_status='out';assert.match(assess(b).reason,/unavailable|out/i);delete b.injury_status;
 const near=new Date(NOW+60*60000).toISOString();b.game_time=near;f.markets[3].game_time=near;f.ctx.games.g1.start=near;assert.match(assess(b).reason,/Confirm starters/);
});
test('key-player injury and changed roster history reduce independent reliance instead of inventing an adjustment',()=>{
 for(const change of ['injury','roster']){
  const f=fixture(),r=runtime(f);for(const team of Object.values(f.ctx.teams))team.games=team.games.map((g,i)=>({...g,date:new Date(NOW-(i+1)*86400000).toISOString()}));
  f.ctx.players.p={id:'p',name:'Starter',team:'A0',injury_status:change==='injury'?'Questionable':'',games:Array.from({length:5},()=>({team:change==='roster'?'OLD':'A0',minutes:32}))};
  const forecast=r.w.NBA_MODEL.estimate(f.markets[0],f.ctx);assert.equal(forecast.marketAnchored,true);assert.ok(forecast.marketBasis.independentWeight<=.125);assert.match(forecast.marketBasis.reason,change==='injury'?/availability/:/Roster/);
 }
});
test('2–4 leg favorite, underdog and mixed slates produce complete independent profiles without padding',async()=>{
 for(const count of [2,3,4])for(const style of ['favorites','underdogs','mixed']){
  const f=fixture(Array(4).fill(style==='favorites'?.76:style==='underdogs'?.62:.62)),r=runtime(f,{legs:count});await r.w.NBA_DASHBOARD.load();
  const A=r.w.NBA_DASHBOARD,rows=f.markets.filter((m,i)=>style==='favorites'?i%2===0:style==='underdogs'?i%2===1:i%4===0||i%4===3);
  const builds=A.PROFILES.map(profile=>({profile,legs:A.profileBuild(rows,count,false,profile)})).filter(b=>b.legs.length);
  assert.ok(builds.length,style+' '+count);for(const b of builds){assert.equal(b.legs.length,count);assert.equal(new Set(b.legs.map(m=>m.game_id)).size,count);assert.ok(b.legs.every(m=>rows.includes(m)));}
  assert.equal(A.profileBuild(rows.slice(0,count-1),count,false,A.PROFILES[0]).length,0);
 }
});
