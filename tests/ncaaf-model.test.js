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

function residualContext(n=100,error=-20){
  return {...context,margin_errors:{version:'ncaaf-margin-v1',generated_at:context.updated_at,rows:Array.from({length:n},(_,i)=>({event_id:String(i),kickoff:'2026-09-01T00:00:00Z',available_at:'2026-09-01T08:00:00Z',error}))}};
}
test('spread probabilities learn signed home errors, preserve opposing-side symmetry and fall back with too few games',()=>{
  const m={...market('spread',''),referenceOnly:true,team_id:'h',point:-7.5};
  const ctx=residualContext();ctx.games={'99':{...context.games['99'],home:{...context.games['99'].home,id:'h'},away:{...context.games['99'].away,id:'a'}}};
  const fallback=window.NCAAF_MODEL.estimate(m,contextWithIds());
  const learned=window.NCAAF_MODEL.estimate(m,ctx);
  assert.equal(learned.errorSample,100);assert.match(learned.probabilityMethod,/Historical/);assert.ok(learned.modelP<fallback.modelP);
  const other=window.NCAAF_MODEL.estimate({...m,team_id:'a',point:7.5},ctx);
  assert.ok(Math.abs(learned.modelP+other.modelP-1)<1e-10);
  const thin=window.NCAAF_MODEL.estimate(m,{...ctx,margin_errors:{...ctx.margin_errors,rows:ctx.margin_errors.rows.slice(0,79)}});
  assert.equal(thin.modelP,fallback.modelP);assert.match(thin.probabilityMethod,/insufficient/);
  const integer=window.NCAAF_MODEL.estimate({...m,point:7},ctx),opposite=window.NCAAF_MODEL.estimate({...m,point:-7,team_id:'a'},ctx);
  assert.ok(integer.pushProbability>0);assert.ok(Math.abs(integer.modelP+opposite.modelP-1)<1e-10);assert.ok(Math.abs(integer.pushProbability-opposite.pushProbability)<1e-10);
});
function contextWithIds(){return {...context,games:{'99':{...context.games['99'],home:{...context.games['99'].home,id:'h'},away:{...context.games['99'].away,id:'a'}}}};}
test('future errors, duplicate games and mismatched projection versions never inflate the error sample',()=>{
  const ctx=residualContext(),m=market('spread','Alabama wins by over 7.5 points');
  const base=window.NCAAF_MODEL.estimate(m,ctx),rows=ctx.margin_errors.rows;
  const poisoned={...ctx,margin_errors:{...ctx.margin_errors,rows:[...rows,...rows,{event_id:'future',kickoff:new Date(Date.now()+86400000).toISOString(),available_at:new Date(Date.now()+2*86400000).toISOString(),error:999}]}};
  const result=window.NCAAF_MODEL.estimate(m,poisoned);assert.equal(result.errorSample,100);assert.equal(result.modelP,base.modelP);
  const mismatch=window.NCAAF_MODEL.estimate(m,{...ctx,margin_errors:{...ctx.margin_errors,version:'other'}});assert.equal(mismatch.errorSample,0);
});
test('adverse scenarios reduce probabilities and QB confirmation removes only the QB scenario',()=>{
  const m=market('spread','Alabama wins by over 7.5 points'),x=window.NCAAF_MODEL.estimate(m,context);
  assert.equal(x.sensitivity.scenarios.length,4);assert.ok(x.sensitivity.scenarios.every(r=>r.modelP<=x.modelP));
  const confirmed={...context,games:{'99':{...context.games['99'],quarterbacksConfirmed:true}}};
  const y=window.NCAAF_MODEL.estimate(m,confirmed);assert.equal(y.sensitivity.scenarios.length,3);assert.equal(y.modelP,x.modelP);
  assert.ok(y.sensitivity.scenarios.at(-1).modelP>x.sensitivity.scenarios.at(-1).modelP);
});
