const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function setup(){
 const now=Date.now(),start=new Date(now+4*3600000).toISOString(),stamp=new Date(now-60000).toISOString();
 const game={gamePk:10,gameDate:start,status:'Preview',away:'Boston Red Sox',home:'New York Yankees',awayId:111,homeId:147,
  awayProbable:{id:1},homeProbable:{id:2}};
 const context={updated_at:stamp,scoring:{as_of:stamp,league:{games:140,runs_per_team:4.5},teams:{'111':{games:18,runs_for:99,runs_against:65},'147':{games:19,runs_for:90,runs_against:80}}},
  games:[game],pitchers:{'1':{era:'3.8',innings:90},'2':{era:'4.2',innings:90}},players:{},hitters:{}};
 const market=(title)=>({kind:'total',title,label:title,game_id:10,game_time:start,game_status:'pre',event_ticker:'KXMLBTOTAL-26SEP292000BOSNYY',ticker:'T',probability:.5,yes_ask:.51,spread:.02,volume:800,open_interest:500,game_label:'Boston Red Sox at New York Yankees'});
 const window={};vm.runInNewContext(fs.readFileSync('mlb-totals-model.js','utf8'),{window,Date,Math});
 return {window,context,market,start};
}
test('20,000 deterministic game score draws yield line-specific and complementary probabilities',()=>{
 const {window,context,market}=setup(),model=window.MLB_TOTALS_MODEL;
 const over=model.estimate(market('Over 8.5 runs scored'),context),repeat=model.estimate(market('Over 8.5 runs scored'),context);
 const under=model.estimate(market('Under 8.5 runs scored'),context),higher=model.estimate(market('Over 10.5 runs scored'),context);
 assert.equal(over.trials,20000);assert.deepEqual(JSON.parse(JSON.stringify(over)),JSON.parse(JSON.stringify(repeat)));
 assert.ok(over.projectedTotal>6&&over.projectedTotal<13);assert.ok(over.projectedAway>0&&over.projectedHome>0);
 assert.equal(over.modelP+under.modelP,1);assert.ok(higher.modelP<over.modelP);
 assert.ok(over.range[0]<over.projectedTotal&&over.range[1]>over.projectedTotal);
});
test('team totals use only the chosen team; thin, future, and postgame context cannot invent estimates',()=>{
 const {window,context,market}=setup(),model=window.MLB_TOTALS_MODEL;
 const home=model.estimate(market('Will New York Y score over 4.5 runs?'),context);
 assert.equal(home.kind,'team');assert.ok(home.projectedTeam>0);
 assert.notEqual(home.modelP,model.estimate(market('Over 4.5 runs scored'),context).modelP);
 assert.equal(model.estimate(market('Will Chicago score over 4.5 runs?'),context),null);
 assert.equal(model.estimate(market('Over 7 runs scored'),context),null);
 assert.equal(model.estimate(market('Over 8.5 runs scored'),{...context,scoring:{...context.scoring,teams:{}}}),null);
 assert.equal(model.estimate(market('Over 8.5 runs scored'),{...context,updated_at:new Date(Date.now()+5*3600000).toISOString()}),null);
 assert.equal(model.estimate({...market('Over 8.5 runs scored'),game_time:new Date(Date.now()-1000).toISOString()},context),null);
});
test('MLB dashboard displays a projection only when simulation coverage exists',async()=>{
 const {context,market}=setup(),nodes=new Map(),querySelector=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{}});return nodes.get(s)};
 const document={querySelector,body:{classList:{contains:()=>false}}},snapshot={updated_at:new Date().toISOString(),markets:[market('Over 8.5 runs scored')]};
 let daily;
 const window={__ACTIVE_SPORT:'mlb',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},COMPACT_UI:{refresh(){}},PICK_OF_DAY:{today:()=>true,show:(_sport,pick)=>{daily=pick}}};
 const fetch=async url=>({ok:true,json:async()=>url.includes('context')?context:snapshot});
 const sandbox=vm.createContext({window,document,fetch,Date,Math,console});
 for(const file of ['market-guards.js','model-core.js','mlb-totals-model.js','mlb-dashboard.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
 await window.MLB_DASHBOARD.load();
 assert.equal(daily.market,snapshot.markets[0]);
 assert.match(daily.label,/Game Total Over 8.5/);
 const estimate=window.MLB_DASHBOARD.model(snapshot.markets[0]);
 assert.equal(estimate.trials,20000);
 assert.ok(Number.isFinite(estimate.projectedTotal));
 assert.equal(estimate.experimental,true);
});
