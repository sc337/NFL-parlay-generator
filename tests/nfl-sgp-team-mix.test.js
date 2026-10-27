const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function build({ideas=false,probability=.8,markets}={}){
 const source=fs.readFileSync('app.js','utf8');
 markets=markets||[
 {type:'spreads',team:'Home',score:120},
 {type:'totals',side:'under',score:119},
 {type:'passing',team:'Home',player:'QB',side:'under',score:118},
 {type:'receiving',team:'Away',player:'WR',side:'under',score:90}];
 markets=markets.map((m,i)=>({name:'Leg '+i,marketKey:m.type==='passing'?'player_pass_yds':m.type==='receiving'?'player_reception_yds':m.type,...m}));
 const game={away:'Away',home:'Home',markets};
 const window={PICK_QUALITY:{id:(s,m)=>m.name,checkBuild:(s,entries)=>({pass:true,checks:entries.map(()=>({modelP:probability}))})}},ctx=vm.createContext({window,Date,state:{selectedMarkets:new Set(markets.map(m=>m.type))},candidateScore:m=>m.score,isParlayEligible:()=>true,nflQualityForecast:()=>({}),packageParlay:(legs,profile)=>({legs,profile,ideaTier:ideas})});
 window.NFL_PARLAY_IDEAS={active:()=>ideas,checkBuild:legs=>({pass:true,checks:legs.map(()=>({quote:{p:probability}}))})};
 vm.runInContext(fs.readFileSync('parlay-risk.js','utf8'),ctx);
 vm.runInContext(source.slice(source.indexOf('function isTeamSide('),source.indexOf('function marketQuality(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function playerCount('),source.indexOf('function favoriteTeam(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function sgpTeam('),source.indexOf('function propFamily(')),ctx);
 return{ctx,game,run:(variant='safe',previous=[],count=3)=>ctx.buildSgp(game,count,50,variant,previous)};
}
test('a spread, total and one prop can win without a forced two-prop or both-team quota',()=>{
 const r=build();r.game.markets=r.game.markets.slice(0,3);const p=r.run();assert.ok(p);assert.equal(p.legs.filter(m=>m.player).length,1);assert.equal(p.teamMix,'Concentrated');assert.equal(p.legs.length,3);assert.equal(p.scriptName,'Experimental joint scenario');assert.equal(r.ctx.parlaySignature(p),r.ctx.parlaySignature(r.run()));
});
test('joint ranking can prefer a lower individual score with better shared outcomes',()=>{
 const r=build(),p=r.run();assert.ok(p.legs.some(m=>m.type==='totals'));assert.ok(p.risk.scenario.sensitivity[0]>0);
 // Inject controlled complete-combination likelihoods to isolate selection from marginal scores.
 r.ctx.sgpCombinationRisk=legs=>({pass:true,modelP:legs.some(m=>m.team==='Away')?.60:.40,scenario:{sensitivity:[legs.some(m=>m.team==='Away')?.55:.35]}});
 const better=r.run();assert.ok(better.legs.some(m=>m.team==='Away'));
});
test('reference-mode combination checks retain null model probability and label their price inputs',()=>{
 const p=build({ideas:true}).run();assert.ok(p);assert.equal(p.risk.modelP,null);assert.ok(p.risk.referenceP>.3);assert.equal(p.risk.validated,false);assert.match(p.summary,/Reference prices supply scenario inputs/);assert.match(p.summary,/not a proven edge/);
});
test('joint bands and exposure overlap do not reject otherwise checked builds',()=>{
 const r=build(),safe=r.run();assert.ok(safe);for(const key of ['balanced','long','safe'])assert.ok(r.run(key,[safe]));
 for(const p of [.10,.29,.49,.8])assert.equal(r.ctx.sgpProfileFits({risk:{pass:true,modelP:p}},'balanced',[safe]),true);
 assert.equal(r.ctx.sgpProfileFits({risk:{pass:false,modelP:.8}},'safe',[]),false);
});
test('unknown team identities cannot fabricate joint risk and failed build gates remain blocked',()=>{
 const r=build();
 r.ctx.window.PICK_QUALITY.checkBuild=()=>({pass:false,checks:[]});assert.equal(r.run(),null);
 const u=build({markets:[{type:'passing',player:'X',team:'Unknown',score:100},{type:'passing',player:'Y',team:'Unknown',score:99}]});assert.equal(u.run('safe',[],2),null);
});
test('legacy requests cap at four and incomplete SGPs are omitted',()=>{
 const r=build();const p=r.run('safe',[],5);assert.ok(p);assert.equal(p.legs.length,4);r.game.markets=r.game.markets.slice(0,1);assert.equal(r.run(),null);
});
test('flipping every direction or moving thresholds cannot masquerade as distinct profile exposure',()=>{
 const r=build(),legs=['A','B','C','D'].map(player=>({player,type:'receptions',marketKey:'player_receptions',side:'over',point:.5,name:player+' over'}));
 const old={legs,risk:{referenceP:.25}},mirror={legs:legs.map(m=>({...m,side:'under',point:3.5,name:m.player+' under'})),risk:{referenceP:.10}};
 assert.equal(r.ctx.sgpExposureOverlap(old,mirror),4);assert.equal(r.ctx.sgpProfileFits(mirror,'long',[old]),false);
});
test('four same-offense receivers are blocked for overs and unders without forcing both teams',()=>{
 const r=build();for(const side of ['over','under']){
 const rows=['A','B','C','D'].map(player=>({player,team:'Home',type:'receptions',side}));
 assert.equal(r.ctx.sgpConcentrationPass(rows),false);assert.equal(r.ctx.sgpConcentrationPass(rows.slice(0,2)),true);
 assert.equal(r.ctx.sgpConcentrationPass([...rows.slice(0,2),{type:'totals'},{player:'RB',type:'rushing',team:'Home'}]),true);
 }
});
test('assumed correlation uplift alone cannot create a Conservative label',()=>{
 const r=build(),p={legs:[{name:'a'},{name:'b'},{name:'c'},{name:'d'}],risk:{referenceP:.38,independentP:.19,scenario:{sensitivity:[.31,.42]}}};
 assert.equal(r.ctx.sgpLikelihood(p),.19);p.risk.pass=true;assert.equal(r.ctx.sgpProfileFits(p,'safe',[]),true);assert.equal(r.ctx.sgpProfileFits(p,'balanced',[]),true);
});
test('NFL Balanced compares weakest-leg evidence inside the same joint-risk band',()=>{
 const r=build({markets:[{type:'passing',player:'A',team:'Home',score:120,p:.7,c:.9},{type:'receiving',player:'B',team:'Away',score:119,p:.35,c:.6},{type:'receiving',player:'C',team:'Away',score:116,p:.6,c:.9}]});
 r.game.id='verified-game';vm.runInContext(fs.readFileSync('market-guards.js','utf8'),r.ctx);
 r.ctx.window.PICK_QUALITY.assess=(sport,m)=>({conservativeP:m.p,coverage:m.c});
 r.ctx.sgpCombinationRisk=()=>({pass:true,modelP:.2,scenario:{sensitivity:[.18,.24]}});r.ctx.sgpProfileFits=()=>true;
 assert.deepEqual([...r.run('safe',[],2).legs.map(m=>m.player)].sort(),['A','B']);
 assert.deepEqual([...r.run('balanced',[],2).legs.map(m=>m.player)].sort(),['A','C']);
});
test('complete combinations below the former top-24 cutoff reach the joint-risk check',()=>{
 const r=build({markets:Array.from({length:9},(_,i)=>({type:'passing',team:i%2?'Away':'Home',player:'P'+i,score:120-i}))});
 r.ctx.sgpCombinationRisk=legs=>{const good=legs.every(m=>Number(m.player.slice(1))>=7),p=good?.5:.1;return {pass:true,modelP:p,independentP:p,scenario:{sensitivity:[p,p]}}};
 const p=r.run('safe',[],2);assert.ok(p);assert.deepEqual([...p.legs.map(m=>m.player)].sort(),['P7','P8']);
});
test('one player threshold ladder cannot starve distinct players out of an ALT build',()=>{
 const rows=Array.from({length:30},(_,i)=>({type:'passing',player:'QB',team:'Home',score:200-i,point:i*10+9.5}));
 rows.push(...['RB','WR','OtherQB'].map((player,i)=>({type:'passing',player,team:i===0?'Home':'Away',score:100-i})));
 const r=build({markets:rows});r.ctx.sgpCombinationRisk=()=>({pass:true,modelP:.5,independentP:.5,scenario:{sensitivity:[.5,.5]}});
 const p=r.run('safe',[],4);assert.ok(p);assert.equal(new Set(p.legs.map(m=>m.player)).size,4);
});
test('fallback uses the largest qualifying smaller count and records the requested size',()=>{
 const r=build(),calls=[];r.ctx.buildSgp=(game,count,risk,variant)=>{calls.push(count);game.sgpSearchDiagnostics={qualified:12,compatible:0};return count===3&&variant==='safe'?{legs:[{},{},{}],profile:variant}:null};
 const result=r.ctx.buildSgpProfiles(r.game,4,50,['safe','balanced','long']);
 assert.equal(result.count,3);assert.equal(result.parlays[0].requestedLegs,4);assert.match(result.reason,/distinct compatible/);assert.ok(!calls.includes(2));
});
test('fallback does not shorten a successful request or invent an unavailable build',()=>{
 const r=build();r.ctx.buildSgp=(game,count,risk,variant)=>count===4?{legs:[{},{},{},{}],profile:variant}:null;
 assert.equal(r.ctx.buildSgpProfiles(r.game,4,50,['safe']).count,4);
 r.ctx.buildSgp=()=>null;const empty=r.ctx.buildSgpProfiles(r.game,4,50,['safe']);assert.equal(empty.parlays.length,0);assert.equal(empty.count,4);
});
test('Conservative cushion preference is shared by screened SGP and multi-game without bypassing quality',()=>{
 const source=fs.readFileSync('app.js','utf8'),state={lineMode:'alt',moreCushion:false,mode:'sgp'},window={NFL_ALT_LINES:{matches:()=>true,cushionBonus:m=>m.cushionPoints?3:0},PICK_QUALITY:{assess:()=>({pass:true})}};
 const ctx=vm.createContext({window,state,nflQualityForecast:()=>({}),profileSelectionScore:()=>100});
 vm.runInContext(source.slice(source.indexOf('function candidateScore('),source.indexOf('function playerCount(')),ctx);
 for(const mode of ['sgp','multi']){state.mode=mode;assert.equal(ctx.candidateScore({cushionPoints:10},50,'safe'),103);assert.equal(ctx.candidateScore({},50,'safe'),100);assert.equal(ctx.candidateScore({cushionPoints:10},50,'balanced'),100)}
 window.PICK_QUALITY.assess=()=>({pass:false});assert.equal(ctx.candidateScore({cushionPoints:10},50,'safe'),-999);
});

test('Conservative and Balanced cap all same-team players at two',()=>{
 const r=build(),legs=['A','B','C'].map(player=>({player,team:'Home',type:'rushing'}));
 for(const profile of ['safe','balanced'])assert.equal(r.ctx.sgpConcentrationPass(legs,profile),false);
 assert.equal(r.ctx.sgpConcentrationPass(legs,'long'),true);
});
