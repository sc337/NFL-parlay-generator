(()=>{'use strict';
// A short, bounded transport cache. Consumers still validate original quote ages.
const allowed=new Set(['kalshi-nba.json','nba-context.json']),entries=new Map(),ttl=60000;
async function load(file,{force=false}={}){
 if(!allowed.has(file))throw Error('Unsupported snapshot');
 const prior=entries.get(file);
 if(prior?.pending)return JSON.parse(await prior.pending);
 if(!force&&prior&&Date.now()-prior.at<ttl)return JSON.parse(prior.text);
 const entry={at:0,text:null,pending:null};
 entry.pending=(async()=>{
  const response=await fetch('data/'+file+'?ts='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Snapshot HTTP '+response.status);
  const text=await response.text();
  entry.text=text;entry.at=Date.now();return text;
 })();entries.set(file,entry);
 try{return JSON.parse(await entry.pending)}
 catch(error){if(entries.get(file)===entry)entries.delete(file);throw error}
 finally{entry.pending=null}
}
window.SNAPSHOT_JSON={load};
})();
