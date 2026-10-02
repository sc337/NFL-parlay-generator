const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({window:{},Date});vm.runInContext(fs.readFileSync('nhl-model.js','utf8'),ctx);const model=ctx.window.NHL_MODEL;
function fixture(){
 const now=Date.now(),start=new Date(now+3600000).toISOString();
 const stats={games:60,goals_for:3,goals_against:3,shots_for:30,shots_against:30};
 const profile={games:60,goals:24,assists:36,points:60,shots:180,toi:1200};
 const context={updated_at:new Date(now).toISOString(),stats_at:new Date(now).toISOString(),source:'Official NHL',league:{goals_for:3,shots_for:30},
  games:{'1':{id:'1',away:'BOS',home:'NYR',start,season_type:2,neutral:true}},
  teams:{BOS:{prior:{...stats}},NYR:{prior:{...stats}}},
  players:{'100':{prior:profile}},rosters:[{id:'100',name:'Test Player',team:'BOS',position:'C'}]};
 const market={context_game_id:'1',game_id:'10',game_status:'pre',game_time:start,kind:'moneyline',team_code:'BOS',teams:[{code:'BOS'},{code:'NYR'}],side:'yes',probability:.6,yes_ask:.61};
 return {context,market};
}
test('independent team forecast ignores quoted probabilities, prices and totals',()=>{
 const {context,market}=fixture(),first=model.estimate(market,context),changed=model.estimate({...market,probability:.2,yes_ask:.9},context);
 assert.equal(first.modelP,changed.modelP);assert.equal(first.projectedTotal,changed.projectedTotal);assert.notEqual(first.estimatedEV,changed.estimatedEV);assert.equal(first.betEV,null);assert.equal(first.experimental,true);
 assert.ok(Math.abs(first.modelP-.5)<1e-10);
 const low=model.estimate({...market,kind:'total',line:4.5},context),high=model.estimate({...market,kind:'total',line:7.5},context);
 assert.equal(low.projectedTotal,high.projectedTotal);assert.ok(low.modelP>high.modelP);
});
test('moneylines, puck lines and total sides have exact complementary probabilities',()=>{
 const {context,market}=fixture();
 const a=model.estimate(market,context),h=model.estimate({...market,team_code:'NYR'},context);
 assert.ok(Math.abs(a.modelP+h.modelP-1)<1e-9);
 for(const kind of ['total','spread']){
  const yes=model.estimate({...market,kind,line:kind==='total'?5.5:1.5},context);
  const no=model.estimate({...market,kind,line:kind==='total'?5.5:1.5,side:'no',team_code:kind==='spread'?'NYR':'BOS'},context);
  assert.ok(Math.abs(yes.modelP+no.modelP-1)<1e-9);
 }
});
test('player counts ignore market prices, reflect production and preserve complements',()=>{
 const {context,market}=fixture(),m={...market,kind:'points',line:.5,player_id:'100',player:'Test Player',player_verified:true};
 const over=model.estimate(m,context),under=model.estimate({...m,side:'no'},context);
 assert.ok(Math.abs(over.modelP+under.modelP-1)<1e-9);assert.ok(over.projectedLine>.8&&over.projectedLine<1.1);
 assert.equal(over.modelP,model.estimate({...m,yes_ask:.1,probability:.05},context).modelP);
 assert.equal(over.conditionalOnPlaying,true);
 const fewer=model.estimate({...m,line:1.5},context);assert.ok(fewer.modelP<over.modelP);
 const lower=structuredClone(context);lower.players['100'].prior.points=20;assert.ok(model.estimate(m,lower).modelP<over.modelP);
});
test('missing, future, stale, preseason and mismatched context never creates a forecast',()=>{
 const {context,market}=fixture();
 for(const patch of [{context_game_id:'missing'},{game_status:'in'},{teams:[{code:'COL'},{code:'NYR'}]},{game_time:new Date(Date.now()+7200000).toISOString()},{kind:'total',line:5}])assert.equal(model.estimate({...market,...patch},context),null);
 for(const change of [c=>c.updated_at=new Date(Date.now()-5*3600000).toISOString(),c=>c.stats_at=new Date(Date.now()+3600000).toISOString(),c=>c.stats_at=new Date(Date.now()-25*3600000).toISOString(),c=>c.games['1'].season_type=1,c=>c.teams.BOS.prior=null,c=>c.teams.BOS.prior.goals_for=null]){
  const c=structuredClone(context);change(c);assert.equal(model.estimate(market,c),null);
 }
});
test('unverified, wrong-team, low-sample players and unconfirmed saves remain market-only',()=>{
 const {context,market}=fixture(),m={...market,kind:'goals',line:.5,player_id:'100',player:'Test Player',player_verified:true};
 for(const patch of [{player_verified:false},{player_id:'unknown'},{player:'Other Player'},{team_code:'NYR'},{kind:'saves'},{line:1}])assert.equal(model.estimate({...m,...patch},context),null);
 context.players['100'].prior.games=3;assert.equal(model.estimate(m,context),null);
});
test('count distributions are normalized and deterministic',()=>{
 for(const shape of [null,4,8]){
  const a=model.distribution(3,shape),b=model.distribution(3,shape);assert.deepEqual(a,b);assert.ok(Math.abs(a.reduce((x,y)=>x+y,0)-1)<1e-12);assert.ok(a.every(p=>p>=0&&p<=1));
 }
});
