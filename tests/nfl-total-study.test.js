const assert=require('node:assert/strict');
const {study,weekKey,eligible}=require('../scripts/nfl_total_study');
const kickoff='2026-11-02T01:20:00Z'; // Sunday evening in Los Angeles
const variants={market:48.5,formOnly:49.5,weatherOnly:49,halfForm:49.25,current:50};
const row=(direction='over',alt=false)=>({sport:'nfl',marketGroup:'totals',studyId:'nfl-total-shadow-20261027-v1',
  contractId:'nfl|'+(alt?'ALT':'MAIN')+'|'+direction,eventId:'g',eventTime:kickoff,
  recordedAt:'2026-11-02T00:50:00Z',snapshotAt:'2026-11-02T00:48:00Z',quoteAt:'2026-11-02T00:47:00Z',
  featureAsOf:'2026-11-02T00:46:00Z',direction,isAltLine:alt,point:alt?45.5:48.5,marketP:direction==='over'?.51:.49,
  actualTotal:54,studyVariants:Object.fromEntries(Object.entries(variants).map(([name,line])=>[name,{line,
    probability:direction==='over'?.6:.4}]))});
assert.equal(weekKey('2026-10-30T00:15:00Z'),weekKey(kickoff),'Thursday and Sunday share one NFL week');
const over=row(),under=row('under'),alt=row('over',true);
over.checkpoint='60m';
assert(eligible(over));
assert(!eligible({...over,featureAsOf:'2026-11-02T01:21:00Z'}),'postgame inputs cannot be scored');
const report=study([over,under,alt,{...over,recordedAt:'2026-11-01T20:00:00Z',studyVariants:{...over.studyVariants,current:{line:70,probability:.9}}}]);
assert.equal(report.games,1,'one latest main Over threshold per game');
assert.equal(report.checkpointCoverage['60m'],1);
assert.equal(report.lines.current.mae,4);
assert.equal(report.lines.halfForm.mae,4.75);
assert.equal(report.probabilities['standard|over'].contracts,1,'checkpoints cannot duplicate a contract');
assert.equal(report.probabilities['standard|under'].contracts,1);
assert.equal(report.probabilities['alt|over'].contracts,1);
assert.equal(report.candidates.halfForm.status,'collect_more_unseen_weeks');
assert.equal(study([{...over,featureAsOf:'2026-11-02T01:21:00Z'}]).games,0);
assert.equal(study([{...over,actualTotal:null}]).checkpointCoverage['60m'],1,'pending games still show capture health');
