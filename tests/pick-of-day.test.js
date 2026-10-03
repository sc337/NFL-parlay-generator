const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

function runtime(status='Fresh markets'){
 const host={children:[],textContent:'',replaceChildren(){this.children=[];this.textContent=''},append(...nodes){this.children.push(...nodes)}};
 const source={textContent:status};
 const createElement=()=>({children:[],textContent:'',innerHTML:'',setAttribute(){},append(...nodes){this.children.push(...nodes)}});
 const title={textContent:''},document={querySelector:s=>s==='#pickOfDayContent'?host:s==='#dataStatus'?source:s==='#pickOfDayTitle'?title:null,createElement};
 const window={__ACTIVE_SPORT:'nfl',MARKET_GUARDS:{quote:m=>m.yes_ask??null}};
 vm.runInNewContext(fs.readFileSync('pick-of-day.js','utf8'),{window,document,Date,Number,Math});
 return {window,host,title};
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
test('supported sport date filters show future featured picks with ALT tiles',()=>{
 const app=runtime(),future=new Date(Date.now()+2*86400000),key=future.getFullYear()+'-'+String(future.getMonth()+1).padStart(2,'0')+'-'+String(future.getDate()).padStart(2,'0');
 app.window.__ACTIVE_SPORT='nhl';const pick={market:{yes_ask:.7,isAltLine:true},eventTime:future,label:'Bruins +2.5 Puck line',event:'Bruins vs Jets'};
 app.window.PICK_OF_DAY.show('nhl',pick,{date:key});assert.equal(app.title.textContent,'Featured Pick');assert.equal(app.host.children.length,2);assert.equal(app.host.children[0].children[2].children[0].textContent,'ALT');
 app.window.PICK_OF_DAY.show('nhl',pick);assert.equal(app.title.textContent,'Pick of the Day');assert.match(app.host.children[0].textContent,/No pick today/);
 app.window.PICK_OF_DAY.show('nhl',null,{date:key});assert.match(app.host.children[0].textContent,/selected date/);
 for(const sport of ['mlb','ncaaf']){app.window.__ACTIVE_SPORT=sport;app.window.PICK_OF_DAY.show(sport,pick,{date:key});assert.equal(app.title.textContent,'Featured Pick');assert.equal(app.host.children[0].children[2].children[0].textContent,'ALT')}
 app.window.__ACTIVE_SPORT='nfl';app.window.PICK_OF_DAY.show('nfl',pick,{date:key});assert.match(app.host.children[0].textContent,/No pick today/);
});

test('stale NFL feed and future-day event do not create a pick',()=>{
 const stale=runtime('Kalshi delayed snapshot · updated 252m ago');
 stale.window.PICK_OF_DAY.show('nfl',{market:{price:-110},eventTime:new Date(Date.now()+60000),label:'Team ML'});
 assert.match(stale.host.children[0].textContent,/delayed/);
 const future=runtime();
 future.window.PICK_OF_DAY.show('nfl',{market:{price:-110},eventTime:new Date(Date.now()+172800000),label:'Team ML'});
 assert.match(future.host.children[0].textContent,/Pass/);
});

test('featured MLB and college team markets retain their actual line rather than a moneyline label',()=>{
 for(const [sport,label,heading,value] of [
  ['mlb','Atlanta Team Total Over 2.5','Team total','O 2.5'],
  ['mlb','Atlanta Team Total Under 3.5','Team total','U 3.5'],
  ['mlb','Dodgers -1.5 Run Line','Run line','-1.5'],
  ['mlb','Padres +1.5 Run Line','Run line','+1.5'],
  ['ncaaf','Over 55.5 points scored','Total','O 55.5'],
  ['ncaaf','Under 55.5 points scored','Total','U 55.5']
 ]){
  const app=runtime();app.window.__ACTIVE_SPORT=sport;
  app.window.PICK_OF_DAY.show(sport,{market:{yes_ask:.6},eventTime:new Date(Date.now()+60000),label,event:'Away vs Home'});
  const tile=app.host.children[0].children[2];
  assert.equal(tile.children[0].textContent,heading);assert.equal(tile.children[1].textContent,value);assert.equal(tile.children[2].textContent,'Kalshi 60¢');
 }
});
