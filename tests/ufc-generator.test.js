const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const snapshot=JSON.parse(fs.readFileSync('data/kalshi-ufc.json','utf8'));
const now=Date.parse('2026-09-26T05:30:00Z');
class ClockDate extends Date{static now(){return now}}
snapshot.updated_at=new Date(now).toISOString();
// Fixed pre-card fixtures keep this test valid after live snapshots roll forward.
const strong={slpm:6,sapm:1,str_acc:65,str_def:70,td_avg:4,td_def:85,sub_avg:2,wins:18,losses:2,recent5:{winRate:1}};
const weak={slpm:2,sapm:5,str_acc:35,str_def:35,td_avg:0,td_def:35,sub_avg:0,wins:5,losses:10,recent5:{winRate:.2}};
snapshot.fighter_stats={};
snapshot.markets=['Alpha','Bravo','Charlie'].map((name,i)=>{
 const opponent='Opponent '+name;snapshot.fighter_stats[name]=strong;snapshot.fighter_stats[opponent]=weak;
 return {ticker:'KXUFCFIGHT-26SEP26'+name.toUpperCase()+'-A',event_ticker:'KXUFCFIGHT-26SEP26'+name.toUpperCase(),kind:'moneyline',fight:name+' vs '+opponent,fighter1:i===1?opponent:name,fighter2:i===1?name:opponent,label:name+' wins',probability:.55,yes_ask:.56,yes_bid:.54,spread:.02,volume:500,open_interest:500,close_time:'2026-09-27T06:00:00Z'};
});
snapshot.markets.push({ticker:'KXUFCFIGHT-26SEP29TEST-A',event_ticker:'KXUFCFIGHT-26SEP29TEST',kind:'moneyline',fight:'Prospect A vs Prospect B',fighter1:'Prospect A',fighter2:'Prospect B',label:'Prospect A wins',probability:.55,yes_ask:.56,yes_bid:.54,spread:.02,volume:500,close_time:'2026-09-30T06:00:00Z'});
snapshot.markets.push({ticker:'KXUFCFIGHT-26OCT03TEST-A',event_ticker:'KXUFCFIGHT-26OCT03TEST',kind:'moneyline',fight:'Prospect C vs Prospect D',fighter1:'Prospect C',fighter2:'Prospect D',label:'Prospect C wins',probability:.55,yes_ask:.56,yes_bid:.54,spread:.02,volume:500,close_time:'2026-10-04T06:00:00Z'});
const elements=new Map();
function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'2',style:{},options:[],add(o){this.options.push(o)},replaceChildren(){this.options=[]},classList:{contains:()=>false}});return elements.get(key)}
const document={readyState:'loading',addEventListener(){},querySelector:element,body:{classList:{contains:()=>false}}};
const window={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{load:async()=>{},ufc:()=>''},COMPACT_UI:{refresh(){}}};
const context={window,document,Option:class{constructor(label,value){this.label=label;this.value=value}},fetch:async()=>({ok:true,json:async()=>snapshot}),Date:ClockDate,console};
for(const file of ['market-guards.js','data/model-calibration.js','model-calibration.js','model-core.js','pick-quality.js','ufc-dashboard.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
(async()=>{
 await window.UFC_DASHBOARD.load();
 const options=element('#ufcCardSelect').options;
 assert(options.some(o=>o.label.includes('UFC Fight Night: Rosas Jr. vs Barcelos')));
 assert(options.some(o=>o.label.includes('Dana White’s Contender Series: Season 10, Episode 8')));
 assert(options.some(o=>o.label.includes('UFC 332: Silva vs Wang')));
 assert(window.UFC_DASHBOARD.availableCount()>=2);
 const first=element('#results').innerHTML;
 assert.match(first,/Balanced 2-Leg/);
 assert.match(first,/Top-ranked qualified/);
 assert.match(first,/data-opponent="Opponent Bravo"/);
 assert.match(first,/Price est\./);
 assert.doesNotMatch(first,/Model est\./);
 assert.match(first,/Not win chance/);
 assert.match(first,/not model probabilities/);
 assert.match(first,/<details class="ufc-matchups">/);
 window.UFC_DASHBOARD.setLegs(2);
 const next=element('#results').innerHTML;
 assert.equal(next,first,'Generate must retain the strongest qualified combination');
 window.UFC_DASHBOARD.setLegs(3);assert.match(element('#results').innerHTML,/Balanced 3-Leg/);
 window.UFC_DASHBOARD.setLegs(2);assert.equal(element('#results').innerHTML,first,'Returning to two legs restores the best two-leg build');
 window.UFC_DASHBOARD.selectCard('2026-09-29');
 assert.equal(window.UFC_DASHBOARD.availableCount(),0);
 assert.doesNotMatch(element('#results').innerHTML,/Balanced 2-Leg/);
 console.log('UFC stable best parlay and official card labels passed');
})().catch(e=>{console.error(e);process.exitCode=1});
