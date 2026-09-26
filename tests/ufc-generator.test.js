const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const snapshot=JSON.parse(fs.readFileSync('data/kalshi-ufc.json','utf8'));
const now=Date.parse('2026-09-26T05:30:00Z');
class ClockDate extends Date{static now(){return now}}
snapshot.updated_at=new Date(now).toISOString();
const elements=new Map();
function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'2',style:{},options:[],add(o){this.options.push(o)},replaceChildren(){this.options=[]},classList:{contains:()=>false}});return elements.get(key)}
const document={readyState:'loading',addEventListener(){},querySelector:element,body:{classList:{contains:()=>false}}};
const window={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{load:async()=>{},ufc:()=>''},COMPACT_UI:{refresh(){}}};
const context={window,document,Option:class{constructor(label,value){this.label=label;this.value=value}},fetch:async()=>({ok:true,json:async()=>snapshot}),Date:ClockDate,console};
for(const file of ['market-guards.js','data/model-calibration.js','model-calibration.js','model-core.js','ufc-dashboard.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
(async()=>{
 await window.UFC_DASHBOARD.load();
 const options=element('#ufcCardSelect').options;
 assert(options.some(o=>o.label.includes('UFC Fight Night: Rosas Jr. vs Barcelos')));
 assert(options.some(o=>o.label.includes('Dana White’s Contender Series: Season 10, Episode 8')));
 assert(options.some(o=>o.label.includes('UFC 332: Silva vs Wang')));
 assert(window.UFC_DASHBOARD.availableCount()>=2);
 const first=element('#results').innerHTML;
 assert.match(first,/Bankroll 2-Leg/);
 assert.match(first,/Option 1 of/);
 assert.match(first,/<details class="ufc-matchups">/);
 window.UFC_DASHBOARD.setLegs(2);
 const next=element('#results').innerHTML;
 assert.match(next,/Option 2 of/);
 assert.notEqual(next,first,'Generate must produce another qualified combination');
 window.UFC_DASHBOARD.selectCard('2026-09-29');
 assert.equal(window.UFC_DASHBOARD.availableCount(),0);
 assert.doesNotMatch(element('#results').innerHTML,/Bankroll 2-Leg/);
 console.log('UFC parlay rotation and official card labels passed');
})().catch(e=>{console.error(e);process.exitCode=1});
