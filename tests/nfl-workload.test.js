const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8'),ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function nflWorkloadCheck('),source.indexOf('function playerCount(')),ctx);
const market=(values,extra={})=>({player:'RB',marketKey:'player_rush_yds',point:9.5,propHistory:{source:'nflverse completed plays',games:values.length,opportunities:{player_rush_attempts:values},roleStable:true},...extra});
test('tiny ALT thresholds cannot bypass limited backup usage',()=>{
 for(const p of ['safe','balanced'])assert.equal(ctx.nflWorkloadCheck(market([1,2,1]),p).pass,false);
 assert.equal(ctx.nflWorkloadCheck(market([8,9,7]),'safe').pass,true);
});
test('missing, invalid and changing workload fail closed',()=>{
 for(const m of [market([]),market([8,null,8]),market([8,8,0]),market([8,8,8],{roleChange:{status:'rising'}})])assert.equal(ctx.nflWorkloadCheck(m,'balanced').pass,false);
});
test('Lotto needs participation and receiving and passing use their own volume floors',()=>{
 assert.equal(ctx.nflWorkloadCheck(market([0,0,0]),'long').pass,false);
 assert.equal(ctx.nflWorkloadCheck(market([2,2,2]),'long').pass,true);
 for(const [key,metric,values] of [['player_receptions','targets',[2,2,2]],['player_pass_yds','player_pass_attempts',[10,10,10]]]){
 const m=market(values);m.marketKey=key;m.propHistory.opportunities={[metric]:values};assert.equal(ctx.nflWorkloadCheck(m,'safe').pass,false);
 }
 assert.equal(ctx.nflWorkloadCheck({type:'h2h'},'safe').pass,true);
});
