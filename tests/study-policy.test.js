const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../study-policy');
const now=Date.parse('2026-10-22T12:00:00Z'),input=()=>({checks:[{dataPass:true,conservativeP:.6}],book:'Caesars',odds:100,quoteAt:new Date(now).toISOString(),confirmedLines:true,feesPerUnit:0,eventTimes:[new Date(now+3600000).toISOString()]});
test('exact book, lines and a price checked within five minutes are required',()=>{
 for(const patch of [{book:''},{odds:0},{confirmedLines:false},{quoteAt:new Date(now-6*60000).toISOString()},{quoteAt:new Date(now+1000).toISOString()}])assert.equal(S.decision({...input(),...patch},now).status,'price_required');
});
test('even a favorable entered price is paper-only, with fees and adverse probability included',()=>{
 const x=S.decision(input(),now);assert.equal(x.status,'paper_candidate');assert.equal(x.actionable,false);assert.equal(x.studyId,S.ID);
 assert.equal(S.decision({...input(),odds:-200},now).status,'pass');assert.equal(S.decision({...input(),feesPerUnit:.3},now).status,'pass');
 for(const patch of [{checks:[{dataPass:false,conservativeP:.9}]},{eventTimes:[new Date(now-1).toISOString()]}])assert.equal(S.decision({...input(),...patch},now).status,'pass');
});
test('an SGP cannot be promoted from assumed correlation or attractive individual legs',()=>{
 const x=S.decision({...input(),sgp:true,odds:1000},now);assert.equal(x.status,'research');assert.equal(x.actionable,false);assert.equal(x.netEV,undefined);
});
