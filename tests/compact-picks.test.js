const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../compact-picks.js');
test('compact selections preserve the actual side, line, market and moneyline meaning',()=>{
 for(const [market,line,want] of [['Assists','O 5.5','Over 5.5 Assists'],['Spread','+3.5','+3.5 Spread'],['Winner','ML','Moneyline'],['Rec Yds','U 39.5','Under 39.5 Rec Yds'],['Total','O 221.5','Over 221.5 Total'],['PRA','O 35.5','Over 35.5 PRA']])assert.equal(api.selection(market,line),want);
});
test('NBA matchup abbreviations preserve away/home order and do not guess unknown teams',()=>{
 assert.equal(api.matchup('Knicks vs Celtics','nba'),'NYK @ BOS');assert.equal(api.matchup('Los Angeles Lakers at Portland Trail Blazers','nba'),'LAL @ POR');assert.equal(api.matchup('Team A vs Team B','ncaaf'),'Team A @ Team B');assert.equal(api.matchup('Fight card','ufc'),'Fight card');assert.equal(api.metadata('nba','invalid','Knicks vs Celtics'),'NYK @ BOS');
});
test('NFL matchup abbreviations preserve teams and lineup labels remain explicitly unconfirmed',()=>{
 assert.equal(api.matchup('San Francisco 49ers @ Atlanta Falcons','nfl'),'SF @ ATL');assert.equal(api.matchup('Buccaneers vs Panthers','nfl'),'TB @ CAR');assert.equal(api.matchup('Giants at Jets','nfl'),'NYG @ NYJ');
 assert.equal(api.lineup('Previous lineup · Not final'),'Lineup unconfirmed');assert.equal(api.lineup('Latest known lineup · Not final'),'Lineup unconfirmed');assert.equal(api.lineup('Lineup pending · Not final'),'Lineup pending');assert.equal(api.lineup('Lineup confirmed'),'Lineup confirmed');
});
test('card tidy leaves analysis alone while nodes are displayed in the details sheet',()=>{
 const source=fs.readFileSync('selection-ui.js','utf8'),document={body:{classList:{contains:name=>name==='details-sheet-open'}},querySelectorAll(){throw Error('Must not restructure an open sheet')}};
 vm.runInNewContext(source.slice(source.indexOf('function tidyCards(){'),source.indexOf('let countState='))+';tidyCards();',{document});
});
test('row layout retains the price, ALT tag and provisional lineup warning through repeated redraws',()=>{
 // Reuse the existing shared display fixture to exercise real node moves.
 const fixture=fs.readFileSync('tests/nhl-display.test.js','utf8');
 const env={module:{exports:{}},Date,Map,Number,String,Set,document:{readyState:'loading',addEventListener(){},createElement:tag=>env.make(tag)}};
 vm.runInNewContext(fixture.slice(fixture.indexOf('class Element'),fixture.indexOf("test('PRA"))+';this.make=el;',env);
 vm.runInNewContext(fs.readFileSync('compact-picks.js','utf8'),env);
 const el=env.make,node=el('div','leg has-market-tile'),copy=el('div','sport-visual-copy'),name=el('div','leg-title','1. Jayson Tatum'),status=el('div','nba-lineup-status','Lineup pending · Not final'),meta=el('div','leg-brief','Original full matchup');
 const tile=el('div','market-tile'),heading=el('span','market-tile-heading','Assists'),line=el('strong','market-tile-line','O 5.5'),price=el('small','market-tile-price','Kalshi -144'),alt=el('span','alt-tag','ALT');
 // The production selectors use alternatives; teach the small fixture those.
 const find=node.querySelector.bind(node);node.querySelector=selector=>selector.split(',').map(s=>find(s)).find(Boolean)||null;
 const photo=el('img','sport-photo'),logo=el('img','sport-logo');
 node.dataset.eventTime='2026-10-24T02:00:00Z';node.dataset.matchup='Knicks vs Celtics';copy.append(name,meta,status);tile.append(heading,line,price,alt);node.append(photo,logo,copy,tile);
 const compact=env.module.exports;compact.row(node,'nba');compact.row(node,'nba');
 assert.equal(name.textContent,'Jayson Tatum');assert.equal(node.querySelectorAll('.compact-pick-selection').length,1);assert.equal(copy.querySelector('.compact-pick-selection').textContent,'Over 5.5 AssistsALT');assert.equal(alt.parentElement,copy.querySelector('.compact-pick-selection'));
 assert.equal(price.textContent,'Kalshi -144');assert.equal(price.parentElement,tile);assert.equal(heading.hidden,true);assert.equal(line.hidden,true);assert.equal(status.textContent,'Lineup pending');assert.equal(status.title,'Lineup pending · Not final');assert.match(meta.textContent,/NYK @ BOS/);
 const media=node.querySelector('.compact-pick-media');assert.equal(node.querySelectorAll('.compact-pick-media').length,1);assert.equal(media.classList.contains('compact-player-media'),true);assert.equal(photo.parentElement,media);assert.equal(logo.parentElement,media);
 const card=el('article','parlay-card'),thesis=el('p','card-thesis','Multi-game · 4 legs · Date range. Estimates unvalidated.'),details=el('details','card-explanation'),summary=el('summary','','Details');details.append(summary);card.append(thesis,details);
 compact.card(card,'nfl');compact.card(card,'nfl');assert.equal(thesis.parentElement,details);assert.equal(card.querySelectorAll('.card-thesis').length,1);assert.match(thesis.textContent,/unvalidated/);
 const findDetail=details.querySelector.bind(details);details.querySelector=selector=>selector==='summary'?summary:findDetail(selector);
 const source=fs.readFileSync('selection-ui.js','utf8');vm.runInNewContext(source.slice(source.indexOf('function tidyCards(){'),source.indexOf('let countState='))+';tidyCards();',{document:{body:{classList:{contains:()=>false}},querySelectorAll:()=>[card]}});assert.equal(summary.textContent,'Risk & details');
});
