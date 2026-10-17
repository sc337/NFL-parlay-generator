const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const nodes=new Map();let now=Date.now();const node=()=>({hidden:false,innerHTML:'',after(n){nodes.set('#publicSlate',n)}});nodes.set('#results',node());const document={readyState:'loading',addEventListener(){},querySelector:s=>nodes.get(s),createElement:node};const w={__ACTIVE_SPORT:'nhl'};class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}const ctx={window:w,document,Date:Clock,console};for(const f of ['market-guards.js','pick-quality.js','public-slate.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),ctx);return {w,nodes,now,advance:t=>now+=t}}
test('full slate includes schedule-only events and hides when switching sports',()=>{
 const {w,nodes,now}=setup(),start=new Date(now+86400000).toISOString();w.PUBLIC_SLATE.set('nhl',{slate:{updated_at:new Date(now).toISOString(),games:[{game_id:'g',game_time:start,game_label:'Away <script> at Home'}]}});
 const host=nodes.get('#publicSlate');assert.match(host.innerHTML,/Full NHL Slate/);assert.match(host.innerHTML,/Schedule only/);assert.match(host.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(host.innerHTML,/<script>/);
 w.__ACTIVE_SPORT='nfl';w.PUBLIC_SLATE.render();assert.equal(host.hidden,true);
 w.__ACTIVE_SPORT='nhl';w.SLATE_UI={matches:()=>false};w.PUBLIC_SLATE.render();assert.equal(host.hidden,true);
});
test('public references expire separately from native snapshot refreshes',()=>{
 const {w,nodes,now,advance}=setup(),at=new Date(now).toISOString(),start=new Date(now+86400000).toISOString();const m={game_id:'g',kind:'total',price:100,yes_ask:.5,source:'DraftKings via ESPN',referenceOnly:true,quotedAt:at};w.PICK_QUALITY.prepare('nhl',[m],{},[],at);w.PUBLIC_SLATE.set('nhl',{slate:{updated_at:at,games:[{game_id:'g',game_time:start,game_label:'A at B'}]}});
 assert.match(nodes.get('#publicSlate').innerHTML,/1 public reference selections/);advance(31*60000);w.PUBLIC_SLATE.render();assert.match(nodes.get('#publicSlate').innerHTML,/No current quoted markets/);
});
test('reference odds stay standard and never alter exchange ALT references',()=>{
 for(const sport of ['nba','nhl']){const w={};vm.runInNewContext(fs.readFileSync(sport+'-alt-lines.js','utf8'),{window:w,Date});const api=w[sport.toUpperCase()+'_ALT_LINES'];const native={kind:'total',game_id:'g',line:6.5,side:'yes',probability:.5,yes_bid:.49,yes_ask:.51};const ref={...native,line:5.5,price:100,referenceOnly:true};api.classify([native,ref]);assert.equal(ref.isAltLine,false);assert.equal(native.altReferenceLine,6.5);}
});
test('NHL public team references skip exchange liquidity checks but retain the quality gate',()=>{
 const w={__ACTIVE_SPORT:'nhl',PICK_QUALITY:{assess:()=>({pass:true})}},document={readyState:'loading',addEventListener(){},querySelector:()=>({})};const ctx={window:w,document,Date,console,localStorage:{getItem:()=>null}};for(const f of ['market-guards.js','nhl-dashboard.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),ctx);const m={kind:'moneyline',game_id:'g',game_status:'pre',game_time:new Date(Date.now()+86400000).toISOString(),yes_ask:.6,price:-150,referenceOnly:true};assert.equal(w.NHL_DASHBOARD.eligible(m),true);assert.equal(w.NHL_DASHBOARD.eligible({...m,referenceOnly:false}),false);w.PICK_QUALITY.assess=()=>({pass:false});assert.equal(w.NHL_DASHBOARD.eligible(m),false);
});
