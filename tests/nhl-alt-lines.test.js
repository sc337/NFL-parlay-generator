const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(){const window={};vm.runInNewContext(fs.readFileSync('nhl-alt-lines.js','utf8'),{window});return window.NHL_ALT_LINES}
const market=(kind,line,p,patch={})=>({game_id:'1',kind,line,yes_bid:p-.01,yes_ask:p+.01,volume:100,selection_id:kind+line,...patch});
test('NHL alternate puck lines use the conventional +/-1.5 reference',()=>{
 const a=api(),rows=[market('spread',1.5,.8),market('spread',2.5,.5),market('moneyline',null,.6)];a.classify(rows);
 assert.equal(rows[0].isAltLine,false);assert.equal(rows[1].isAltLine,true);assert.equal(rows[2].isAltLine,false);
 assert.equal(a.matches(rows[1],'alt'),true);assert.equal(a.matches(rows[1],'standard'),false);assert.equal(a.matches(rows[0],'both'),true);assert.equal(a.matches(rows[2],'alt'),false);
});
test('NHL totals and props reference the closest-to-50% quoted threshold per game and player',()=>{
 const a=api(),rows=[market('total',5.5,.51),market('total',6.5,.7),market('total',5.5,.49,{side:'no'}),market('total',6.5,.49,{game_id:'2'}),market('points',.5,.5,{player_id:'A'}),market('points',1.5,.2,{player_id:'A'}),market('points',1.5,.5,{player_id:'B'})];a.classify(rows);
 assert.deepEqual(rows.map(m=>m.isAltLine),[false,true,false,false,false,true,false]);assert.ok(rows.every(m=>m.altReference));
 const labels=rows.map(m=>m.isAltLine);a.classify([...rows].reverse());assert.deepEqual(rows.map(m=>m.isAltLine),labels);
});
test('invalid quotes cannot determine the reference and classifications do not rely on model output',()=>{
 const a=api(),rows=[market('total',5.5,.6,{modelP:.2}),market('total',6.5,.5,{yes_bid:null}),market('total',7.5,.5,{yes_ask:NaN})];a.classify(rows);
 assert.deepEqual(rows.map(m=>m.isAltLine),[false,true,true]);rows[0].modelP=.99;a.classify(rows);assert.equal(rows[0].isAltLine,false);
});
