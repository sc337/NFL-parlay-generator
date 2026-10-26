const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {runtime}=require('../scripts/update_pick_history');
const app=fs.readFileSync('app.js','utf8');
function setup(){
 const now=Date.parse('2026-10-12T05:00:00Z'),r=runtime('nfl',{now});
 const m={ticker:'runner',type:'rushing',marketKey:'player_rush_yds',player:'Runner',team:'Home',point:49.5,side:'over',price:-150,source:'Kalshi',sourceQuality:80,_rosterVerified:true,contextSignals:{injury_checked:true,injury_status:'none_reported'},propHistory:{source:'nflverse completed plays',games:4,played:4,latest_game:'2026-10-04',metrics:{player_rush_yds:[55,45,72,60]}}};
 const g={id:'fixture',away:'Away',home:'Home',dataSource:'Kalshi',game_status:'pre',commence_time:'2026-10-13T00:15:00Z',context:{updated_at:'2026-10-12T04:59:00Z',recent_form:{Away:{available:true,games:4},Home:{available:true,games:4}}},markets:[m]};
 Object.assign(r.ctx.state,{apiKey:'',recommendationTier:'ideas',mode:'sgp',lineMode:'both',selectedMarkets:new Set(['rushing','passing','receiving','receptions','spreads','h2h','totals']),games:[g]});
 r.window.PICK_QUALITY.prepare('nfl',[m],{},[g],'2026-10-12T04:59:00Z');r.run('nfl-alt-lines.js');r.run('kalshi-parlay-ideas.js');
 return {...r,m,g,assess:()=>r.window.NFL_PARLAY_IDEAS.assess(m,g,r.ctx.state)};
}
test('ideas do not claim model probability, EV, calibrated confidence or verified sportsbook availability',()=>{const r=setup(),q=r.assess();assert.equal(q.pass,true);assert.equal(q.modelP,null);assert.equal(q.ev,null);assert.equal(q.valueQualified,false);assert.equal(q.validated,false);assert.match(q.warnings.join(' '),/unverified/);assert.match(q.warnings.join(' '),/Caesars/);assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,{}, {game:r.g}).pass,false)});
test('ideas require explicit reference-feed use and screened mode retains strict gates',()=>{const r=setup();r.ctx.state.apiKey='placeholder';assert.equal(r.assess().pass,false);r.ctx.state.apiKey='';r.ctx.state.recommendationTier='screened';assert.equal(r.assess().pass,false);r.ctx.state.recommendationTier='ideas';r.m.source='FanDuel';assert.equal(r.assess().pass,false)});
function publicTeam(r){Object.assign(r.m,{type:'h2h',marketKey:'h2h',player:null,source:'DraftKings via ESPN',referenceOnly:true,espn_game_id:'123',team_id:'1',teams:[{id:'1'},{id:'2'}],quotedAt:'2026-10-12T04:59:00Z'});return r;}
test('ESPN team references can qualify as ideas without claiming a model edge',()=>{const r=publicTeam(setup()),x=r.assess();assert.equal(x.pass,true);assert.equal(x.modelP,null);assert.equal(x.valueQualified,false);assert.match(x.warnings.join(' '),/DraftKings via ESPN/);assert.equal(r.window.PICK_QUALITY.assess('nfl',r.m,{}, {game:r.g}).pass,false);r.m.context_unmatched=true;assert.equal(r.assess().reason,'Matchup context unverified');});
test('ESPN ideas reject unmapped identities, stale prices and invented public props',()=>{for(const change of [r=>r.m.teams=[{id:'1'},{id:'1'}],r=>r.m.team_id='9',r=>r.m.espn_game_id=null,r=>r.m.quotedAt='2026-10-12T03:00:00Z',r=>r.m.player='Runner']){const r=publicTeam(setup());change(r);assert.equal(r.assess().pass,false);}});
test('both reference sources obey ESPN availability and workload vetoes',()=>{for(const ref of [false,true]){const r=ref?publicTeam(setup()):setup();r.m.espnEvidence={checkedAt:'2026-10-12T04:59:00Z',availability:{status:'Out',reportedAt:'2026-10-11T00:00:00Z'}};assert.match(r.assess().reason,/ESPN reports player unavailable/);}});
test('empty states distinguish no feed, no qualifying selections, and insufficient compatible legs',()=>{const r=setup(),api=r.window.NFL_PARLAY_IDEAS;r.ctx.state.recommendationTier='screened';const report={checked:24,props:0,players:0,eligible:[],reasons:[['Edge does not clear uncertainty buffer',24]]};const msg=api.emptyMessage(report,2,r.ctx.state);assert.match(msg,/24 selections checked/);assert.match(msg,/uncertainty buffer/);assert.doesNotMatch(msg,/players|fewer legs|ALT/);assert.match(api.emptyMessage({...report,checked:0},2,r.ctx.state),/No selections available/);assert.match(api.emptyMessage({...report,eligible:[{}]},2,r.ctx.state),/Try fewer legs/);});
test('screened price watch includes only price failures with usable data and escapes exact selection labels',()=>{
 const r=setup(),s=r.ctx.state,api=r.window.NFL_PARLAY_IDEAS;s.recommendationTier='screened';
 Object.assign(r.m,{name:'Runner <img> Over 49.5',modelProbability:.60,rawModelProbability:.60,projectionCoverage:.7,modelUncertainty:.3,roleStability:.8});r.m.propHistory.roleStable=true;
 let report=api.report([r.g],s);assert.equal(report.eligible.length,0);assert.equal(report.dataReady,1);assert.equal(report.priceWatch.length,1);
 let html=api.diagnostics(report);assert.match(html,/Price watch/);assert.match(html,/Minimum acceptable/);assert.match(html,/Limited coverage/);assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/<img>/);
 r.m.contextSignals.injury_status='out';report=api.report([r.g],s);assert.equal(report.priceWatch.length,0);assert.equal(report.dataReady,0);assert.doesNotMatch(api.diagnostics(report),/Price watch/);
 r.m.contextSignals.injury_status='none_reported';r.m.quotedAt='2026-10-12T03:00:00Z';assert.equal(api.report([r.g],s).priceWatch.length,0);
});
test('Win Chance reports its own eligibility and never presents a price-watch entry as value',()=>{
 const r=setup(),api=r.window.NFL_PARLAY_IDEAS;r.ctx.state.recommendationTier='likelihood';
 Object.assign(r.m,{modelProbability:.67,rawModelProbability:.67,projectionCoverage:.7,modelUncertainty:.3,roleStability:.8});r.m.propHistory.roleStable=true;
 let report=api.report([r.g],r.ctx.state);assert.equal(report.eligible.length,1);assert.equal(report.screened,false);assert.equal(report.priceWatch.length,0);
 r.m.contextSignals.injury_status='out';report=api.report([r.g],r.ctx.state);assert.equal(report.eligible.length,0);assert.match(api.emptyMessage(report,2,r.ctx.state),/Win Chance/);assert.doesNotMatch(api.emptyMessage(report,2,r.ctx.state),/value screen/);
 const src=fs.readFileSync('kalshi-parlay-ideas.js','utf8');assert.ok(src.includes('id="nflRecommendationTier" hidden'));assert.ok(!src.includes('>Win Chance</option>'));
});
test('ideas reject stale quotes, started games, unverified roles, uncertain injury and thin history',()=>{
 const changes=[r=>r.m.quotedAt='2026-10-12T04:00:00Z',r=>r.g.commence_time='2026-10-12T01:00:00Z',r=>r.m._rosterVerified=false,r=>r.m.team='Other',r=>r.m.contextSignals.injury_status='questionable',r=>r.m.contextSignals.injury_checked=false,r=>r.m.propHistory.played=2,r=>r.m.propHistory.metrics.player_rush_yds=[1,2],r=>r.m.propHistory.latest_game='2026-10-12',r=>r.g.context.updated_at='2026-10-11T01:00:00Z',r=>r.m.price=-1000,r=>r.m.propHistory.source='market breadth'];
 for(const change of changes){const r=setup();change(r);assert.equal(r.assess().pass,false,r.assess().reason)}
});
test('TDs, attempts and ALT player unders cannot enter ideas; a supported nearby ALT over can',()=>{for(const patch of [{type:'td',marketKey:'player_anytime_td'},{marketKey:'player_rush_attempts'},{marketKey:'player_pass_completions'},{marketKey:'player_rush_yds_alternate',side:'under',isAltLine:true}]){const r=setup();Object.assign(r.m,patch);assert.equal(r.assess().pass,false)}const r=setup();r.g.markets.push({...r.m,ticker:'reference',isAltLine:false,point:59.5});Object.assign(r.m,{marketKey:'player_rush_yds_alternate',isAltLine:true});assert.equal(r.assess().pass,true);r.m.point=19.5;assert.equal(r.assess().reason,'ALT threshold too far from reference')});
test('scoping and reports never import another game into SGP selection',()=>{const r=setup(),other={...r.g,id:'other',markets:[{...r.m,ticker:'other'}]},api=r.window.NFL_PARLAY_IDEAS;const scoped=api.scopedGames([r.g,other],r.ctx.state,'fixture');assert.equal(scoped.length,1);assert.equal(api.report(scoped,r.ctx.state).eligible.length,1);r.ctx.state.mode='multi';assert.equal(api.scopedGames([r.g,other],r.ctx.state,'fixture').length,2)});
function snapshotBuilder(lines='both',tier='ideas'){
 const snapshot=JSON.parse(fs.readFileSync('data/kalshi-nfl.json','utf8')),now=Date.parse(snapshot.updated_at)+60000,r=runtime('nfl',{now});
 Object.assign(r.ctx.state,{apiKey:'',recommendationTier:tier,mode:'sgp',nflWeek:'all',lineMode:lines,moreCushion:false,selectedMarkets:new Set(['h2h','spreads','totals','passing','rushing','receiving','receptions']),games:snapshot.games});
 r.ctx.nflSlate=()=>snapshot.games;r.ctx.americanToDecimal=o=>o>0?1+o/100:1+100/Math.abs(o);r.ctx.decimalToAmerican=d=>Math.round(d>=2?(d-1)*100:-100/(d-1));r.ctx.STRAIGHT_ONLY_MARKETS=new Set(['player_rush_attempts','player_pass_attempts','player_pass_completions']);
 r.run('nfl-alt-lines.js');r.run('kalshi-parlay-ideas.js');r.run('nfl-projection-engine.js');r.run('nfl-model-v3.js');r.window.NFL_PROJECTIONS.enrich(true);r.window.NFL_MODEL_V3.enrich();r.window.PICK_QUALITY.prepare('nfl',snapshot.games.flatMap(g=>g.markets),{},snapshot.games,snapshot.updated_at);
 vm.runInContext(app.slice(app.indexOf('function isParlayEligible('),app.indexOf('const PROP_MARKET_META')),r.ctx);
 vm.runInContext(app.slice(app.indexOf('function correlation('),app.indexOf('function renderNflStraight(')),r.ctx);
 return {...r,snapshot,build:n=>{const out=[];for(const profile of ['safe','balanced','long'])out.push(r.ctx.buildSgp(snapshot.games[0],n,50,profile,out.filter(Boolean)));return out}};
}
test('current saved snapshot produces deterministic quoted ideas or passes without padding an incomplete build',()=>{
 const r=snapshotBuilder(),parlays=r.build(3);
 for(const p of parlays.filter(Boolean)){assert.equal(p.ideaTier,true);assert.equal(p.legs.length,3);assert.equal(new Set(p.legs.filter(m=>m.player).map(m=>m.player)).size,p.legs.filter(m=>m.player).length);assert.match(p.summary,/not a proven edge/);for(const m of p.legs){assert(r.snapshot.games[0].markets.some(x=>x.ticker===m.ticker&&x.quoteSide===m.quoteSide&&x.price===m.price));assert.equal(r.window.NFL_PARLAY_IDEAS.assess(m,r.snapshot.games[0],r.ctx.state).pass,true)}}
 assert.deepEqual(parlays.map(p=>r.ctx.parlaySignature(p)),r.build(3).map(p=>r.ctx.parlaySignature(p)));
 const screened=snapshotBuilder('standard','screened');assert.equal(screened.window.NFL_PARLAY_IDEAS.active(screened.ctx.state),false);
});
test('Win Chance packages a compatible three-leg SGP that Value rejects at the same prices',()=>{
 const r=setup();r.ctx.state.recommendationTier='likelihood';
 const rows=[{...r.m,name:'Home Runner Over 49.5',ticker:'home'},{...r.m,player:'Away Runner',team:'Away',name:'Away Runner Over 49.5',ticker:'away'},{...r.m,type:'totals',marketKey:'totals',player:null,team:null,point:44.5,name:'Over 44.5',ticker:'total'}].map(m=>({...m,modelProbability:.64,rawModelProbability:.64,marketProbability:.5,projectionCoverage:.7,modelUncertainty:.3,roleStability:.8,propHistory:{...m.propHistory,roleStable:true}}));
 r.g.markets=rows;r.window.PICK_QUALITY.prepare('nfl',rows,{},[r.g],'2026-10-12T04:59:00Z');
 r.ctx.nflSlate=()=>[r.g];r.ctx.americanToDecimal=o=>o>0?1+o/100:1+100/Math.abs(o);r.ctx.decimalToAmerican=d=>Math.round(d>=2?(d-1)*100:-100/(d-1));r.ctx.STRAIGHT_ONLY_MARKETS=new Set(['player_rush_attempts','player_pass_attempts','player_pass_completions']);
 vm.runInContext(app.slice(app.indexOf('function isParlayEligible('),app.indexOf('const PROP_MARKET_META')),r.ctx);
 vm.runInContext(app.slice(app.indexOf('function correlation('),app.indexOf('function renderNflStraight(')),r.ctx);
 const p=r.ctx.buildSgp(r.g,3,50,'long',[]);assert.ok(p);assert.equal(p.legs.length,3);assert.equal(p.likelihoodTier,true);assert.equal(p.name,'Win Chance');
 assert.ok(p.legs.every(m=>rows.includes(m)));assert.equal(p.risk.pass,true);assert.equal(p.risk.validated,false);
 r.ctx.state.requirePlayerProp=true;assert.ok(r.ctx.buildSgp(r.g,2,50,'long',[]).legs.some(m=>m.player));
 const teamOnly=[rows[2],{...rows[2],ticker:'ml',type:'h2h',marketKey:'h2h',team:'Home',point:null,name:'Home ML'}];r.g.markets=teamOnly;r.window.PICK_QUALITY.prepare('nfl',teamOnly,{},[r.g],'2026-10-12T04:59:00Z');
 assert.equal(r.ctx.buildSgp(r.g,2,50,'long',[]),null);r.ctx.state.requirePlayerProp=false;assert.ok(r.ctx.buildSgp(r.g,2,50,'long',[]));r.g.markets=rows;r.window.PICK_QUALITY.prepare('nfl',rows,{},[r.g],'2026-10-12T04:59:00Z');
 r.ctx.state.recommendationTier='screened';assert.equal(r.ctx.buildSgp(r.g,3,50,'long',[]),null);
});
test('required-prop control restores its saved state, persists changes and regenerates',()=>{
 const events={},writes=[],state={recommendationTier:'screened',requirePlayerProp:true,selectedMarkets:new Set()},select={addEventListener:(k,fn)=>events.select=fn},checkbox={addEventListener:(k,fn)=>events.checkbox=fn},small={};let field,generated=0;
 const anchor={before:n=>field=n},document={readyState:'complete',querySelector:s=>s==='#nflWeekWrap'?anchor:s==='#nflRecommendationTierWrap'?field:null,createElement:()=>({querySelector:s=>s==='select'?select:s==='#nflRequireProp'?checkbox:s==='small'?small:null})};
 const window={NFL_PARLAY_STATE:state,DASHBOARD_UI:{put:(...args)=>writes.push(args)},generate:()=>generated++};
 vm.runInNewContext(fs.readFileSync('kalshi-parlay-ideas.js','utf8'),{window,document,Date});
 assert.equal(checkbox.checked,true);events.checkbox({target:{checked:false}});assert.equal(state.requirePlayerProp,false);assert.deepEqual(writes.at(-1),['nfl','requireProp','off']);assert.equal(generated,1);
 events.checkbox({target:{checked:true}});assert.equal(state.requirePlayerProp,true);assert.deepEqual(writes.at(-1),['nfl','requireProp','on']);assert.equal(generated,2);
 const msg=window.NFL_PARLAY_IDEAS.emptyMessage({checked:10,eligible:[{market:{type:'totals'}}],reasons:[]},2,state);assert.match(msg,/Require a player prop is enabled/);
});
test('TD drawer respects selected game and selected week even with no TD parlay chip',()=>{
 const r=setup(),td={type:'td',tdExperimental:true,_rosterVerified:true,modelProbability:.6,marketProbability:.55,name:'Selected TD',tdOpportunity:{games:4,ten_rush:3,ten_target:1}};r.g.markets=[td];const other={...r.g,id:'other',markets:[{...td,name:'Wrong game TD',modelProbability:.9}]};let selected='fixture';const host={innerHTML:''};r.ctx.$=s=>s==='#tdMarketOptions'?host:s==='#gameSelect'?{value:selected}:null;r.ctx.nflSlate=()=>[r.g,other];r.window.MARKET_GUARDS={esc:x=>x};vm.runInContext(app.slice(app.indexOf('function renderTdMarkets(){'),app.indexOf('function countPlayerProps(')),r.ctx);r.ctx.renderTdMarkets();assert.match(host.innerHTML,/Selected TD/);assert.doesNotMatch(host.innerHTML,/Wrong game TD/);r.ctx.nflSlate=()=>[other];r.ctx.renderTdMarkets();assert.doesNotMatch(host.innerHTML,/Selected TD|Wrong game TD/);
});
test('team-only fallback explains why three or four legs cannot be filled',()=>{
 const r=setup(),report={checked:6,props:0,players:0,eligible:[{},{}],reasons:[]};
 assert.match(r.window.NFL_PARLAY_IDEAS.emptyMessage(report,4,r.ctx.state),/at most two compatible legs/);
 assert.match(r.window.NFL_PARLAY_IDEAS.emptyMessage(report,4,r.ctx.state),/Select 2 legs/);
});
