const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('college total descriptions produce an odds tile with the matchup as subject', () => {
  const source = fs.readFileSync(require.resolve('../visual-refresh.js'), 'utf8');
  const functions = source.slice(source.indexOf('function compactTitle'), source.indexOf('function compactSummaries'));
  const context = vm.createContext({});
  vm.runInContext(functions, context);
  for (const side of ['Over', 'Under']) {
    const result = context.selectionParts(context.compactTitle(`${side} 55.5 points scored`, 'ncaaf', ''), 'Florida at Missouri · Market 54%');
    assert.equal(result.subject, 'Florida @ Missouri');
    assert.equal(result.market, 'Total');
    assert.equal(result.line, `${side[0]} 55.5`);
  }
});

test('compact UFC rows use the selected fighter’s actual opponent in either matchup order', () => {
  const source = fs.readFileSync(require.resolve('../visual-refresh.js'), 'utf8');
  const functions = source.slice(source.indexOf('function compactTitle'), source.indexOf('function compactSummaries'));
  const context = vm.createContext({});
  vm.runInContext(functions, context);
  const sub = 'Opponent A vs Fighter B · Winner · Kalshi 35% · Model 39%';
  assert.equal(context.compactBrief('ufc', sub, 'Opponent A'), 'vs Opponent A · Mkt 35% · Model 39%');
  assert.equal(context.compactBrief('ufc', sub, 'Fighter B'), 'vs Fighter B · Mkt 35% · Model 39%');
  assert.match(context.compactBrief('ufc', sub), /^Opponent A vs Fighter B/);
});
