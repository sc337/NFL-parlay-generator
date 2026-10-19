const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('nfl-parlay-ui.js','utf8'),{window});
const message=window.NFL_PARLAY_UI.emptyMessage;
test('compact NFL empty states give one cause and one applicable adjustment',()=>{
 const state={recommendationTier:'likelihood',lineMode:'standard'};
 assert.match(message({checked:36,eligible:[{market:{type:'h2h'}}]},2,state),/Only 1 selection passed\. Try Standard \+ ALT in Filters/);
 assert.match(message({checked:36,eligible:[{market:{type:'h2h'}}]},4,state),/Try fewer legs/);
 assert.match(message({checked:0},2,state),/Try Next slate/);
 assert.match(message({checked:12,eligible:[],reasons:[['Playing time uncertain',12]]},2,state),/Playing time uncertain\. Review the exclusions or choose another game/);
 assert.match(message({checked:12,eligible:[],reasons:[['Edge does not clear uncertainty buffer',12]]},2,{...state,recommendationTier:'screened'}),/No qualifying picks for a 2-leg parlay.*Try Standard \+ ALT/);
 assert.match(message({checked:12,eligible:[{market:{type:'h2h'}}]},2,{...state,requirePlayerProp:true}),/No player prop passed/);
 assert.equal(message(null,2,state),'');
});
