const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function cacheRuntime(){
 let now=100000,calls=0,release,broken=false;
 class Clock extends Date {static now(){return now}}
 const window={},fetch=()=>{calls++;return new Promise((resolve,reject)=>{release=()=>broken?reject(Error('offline')):resolve({ok:true,text:async()=>JSON.stringify({updated_at:'original',markets:[{line:20}]})})})};
 vm.runInNewContext(fs.readFileSync('snapshot-json.js','utf8'),{window,fetch,Date:Clock,AbortSignal});
 return {load:window.SNAPSHOT_JSON.load,get calls(){return calls},release:()=>release(),advance:()=>now+=60001,fail:()=>broken=true};
}
test('NBA requests share downloads, preserve timestamps and isolate mutable callers',async()=>{
 const r=cacheRuntime(),a=r.load('kalshi-nba.json'),b=r.load('kalshi-nba.json');assert.equal(r.calls,1);r.release();const [x,y]=await Promise.all([a,b]);x.markets[0].line=99;assert.equal(y.markets[0].line,20);assert.equal(y.updated_at,'original');assert.equal((await r.load('kalshi-nba.json')).markets[0].line,20);assert.equal(r.calls,1);
 r.advance();const next=r.load('kalshi-nba.json');assert.equal(r.calls,2);r.release();await next;
 const forced=r.load('kalshi-nba.json',{force:true});assert.equal(r.calls,3);r.release();await forced;
});
test('failed downloads are retryable and unsupported files cannot expand cache',async()=>{
 const r=cacheRuntime();r.fail();let p=r.load('nba-context.json');r.release();await assert.rejects(p,/offline/);p=r.load('nba-context.json');assert.equal(r.calls,2);r.release();await assert.rejects(p,/offline/);await assert.rejects(r.load('forecast-audit.json'),/Unsupported/);
});
test('NBA filter bursts yield for feedback, coalesce and discard work after sport changes',async()=>{
 const source=fs.readFileSync('nba-dashboard.js','utf8'),frames=[],window={__SPORT_TOKEN:1,__ACTIVE_SPORT:'nba',DASHBOARD_UI:{begin(){return {}},end(){}}};let renders=0;
 vm.runInNewContext('let renderRevision=0;'+source.slice(source.indexOf('let pendingRender=null;'),source.indexOf('function setLegs'))+';window.requestRender=requestRender;', {window,requestAnimationFrame:fn=>frames.push(fn),render:()=>renders++});
 const a=window.requestRender(),b=window.requestRender();assert.equal(a,b);assert.equal(renders,0);frames.shift()();frames.shift()();await a;assert.equal(renders,1);
 const c=window.requestRender();window.__ACTIVE_SPORT='nfl';window.__SPORT_TOKEN=2;frames.shift()();frames.shift()();await c;assert.equal(renders,1);
});
test('profile enhancement preserves existing profile buttons and their listeners',()=>{
 const source=fs.readFileSync('terminal-qol.js','utf8');let replacements=0;
 const hint={hidden:false,dataset:{},querySelector:s=>s==='.carousel-dots'?dots:null,set innerHTML(v){replacements++}};
 const dots={children:[]},cards=[0,1].map(()=>({classList:{contains:()=>true,remove(){}},querySelector:()=>null}));dots.children=cards.map(()=>({}));
 const grid={children:cards,classList:{toggle(){}},setAttribute(){},dataset:{positionListening:'1'}};
 const $=s=>s==='#results'?grid:s==='#parlaySwipeHint'?hint:null,window={__ACTIVE_SPORT:'nba'};
 vm.runInNewContext(source.slice(source.indexOf('function variants(){'),source.indexOf('function persist(){'))+';variants();variants();',{$,window,document:{createElement(){throw Error('Must retain buttons')}},requestAnimationFrame(){}});
 assert.equal(replacements,0);
});

test('NBA sorting assesses each market/profile once per render, then rechecks on the next render',()=>{
 const source=fs.readFileSync('nba-dashboard.js','utf8');let calls=0,blocked=false;const window={};
 const env={window,Map,Number,Q:{assess(){calls++;return {pass:!blocked,conservativeP:.8}}},model:()=>({modelP:.8})};
 vm.runInNewContext(source.slice(source.indexOf('let assessmentCache=null;'),source.indexOf('function unavailableBuild'))+';window.assess=assessProfile;window.start=()=>assessmentCache=new Map();window.end=()=>assessmentCache=null;',env);
 const m={},profile={key:'safe'};window.start();window.assess(m,profile);window.assess(m,profile);assert.equal(calls,1);window.assess(m,{key:'balanced'});assert.equal(calls,2);window.end();blocked=true;window.start();assert.equal(window.assess(m,profile).pass,false);assert.equal(calls,3);window.end();window.assess(m,profile);assert.equal(calls,4);
});
