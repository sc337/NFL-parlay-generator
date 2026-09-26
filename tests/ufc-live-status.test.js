const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let clock=Date.parse('2026-09-26T23:20:00Z');
class ClockDate extends Date{static now(){return clock}}
const fighters=[['Raul Rosas Jr','Raoni Barcelos'],['Rodolfo Vieira','Robert Bryczek'],['Unknown One','Unknown Two']];
const rows=fighters.map(([fighter1,fighter2],i)=>({event_ticker:'KXUFCFIGHT-26SEP26'+i,close_time:'2026-10-10T21:00:00Z',kind:'moneyline',fighter1,fighter2,fight:fighter1+' vs '+fighter2,label:fighter1,probability:.6,volume:200,yes_bid:.55,yes_ask:.6}));
const snapshot={updated_at:new Date(clock).toISOString(),cards:{'2026-09-26':{firstBell:'2026-09-26T21:00:00Z',displayUntil:'2026-09-27T06:00:00Z'}},fighter_stats:{},markets:rows};
const bout=(id,state,names)=>({id,status:{type:{state}},competitors:names.map(displayName=>({athlete:{displayName}}))});
const schedule={events:[{competitions:[bout(1,'pre',['Raul Rosas Jr.','Raoni Barcelos']),bout(2,'in',['Robert Bryczek','Rodolfo Vieira'])]}]};
const elements=new Map();
function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',style:{},options:[],add(o){this.options.push(o)},replaceChildren(){this.options=[]},classList:{contains:()=>false}});return elements.get(key)}
const document={readyState:'loading',addEventListener(){},querySelector:element,body:{classList:{contains:()=>false}}};
const window={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{load:async()=>{},ufc:()=>''},COMPACT_UI:{refresh(){}}};
let statusReads=0;
const fetch=async url=>{if(url.startsWith('https://site.api.espn.com')){statusReads++;return {ok:true,json:async()=>schedule}}return {ok:true,json:async()=>snapshot}};
const context={window,document,Option:class{constructor(label,value){this.label=label;this.value=value}},Date:ClockDate,fetch,console};
for(const file of ['market-guards.js','ufc-dashboard.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
(async()=>{
 await window.UFC_DASHBOARD.load();
 assert.equal(statusReads,1);
 assert.equal(rows[0].game_status,'pre');
 assert(window.UFC_DASHBOARD.isPregame(rows[0]));
 assert.equal(rows[1].game_status,'in');
 assert(!window.UFC_DASHBOARD.isVisible(rows[1]));
 assert(!window.UFC_DASHBOARD.isPregame(rows[2]),'Unverified matchup stays excluded after first bell');
 assert.match(element('#ufcCardNote').textContent,/2 markets from the selected card/);
 clock+=121000;
 assert(!window.UFC_DASHBOARD.isPregame(rows[0]),'A live status expires unless refreshed');
 console.log('UFC live fight status filtering passed');
})().catch(e=>{console.error(e);process.exitCode=1});
