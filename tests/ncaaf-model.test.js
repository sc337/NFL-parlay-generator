const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

const window={};vm.runInNewContext(fs.readFileSync('ncaaf-model.js','utf8'),{window,Date});
const kickoff=new Date(Date.now()+86400000).toISOString();
const form=(points_for,points_against,yards_for,yards_against)=>({available:true,games:4,box_games:4,points_for,points_against,
  margin:points_for-points_against,yards_for,yards_against});
const context={updated_at:new Date().toISOString(),league_points_per_team:26,games:{'99':{
  kickoff,home:{aliases:['Alabama Crimson Tide','Alabama'],form:form(34,18,430,290)},
  away:{aliases:['Mississippi State Bulldogs','Mississippi State'],form:form(21,28,300,360)},neutral_site:false,
  weather:{indoor:false,wind_mph:18,precip_probability:10},sources:['ESPN','SportsDataverse','NWS']}}};
const market=(kind,title)=>({kind,title,game_id:'99',game_status:'pre',probability:.68});

test('independent college estimates use completed-game form, not market probability',()=>{
  const a=window.NCAAF_MODEL.estimate(market('moneyline','Alabama wins'),context);
  assert.ok(a.experimental);
  assert.ok(a.coverage>=.6);
  assert.ok(Math.abs(a.modelP-.68)>.01);
  assert.equal(a.betEV,null);
  const b=window.NCAAF_MODEL.estimate({...market('moneyline','Alabama wins'),probability:.30},context);
  assert.equal(a.modelP,b.modelP);
});

test('spread and total estimates respect side and wind without calling it value',()=>{
  const win=window.NCAAF_MODEL.estimate(market('spread','Alabama wins by over 7.5 points'),context);
  const over=window.NCAAF_MODEL.estimate(market('total','Over 54.5 points scored'),context);
  const under=window.NCAAF_MODEL.estimate(market('total','Under 54.5 points scored'),context);
  assert.ok(win.modelP>0&&win.modelP<1);
  assert.ok(Math.abs(over.modelP+under.modelP-1)<1e-10);
  assert.equal(over.betEV,null);
});

test('missing, thin, stale, post-kickoff, and unresolved markets have no model',()=>{
  const m=market('moneyline','Alabama wins');
  assert.equal(window.NCAAF_MODEL.estimate({...m,title:'Unknown wins'},context),null);
  assert.equal(window.NCAAF_MODEL.estimate(m,{...context,updated_at:new Date(Date.now()-13*3600000).toISOString()}),null);
  assert.equal(window.NCAAF_MODEL.estimate(m,{...context,games:{'99':{...context.games['99'],kickoff:new Date(Date.now()-1000).toISOString()}}}),null);
  const thin={...context,games:{'99':{...context.games['99'],home:{...context.games['99'].home,
    form:{...context.games['99'].home.form,box_games:0}}}}};
  assert.equal(window.NCAAF_MODEL.estimate(m,thin),null);
  assert.equal(window.NCAAF_MODEL.estimate({...m,game_status:'in'},context),null);
});
