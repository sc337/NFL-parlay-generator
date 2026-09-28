const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function runtime(context){
  const nodes=new Map();
  const querySelector=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{}});return nodes.get(s)};
  const document={querySelector,body:{classList:{contains:()=>false}}};
  const window={__ACTIVE_SPORT:'ncaaf',__SPORT_TOKEN:1,SPORT_MEDIA:{load:async()=>{},ncaaf:()=>''},
    SPORT_LEGS:{mount:()=>{}},COMPACT_UI:{refresh:()=>{}}};
  const kickoff=new Date(Date.now()+86400000).toISOString();
  const market={game_id:'99',game_time:kickoff,close_time:kickoff,game_status:'pre',game_label:'Away at Alabama',
    ticker:'T',event_ticker:'T',label:'Alabama',title:'Alabama wins',kind:'moneyline',probability:.68,yes_ask:.69,
    spread:.03,volume:2000,open_interest:500};
  const data={updated_at:new Date().toISOString(),markets:[market]};
  const fetch=async url=>({ok:true,json:async()=>context,text:async()=>JSON.stringify(data)});
  const sandbox=vm.createContext({window,document,fetch,Date,console});
  for(const file of ['market-guards.js','model-core.js','ncaaf-model.js','ncaaf-dashboard.js'])
    vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
  return {window,nodes,market,kickoff};
}

test('NCAAF card distinguishes an experimental estimate from a market-only signal',async()=>{
  const form={available:true,games:4,box_games:4,points_for:35,points_against:16,margin:19,yards_for:450,yards_against:270};
  const context={updated_at:new Date().toISOString(),league_points_per_team:25,games:{'99':{
    kickoff:new Date(Date.now()+86400000).toISOString(),home:{aliases:['Alabama'],form},
    away:{aliases:['Away'],form:{...form,points_for:19,points_against:30,margin:-11,yards_for:300,yards_against:400}}}}};
  const app=runtime(context);
  await app.window.NCAAF_DASHBOARD.load();
  const html=app.nodes.get('#results').innerHTML;
  assert.match(html,/Experimental estimate \d+% \(unvalidated\)/);
  assert.doesNotMatch(html,/Edge \+0%|Model 68%/);
  const marketOnly=runtime({});
  await marketOnly.window.NCAAF_DASHBOARD.load();
  assert.match(marketOnly.nodes.get('#results').innerHTML,/Market-only; no independent estimate/);
});
