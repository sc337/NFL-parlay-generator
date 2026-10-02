const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js','utf8').split('window.generate=generate;')[0];
function runtime(){
  const ctx = vm.createContext({window:{},localStorage:{getItem:()=>null},console,Date,Set,Map});
  vm.runInContext(source,ctx);
  vm.runInContext(`state.games=[
    {id:'thu',commence_time:'2026-10-02T00:15:00Z'},
    {id:'sun',commence_time:'2026-10-04T17:00:00Z'},
    {id:'mon',commence_time:'2026-10-06T00:15:00Z'},
    {id:'next',commence_time:'2026-10-11T17:00:00Z'}
  ];`,ctx);
  return ctx;
}
test('NFL slate defaults to one Thursday–Wednesday range and supports explicit all-upcoming',()=>{
  const ctx=runtime();
  assert.equal(ctx.nflWeekKey('2026-10-06T00:15:00Z'),'2026-10-01');
  assert.equal(ctx.nflWeekKey('2026-10-08T17:00:00Z'),'2026-10-08');
  assert.equal(ctx.nflWeekKey(null),'');
  assert.equal(ctx.nflSlate().map(g=>g.id).join(','),'thu,sun,mon');
  vm.runInContext("state.nflWeek='2026-10-08'",ctx);
  assert.equal(ctx.nflSlate().map(g=>g.id).join(','),'next');
  vm.runInContext("state.nflWeek='all'",ctx);
  assert.equal(ctx.nflSlate().length,4);
  vm.runInContext("state.nflWeek='2026-09-24'",ctx);
  assert.equal(ctx.nflSlate().length,3,'expired selections recover to the first available range');
});
