(()=>{'use strict';
const now=()=>performance.now();
// Use task scheduling rather than nested timers, which browsers may clamp.
let channel;const pending=[];
function pause(){
 if(window.scheduler?.yield)return window.scheduler.yield();
 if(typeof MessageChannel!=='undefined'){
  if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>pending.shift()?.()}
  return new Promise(resolve=>{pending.push(resolve);channel.port2.postMessage(null)});
 }
 return new Promise(resolve=>setTimeout(resolve,0));
}
function deadline(){const error=Error('NBA calculation took too long. Refresh markets to retry.');error.name='TimeoutError';throw error}
function check(until){if(Date.now()>=until)deadline()}
function abort(){const error=Error('NBA calculation superseded');error.name='AbortError';throw error}
function batch(run,scope){const model=()=>window.NBA_MODEL?.withCache?window.NBA_MODEL.withCache(run,scope.model):run();return window.STARTER_STATUS?.withCache?window.STARTER_STATUS.withCache(model,scope.starter):model()}
async function drain(iterator,{current=()=>true,budget=6,until=Date.now()+30000}={}){
 const values=[],scope={model:new WeakMap(),starter:{}};let done=false,result;
 while(!done){if(!current())abort();check(until);const start=now();batch(()=>{do{const next=iterator.next();done=next.done;if(done)result=next.value;if(!done&&next.value!=null)values.push(next.value)}while(!done&&now()-start<budget)},scope);if(!done)await pause()}
 if(!current())abort();check(until);return {values,result};
}
async function collect(iterator,options){return (await drain(iterator,options)).values}
async function run(iterator,options){return (await drain(iterator,options)).result}
async function each(rows,run,options){function* steps(){for(const row of rows){run(row);yield null}}await collect(steps(),options)}
// Include all age/start boundaries used by the shared NBA evidence gates.
// Crossing one while yielding invalidates the prepared decisions before commit.
function boundary(values){let until=Infinity;const at=Date.now(),seen=new WeakSet(),offsets=[0,-90*60000,-300000,30*60000,90*60000,2*3600000,4*3600000,86400000,7*86400000,14*86400000];
 function visit(v){if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)){const stamp=Date.parse(v);for(const offset of offsets){const end=stamp+offset;if(end>at&&end<until)until=end}}else if(v&&typeof v==='object'&&!seen.has(v)){seen.add(v);for(const x of Object.values(v))visit(x)}}visit(values);return until}
window.NBA_COMPUTE={collect,run,each,boundary,check};
})();
