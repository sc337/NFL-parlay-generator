const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){
 let now=Date.parse('2026-10-20T05:00:00Z'),allowed=true;
 class Clock extends Date{static now(){return now}}
 const snapshot={updated_at:new Date(now).toISOString(),cards:{'2026-10-24':{firstBell:'2026-10-24T16:00:00Z'}},fighter_stats:{},markets:[]};
 for(let i=0;i<4;i++){
  const a='Fighter '+i,b='Opponent '+i;
  snapshot.fighter_stats[a]={identity_verified:true,fetched_at:snapshot.updated_at,slpm:4.5,sapm:3,str_acc:55,str_def:60,td_avg:2,td_def:70,sub_avg:1,wins:15,losses:4,recent5:{count:5,wins:4,losses:1,winRate:.8}};
  snapshot.fighter_stats[b]={identity_verified:true,fetched_at:snapshot.updated_at,slpm:4,sapm:3.4,str_acc:50,str_def:55,td_avg:1.5,td_def:65,sub_avg:.5,wins:12,losses:6,recent5:{count:5,wins:3,losses:2,winRate:.6}};
  snapshot.markets.push({ticker:'KXUFCFIGHT-26OCT24TEST'+i+'-A',event_ticker:'KXUFCFIGHT-26OCT24TEST'+i,kind:'moneyline',fighter1:a,fighter2:b,fight:a+' vs '+b,label:a,probability:.60,yes_ask:.605,yes_bid:.595,spread:.01,volume:500,close_time:'2026-10-25T02:00:00Z'});
 }
 const elements=new Map(),el=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'2',style:{},options:[],add(o){this.options.push(o)},replaceChildren(){this.options=[]},classList:{contains:()=>false}});return elements.get(k)};
 const document={readyState:'loading',addEventListener(){},querySelector:el,body:{classList:{contains:()=>false}}};
 const window={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1,SPORT_MEDIA:{load:async()=>{},ufc:()=>''},SPORT_MARKETS:{allowed:()=>allowed,sync(){}},COMPACT_UI:{refresh(){}},PICK_OF_DAY:{show(s,p){window.straight=p},today:()=>true}};
 const context={window,document,Date:Clock,Option:class{constructor(label,value){this.label=label;this.value=value}},fetch:async()=>({ok:true,json:async()=>snapshot}),console};
 for(const file of ['market-guards.js','data/model-calibration.js','model-calibration.js','model-core.js','pick-quality.js','ufc-dashboard.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 return {window,snapshot,el,advance:n=>now+=n,filter:on=>allowed=on};
}
test('UFC shows one honest matchup straight and complete 2–4 fight parlays without claiming verified value',async()=>{
 const r=runtime(),w=r.window;await w.UFC_DASHBOARD.load();assert.equal(w.UFC_DASHBOARD.availableCount(),4);assert.ok(w.straight);
 const m=w.PICK_QUALITY.markets('ufc')[0],f=w.UFC_DASHBOARD.model(m),q=w.PICK_QUALITY.assess('ufc',m,f);
 assert.equal(f.selectionMode,'ideas');assert.equal(q.pass,true);assert.equal(q.valueQualified,false);assert.equal(q.pricePass,false);assert.ok(q.warnings.some(s=>/positive price value is not established/.test(s)));
 assert.equal(w.PICK_QUALITY.assess('ufc',m,{...f,selectionMode:'screened'}).pass,false,'strict value screening still rejects this unvalidated estimate');
 for(const n of [2,3,4]){w.UFC_DASHBOARD.setLegs(n);assert.match(r.el('#results').innerHTML,new RegExp('UFC '+n+'-Leg Parlay'));assert.match(r.el('#results').innerHTML,/MATCHUP SUGGESTION/);assert.match(r.el('#results').innerHTML,/Positive value is unverified/)}
});
test('UFC suggestions still reject stale quotes, started fights, incomplete profiles and excluded markets',async()=>{
 const r=runtime(),w=r.window;await w.UFC_DASHBOARD.load();const m=w.PICK_QUALITY.markets('ufc')[0];
 r.filter(false);assert.equal(w.UFC_DASHBOARD.qualification(m).reason,'Excluded by market filters');r.filter(true);
 assert.equal(w.UFC_DASHBOARD.qualification({...m,game_status:'in'}).pass,false);
 assert.equal(w.UFC_DASHBOARD.qualification({...m,fighter2:'Unknown'}).pass,false);
 assert.equal(w.UFC_DASHBOARD.qualification({...m,kind:'round_finish'}).pass,false);
 assert.equal(w.UFC_DASHBOARD.qualification({...m,volume:10}).reason,'Insufficient market liquidity');
 r.advance(31*60000);assert.equal(w.UFC_DASHBOARD.qualification(m).reason,'Quote older than 30 minutes');w.UFC_DASHBOARD.refresh();assert.equal(w.UFC_DASHBOARD.availableCount(),0);assert.equal(w.straight,undefined);
});
