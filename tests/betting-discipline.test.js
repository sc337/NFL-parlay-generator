const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('featured straights cannot bypass a poor price through likelihood or matchup modes',()=>{
 const window={},ctx={window,Date};for(const file of ['study-policy.js','pick-quality.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx);
 const m={ticker:'team',type:'h2h',kind:'moneyline',price:-285,probability:.74,quotedAt:new Date().toISOString(),game_time:new Date(Date.now()+86400000).toISOString()};
 window.PICK_QUALITY.prepare('ufc',[m],{},[],m.quotedAt);
 for(const selectionMode of ['ideas','likelihood']){const q=window.PICK_QUALITY.assess('ufc',m,{modelP:.74,marketP:.74,coverage:.8,experimental:true,selectionMode},{featured:true});assert.equal(q.pass,false);assert.match(q.reason,/Featured straight price/)}
});
test('the pinned study never applies later fitted calibration rules',()=>{
 const window={},ctx={window,Date};for(const file of ['study-policy.js','model-calibration.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx);
 window.MODEL_CALIBRATION_DATA={updated_at:new Date().toISOString(),sports:{nfl:{totals:{active:true,trainingCount:100,validationCount:100,distinctEvents:200,adjustedBrier:.1,marketBrier:.2,rawBrier:.2,alpha:.1,bias:.2}}}};
 assert.equal(window.MODEL_CALIBRATION.validated('nfl','totals'),false);assert.equal(window.MODEL_CALIBRATION.apply('nfl','totals',.6,.5),.6);
});
