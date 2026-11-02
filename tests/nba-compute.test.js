const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function scheduler(){let ticks=0;const window={};vm.runInNewContext(fs.readFileSync('nba-compute.js','utf8'),{window,Date,performance:{now:()=>ticks++},setTimeout});return window.NBA_COMPUTE}
test('long calculations yield to input tasks and preserve iteration results',async()=>{const s=scheduler();let beat=false;setTimeout(()=>beat=true,0);const seen=[];await s.each(Array.from({length:100},(_,i)=>i),i=>seen.push(i));assert.equal(beat,true);assert.equal(seen.length,100);assert.equal(seen[99],99)});
test('superseded work stops before completing and exposes no partial result',async()=>{const s=scheduler();let active=true,calls=0;setTimeout(()=>active=false,0);await assert.rejects(s.each(Array(100).fill(1),()=>calls++,{current:()=>active}),{name:'AbortError'});assert.ok(calls<100)});
test('deadline includes quote expiry, near-start and report expiry boundaries',()=>{const s=scheduler(),start=Date.now()+10000;assert.ok(s.boundary([{game_time:new Date(start).toISOString()}])<=start);assert.equal(s.boundary([{}]),Infinity)});
test('chunked independent optimizer returns exactly the synchronous selected legs',async()=>{const window={NBA_COMPUTE:scheduler(),__ACTIVE_SPORT:'nba'},env={window,Date};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),env);const G=window.MARKET_GUARDS,rows=Array.from({length:16},(_,i)=>({game_id:String(i%5),selection_id:String(i),kind:i%2?'points':'rebounds',player:'P'+i})),assess=m=>({pass:true,rank:100-Number(m.selection_id),coverage:.7});for(const n of [2,3]){const options={balanced:true,diversityBonus:3};assert.deepEqual(await G.bestBuildAsync(rows,n,assess,options),G.bestBuild(rows,n,assess,options))}});
test('indexed reconciliation preserves first matching group across provider identities',()=>{const window={};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),{window,Date});const G=window.MARKET_GUARDS;
 let seed=123;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
 for(let run=0;run<100;run++){const rows=Array.from({length:80},()=>{const g=random(8);return {game_id:random(3)?String(g):'',event_ticker:random(2)?'SRC-'+g:undefined,game_label:'Team '+g+' vs Team '+(g+1),game_time:new Date(1800000000000+g*3600000+random(4)*600000).toISOString(),game_number:random(2)||undefined}}),expected=structuredClone(rows),groups=[];
 for(const m of expected){const group=groups.find(g=>G.sameEvent(g,m));if(group)m.canonical_event_id=group.canonical_event_id;else{m.canonical_event_id=m.canonical_event_id||(G.gameKey(m)?'nba:'+G.gameKey(m):'');groups.push(m)}}
 G.reconcile('nba',rows);assert.deepEqual(rows,expected)}
});
test('message tasks finish batches even when browser timers never fire',async()=>{
 let clock=0,posts=0;const window={};class Channel{constructor(){this.port1={};this.port2={postMessage:()=>{posts++;setImmediate(()=>this.port1.onmessage())}}}}
 vm.runInNewContext(fs.readFileSync('nba-compute.js','utf8'),{window,Date,performance:{now:()=>clock++},MessageChannel:Channel,setTimeout(){throw Error('Timer-based yielding must not run')}});
 let count=0;await window.NBA_COMPUTE.each(Array(100).fill(0),()=>count++);assert.equal(count,100);assert.ok(posts>0);
});
test('native scheduler yielding takes precedence over throttled timers',async()=>{
 let clock=0,yields=0;const window={scheduler:{yield:async()=>{yields++}}};vm.runInNewContext(fs.readFileSync('nba-compute.js','utf8'),{window,Date,performance:{now:()=>clock++},setTimeout(){throw Error('No timer waits')}});await window.NBA_COMPUTE.each(Array(100).fill(0),()=>{});assert.ok(yields>0);
});
test('a stalled calculation times out instead of remaining indefinitely busy',async()=>{
 let clock=0;class Clock extends Date{static now(){return clock++}}const window={scheduler:{yield:async()=>{}}};vm.runInNewContext(fs.readFileSync('nba-compute.js','utf8'),{window,Date:Clock,performance:{now:()=>clock++},setTimeout});await assert.rejects(window.NBA_COMPUTE.each(Array(100).fill(0),()=>{},{until:5}),{name:'TimeoutError'});
});
