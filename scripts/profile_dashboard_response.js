// Replays one frozen feed in Node, without network or writes. --compare also
// replays HEAD's implementation and checks that selected HTML is unchanged.
const fs=require('node:fs'),vm=require('node:vm'),{performance}=require('node:perf_hooks'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const feed=JSON.parse(fs.readFileSync('data/kalshi-nba.json')),context=JSON.parse(fs.readFileSync('data/nba-context.json')),starter=JSON.parse(fs.readFileSync('data/starter-status.json'));
const now=Date.parse(feed.updated_at)+60000;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
async function replay(baseline=false){
 const nodes=new Map(['#results','#resultsTitle','#dataStatus','#modeTitle'].map(k=>[k,{innerHTML:'',textContent:'',querySelector(){return null}}]));
 const dates=new Map(),day=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
 const game=feed.markets.find(m=>m.game_id&&Date.parse(m.game_time)>now&&day(m.game_time)===day(now))?.game_id;
 const window={__ACTIVE_SPORT:'nba',__SPORT_TOKEN:1,DASHBOARD_UI:{begin(){},end(){},get:(s,k,d)=>({mode:'sgp',game:String(game||''),legs:2}[k]??d)},SPORT_MARKETS:{allowed:()=>true,sync(){}},SLATE_UI:{matches:(s,m)=>{if(!dates.has(m.game_time))dates.set(m.game_time,day(m.game_time)===day(now));return dates.get(m.game_time)},prepare(){}}};
 const env=vm.createContext({window,Date:Clock,URL,console,localStorage:{getItem:()=>null},document:{querySelector:s=>nodes.get(s)},fetch:async url=>({ok:true,json:async()=>url.includes('starter-status')?starter:url.includes('kalshi-nba')?feed:context})});
 for(const file of ['market-guards.js','starter-status.js','nba-model.js','nba-alt-lines.js','pick-quality.js','nba-dashboard.js'])vm.runInContext(baseline?execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8'),env);
 let t=performance.now();await window.NBA_DASHBOARD.load();const renderMs=performance.now()-t,html=nodes.get('#results').innerHTML;
 t=performance.now();const count=window.NBA_DASHBOARD.availableCount(),countMs=performance.now()-t;
 t=performance.now();window.NBA_DASHBOARD.refresh();const refreshMs=performance.now()-t;
 return {html,timing:{renderMs,countMs,refreshMs,count,cards:(html.match(/class="parlay-card"/g)||[]).length}};
}
(async()=>{let baseline;if(process.argv.includes('--compare'))baseline=await replay(true);const current=await replay();if(baseline){assert.equal(current.html,baseline.html,'Performance changes must preserve selected picks and labels');console.log('Baseline:',baseline.timing)}console.log('Current:',current.timing);if(baseline)console.log('Identical recommendation HTML; render speedup:',(baseline.timing.renderMs/current.timing.renderMs).toFixed(1)+'x')})().catch(error=>{console.error(error);process.exitCode=1});
