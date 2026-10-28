const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','pick-quality.js'),'utf8');
test('balanced screening uses a smaller unvalidated buffer without weakening validated baseline',()=>{
 assert.match(source,/modelStatus:\(validated \? \.015 : \.04\)/);
 assert.match(source,/limitedCoverage:\(1-coverage\)\*\.02/);
});
test('unvalidated longshot and disagreement safeguards remain present',()=>{
 assert.match(source,/\(!target&&q\.p<\.30\)\|\|p<\.45/);
 assert.match(source,/Math\.abs\(p-referenceP\)>\.18/);
});
test('provisional value is labeled and cannot claim verified value',()=>{
 assert.match(source,/const potentialValue=ev>0&&\!clearsValue&&\!validated&&\!anchored/);
 assert.match(source,/const valueQualified=.*validated.*clearsValue/);
 assert.match(source,/tier:likelihoodMode\?'likelihood':provisionalValue\?'potential':tier/);
 assert.match(source,/Potential value only; positive raw EV does not clear uncertainty buffer/);
});
test('freshness and sportsbook constraints remain enforced',()=>{
 assert.match(source,/const data=new Map\(\),TTL=30\*60000/);
 assert.match(source,/Quote older than 30 minutes/);
 assert.match(source,/Caesars straight only/);
});

test('positive raw EV below the buffer is labeled potential and stays out of qualified value',()=>{
 const window={},ctx=vm.createContext({window,Date,console,localStorage:{getItem(){return null},setItem(){}}});
 for(const file of ['model-calibration.js','pick-quality.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
 const now=Date.now(),market={ticker:'BALANCED-TEST',type:'totals',marketKey:'totals',point:44.5,side:'over',name:'Over 44.5',price:100,marketProbability:.5,source:'Kalshi',game_status:'pre',quotedAt:new Date(now).toISOString()},game={id:'balanced-game',commence_time:new Date(now+3600000).toISOString(),game_status:'pre',markets:[market]};
 window.PICK_QUALITY.prepare('nfl',[market],{},[game],new Date(now).toISOString());
 const result=window.PICK_QUALITY.assess('nfl',market,{modelP:.55,rawModelP:.55,coverage:.7,marketP:.5,uncertainty:.3});
 assert.equal(result.pass,false);assert.equal(result.pricePass,false);assert.equal(result.provisionalValue,true);assert.equal(result.valueQualified,false);assert.equal(result.tier,'potential');assert.match(result.warnings.join(' '),/positive raw EV does not clear uncertainty buffer/);
 const newly_qualifying=window.PICK_QUALITY.assess('nfl',market,{modelP:.56,rawModelP:.56,coverage:.7,marketP:.5,uncertainty:.3});
 assert.equal(newly_qualifying.pass,true);assert.equal(newly_qualifying.pricePass,true);assert.equal(newly_qualifying.valueQualified,false);
});
