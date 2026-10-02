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

test('NFL spread and bare total names produce matching odds tiles', () => {
  const source = fs.readFileSync(require.resolve('../visual-refresh.js'), 'utf8');
  const functions = source.slice(source.indexOf('function compactTitle'), source.indexOf('function compactSummaries'));
  const context = vm.createContext({});
  vm.runInContext(functions, context);
  for (const [label, market, line, subject] of [
    ['Over 37.5','Total','O 37.5','Game total'],
    ['Under 43.5','Total','U 43.5','Game total'],
    ['Dallas Cowboys +3.5','Spread','+3.5','Dallas Cowboys'],
    ['Minnesota Vikings -10.5','Spread','-10.5','Minnesota Vikings'],
  ]) {
    const result = context.selectionParts(context.compactTitle(label, 'nfl', ''));
    assert.equal(result.market, market);
    assert.equal(result.line, line);
    assert.equal(result.subject, subject);
  }
});
