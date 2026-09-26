const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const elements=new Map(),listeners=new Map();
function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',style:{},options:[],add(option){this.options.push(option)},replaceChildren(){this.options=[]},addEventListener(type,fn){listeners.set(key+':'+type,fn)},classList:{contains:()=>true}});return elements.get(key)}
const document={readyState:'loading',addEventListener(){},querySelector:element,body:{classList:{contains:()=>true}}};
const window={__ACTIVE_SPORT:'ufc',__SPORT_TOKEN:1,SPORT_LEGS:{mount(){}},SPORT_MEDIA:{load:async()=>{},ufc:()=>''},COMPACT_UI:{refresh(){}},PREDICTION_MODEL:{show(){}}};
const day=offset=>{const d=new Date(Date.now()+offset*86400000);return String(d.getUTCFullYear()).slice(-2)+d.toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()+String(d.getUTCDate()).padStart(2,'0')};
const a=day(3),b=day(10),market=(date,fight)=>({event_ticker:'KXUFCFIGHT-'+date+fight,kind:'moneyline',fight,label:fight,probability:.6,yes_bid:.57,yes_ask:.63,volume:150,fighter1:'A',fighter2:'B'});
const snapshot={updated_at:new Date().toISOString(),fighter_stats:{},markets:[market(a,'FIRST'),market(b,'SECOND')]};
const context={window,document,Option:class{constructor(label,value){this.label=label;this.value=value}},fetch:async()=>({ok:true,json:async()=>snapshot}),Date};
vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('ufc-dashboard.js','utf8'),context);
(async()=>{
 await window.UFC_DASHBOARD.load();
 const select=element('#ufcCardSelect'),note=element('#ufcCardNote');
 assert.equal(select.options.length,3);
 assert.equal(select.value,select.options[0].value);
 assert.match(note.textContent,/1 markets from the selected card/);
 window.UFC_DASHBOARD.selectCard(select.options[1].value);
 assert.equal(window.UFC_DASHBOARD.selectedCard(),select.options[1].value);
 assert.match(element('#results').innerHTML,/SECOND/);
 assert.doesNotMatch(element('#results').innerHTML,/FIRST/);
 window.UFC_DASHBOARD.selectCard('all');
 assert.match(element('#results').innerHTML,/FIRST/);
 assert.match(element('#results').innerHTML,/SECOND/);
 console.log('UFC card grouping passed');
})().catch(e=>{console.error(e);process.exitCode=1});
