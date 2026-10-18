const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('every changed cleanup asset has the deployment cache version',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const asset of ['dashboard-smooth','visual-refresh','slate-ui','sport-markets','espn-evidence','kalshi-parlay-ideas','pick-of-day','dashboard-cleanup'])assert.ok(html.includes(asset+'.js?v=20261018-SIMPLE2'),asset+' needs its cache version');
 assert.ok(html.includes('dashboard-cleanup.css?v=20261018-SIMPLE2'));
});
