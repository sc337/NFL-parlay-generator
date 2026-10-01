const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function dashboard({nfl,mlb={rows:[],status:'ready'},ufc={rows:[],status:'ready'},ncaaf={rows:[],status:'experimental'}}){
 const elements=new Map(),element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,replaceChildren(){this.options=[]},add(option){this.options.push(option)},addEventListener(){}});
  return elements.get(id);
 };
 const window={BANKROLL_CORE:{validMoney:()=>true,validOdds:()=>true,balances:()=>({cash:0,pending:0,profit:0}),spentToday:()=>0,today:(start,now)=>new Date(start).toDateString()===now.toDateString(),ev:()=>0,suggestion:()=>({stake:0,reason:'Pass'})},MARKET_GUARDS:{esc:x=>x,fresh:x=>x?.updated_at==='fresh',quote:()=>.55},MLB_DASHBOARD:{bankrollCandidates:async()=>mlb},UFC_DASHBOARD:{bankrollCandidates:async()=>ufc},NCAAF_DASHBOARD:{bankrollCandidates:async()=>ncaaf},NFL_MODEL_V3:{evaluate:()=>({actionable:true,coverage:.5,confidence:70,modelP:.65})}};
 const context={window,document:{readyState:'loading',addEventListener(){},querySelector:element,activeElement:null},localStorage:{getItem:()=>null},fetch:async()=>nfl?{ok:true,json:async()=>nfl}:{ok:false},Option:class{constructor(text,value){this.text=text;this.value=value}},Date,setTimeout(){},setInterval(){}};
 vm.runInNewContext(fs.readFileSync('bankroll-builder.js','utf8'),context);
 return {builder:window.BANKROLL_BUILDER,element};
}

test('a failed feed is shown as unavailable instead of checked',async()=>{
 const {builder,element}=dashboard({nfl:null,mlb:{rows:[],status:'stale'}});
 await builder.refresh();
 assert.match(element('#builderGame').textContent,/NFL unavailable · MLB stale · NCAAF experimental · UFC ready/);
 assert.match(element('#builderReason').textContent,/stale or unavailable/);
});

test('NFL forecasts are drawn from the fresh snapshot even before opening its tab',async()=>{
 const kickoff=new Date(Date.now()+3600000).toISOString();
 const {builder}=dashboard({nfl:{updated_at:'fresh',games:[{game_status:'pre',commence_time:kickoff,away:'Away',home:'Home',markets:[{name:'Home ML',ticker:'pick1',price:-110}]}]}});
 await builder.refresh();
 assert.equal(builder.candidates().length,1);
 assert.equal(builder.candidates()[0].sport,'nfl');
 assert.equal(builder.status().ncaaf,'experimental');
});
