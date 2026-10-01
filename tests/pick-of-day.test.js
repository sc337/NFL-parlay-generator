const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function runtime(status='Fresh markets'){
 const host={children:[],textContent:'',replaceChildren(){this.children=[];this.textContent=''},append(...nodes){this.children.push(...nodes)}};
 const source={textContent:status};
 const createElement=()=>({children:[],textContent:'',innerHTML:'',setAttribute(){},append(...nodes){this.children.push(...nodes)}});
 const document={querySelector:s=>s==='#pickOfDayContent'?host:s==='#dataStatus'?source:null,createElement};
 const window={__ACTIVE_SPORT:'nfl',MARKET_GUARDS:{quote:m=>m.yes_ask??null}};
 vm.runInNewContext(fs.readFileSync('pick-of-day.js','utf8'),{window,document,Date,Number,Math});
 return {window,host};
}

test('Pick of the Day shows one pregame straight and never a stake',()=>{
 const {window,host}=runtime();
 const time=new Date(Date.now()+60000).toISOString();
 window.PICK_OF_DAY.show('nfl',{market:{price:-110},eventTime:time,label:'Team ML',event:'Team A @ Team B'});
 assert.equal(host.children.length,2);
 assert.equal(host.children[0].children[1].children[0].textContent,'Team');
 assert.equal(host.children[0].children[2].children[1].textContent,'ML');
 assert.equal(host.children[0].children[2].children[2].textContent,'-110');
 assert.doesNotMatch(JSON.stringify(host.children),/stake|bankroll/i);
 window.PICK_OF_DAY.show('nfl');
 assert.match(host.children[0].textContent,/Pass/);
});

test('stale NFL feed and future-day event do not create a pick',()=>{
 const stale=runtime('Kalshi delayed snapshot · updated 252m ago');
 stale.window.PICK_OF_DAY.show('nfl',{market:{price:-110},eventTime:new Date(Date.now()+60000),label:'Team ML'});
 assert.match(stale.host.children[0].textContent,/delayed/);
 const future=runtime();
 future.window.PICK_OF_DAY.show('nfl',{market:{price:-110},eventTime:new Date(Date.now()+172800000),label:'Team ML'});
 assert.match(future.host.children[0].textContent,/Pass/);
});
