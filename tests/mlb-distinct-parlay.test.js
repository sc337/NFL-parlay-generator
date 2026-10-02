const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function guards(){const window={};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),{window,Date});return window.MARKET_GUARDS}
test('odds cannot multiply same-game prices across market families or ID types',()=>{
 const g=guards(),a={game_id:12,event_ticker:'KXMLBGAME-26OCT031300CWSCLE',yes_ask:.6};
 assert.equal(g.estOdds([a,{...a,game_id:'12',event_ticker:'KXMLBTOTAL-26OCT031300CWSCLE'}]),null);
 assert.equal(g.estOdds([a,{event_ticker:'KXMLBTOTAL-26OCT031300CWSCLE',yes_ask:.5}]),null);
 assert.equal(g.estOdds([{yes_ask:.5},{yes_ask:.5}]),null);
 assert.equal(g.estOdds([a,{game_id:13,event_ticker:'KXMLBGAME-26OCT051700CWSCLE',yes_ask:.5}]),233);
});

test('six requested MLB legs return three distinct matchups with dates and market-only labels',async()=>{
 const start=new Date(Date.now()+48*3600000).toISOString(),later=new Date(Date.now()+96*3600000).toISOString();
 const pairs=['CWSCLE','SDMIL','NYYTB'];
 const markets=pairs.flatMap((pair,i)=>[
  {kind:'total',label:'Over 6.5 runs scored',event_ticker:'KXMLBTOTAL-26OCT031300'+pair,game_id:i+1,game_time:start},
  {kind:'moneyline',label:'Team '+i+' wins',event_ticker:'KXMLBGAME-26OCT051700'+pair,game_id:String(i+4),game_time:later},
  {kind:'moneyline',label:'Team '+i+' wins',event_ticker:'KXMLBGAME-26OCT031300'+pair,game_id:String(i+1),game_time:start}
 ]).map(m=>({...m,yes_ask:.55,probability:.55,volume:1000,spread:.02}));
 const nodes=new Map(),document={body:{classList:{contains:()=>false}},querySelector:s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:''});return nodes.get(s)}};
 const window={__ACTIVE_SPORT:'mlb',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},COMPACT_UI:{refresh(){}}};
 const fetch=async url=>({ok:true,json:async()=>url.includes('context')?{updated_at:new Date().toISOString(),games:[],pitchers:{}}:{updated_at:new Date().toISOString(),markets}});
 const env=vm.createContext({window,document,fetch,Date,Math});
 for(const f of ['market-guards.js','model-core.js','mlb-dashboard.js'])vm.runInContext(fs.readFileSync(f,'utf8'),env);
 await window.MLB_DASHBOARD.load();window.MLB_DASHBOARD.setLegs(6);
 const html=nodes.get('#results').innerHTML;
 assert.equal((html.match(/class="leg mlb-leg"/g)||[]).length,3);
 assert.match(html,/3 of 6 legs available/);
 assert.match(html,/Starts /);
 assert.match(html,/Market-only; no independent estimate/);
 assert.doesNotMatch(html,/ · Model \d+%/);
 assert.doesNotMatch(html,/Independent games/);
});
