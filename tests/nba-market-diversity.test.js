const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const guards=fs.readFileSync(path.join(__dirname,'..','market-guards.js'),'utf8');
const nba=fs.readFileSync(path.join(__dirname,'..','nba-dashboard.js'),'utf8');
test('multi-game optimization prefers distinct NBA market families without hard-excluding same-family tickets',()=>{
 assert.match(guards,/diversityBonus=0/);
 assert.match(guards,/diversityBonus\*new Set\(legs\.map\(x=>x\.kind\|\|x\.type\)\)\.size/);
 assert.match(nba,/diversityBonus:8/);
 assert.match(nba,/G\.bestBuild\(candidates,count,shaped,options\)/);
});
test('NBA filters explain available and qualifying market families',()=>{
 assert.match(nba,/const marketCounts=markets\.reduce/);
 assert.match(nba,/const eligibleCounts=pool\.reduce/);
 assert.match(nba,/Eligible \/ quoted by type:/);
});
test('NBA retains its existing model and parlay eligibility checks',()=>{
 assert.match(nba,/Q\.assess\('nba',m,f,\{featured,parlay:!featured\}\)\.pass/);
 assert.match(nba,/G\.independent\(build\)/);
});
