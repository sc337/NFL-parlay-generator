const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function nfl(mode='multi'){
 const source=fs.readFileSync('app.js','utf8'),nodes=new Map(),window={__ACTIVE_SPORT:'nfl',__SPORT_TOKEN:1};
 const game={id:'1',markets:[{player:'Player'}]};let output=[],previous=[];
 const builds={safe:{score:75,legs:[1,2,3,4]},balanced:{score:90,legs:[5,6,7,8]},long:{score:80,legs:[9,10,11,12]}};
 const context=vm.createContext({window,state:{games:[game],mode,risk:50,apiKey:''},$:s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#legsSelect'?'4':'1',textContent:'',innerHTML:''});return nodes.get(s)},
  nflSlate:()=>[game],ensurePropsForGame:async()=>{},ensurePropsForMultiGame:async()=>{},countPlayerProps:()=>1,
  buildMulti:(_n,_r,v)=>builds[v],buildSgp:(_g,_n,_r,v,prev)=>{previous.push(prev);return builds[v]},
  render:p=>output.push(p),parlaySignature:p=>p.legs.join('|')});
 vm.runInContext(source.slice(source.indexOf('async function generate(){'),source.indexOf('window.generate=generate;')),context);
 return {run:()=>context.generate(),builds,output,previous};
}
test('NFL Generate selects one highest-ranked requested-length build and repeats it',async()=>{
 for(const mode of ['multi','sgp']){
  const app=nfl(mode);await app.run();await app.run();
  assert.equal(app.output[0].length,1);assert.equal(app.output[0][0],app.builds.balanced);assert.equal(app.output[1][0],app.output[0][0]);
  assert.ok(app.previous.every(p=>p.length===0),'Risk profiles must not penalize overlap with other profiles');
 }
});
test('NFL prefers a complete selected-leg build over a higher-scoring shorter fallback',async()=>{
 const app=nfl();app.builds.balanced.legs=[1,2];app.builds.balanced.score=99;
 await app.run();assert.equal(app.output[0][0],app.builds.long);
});
