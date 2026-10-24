const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const env={module:{exports:{}},Date,Map,Number,String,Set};vm.runInNewContext(fs.readFileSync('source-branding.js','utf8'),env);return env.module.exports}
const now=Date.now(),at=new Date(now).toISOString(),old=new Date(now-31*60000).toISOString(),future=new Date(now+86400000).toISOString();
const quote=(source,patch={})=>({source,yes_ask:.6,quotedAt:at,game_time:future,kind:'moneyline',...patch});
test('source identity preserves attributed ESPN sportsbook references',()=>{
 const api=setup();assert.equal(api.provider('DraftKings via ESPN'),'espn');assert.equal(api.provider('Polymarket'),'polymarket');assert.equal(api.provider('Kalshi 60¢'),'kalshi');assert.equal(api.provider('FanDuel'),null);assert.equal(api.provider('Reference'),null);
});
test('fresh status requires actual current prices, not the snapshot wrapper time',()=>{
 const api=setup();api.capture('nba',{updated_at:at,primary_updated_at:old,markets:[quote('Kalshi',{quotedAt:old})]});
 assert.equal(api.state('nba','kalshi',now).tone,'warning');assert.equal(api.state('nba','kalshi',now).freshCount,0);
 api.capture('nba',{updated_at:at,markets:[quote('Kalshi',{quotedAt:at,yes_ask:null,price:null})]});assert.equal(api.state('nba','kalshi',now).tone,'unavailable');
 api.capture('nba',{updated_at:at,markets:[quote('Kalshi')]});assert.equal(api.state('nba','kalshi',now).tone,'fresh');
});
test('partial and unavailable feeds never imply all three providers are active',()=>{
 const api=setup();api.capture('nba',{updated_at:at,markets:[quote('Kalshi'),quote('Kalshi',{quotedAt:old}),quote('Polymarket')],polymarket:{status:'unavailable',checked_at:at}});
 assert.equal(api.state('nba','kalshi',now).status,'Partial coverage');assert.equal(api.state('nba','polymarket',now).tone,'warning');assert.equal(api.state('nba','polymarket',now).checkedAt,null);assert.equal(api.state('nba','espn',now).tone,'unavailable');
});
test('started events, future timestamps and expired quotes cannot turn a provider green',()=>{
 const api=setup();api.capture('nba',{updated_at:at,markets:[quote('Polymarket',{game_time:new Date(now-60000).toISOString()}),quote('Polymarket',{quotedAt:new Date(now+3600000).toISOString()})]});
 const x=api.state('nba','polymarket',now);assert.equal(x.count,1);assert.equal(x.freshCount,0);assert.equal(x.tone,'warning');
});
test('fresh ESPN schedules are useful even when sportsbook prices are absent',()=>{
 const api=setup();api.capture('nba',{updated_at:at,slate:{updated_at:at,games:[{game_time:future}]},markets:[]});const x=api.state('nba','espn',now);assert.equal(x.status,'Fresh schedule');assert.equal(x.freshCount,0);assert.equal(x.scheduleCount,1);
});
test('registered NFL selections retain game start and source context',()=>{
 const api=setup();api.capture('nfl',{updated_at:at,games:[{id:'started',commence_time:new Date(now-60000).toISOString(),dataSource:'Kalshi'},{id:'future',commence_time:future,dataSource:'FanDuel'}]});api.register('nfl',[{gameId:'started',price:-150},{gameId:'future',price:-150}],at);assert.equal(api.state('nfl','kalshi',now).count,0);
});
test('sport switching keeps coverage counts and timestamps isolated',()=>{
 const api=setup();api.capture('nba',{updated_at:at,markets:[quote('Kalshi')]});api.capture('nfl',{updated_at:old,games:[{commence_time:future,markets:[quote('Polymarket',{quotedAt:old})]}]});assert.equal(api.state('nba','kalshi',now).freshCount,1);assert.equal(api.state('nfl','kalshi',now).freshCount,0);assert.equal(api.state('nfl','polymarket',now).tone,'warning');
});
test('failed refresh uses the unavailable state rather than republishing cached green quotes',()=>{
 const api=setup();api.capture('nba',{updated_at:at,markets:[quote('Kalshi')]});api.register('nba',[],null);assert.equal(api.state('nba','kalshi',now).tone,'unavailable');
});
test('logos are local and the feed row adds no odds requests',()=>{
 const source=fs.readFileSync('source-branding.js','utf8');assert.doesNotMatch(source,/\bfetch\s*\(|apiKey|localStorage/);assert.match(source,/Escape/);assert.match(source,/aria-expanded/);assert.match(source,/source-name-sr/);
});
test('ESPN prices show only odds beside the logo and retain full attribution through redraws',()=>{
 const fixture=fs.readFileSync('tests/nhl-display.test.js','utf8'),env={module:{exports:{}},Date,Map,Number,String,Set};
 vm.runInNewContext(fixture.slice(fixture.indexOf('class Element'),fixture.indexOf("test('PRA"))+';this.make=el;',env);
 env.document={readyState:'loading',addEventListener(){},createElement:tag=>{
  const node=env.make(tag,'');node.addEventListener=()=>{};return node;
 }};
 vm.runInNewContext(fs.readFileSync('source-branding.js','utf8'),env);
 for(const text of ['DraftKings via ESPN -115 · Reference','ESPN +127 · Reference']){
  const node=env.make('small','market-tile-price',text);node.replaceChildren=(...children)=>{node.textContent='';node.append(...children)};
  env.module.exports.decorate(node);const copy=node.querySelector('.source-price-copy');
  assert.equal(copy.children.filter(x=>!x.classList.contains('source-name-sr')).map(x=>x.textContent).join(''),text.includes('-115')?'-115':'+127');
  assert.equal(node.textContent,text);assert.equal(node.title,text);assert.ok(node.querySelector('.source-logo'));
  env.module.exports.decorate(node);assert.equal(node.querySelector('.source-price-copy'),copy);
 }
});
