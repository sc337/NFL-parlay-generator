const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){const checked=[],window={NFL_ALT_LINES:{selected:(m,markets)=>markets.has(m.type),matches:m=>m.point%10===9.5&&m.side==='over'},PICK_QUALITY:{assess:(sport,m)=>{checked.push(m.name);return m.q}}},ctx=vm.createContext({window});vm.runInContext(fs.readFileSync('nfl-parlay-ui.js','utf8'),ctx);return {api:window.NFL_PARLAY_UI,checked};}
const row=(player,point,q,extra={})=>({player,type:'receiving',side:'over',point,name:player+' '+(point+.5)+'+',q,...extra});
test('coverage screens every supported threshold and counts distinct qualified players',()=>{
 const r=runtime(),g={markets:[row('A',9.5,{pass:true}),row('A',19.5,{pass:false,reason:'Edge does not clear uncertainty buffer',dataPass:true}),row('A',29.5,{pass:false,reason:'Unvalidated longshot'}),row('B',9.5,{pass:false,reason:'Independent projection too thin'}),row('B',14.5,{pass:true})]};
 const report=r.api.propReport(g,{selectedMarkets:new Set(['receiving']),lineMode:'alt'},()=>({}));
 assert.equal(report.loadedQuotes,5);assert.equal(report.selectedQuotes,4);assert.equal(report.qualifiedPlayers,1);assert.equal(report.players.length,2);assert.equal(r.checked.length,4);assert.equal(report.players[1].category,'History');
});
test('coverage separates recent returns and measured workload changes from missing history',()=>{
 const r=runtime(),g={markets:[row('Returning QB',9.5,{pass:false,reason:'Recent return; insufficient completed-game sample'}, {propHistoryStatus:{teamGames:5,activeGames:2}}),row('RB',19.5,{pass:false,reason:'Increased role needs a supported projection and robust opportunity scenarios'})]};
 const report=r.api.propReport(g,{selectedMarkets:new Set(['receiving']),lineMode:'alt'},m=>m.player==='RB'?{roleChange:{baseline:3.3,recent:5}}:{});
 assert.match(report.players.find(x=>x.player==='Returning QB').reason,/2 active games.*5 team games/);
 assert.match(report.players.find(x=>x.player==='RB').reason,/targets rose from 3.3 to 5.0/);assert.equal(report.qualifiedPlayers,0);
});
