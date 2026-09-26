const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const elements=new Map(),listeners=new Map();
function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',style:{},options:[],add(option){this.options.push(option)},replaceChildren(){this.options=[]},addEventListener(type,fn){listeners.set(key+':'+type,fn)},classList:{contains:()=>false}});return elements.get(key)}
const document={readyState:'loading',addEventListener(){},querySelector:element,body:{classList:{contains:()=>false}}};
const window={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{load:async()=>{},ufc:()=>''},COMPACT_UI:{refresh(){}},PREDICTION_MODEL:{show(){}}};
const day=offset=>{const d=new Date(Date.now()+offset*86400000);return String(d.getUTCFullYear()).slice(-2)+d.toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()+String(d.getUTCDate()).padStart(2,'0')};
const a=day(3),b=day(10),market=(date,fight)=>({event_ticker:'KXUFCFIGHT-'+date+fight,kind:'moneyline',fight,label:fight,probability:.6,yes_bid:.57,yes_ask:.63,volume:150,fighter1:'A'+fight,fighter2:'B'+fight});
const snapshot={updated_at:new Date().toISOString(),fighter_stats:{},markets:[market(a,'FIRST'),market(b,'SECOND')]};
const context={window,document,Option:class{constructor(label,value){this.label=label;this.value=value}},fetch:async()=>({ok:true,json:async()=>snapshot}),Date};
vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('ufc-dashboard.js','utf8'),context);

// The official Sep 26 card must survive the UTC date rollover, then stop producing bets at first bell.
let clock=Date.parse('2026-09-26T05:00:00Z');
class ClockDate extends Date{static now(){return clock}}
const scheduledWindow={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1};
const scheduleContext={window:scheduledWindow,document:{readyState:'loading',addEventListener(){},querySelector(){return null}},Date:ClockDate};
vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),scheduleContext);
vm.runInNewContext(fs.readFileSync('ufc-dashboard.js','utf8'),scheduleContext);
const rosas={event_ticker:'KXUFCFIGHT-26SEP26ROS BAR',close_time:'2026-10-10T21:00:00Z'};
assert(scheduledWindow.UFC_DASHBOARD.isPregame(rosas));
assert(scheduledWindow.UFC_DASHBOARD.isVisible(rosas));
clock=Date.parse('2026-09-26T22:00:00Z');
assert(!scheduledWindow.UFC_DASHBOARD.isPregame(rosas));
assert(scheduledWindow.UFC_DASHBOARD.isVisible(rosas));
clock=Date.parse('2026-09-27T05:00:00Z');
assert(!scheduledWindow.UFC_DASHBOARD.isVisible(rosas));
clock=Date.parse('2026-10-03T02:00:00Z');
assert(scheduledWindow.UFC_DASHBOARD.isVisible({event_ticker:'KXUFCFIGHT-26OCT03OTHER',close_time:'2026-10-04T10:00:00Z'}),'An undated-start card remains browseable on its event day');

(async()=>{
 await window.UFC_DASHBOARD.load();
 const select=element('#ufcCardSelect'),note=element('#ufcCardNote');
 assert.equal(select.options.length,3);
 assert.equal(select.value,select.options[0].value);
 assert.match(note.textContent,/1 markets from the selected card/);
 window.UFC_DASHBOARD.selectCard(select.options[1].value);
 assert.equal(window.UFC_DASHBOARD.selectedCard(),select.options[1].value);
 assert.match(element('#results').innerHTML,/SECOND/);
 assert.doesNotMatch(element('#results').innerHTML,/Bankroll 2-Leg/,'Negative-EV legs must not become a recommended parlay');
 assert.doesNotMatch(element('#results').innerHTML,/FIRST/);
 window.UFC_DASHBOARD.selectCard('all');
 assert.match(element('#results').innerHTML,/FIRST/);
 assert.match(element('#results').innerHTML,/SECOND/);
 assert.doesNotMatch(element('#results').innerHTML,/Bankroll 2-Leg/,'Negative-EV legs must not become a recommended parlay');
 console.log('UFC card grouping passed');
})().catch(e=>{console.error(e);process.exitCode=1});
