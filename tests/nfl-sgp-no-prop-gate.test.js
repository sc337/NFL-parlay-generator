const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('NFL SGP does not require FanDuel props merely because an API key exists', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(source, /state\.apiKey\s*&&\s*!String\(game\?\.id/);
  assert.match(source, /if\(state\.requirePlayerProp && propCount===0\)/);
  assert.match(source, /sgpResult=buildSgpProfiles\(game,count,state\.risk,variants/);
});

test('SGP and multi-game use distinct builders', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(source, /function buildSgp\(/);
  assert.match(source, /function buildMulti\(/);
});

test('empty SGP reports counts and filter rejection reasons', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  for(const phrase of ['SGP diagnostics:', 'quoted markets', 'player props', 'parlay-eligible', 'selected by filters', 'qualifying legs']){
    assert.ok(source.includes(phrase), 'Missing diagnostic: '+phrase);
  }
});
