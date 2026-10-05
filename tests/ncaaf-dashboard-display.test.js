const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function runtime(context,patch={}){
  const nodes=new Map();
  const querySelector=s=>{if(s==='#parlayControls'||s.endsWith('MarketFilters'))return null;if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{}});return nodes.get(s)};
  const document={querySelector,body:{classList:{contains:()=>false}}};
  let daily;
  const window={__ACTIVE_SPORT:'ncaaf',__SPORT_TOKEN:1,SPORT_MEDIA:{load:async()=>{},ncaaf:()=>''},PICK_OF_DAY:{today:()=>true,show:(_sport,pick)=>{daily=pick}},
    SPORT_LEGS:{mount:()=>{}},COMPACT_UI:{refresh:()=>{}}};
  const kickoff=new Date(Date.now()+86400000).toISOString();
  const market={game_id:'99',game_time:kickoff,close_time:kickoff,game_status:'pre',game_label:'Away at Alabama',
    ticker:'T',event_ticker:'T',label:'Alabama',title:'Alabama wins',kind:'moneyline',probability:.68,yes_ask:.69,
    spread:.03,volume:2000,open_interest:500,...patch};
  const data={updated_at:new Date().toISOString(),markets:[market]};
  const fetch=async url=>({ok:true,json:async()=>context,text:async()=>JSON.stringify(data)});
  const sandbox=vm.createContext({window,document,fetch,Date,console});
  for(const file of ['market-guards.js','sport-markets.js','model-core.js','ncaaf-model.js','ncaaf-dashboard.js'])
    vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
  return {window,nodes,market,kickoff,daily:()=>daily};
}

test('NCAAF card distinguishes an experimental estimate from a market-only signal',async()=>{
  const form={available:true,games:4,box_games:4,points_for:35,points_against:16,margin:19,yards_for:450,yards_against:270};
  const context={updated_at:new Date().toISOString(),league_points_per_team:25,games:{'99':{
    kickoff:new Date(Date.now()+86400000).toISOString(),home:{aliases:['Alabama'],form},
    away:{aliases:['Away'],form:{...form,points_for:19,points_against:30,margin:-11,yards_for:300,yards_against:400}}}}};
  const app=runtime(context);
  await app.window.NCAAF_DASHBOARD.load();
  assert.equal(app.daily().market.ticker,app.market.ticker);
  assert.match(app.daily().note,/experimental/i);
  const estimate=app.window.NCAAF_DASHBOARD.projection(app.market);
  assert.equal(estimate.experimental,true);
  assert.notEqual(estimate.modelP,app.market.probability);
  const marketOnly=runtime({});
  await marketOnly.window.NCAAF_DASHBOARD.load();
  assert.equal(marketOnly.window.NCAAF_DASHBOARD.projection(marketOnly.market).experimental,false);
  assert.match(app.nodes.get('#results').innerHTML,/EXPERIMENTAL/);
  assert.doesNotMatch(app.nodes.get('#results').innerHTML,/MARKET ONLY/);
  assert.match(app.nodes.get('#results').innerHTML,/Quote quality .*Not win chance/);
  assert.match(app.nodes.get('#results').innerHTML,/Starts /);
  assert.match(app.nodes.get('#results').innerHTML,/1 of 2 legs available/);
  assert.match(marketOnly.nodes.get('#results').innerHTML,/MARKET SIGNALS/);
});

test('contradicted experimental picks cannot enter recommendations or creator fallback',async()=>{
  const strong={available:true,games:4,box_games:4,points_for:35,points_against:16,margin:19,yards_for:450,yards_against:270};
  const weak={...strong,points_for:19,points_against:30,margin:-11,yards_for:300,yards_against:400};
  const app=runtime({updated_at:new Date().toISOString(),league_points_per_team:25,games:{'99':{
    kickoff:new Date(Date.now()+86400000).toISOString(),home:{aliases:['Alabama'],form:weak},away:{aliases:['Away'],form:strong}}}});
  await app.window.NCAAF_DASHBOARD.load();
  assert.ok(app.window.NCAAF_DASHBOARD.projection(app.market).modelP<app.market.yes_ask);
  for(const mode of ['bankroll','balanced','long'])assert.equal(app.window.NCAAF_DASHBOARD.eligible(app.market,mode),false);
  app.window.NCAAF_DASHBOARD.setLegs(6);
  assert.equal(app.daily(),undefined);
  assert.match(app.nodes.get('#results').innerHTML,/No qualifying NCAAF picks/);
  assert.doesNotMatch(app.nodes.get('#results').innerHTML,/class="parlay-card"/);
});

test('missing executable quote or unverified kickoff cannot be a college recommendation',async()=>{
  for(const patch of [{yes_ask:null},{game_time:null,event_ticker:'KXNCAAFGAME-30JAN01OSUIOWA'},{game_status:'Live'}]){
    const app=runtime({},patch);await app.window.NCAAF_DASHBOARD.load();
    assert.equal(app.daily(),undefined);
    assert.doesNotMatch(app.nodes.get('#results').innerHTML,/class="parlay-card"/);
  }
});


test('college market selections filter real recommendations and remain separate from baseball',async()=>{
  const app=runtime({});await app.window.NCAAF_DASHBOARD.load();
  assert.ok(app.daily());
  app.window.SPORT_MARKETS.set('mlb',[]);
  assert.equal(app.window.NCAAF_DASHBOARD.eligible(app.market,'balanced'),true);
  app.window.SPORT_MARKETS.set('ncaaf',['spread','total']);
  assert.equal(app.window.NCAAF_DASHBOARD.eligible(app.market,'balanced'),false);
  assert.equal(app.daily(),undefined);
  assert.doesNotMatch(app.nodes.get('#results').innerHTML,/class="parlay-card"/);
  app.window.SPORT_MARKETS.set('ncaaf',['moneyline']);
  assert.equal(app.daily().market.ticker,app.market.ticker);
});
