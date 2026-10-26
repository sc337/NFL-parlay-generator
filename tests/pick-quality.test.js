const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(blocked=false){let now=Date.now();const state=new Map();class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const window={},ctx=vm.createContext({window,Date:Clock,console,localStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>{if(blocked)throw Error('blocked');state.set(k,v)}}});
 for(const file of ['conservative-policy.js','model-calibration.js','pick-quality.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
 return {Q:window.PICK_QUALITY,window,ctx,state,now:()=>now,advance:ms=>now+=ms};}
function fixture(r,patch={}){const m={ticker:'MATCH-45',type:'totals',marketKey:'totals',point:44.5,side:'over',name:'Over 44.5',price:100,marketProbability:.5,source:'Kalshi',game_status:'pre',...patch},g={id:'game',commence_time:new Date(r.now()+2*3600000).toISOString(),game_status:'pre',markets:[m]};r.Q.prepare('nfl',[m],{},[g],new Date(r.now()).toISOString());return {m,g,f:{modelP:.64,rawModelP:.64,coverage:.7,marketP:.5,uncertainty:.3}}}
test('bankroll straights enforce the odds band while preserving ordinary pick eligibility',()=>{
 for(const price of [110,100,-109,-110,-125,-200,-250,-251]){
  const r=runtime(),{m,g,f}=fixture(r,{price,marketProbability:r.Q.implied(price)}),forecast={...f,marketP:r.Q.implied(price),modelP:r.Q.implied(price)+.15};
  assert.equal(r.Q.assess('nfl',m,forecast).pass,true);
  assert.equal(r.Q.straight('nfl',m,forecast,{game:g}).pass,price<=-110&&price>=-250,String(price));
 }
});
test('bankroll straight selects higher supported win chance over a larger estimated return',()=>{
 const r=runtime(),{m,g,f}=fixture(r,{price:-110,marketProbability:r.Q.implied(-110)});
 const value={market:m,forecast:{...f,marketP:r.Q.implied(-110),modelP:.69},game:g},likely={market:{...m,ticker:'likely',price:-180,marketProbability:r.Q.implied(-180)},forecast:{...f,marketP:r.Q.implied(-180),modelP:.79},game:g};
 assert.ok(r.Q.assess('nfl',m,value.forecast).conservativeEV>r.Q.assess('nfl',likely.market,likely.forecast).conservativeEV);
 assert.equal(r.Q.bestStraight('nfl',[value,likely]).market.ticker,'likely');
});
test('preferred straight price wins a close confidence comparison, but not a material gap',()=>{
 const r=runtime(),{m,g,f}=fixture(r,{price:-190,marketProbability:r.Q.implied(-190)});
 const preferred={market:m,forecast:{...f,marketP:r.Q.implied(-190),modelP:.79},game:g},short={market:{...m,ticker:'short',price:-240,marketProbability:r.Q.implied(-240)},forecast:{...f,marketP:r.Q.implied(-240),modelP:.80},game:g};
 assert.equal(r.Q.bestStraight('nfl',[short,preferred]).market,m);
 short.forecast.modelP=.84;assert.equal(r.Q.bestStraight('nfl',[short,preferred]).market.ticker,'short');
});
test('straight policy ignores parlay mode but still rejects poor value, stale quotes and unavailable players',()=>{
 const r=runtime(),{m,g,f}=fixture(r,{price:-150,marketProbability:.6});
 for(const mode of ['ideas','likelihood','screened']){
  r.window.DASHBOARD_UI={get:()=>mode};const forecast={...f,marketP:.6,selectionMode:mode};
  assert.equal(r.Q.bestStraight('nfl',[{market:m,forecast,game:g}]),null);
  assert.equal(r.Q.straight('nfl',m,{...forecast,modelP:.75},{game:g}).pass,true);
  assert.equal(r.Q.straight('nfl',m,{...forecast,modelP:.75,coverage:.5},{game:g}).reason,'Straight needs at least 60% input coverage');
 }
 for(const patch of [{quotedAt:new Date(r.now()-31*60000).toISOString()},{injury_status:'out'},{game_status:'in'}])assert.equal(r.Q.straight('nfl',{...m,...patch},{...f,modelP:.75},{game:g}).pass,false);
});
test('straights wait for confirmed participation evidence across lineup sports',()=>{
 for(const sport of ['nba','ncaaf','nhl','mlb']){
  const r=runtime(),m={ticker:sport,kind:'total',game_id:'1',game_time:new Date(r.now()+2*3600000).toISOString(),yes_ask:.6,probability:.6,game_status:'pre'};
  const context=sport==='mlb'?{updated_at:new Date(r.now()).toISOString(),games:[{gamePk:'1',startersConfirmed:true,lineupsConfirmed:true}]}:{games:{'1':{season_type:2}}};
  r.Q.prepare(sport,[m],context,[],new Date(r.now()).toISOString());const f={modelP:.76,marketP:.6,coverage:.8,uncertainty:.3};
  let confirmed=false;r.window.STARTER_STATUS={evidence:()=>({confirmed,confirmedPlayer:confirmed,lineConfirmed:confirmed})};
  if(sport==='mlb'){context.games[0].lineupsConfirmed=false;assert.equal(r.Q.straight(sport,m,f).pass,false);context.games[0].lineupsConfirmed=true;}
  else assert.equal(r.Q.straight(sport,m,f).pass,false,sport);
  confirmed=true;assert.equal(r.Q.straight(sport,m,f).pass,true,sport);
 }
});
test('book compatibility blocks ALT player unders on straight, featured, extra and parlay gates',()=>{
 const r=runtime(),{m,g,f}=fixture(r,{type:'rushing',marketKey:'player_rush_yds',player:'RB',side:'under',name:'RB Under 69.5',isAltLine:true,_rosterVerified:true});
 const forecast={...f,roleStability:.8};
 for(const options of [{},{featured:true},{parlay:true}])assert.equal(r.Q.assess('nfl',m,forecast,options).reason,'ALT player-prop unders unsupported at your book');
 assert.equal(r.Q.checkBuild('nfl',[{market:m,forecast,game:g}],false).pass,false);
 assert.equal(r.Q.assess('nfl',{...m,isAltLine:false},forecast).pass,true);
 assert.equal(r.Q.assess('nfl',{...m,side:'over',name:'RB Over 69.5'},forecast).pass,true);
 assert.equal(r.Q.unsupportedAltUnder({...m,isAltLine:false,marketKey:'player_rush_yds_alternate'}),true);
 assert.equal(r.Q.unsupportedAltUnder({...m,player:null,type:'totals',marketKey:'totals'}),false);
});
test('all selections need independent coverage and edge beyond a named uncertainty buffer',()=>{const r=runtime(),{m,f}=fixture(r);assert.equal(r.Q.assess('nfl',m,f).pass,true);assert.equal(r.Q.assess('nfl',m,{...f,modelP:.49}).pass,false);assert.equal(r.Q.assess('nfl',m,{...f,modelP:.53}).pass,false);assert.equal(r.Q.assess('nfl',m,{...f,coverage:.1}).reason,'Independent projection too thin');assert.equal(r.Q.assess('nfl',m,{...f,modelP:.5}).reason,'Market-only estimate');assert.ok(r.Q.assess('nfl',m,f).conservativeP<f.modelP)});
test('Win Chance can accept a price failure without treating it as qualified value',()=>{
 const r=runtime(),{m,f}=fixture(r,{price:-150}),forecast={...f,selectionMode:'likelihood'};
 const strict=r.Q.assess('nfl',m,f),chance=r.Q.assess('nfl',m,forecast);
 assert.equal(strict.pass,false);assert.equal(strict.reason,'Edge does not clear uncertainty buffer');
 assert.equal(chance.pass,true);assert.equal(chance.pricePass,false);assert.equal(chance.valueQualified,false);assert.equal(chance.selectionMode,'likelihood');assert.equal(chance.rankingP,chance.conservativeP);
 assert.match(chance.warnings.join(' '),/poor value/);
 assert.equal(r.Q.assess('nfl',m,{...forecast,modelP:.53}).reason,'Win Chance needs a buffered estimate of at least 50%');
 const expensive={...m,price:-900,marketProbability:.88};assert.equal(r.Q.assess('nfl',expensive,{...forecast,modelP:.89,marketP:.88}).reason,'Price too short for Win Chance');
 for(const patch of [{quotedAt:new Date(r.now()-31*60000).toISOString()},{injury_status:'out'},{game_status:'in'},{_invalidRoster:true}]){
  assert.equal(r.Q.assess('nfl',{...m,...patch},forecast).pass,false);
 }
 assert.equal(r.Q.assess('nfl',{...m,marketKey:'player_rush_attempts'},forecast,{parlay:true}).reason,'Caesars straight only');
 assert.equal(r.Q.assess('nfl',{...m,player:'Runner',type:'rushing',marketKey:'player_rush_yds',isAltLine:true,side:'under'},forecast).pass,false);
});
test('NFL measured stable opportunity history resolves its missing-role penalty without overriding known instability',()=>{
 const r=runtime(),{m,g,f}=fixture(r,{player:'Runner',type:'rushing',_rosterVerified:true,contextSignals:{injury_checked:true,injury_status:'none_reported'},propHistory:{source:'nflverse completed plays',played:5,games:5,opportunities:{player_rush_attempts:[12,13,12,14,13]}}});
 const forecast={...f,roleStability:.8};g.context={updated_at:new Date(r.now()).toISOString()};
 const stable=r.Q.assess('nfl',m,forecast);assert.ok(!stable.context.missing.includes('Stable recent role'));assert.equal(stable.pass,true);
 const incomplete={...m,propHistory:{...m.propHistory,opportunities:{}}};const missing=r.Q.assess('nfl',incomplete,forecast);
 assert.ok(missing.context.missing.includes('Stable recent role'));assert.ok(Math.abs(missing.buffer-stable.buffer-.008)<1e-12);
 const explicit={...m,propHistory:{...m.propHistory,roleStable:false}};assert.ok(r.Q.assess('nfl',explicit,forecast).context.missing.includes('Stable recent role'));
 assert.equal(r.Q.assess('nfl',m,{...forecast,roleStability:.4}).reason,'Playing time uncertain');
 assert.equal(r.Q.assess('nfl',m,{...forecast,roleChange:{status:'falling'}}).dataPass,false);
});
test('increased opportunity requires measured projection and adverse scenarios; injuries and reduced roles still block',()=>{
 const r=runtime(),{m,g,f}=fixture(r,{player:'Runner',type:'rushing',_rosterVerified:true,contextSignals:{injury_checked:true,injury_status:'none_reported'},propHistory:{source:'nflverse completed plays',played:5,games:5,opportunities:{player_rush_attempts:[10,10,10,15,15]}}});
 g.context={updated_at:new Date(r.now()).toISOString()};
 const forecast={...f,roleStability:.8,opportunity:{sample:5},roleChange:{status:'rising',ratio:1.5},sensitivity:{scenarios:[{modelP:.64},{modelP:.65},{modelP:.66}]}};
 const x=r.Q.assess('nfl',m,forecast,{parlay:true});assert.equal(x.pass,true);assert.equal(x.bufferParts.changedRole,.015);assert.match(x.warnings.join(' '),/Increased role/);
 for(const patch of [{opportunity:null},{sensitivity:null},{sensitivity:{scenarios:[{modelP:.54}]}},{roleChange:{status:'rising',ratio:2}}])assert.equal(r.Q.assess('nfl',m,{...forecast,...patch}).pass,false);
 assert.equal(r.Q.assess('nfl',{...m,contextSignals:{injury_status:'out'}},forecast).reason,'Player unavailable');
 assert.equal(r.Q.assess('nfl',m,{...forecast,roleChange:{status:'falling'}}).pass,false);
});
test('screen separates hard eligibility from price-only rejection and reports exact buffer components',()=>{
 const r=runtime(),{m,f}=fixture(r);const x=r.Q.assess('nfl',m,{...f,modelP:.55});
 assert.equal(x.dataPass,true);assert.equal(x.pricePass,false);assert.equal(x.pass,false);assert.equal(x.dataReason,null);assert.ok(x.priceGap>0);
 assert.ok(Math.abs(Object.values(x.bufferParts).reduce((a,b)=>a+b,0)-x.buffer)<1e-12);
 const stale=r.Q.assess('nfl',{...m,quotedAt:new Date(r.now()-31*60000).toISOString()},{...f,modelP:.55});
 assert.equal(stale.dataPass,false);assert.equal(stale.dataReason,'Quote older than 30 minutes');
 const unavailable=r.Q.assess('nfl',{...m,injury_status:'out'},{...f,modelP:.55});assert.equal(unavailable.dataPass,false);assert.equal(unavailable.reason,'Player unavailable');
});
test('minimum acceptable whole-number American odds strictly clear the buffered estimate',()=>{
 const r=runtime(),{m,f}=fixture(r);
 for(const modelP of [.52,.55,.6,.64,.7]){
  const x=r.Q.assess('nfl',m,{...f,modelP}),o=x.minimumOdds;
  assert.ok(r.Q.implied(o)<x.conservativeP);const worse=o===100?-100:o-1;
  if(r.Q.odds(worse))assert.ok(r.Q.implied(worse)>=x.conservativeP);
 }
});
test('NCAAF sensitivity labels are advisory for straights, featured picks and parlays',()=>{
 const r=runtime(),m={ticker:'college',kind:'spread',game_id:'1',game_time:new Date(r.now()+4*3600000).toISOString(),yes_ask:.56,probability:.56,game_status:'pre'};
 r.Q.prepare('ncaaf',[m],{},[],new Date(r.now()).toISOString());
 const f={modelP:.70,rawModelP:.70,marketP:.56,coverage:.8,uncertainty:.5,experimental:true,forecastVersion:'ncaaf-errors-stress-v1'};
 assert.equal(r.Q.assess('ncaaf',m,f).pass,true,'base edge clears buffer');
 const fragile={...f,sensitivity:{scenarios:[{name:'Combined adverse assumptions',modelP:.63}],pricePenalty:.02}};
 for(const options of [{},{featured:true},{parlay:true}]){const x=r.Q.assess('ncaaf',m,fragile,options);assert.equal(x.pass,true);assert.equal(x.sensitivity.pass,false);assert.equal(x.sensitivity.label,'Sensitive to assumptions');assert.equal(x.sensitivity.policy,'advisory');assert.match(x.warnings.join(' '),/Sensitive to assumptions/);}
 assert.equal(r.Q.checkBuild('ncaaf',[{market:m,forecast:fragile}],false).pass,true);
 const robust={...f,sensitivity:{scenarios:[{name:'Combined adverse assumptions',modelP:.69}],pricePenalty:.02}},x=r.Q.assess('ncaaf',m,robust);
 assert.equal(x.pass,true);assert.equal(x.sensitivity.label,'Robust');assert.ok(Math.abs(x.sensitivity.requiredP-.58)<1e-12);assert.ok(x.sensitivity.worstP>.58);assert.equal(x.minimumOdds,r.Q.assess('ncaaf',m,f).minimumOdds,'minimum acceptable price uses the original buffer');
 assert.equal(r.Q.assess('ncaaf',m,{...fragile,modelP:.55}).reason,'Edge does not clear uncertainty buffer');
 assert.equal(r.Q.assess('ncaaf',{...m,context_unmatched:true},robust).reason,'Matchup context unverified');
 assert.equal(r.Q.assess('ncaaf',{...m,quotedAt:new Date(r.now()-31*60000).toISOString()},robust).reason,'Quote older than 30 minutes');
});
test('delayed references never qualify as current value and started events always fail',()=>{const r=runtime(),{m,f}=fixture(r);r.advance(31*60000);assert.equal(r.Q.quote('nfl',m).source,'Kalshi');assert.equal(r.Q.assess('nfl',m,f).valueQualified,false);assert.match(r.Q.assess('nfl',m,f).warnings.join(' '),/Delayed reference/);r.advance(2*3600000);assert.equal(r.Q.assess('nfl',m,f).reason,'Event already started')});
test('injury, roster and role checks cannot be bypassed by odds; attempts stay straight only',()=>{const r=runtime(),{m,g,f}=fixture(r,{player:'Player',_rosterVerified:true,type:'rushing',marketKey:'player_rush_attempts',contextSignals:{injury_status:'questionable'}});assert.equal(r.Q.assess('nfl',m,f).reason,'Confirm current injury status');m.contextSignals={injury_status:'none_reported',injury_checked:true};g.context={updated_at:new Date(r.now()).toISOString()};f.roleStability=.7;assert.equal(r.Q.assess('nfl',m,f).pass,true);assert.equal(r.Q.assess('nfl',m,f,{parlay:true}).reason,'Caesars straight only');m.contextSignals.injury_status='out';assert.equal(r.Q.assess('nfl',m,f).reason,'Player unavailable');m.contextSignals.injury_status='none_reported';m._rosterVerified=false;assert.equal(r.Q.assess('nfl',m,f).reason,'Roster unverified')});
test('fresh reported NFL availability still needs stable playing time',()=>{const r=runtime(),{m,g,f}=fixture(r,{player:'Player',_rosterVerified:true,type:'rushing',marketKey:'player_rush_yds',contextSignals:{injury_status:'none_reported',injury_checked:true}});g.context={updated_at:new Date(r.now()).toISOString()};assert.equal(r.Q.assess('nfl',m,{...f,roleStability:.4}).reason,'Playing time uncertain');assert.equal(r.Q.assess('nfl',m,{...f,roleStability:.7}).pass,true)});
test('Missing lineup information produces labeled conditional suggestions rather than a permanent veto',()=>{const r=runtime(),start=new Date(r.now()+3600000).toISOString();for(const s of ['mlb','nhl','ncaaf']){const m={ticker:s,kind:'moneyline',label:'Team ML',game_id:'1',game_time:start,yes_ask:.5,probability:.5,game_status:'pre'},f={modelP:.64,coverage:.8,experimental:true};r.Q.prepare(s,[m],{},[],new Date(r.now()).toISOString());const x=r.Q.assess(s,m,f);assert.equal(x.pass,true,s);assert.equal(x.tier,'conditional');assert.equal(x.valueQualified,false);assert.ok(x.warnings.length);assert.equal(r.Q.record,undefined)}});
test('verified MLB starters and nine-person lineups can qualify without a manual check',()=>{const r=runtime(),m={ticker:'mlb',kind:'moneyline',game_id:'1',game_time:new Date(r.now()+3600000).toISOString(),yes_ask:.5,probability:.5},f={modelP:.64,coverage:.8};r.Q.prepare('mlb',[m],{games:[{gamePk:1,startersConfirmed:true,lineupsConfirmed:true}]},[],new Date(r.now()).toISOString());assert.equal(r.Q.assess('mlb',m,f).pass,true)});
test('SGP evaluation uses actual odds and dependence bounds, without correlation uplifts',()=>{const r=runtime(),{m,g,f}=fixture(r),entries=[{market:m,forecast:f,game:g},{market:{...m,ticker:'OTHER',point:45.5,game_time:g.commence_time},forecast:f,game:g}];const x=r.Q.checkBuild('nfl',entries,true,400);assert.ok(x.bounds.lower<.5);assert.ok(x.bounds.upper<.75);assert.equal(x.actionable,false);assert.equal(r.Q.checkBuild('nfl',entries,true,100).valueStatus,'Joint value unverified');assert.equal(r.Q.checkBuild('nfl',entries,true,-400).valueStatus,'Price fails even the upper bound');assert.equal(r.Q.checkBuild('nfl',entries,true).actionable,false)});
test('calibration uses the market family and retains experimental labels',()=>{const r=runtime(),{m,f}=fixture(r);r.window.MODEL_CALIBRATION_DATA={updated_at:new Date(r.now()).toISOString(),sports:{nfl:{totals:{active:true,trainingCount:30,distinctEvents:50,validationCount:20,adjustedBrier:.20,marketBrier:.23,rawBrier:.25,alpha:.5,bias:0}}}};const x=r.Q.assess('nfl',m,f);assert.equal(x.modelP,.5700000000000001);assert.equal(x.validated,true);const exp=r.Q.forecast('nfl',m,{...f,experimental:true});assert.equal(exp.experimental,true);assert.equal(exp.calibrationValidated,false);assert.equal(exp.modelP,.64)});
test('NFL builder packaging refuses a weak leg even when the script fits',()=>{const r=runtime(),{m,g}=fixture(r);m.modelProbability=.72;m.price=-150;m.marketProbability=.6;m.projectionCoverage=.7;const source=fs.readFileSync('app.js','utf8'),boundary=source.indexOf("$$('#marketChips .chip').forEach");Object.assign(r.ctx,{document:{querySelector(){return null},querySelectorAll(){return[]}},setTimeout(){},localStorage:{getItem(){return null}},impliedProbability:o=>o>0?100/(o+100):Math.abs(o)/(100+Math.abs(o))});vm.runInContext(source.slice(0,boundary),r.ctx);r.window.NFL_PARLAY_STATE.games=[g];r.Q.prepare('nfl',[m],{},[g],new Date(r.now()).toISOString());r.ctx.market=m;assert.ok(vm.runInContext("packageParlay([market],'balanced',false)",r.ctx));m.modelProbability=.51;assert.equal(vm.runInContext("packageParlay([market],'balanced',false)",r.ctx),null)});
test('Market line checks use signed spreads and equivalent count thresholds',()=>{const {Q}=runtime();assert.equal(Q.line({kind:'spread',title:'Alabama wins by over 4.5 points'}),-4.5);assert.equal(Q.line({kind:'spread',label:'Kings +1.5 Puck line',line:1.5,side:'no'}),1.5);assert.equal(Q.line({kind:'hits',label:'Player: 2+ hits'}),1.5);assert.equal(Q.line({marketKey:'player_rush_yds',point:49.5,name:'Player 50+ rushing yards'}),49.5);assert.equal(Q.checkBuild('nfl',[],true,400).pass,false)});
test('fresh genuine sportsbook quotes do not inherit an old snapshot timestamp',()=>{const r=runtime(),{m,f}=fixture(r);r.advance(121*60000);m.game_time=new Date(r.now()+3600000).toISOString();assert.equal(r.Q.assess('nfl',m,f).pass,false);m.quotedAt=new Date(r.now()).toISOString();m.source='Caesars';assert.equal(r.Q.assess('nfl',m,f).pass,true);assert.equal(r.Q.assess('nfl',m,f).quote.source,'Caesars')});
test('Caesars API compatibility tags actual bookmaker provenance without relabeling unrelated text',async()=>{const window={location:{href:'https://example.test/'},fetch:async url=>{assert.equal(new URL(url).searchParams.get('bookmakers'),'williamhill_us');return new Response(JSON.stringify({bookmakers:[{key:'williamhill_us',title:'Caesars',markets:[]},{key:'fanduel',title:'FanDuel',markets:[]}]}),{headers:{'content-type':'application/json'}})}};vm.runInNewContext(fs.readFileSync('sportsbook-caesars.js','utf8'),{window,URL,Response,Request,Headers,console});const data=await (await window.fetch('https://api.the-odds-api.com/v4/sports/nfl/odds')).json();assert.equal(data.bookmakers[0].dashboardBookSource,'Caesars');assert.equal(data.bookmakers[1].dashboardBookSource,undefined);assert.equal(data.bookmakers[1].title,'FanDuel')});
test('legacy manual prices cannot affect feed quotes, value or independent estimates',()=>{const r=runtime(),{m,g,f}=fixture(r);r.state.set('sportsPriceChecksV1',JSON.stringify([{key:r.Q.id('nfl',m),kind:'straight',book:'Caesars',line:44.5,odds:-400,checkedAt:new Date(r.now()).toISOString(),eventTime:g.commence_time,participationConfirmed:true}]));vm.runInContext(fs.readFileSync('pick-quality.js','utf8'),r.ctx);r.Q=r.window.PICK_QUALITY;r.Q.prepare('nfl',[m],{},[g],new Date(r.now()).toISOString());assert.equal(r.Q.quote('nfl',m).odds,100);assert.equal(r.Q.quoteLabel('nfl',m),'Kalshi +100');assert.equal(r.Q.assess('nfl',m,f).pass,true);assert.equal(r.Q.record,undefined);vm.runInContext(fs.readFileSync('market-guards.js','utf8'),r.ctx);m.game_id='1';const other={...m,ticker:'OTHER',game_id:'2'};assert.equal(r.Q.estimateOdds('nfl',[m,other]),300);assert.equal(r.Q.estimateOdds('nfl',[m,{...other,game_id:'1'}]),null);assert.equal(r.Q.checkBuild('nfl',[{market:m,forecast:f}],true).valueStatus,'Joint value unverified')});

test('market-anchored NFL suggestions must clear the same buffer as other picks',()=>{const r=runtime(),{m,f}=fixture(r);m.price=-150;const x=r.Q.assess('nfl',m,{...f,modelP:.602,marketP:.60,coverage:.3,marketAnchored:true});assert.equal(x.pass,false);assert.equal(x.reason,'Edge does not clear uncertainty buffer');assert.equal(x.tier,'suggestion');assert.equal(x.valueQualified,false);assert.match(x.warnings.join(' '),/value unverified/);assert.equal(r.Q.assess('nfl',m,{...f,modelP:.59,marketP:.6,coverage:.3,marketAnchored:true}).pass,false);assert.equal(r.Q.assess('nfl',m,{...f,modelP:.602,marketP:.6,coverage:.3}).pass,false)});
test('delayed suggestions expire after two hours and known unavailability still blocks them',()=>{const r=runtime(),{m,g,f}=fixture(r);g.commence_time=new Date(r.now()+4*3600000).toISOString();r.advance(121*60000);assert.equal(r.Q.assess('nfl',m,f).reason,'Quote older than 30 minutes');m.quotedAt=new Date(r.now()).toISOString();m.injury_status='out';assert.equal(r.Q.assess('nfl',m,f).reason,'Player unavailable')});
test('NFL prices label the actual FanDuel or Kalshi venue without changing odds',()=>{const r=runtime();for(const source of ['FanDuel','Kalshi']){const {m}=fixture(r,{source,price:-144});assert.equal(r.Q.quoteLabel('nfl',m),source+' -144');assert.equal(r.Q.quote('nfl',m).odds,-144)}const {m}=fixture(r,{source:'Unknown feed'});assert.equal(r.Q.quoteLabel('nfl',m),'Reference +100')});
