const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const now=Date.parse('2026-10-28T22:30:00Z'),start='2026-10-29T02:00:00Z';
function fixture(){
 const games=Array.from({length:10},(_,i)=>({date:new Date(now-(12-i)*86400000).toISOString(),season_type:2,points:112,allowed:110,possessions:100}));
 const playerGames=games.map((r,i)=>({...r,team:'A',minutes:30+i%2,points:20+i%3,rebounds:7+i%2,assists:5+i%2,threes:2+i%3,steals:1,blocks:0,usedPossessions:20}));
 const context={updated_at:new Date(now).toISOString(),games:{g:{start,away:'A',home:'H',season_type:2}},teams:{A:{games},H:{games}},players:{p:{id:'p',name:'Player',team:'A',availability_checked:true,games:playerGames}}};
 const row={game_id:'g',game_time:start,game_status:'pre',game_label:'A @ H',kind:'points',player:'Player',player_id:'p',player_verified:true,team_code:'A',side:'yes',line:19.5,probability:.5,yes_ask:.52,price:-110,ticker:'KXTEST',volume:100,spread:.02,quotedAt:new Date(now).toISOString()};
 const window={CONSERVATIVE_POLICY:require('../conservative-policy.js')};class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const sandbox={window,Date:Clock};for(const file of ['nba-model.js','nba-prop-targets.js','nba-alt-lines.js','pick-quality.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
 const targets=window.NBA_PROP_TARGETS.expand([row],context);window.PICK_QUALITY.prepare('nba',[row,...targets],context,[],new Date(now).toISOString());
 return {window,targets,row,context,sandbox};
}
test('NBA ladders use consecutive integer milestones across count families with no inherited quotes',()=>{
 const {window:w,targets}=fixture();
 for(const kind of ['points','rebounds','assists','threes','pra']){
  const rows=targets.filter(m=>m.kind===kind);assert.ok(rows.length,kind);
  rows.forEach((m,i)=>{assert.equal((m.line+.5)%1,0);if(i)assert.equal(m.line-rows[i-1].line,1);assert.equal(w.NBA_ALT_LINES.allowed(m,'alt'),true);assert.equal(w.NBA_ALT_LINES.allowed(m,'standard'),false);assert.equal(w.PICK_QUALITY.quote('nba',m).p,null);for(const key of ['price','yes_ask','probability','ticker','volume','spread','quotedAt'])assert.equal(m[key],undefined,key)});
  const probabilities=rows.map(m=>w.NBA_MODEL.estimate(m,fixture().context).modelP);for(let i=1;i<probabilities.length;i++)assert.ok(probabilities[i]<probabilities[i-1],kind);
 }
 assert.ok(targets.some(m=>m.kind==='double_double'&&m.line===null));assert.ok(targets.some(m=>m.kind==='triple_double'&&m.line===null));
 assert.equal(new Set(targets.map(m=>m.selection_id)).size,targets.length);
});
test('unpriced targets qualify by buffered likelihood, never fabricated price or value',()=>{
 const {window:w,targets,context}=fixture();
 const rows=targets.filter(m=>m.kind==='points').map(m=>({m,f:w.NBA_MODEL.estimate(m,context)}));
 for(const [profile,minimum] of Object.entries({safe:.75,balanced:.65,long:.50})){
  const checks=rows.map(({m,f})=>({m,q:w.PICK_QUALITY.assess('nba',m,f,{parlay:true,nbaProfile:profile})}));
  const accepted=checks.filter(({m,q})=>w.CONSERVATIVE_POLICY.assessProfile('nba',m,q,profile).pass);assert.ok(accepted.length,profile);
  for(const {m,q} of accepted){assert.ok(q.conservativeP>=minimum);assert.equal(q.valueQualified,false);assert.equal(q.ev,null);assert.equal(q.quote.odds,null);assert.match(w.PICK_QUALITY.quoteLabel('nba',m),/Model estimate.*Check Caesars/);assert.equal(w.PICK_QUALITY.assess('nba',m,rows.find(x=>x.m===m).f,{featured:true}).pass,false)}
 }
 const m=rows[0].m;assert.equal(w.PICK_QUALITY.estimateOdds('nba',[m]),null);
 // A serialized flag or a copied exchange row cannot grant the unpriced path.
 assert.equal(w.NBA_PROP_TARGETS.isTarget({...m}),false);assert.equal(w.PICK_QUALITY.assess('nba',{...m},rows[0].f).pass,false);
});
test('targets retain fresh context, sample, injury, roster and role requirements',()=>{
 for(const change of ['stale','out','questionable','thin','roster','lowMinutes','started']){
  const {window:w,row,context}=fixture();
  if(change==='stale')context.updated_at=new Date(now-5*3600000).toISOString();
  if(['out','questionable'].includes(change))context.players.p.injury_status=change;
  if(change==='thin')context.players.p.games=context.players.p.games.slice(0,4);
  if(change==='roster')context.players.p.team='H';
  if(change==='lowMinutes')context.players.p.games.forEach(r=>r.minutes=5);
  if(change==='started')row.game_status='in';
  assert.equal(w.NBA_PROP_TARGETS.expand([row],context).length,0,change);
 }
 const {window:w,targets,context}=fixture(),m=targets.find(m=>m.kind==='points'),f=w.NBA_MODEL.estimate(m,context);
 context.players.p.injury_status='Out';assert.equal(w.PICK_QUALITY.assess('nba',m,f).pass,false);
});

test('unpriced targets form complete 2–4 leg SGPs while keeping player and team compatibility',()=>{
 const {window:w,row,context,sandbox}=fixture();
 const rows=[];
 for(let i=0;i<4;i++){
  const team=i<2?'A':'H',id='p'+i;context.players[id]={...context.players.p,id,name:'Player '+i,team,games:context.players.p.games.map(r=>({...r,team}))};
  rows.push({...row,player:'Player '+i,player_id:id,team_code:team});
 }
 const targets=w.NBA_PROP_TARGETS.expand(rows,context).filter(m=>m.kind==='points');w.PICK_QUALITY.prepare('nba',targets,context,[],new Date(now).toISOString());
 sandbox.document={querySelector:()=>null};vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),sandbox);vm.runInNewContext(fs.readFileSync('nba-dashboard.js','utf8'),sandbox);
 for(const profile of w.NBA_DASHBOARD.PROFILES){
  const minimum={safe:.75,balanced:.65,long:.50}[profile.key];
  const assess=m=>{const q=w.PICK_QUALITY.assess('nba',m,w.NBA_MODEL.estimate(m,context),{parlay:true});const p=w.CONSERVATIVE_POLICY.assessProfile('nba',m,q,profile.key);return {...q,pass:q.pass&&p.pass,rank:p.rank}};
  for(const count of [2,3,4]){
   const build=w.NBA_DASHBOARD.buildSameGame(targets,count,assess);assert.equal(build.length,count,profile.key+' '+count);assert.equal(new Set(build.map(m=>m.player_id)).size,count);
   for(const m of build)assert.ok(assess(m).conservativeP>=minimum);
  }
 }
});
