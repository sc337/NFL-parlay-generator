const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(snapshot){const window={},urls=[],document={addEventListener(){},querySelector(){return null},body:{classList:{remove(){}}}};const env={window,document,localStorage:{getItem(){return ''}},Date,Math,URL,setTimeout(){},fetch:async url=>{urls.push(String(url));return {ok:true,json:async()=>snapshot}}};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),env);vm.runInNewContext(fs.readFileSync('prediction-model.js','utf8'),env);return {api:window.PREDICTION_MODEL,urls,window,env}}
const start=new Date(Date.now()+86400000).toISOString(),at=new Date().toISOString();
function poly(patch={}){return {source:'Polymarket',referenceOnly:true,polymarket_token:'123',kind:'moneyline',game_id:'g',game_time:start,quotedAt:at,team:'New Orleans Saints',yes_bid:.59,yes_ask:.61,spread:.02,askDepth:100,...patch}}
const fixture={key:'g',names:['Pittsburgh Steelers','New Orleans Saints'],side:'New Orleans Saints',time:Date.parse(start)};
test('consensus accepts only fresh verified books matched to exact event and selection',()=>{
 const {api}=setup({});const snapshot={markets:[poly()]};
 assert.equal(api.verifiedPoly(snapshot,fixture,'mlb'),.60);
 for(const patch of [{polymarket_token:null},{game_id:'other'},{team:'Other Saints'},{askDepth:0},{spread:.2},{quotedAt:new Date(Date.now()-3600000).toISOString()},{game_time:new Date(Date.parse(start)+3600000).toISOString()}])assert.equal(api.verifiedPoly({markets:[poly(patch)]},fixture,'mlb'),null);
});
test('backup rows never masquerade as Kalshi consensus and no browser Gamma calls remain',async()=>{
 const native={kind:'moneyline',game_id:'g',game_time:start,game_label:'Pittsburgh Steelers at New Orleans Saints',title:'New Orleans Saints wins',label:'New Orleans Saints',probability:.55,yes_ask:.55,source:'Kalshi'};
 const {api,urls}=setup({updated_at:at,markets:[native,poly({label:'New Orleans Saints'})],polymarket:{status:'ready'}});
 const result=await api.load('mlb');assert.equal(result.rows.length,1);assert.equal(result.rows[0].sources.length,2);assert.equal(result.rows[0].sources[0].name,'Kalshi');assert.equal(result.rows[0].sources[1].name,'Polymarket');
 assert.ok(urls.every(u=>!u.includes('polymarket.com')&&!u.includes('the-odds-api')));
});
test('Polymarket props remain references with separate void-rule warning',()=>{
 assert.match(fs.readFileSync('pick-quality.js','utf8'),/Caesars price, fees and player void rules can differ/);
 const {window,env}=setup({});env.state={games:[]};vm.runInNewContext(fs.readFileSync('nfl-alt-lines.js','utf8'),env);
 const m={source:'Polymarket',referenceOnly:true,player:'QB',marketKey:'player_pass_completions',point:19.5,side:'over'};
 assert.equal(window.NFL_ALT_LINES.selected(m,new Set(['completions'])),true);
});
