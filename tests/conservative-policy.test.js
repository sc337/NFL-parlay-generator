const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=require('../conservative-policy.js');
const q=(p=.80,price=.76)=>({pass:true,conservativeP:p,quote:{p:price},coverage:.8});
test('Conservative requires 75% buffered likelihood and price discipline without reviving failed checks',()=>{
 const m={};for(const quality of [{...q(),pass:false},q(.749,.70),q(.80,.81),q(.9,.86),{...q(),conservativeP:null},{...q(),quote:{}}])assert.equal(policy.assess('nfl',m,quality).pass,false);
 assert.equal(policy.assess('nfl',m,q(.75,.74)).pass,true);
});
test('quoted milestones win close comparisons but stronger probability still leads',()=>{
 const m={player:'Player',marketKey:'player_rush_yds',quoteSide:'yes',point:49.5};assert.equal(policy.milestone('nfl',m),true);
 assert.ok(policy.assess('nfl',m,q()).rank>policy.assess('nfl',{},q()).rank);
 assert.ok(policy.assess('nfl',{},q(.84,.80)).rank>policy.assess('nfl',m,q()).rank);
 assert.equal(policy.milestone('nfl',{...m,quoteSide:'no'}),false);
 assert.equal(policy.milestone('nba',{player:'Player',kind:'rebounds',side:'yes',line:5.5}),true);
});
test('NFL candidate ranking applies Conservative policy only to safe and cannot bypass failed quality',()=>{
 const source=fs.readFileSync('app.js','utf8'),window={CONSERVATIVE_POLICY:policy,PICK_QUALITY:{assess:()=>q(.7,.65)}};
 const ctx=vm.createContext({window,state:{},nflQualityForecast:()=>({})});vm.runInContext(source.slice(source.indexOf('function profileSelectionScore('),source.indexOf('function playerCount(')),ctx);
 assert.equal(ctx.candidateScore({},50,'safe'),-999);assert.ok(ctx.candidateScore({},50,'balanced')>-900);
 window.PICK_QUALITY.assess=()=>q();assert.ok(ctx.candidateScore({},50,'safe')>-900);
 window.PICK_QUALITY.assess=()=>({...q(),pass:false});assert.equal(ctx.candidateScore({},50,'safe'),-999);
});
