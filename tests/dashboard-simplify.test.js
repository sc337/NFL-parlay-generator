const test=require('node:test'),assert=require('node:assert/strict');
const {emptySummary}=require('../dashboard-cleanup.js');
test('compact empty states report distinct games, preserving zero and singular counts',()=>{
 assert.equal(emptySummary('No complete NCAAF 4-leg parlay. 6 qualifying selections from 2 games; 4 separate games are required.',4),'No qualifying 4-leg parlay. 2 games qualify.');
 assert.equal(emptySummary('Only 1 of 3 games qualify · Try fewer legs.',3),'No qualifying 3-leg parlay. 1 game qualifies.');
 assert.equal(emptySummary('No qualifying 2-leg parlay. 0 games qualify. 24 selections checked',2),'No qualifying 2-leg parlay. 0 games qualify.');
 assert.equal(emptySummary('Only 2 qualified UFC fights are available for a 4-leg build.',4),'No qualifying 4-leg parlay. 2 games qualify.');
});
test('unknown counts are never inferred from selection counts',()=>{
 assert.equal(emptySummary('No qualifying MLB build. 30 selections checked.',2),'No qualifying 2-leg parlay.');
});
