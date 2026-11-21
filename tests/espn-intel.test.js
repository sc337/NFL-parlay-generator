const test=require('node:test'),assert=require('node:assert/strict');
const {safeLink,fresh,gamesFor,gameHTML}=require('../espn-intel.js');
const now=Date.parse('2026-11-08T00:00Z');
const g={eventId:'1',startAt:'2026-11-09T18:00Z',checkedAt:'2026-11-07T23:50Z',status:'ok',teams:[{id:'a',code:'A'},{id:'b',code:'B'}],probabilities:[{teamId:'a',percent:60},{teamId:'b',percent:40}],expertPicks:[],injuries:[],statistics:[]};
test('on-demand summary requires exact event, teams and start; it keeps editorial facts separate',()=>{
 const {normalizeLiveSummary}=require('../espn-intel.js');
 const summary={header:{id:'1',competitions:[{date:g.startAt,competitors:[{team:{id:'a'}},{team:{id:'b'}}]}]},predictor:{homeTeam:{id:'a',gameProjection:'64'},awayTeam:{id:'b',gameProjection:'36'}},boxscore:{teams:[{team:{id:'a'},statistics:[{name:'avgPoints',displayValue:'110'}]}]}};
 const updated=normalizeLiveSummary({...g,sport:'nba',analystConsensus:[{label:'Saved'}]},summary,now);
 assert.equal(updated.probabilities[0].percent,64);assert.equal(updated.statistics[0].values.avgPoints,'110');assert.equal(updated.analystConsensus[0].label,'Saved');
 assert.equal(normalizeLiveSummary(g,{...summary,header:{...summary.header,id:'2'}},now),null);
 assert.equal(normalizeLiveSummary(g,{...summary,header:{...summary.header,competitions:[{...summary.header.competitions[0],date:'2026-11-09T19:00Z'}]}},now),null);
});
test('stale and failed checks do not display probabilities',()=>{assert(fresh(g,now));assert(!fresh({...g,status:'unavailable'},now));assert(!fresh({...g,checkedAt:'2026-11-07T00:00Z'},now));assert(!gameHTML(g,now,false).includes('60.0%'));assert(!gameHTML(g,now+3*3600000).includes('60.0%'))});
test('date filtering and completed events',()=>{assert.equal(gamesFor({games:[g]},'2026-11-09',s=>s.slice(0,10),now).length,1);assert.equal(gamesFor({games:[g]},'2026-11-08',s=>s.slice(0,10),now).length,0);assert.equal(gamesFor({games:[g]},'2026-11-09',s=>s.slice(0,10),now+3*86400000).length,0)});
test('source links and feed text cannot inject markup',()=>{assert.equal(safeLink('javascript:alert(1)'), '');assert.equal(safeLink('https://espn.com.evil.test/'),'');const html=gameHTML({...g,expertPicks:[{author:'<script>bad</script>',scores:{a:24,b:17},winnerId:'a'}],expertSource:{url:'https://www.espn.com/nfl/',publishedAt:g.checkedAt}},now);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'))});
test('editorial scores stay separate from win probabilities',()=>{const html=gameHTML({...g,expertPicks:[{author:'Example',winnerId:'a',scores:{a:24,b:17}}],expertSource:{url:'https://www.espn.com/nfl/',publishedAt:g.checkedAt}},now);assert(html.includes('1 of 1'));assert(html.includes('Editorial picks, not model probabilities'));assert(html.includes('60.0%'))});

test('disagreement is explicit and details start collapsed',()=>{const html=gameHTML({...g,expertPicks:[{author:'Example',winnerId:'b',scores:{a:17,b:24}}]},now);assert(html.includes('Analysts differ from ESPN model'));assert(!html.includes('<details open'));assert(html.includes('Research only · Does not change picks'));assert(html.includes('Game winner only'))});
test('missing statistics stay missing and QB reports are visible',()=>{const html=gameHTML({...g,statistics:[{teamId:'a',values:{totalPointsPerGame:'24.5'}}],injuries:[{teamId:'b',player:'Example QB',position:'QB',status:'Out',reportedAt:g.checkedAt}]},now);assert(html.includes('24.5'));assert(html.includes('—'));assert(html.includes('QB availability'));assert(html.includes('Example QB — Out'))});
test('all six sports render their own comparisons without football labels',()=>{
 const {SPORTS}=require('../espn-intel.js');assert.equal(SPORTS.length,6);
 for(const [sport,key,label] of [['nba','avgPoints','Points scored'],['nhl','avgGoals','Goals scored'],['mlb','ERA','ERA'],['ncaaf','passingYardsPerGame','Passing yards']]){
  const html=gameHTML({...g,sport,statistics:[{teamId:'a',values:{[key]:'12.5'}}]},now);
  assert(html.includes(label));assert(html.includes('12.5'));if(sport!=='ncaaf')assert(!html.includes('Passing yards'));
 }
 const html=gameHTML({...g,sport:'ufc',eventName:'UFC card',teams:[{id:'a',name:'Fighter A',code:'A',record:'10-2'},{id:'b',name:'Fighter B',code:'B'}],probabilities:[]},now);
 assert(html.includes('10-2'));assert(html.includes('Fighter B'));assert(!html.includes('Injury reports'));
});
test('evidence stays compact, attributed and escaped; season leaders start collapsed',()=>{
 const row={label:'Prop context',kind:'Preview report',text:'<script>Example starter</script>',url:'https://www.espn.com/nfl/preview?gameId=1',publishedAt:g.checkedAt};
 const html=gameHTML({...g,evidence:[row,row,row,row],leaders:[{teamId:'a',player:'Example',category:'Passing yards',value:'1,000'}]},now);
 assert.equal((html.match(/class="intel-takeaway"/g)||[]).length,3);assert(html.includes('Preview report'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('Season leaders'));assert(!html.includes('<details open'));assert(html.includes('Does not confirm starters'));
 assert(!gameHTML({...g,evidence:[{...row,url:'javascript:alert(1)'}]},now).includes('intel-takeaway'));
 assert(!gameHTML({...g,evidence:[{...row,publishedAt:'2020-01-01T00:00Z'}]},now).includes('intel-takeaway'));
});
test('availability caveats show without duplicate QB alert; recent results remain collapsed',()=>{
 const html=gameHTML({...g,evidence:[{label:'Availability',kind:'Injury report',text:'Example — Questionable',publishedAt:g.checkedAt,url:'https://www.espn.com/nfl/'},{label:'Prop context',kind:'Preview report',text:'Example is set to play.',caveat:'Availability unconfirmed',publishedAt:g.checkedAt,url:'https://www.espn.com/nfl/'}],injuries:[{teamId:'a',player:'Example',position:'QB',status:'Questionable'}],recentResults:[{teamId:'a',games:[{date:'2026-11-01T18:00Z',opponent:'OPP',result:'W',score:'20-10'}]}]},now);
 assert(html.includes('Availability unconfirmed'));assert(!html.includes('QB availability'));assert(html.includes('Recent results'));assert(html.includes('20-10'));assert(!html.includes('<details open'));
});

test('non-NFL consensus keeps attribution, exact lines and single opinions distinct from probabilities',()=>{
 const {analystHTML}=require('../espn-intel.js');
 const p={author:'Named Analyst',sourceUrl:'https://www.covers.com/picks/nba',checkedAt:g.checkedAt,startAt:g.startAt,eventId:g.eventId,selection:'Example Over 20.5 points',odds:-110,publishedLabel:'2 hours ago'};
 const covered={...g,sport:'nba',analystCoverage:{checkedAt:g.checkedAt,status:'ok'},analystConsensus:[{market:'points',player:'Example',label:'Single opinion',agree:1,total:1,picks:[p],selection:p.selection}]};
 const html=gameHTML(covered,now);assert(html.includes('Single opinion'));assert(html.includes('1 of 1'));assert(html.includes('20.5'));assert(html.includes('Named Analyst'));assert(html.includes('source label'));assert(html.includes('not win probability'));assert(!html.includes('No current score picks'));
 const independent=gameHTML({...covered,checkedAt:'2020-01-01T00:00Z'},now,false);assert(independent.includes('Named Analyst'));assert(!independent.includes('60.0%'));
 assert(analystHTML({...covered,analystCoverage:{checkedAt:g.checkedAt,status:'unavailable'}},now).signal.includes('Source refresh pending'));
 assert(!analystHTML(covered,now+3*3600000).details.includes('Named Analyst'));
 for(const row of [{...p,sourceUrl:'https://covers.com.evil.test/'},{...p,eventId:'other'},{...p,startAt:'2030-01-01'}])assert(!analystHTML({...covered,analystConsensus:[{...covered.analystConsensus[0],picks:[row]}]},now).details);
 assert(analystHTML({...g,sport:'mlb'},now).signal.includes('No published picks yet'));
});

test('additional intel is dated, attributed, escaped and separate from opinions',()=>{
 const {additionalHTML}=require('../espn-intel.js');
 const row={source:'NBA Official',sourceUrl:'https://ak-static.cms.nba.com/referee/injury/report.pdf',checkedAt:g.checkedAt,label:'Availability',text:'<script>Player Out</script>',maxAgeHours:2};
 const html=additionalHTML({...g,sport:'nba',additionalIntel:[row],additionalSourceChecks:[{source:'Action Network',sourceUrl:'https://www.actionnetwork.com/',checkedAt:g.checkedAt,state:'unavailable',note:'Automated access unavailable'}]},now);
 assert(html.includes('NBA Official'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('Access unavailable'));assert(html.includes('do not confirm starters'));
 assert.equal(additionalHTML({...g,sport:'nfl',additionalIntel:[row]},now),'');
 assert.equal(additionalHTML({...g,sport:'nba',additionalIntel:[{...row,sourceUrl:'https://official.nba.com.evil.test/'}]},now),'');
 assert.equal(additionalHTML({...g,sport:'nba',additionalIntel:[row]},now+3*3600000),'');
 const stale=gameHTML({...g,sport:'nba',checkedAt:'2020-01-01',additionalIntel:[row]},now,false);assert(stale.includes('NBA Official'));assert(!stale.includes('60.0%'));
});
test('research views keep detail categories, source access and status meanings distinct',()=>{
 const x=require('../espn-intel.js');assert.equal(x.categories.injuries,'players');assert.equal(x.categories['published-analysts'],'analysts');assert.equal(x.categories.stats,'matchup');
 assert.equal(x.statusTone('Out'),'out');assert.equal(x.statusTone('Questionable'),'review');assert.equal(x.statusTone('Available'),'ready');assert.equal(x.statusTone('Probable'),'muted');
 const g={sport:'nba',teams:[],startAt:new Date(Date.now()+3600000).toISOString(),checkedAt:new Date().toISOString(),status:'ok'};
 const h=x.gameHTML(g);for(const view of ['Overview','Players','Matchup','Analysts'])assert.ok(h.includes('>'+view+'</button>'));assert.match(h,/data-intel-view="overview"/);assert.match(h,/aria-pressed="true"/);
});
