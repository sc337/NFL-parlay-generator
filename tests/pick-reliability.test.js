const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){const window={};vm.runInNewContext(fs.readFileSync('model-calibration.js','utf8'),{window,Date});vm.runInNewContext(fs.readFileSync('pick-quality.js','utf8'),{window,Date});return window}
function selection(w,s,ask,p,extra={}){
 const Q=w.PICK_QUALITY,start=new Date(Date.now()+86400000).toISOString();
 const m={ticker:s+ask,kind:'moneyline',type:'h2h',game_id:'1',game_time:start,game_status:'pre',probability:ask,marketProbability:ask,yes_ask:ask,spread:.02,...extra};
 Q.prepare(s,[m],{games:[{gamePk:1,startersConfirmed:true,lineupsConfirmed:true}]},[],new Date().toISOString());
 return {m,f:{modelP:p,rawModelP:p,marketP:ask,coverage:.8,uncertainty:.3,experimental:s!=='nfl'&&s!=='ufc'}};
}
test('unsupported longshots and large model disagreements fail across every sport',()=>{
 for(const s of ['nfl','mlb','ncaaf','ufc','nhl']){
  const w=runtime(),Q=w.PICK_QUALITY;
  for(const ask of [.02,.04,.23]){const {m,f}=selection(w,s,ask,.55);assert.equal(Q.assess(s,m,f).reason,'Unvalidated longshot; insufficient reliability',s)}
  const {m,f}=selection(w,s,.5,.80);assert.equal(Q.assess(s,m,f).reason,'Model disagrees too strongly with market',s);
 }
});
test('the real Southern Miss estimate cannot become a featured recommendation or trigger a forced Troy replacement',()=>{
 const w=runtime();vm.runInNewContext(fs.readFileSync('ncaaf-model.js','utf8'),{window:w,Date});
 const {m}=selection(w,'ncaaf',.23,.4,{game_id:'1',label:'Southern Miss',title:'Southern Miss wins'});
 const context={updated_at:new Date().toISOString(),league_points_per_team:25.4,games:{'1':{kickoff:m.game_time,home:{aliases:['Troy'],form:{available:true,games:4,box_games:4,margin:-.25,yards_for:371.8,yards_against:309.2,points_for:21.25,points_against:21.5}},away:{aliases:['Southern Miss'],form:{available:true,games:4,box_games:4,margin:-5,yards_for:391.5,yards_against:429.2,points_for:24.5,points_against:29.5}}}}};
 const f=w.NCAAF_MODEL.estimate(m,context);assert.ok(f.modelP>.39&&f.modelP<.41);assert.equal(w.PICK_QUALITY.assess('ncaaf',m,f,{featured:true}).pass,false);
 const troy={...m,label:'Troy',title:'Troy wins',probability:.775,yes_ask:.78};
 assert.equal(w.PICK_QUALITY.assess('ncaaf',troy,w.NCAAF_MODEL.estimate(troy,context)).pass,false);
});
test('likely qualifying selections outrank higher-return underdogs across sports',()=>{
 for(const s of ['nfl','mlb','ncaaf','ufc','nhl']){
  const w=runtime(),Q=w.PICK_QUALITY,underdog=selection(w,s,.45,.58),favorite=selection(w,s,.70,.81);
  const a=Q.assess(s,underdog.m,underdog.f),b=Q.assess(s,favorite.m,favorite.f);
  assert.equal(a.pass,true,s);assert.equal(b.pass,true,s);assert.ok(a.conservativeEV>b.conservativeEV);assert.ok(b.rank>a.rank,s);
  assert.equal(b.valueQualified,false);assert.equal(b.evidence,'Unvalidated model');
  assert.equal(Q.assess(s,underdog.m,underdog.f,{featured:true}).pass,false);
  assert.equal(Q.assess(s,favorite.m,favorite.f,{featured:true}).pass,true);
 }
});
test('calibration needs fresh separate-family holdout evidence that beats the market',()=>{
 const w=runtime(),{m,f}=selection(w,'nfl',.6,.72),rule={active:true,alpha:.9,bias:0,trainingCount:30,validationCount:20,distinctEvents:50,rawBrier:.25,marketBrier:.23,adjustedBrier:.20};
 const set=(patch={},at=new Date().toISOString())=>w.MODEL_CALIBRATION_DATA={updated_at:at,sports:{nfl:{moneyline:{...rule,...patch}}}};
 set();assert.equal(w.PICK_QUALITY.assess('nfl',m,f).validated,true);assert.equal(w.PICK_QUALITY.assess('nfl',m,f).valueQualified,true);
 for(const patch of [{trainingCount:29},{validationCount:19},{distinctEvents:49},{adjustedBrier:.231},{adjustedBrier:null},{active:false}]){set(patch);assert.equal(w.PICK_QUALITY.assess('nfl',m,f).validated,false)}
 set({},new Date(Date.now()-8*86400000).toISOString());assert.equal(w.MODEL_CALIBRATION.apply('nfl','moneyline',.72,.6),.72);
 set();assert.equal(w.PICK_QUALITY.assess('nfl',m,{...f,experimental:true}).validated,false);
});
test('stale quotes and wide spreads cannot enter a recommendation',()=>{
 const w=runtime(),{m,f}=selection(w,'mlb',.6,.72);
 w.PICK_QUALITY.prepare('mlb',[m],{},[],new Date(Date.now()-31*60000).toISOString());assert.equal(w.PICK_QUALITY.assess('mlb',m,f).reason,'Quote older than 30 minutes');
 selection(w,'mlb',.6,.72);m.spread=.12;assert.equal(w.PICK_QUALITY.assess('mlb',m,f).reason,'Quote spread too wide');
});
test('featured candidate selectors enforce the shared featured policy in all sports',()=>{
 for(const s of ['mlb','ncaaf','nhl','ufc'])assert.match(fs.readFileSync(s+'-dashboard.js','utf8'),/featured:true/);
 assert.match(fs.readFileSync('app.js','utf8'),/featured:true/);
});
