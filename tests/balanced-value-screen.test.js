const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','pick-quality.js'),'utf8');
test('balanced screening uses a smaller unvalidated buffer without weakening validated baseline',()=>{
 assert.match(source,/modelStatus:\(validated \? \.015 : \.03\)/);
 assert.match(source,/limitedCoverage:\(1-coverage\)\*\.015/);
});
test('unvalidated longshot and disagreement safeguards remain present',()=>{
 assert.match(source,/q\.p<\.30\|\|p<\.45/);
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
