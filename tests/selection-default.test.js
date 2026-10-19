const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('saved alternative modes reset to screened while sport and filter preferences survive',()=>{
 const saved={sport:'nba',nba:{selectionMode:'likelihood',lines:'alt',legs:3},nfl:{tier:'ideas',mode:'sgp',markets:['passing']}};
 let serialized=JSON.stringify(saved);const window={};
 vm.runInNewContext(fs.readFileSync('dashboard-smooth.js','utf8'),{window,localStorage:{getItem:()=>serialized,setItem:(_,value)=>serialized=value},document:{addEventListener(){}}});
 const ui=window.DASHBOARD_UI;
 for(const sport of ['mlb','nba','ncaaf','nfl','nhl','ufc'])assert.equal(ui.get(sport,'selectionMode'),'screened');
 assert.equal(ui.get('nfl','tier'),'screened');assert.equal(ui.getSport(),'nba');assert.equal(ui.get('nba','lines'),'alt');assert.equal(ui.get('nba','legs'),3);assert.equal(ui.get('nfl','mode'),'sgp');
 ui.put('nba','selectionMode','ideas');assert.equal(ui.get('nba','selectionMode'),'ideas');
 const reopened={};vm.runInNewContext(fs.readFileSync('dashboard-smooth.js','utf8'),{window:reopened,localStorage:{getItem:()=>serialized},document:{addEventListener(){}}});
 assert.equal(reopened.DASHBOARD_UI.get('nba','selectionMode'),'screened');
});
