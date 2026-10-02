const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

const source=fs.readFileSync('app.js','utf8').split('window.generate=generate;')[0];
const context={window:{},localStorage:{getItem:()=>null},console,Date,Set,Map};
vm.runInNewContext(source,context);

const game={id:'fixture',away:'Away',home:'Home',commence_time:'2026-10-04T17:00:00Z',markets:[]};
for(const team of [game.away,game.home]){
  for(let i=0;i<7;i++){
    game.markets.push({type:'receiving',marketKey:'player_reception_yds',name:`${team} WR ${i} Over 39.5 receiving yards`,player:`${team} WR ${i}`,team,position:'WR',side:'over',point:39.5,price:-120,confidence:70});
    game.markets.push({type:'rushing',marketKey:'player_rush_yds',name:`${team} RB ${i} Over 24.5 rushing yards`,player:`${team} RB ${i}`,team,position:'RB',side:'over',point:24.5,price:-130,confidence:70});
  }
}
game.markets.push({type:'h2h',name:'Home ML',team:'Home',price:-140,confidence:62});
game.markets.push({type:'totals',name:'Over 45.5',team:'Game',side:'over',price:-110,confidence:52});

test('all SGP variants draw qualified props from both offenses',()=>{
  const previous=[];
  for(const variant of ['safe','balanced','long']){
    const p=context.buildSgp(game,6,50,variant,previous);
    assert.ok(p,`${variant} should build`);
    assert.equal(p.legs.length,6);
    assert.equal(p.kickoff,game.commence_time);
    if(variant==='safe')assert.equal(p.name,'Conservative');
    const teams=p.legs.filter(l=>l.team==='Away'||l.team==='Home');
    assert.ok(teams.filter(l=>l.team==='Away').length>=2,`${variant} lacks away exposure`);
    assert.ok(teams.filter(l=>l.team==='Home').length>=2,`${variant} lacks home exposure`);
    previous.push(p);
  }
});

test('an opposing-team prop can coexist with a moneyline',()=>{
  assert.equal(context.incompatible(game.markets.at(-2),game.markets[0]),false);
});

test('interception overs do not get quarterback-receiver or shootout bonuses',()=>{
  const interception={type:'passing',marketKey:'player_pass_interceptions',player:'Away QB',team:'Away',position:'QB',side:'over',name:'Away QB Over 0.5 passing interceptions'};
  assert.equal(context.correlation(interception,game.markets[0]),0);
  assert.equal(vm.runInNewContext('GAME_SCRIPTS.shootout.legFit',context)(interception,game),0);
});

test('thin one-team markets fall back without inventing an opponent pick',()=>{
  const thin={...game,markets:game.markets.filter(m=>m.team!=='Away')};
  const p=context.buildSgp(thin,3,50,'balanced');
  assert.ok(p);
  assert.equal(p.teamMix,'Concentrated');
  assert.ok(p.legs.every(l=>l.team!=='Away'));
});

test('NFL compact labels shorten matchups and times while full details retain the zone',()=>{
  assert.match(context.nflKickoff(game.commence_time),/Oct/);
  assert.match(context.nflKickoff(game.commence_time),/\d+(?::\d{2})?[AP]M/);
  assert.doesNotMatch(context.nflKickoff(game.commence_time),/Sun|PDT|MST|UTC/);
  assert.match(context.nflKickoff(game.commence_time,true),/Sun/);
  assert.equal(context.nflMatchup('Jacksonville Jaguars @ Cincinnati Bengals'),'Jaguars vs Bengals');
  assert.equal(context.nflMatchup('Indianapolis Colts @ Washington Commanders'),'Colts vs Commanders');
  assert.equal(context.nflTeamShort('San Francisco 49ers'),'49ers');
  assert.equal(context.nflKickoff('invalid'),'');
  assert.equal(context.nflKickoff(null),'');
});
