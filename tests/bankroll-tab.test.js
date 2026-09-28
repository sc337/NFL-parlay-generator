const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

test('Bankroll is the landing tab and sport switching restores sport controls',()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.match(html,/<body data-sport="bankroll">/);
 const css=fs.readFileSync('bankroll-builder.css','utf8');
 assert.match(css,/body:not\(\[data-sport="bankroll"\]\) #bankrollBuilder\{display:none!important\}/);
 const nodes=new Map(),classes=new Map(),body={dataset:{},classList:{toggle(){},contains(){return false}}};
 const element=key=>{
  if(!nodes.has(key))nodes.set(key,{style:{},textContent:'',value:'3',dataset:{mode:'sgp'},classList:{toggle(name,on){classes.set(key+name,on)},contains(){return false}},addEventListener(){},remove(){}});
  return nodes.get(key);
 };
 let nav,generated=0,refreshed=0;
 const document={readyState:'complete',body,querySelector:key=>key==='#sportSwitch'?nav:key==='.topbar'?element('.topbar'):element(key),querySelectorAll:()=>nav?.buttons||[],createElement:()=>({buttons:[],set innerHTML(html){this.buttons=[...html.matchAll(/data-sport="([^"]+)"/g)].map(match=>({dataset:{sport:match[1]},classList:{toggle(name,on){classes.set(match[1]+name,on)}},setAttribute(){}}))},addEventListener(type,fn){this.click=fn}})};
 element('.topbar').insertAdjacentElement=(_where,node)=>{nav=node};
 const window={__ACTIVE_SPORT:'nfl',__SPORT_TOKEN:1,setInterval(){},BANKROLL_BUILDER:{refresh(){refreshed++}},COMPACT_UI:{refresh(){}},PREDICTION_MODEL:{activate(){}},PARLAY_GENERATOR:{syncLabel(){}},PICK_HISTORY_REPORT:{refresh(){}},NFL_SELECTIVITY:{refresh(){}},generate(){generated++}};
 vm.runInNewContext(fs.readFileSync('ufc-dashboard.js','utf8'),{window,document,console,Date});
 assert.equal(nav.buttons[0].dataset.sport,'bankroll');
 assert.deepEqual(nav.buttons.map(x=>x.dataset.sport),['bankroll','nfl','mlb','ncaaf','ufc']);
 assert.equal(window.__ACTIVE_SPORT,'bankroll');
 assert.equal(body.dataset.sport,'bankroll');
 assert.equal(generated,0);
 nav.click({target:{closest:()=>nav.buttons[1]}});
 assert.equal(window.__ACTIVE_SPORT,'nfl');
 assert.equal(body.dataset.sport,'nfl');
 assert.equal(generated,1);
 nav.click({target:{closest:()=>nav.buttons[0]}});
 assert.equal(window.__ACTIVE_SPORT,'bankroll');
 assert.equal(generated,1);
 assert.ok(refreshed>=2);
});
