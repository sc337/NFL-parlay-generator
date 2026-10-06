const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(raw,hosted){
 const calls=[],respond=data=>({ok:true,clone:()=>({json:async()=>data})});
 const window={fetch:async url=>{calls.push(String(url));const value=String(url).includes('raw.githubusercontent')?raw:hosted;if(value instanceof Error)throw value;return respond(value)}};
 vm.runInNewContext(fs.readFileSync('snapshot-transport.js','utf8'),{window,document:{baseURI:'https://test.site/'},location:{origin:'https://test.site'},URL,Date,AbortController,setTimeout,clearTimeout});
 return {window,calls};
}
const snapshot=minutes=>({updated_at:new Date(Date.now()-minutes*60000).toISOString(),markets:[]});
test('stale raw NHL copy yields to newer hosted quotes without relabelling their timestamps',async()=>{
 const raw=snapshot(90),hosted=snapshot(2),app=runtime(raw,hosted);
 const res=await app.window.fetch('data/kalshi-nhl.json?ts=1',{cache:'no-store'});
 assert.deepEqual(await res.clone().json(),hosted);assert.equal(app.calls.length,2);
});
test('newer raw quotes survive an older or unavailable hosted copy',async()=>{
 for(const hosted of [snapshot(120),Error('unavailable')]){
  const raw=snapshot(40),app=runtime(raw,hosted),res=await app.window.fetch('data/kalshi-nhl.json');
  assert.deepEqual(await res.clone().json(),raw);
 }
});
test('fresh raw quotes avoid a duplicate hosted request; network failures fall back',async()=>{
 const fresh=snapshot(1),app=runtime(fresh,snapshot(2));await app.window.fetch('data/kalshi-nhl.json');assert.equal(app.calls.length,1);
 const broken=runtime(Error('offline'),fresh),res=await broken.window.fetch('data/kalshi-nhl.json');assert.deepEqual(await res.clone().json(),fresh);
});
